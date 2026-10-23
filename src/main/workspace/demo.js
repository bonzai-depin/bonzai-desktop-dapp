import { buildWorkspaceBlueprint } from '../../services/company/workspaceBlueprints.js';
/** Deterministic rehearsals use real repositories, isolated paused teams and explicit sample evidence. */
import { randomUUID, createHash } from 'node:crypto';
import * as companies from '../db/repos/companies.js';
import * as gmao from '../db/repos/gmao.js';
import * as ops from '../db/repos/gmaoOperations.js';
import * as billing from '../db/repos/companyBilling.js';
import * as grants from '../db/repos/companyGrants.js';
import * as blobs from '../db/blobs.js';
import * as distribution from '../db/repos/distribution.js';
import * as audit from '../db/repos/audit.js';
import { makeCharter } from '../../services/company/charter.js';
import { get } from '../db/connection.js';
export async function runBusinessDemo(kind, { printPdf, onStep = () => {} } = {}) {
  if (!['hvac','billing','grants'].includes(kind)) throw new Error('Unknown demonstration.');
  const id=randomUUID(), steps=[], result={id,kind,steps,simulated:true,externalActions:0,status:'running'};
  companies.save({...makeCharter({name:`DEMO · ${kind} · ${new Date().toLocaleString()}`,mission:'Isolated business rehearsal. All people and external evidence are fictional.'}),id,status:'paused',demoMode:true,workspace:buildWorkspaceBlueprint({profile:kind==='billing'?'finance':kind}),demoRun:true});
  const step=async(label,fn)=>{const s={label,status:'running'};steps.push(s);onStep({...result});try{const value=await fn();s.status='passed';s.evidence=value == null ? null : JSON.parse(JSON.stringify(value));onStep({...result});return value;}catch(e){s.status='failed';s.error=e.message;throw e;}};
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  try {
    if(kind==='hvac') {
      const site=await step('Create client and site',()=>{const client=ops.saveClient(id,{name:'DEMO — Client HVAC',email:'client@example.invalid'});return gmao.saveSite(id,{name:'DEMO — Office',trigram:'DEM',clientId:client.id});});
      const asset=gmao.saveAsset(id,{siteId:site.id,equipmentType:'split',assetCode:'DEMO-01'});
      const wo=await step('Register and schedule intervention',()=>{const order=gmao.createWorkOrder(id,{siteId:site.id,assetId:asset.id,title:'DEMO — Restore cooling',priority:'P3',requestKey:'demo-intervention'});gmao.updateWorkOrder(id,order.id,{scheduledAt:Date.now(),assigneeHuman:'DEMO technician',durationMinutes:60});return gmao.getWorkOrder(id,order.id);});
      await step('Assign technician and record arrival',()=>{for(const status of ['triaged','assigned','acknowledged','en_route','on_site'])gmao.transitionWorkOrder(id,wo.id,status,{assigneeHuman:'DEMO technician'});return gmao.getWorkOrder(id,wo.id);});
      await step('Record completed field work',()=>gmao.recordAttachmentSheet(id,wo.id,{technicianName:'DEMO technician',workPerformed:'DEMO — Cleaned filter; tested cooling. This is fictional field evidence.',resolved:true}));
      await step('Record sample customer acceptance',()=>gmao.recordServiceAcceptance(id,wo.id,{reference:'DEMO-SF-001',customerSignatory:'DEMO customer'}));
      await step('Hand off to billing',()=>gmao.validateProcessStep(id,wo.id,{step:'billing_requested',confirmed:true}));
      await step('Verify saved outcome',()=>{const saved=gmao.getWorkOrder(id,wo.id);check(saved.status==='restored'&&saved.serviceAcceptance,'Intervention was not restored and accepted.');result.recordId=wo.id;result.view='work-orders';result.summary='Restored intervention, customer acceptance and billing handoff saved.';return saved;});
    } else if(kind==='billing') {
      const customer=billing.saveCustomer(id,{name:'DEMO customer',email:'customer@example.invalid'});
      let invoice=await step('Prepare invoice',()=>billing.saveInvoice(id,{clientId:customer.id,kind:'standalone',issuedAt:Date.now(),dueAt:Date.now()+86400000,parties:{issuer:{name:'DEMO HVAC',registration:'123456789',address:'DEMO address'},recipient:{name:customer.name,address:'DEMO address'}},lines:[{description:'DEMO — Maintenance visit',quantity:1,unitCents:20000,vatRate:20}]}));
      invoice=await step('Validate and number invoice',()=>billing.transitionInvoice(id,invoice.id,{revision:invoice.revision,status:'validated',confirmed:true,recordedBy:'DEMO owner'}));
      await step('Generate invoice document',async()=>{const html=billing.documentHtml(id,invoice.id);if(!printPdf)throw new Error('PDF rendering is unavailable.');const bytes=await printPdf(html);const b=blobs.write(bytes,'pdf',{source:'billing',sourceId:id,mimeType:'application/pdf'});invoice=billing.attachDocument(id,invoice.id,{blobId:b.id,blobExt:'pdf',filename:'DEMO-invoice.pdf',version:createHash('sha256').update(html).digest('hex')});return invoice;});
      invoice=billing.attachEvidence(id,'invoice',invoice.id,{revision:invoice.revision,filename:'DEMO-receipts.txt',base64:Buffer.from('SIMULATED: delivery, customer acceptance and bank receipts for demonstration only. No money was received.').toString('base64')});
      const proof={attachmentId:invoice.attachments.at(-1).id,confirmed:true,recordedBy:'DEMO owner',reference:'DEMO-receipt',evidenceReference:'SIMULATED receipt'};
      await step('Record simulated delivery and acceptance',()=>{for(const status of ['submitted','accepted'])invoice=billing.transitionInvoice(id,invoice.id,{...proof,status,revision:invoice.revision});return invoice;});
      await step('Reconcile sample partial payment',()=>{invoice=billing.recordPayment(id,invoice.id,{...proof,reference:'DEMO-BANK-1',revision:invoice.revision,amountCents:10000});check(invoice.status==='accepted','Partial payment must remain open.');return invoice;});
      await step('Reconcile sample final payment',()=>{invoice=billing.recordPayment(id,invoice.id,{...proof,reference:'DEMO-BANK-2',revision:invoice.revision,amountCents:14000});check(invoice.status==='paid','Final payment did not settle invoice.');result.recordId=invoice.id;result.view='billing';result.summary='Numbered invoice, PDF, partial payment and final settlement saved. Payments are simulated.';return invoice;});
    } else {
      const b=blobs.write(Buffer.from('DEMO ONLY — Fictional company identity and provider/bank receipts. Not valid for a grant application.'),'txt');
      const doc=await step('Store reusable company document',()=>grants.persist(id,'document',{label:'DEMO company evidence',blob_id:b.id,ext:'txt',documentType:'company_identity'}));
      let d=await step('Create installation application',()=>grants.saveDossier(id,{title:'DEMO cooling installation',beneficiary:'DEMO household',territory:'Demonstration only',scheme:'DEMO scheme — not an official eligibility assessment',ruleSource:'https://example.org/demo-rules',ruleVersion:'DEMO',checklist:'DEMO chronology and required documents reviewed',requiredDocumentTypes:['company_identity'],documentIds:[doc.id],portalUrl:'https://example.org',applicationReference:'DEMO-APPLICATION-1',awardedCents:50000,receivedCents:0}));
      await step('Review eligibility and prepare documents',()=>{d=grants.advanceDossier(id,{id:d.id,revision:d.revision,stage:'documents',evidence:'DEMO reviewer'});grants.prepareBatch(id,{ids:[d.id]});d=grants.snapshot(id).dossiers.find(r=>r.id===d.id);check(d.preparation.blockers.length===0,'Preparation still has blockers.');d=grants.advanceDossier(id,{id:d.id,revision:d.revision,stage:'review',evidence:'DEMO document review'});return d;});
      await step('Record simulated submission and award',()=>{
        const receiptBlob=blobs.write(Buffer.from('DEMO ONLY — Fictional submission and award receipt for DEMO-APPLICATION-1. No application was submitted.'),'txt');
        const receipt=grants.persist(id,'document',{label:'DEMO submission and award receipt',documentType:'notice',dossierId:d.id,beneficiary:d.beneficiary,blob_id:receiptBlob.id,ext:'txt'});
        d=grants.saveDossier(id,{...d,documentIds:[...d.documentIds,receipt.id]});
        for(const stage of ['submitted','instruction','awarded'])d=grants.advanceDossier(id,{id:d.id,revision:d.revision,stage,evidence:'SIMULATED provider receipt',evidenceDocumentId:receipt.id});return d;
      });
      await step('Reconcile sample payment',()=>{
        const bankBlob=blobs.write(Buffer.from('DEMO ONLY — Fictional bank receipt DEMO-BANK-1, reference DEMO-APPLICATION-1, amount 500.00 EUR. No money moved.'),'txt');
        const bank=grants.persist(id,'document',{label:'DEMO bank receipt',documentType:'bank',dossierId:d.id,beneficiary:d.beneficiary,blob_id:bankBlob.id,ext:'txt'});
        d=grants.reconcilePayment(id,{id:d.id,revision:d.revision,transaction:{id:'DEMO-BANK-1',reference:'DEMO-APPLICATION-1',amountCents:50000},evidenceDocumentId:bank.id,confirmed:true});check(d.receivedCents===50000,'Grant payment was not reconciled.');d=grants.advanceDossier(id,{id:d.id,revision:d.revision,stage:'settled',evidence:'SIMULATED bank settlement',evidenceDocumentId:bank.id});check(d.stage==='settled','Grant payment did not settle dossier.');result.recordId=d.id;result.view='grants';result.summary='Reusable document, preparation, submission evidence, award and settlement saved. Provider and bank evidence are simulated.';return d;});
    }
    result.status='passed';
  } catch(e) {result.status='failed';result.error=e.message;}
  result.finishedAt=Date.now();
  audit.append(id,{kind:'action',role:'owner',action:'businessDemo',status:result.status,meta:result});
  // Keep the result with its team so it survives navigation and restart.
  const charter=companies.getById(id);companies.save({...charter,demoResult:result});
  ensureDemoDeliverables(id);
  onStep(result);return result;
}

