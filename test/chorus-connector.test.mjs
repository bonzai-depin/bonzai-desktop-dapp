import test from 'node:test';import assert from 'node:assert/strict';
import {createChorusClient,chorusSubmitPayload} from '../src/main/connectors/chorus.js';
const credential={clientId:'fixture-id',clientSecret:'fixture-secret',technicalLogin:'technical',technicalPassword:'password'};
const ok=body=>({ok:true,status:200,json:async()=>body});
test('Chorus authenticates against official sandbox and separates OCR transfer from final submission',async()=>{
 const calls=[];const replies=[{access_token:'fixture-token',expires_in:3600},{pieceJointeId:812},{codeRetour:0,identifiantFactureCPP:921,statutFacture:'DEPOSEE'},{codeRetour:0,idFacture:921,statutCourantCode:'MISE_A_DISPOSITION'}];
 const client=createChorusClient({credential,fetchImpl:async(url,options)=>{calls.push({url,options});return ok(replies.shift());}});
 assert.deepEqual(await client.validateConnection(),{authenticated:true,environment:'sandbox'});
 const uploaded=await client.uploadPdf({bytes:Buffer.from('%PDF-fixture'),filename:'invoice.pdf'});assert.equal(uploaded.pieceJointeId,812);
 const profile={recipient:{registration:'11000201100044',serviceCode:'D04114W972'},legalCommitment:'1234567890',chorus:{supplierId:42,billingFrame:'A1_FACTURE_FOURNISSEUR',vatType:'TVA_SUR_DEBIT'}};
 const payload=chorusSubmitPayload({issuedAt:1,number:'BZF-2026-1',currency:'EUR',subtotalCents:10000,vatCents:2000,totalCents:12000,amountDueCents:10000,advanceAppliedCents:2000,advanceReference:'Bank proof',lines:[{vatRate:20,subtotalCents:10000,vatCents:2000}]},profile,uploaded.pieceJointeId);
 assert.equal(payload.montantTotal.montantAPayer,100);assert.equal(payload.montantTotal.montantTtcTotal,120);assert.equal(payload.pieceJointePrincipale[0].pieceJointePrincipaleId,812);
 assert.equal((await client.submitInvoice(payload)).statutFacture,'DEPOSEE');assert.equal((await client.invoiceStatus({invoiceId:921})).statutCourantCode,'MISE_A_DISPOSITION');
 assert.match(calls[0].url,/sandbox-oauth\.piste\.gouv\.fr\/api\/oauth\/token$/);assert.equal(new URLSearchParams(calls[0].options.body).get('scope'),'openid');
 assert.deepEqual(calls.slice(1).map(c=>new URL(c.url).pathname),['/cpro/factures/v1/deposer/pdf','/cpro/factures/v1/soumettre','/cpro/factures/v1/consulter/historique']);
 assert.equal(calls[1].options.headers['cpro-account'],Buffer.from('technical:password').toString('base64'));assert.equal(calls[1].options.redirect,'error');assert.equal(JSON.parse(calls[1].options.body).formatDepot,'PDF_NON_SIGNE');
});
test('Chorus never retries an interrupted financial POST or reports HTTP success as a receipt',async()=>{
 let count=0;const client=createChorusClient({credential,fetchImpl:async()=>{if(count++===0)return ok({access_token:'token'});throw new Error('network gone');}});
 await assert.rejects(()=>client.submitInvoice({}),e=>e.outcome==='unknown'&&!e.message.includes('password'));assert.equal(count,2);
 const missing=createChorusClient({credential,fetchImpl:async url=>ok(url.includes('oauth')?{access_token:'token'}:{})});await assert.rejects(()=>missing.submitInvoice({}),e=>e.outcome==='unknown');
 const denied=createChorusClient({credential,fetchImpl:async url=>ok(url.includes('oauth')?{access_token:'token'}:{codeRetour:15,libelle:'rejected'})});await assert.rejects(()=>denied.submitInvoice({}),e=>e.outcome==='rejected');
 assert.throws(()=>createChorusClient({credential,environment:'http://attacker.invalid'}),/environnement/);
});
test('Chorus payload requires explicit VAT regime and validator identities for subcontractors',()=>{
 const p={chorus:{supplierId:1,billingFrame:'A9_FACTURE_SOUSTRAITANT',vatType:'TVA_SUR_DEBIT'}};assert.throws(()=>chorusSubmitPayload({},p,1),/valideurs/);
});
