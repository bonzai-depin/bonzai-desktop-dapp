import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';import {build} from 'esbuild';
import {calculateInvoice,invoiceIssues} from '../src/services/company/billingDomain.js';
import {billingDocumentHtml} from '../src/services/company/billingDocuments.js';
const require=createRequire(import.meta.url);
test('price revision uses separate notified index; deductions and advances retain exact cents',()=>{
 const i=calculateInvoice({lines:[{description:'Service',quantity:2,unitCents:10000,vatRate:20,deductionCents:1000,deductionReference:'OS-1'}],priceRevision:{enabled:true,indexName:'ICHT',baseIndex:100,currentIndex:110,notifiedAt:1,evidenceReference:'Notification'},advanceAppliedCents:5000,advanceReference:'Paid advance'});
 assert.equal(i.coefficient,1.085);assert.equal(i.subtotalCents,20700);assert.equal(i.vatCents,4140);assert.equal(i.totalCents,24840);assert.equal(i.amountDueCents,19840);
 assert.throws(()=>calculateInvoice({lines:[{description:'Bad',quantity:1,unitCents:100,vatRate:20,deductionCents:200,deductionReference:'x'}]}),/dépasse/);
 assert.throws(()=>calculateInvoice({lines:[{description:'Bad',unitCents:1.5}]}),/centimes/);
 const html=billingDocumentHtml({...i,id:'x',status:'draft',lines:[{...i.lines[0],description:'<script>bad</script>'}]},{});assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Brouillon'));assert.ok(!html.includes('<script>'));
});
test('period and service acceptance checks block premature validation',()=>{
 const issues=invoiceIssues({kind:'forfait',periodStart:Date.UTC(2026,0,2),periodEnd:Date.UTC(2026,0,31),lines:[{subtotalCents:100}],workOrderIds:['missing']},{cadence:'monthly'},[]);
 assert.ok(issues.some(i=>i.includes('complets')));assert.ok(issues.some(i=>i.includes('Service fait')));assert.ok(issues.some(i=>i.includes('montants HT')));
});
test('production SQLite billing lifecycle',async()=>{
 const folder=fs.mkdtempSync(path.join(process.cwd(),'.company-tests-billing-')),data=fs.mkdtempSync(path.join(os.tmpdir(),'bonzai-billing-'));
 try{const outfile=path.join(folder,'billing.mjs');await build({entryPoints:['test/fixtures/company/billing.js'],outfile,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent',plugins:[{name:'isolation',setup(b){b.onResolve({filter:/connection\.js$/},a=>a.importer.includes('/src/main/')?{path:path.resolve('test/fixtures/company/connection.js')}:null);b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`export const app={getPath:()=>${JSON.stringify(data)}}`,loader:'js'}));}}]});const result=spawnSync(require('electron'),[outfile],{encoding:'utf8',timeout:30000,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);console.log(result.stdout.trim());}
 finally{fs.rmSync(folder,{recursive:true,force:true});fs.rmSync(data,{recursive:true,force:true});}
});
