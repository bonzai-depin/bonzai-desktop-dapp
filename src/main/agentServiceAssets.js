import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { modelArtifact } from './agentWorkerMedia.js';

const kinds = { text:'unifiedTextInferences', image:'unifiedImageInferences', audio:'unifiedAudioInferences', video:'unifiedVideoInferences', object:'unifiedObjectInferences' };
const digest = bytes => `0x${createHash('sha256').update(bytes).digest('hex')}`;
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
async function inside(root, filename) {
  const base = await fs.realpath(root), target = await fs.realpath(filename);
  if (!target.startsWith(base + path.sep)) throw new Error('This original is outside the asset library.');
  return target;
}
async function fingerprint(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return `0x${hash.digest('hex')}`;
}

/** Resolve local originals by saved mint identity, never by a path supplied by a peer. */
export function createAgentServiceAssets({ mints, store, trainedRoot, outputRoots, blobs, chat }) {
  async function resolve(id) {
    const mint = (await mints()).find(m => m.id === id);
    if (!mint?.generationId) throw new Error('The tokenized original is unavailable on this device.');
    if (mint.contentType === 'training') {
      if (!safeId(mint.generationId)) throw new Error('Invalid model identity.');
      const root = trainedRoot(), folder = await inside(root, path.join(root, mint.generationId));
      const metadataPath = await inside(folder, path.join(folder, 'metadata.json'));
      const meta = JSON.parse(await fs.readFile(metadataPath,'utf8'));
      // Fingerprint the deliverable bundle, including adapter/base-model configuration.
      const files=[];
      async function scan(directory) {
        for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
          if(entry.isSymbolicLink()) throw new Error('Linked model artifacts cannot be offered.');
          const filename=path.join(directory,entry.name);
          if(entry.isDirectory()) { if(!/^(?:checkpoint-\d+|logs|runs|dataset|datasets)$/.test(entry.name)) await scan(filename); }
          else if(entry.isFile() && modelArtifact(entry.name)) files.push({name:path.relative(folder,filename).split(path.sep).join('/'),digest:await fingerprint(filename),size:(await fs.stat(filename)).size});
          if(files.length>128) throw new Error('This model has too many files to offer.');
        }
      }
      await scan(folder);
      if(!files.some(f=>/\.(?:gguf|safetensors|bin)$/i.test(f.name)) || files.reduce((n,f)=>n+f.size,0)>32*1024**3) throw new Error('The model bundle is missing weights or exceeds 32 GiB.');
      files.sort((a,b)=>a.name.localeCompare(b.name));
      const filename=String(meta.filename || ''), standalone=path.basename(filename)===filename && filename.toLowerCase().endsWith('.gguf') && files.some(f=>f.name===filename);
      const file=standalone ? await inside(folder,path.join(folder,filename)) : null;
      return {mint, title:meta.base_model || filename || mint.generationId, kind:meta.type==='abliteration'?'abliteration':meta.artifact_type==='lora'||files.some(f=>/adapter_model/.test(f.name))?'lora':'checkpoint',
        file,size:standalone?(await fs.stat(file)).size:0,deliveryBytes:files.reduce((n,f)=>n+f.size,0),fileCount:files.length,digest:digest(JSON.stringify({files,inferenceFile:standalone?filename:null})),modelId:mint.generationId, uses:standalone?['model','delivery']:['delivery']};
    }
    if (!kinds[mint.contentType]) throw new Error('This original is not in the supported asset library.');
    const records = store.get(kinds[mint.contentType], []);
    const record = Array.isArray(records) && records.find(r => r.id === mint.generationId);
    if (!record) throw new Error('Restore the tokenized original before offering access.');
    if (mint.contentType === 'text') {
      const text = record.answer?.text;
      if (typeof text !== 'string' || !text.trim() || text.length > 2 * 1024 * 1024) throw new Error('This knowledge source is empty or too large.');
      return { mint, title: record.question || 'Knowledge', kind:'text', text, digest:digest(text), uses:Buffer.byteLength(text)<=1024*1024?['knowledge','delivery']:['knowledge'] };
    }
    const data = record.answer?.data || {};
    const value = data.image || data.audio || data.video || data.image_path || data.audio_path || data.video_path || record.answer?.code || record.code;
    if (typeof value !== 'string' || !value) throw new Error('The original media is unavailable.');
    if (mint.contentType === 'object') {
      if (Buffer.byteLength(value)>1024*1024) throw new Error('This source exceeds the 1 MiB text delivery limit.');
      return {mint,title:record.title || record.prompt || record.question || '3D source',kind:'3d',text:value,digest:digest(value),uses:['delivery']};
    }
    const blob = value.match(/^bonzai-blob:\/\/([a-f0-9]{64})\.([a-z0-9]{1,12})$/);
    let file, bytes;
    if (blob) file = blobs.blobPath(blob[1],blob[2]);
    else if (path.isAbsolute(value)) {
      for (const root of outputRoots()) { try { file = await inside(root,value); break; } catch {} }
      if (!file) throw new Error('The media is outside the local output library.');
    } else {
      const encoded = value.replace(/^data:[^;,]+;base64,/, '');
      if (encoded.length > 180000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Restore the original media before offering it.');
      bytes = Buffer.from(encoded,'base64');
      if (bytes.length > 128 * 1024 * 1024) throw new Error('This original exceeds the 128 MiB delivery limit.');
    }
    if (file) { if ((await fs.stat(file)).size > 128 * 1024 * 1024) throw new Error('This original exceeds the 128 MiB delivery limit.'); bytes = await fs.readFile(file); }
    return { mint, title:record.question || 'Original media', kind:mint.contentType, payload:bytes.toString('base64'), digest:digest(bytes), uses:['delivery'] };
  }
  const publicAsset = source => ({ id:source.mint.id, chainId:source.mint.chainId, collection:source.mint.contractAddress,
    tokenId:String(source.mint.tokenId), title:source.title.slice(0,160), kind:source.kind, digest:source.digest, uses:source.uses,
    deliveryBytes:source.deliveryBytes ?? (source.text ? Buffer.byteLength(source.text) : Buffer.byteLength(source.payload || '', 'base64')),fileCount:source.fileCount || 1 });
  return {
    async list() {
      const catalogs=new Map(), result=[];
      for (const m of await mints()) {
        let title='';
        if (kinds[m.contentType]) {
          if (!catalogs.has(m.contentType)) catalogs.set(m.contentType,store.get(kinds[m.contentType],[]));
          const original=catalogs.get(m.contentType)?.find?.(r=>r.id===m.generationId);
          title=original?.question || original?.title || original?.prompt || '';
        } else if (m.contentType==='training' && safeId(m.generationId)) {
          try { const folder=await inside(trainedRoot(),path.join(trainedRoot(),m.generationId));const filename=await inside(folder,path.join(folder,'metadata.json'));const metadata=JSON.parse(await fs.readFile(filename,'utf8'));title=metadata.base_model || metadata.filename || m.generationId; } catch { /* inspection reports missing originals */ }
        }
        result.push({id:m.id,title:String(title).slice(0,160),contentType:m.contentType,tokenId:m.tokenId,chainId:m.chainId,collection:m.contractAddress});
      }
      return result;
    },
    async inspect(id) { return publicAsset(await resolve(id)); },
    async use(binding, asset, prompt) {
      const source = await resolve(binding.id);
      if (source.digest !== asset.digest || source.mint.chainId !== asset.chainId || source.mint.contractAddress.toLowerCase() !== asset.collection.toLowerCase()
        || String(source.mint.tokenId) !== asset.tokenId || !source.uses.includes(asset.use)) throw new Error('The tokenized original changed. Restore the offered version before running this job.');
      if (asset.use === 'knowledge') return {text:source.text};
      if (asset.use === 'model') return {text:await chat(source, prompt)};
      if(source.modelId) return {pipeline:'fineTune',meta:{modelId:source.modelId,licensedOriginal:true}};
      return source.text ? {pipeline:source.kind,payload:source.text,meta:{payloadEncoding:'text',licensedOriginal:true}} : {pipeline:source.kind,payload:source.payload,meta:{payloadEncoding:'base64'}};
    },
  };
}
