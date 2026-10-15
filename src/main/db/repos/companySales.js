/** Commercial evidence remains with Sales. A receiving team explicitly accepts a scoped handoff. */
import { randomUUID } from 'node:crypto';
import { get } from '../connection.js';
import * as issues from './issues.js';
import * as audit from './audit.js';
import * as teams from './teamCommunication.js';
import * as gmao from './gmao.js';
const db = () => get().db;
const decode = r => r && ({...JSON.parse(r.data),id:r.id,revision:r.revision});
function company(id) { if (!db().prepare('SELECT id FROM companies WHERE id=?').get(id)) throw new Error('Team not found.'); }
function read(id,key) { company(id); const r=decode(db().prepare('SELECT * FROM company_sales_records WHERE company_id=? AND id=?').get(id,key)); if(!r) throw new Error('Sales record not found.'); return r; }
function put(id,value,old) {
 const key=old?.id || randomUUID(), ts=Date.now();
 db().prepare('INSERT INTO company_sales_records VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at').run(key,id,JSON.stringify(value),(old?.revision||0)+1,ts,ts);
 audit.append(id,{kind:'action',action:'sales.save',status:value.stage,note:value.title,recordId:key});
 return read(id,key);
}
const required=(v,label)=>{const s=String(v||'').trim();if(!s || s.length>20000)throw new Error(`${label} is required (maximum 20,000 characters).`);return s;};
export function snapshot(id) {
 company(id);
 return {clients:db().prepare('SELECT id,name FROM gmao_clients WHERE company_id=? ORDER BY name').all(id),records:db().prepare('SELECT * FROM company_sales_records WHERE company_id=? ORDER BY updated_at DESC').all(id).map(decode),
 incoming:db().prepare('SELECT id,source_team_name,subject,context FROM team_threads WHERE target_company_id=?').all(id).filter(t=>{const key=JSON.parse(t.context).salesId; if(!key)return false;const source=db().prepare('SELECT data FROM company_sales_records WHERE id=?').get(key);return source && !JSON.parse(source.data).handoff?.workOrderId;}).map(t=>({id:t.id,team:t.source_team_name,subject:t.subject})),
 teams:teams.directory(id)};
}
export function saveRecord(id,input) { return db().transaction(()=>{
 const old=input.id?read(id,input.id):null;
 if(old && input.revision!==old.revision) throw new Error('Record changed. Refresh before saving.');
 if(old?.handoff) throw new Error('Accepted scope has been handed off. Continue in the shared conversation.');
 const client=input.clientId?db().prepare('SELECT id,name FROM gmao_clients WHERE company_id=? AND id=?').get(id,input.clientId):null;
 if(input.clientId && !client)throw new Error('Customer not found in this team.');
 const stage=input.stage||'enquiry';
 if(!['enquiry','qualified','proposal','accepted','lost','closed'].includes(stage))throw new Error('Unknown sales stage.');
 if(!['opportunity','renewal','complaint','satisfaction'].includes(input.type))throw new Error('Choose a case type.');
 if(['complaint','satisfaction'].includes(input.type) && !['enquiry','qualified','closed'].includes(stage))throw new Error('Customer feedback uses enquiry, qualified or closed status.');
 if(['proposal','accepted'].includes(stage) && (!Number.isSafeInteger(input.amountCents)||input.amountCents<0))throw new Error('A valid quoted amount is required.');
 const evidence=['accepted','lost','closed'].includes(stage)?required(input.evidenceReference,'Customer decision evidence'):String(input.evidenceReference||'').trim();
 const nextAt=input.nextAt?Number(input.nextAt):null;
 if(nextAt!==null && (!Number.isFinite(nextAt)||nextAt<=0)) throw new Error('Invalid follow-up date.');
 return put(id,{type:input.type,stage,title:required(input.title,'Subject'),customer:required(client?.name||input.customer,'Customer'),clientId:client?.id||null,scope:required(input.scope,'Scope / customer request'),amountCents:input.amountCents??null,currency:'EUR',nextAt,evidenceReference:evidence,history:[...(old?.history||[]),{stage,at:Date.now(),evidenceReference:evidence}]},old);
})(); }
export function handoff(id,input) { return db().transaction(()=>{
 const sale=read(id,input.id);
 if(sale.handoff) {if(sale.handoff.targetTeamId!==input.targetTeamId)throw new Error('Work was already shared with another team.');return sale;}
 if(input.revision!==sale.revision)throw new Error('Record changed.');
 if(sale.stage!=='accepted'||!['opportunity','renewal'].includes(sale.type))throw new Error('Record customer acceptance before handing work to maintenance.');
 if(input.confirmed!==true)throw new Error('Confirm sharing the accepted scope.');
 const thread=teams.request(id,{targetTeamId:input.targetTeamId,targetRole:input.targetRole,subject:sale.title.slice(0,200),body:`Accepted customer work / Travaux acceptés\n${sale.customer}\n${sale.scope}\nEUR ${sale.amountCents/100}\nEvidence / Justificatif: ${sale.evidenceReference}\nUse sales.acceptHandoff with this conversation ID and a site owned by the receiving team.`,requestKey:`sales:${sale.id}:${sale.revision}`});
 db().prepare('UPDATE team_threads SET context=? WHERE id=?').run(JSON.stringify({salesId:sale.id}),thread.id);
 return put(id,{...sale,handoff:{conversationId:thread.id,targetTeamId:input.targetTeamId}},sale);
})(); }
export function acceptHandoff(id,input) { return db().transaction(()=>{
 if(input.confirmed!==true)throw new Error('Confirm the site and accepted scope.');
 const thread=teams.read(id,input.conversationId);
 if(thread.target_company_id!==id)throw new Error('Only the receiving team can accept work.');
 const source=read(thread.source_company_id,thread.context.salesId);
 if(source.handoff?.conversationId!==thread.id)throw new Error('This handoff is no longer active.');
 if(source.handoff.workOrderId) return {workOrderId:source.handoff.workOrderId};
 const work=gmao.createWorkOrder(id,{siteId:input.siteId,title:source.title,description:source.scope,type:'corrective'});
 put(thread.source_company_id,{...source,handoff:{...source.handoff,workOrderId:work.id}},source);
 teams.reply(id,{conversationId:thread.id,body:`Work order created / Intervention créée: ${work.workOrderNumber || work.id}`,requestKey:`sales-work:${source.id}`});
 return {workOrderId:work.id};
})(); }
export function runReview(id, {now=Date.now()}={}) { return db().transaction(()=>{
 company(id);
 const charter=JSON.parse(db().prepare('SELECT charter FROM companies WHERE id=?').get(id).charter);
 const role=charter.roles?.BusinessDevelopment?.companion?'BusinessDevelopment':'CEO';
 const created=[];
 for(const r of snapshot(id).records) {
  if(!r.nextAt || r.nextAt>now || ['lost','closed'].includes(r.stage) || r.handoff)continue;
  const key=`sales-followup:${r.id}:${r.nextAt}`;
  const exists=db().prepare("SELECT id FROM issues WHERE company_id=? AND EXISTS(SELECT 1 FROM json_each(issues.labels) WHERE value=?)").get(id,key);
  if(exists)continue;
  created.push(issues.create(id,{title:r.title,description:`Customer follow-up / Suivi client: ${r.customer}. Read sales.snapshot for record ${r.id}; review the actual customer response and prepare the next action. External contact requires approval.`,assigneeRole:role,assigneeCompanion:typeof charter.roles?.[role]?.companion==='object'?charter.roles[role].companion.id:charter.roles?.[role]?.companion,labels:[key,'workspace:pipeline'],createdBy:'sales-review'}));
 }
 return created;
})(); }
