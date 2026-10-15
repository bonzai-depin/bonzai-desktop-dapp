import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parallelDownload} from '../src/main/parallelDownload.js';

test('parallel transfer reconstructs exact bytes, resumes chunks and falls back without range support',async()=>{
 const data=Buffer.from('0123456789'.repeat(1000)); let mode='ranges', requests=0;
 const server=http.createServer((req,res)=>{
  res.setHeader('ETag','"v1"');res.setHeader('Accept-Ranges','bytes');
  if(req.method==='HEAD'){res.setHeader('Content-Length',data.length);res.end();return;}
  requests++;
  if(mode==='ignore'){res.end(data);return;}
  const [,a,b]=req.headers.range.match(/bytes=(\d+)-(\d+)/); const start=Number(a),end=Number(b);
  res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${data.length}`});res.end(data.subarray(start,end+1));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bonzai-download-'));
 const url=`http://127.0.0.1:${server.address().port}/weights`;
 try {
  const dest=path.join(dir,'model.gguf');
  await fs.mkdir(`${dest}.parts`);
  await fs.writeFile(`${dest}.parts/manifest.json`,JSON.stringify({url,size:data.length,etag:'"v1"',chunkSize:1000}));
  await fs.writeFile(`${dest}.parts/0`,data.subarray(0,1000));
  await parallelDownload(url,dest,{minimumSize:1,chunkSize:1000});
  assert.deepEqual(await fs.readFile(dest),data);assert.equal(requests,9);
  mode='ignore';assert.equal(await parallelDownload(url,path.join(dir,'fallback'),{minimumSize:1,chunkSize:1000}),null);
  const controller=new AbortController();controller.abort();
  await assert.rejects(parallelDownload(url,path.join(dir,'cancel'),{signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(fs.stat(path.join(dir,'cancel')));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});
