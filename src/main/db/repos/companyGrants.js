import { prepareGrant, paymentCandidate } from "../../../services/company/grantPreparation.js";
import { documentBelongsToGrant, currentGrantDocument, grantDocumentScope } from '../../../services/company/grantDocuments.js';
import * as issues from "./issues.js";
import { randomUUID } from "node:crypto";
import { get } from "../connection.js";
import {
  validateDossier,
  transitionDossier,
} from "../../../services/company/grantsDomain.js";
const db = () => get().db;
export function assertCompany(companyId) {
  if (!db().prepare("SELECT id FROM companies WHERE id=?").get(companyId))
    throw new Error("Company not found.");
}
export function snapshot(companyId) {
  assertCompany(companyId);
  const records = db()
    .prepare(
      "SELECT * FROM company_grants_records WHERE company_id=? AND kind IN ('dossier','document') UNION ALL SELECT * FROM (SELECT * FROM company_grants_records WHERE company_id=? AND kind='browser_event' ORDER BY updated_at DESC LIMIT 100) ORDER BY updated_at DESC",
    )
    .all(companyId, companyId)
    .map((r) => ({
      ...JSON.parse(r.data),
      id: r.id,
      kind: r.kind,
      updatedAt: r.updated_at,
    }));
  return {
    dossiers: records.filter((r) => r.kind === "dossier"),
    documents: records.filter((r) => r.kind === "document"),
    events: records.filter((r) => r.kind === "browser_event").slice(0, 100),
  };
}
export function recordById(companyId, kind, id) {
  assertCompany(companyId);
  const row = db().prepare('SELECT * FROM company_grants_records WHERE company_id=? AND kind=? AND id=?').get(companyId, kind, id);
  if (!row) throw new Error('Record not found in this team.');
  return {...JSON.parse(row.data), id: row.id, kind: row.kind};
}
export function documentContext(companyId, input) {
  if (input.dossierId) {
    const dossier = recordById(companyId, 'dossier', input.dossierId);
    if (input.beneficiary && input.beneficiary !== dossier.beneficiary) throw new Error('Document beneficiary does not match the application.');
    return {dossierId: dossier.id, beneficiary: dossier.beneficiary};
  }
  if (grantDocumentScope(input) === 'application') throw new Error('Select the application for this document.');
  return {dossierId: null, beneficiary: input.beneficiary || ''};
}
/** Explicit review for old unscoped documents; never silently reassign evidence. */
export function linkDocument(companyId, input) {
  const doc = recordById(companyId, 'document', input.documentId);
  const dossier = recordById(companyId, 'dossier', input.dossierId);
  if (input.confirmed !== true || (doc.dossierId && doc.dossierId !== dossier.id) || (doc.beneficiary && doc.beneficiary !== dossier.beneficiary)) throw new Error('Review the document and its application before linking.');
  return persist(companyId, 'document', {...doc, dossierId: dossier.id, beneficiary: dossier.beneficiary}, doc.id);
}
export function portalPackage(companyId, input = {}) {
  const dossier = recordById(companyId, 'dossier', input.id);
  const documents = db().prepare("SELECT id,data FROM company_grants_records WHERE company_id=? AND kind='document'").all(companyId).map(r=>({...JSON.parse(r.data),id:r.id}));
  const preparation = prepareGrant(dossier, documents);
  return {dossier, preparation, documents: documents.filter(d=>(dossier.documentIds || []).includes(d.id) && currentGrantDocument(d, dossier))};
}
export function persist(companyId, kind, data, id) {
  assertCompany(companyId);
  if (
    id &&
    !db()
      .prepare(
        "SELECT id FROM company_grants_records WHERE id=? AND company_id=? AND kind=?",
      )
      .get(id, companyId, kind)
  )
    throw new Error("Record not found in this team.");
  const now = Date.now(),
    key = id || randomUUID();
  db()
    .prepare(
      "INSERT INTO company_grants_records(id,company_id,kind,data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
    )
    .run(key, companyId, kind, JSON.stringify(data), now, now);
  return { ...data, id: key };
}
export function saveDossier(companyId, input) {
  assertCompany(companyId);
  const previous = input.id ? recordById(companyId, 'dossier', input.id) : null;
  if (input.id && !previous) throw new Error("Dossier not found.");
  if (Number(input.receivedCents || 0) !== Number(previous?.receivedCents || 0)) throw new Error('Use bank reconciliation to update received amounts.');
  const value = validateDossier(input, previous);
  if (
    value.applicationReference &&
    db().prepare("SELECT id FROM company_grants_records WHERE company_id=? AND kind='dossier' AND id!=? AND json_extract(data,'$.applicationReference')=? AND json_extract(data,'$.scheme')=? AND json_extract(data,'$.beneficiary')=?").get(companyId, value.id || '', value.applicationReference, value.scheme || '', value.beneficiary)

  )
    throw new Error(
      "This application reference is already recorded. Open the existing dossier.",
    );
  if (
    (value.documentIds || []).some(
      (id) =>
        !documentBelongsToGrant(recordById(companyId,'document',id), value),
    )
  )
    throw new Error("Documents must belong to this company and application. Review and link older documents first.");
  return persist(companyId, "dossier", value, input.id);
}
export function advanceDossier(companyId, input) {
  const state = snapshot(companyId),
    dossier = state.dossiers.find((d) => d.id === input.id);
  if (!dossier) throw new Error("Dossier not found.");
  if (['review','submitted'].includes(input.stage)) {
    const prepared = prepareGrant(dossier, state.documents);
    if (prepared.blockers.length) throw new Error(prepared.blockers.join(' '));
  }
  if (input.stage === 'settled' && (dossier.payments || []).reduce((sum,p)=>sum+p.amountCents,0) !== dossier.receivedCents) throw new Error('Reconcile bank evidence before settling the application.');
  return persist(
    companyId,
    "dossier",
    transitionDossier(dossier, input, state.documents),
    dossier.id,
  );
}

