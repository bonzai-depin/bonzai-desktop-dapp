import test from 'node:test';
import assert from 'node:assert/strict';
import {nftCoverCopy,truncateNFTCopy} from '../src/services/nftCopy.js';
test('cover copy preserves the requested limits and marks truncation',()=>{
 assert.equal(truncateNFTCopy('a'.repeat(25),24),'a'.repeat(24)+' [...]');
 assert.equal(truncateNFTCopy('a'.repeat(24),24),'a'.repeat(24));
 assert.equal(nftCoverCopy({inferenceType:'text',textContent:'b'.repeat(141)}).description,'b'.repeat(140)+' [...]');
});
test('music uses the song name and musical tags rather than the prompt or lyrics',()=>{
 const copy=nftCoverCopy({inferenceType:'audio',title:'Prompt',generation:{type:'music',songName:'Nightfall',musicParams:{genres:['Jazz'],moods:['Calm'],bpm:90,lyrics:'Not the description'}}});
 assert.deepEqual(copy,{title:'Nightfall',description:'Jazz · Calm · 90 BPM'});
});
test('video and 3D covers omit titles and descriptions',()=>{
 for(const inferenceType of ['video','object'])assert.deepEqual(nftCoverCopy({inferenceType,title:'Title',textContent:'Text'}),{title:'',description:''});
});
