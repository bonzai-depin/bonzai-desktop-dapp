import * as companySales from '../db/repos/companySales.js';
import * as companyIntake from '../db/repos/companyIntake.js';
import { workspaceLicense, registerWorkspaceIpc } from '../workspace/ipc.js';
import { needsWorkspaceLicense } from '../workspace/license.js';
import * as companyWorkspace from '../db/repos/companyWorkspace.js';
import * as companyGrants from '../db/repos/companyGrants.js';
import { createCompanyBrowser } from '../companyBrowser.js';
import path from 'node:path';
import {get} from '../db/connection.js';
import * as recordOperations from '../db/repos/recordOperations.js';
import {createRecordDelivery} from '../gmao/recordDelivery.js';
import * as teamRepo from "../db/repos/teamCommunication.js";
/**
 * BonzAI data-layer IPC bridge.
 *
 * One handler per (table, op). The renderer-side service modules
 * (auditLog.js, goals.js, etc.) become thin pass-throughs to these.
 *
 * Conventions:
 *   - Channel name: "db:<table>:<op>"
 *   - Handlers throw on schema/db errors; caller's try/catch surfaces
 *     them in the live feed via _friendlyError
 *   - Mutations broadcast a "db:<table>:changed" event to all renderers
 *     so multi-window setups (future) and the store's onChange wiring
 *     pick up updates without polling
 */

import { ipcMain as electronIpcMain, BrowserWindow, dialog } from "electron";
import * as auditRepo from "../db/repos/audit.js";
import * as generationsRepo from "../db/repos/generations.js";
import * as blobsRepo from "../db/repos/blobs.js";
import * as blobStore from "../db/blobs.js";
import * as companiesRepo from "../db/repos/companies.js";
import * as goalsRepo from "../db/repos/goals.js";
import * as issuesRepo from "../db/repos/issues.js";
import * as gmaoOps from "../db/repos/gmaoOperations.js";
import { printLocalPdf } from "../gmao/pdf.js";
import { createDeliveryService } from "../gmao/delivery.js";
import * as gmaoRepo from "../db/repos/gmao.js";
import * as treasuryRepo from "../db/repos/treasury.js";
import * as approvalsRepo from "../db/repos/approvals.js";
import * as distributionRepo from "../db/repos/distribution.js";
import * as connectorsRepo from "../db/repos/connectors.js";
import * as companionsRepo from "../db/repos/companions.js";
import * as roleplayRepo from "../db/repos/roleplay.js";
import { importRoleplayFromSessions } from "../db/import-from-store.js";
import fs from "node:fs";
import * as embeddingsRepo from "../db/repos/embeddings.js";
import * as embedWorker from "../db/embed-worker.js";
import * as embedBackfill from "../db/embed-backfill.js";
import * as embedAdapter from "../db/embed-adapter-llamacpp.js";
import * as skillsRepo from "../db/repos/skills.js";
import * as socialRepo from "../db/repos/social.js";
import * as web3Repo from "../db/repos/web3.js";
import * as memoryRepo from "../db/repos/memory.js";
import * as jobsRepo from "../db/repos/jobs.js";
import * as companyPortabilityRepo from "../db/repos/companyPortability.js";
import * as automationRepo from "../db/repos/automation.js";
import * as companyBillingRepo from '../db/repos/companyBilling.js';
import * as maintenanceRepo from '../db/repos/gmaoMaintenance.js';
import * as purchasingRepo from '../db/repos/purchasing.js';
import { COMPANY_OPERATIONS } from '../../shared/companyOperations.js';
import crypto from 'node:crypto';
import { createChorusBilling } from '../connectors/chorusBilling.js';

/**
 * Send a "table changed" event to every active renderer. The store's
 * audit-onChange listener subscribes to this and re-fetches.
 */
