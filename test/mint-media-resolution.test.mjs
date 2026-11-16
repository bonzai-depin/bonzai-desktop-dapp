import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMintMediaBytes} from '../src/services/mintValidation.js';
test('saved media URLs resolve to the original bytes used for publication',async()=>{
 const bytes=new Uint8Array([82,73,70,70,1,2,3]);
 const url=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));
 try {assert.deepEqual(await resolveMintMediaBytes(url,'image/webp'),bytes);}finally{URL.revokeObjectURL(url);}
 assert.deepEqual(await resolveMintMediaBytes('data:image/webp;base64,UklGRgECAw==','image/webp'),bytes);
 await assert.rejects(resolveMintMediaBytes('invalid%media','image/webp'),/decoded/);
});
