// Build-time only. Powered by Poly Haven. Runtime uses bundled local assets.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const selection=JSON.parse(await readFile(path.join(root,'scripts/material-library-selection.json'),'utf8'));
const base=path.join(root,'src/assets/materials');
const digest=data=>createHash('md5').update(data).digest('hex');
async function request(url,json=false){
  for(let attempt=0;attempt<4;attempt++){
    try{const r=await fetch(url,{headers:{'User-Agent':'BonzAI-material-library-builder/1.0'},signal:AbortSignal.timeout(90000)});
      if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);return json?await r.json():Buffer.from(await r.arrayBuffer());
    }catch(e){if(attempt===3)throw e;await new Promise(r=>setTimeout(r,1000*2**attempt));}
  }
}
const index=await request('https://api.polyhaven.com/assets?t=textures',true);
const entries=Object.entries(selection).flatMap(([family,ids])=>ids.map(id=>({family,id})));
const output=[],failures=[];let next=0;
const channels={Diffuse:'diffuse',nor_gl:'normal-gl',Rough:'roughness',AO:'ao',Metal:'metalness'};
async function worker(){while(next<entries.length){
 const {family,id}=entries[next++];
 try{
  const metadata=await request(`https://api.polyhaven.com/files/${id}`,true),maps={};
  const dir=path.join(base,id);await mkdir(dir,{recursive:true});
  for(const [channel,name] of Object.entries(channels)){
   const sourceChannel=channel==='Diffuse' && !metadata.Diffuse && metadata.coll1 ? 'coll1' : channel;
   const file=metadata[sourceChannel]?.['2k']?.jpg;
   if(!file){if(['Diffuse','nor_gl','Rough'].includes(channel))throw Error(`Missing 2K ${channel}`);continue;}
   if(!/^https:\/\/dl\.polyhaven\.(org|com)\//.test(file.url))throw Error('Unexpected asset host');
   const destination=path.join(dir,`${name}.jpg`);
   let bytes;try{bytes=await readFile(destination);}catch{}
   if(!bytes||digest(bytes)!==file.md5){bytes=await request(file.url);if(digest(bytes)!==file.md5)throw Error(`Integrity failure: ${id}/${name}`);
    await writeFile(`${destination}.part`,bytes);await rename(`${destination}.part`,destination);}
   maps[name]={sourceChannel,file:`${id}/${name}.jpg`,url:file.url,md5:file.md5,bytes:bytes.length};
  }
  const a=index[id];
  output.push({id,name:a.name,family,tags:[...new Set([...a.categories,...a.tags])],resolution:2048,source:`https://polyhaven.com/a/${id}`,license:'CC0-1.0',authors:Object.keys(a.authors||{}),maps});
  console.log(`${output.length}/${entries.length} ${id}`);
 }catch(error){failures.push({id,error:error.message});console.error(id,error.message);}
}}
await Promise.all(Array.from({length:3},worker));
if(failures.length){console.error(JSON.stringify(failures));process.exitCode=1;}
else{output.sort((a,b)=>a.id.localeCompare(b.id));await writeFile(path.join(base,'catalogue.json'),JSON.stringify(output,null,2)+'\n');console.log(`Complete: ${output.length} materials, ${output.reduce((n,a)=>n+Object.values(a.maps).reduce((s,m)=>s+m.bytes,0),0)} bytes`);}
