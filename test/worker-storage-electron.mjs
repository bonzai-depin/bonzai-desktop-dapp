import { app } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { open, close } from '../src/main/db/connection.js';
import { writeFromPathStream, read } from '../src/main/db/blobs.js';
import { mediaHash } from '../src/main/agentWorkerHost.js';
app.whenReady().then(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'worker-storage-'));app.setPath('userData',root);
 try {
  const {db}=open();db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY,ext TEXT,byte_length INTEGER,mime_type TEXT,source TEXT,source_id TEXT,created_at INTEGER,ref_count INTEGER)');
  const bytes=Buffer.alloc(5*1024*1024,121),source=path.join(root,'weights');await fs.writeFile(source,bytes);
  const meta={sha256:mediaHash(bytes),size:bytes.length};
  const saved=await writeFromPathStream(source,'safetensors',meta);
  assert.deepEqual(read(saved.id,'safetensors'),bytes);
  await writeFromPathStream(source,'safetensors',meta);
  assert.equal(db.prepare('SELECT ref_count FROM blobs').get().ref_count,2);
  await assert.rejects(writeFromPathStream(source,'bin',{sha256:'0'.repeat(64)}),/integrity/);
  assert.equal((await fs.readdir(path.join(root,'blobs'))).some(n=>n.startsWith('.incoming')),false);
  console.log('PASS: actual Electron SQLite streamed blob, deduplication, hash rejection and cleanup');
 }catch(e){console.error(e);process.exitCode=1;}finally{close();await fs.rm(root,{recursive:true,force:true});app.quit();}
});
