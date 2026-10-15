import { workflowTeamPresets } from './workflowTeams.js';
import { PAPERASSE_TEMPLATES } from './paperasseTeams.js';
import { inferWorkspaceProfile } from './workspaceBlueprints.js';
// Each link is resolved by the same router as the command bar.
const steps = {
 grants: [
 ['Company documents',{view:'grants',section:'documents'},'Add reusable company documents once. Choose a document type and expiry date; leave beneficiary blank only for company-wide documents.'],
 ['First application',{view:'grants',section:'new'},'Create an application with beneficiary, territory and installation reference. Verify the official scheme and rule version before approving eligibility.'],
 ['Prepare applications','grants','Select required document types, save, then prepare the page. Resolve missing or expired documents. Import files in Files & email; the same installation reference and scheme reuse the existing application.'],
 ['Submit and follow up',{view:'grants',section:'portal'},'Open the application’s Submission portal, sign in and review the form before submitting in the visible browser. Attach the actual receipt and application reference before marking Submitted. Record correction notices and their deadlines.'],
 ['Reconcile a payment',{view:'grants',section:'followup'},'Record the award decision first. Match the bank transaction reference and amount, attach bank evidence and confirm the payment. Partial payments stay open until full settlement is evidenced.']
 ],
 hvac: [
 ['Clients','clients','Create the client and site before adding equipment. Keep the contract, access instructions and contact details with the correct site.'],
 ['Operations settings','operations-settings','Import equipment and maintenance plans. Review contract terms, response deadlines and pricing rules before using them.'],
 ['Work orders','work-orders','Record the request, site, equipment and priority. Assign the technician and schedule the visit; collect actual work, photos and completion evidence.'],
 ['Schedule','schedule','Open Plan a technician route. Select visits in order, enter reviewed travel times, preview arrival times, then confirm. Conflicts or unavailable parts block the whole change; no partial route is saved.'],
 ['Parts requests','parts','Link needed parts to the work order. Request purchasing help, record receipts and keep supplier evidence attached. A request is not a placed order.'],
 ['Billing','billing','Collect customer acceptance before preparing the contract invoice. Review line items, send with approval and record verified payments separately.']
 ],
 purchasing: [
 ['Purchasing','purchasing','Start from a verified parts request or create a purchase request with quantities, specifications and the originating work order.'],
 ['Purchasing','purchasing','Compare supplier quotations and confirm the selected supplier, price and delivery terms. Obtain approval before placing or sending an order.'],
 ['Purchasing','purchasing','Record actual receipts, including partial quantities. Match the supplier invoice to the order and receipts, then retain payment evidence.'],
 ['Stock & warranties',{view:'purchasing',section:'stock'},'In Stock, record depot or vehicle locations. Reserve parts against their request, transfer only available stock, and use reserved parts against that same request. Link warranty claims to the supplier invoice and record the next follow-up. A credit decision is not a bank settlement.'],
 ['Logistics & margin',{view:'purchasing',section:'logistics'},'Open Logistics & margin. Select the purchase request, record the delivery location and required date, then review every delivered-cost category. Unknown costs remain missing, including freight and duties. Save carrier evidence and expected delivery; linked GMAO requests receive the update in their conversation and intervention history.'],
 ],
 finance: [
 ['Chat','command','Provide the company, accounting period, currency and source statements. Ask the team to list missing evidence before calculating or drafting.'],
 ['Backlog','issues','Review reconciliation exceptions and missing documents. Keep each entity and accounting period separate.'],
 ['Results','deliverables','Review the prepared report and supporting calculations with the responsible professional. A draft is not a filed return or an executed payment.']
 ],
 hospitality: [
 ['Chat','command','Provide the property, booking dates, checkout/check-in times, contacts and the cleaning checklist. State which systems hold confirmed bookings.'],
 ['Backlog','issues','Assign cleaning, inspection and maintenance work. Record evidence before declaring the property ready; escalate delays before the next check-in.'],
 ['Inbox','approvals','Review guest messages and supplier requests before sending. Check actual delivery status rather than treating a prepared message as sent.']
 ],
 revenue: [['Customers & sales','sales','Create the customer case, record scope and follow-up date, then save the customer’s actual acceptance evidence. Share accepted work with the maintenance team; it selects the site and creates one intervention. Complaints and renewals remain in this customer case list.'],['Chat','command','Provide the prospect or customer, request, offer, price and next deadline. Ask for qualification and a draft response.'],['Backlog','issues','Track follow-ups and customer replies. Approval of a proposal is not customer acceptance.'],['Results','deliverables','Review proposals and correspondence; record the actual customer decision and hand off accepted work.']],
 creative: [['Chat','command','Provide the brief, audience, formats, brand references and deadline. Ask for a production plan before generating assets.'],['Backlog','issues','Assign production and revisions. Install required models or configure the tools needed for the requested media.'],['Results','deliverables','Inspect the actual files and request revisions. Publishing requires a separate reviewed action.']],
 commerce: [['Chat','command','Provide product facts, prices, stock sources and the requested campaign or order outcome.'],['Backlog','issues','Track product preparation and fulfillment exceptions. Check the connected store before asserting stock, shipment or delivery.'],['Inbox','approvals','Review store changes, customer messages and external actions before execution.']],
 legal: [['Chat','command','Identify the matter, parties, jurisdiction, dates and source documents. State the requested draft or research outcome.'],['Backlog','issues','Track missing evidence and deadlines. Ask for source-backed findings and explicit unresolved questions.'],['Results','deliverables','Have the responsible professional review drafts. A generated document is not a signed agreement or a completed filing.']],
 product: [['Chat','command','Describe the customer problem, expected behavior, acceptance criteria and deadline.'],['Backlog','issues','Assign delivery, investigation and review tasks. Monitor blockers and inspect execution evidence.'],['Results','deliverables','Verify results against acceptance criteria. Approve external releases separately.']],
 knowledge: [['Chat','command','Provide the audience, learning objectives, source material, format and deadline.'],['Backlog','issues','Assign research, lesson preparation and media production. Review factual accuracy and learner feedback.'],['Results','deliverables','Inspect the lessons and media files before sharing or publishing.']]
};
const PROFILE_OUTCOMES = {
 hvac:['Scheduled work orders','Intervention reports and acceptance evidence','Parts and invoices linked to the intervention'],
 purchasing:['Supplier comparisons and approved orders','Stock movements and delivery evidence','Delivered-cost and margin assessment'],
 grants:['Applications with eligibility evidence','Submission receipts and correction history','Award decisions and payment reconciliation'],
 finance:['Reconciled records and exceptions','Reports with supporting calculations','Documents prepared for professional review'],
 hospitality:['Property readiness checklists','Guest correspondence for review','Maintenance and turnover reports'],
 revenue:['Customer cases and proposals','Follow-up history and decision evidence','Accepted work handed to the delivery team'],
 creative:['Requested media and source files','Revision history and review decisions'],
 commerce:['Product and order records','Fulfillment exceptions and customer replies'],
 legal:['Source-backed research and drafts','Open questions for professional review'],
 product:['Deliverables and test evidence','Defects and acceptance decisions'],
 knowledge:['Learning materials and supporting sources','Exercises and review feedback'],
 support:['Customer replies and investigation records','Resolution evidence and follow-up'],
 general:['Saved work and supporting evidence','Review decisions and next actions'],
};
export function teamGettingStarted(charter = {}, workflow = null) {
 if (charter.workspace?.executionWorkflowId) {
  const id = charter.workspace.executionWorkflowId;
  const preset = workflowTeamPresets([workflow || { id, name: charter.name || 'Smart workflow' }])[0];
  return {
   profile: 'workflow',
   introduction: preset?.outcome || 'Create a task and review the saved result.',
   faq: [
    ['How does a smart workflow work?', 'A workflow is a repeatable way to get a result. Each task keeps its own inputs, progress and files. Your assigned smart agent helps carry out the work.', 'studio'],
    ['Where do I give instructions?', 'Open Workflow, choose a worker and select New task. Supply the requested inputs there. Use Continue to resume a task instead of creating another one.', 'studio'],
    ['Does every task run automatically?', 'Tasks that support background execution enter the team queue after approval. Interactive tasks need you to provide inputs and start production in their task workspace. Generating a result does not approve it.', 'studio'],
    ['What is Review for?', 'Review brings together actions needing your permission and task results ready to inspect. It is not an email inbox. Open the request, check its details, then approve it or make corrections.', 'approvals'],
    ['Where are the results?', 'Results collects the files and responses saved by this workflow. Open a task to inspect its newest result, continue working or approve it. Review does not publish or share your files.', 'deliverables'],
    ['What if saving fails?', 'Keep the generated result. BonzAI backs it up on this device and offers a saving retry. If an app update is required, finish running work before restarting, then reopen the same task.', 'studio'],
    ['Can I use this for myself?', 'Yes. A workflow can be a personal project or shared work. You do not need a company identity to create a meditation, compare models or work with media.', 'studio'],
    ['Does work continue when I change screens?', 'Active tasks continue while BonzAI is running and the device is available. Closing the app or sleeping the device stops local execution. Check Activity after resuming.', 'activity'],
   ],
   outcomes: preset?.deliverables || ['Saved workflow result'],
   steps: [
    ['Start a task', 'studio', preset?.firstValue || 'Choose a worker, create a task and provide its inputs.'],
    ['Follow progress', 'issues', 'Each task keeps its own progress and results. Continue an unfinished task from Workflow; check failed or blocked tasks before trying again.'],
    ['Review the result', 'studio', preset?.review || 'Open the saved result and check it against the inputs before approving it.'],
    ['Use your results', 'deliverables', 'Open saved media, responses and files in Results. Preview or export the output you need. Sharing or publishing is a separate action.'],
   ],
  };
 }
 const profile = charter.workspace?.profile || inferWorkspaceProfile({templateId:charter.template?.id,businessType:charter.businessContext?.businessType});
 const template = PAPERASSE_TEMPLATES[charter.template?.id];
 const outcomes = template?.initialGoals || PROFILE_OUTCOMES[profile] || PROFILE_OUTCOMES.general;
 return {profile, outcomes, steps: [
 ['Files & email','intake','Open Inbox → Files & email. Import a client list, schedule, proforma or business request, or enable a connected Gmail or Outlook inbox. The team saves the source, matches existing records and queues preparation work. Review only uncertain fields and missing evidence; external actions still require approval.'],
 ...(steps[profile] || [
 ['Mission','mission','Define the expected result, deadline and acceptance criteria. Specify what needs your approval.'],
 ['Chat','command','Give the team a concrete request and the source information it needs. Ask it to identify missing information before acting.'],
 ['Backlog','issues','Track assigned work and blockers. Review requests in Inbox and inspect completed files in Results.']
 ])]};
}
export const TEAM_FAQ = [
 ['Can the team turn files and emails into work?','Yes. Inbox → Files & email accepts PDF, spreadsheets, images and text. Recognized client lists and schedules use direct field mapping; other documents use the team model. Original files, extracted facts and saved records remain linked. Reimporting the same source does not create another copy. Missing or conflicting data appears for review. Enable email intake explicitly in that view after connecting Gmail or Outlook in Tools.','approvals'],
 ['Where do I give instructions?','Use Chat for requests and corrections. Use Mission for the standing objective. Include the expected result, deadline and source records.','command'],
 ['How do I know what the team is doing?','Backlog shows assigned work and blockers. Activity shows execution events. A task is complete only when its result and evidence are available.','activity'],
 ['What needs my approval?','Inbox holds sensitive actions for review. Check the recipient, amount, documents and exact operation before approving. Approval is not proof that the external action succeeded.','approvals'],
 ['Where are the results?','Results contains saved outputs. Open the file or report and check its contents; request corrections in Chat if it does not meet the brief.','deliverables'],
 ['What if a task is blocked or fails?','Open its Backlog entry and read the missing input or error. Supply the missing evidence or repair the tool. Inspect uncertain external outcomes before retrying, to avoid duplicate sends or submissions.','issues'],
 ['Does work continue when I change screens?','Active teams continue while BonzAI is running and the device is available. Closing the app or sleeping the device stops local execution. Check Activity after resuming.','activity'],
 ['How do I connect email, banking or a portal?','Open Tools and configure the required service. Charges and account permissions belong to that service. Portal sign-in, verification codes and signatures may require you.','connectors'],
 ['Can another team help?','Ask in Chat for a specific handoff to an existing team. Share only the records needed for that task. A sent request is not proof that the other team finished the work.','command'],
 ['Are grant applications fully automatic?','No. Preparation and document reuse are available, but live portal submission and status retrieval are not yet validated end to end. Eligibility, receipts and payments require evidence; do not assume a grant is approved or paid.','grants']
];