/** Review before a deadline, then once when overdue; never submit or email automatically. */
export function runReminders(companyId, now = Date.now()) {
  const state = snapshot(companyId),
    result = [];
  for (const dossier of state.dossiers) {
    const phase = new Date(dossier.dueDate + "T23:59:59").getTime() < now ? 'overdue' : 'upcoming';
    const reminderKey = `${dossier.dueDate}:${phase}`;
    if (
      ["settled", "rejected", "withdrawn"].includes(dossier.stage) ||
      !dossier.dueDate ||
      new Date(dossier.dueDate + "T23:59:59").getTime() > now + 7 * 86400000 ||
      (dossier.remindedDate === reminderKey || dossier.remindedDate === dossier.dueDate)
    )
      continue;
    db().transaction(() => {
      const task = issues.create(companyId, {
        title: `Grant follow-up: ${dossier.title}`,
        description: `${dossier.nextAction || "Check portal status and outstanding documents."}\nApplication: ${dossier.id}. Reference: ${dossier.applicationReference || "not submitted"}. Inspect receipts before any retry.`,
        assigneeRole: "CEO",
        labels: ["grants", `grant:${dossier.id}`],
        createdBy: "grant-reminder",
      });
      persist(
        companyId,
        "dossier",
        { ...dossier, remindedDate: reminderKey },
        dossier.id,
      );
      result.push(task);
    })();
  }
  return result;
}

/** Bounded, repeatable local preparation. External actions remain separate. */
export function prepareBatch(companyId, input = {}) {
  const state = snapshot(companyId);
  const ids = new Set(input.ids || []);
  if (!ids.size || ids.size > 100) throw new Error('Select between 1 and 100 applications.');
  const results = [];
  db().transaction(() => {
    for (const id of ids) {
      const dossier = state.dossiers.find(d => d.id === id);
      if (!dossier) throw new Error('Dossier not found in this team.');
      if (!['qualification','documents','review'].includes(dossier.stage)) continue;
      const preparation = prepareGrant(dossier, state.documents);
      results.push(persist(companyId, 'dossier', { ...dossier, documentIds: preparation.documentIds, preparation, revision: dossier.revision + 1 }, id));
    }
  })();
  return results;
}

