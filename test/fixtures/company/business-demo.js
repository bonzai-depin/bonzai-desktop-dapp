import assert from 'node:assert/strict';
import * as distribution from '../../../src/main/db/repos/distribution.js';
import {runBusinessDemo,ensureDemoDeliverables} from '../../../src/main/workspace/demo.js';
import * as companies from '../../../src/main/db/repos/companies.js';
import {get} from './connection.js';
// Real PDF bytes; Desktop uses Chromium's HTML-to-PDF implementation.
import {PDFDocument} from 'pdf-lib';
async function printPdf(html){assert.ok(html.includes('DEMO'));const doc=await PDFDocument.create();doc.addPage().drawText('DEMO invoice. Automated PDF fixture.');return Buffer.from(await doc.save());}
for(const kind of ['hvac','billing','grants']){
 const result=await runBusinessDemo(kind,{printPdf});console.log(JSON.stringify(result,null,2));assert.equal(result.status,'passed',result.error);assert.equal(result.externalActions,0);const team=companies.getById(result.id);assert.equal(team.status,'paused');assert.equal(team.demoRun,true);assert.equal(team.demoResult.status,'passed');
 const before=distribution.listCatalog(result.id);
 assert.ok(before.length>=result.steps.length);
 ensureDemoDeliverables(result.id);
 assert.equal(distribution.listCatalog(result.id).length,before.length,'Opening demo twice must not duplicate deliverables');
 if(kind==='billing')assert.ok(before.some(row=>row.blobExt==='pdf'&&row.blobId));
}
const failed=await runBusinessDemo('billing',{printPdf:()=>{throw new Error('PDF unavailable');}});assert.equal(failed.status,'failed');assert.match(failed.error,/PDF unavailable/);assert.equal(companies.getById(failed.id).demoResult.status,'failed');
assert.equal(get().db.prepare('SELECT count(*) AS n FROM companies').get().n,4);

assert.equal(companies.list().length,0,'Rehearsals must not appear as operating teams');
assert.equal(companies.listIds().length,0,'Rehearsals must not be booted by the runtime');
assert.equal(companies.list({includeDemos:true}).length,4,'Demo evidence remains accessible');

const {clearBusinessDemos}=await import('../../../src/main/workspace/cleanup.js');
companies.save({id:'real-team',name:'Real team',status:'paused',demoMode:true});
assert.equal(clearBusinessDemos(),4);
assert.ok(companies.getById('real-team'),'User-created sample teams are preserved');
assert.equal(get().db.prepare('SELECT count(*) AS n FROM company_billing_invoices').get().n,0);
assert.equal(get().db.prepare('SELECT count(*) AS n FROM published_content').get().n,0);
assert.equal(clearBusinessDemos(),0);