export const BUSINESS_FAQ = {
 grants: [
  ['Which documents can I reuse?', 'Company identity and qualification documents can be reused while valid. Beneficiary identity, tax records, signed quotes, invoices and attestations belong to the individual application. Check expiry dates before each submission.', 'grants'],
  ['How do I process a large backlog?', 'Import installation files through Files & email, using stable installation references and scheme identifiers. Prepare each page, resolve missing documents and track exceptions. Keep portal receipts and payment evidence per application; importing rows does not submit them.', 'grants'],
  ['What if the provider requests corrections?', 'Record the correction request and deadline on the application. Replace or complete the requested evidence, review the amended submission, and retain the new receipt. Check the portal before retrying an uncertain submission.', 'grants']
 ],
 hvac: [
  ['How do I finish an intervention?', 'Record the actual visit, work performed, parts used and supporting photos. Obtain customer acceptance, review the contract and invoice lines, then record delivery and payment evidence. Scheduling a visit alone does not complete it.', 'work-orders'],
  ['How do parts reach the invoice?', 'Keep the parts request linked to the work order, record supplier receipts and invoices, then review the customer invoice against the contract. Supplier cost and customer charge are different amounts; check franchise terms before billing.', 'parts']
 ],
 purchasing: [['How do purchasing and GMAO collaborate?', 'Configure the purchasing team in GMAO, then create a parts request on the intervention. Purchasing receives a linked task with scoped context. Logistics updates return to the same conversation and intervention history. GMAO keeps control of planning and technical acceptance; a carrier delivery is not proof that the repair is complete.', 'purchasing'], ['How is the margin protected?', 'Select the supplier quote, then review Logistics & margin in EUR excluding recoverable VAT. Enter the reviewed selling price, other job costs and an adverse-cost allowance. Missing, estimated or expired costs and delivery or margin risks block order issuance for assessed requests. Changes invalidate earlier approvals. Existing requests without a logistics assessment are not retrospectively blocked; add an assessment before committing. Customer prices are never changed automatically.', 'purchasing'], ['When is a purchase complete?', 'Keep the request, approved quote, order, receipt and supplier invoice together. Reconcile quantities and prices, record shortages or disputes, and attach payment evidence. An approved request alone is not an order or a payment.', 'purchasing']],
 finance: [['Can I use the financial output as a filed return?', 'No. Review the period, source statements, reconciliation exceptions and calculations with the responsible accountant or adviser. Keep filing receipts and bank confirmations separately; a prepared report does not establish filing or payment.', 'deliverables']],
 hospitality: [['When can I mark a property ready?', 'Confirm cleaning and inspection evidence, resolve reported defects, and check the next booking. A scheduled cleaning task is not proof of readiness. Review guest communications before sending.', 'issues']],
 revenue: [['When is a sale won?', 'Record the customer’s actual acceptance and agreed scope, price and delivery terms. Hand off accepted work with its evidence. A generated proposal or follow-up message does not establish a sale.', 'issues']],
 creative: [['How do I approve creative work?', 'Inspect every requested format, check the brief and brand references, then request specific revisions in Chat. Confirm usage rights and the destination before approving publication.', 'deliverables']],
 commerce: [['How do I verify fulfillment?', 'Use the store and carrier records to confirm order, stock, shipment and delivery status. Resolve exceptions in Backlog. Generated copy and internal task completion do not change those external records.', 'issues']],
 legal: [['Who signs off legal work?', 'The responsible qualified professional reviews the sources, jurisdiction, dates and unresolved questions. Keep signatures and filing receipts as separate evidence; an agent draft is not an executed agreement.', 'deliverables']],
 product: [['How do I accept a delivery?', 'Check the delivered files and test evidence against the acceptance criteria in the request. Record defects in Chat or Backlog. Review deployment or release as a separate external action.', 'deliverables']],
 knowledge: [['When is learning content ready?', 'Check source accuracy, learning objectives, exercises and all requested media. Review learner feedback and request revisions before sharing or publishing.', 'deliverables']],
 support: [['When is a customer issue resolved?', 'Keep the customer request, investigation, reply and outcome together. Verify the fix and record customer confirmation where needed. Sending a reply does not by itself resolve the issue.', 'issues']]
};

// A shared finance profile does not make tax/audit/notarial teams billing teams.
export function teamDemoKinds(charter = {}) {
 if (charter.demoRun && ['hvac','billing','grants'].includes(charter.demoResult?.kind)) return [charter.demoResult.kind];
 const {profile}=teamGettingStarted(charter);
 if(profile==='hvac') return ['hvac'];
 if(profile==='grants') return ['grants'];
 const templateId=charter.template?.id || charter.workspace?.templateId;
 if(profile==='finance' && !PAPERASSE_TEMPLATES[templateId]) return ['billing'];
 return [];
}

// Readiness is derived from records, never from a clicked tutorial checkbox.
export function guideReadiness(title, overview = {}, state = {}) {
 const metrics = {'Files & email':'imports','Company documents':'grantDocuments','First application':'grantApplications','Clients':'clients','Operations settings':'equipment','Work orders':'workOrders','Purchasing':'purchases','Customers & sales':'sales','Backlog':'tasks'};
 const metric=metrics[title];
 if(metric && Number.isFinite(overview[metric])) return {count:overview[metric],recorded:overview[metric]>0};
 if(title==='Mission')return {recorded:!!state.mission};
 return null;
}