/** Import a stable installation reference once per scheme, with no portal side effects. */
export function importInstallations(companyId, input) {
  if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 100) throw new Error('Import between 1 and 100 installations.');
  return db().transaction(() => {
    const results = [];
    for (const row of input.rows) {
      if (!row.workOrderReference || !row.scheme) throw new Error('Installation reference and scheme are required.');
      const existing = db().prepare("SELECT id FROM company_grants_records WHERE company_id=? AND kind='dossier' AND json_extract(data,'$.workOrderReference')=? AND json_extract(data,'$.scheme')=? LIMIT 1").get(companyId,row.workOrderReference,row.scheme);
      if (existing) { results.push({id: existing.id, reused: true}); continue; }
      const {id, revision, history, preparation, payments, ...facts} = row;
      const dossier = saveDossier(companyId, {...facts, awardedCents: 0, receivedCents: 0, documentIds: []});
      const task = issues.create(companyId, {title:`Prepare grant: ${dossier.title}`,description:`Application ${dossier.id}. Read grants.snapshot and prepareBatch. Verify the official scheme, territory, chronology and required documents. Prepare missing documents and request owner review. Never submit without approval or invent eligibility.`,assigneeRole:'DocumentController',labels:['grants',`grant:${dossier.id}`],createdBy:'grant-intake'});
      results.push(persist(companyId,'dossier',{...dossier,preparationTaskId:task.id},dossier.id));
    }
    return results;
  })();
}

/** Explicitly confirmed bank evidence; matching alone never records money received. */
export function reconcilePayment(companyId, input) {
  return db().transaction(() => {
    const state = snapshot(companyId);
    const prior = state.dossiers.find(d => (d.payments || []).some(p => p.id === input.transaction?.id));
    if (prior) throw new Error('This bank transaction has already been reconciled.');
    const dossier = paymentCandidate(state.dossiers, input.transaction || {});
    if (!dossier || dossier.id !== input.id || dossier.revision !== input.revision) throw new Error('No unique current payment match. Review the application reference and amount.');
    const evidence = state.documents.find(d => d.id === input.evidenceDocumentId && d.documentType === 'bank' && currentGrantDocument(d, dossier));
    if (!evidence || input.confirmed !== true) throw new Error('Confirm the payment against an attached bank document.');
    const receivedCents = (dossier.receivedCents || 0) + input.transaction.amountCents;
    return persist(companyId, 'dossier', {...dossier, receivedCents, revision: dossier.revision + 1,
      payments: [...(dossier.payments || []), {...input.transaction, evidenceDocumentId: evidence.id, at: Date.now()}],
      documentIds: [...new Set([...(dossier.documentIds || []), evidence.id])]}, dossier.id);
  })();
}

/** Provider requests remain attached to the submitted application, not a second deposit. */
export function recordCorrection(companyId, input) {
  return db().transaction(() => {
    const state = snapshot(companyId), dossier = state.dossiers.find(d => d.id === input.id);
    if (!dossier || dossier.revision !== input.revision || !['submitted','instruction'].includes(dossier.stage)) throw new Error('Open a current submitted application.');
    if (!String(input.reference || '').trim() || !String(input.request || '').trim()) throw new Error('Provider reference and requested correction are required.');
    const doc = state.documents.find(d => d.id === input.evidenceDocumentId && d.documentType === 'notice' && currentGrantDocument(d, dossier));
    if (!doc) throw new Error('Attach the provider correction request.');
    if ((dossier.corrections || []).some(c => c.reference === input.reference)) return dossier;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || '') || !Number.isFinite(Date.parse(input.dueDate))) throw new Error('A correction deadline is required.');
    const task = issues.create(companyId,{title:`Grant correction: ${dossier.title}`,description:`${input.request}\nApplication ${dossier.id}. Provider request ${input.reference}. Prepare the requested documents; do not create another application. Return for approval before uploading.`,assigneeRole:'DocumentController',labels:['grants',`grant:${dossier.id}`],createdBy:'grant-correction'});
    return persist(companyId,'dossier',{...dossier,revision:dossier.revision+1,dueDate:input.dueDate,nextAction:input.request,remindedDate:null,
      documentIds:[...new Set([...(dossier.documentIds || []),doc.id])],
      corrections:[...(dossier.corrections || []),{reference:input.reference,request:input.request,dueDate:input.dueDate,evidenceDocumentId:doc.id,taskId:task.id,at:Date.now()}]},dossier.id);
  })();
}