function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/** Register every IPC handler. Called once from main.js after DB open. */
export function registerDbIpc({ connectorRequest, readConnectorCredential } = {}) {
  registerWorkspaceIpc();
  const ipcMain = { handle(channel, handler) {
    electronIpcMain.handle(channel, (event, ...args) => {
      if (needsWorkspaceLicense(channel)) workspaceLicense().assert();
      return handler(event, ...args);
    });
  } };

  purchasingRepo.configureDelivery(connectorRequest);
  recordOperations.recoverMessages();
  const recordDelivery = createRecordDelivery({request:connectorRequest,printPdf:printLocalPdf});
  const reminderTimer = setInterval(() => {
    if (!workspaceLicense().status().unlocked) return;
    for (const row of get().db.prepare("SELECT id FROM companies WHERE status='active'").all()) {
      try {
        if (companyGrants.runReminders(row.id).length) { broadcast('db:companyGrants:changed',{companyId:row.id}); broadcast('db:issues:changed',{companyId:row.id}); }
        if (recordOperations.runReminders(row.id).length) {
          broadcast('db:recordOperations:changed',{companyId:row.id});
          broadcast('db:issues:changed',{companyId:row.id});
        }
      } catch (error) { console.warn('[records] Reminder preparation failed:', error.message); }
    }
  }, 60000);
  reminderTimer.unref();
  const chorusAction = createChorusBilling({billing:companyBillingRepo,connectors:connectorsRepo,blobs:blobStore,readCredential:readConnectorCredential});
  ipcMain.handle('db:companyBilling:chorusAction', async (_event, companyId, id, input) => {
    try {
      return await chorusAction(companyId, id, input);
    } finally {
      // An uncertain provider response may still have saved a pending journal.
      broadcast('db:companyBilling:changed', {companyId});
      broadcast('db:audit:changed', {companyId});
    }
  });
  const browser = createCompanyBrowser({BrowserWindow,dialog,assertCompany:companyGrants.assertCompany,record:(...args)=>{const value=companyGrants.persist(...args);broadcast('db:companyGrants:changed',{companyId:args[0]});return value;},
    context: (companyId,id) => companyGrants.recordById(companyId,'dossier',id),
    capture: async (companyId,dossierId,file,label) => {
      const dossier=companyGrants.recordById(companyId,'dossier',dossierId);
      const ext=path.extname(file).slice(1).toLowerCase();
      if (!['pdf','png','jpg','jpeg','txt','csv'].includes(ext) || (await fs.promises.stat(file)).size>30*1024*1024) throw new Error('Downloaded file could not be attached. Use a PDF, image or text file under 30 MB.');
      const blob=blobStore.write(await fs.promises.readFile(file),ext,{source:'company-grant-portal',sourceId:companyId});
      const doc=companyGrants.persist(companyId,'document',{label,documentType:'notice',dossierId,beneficiary:dossier.beneficiary,blob_id:blob.id,ext});
      const current=companyGrants.recordById(companyId,'dossier',dossierId);
      companyGrants.persist(companyId,'dossier',{...current,revision:current.revision+1,documentIds:[...new Set([...(current.documentIds||[]),doc.id])]},dossierId);
      broadcast('db:companyGrants:changed',{companyId});
      return doc.id;
    },
    document: (companyId,id,dossierId) => {
      if (!dossierId) throw new Error('Open the portal from an application before uploading documents.');
      const doc=companyGrants.portalPackage(companyId,{id:dossierId}).documents.find(d=>d.id===id);
      if(!doc || !/^[a-f0-9]{64}$/.test(doc.blob_id) || !/^[a-z0-9]{1,10}$/.test(doc.ext)) throw new Error('Document not found in this team.');
      return {...doc,path:blobStore.blobPath(doc.blob_id,doc.ext)};
    }
  });
  const grants = {...companyGrants,
    readDocument: async (companyId,input={}) => {
      const doc=companyGrants.snapshot(companyId).documents.find(d=>d.id===input.id);
      if(!doc || !/^[a-f0-9]{64}$/.test(doc.blob_id) || !/^[a-z0-9]{1,10}$/.test(doc.ext)) throw new Error('Document not found in this team.');
      return {...doc,base64:(await fs.promises.readFile(blobStore.blobPath(doc.blob_id,doc.ext))).toString('base64')};
    },
    draftDocument: (companyId,input={}) => {
      companyGrants.assertCompany(companyId);
      const context=companyGrants.documentContext(companyId,input);
      if(!String(input.title || '').trim() || !String(input.content || '').trim() || input.content.length>150000) throw new Error('Document title and content are required (maximum 150,000 characters).');
      const blob=blobStore.write(Buffer.from(input.content,'utf8'),'txt',{source:'company-grant-draft',sourceId:companyId});
      return companyGrants.persist(companyId,'document',{label:input.title,...context,documentType:input.documentType,draft:true,blob_id:blob.id,ext:'txt'});
    },
    attachDocument: async (companyId,input={}) => {
    companyGrants.assertCompany(companyId);
    const context=companyGrants.documentContext(companyId,input);
    if(input.validUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil) || !Number.isFinite(Date.parse(input.validUntil)))) throw new Error('Invalid document expiry date.');
    const choice=await dialog.showOpenDialog({title:'Supporting document',properties:['openFile'],filters:[{name:'Documents',extensions:['pdf','png','jpg','jpeg','docx','xlsx','csv','txt']}]});
    if(choice.canceled) return {status:'cancelled'};
    const file=choice.filePaths[0];
    if(fs.statSync(file).size>30*1024*1024) throw new Error('Maximum document size is 30 MB.');
    const ext=path.extname(file).slice(1).toLowerCase();
    const blob=blobStore.write(await fs.promises.readFile(file),ext,{source:'company-grant',sourceId:companyId});
    return companyGrants.persist(companyId,'document',{label:input.label || path.basename(file),...context,validUntil:input.validUntil || null,documentType:String(input.documentType || '').trim(),blob_id:blob.id,ext});
  }};
  const operationalRepos = { companyWorkspace, companyIntake, companySales, companyGrants:grants, companyBrowser:browser, recordOperations:{...recordOperations,...recordDelivery}, companyBilling: companyBillingRepo, gmaoMaintenance: maintenanceRepo, purchasing: purchasingRepo };
  for (const [namespace, methods] of Object.entries(COMPANY_OPERATIONS)) {
    const repo = operationalRepos[namespace];
    for (const method of [...methods.reads, ...methods.writes]) {
      ipcMain.handle(`db:${namespace}:${method}`, async (_event, companyId, ...args) => {
        if (['companyBrowser','companyGrants'].includes(namespace) && !(_event.sender.getURL().startsWith('file:') || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(_event.sender.getURL()))) throw new Error('Use the local BonzAI workspace.');
        if (typeof repo[method] !== 'function') throw new Error(`Operational action unavailable: ${namespace}.${method}`);
        try {
          return await repo[method](companyId, ...args);
        } finally {
          if (methods.writes.includes(method) && !(namespace==='companyIntake' && ['claim','renew','mailboxCheckpoint'].includes(method))) {
            broadcast(`db:${namespace}:changed`, { companyId });
            if(namespace !== 'recordOperations')broadcast('db:recordOperations:changed', {companyId});
            if(namespace === 'companySales' || method === 'shareEvidence') {
              broadcast('db:teams:changed', {});
              const peers=get().db.prepare('SELECT source_company_id, target_company_id FROM team_threads WHERE source_company_id=? OR target_company_id=?').all(companyId,companyId);
              for(const peerId of new Set(peers.flatMap(t=>[t.source_company_id,t.target_company_id]))) {
                broadcast('db:companySales:changed',{companyId:peerId});
                broadcast('db:issues:changed',{companyId:peerId});
                broadcast('db:gmao:changed',{companyId:peerId});
              }
            }
            if(namespace === 'purchasing') {
              if (method === 'saveLogistics') broadcast('db:teams:changed', {});
              const shared=get().db.prepare("SELECT DISTINCT source_company_id AS id FROM team_threads WHERE target_company_id=?").all(companyId);
              for(const source of shared) {broadcast('db:recordOperations:changed',{companyId:source.id});broadcast('db:gmao:changed',{companyId:source.id});}
            }
            broadcast('db:gmao:changed', { companyId });
            broadcast('db:audit:changed', { companyId });
            if (namespace === 'companyIntake' || ['recordCorrection', 'importInstallations', 'saveRequest', 'reportDefect', 'runReview', 'preparePayment', 'prepareReportTask', 'runReminders'].includes(method)) {
              broadcast('db:issues:changed', { companyId });
            }
          }
        }
      });
    }
    if (['companyBilling', 'purchasing'].includes(namespace)) {
      ipcMain.handle(`db:${namespace}:generateDocument`, async (_event, companyId, id) => {
        const html = repo.documentHtml(companyId, id);
        const version = crypto.createHash('sha256').update(html).digest('hex');
        const bytes = await printLocalPdf(html);
        // Recheck after asynchronous printing so a changed document cannot be
        // attached as evidence for a newer invoice or purchase-order revision.
        if (repo.documentHtml(companyId, id) !== html) throw new Error('Document changed during PDF generation. Generate it again.');
        const blob = blobStore.write(bytes, 'pdf', { mimeType: 'application/pdf', source: namespace, sourceId: companyId });
        const result = repo.attachDocument(companyId, id, { blobId: blob.id, blobExt: 'pdf', filename: `${namespace}-${version.slice(0, 12)}.pdf`, version });
        broadcast(`db:${namespace}:changed`, { companyId });
        return result;
      });
    }
  }
  const delivery = createDeliveryService({request: connectorRequest, printPdf: printLocalPdf});
  gmaoOps.recoverOutbox();
  for (const name of ['saveClient','saveServiceContract','saveSupplier','acknowledgeHandoff','saveOutbox','resolveOutbox','getDossier','searchWorkOrders']) {
    ipcMain.handle('db:gmao:'+name, async (_e,id,...args)=>{const result=await gmaoOps[name](id,...args);if(!['getDossier','searchWorkOrders'].includes(name))broadcast('db:gmao:changed',{companyId:id});return result;});
  }
  for (const name of ['generateDocument','sendOutbox','checkDelivery']) {
    ipcMain.handle('db:gmao:'+name, async (_e,id,...args)=>{try{return await delivery[name](id,...args);}finally{broadcast('db:gmao:changed',{companyId:id});}});
  }
  const notifyTeams = () => { broadcast('db:teams:changed', {}); broadcast('db:audit:changed', {}); broadcast('db:issues:changed', {}); };
  for (const name of ['list', 'directory', 'read']) ipcMain.handle('db:teams:'+name, (_e,id,...args)=>teamRepo[name](id,...args));
  for (const name of ['request','reply']) ipcMain.handle('db:teams:'+name, (_e,id,input)=>{const result=teamRepo[name](id,input,{role:'owner'});notifyTeams();return result;});
  ipcMain.handle('db:teams:execute', (_e,id,type,input,context)=>{
    const issue=issuesRepo.getById(id,context?.issueId);
    if(!issue || issue.assigneeRole!==context?.role)throw new Error('Team actions require the assigned task and member.');
    const actor={role:issue.assigneeRole};
    const params={...input,requestKey:context.requestKey||`${issue.id}:${type}:${input.conversationId||input.targetTeamId||''}`};
    const result=type==='team.directory'?teamRepo.directory(id):type==='team.readConversation'?teamRepo.read(id,input.conversationId):type==='team.requestWork'?teamRepo.request(id,params,actor):type==='team.reply'?teamRepo.reply(id,params,actor):type==='team.readProcurement'?teamRepo.readProcurement(id,input.conversationId):type==='team.updateProcurement'?teamRepo.updateProcurement(id,params,actor):null;
    if(!result)throw new Error('Unknown team action.');
    if(['team.requestWork','team.reply','team.updateProcurement'].includes(type)) {notifyTeams();broadcast('db:gmao:changed',{});}
    return result;
  });
  // ─── durable company automation runtime ──────────────────────────
  ipcMain.handle('db:companyPortability:export', (_e, id, options) => companyPortabilityRepo.exportBundle(id, options));
  ipcMain.handle('db:companyPortability:import', (_e, bundle, options) => {
    const charter = companyPortabilityRepo.importBundle(bundle, options);
    broadcast('db:companies:changed', { companyId: charter.id });
    return charter;
  });
  ipcMain.handle("db:automation:renew", (_e, id, runId, leaseMs) => automationRepo.renew(id, runId, leaseMs));
  ipcMain.handle("db:automation:begin", (event, companyId, input) => automationRepo.begin(companyId, {...input, executorId:`${process.pid}:${event.sender.id}`}));
  ipcMain.handle("db:automation:finish", (_e, companyId, runId, input) => {
    const state = automationRepo.finish(companyId, runId, input);
    broadcast("db:automation:changed", { companyId });
    return state;
  });
  ipcMain.handle("db:automation:state", (_e, companyId) => automationRepo.getState(companyId));
  ipcMain.handle("db:automation:recent", (_e, companyId, limit) => automationRepo.recent(companyId, limit));
  ipcMain.handle("db:automation:recover", (_e, companyId, staleBefore) => {
    const result = automationRepo.recover(companyId, staleBefore);
    broadcast("db:automation:changed", { companyId });
    return result;
  });
  ipcMain.handle("db:automation:clear", (_e, companyId) => ({ ok: automationRepo.clear(companyId) }));

  // ─── audit ────────────────────────────────────────────────────────
  ipcMain.handle("db:audit:append", (_e, companyId, entry) => {
    const row = auditRepo.append(companyId, entry);
    broadcast("db:audit:changed", { companyId });
    return row;
  });
  ipcMain.handle("db:audit:recent", (_e, companyId, n) => auditRepo.recent(companyId, n));
  ipcMain.handle("db:audit:all", (_e, companyId) => auditRepo.all(companyId));
  ipcMain.handle("db:audit:filter", (_e, companyId, opts) => auditRepo.filter(companyId, opts));
  ipcMain.handle("db:audit:summarize", (_e, companyId, windowMs) => auditRepo.summarize(companyId, windowMs));
  ipcMain.handle("db:audit:clear", (_e, companyId) => {
    auditRepo.clear(companyId);
    broadcast("db:audit:changed", { companyId });
    return { ok: true };
  });
  ipcMain.handle("db:audit:remove", (_e, companyId, entryId) => {
    const ok = auditRepo.remove(companyId, entryId);
    broadcast("db:audit:changed", { companyId });
    return { ok };
  });
  ipcMain.handle("db:audit:bulkInsert", (_e, rows) => {
    const n = auditRepo.bulkInsert(rows);
    if (rows.length) broadcast("db:audit:changed", { companyId: rows[0].companyId });
    return { inserted: n };
  });

  // ─── generations ──────────────────────────────────────────────────
  // The renderer hands us either a "buffer-and-meta" shape (preferred)
  // or a "base64+ext" shape. The repo writes blobs first, then the
  // generations row, all in a single transaction.
  ipcMain.handle("db:generations:create", (_e, input, blobInputs = []) => {
    const row = generationsRepo.createWithBlobs(input, blobInputs);
    broadcast("db:generations:changed", { id: row.id, pipeline: row.pipeline });
    return row;
  });
  ipcMain.handle("db:generations:list", (_e, filter) => generationsRepo.list(filter));
  ipcMain.handle("db:generations:get", (_e, id) => generationsRepo.getById(id));
  ipcMain.handle("db:generations:update", (_e, id, patch) => {
    const row = generationsRepo.update(id, patch);
    broadcast("db:generations:changed", { id });
    return row;
  });
  ipcMain.handle("db:generations:delete", (_e, id) => {
    const ok = generationsRepo.remove(id);
    if (ok) broadcast("db:generations:changed", { id });
    return { ok };
  });
  ipcMain.handle("db:generations:searchByPrompt", (_e, query, opts) => generationsRepo.searchByPrompt(query, opts));
  ipcMain.handle("db:generations:countsByPipeline", () => generationsRepo.countsByPipeline());
  ipcMain.handle("db:generations:bulkInsert", (_e, rows) => {
    const n = generationsRepo.bulkInsert(rows);
    return { inserted: n };
  });

  // ─── blobs ────────────────────────────────────────────────────────
  // Renderer writes via base64 (the only shape that round-trips IPC
  // cleanly without ArrayBuffer transfer pain). Buffer reads return as
  // Uint8Array — Vue components binding to `<img>` use `db:blobs:url`
  // which returns a `data:` URL (or, in v0.2, a `bonzai-blob://` scheme).
  ipcMain.handle("db:blobs:write", (_e, base64, ext, meta) => blobStore.writeBase64(base64, ext, meta));
  ipcMain.handle("db:blobs:writeFromPath", (_e, srcPath, ext, meta) => blobStore.writeFromPath(srcPath, ext, meta));
  ipcMain.handle("db:blobs:read", (_e, id, ext) => {
    const buf = blobsRepo.readBytes(id, ext);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  });
  ipcMain.handle("db:blobs:url", (_e, id, ext, mime) => {
    // For renderer convenience: read the file, return a data: URL.
    // Memory-efficient for moderate-size blobs (<= ~5MB). Larger media
    // should switch to a custom protocol scheme later.
    const buf = blobsRepo.readBytes(id, ext);
    const mimeOut = mime || `application/octet-stream`;
    return `data:${mimeOut};base64,${buf.toString("base64")}`;
  });
  ipcMain.handle("db:blobs:get", (_e, id) => blobsRepo.getById(id));
  ipcMain.handle("db:blobs:recent", (_e, opts) => blobsRepo.recent(opts));
  ipcMain.handle("db:blobs:diskUsage", () => blobsRepo.diskUsage());
  ipcMain.handle("db:blobs:sweepOrphans", () => blobsRepo.sweepOrphans());

  // ─── companies ────────────────────────────────────────────────────
  ipcMain.handle("db:companies:save", (_e, charter) => {
    const c = companiesRepo.save(charter);
    broadcast("db:companies:changed", { id: c.id });
    return c;
  });
  ipcMain.handle("db:companies:get", (_e, id) => companiesRepo.getById(id));
  ipcMain.handle("db:companies:list", () => companiesRepo.list());
  ipcMain.handle("db:companies:listIds", () => companiesRepo.listIds());
  ipcMain.handle("db:companies:setStatus", (_e, id, status) => companiesRepo.setStatus(id, status));
  ipcMain.handle("db:companies:remove", (_e, id) => companiesRepo.remove(id));
  ipcMain.handle("db:companies:bulkInsert", (_e, rows) => ({ inserted: companiesRepo.bulkInsert(rows) }));

  ipcMain.handle('db:goals:createWithTasks', (_e, companyId, input, tasks) => {
    const result = goalsRepo.createWithTasks(companyId, input, tasks);
    broadcast('db:goals:changed', { companyId }); broadcast('db:issues:changed', { companyId });
    return result;
  });

  // ─── goals ────────────────────────────────────────────────────────
  ipcMain.handle("db:goals:create", (_e, companyId, input) => {
    const r = goalsRepo.create(companyId, input);
    broadcast("db:goals:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:goals:list", (_e, companyId, filter) => goalsRepo.list(companyId, filter));
  ipcMain.handle("db:goals:get", (_e, companyId, goalId) => goalsRepo.getById(companyId, goalId));
  ipcMain.handle("db:goals:update", (_e, companyId, goalId, patch) => {
    const r = goalsRepo.update(companyId, goalId, patch);
    broadcast("db:goals:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:goals:cancel", (_e, companyId, goalId, reason) => {
    const r = goalsRepo.cancel(companyId, goalId, reason);
    broadcast("db:goals:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:goals:complete", (_e, companyId, goalId) => goalsRepo.complete(companyId, goalId));
  ipcMain.handle("db:goals:maybeComplete", (_e, companyId, goalId, siblings) => goalsRepo.maybeComplete(companyId, goalId, siblings));
  ipcMain.handle("db:goals:counts", (_e, companyId) => goalsRepo.counts(companyId));
  ipcMain.handle("db:goals:clear", (_e, companyId) => { goalsRepo.clear(companyId); return { ok: true }; });
  ipcMain.handle("db:goals:bulkInsert", (_e, rows) => ({ inserted: goalsRepo.bulkInsert(rows) }));

  ipcMain.handle('db:issues:reconcileExecution', (_e, id, issueId, stepId, input) => {
    const result = issuesRepo.reconcileExecution(id, issueId, stepId, input);
    broadcast('db:issues:changed', { companyId: id });
    broadcast('db:distribution:changed', { companyId: id });
    return result;
  });
  ipcMain.handle('db:issues:saveWorkflowResult', (_e, companyId, issueId, input) => {
    const result = issuesRepo.saveWorkflowResult(companyId, issueId, input);
    broadcast('db:issues:changed', { companyId });
    broadcast('db:distribution:changed', { companyId });
    broadcast('db:audit:changed', { companyId });
    return result;
  });
  ipcMain.handle('db:issues:reviewWorkflowResult', (_e, companyId, issueId, stepId, input) => {
    const result = issuesRepo.reviewWorkflowResult(companyId, issueId, stepId, input);
    broadcast('db:issues:changed', { companyId });
    broadcast('db:goals:changed', { companyId });
    broadcast('db:audit:changed', { companyId });
    return result;
  });
  ipcMain.handle("db:issues:saveExecution", (_e, companyId, id, execution, revision) => issuesRepo.saveExecution(companyId, id, execution, revision));
  ipcMain.handle('db:issues:wakeTeamWaits', (_e, id) => issuesRepo.wakeTeamWaits(id));
  ipcMain.handle('db:issues:answerQuestion', (_e, id, issueId, answer) => {
    const task = issuesRepo.answerQuestion(id, issueId, answer);
    broadcast('db:issues:changed', {companyId:id}); return task;
  });
  ipcMain.handle("db:issues:resumeApproval", (_e, companyId, id) => issuesRepo.resumeApproval(companyId, id));
  // ─── issues + attempts ────────────────────────────────────────────
  ipcMain.handle("db:issues:create", (_e, companyId, input) => {
    const r = issuesRepo.create(companyId, input);
    broadcast("db:issues:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:issues:list", (_e, companyId, filter) => issuesRepo.list(companyId, filter));
  ipcMain.handle("db:issues:get", (_e, companyId, id) => issuesRepo.getById(companyId, id));
  ipcMain.handle("db:issues:update", (_e, companyId, id, patch) => {
    const r = issuesRepo.update(companyId, id, patch);
    broadcast("db:issues:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:issues:reopen", (_e, companyId, id) => issuesRepo.reopen(companyId, id));
  ipcMain.handle("db:issues:remove", (_e, companyId, id) => {
    issuesRepo.remove(companyId, id);
    broadcast("db:issues:changed", { companyId });
    return { ok: true };
  });
  ipcMain.handle("db:issues:nextForRole", (_e, companyId, roleKey, currentCompanion) => issuesRepo.nextForRole(companyId, roleKey, currentCompanion));
  ipcMain.handle("db:issues:claimNextForRole", (_e, companyId, roleKey, currentCompanion) => {
    const r = issuesRepo.claimNextForRole(companyId, roleKey, currentCompanion);
    if (r) broadcast("db:issues:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:issues:startAttempt", (_e, companyId, issueId, role, companion) => {
    const r = issuesRepo.startAttempt(companyId, issueId, role, companion);
    broadcast("db:issues:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:issues:finishAttempt", (_e, companyId, issueId, outcome) => {
    const r = issuesRepo.finishAttempt(companyId, issueId, outcome);
    broadcast("db:issues:changed", {});
    return r;
  });
  ipcMain.handle("db:issues:attempts", (_e, issueId) => issuesRepo.attempts(issueId));
  ipcMain.handle("db:issues:counts", (_e, companyId) => issuesRepo.counts(companyId));
  ipcMain.handle("db:issues:recoverStale", (_e, companyId, staleBefore) => {
    const r = issuesRepo.recoverStale(companyId, staleBefore);
    if (r.recovered) broadcast("db:issues:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:issues:clear", (_e, companyId) => { issuesRepo.clear(companyId); return { ok: true }; });
  ipcMain.handle("db:issues:bulkInsert", (_e, rows) => ({ inserted: issuesRepo.bulkInsert(rows) }));

  // ─── HVAC GMAO ────────────────────────────────────────────────────
  const gmaoMutation = (operation) => (_e, companyId, ...args) => {
    const result = operation(companyId, ...args);
    broadcast("db:gmao:changed", { companyId });
    const buyers = get().db.prepare("SELECT DISTINCT target_company_id AS id FROM team_threads WHERE source_company_id=?").all(companyId);
    for (const buyer of buyers) broadcast('db:purchasing:changed', {companyId:buyer.id});
    return result;
  };
  ipcMain.handle("db:gmao:bootstrap", gmaoMutation(gmaoRepo.bootstrap));
  ipcMain.handle("db:gmao:snapshot", (_e, companyId, now) => gmaoRepo.snapshot(companyId, now));
  ipcMain.handle("db:gmao:saveContract", gmaoMutation(gmaoRepo.saveContract));
  ipcMain.handle("db:gmao:saveSite", gmaoMutation(gmaoRepo.saveSite));
  ipcMain.handle("db:gmao:saveAsset", gmaoMutation(gmaoRepo.saveAsset));
  ipcMain.handle("db:gmao:importAssets", gmaoMutation(gmaoRepo.importAssets));
  ipcMain.handle("db:gmao:savePlan", gmaoMutation(gmaoRepo.savePlan));
  ipcMain.handle("db:gmao:createWorkOrder", gmaoMutation(gmaoRepo.createWorkOrder));
  ipcMain.handle("db:gmao:updateWorkOrder", gmaoMutation(gmaoRepo.updateWorkOrder));
  ipcMain.handle("db:gmao:transitionWorkOrder", gmaoMutation(gmaoRepo.transitionWorkOrder));
  ipcMain.handle("db:gmao:addEvent", gmaoMutation(gmaoRepo.addEvent));
  ipcMain.handle("db:gmao:recordAttachmentSheet", gmaoMutation(gmaoRepo.recordAttachmentSheet));
  ipcMain.handle("db:gmao:saveProcurement", gmaoMutation(gmaoRepo.saveProcurement));
  ipcMain.handle("db:gmao:saveNotification", gmaoMutation(gmaoRepo.saveNotification));
  ipcMain.handle("db:gmao:addDocument", gmaoMutation(gmaoRepo.addDocument));
  ipcMain.handle("db:gmao:saveCompliance", gmaoMutation(gmaoRepo.saveCompliance));
  ipcMain.handle("db:gmao:saveSubcontractor", gmaoMutation(gmaoRepo.saveSubcontractor));
  ipcMain.handle("db:gmao:saveRate", gmaoMutation(gmaoRepo.saveRate));
  ipcMain.handle("db:gmao:createQuote", gmaoMutation(gmaoRepo.createQuote));
  ipcMain.handle("db:gmao:updateQuote", gmaoMutation(gmaoRepo.updateQuote));
  ipcMain.handle("db:gmao:validateProcessStep", gmaoMutation(gmaoRepo.validateProcessStep));
  ipcMain.handle("db:gmao:recordServiceAcceptance", gmaoMutation(gmaoRepo.recordServiceAcceptance));
  ipcMain.handle("db:gmao:saveInvoice", gmaoMutation(gmaoRepo.saveInvoice));
  ipcMain.handle("db:gmao:saveOnCallShift", gmaoMutation(gmaoRepo.saveOnCallShift));
  ipcMain.handle("db:gmao:generatePreventive", gmaoMutation(gmaoRepo.generatePreventive));
  ipcMain.handle("db:gmao:evaluateSla", gmaoMutation(gmaoRepo.evaluateAndRecordSla));
  ipcMain.handle("db:gmao:ingestDocument", gmaoMutation(gmaoRepo.ingestDocument));
  ipcMain.handle("db:gmao:applyDocumentIntake", gmaoMutation(gmaoRepo.applyDocumentIntake));
  ipcMain.handle("db:gmao:resolveRecommendation", gmaoMutation(gmaoRepo.resolveRecommendation));
  ipcMain.handle("db:gmao:recommendSchedule", gmaoMutation(gmaoRepo.recommendSchedule));
  ipcMain.handle("db:gmao:recordAssetSignal", gmaoMutation(gmaoRepo.recordAssetSignal));
  ipcMain.handle("db:gmao:saveBillingLine", gmaoMutation(gmaoRepo.saveBillingLine));
  ipcMain.handle("db:gmao:reconcileBilling", gmaoMutation(gmaoRepo.reconcileWorkOrderBilling));
  ipcMain.handle("db:gmao:runAutomation", gmaoMutation(gmaoRepo.runAutomation));
  ipcMain.handle("db:gmao:exportWeeklyRegister", (_e, companyId, options) => gmaoRepo.exportWeeklyRegister(companyId, options));
  ipcMain.handle("db:gmao:exportInventory", (_e, companyId) => gmaoRepo.exportInventory(companyId));

  // ─── treasury ─────────────────────────────────────────────────────
  ipcMain.handle("db:treasury:getState", (_e, companyId) => treasuryRepo.getState(companyId));
  ipcMain.handle("db:treasury:recordRevenue", (_e, companyId, opts) => {
    const r = treasuryRepo.recordRevenue(companyId, opts);
    broadcast("db:treasury:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:treasury:paySupplier", (_e, companyId, opts) => {
    const r = treasuryRepo.paySupplier(companyId, opts);
    broadcast("db:treasury:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:treasury:listEntries", (_e, companyId, opts) => treasuryRepo.listEntries(companyId, opts));
  ipcMain.handle("db:treasury:reset", (_e, companyId) => { treasuryRepo.reset(companyId); return { ok: true }; });
  ipcMain.handle("db:treasury:bulkInsertState", (_e, rows) => ({ inserted: treasuryRepo.bulkInsertState(rows) }));
  ipcMain.handle("db:treasury:bulkInsertEntries", (_e, rows) => ({ inserted: treasuryRepo.bulkInsertEntries(rows) }));

  // ─── approvals ────────────────────────────────────────────────────
  ipcMain.handle("db:approvals:enqueue", (_e, companyId, opts) => {
    const r = approvalsRepo.enqueue(companyId, opts);
    broadcast("db:approvals:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:approvals:pending", (_e, companyId) => approvalsRepo.pending(companyId));
  ipcMain.handle("db:approvals:approve", (_e, companyId, pendingId) => {
    const r = approvalsRepo.approve(companyId, pendingId);
    broadcast("db:approvals:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:approvals:reject", (_e, companyId, pendingId, reason) => {
    const r = approvalsRepo.reject(companyId, pendingId, reason);
    broadcast("db:approvals:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:approvals:clear", (_e, companyId) => { approvalsRepo.clear(companyId); return { ok: true }; });
  ipcMain.handle("db:approvals:bulkInsert", (_e, rows) => ({ inserted: approvalsRepo.bulkInsert(rows) }));

  // ─── distribution / catalog ───────────────────────────────────────
  ipcMain.handle("db:distribution:publish", (_e, companyId, opts) => {
    const r = distributionRepo.publish(companyId, opts);
    broadcast("db:distribution:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:distribution:listCatalog", (_e, companyId) => distributionRepo.listCatalog(companyId));
  ipcMain.handle("db:distribution:getRecord", (_e, companyId, id) => distributionRepo.getRecord(companyId, id));
  ipcMain.handle("db:distribution:clear", (_e, companyId) => {
    distributionRepo.clear(companyId);
    broadcast("db:distribution:changed", { companyId });
    return { ok: true };
  });
  ipcMain.handle("db:distribution:remove", (_e, companyId, contentId) => {
    const ok = distributionRepo.remove(companyId, contentId);
    broadcast("db:distribution:changed", { companyId });
    return { ok };
  });
  ipcMain.handle("db:distribution:bulkInsert", (_e, rows) => ({ inserted: distributionRepo.bulkInsert(rows) }));

  // ─── connectors ───────────────────────────────────────────────────
  ipcMain.handle("db:connectors:create", (_e, companyId, input) => {
    const r = connectorsRepo.create(companyId, input);
    broadcast("db:connectors:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:connectors:list", (_e, companyId, filter) => connectorsRepo.list(companyId, filter));
  ipcMain.handle("db:connectors:get", (_e, companyId, id) => connectorsRepo.getById(companyId, id));
  ipcMain.handle("db:connectors:getByKind", (_e, companyId, kind) => connectorsRepo.getByKind(companyId, kind));
  ipcMain.handle("db:connectors:update", (_e, companyId, id, patch) => {
    const r = connectorsRepo.update(companyId, id, patch);
    broadcast("db:connectors:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:connectors:setSecretRef", (_e, companyId, id, secretRef) => {
    const r = connectorsRepo.setSecretRef(companyId, id, secretRef);
    broadcast("db:connectors:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:connectors:revoke", (_e, companyId, id, reason) => {
    const r = connectorsRepo.revoke(companyId, id, reason);
    broadcast("db:connectors:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:connectors:remove", (_e, companyId, id) => {
    connectorsRepo.remove(companyId, id);
    broadcast("db:connectors:changed", { companyId });
    return { ok: true };
  });
  ipcMain.handle("db:connectors:healthSummary", (_e, companyId) => connectorsRepo.healthSummary(companyId));
  ipcMain.handle("db:connectors:clear", (_e, companyId) => { connectorsRepo.clear(companyId); return { ok: true }; });
  ipcMain.handle("db:connectors:bulkInsert", (_e, rows) => ({ inserted: connectorsRepo.bulkInsert(rows) }));

  // ─── companions + memory ──────────────────────────────────────────
  ipcMain.handle("db:companions:upsert", (_e, record) => {
    const r = companionsRepo.upsert(record);
    broadcast("db:companions:changed", { id: r.id });
    return r;
  });
  ipcMain.handle("db:companions:get", (_e, id) => companionsRepo.getById(id));
  ipcMain.handle("db:companions:list", (_e, filter) => companionsRepo.list(filter));
  ipcMain.handle("db:companions:remove", (_e, id) => {
    companionsRepo.remove(id);
    broadcast("db:companions:changed", { id });
    return { ok: true };
  });
  ipcMain.handle("db:companions:bulkInsert", (_e, rows) => ({ inserted: companionsRepo.bulkInsert(rows) }));
  ipcMain.handle("db:companions:replaceRoster", (_e, rows) => {
    const inserted = companionsRepo.replaceRoster(rows);
    broadcast("db:companions:changed", { replaced: true });
    return { inserted };
  });
  ipcMain.handle("db:companions:memoryAdd", (_e, companionId, mem) => companionsRepo.memoryAdd(companionId, mem));
  ipcMain.handle("db:companions:memoryList", (_e, companionId, scope) => companionsRepo.memoryList(companionId, scope));
  ipcMain.handle("db:companions:memoryRecall", (_e, companionId, scope, limit) => companionsRepo.memoryRecall(companionId, scope, limit));
  ipcMain.handle("db:companions:memoryRemove", (_e, memoryId) => { companionsRepo.memoryRemove(memoryId); return { ok: true }; });
  ipcMain.handle("db:companions:memoryClear", (_e, companionId) => { companionsRepo.memoryClear(companionId); return { ok: true }; });
  ipcMain.handle("db:companions:memoryBulkInsert", (_e, rows) => ({ inserted: companionsRepo.memoryBulkInsert(rows) }));

  // ─── linked local memory graph ───────────────────────────────────
  ipcMain.handle("db:memory:exists", (_e, scope, id) => memoryRepo.exists(scope, id));
  ipcMain.handle("db:memory:load", (_e, scope, id) => memoryRepo.load(scope, id));
  ipcMain.handle("db:memory:save", (_e, memory) => {
    const row = memoryRepo.save(memory);
    broadcast("db:memory:changed", { scope: memory.scope, id: memory.id });
    return row;
  });
  ipcMain.handle("db:memory:recall", async (_e, scope, id, query, limit) => {
    let semanticIds = [];
    try {
      const vector = await embedWorker.embedQuery(query);
      if (vector) semanticIds = embeddingsRepo.search(vector, { sourceTable: "memory_notes", k: Math.max(20, limit || 12) }).map((r) => r.sourceId);
    } catch (err) {
      console.warn("[memory] semantic recall unavailable:", err?.message);
    }
    return memoryRepo.recall(scope, id, query, limit, semanticIds);
  });

  // ─── smart-agent job board ───────────────────────────────────────
  ipcMain.handle("db:jobs:create", (_e, input) => jobsRepo.createJob(input));
  ipcMain.handle("db:jobs:list", (_e, filter) => jobsRepo.listJobs(filter));
  ipcMain.handle("db:jobs:get", (_e, id) => jobsRepo.getJob(id));
  ipcMain.handle("db:jobs:setStatus", (_e, id, status) => jobsRepo.setJobStatus(id, status));
  ipcMain.handle("db:jobs:apply", (_e, jobId, input) => jobsRepo.apply(jobId, input));
  ipcMain.handle("db:jobs:applications", (_e, jobId) => jobsRepo.listApplications(jobId));
  ipcMain.handle("db:jobs:hire", (_e, jobId, applicationId) => jobsRepo.hire(jobId, applicationId));
  ipcMain.handle("db:jobs:contract", (_e, jobId) => jobsRepo.getContract(jobId));
  ipcMain.handle("db:jobs:addMilestone", (_e, contractId, input) => jobsRepo.addMilestone(contractId, input));
  ipcMain.handle("db:jobs:milestones", (_e, contractId) => jobsRepo.listMilestones(contractId));
  ipcMain.handle("db:jobs:submitEvidence", (_e, id, evidence) => jobsRepo.submitEvidence(id, evidence));
  ipcMain.handle("db:jobs:approveMilestone", (_e, id) => jobsRepo.approveMilestone(id));
  ipcMain.handle("db:jobs:review", (_e, contractId, input) => jobsRepo.review(contractId, input));
  ipcMain.handle("db:jobs:reputation", (_e, companionId) => jobsRepo.reputation(companionId));

  // ─── roleplay sessions + messages ────────────────────────────────
  ipcMain.handle("db:roleplay:upsertSession", (_e, record) => {
    const r = roleplayRepo.upsertSession(record);
    broadcast("db:roleplay:changed", { sessionId: r.id });
    return r;
  });
  ipcMain.handle("db:roleplay:getSession", (_e, id) => roleplayRepo.getSession(id));
  ipcMain.handle("db:roleplay:listSessions", (_e, filter) => roleplayRepo.listSessions(filter));
  ipcMain.handle("db:roleplay:archiveSession", (_e, id) => { roleplayRepo.archiveSession(id); return { ok: true }; });
  ipcMain.handle("db:roleplay:clearSession", (_e, id) => { roleplayRepo.clearSession(id); return { ok: true }; });
  ipcMain.handle("db:roleplay:bulkInsertSessions", (_e, rows) => ({ inserted: roleplayRepo.bulkInsertSessions(rows) }));
  ipcMain.handle("db:roleplay:appendMessage", (_e, sessionId, msg) => {
    const r = roleplayRepo.appendMessage(sessionId, msg);
    broadcast("db:roleplay:changed", { sessionId });
    return r;
  });
  ipcMain.handle("db:roleplay:listMessages", (_e, sessionId, opts) => roleplayRepo.listMessages(sessionId, opts));
  ipcMain.handle("db:roleplay:deleteMessage", (_e, messageId) => { roleplayRepo.deleteMessage(messageId); return { ok: true }; });
  ipcMain.handle("db:roleplay:bulkInsertMessages", (_e, rows) => ({ inserted: roleplayRepo.bulkInsertMessages(rows) }));
  ipcMain.handle("db:roleplay:upsertMessages", (_e, rows) => {
    const upserted = roleplayRepo.upsertMessages(rows);
    if (rows?.length) {
      const sessionIds = new Set(rows.map((r) => r.sessionId).filter(Boolean));
      for (const sid of sessionIds) broadcast("db:roleplay:changed", { sessionId: sid });
    }
    return { upserted };
  });
  ipcMain.handle("db:roleplay:messageCount", (_e, sessionId) => roleplayRepo.messageCount(sessionId));

  // Repair: rebuild roleplay_sessions.content_level + modes from each
  // row's id (the session key carries the immutable original values).
  ipcMain.handle("db:roleplay:repairContentLevels", () => {
    const stats = roleplayRepo.repairContentLevelsFromKey();
    broadcast("db:roleplay:changed", { repaired: true, ...stats });
    return stats;
  });

  // Recovery: wipe roleplay tables and re-import from a raw sessions
  // object (typically loaded from a config.json.*.bak backup that
  // pre-dates the corruption). Returns import stats so the caller can
  // confirm row counts before reloading the UI.
  ipcMain.handle("db:roleplay:resetAndReimport", (_e, opts = {}) => {
    let sessions = opts.sessions ?? null;
    if (!sessions && opts.backupPath) {
      const raw = fs.readFileSync(opts.backupPath, "utf8");
      const parsed = JSON.parse(raw);
      sessions = parsed?.roleplaySessions ?? null;
      if (!sessions) {
        throw new Error(`backup at ${opts.backupPath} has no roleplaySessions key`);
      }
    }
    if (!sessions || typeof sessions !== "object") {
      throw new Error("resetAndReimport: provide opts.sessions or opts.backupPath");
    }
    roleplayRepo.wipeAll();
    const stats = importRoleplayFromSessions(sessions);
    broadcast("db:roleplay:changed", { reset: true, ...stats });
    return stats;
  });

  // ─── embeddings + cross-app semantic search ──────────────────────
  ipcMain.handle("db:embeddings:enqueue", (_e, item) => embeddingsRepo.enqueue(item));
  ipcMain.handle("db:embeddings:enqueueMany", (_e, items) => ({ enqueued: embeddingsRepo.enqueueMany(items) }));
  ipcMain.handle("db:embeddings:search", (_e, queryEmbedding, opts) => embeddingsRepo.search(queryEmbedding, opts));
  ipcMain.handle("db:embeddings:drop", (_e, key) => ({ dropped: embeddingsRepo.drop(key) }));
  ipcMain.handle("db:embeddings:pendingCount", () => embeddingsRepo.pendingCount());
  ipcMain.handle("db:embeddings:totalCount", () => embeddingsRepo.totalCount());
  ipcMain.handle("db:embeddings:countsBySource", () => embeddingsRepo.countsBySource());
  ipcMain.handle("db:embeddings:tick", () => embedWorker.tick());
  ipcMain.handle("db:embeddings:stats", () => embedWorker.stats());
  ipcMain.handle("db:embeddings:backfill", () => embedBackfill.backfillAll());

  // Phase 5b: try to register the llama-server embedding adapter.
  // Non-blocking — if the model file isn't on disk we just log a hint
  // and the worker stays idle (queue accumulates harmlessly). On
  // success, ticks start producing real vectors.
  embedAdapter.tryCreate().then((adapter) => {
    if (adapter) {
      embedWorker.setAdapter(adapter);
      // Kick a tick immediately so any backlog drains promptly.
      embedWorker.tick().catch((err) => console.warn("[embed] initial tick:", err?.message));
    }
  }).catch((err) => console.warn("[embed-adapter] registration failed:", err?.message));

  // Start the worker. Ticks are no-ops until the adapter resolves.
  embedWorker.start();

  // Add a "register custom adapter" IPC for tests + diagnostics.
  ipcMain.handle("db:embeddings:setAdapter", () => {
    return { hasAdapter: !!embedWorker.stats().hasAdapter };
  });

  // ─── skills ──────────────────────────────────────────────────────
  ipcMain.handle("db:skills:upsert", (_e, record) => skillsRepo.upsertSkill(record));
  ipcMain.handle("db:skills:list", (_e, filter) => skillsRepo.listSkills(filter));
  ipcMain.handle("db:skills:get", (_e, id) => skillsRepo.getSkill(id));
  ipcMain.handle("db:skills:bulkInsert", (_e, rows) => ({ inserted: skillsRepo.bulkInsertSkills(rows) }));
  ipcMain.handle("db:skills:recordRun", (_e, run) => skillsRepo.recordRun(run));
  ipcMain.handle("db:skills:listRuns", (_e, filter) => skillsRepo.listRuns(filter));
  ipcMain.handle("db:skills:runStats", (_e, skillId) => skillsRepo.runStats(skillId));
  ipcMain.handle("db:skills:bulkInsertRuns", (_e, rows) => ({ inserted: skillsRepo.bulkInsertRuns(rows) }));
  ipcMain.handle("db:skills:registerOwnership", (_e, reg) => skillsRepo.registerOwnership(reg));
  ipcMain.handle("db:skills:listOwnership", (_e, filter) => skillsRepo.listOwnership(filter));
  ipcMain.handle("db:skills:recordClaim", (_e, skillId, companionId, payoutCents) => {
    skillsRepo.recordClaim(skillId, companionId, payoutCents); return { ok: true };
  });

  // ─── moltbook + openclaw ─────────────────────────────────────────
  ipcMain.handle("db:moltbook:postCreate", (_e, post) => socialRepo.postCreate(post));
  ipcMain.handle("db:moltbook:postsList", (_e, filter) => socialRepo.postsList(filter));
  ipcMain.handle("db:moltbook:engagement", (_e, eng) => socialRepo.postRecordEngagement(eng));
  ipcMain.handle("db:openclaw:upsertConversation", (_e, conv) => socialRepo.conversationUpsert(conv));
  ipcMain.handle("db:openclaw:listConversations", (_e, filter) => socialRepo.conversationsList(filter));
  ipcMain.handle("db:openclaw:findConversation", (_e, channel, externalChatId) => socialRepo.findConversation(channel, externalChatId));
  ipcMain.handle("db:openclaw:appendMessage", (_e, conversationId, msg) => socialRepo.appendOpenclawMessage(conversationId, msg));
  ipcMain.handle("db:openclaw:listMessages", (_e, conversationId, opts) => socialRepo.listOpenclawMessages(conversationId, opts));

  // ─── web3 mirrors ────────────────────────────────────────────────
  ipcMain.handle("db:web3:mintUpsert", (_e, mint) => web3Repo.mintUpsert(mint));
  ipcMain.handle("db:web3:mintsList", (_e, filter) => web3Repo.mintsList(filter));
  ipcMain.handle("db:web3:paymentRecord", (_e, p) => web3Repo.paymentRecord(p));
  ipcMain.handle("db:web3:paymentSettle", (_e, id, txHash) => { web3Repo.paymentSettle(id, txHash); return { ok: true }; });
  ipcMain.handle("db:web3:paymentsList", (_e, filter) => web3Repo.paymentsList(filter));
  ipcMain.handle("db:web3:epochUpsert", (_e, epoch) => web3Repo.epochUpsert(epoch));
  ipcMain.handle("db:web3:epochsList", (_e, filter) => web3Repo.epochsList(filter));
  ipcMain.handle("db:web3:claimRecord", (_e, claim) => web3Repo.claimRecord(claim));
  ipcMain.handle("db:web3:claimsList", (_e, filter) => web3Repo.claimsList(filter));

  console.log("[db] IPC handlers registered: audit, generations, blobs, companies, goals, issues, treasury, approvals, distribution, connectors, companions, memory, roleplay, embeddings, skills, moltbook, openclaw, web3");
}
