import test from 'node:test';
import assert from 'node:assert/strict';
import { createChorusBilling } from '../src/main/connectors/chorusBilling.js';
function fixture(overrides = {}) {
  const journal = [], network = [];
  const row = {id:'invoice',document:{blobId:'blob',blobExt:'pdf',filename:'invoice.pdf'},profileSnapshot:{channel:'chorus',chorus:{connectorId:'connector',environment:'sandbox'}},...overrides};
  const dependencies = {
    billing:{snapshot:()=>({invoices:[row]}),beginChorusAction(_company,_id,input){
      if (!input.confirmed) throw new Error('Approval required');
      if (row.chorus?.attempt?.status === 'pending' || row.chorus?.attempt?.status === 'unknown') throw new Error('Review unknown result');
      row.chorus={attempt:{id:'attempt',status:'pending'}};journal.push('begin');return row;
    },finishChorusAction(_company,_id,_attempt,response){journal.push(response);row.chorus.attempt.status=response.error?'unknown':'confirmed';return row;}},
    connectors:{getById:()=>({id:'connector',kind:'chorus',status:'active',accountIdentifier:'sandbox'})},
    blobs:{read:()=>Buffer.from('%PDF-valid local invoice')},
    readCredential:()=>({stored:{kind:'chorus',accountIdentifier:'sandbox'},credential:{clientSecret:'private'}}),
    makeClient:()=>({uploadPdf:async input=>{network.push(input);throw Object.assign(new Error('Uncertain write'),{outcome:'unknown'});}}),
  };
  return {row,journal,network,dependencies};
}
test('Chorus dispatch journals before the external effect and leaves uncertainty blocked',async()=>{
  const f=fixture(),action=createChorusBilling(f.dependencies);
  await assert.rejects(()=>action('company','invoice',{operation:'upload'}),/Approval/);
  assert.equal(f.network.length,0);
  await action('company','invoice',{operation:'upload',confirmed:true});
  assert.equal(f.journal[0],'begin');assert.equal(f.journal[1].outcome,'unknown');
  await assert.rejects(()=>action('company','invoice',{operation:'upload',confirmed:true}),/unknown/);
  assert.equal(f.network.length,1,'no replay after uncertain submission');
  assert.equal(JSON.stringify(f.row).includes('private'),false,'credentials never enter durable invoice evidence');
});
test('wrong environment and invalid local PDF fail before journalling or network',async()=>{
  const f=fixture();f.dependencies.connectors.getById=()=>({id:'connector',kind:'chorus',status:'active',accountIdentifier:'production'});
  await assert.rejects(()=>createChorusBilling(f.dependencies)('company','invoice',{operation:'upload',confirmed:true}),/same environment/);
  assert.equal(f.journal.length,0);
  const invalid=fixture();invalid.dependencies.blobs.read=()=>Buffer.from('not pdf');
  await assert.rejects(()=>createChorusBilling(invalid.dependencies)('company','invoice',{operation:'upload',confirmed:true}),/valid PDF/);
  assert.equal(invalid.journal.length,0);assert.equal(invalid.network.length,0);
});
