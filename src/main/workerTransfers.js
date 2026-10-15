import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Bounded incoming chunks; no complete video/model is buffered in the renderer. */
export function createWorkerTransfers({ directory, save }) {
  const pending = new Map();
  async function remove(id) { const item = pending.get(id); if (!item) return; pending.delete(id); clearTimeout(item.timer); await item.handle.close(); await fs.rm(item.path,{force:true}); }
  function touch(id, item) { clearTimeout(item.timer); item.timer=setTimeout(()=>void remove(id).catch(()=>{}),10*60000); item.timer.unref?.(); }
  function get(owner,id) { const item=pending.get(id); if (!item || item.owner!==owner) throw new Error('Unknown delivery transfer.'); return item; }
  return {
    async start(owner,artifact) {
      if (pending.size>=4) throw new Error('Finish an existing transfer first.');
      if (!/^[a-f0-9]{64}$/.test(artifact?.id) || artifact.sha256!==artifact.id || !/^[a-z0-9]{1,12}$/.test(artifact.ext) || !Number.isSafeInteger(artifact.size) || artifact.size<=0 || artifact.size>32*1024**3) throw new Error('Invalid delivery manifest.');
      const root=directory(); await fs.mkdir(root,{recursive:true}); const id=randomUUID(), file=path.join(root,id);
      const handle=await fs.open(file,'wx',0o600); const item={owner,artifact,path:file,handle,offset:0}; pending.set(id,item); touch(id,item); return id;
    },
    async chunk(owner,id,offset,base64) {
      const item=get(owner,id);
      if (typeof base64!=='string' || base64.length>262144 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('Invalid delivery chunk.');
      const bytes=Buffer.from(base64,'base64');
      if (item.writing || offset!==item.offset || !bytes.length || item.offset+bytes.length>item.artifact.size) throw new Error('Unexpected delivery offset.');
      item.writing=true;
      try { await item.handle.writeFile(bytes); item.offset+=bytes.length; touch(id,item); return item.offset; } finally {item.writing=false;}
    },
    async finish(owner,id) {
      const item=get(owner,id);
      if(item.writing || item.offset!==item.artifact.size) throw new Error('Delivery is incomplete.');
      await item.handle.sync();
      try { const saved=await save(item.path,item.artifact.ext,{...item.artifact,source:'peer-worker'}); return {id:saved.id,uri:`bonzai-blob://${saved.id}.${item.artifact.ext}`}; }
      finally {await remove(id);}
    },
    async abort(owner,id) {get(owner,id); await remove(id);},
  };
}
