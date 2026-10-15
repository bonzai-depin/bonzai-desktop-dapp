import * as workspace from '../../../src/main/db/repos/companyWorkspace.js';
import assert from "node:assert/strict";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as grants from "../../../src/main/db/repos/companyGrants.js";
import * as blobs from "../../../src/main/db/blobs.js";
import * as portability from "../../../src/main/db/repos/companyPortability.js";
import { syncCompanyMemory } from "../../../src/main/db/repos/companyMemory.js";
import { makeCharter } from "../../../src/services/company/charter.js";
import { get } from "./connection.js";
for (const id of ["grants", "other"])
  companies.save({
    ...makeCharter({ name: id, mission: "Grants" }),
    id,
    status: "paused",
  });
const blob = blobs.write(Buffer.from("test supporting evidence"), "txt");
const proof = grants.persist("grants", "document", {
  label: "Company identity", documentType:"company_identity",
  blob_id: blob.id,
  ext: "txt",
});
const foreign = grants.persist("other", "document", {
  label: "Private beneficiary",
  blob_id: blob.id,
  ext: "txt",
});
let d = grants.saveDossier("grants", {
  title: "Local cooling grant",
  beneficiary: "A",
  territory: "Martinique",
  documentIds: [proof.id],
  dueDate: "2020-01-01",
});
assert.throws(
  () => grants.saveDossier("grants", { ...d, documentIds: [foreign.id] }),
  /belong|not found/,
);
assert.throws(() => grants.saveDossier("other", d), /not found/);
assert.throws(() => grants.advanceDossier("other", { id: d.id }), /not found/);
assert.throws(
  () => grants.saveDossier("grants", { ...d, revision: 0 }),
  /changed/,
);
assert.equal(grants.runReminders("grants").length, 1);
assert.equal(grants.runReminders("grants").length, 0);
syncCompanyMemory("grants");
assert.ok(
  get()
    .db.prepare(
      "SELECT * FROM memory_sources WHERE text_content LIKE '%Local cooling grant%'",
    )
    .all().length > 0,
);
const bundle = portability.exportBundle("grants");
assert.equal(bundle.tables.company_grants_records.length, 2);
assert.ok(bundle.blobs[blob.id]);
const restored = portability.importBundle(bundle);
assert.equal(grants.snapshot(restored.id).dossiers.length, 1);
assert.notEqual(
  grants.snapshot(restored.id).dossiers[0].documentIds[0],
  proof.id,
);
assert.equal(grants.snapshot(restored.id).documents[0].blob_id, blob.id);
console.log(
  "Grants SQLite isolation, revisions, reminders, memory and export passed.",
);
// Import retries do not recreate dossiers or work tasks.
const intake={rows:[{workOrderReference:'OI-123',scheme:'test',title:'Imported installation',beneficiary:'Client',territory:'Martinique'}]};
const first=grants.importInstallations('grants',intake)[0];
assert.ok(first.preparationTaskId);
assert.equal(grants.importInstallations('grants',intake)[0].id,first.id);
const prepared=grants.prepareBatch('grants',{ids:[first.id]})[0];
assert.ok(prepared.preparation.blockers.length);
assert.throws(()=>grants.prepareBatch('other',{ids:[first.id]}),/not found/);
let awarded=grants.persist('grants','dossier',{...prepared,stage:'awarded',applicationReference:'REF-123',awardedCents:10000,receivedCents:0},prepared.id);
const bank=grants.persist('grants','document',{label:'Bank receipt',documentType:'bank',dossierId:awarded.id,beneficiary:awarded.beneficiary,blob_id:blob.id,ext:'txt'});
const payment={id:awarded.id,revision:awarded.revision,transaction:{id:'BANK-1',reference:'REF-123',amountCents:4000},evidenceDocumentId:bank.id,confirmed:true};
awarded=grants.reconcilePayment('grants',payment);
assert.equal(awarded.receivedCents,4000);
assert.equal(awarded.stage,'awarded');
assert.throws(()=>grants.reconcilePayment('grants',{...payment,revision:awarded.revision}),/already/);
assert.throws(()=>grants.reconcilePayment('other',payment),/match/);
console.log('Import deduplication, preparation isolation and partial-payment evidence passed.');
const submitted=grants.persist('grants','dossier',{...awarded,stage:'submitted'},awarded.id);
const notice=grants.persist('grants','document',{label:'Provider request',documentType:'notice',dossierId:submitted.id,beneficiary:submitted.beneficiary,blob_id:blob.id,ext:'txt'});
const correctionInput={id:submitted.id,revision:submitted.revision,reference:'NOTICE-1',request:'Provide signed invoice',dueDate:'2027-01-15',evidenceDocumentId:notice.id};
const corrected=grants.recordCorrection('grants',correctionInput);
assert.equal(corrected.corrections.length,1);
assert.equal(grants.recordCorrection('grants',{...correctionInput,revision:corrected.revision}).corrections.length,1);
assert.throws(()=>grants.recordCorrection('other',correctionInput),/current/);
for(let offset=0;offset<1000;offset+=100) {
  grants.importInstallations('other',{rows:Array.from({length:100},(_,i)=>({workOrderReference:`LOAD-${offset+i}`,scheme:'load-test',title:`Installation ${offset+i}`,beneficiary:`Client ${offset+i}`,territory:'Test'}))});
}
const loadState=grants.snapshot('other');
assert.equal(loadState.dossiers.length,1000);
for(let offset=0;offset<1000;offset+=100) grants.prepareBatch('other',{ids:loadState.dossiers.slice(offset,offset+100).map(d=>d.id)});
assert.equal(grants.snapshot('other').dossiers.filter(d=>d.preparation).length,1000);
console.log('1000 persisted installations imported and prepared in bounded batches.');

