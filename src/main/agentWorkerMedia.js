import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaHash } from './agentWorkerHost.js';

const LIMIT = 128 * 1024 * 1024;
const formats = { image: ['png', 'image/png'], audio: ['wav', 'audio/wav'], music: ['wav', 'audio/wav'], video: ['mp4', 'video/mp4'] };
const mimeExt = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'video/mp4': 'mp4', 'model/gltf-binary': 'glb' };
const MODEL_CONFIG = /^(?:config|adapter_config|tokenizer|tokenizer_config|special_tokens_map|generation_config|vocab|model_index|preprocessor_config|processor_config|scheduler_config|feature_extractor_config)\.json$/;
const MODEL_INDEX = /^(?:model\.safetensors|pytorch_model\.bin)\.index\.json$/;
const MODEL_WEIGHT = /(?:\.safetensors|\.gguf)$|^(?:pytorch_model(?:-\d+-of-\d+)?|adapter_model)\.bin$/i;
function modelArtifact(name) {
  return MODEL_WEIGHT.test(name) || MODEL_CONFIG.test(name) || MODEL_INDEX.test(name)
    || ['merges.txt', 'tokenizer.model', 'spiece.model', 'vocab.txt'].includes(name);
}
/** Only outputs of the scoped local executor become remotely readable blob IDs. */
export function createWorkerMedia({ blobs, roots, trainedRoot }) {
  return {
    async prepare(output, meta) {
      if (output?.pipeline === 'fineTune') {
        const id = output.meta?.modelId;
        if (!trainedRoot || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error('Invalid trained model identity.');
        const base = await fs.realpath(trainedRoot());
        const folder = await fs.realpath(path.join(base, id));
        if (!folder.startsWith(base + path.sep)) throw new Error('Training output escapes the model directory.');
        const artifacts = [];
        let size = 0;
        const walk = async directory => {
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) throw new Error('Linked training artifacts cannot be delivered.');
            const filename = path.join(directory, entry.name);
            if (entry.isDirectory()) {
              // Intermediate Trainer checkpoints contain optimizer/RNG state and
              // duplicated weights; only the final exported artifact is delivered.
              if (!/^(?:checkpoint-\d+|logs|runs|dataset|datasets)$/.test(entry.name)) await walk(filename);
              continue;
            }
            // Exclude logs, dataset copies, credentials, Python and training metadata.
            if (!entry.isFile() || !modelArtifact(entry.name)) continue;
            if (MODEL_INDEX.test(entry.name)) {
              if ((await fs.stat(filename)).size > 4 * 1024 * 1024) throw new Error('Model shard index is too large.');
              const index = JSON.parse(await fs.readFile(filename, 'utf8'));
              if (!index.weight_map || typeof index.weight_map !== 'object' || Array.isArray(index.weight_map)) throw new Error('Invalid model shard index.');
              for (const shard of new Set(Object.values(index.weight_map))) {
                if (typeof shard !== 'string' || path.basename(shard) !== shard || shard.includes('\\') || !MODEL_WEIGHT.test(shard)) throw new Error('Invalid model shard path.');
                const info = await fs.lstat(path.join(directory, shard));
                if (!info.isFile() || info.isSymbolicLink() || !info.size) throw new Error('Missing or linked model shard.');
              }
            }
            size += (await fs.stat(filename)).size;
            if (size > 32 * 1024 ** 3 || artifacts.length >= 128) throw new Error('Training delivery exceeds 32 GiB or 128 files.');
            const ext = path.extname(filename).slice(1).toLowerCase();
            const stored = await blobs.writeFromPathStream(filename, ext, { ...meta, source: 'smart-agent-worker', mimeType: 'application/octet-stream' });
            artifacts.push({ id: stored.id, sha256: stored.id, ext, size: stored.size, mimeType: 'application/octet-stream', name: path.relative(folder, filename).split(path.sep).join('/') });
          }
        };
        await walk(folder);
        if (!artifacts.some(a => /\.(?:safetensors|gguf|bin)$/i.test(a.name))) throw new Error('Training produced no weights.');
        return { pipeline: 'fineTune', text: 'Training completed. Download the model files together to use this model.', artifacts };
      }
      if (Array.isArray(output?.artifacts)) {
        if (output.artifacts.length > 12) throw new Error('Too many delivery artifacts.');
        const result = { pipeline: 'workflow', text: String(output.text || ''), artifacts: [] };
        for (const item of output.artifacts) {
          const prepared = await this.prepare(item, meta);
          if (prepared.text) result.text += `\n${prepared.text}`;
          result.artifacts.push(...prepared.artifacts);
        }
        if (Buffer.byteLength(result.text) > 1024 * 1024) throw new Error('Text delivery exceeds 1 MiB.');
        if (result.artifacts.reduce((sum, a) => sum + a.size, 0) > LIMIT) throw new Error('Delivery exceeds 128 MiB.');
        return result;
      }
      const payload = output?.payload ?? output?.text;
      if (typeof payload !== 'string' || !payload.length) throw new Error('Worker produced no deliverable.');
      if (['text', 'skill', 'vision'].includes(output.pipeline) || (output.pipeline === '3d' && output.meta?.payloadEncoding !== 'base64') || output.meta?.payloadEncoding === 'text') {
        if (Buffer.byteLength(payload) > 1024 * 1024) throw new Error('Text delivery exceeds 1 MiB.');
        return { text: payload, pipeline: output.pipeline, artifacts: [] };
      }
      let bytes, [ext, mimeType] = formats[output.pipeline] || ['bin', 'application/octet-stream'];
      if (output.meta?.payloadEncoding === 'path') {
        const source = await fs.realpath(payload);
        const permitted = await Promise.all((typeof roots === 'function' ? roots() : roots).map(root => fs.realpath(root).catch(() => null)));
        if (!permitted.some(root => root && source.startsWith(root + path.sep))) throw new Error('Generated media is outside the local output directories.');
        const stat = await fs.stat(source);
        if (!stat.isFile() || stat.size > LIMIT) throw new Error('Media exceeds 128 MiB delivery limit.');
        bytes = await fs.readFile(source);
        const suffix = path.extname(source).slice(1).toLowerCase();
        const mime = Object.entries(mimeExt).find(([, e]) => e === suffix);
        if (!mime) throw new Error('Unsupported media format.');
        [mimeType, ext] = mime;
      } else {
        const data = payload.match(/^data:([^;,]+);base64,([\s\S]+)$/);
        if (data) { mimeType = data[1]; ext = mimeExt[mimeType]; if (!ext) throw new Error('Unsupported media format.'); }
        const encoded = data?.[2] || payload;
        if (encoded.length > Math.ceil(LIMIT * 4 / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid or oversized media.');
        bytes = Buffer.from(encoded, 'base64');
      }
      if (!bytes.length || bytes.length > LIMIT) throw new Error('Invalid media size.');
      // Some local adapters return bare base64 without a MIME type. Preserve
      // the actual codec instead of labelling every image PNG or audio WAV.
      const header = bytes.subarray(0, 12);
      if (header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) [ext, mimeType] = ['png', 'image/png'];
      else if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) [ext, mimeType] = ['jpg', 'image/jpeg'];
      else if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') [ext, mimeType] = ['webp', 'image/webp'];
      else if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE') [ext, mimeType] = ['wav', 'audio/wav'];
      else if (header.toString('ascii', 0, 3) === 'ID3') [ext, mimeType] = ['mp3', 'audio/mpeg'];
      else if (header.toString('ascii', 0, 4) === 'OggS') [ext, mimeType] = ['ogg', 'audio/ogg'];
      const stored = await blobs.write(bytes, ext, { ...meta, source: 'smart-agent-worker', mimeType });
      return { pipeline: output.pipeline, artifacts: [{ id: stored.id, sha256: mediaHash(bytes), ext, mimeType, size: bytes.length }] };
    },
    async read(artifact, offset, length) {
      if (!/^[a-f0-9]{64}$/.test(artifact.id) || !/^[a-z0-9]{1,12}$/.test(artifact.ext)) throw new Error('Invalid artifact.');
      const handle = await fs.open(blobs.blobPath(artifact.id, artifact.ext), 'r');
      try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        return buffer.subarray(0, bytesRead);
      } finally { await handle.close(); }
    },
  };
}
