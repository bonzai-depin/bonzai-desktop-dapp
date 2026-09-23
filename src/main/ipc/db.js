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

import { ipcMain, BrowserWindow } from "electron";
import * as auditRepo from "../db/repos/audit.js";
import * as generationsRepo from "../db/repos/generations.js";
import * as blobsRepo from "../db/repos/blobs.js";
import * as blobStore from "../db/blobs.js";
import * as companiesRepo from "../db/repos/companies.js";
import * as goalsRepo from "../db/repos/goals.js";
import * as issuesRepo from "../db/repos/issues.js";
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
export function registerDbIpc({ modelDir } = {}) {
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
  ipcMain.handle("db:issues:startAttempt", (_e, companyId, issueId, role, companion) => {
    const r = issuesRepo.startAttempt(companyId, issueId, role, companion);
    broadcast("db:issues:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:issues:finishAttempt", (_e, companyId, issueId, outcome) => {
    const r = issuesRepo.finishAttempt(companyId, issueId, outcome);
    broadcast("db:issues:changed", { companyId });
    return r;
  });
  ipcMain.handle("db:issues:attempts", (_e, issueId) => issuesRepo.attempts(issueId));
  ipcMain.handle("db:issues:counts", (_e, companyId) => issuesRepo.counts(companyId));
  ipcMain.handle("db:issues:clear", (_e, companyId) => { issuesRepo.clear(companyId); return { ok: true }; });
  ipcMain.handle("db:issues:bulkInsert", (_e, rows) => ({ inserted: issuesRepo.bulkInsert(rows) }));

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
  embedAdapter.tryCreate({ modelDir }).then((adapter) => {
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