// Also populate deliverables for rehearsals created before the guided workspace.
export function ensureDemoDeliverables(id) {
 const charter=companies.getById(id);
 if(!charter?.demoRun) throw new Error('Not a demonstration workspace.');
 const result=charter.demoResult;
 if(!result) return charter;
 const existing=distribution.listCatalog(id);
 const invoice=result.kind==='billing' && result.recordId ? billing.snapshot(id).invoices.find(row=>row.id===result.recordId) : null;
 if(invoice?.document?.blobId && !existing.some(row=>row.meta?.demoInvoicePdf)) {
  distribution.publish(id,{pipeline:'document',role:'owner',blobId:invoice.document.blobId,blobExt:'pdf',
    prompt:'DEMO invoice PDF',meta:{title:'DEMO invoice PDF',demoInvoicePdf:true,demoRun:true}});
 }
 for(const [index,step] of result.steps.entries()) {
  if(existing.some(row=>row.meta?.demoStep===index)) continue;
  distribution.publish(id,{pipeline:'text',role:'owner',prompt:step.label,
   payload:['# '+step.label,'','Demonstration — fictional records and simulated external actions.','',
    'Status: '+step.status,step.error || '',step.evidence ? '\n```json\n'+JSON.stringify(step.evidence,null,2)+'\n```' : 'See the operational record for this step.'].join('\n'),
   meta:{title:step.label,demoStep:index,demoRun:true,payloadEncoding:'text'}});
 }
 return charter;
}