assert.throws(()=>grants.saveDossier('grants',{title:'Forged bank balance',beneficiary:'A',territory:'Test',receivedCents:50000}),/bank reconciliation/);
let incomplete=grants.saveDossier('grants',{title:'Missing required invoice',beneficiary:'A',territory:'Test',scheme:'Demo',ruleSource:'https://example.org',ruleVersion:'Demo',checklist:'Demo',requiredDocumentTypes:['invoice'],documentIds:[proof.id]});
incomplete=grants.advanceDossier('grants',{id:incomplete.id,revision:incomplete.revision,stage:'documents',evidence:'Test reviewer'});
assert.throws(()=>grants.advanceDossier('grants',{id:incomplete.id,revision:incomplete.revision,stage:'review'}),/required documents/);
console.log('Grant cash balance and required-document bypasses rejected.');

// Same beneficiary, two installations: evidence must never migrate between them.
const otherApplication=grants.saveDossier('grants',{title:'Second installation',beneficiary:submitted.beneficiary,territory:'Test',workOrderReference:'OI-SECOND'});
assert.throws(()=>grants.saveDossier('grants',{...otherApplication,documentIds:[notice.id]}),/application/);
assert.ok(!grants.portalPackage('grants',{id:otherApplication.id}).documents.some(d=>d.id===notice.id));
const legacy=grants.persist('grants','document',{documentType:'invoice',beneficiary:otherApplication.beneficiary,label:'Old invoice'});
assert.throws(()=>grants.saveDossier('grants',{...otherApplication,documentIds:[legacy.id]}),/application/);
grants.linkDocument('grants',{documentId:legacy.id,dossierId:otherApplication.id,confirmed:true});
assert.throws(()=>grants.linkDocument('grants',{documentId:legacy.id,dossierId:submitted.id,confirmed:true}),/Review/);
const linked=grants.saveDossier('grants',{...otherApplication,documentIds:[legacy.id]});
assert.equal(grants.portalPackage('grants',{id:linked.id}).documents[0].id,legacy.id);
const packageRestore=portability.importBundle(portability.exportBundle('grants'));
const restoredLinked=grants.snapshot(packageRestore.id).dossiers.find(d=>d.title==='Second installation');
assert.equal(grants.portalPackage(packageRestore.id,{id:restoredLinked.id}).documents[0].dossierId,restoredLinked.id);
console.log('Application document boundaries and scoped restore passed.');

assert.equal(workspace.overview('other').grantApplications,1000);
assert.ok(workspace.deliverables('grants').rows.some(row=>row.id==='grant:'+proof.id));
assert.ok(!workspace.deliverables('other').rows.some(row=>row.id==='grant:'+proof.id));
const privateRead=workspace.readDeliverable('other',{id:'grant:'+proof.id});
privateRead.then(()=>assert.fail('Private document exposed'),error=>assert.match(error.message,/not found/));
workspace.readDeliverable('grants',{id:'grant:'+proof.id}).then(file=>assert.equal(file.base64,Buffer.from('test supporting evidence').toString('base64')));
assert.equal(syncCompanyMemory('other').sources>1000,true);
assert.equal(syncCompanyMemory('other').changed,0);
const oldCount=syncCompanyMemory('grants').sources;
grants.persist('grants','document',{...proof,label:'Updated company proof'},proof.id);
assert.equal(syncCompanyMemory('grants').changed,1);
assert.equal(syncCompanyMemory('grants').sources,oldCount);
console.log('Business document previews, company isolation and incremental memory passed.');

const due=grants.saveDossier('grants',{title:'Upcoming reminder',beneficiary:'Test',territory:'Test',dueDate:'2027-02-15'});
const reminderTime=Date.parse('2027-02-10T12:00:00');
assert.ok(grants.runReminders('grants',reminderTime).some(task=>task.labels.includes(`grant:${due.id}`)));
assert.equal(grants.runReminders('grants',reminderTime).filter(task=>task.labels.includes(`grant:${due.id}`)).length,0);
assert.ok(grants.runReminders('grants',Date.parse('2027-02-16T12:00:00')).some(task=>task.labels.includes(`grant:${due.id}`)));
console.log('Upcoming and overdue deadlines each produce one reminder.');
