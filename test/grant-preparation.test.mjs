import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGrant,paymentCandidate} from '../src/services/company/grantPreparation.js';
test('preparation reuses current company documents but never another beneficiary or draft',()=>{
 const dossier={beneficiary:'Alice',requiredDocumentTypes:['identity','invoice'],documentIds:[],ruleSource:'https://example.org',ruleVersion:'v1',eligibilityReviewedAt:1};
 const result=prepareGrant(dossier,[{id:'a',documentType:'identity'},{id:'b',documentType:'invoice',beneficiary:'Bob'},{id:'c',documentType:'invoice',beneficiary:'Alice',draft:true},{id:'d',documentType:'invoice',beneficiary:'Alice',validUntil:'2020-01-01'}]);
 assert.deepEqual(result.documentIds,['a']);assert.deepEqual(result.missing,['invoice']);
});
test('1000 distinct applications retain beneficiary boundaries during preparation',()=>{
 const docs=Array.from({length:1000},(_,i)=>({id:String(i),beneficiary:`b${i}`,documentType:'invoice'}));
 for(let i=0;i<1000;i++) assert.deepEqual(prepareGrant({beneficiary:`b${i}`,requiredDocumentTypes:['invoice']},docs).documentIds,[String(i)]);
});
test('payment matching requires a unique exact reference and refuses excess or ambiguous payments',()=>{
 const d={id:'1',stage:'awarded',applicationReference:'ABC',awardedCents:50000,receivedCents:10000};
 assert.equal(paymentCandidate([d],{id:'bank1',reference:'ABC',amountCents:40000}).id,'1');
 assert.equal(paymentCandidate([d],{id:'bank1',reference:'ABC',amountCents:40001}),null);
 assert.equal(paymentCandidate([d,{...d,id:'2'}],{id:'bank1',reference:'ABC',amountCents:1}),null);
 assert.equal(paymentCandidate([d],{id:'bank1',reference:'AB',amountCents:1}),null);
});
