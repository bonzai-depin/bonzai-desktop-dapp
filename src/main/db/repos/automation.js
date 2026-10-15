import { v4 as uuid } from "uuid";
import { get } from "../connection.js";

export function begin(companyId, input = {}) {
  const { db } = get();
  const now = Number(input.now) || Date.now();
  const lane = input.lane === "roles" ? "roles" : "ceo";
  const triggerType = ['manual', 'event'].includes(input.triggerType) ? input.triggerType : 'scheduled';
  const leaseMs = Math.max(60_000, Number(input.leaseMs) || 360_000);
  const runId = uuid();

  return db.transaction(() => {
    db.prepare(`INSERT INTO company_automation_state (company_id, updated_at)
      VALUES (?, ?) ON CONFLICT(company_id) DO NOTHING`).run(companyId, now);
    const company = db.prepare('SELECT name, status FROM companies WHERE id = ?').get(companyId);
    if (company?.status !== 'active') return { acquired: false, reason: 'paused' };
    const state = getState(companyId);
    if (state.leaseExpiresAt && state.leaseExpiresAt > now) {
      return { acquired: false, reason: "leased", state };
    }
    const nextAt = lane === "ceo" ? state.nextCeoAt : state.nextRolesAt;
    if (triggerType === "scheduled" && nextAt && nextAt > now) {
      return { acquired: false, reason: "not_due", state };
    }

    const harness = input.harness?.teamId === companyId && /^[a-f0-9]{64}$/.test(input.harness.configurationRevision || '')
      ? {version:1,teamId:companyId,teamName:company.name,configurationRevision:input.harness.configurationRevision,runId}
      : null;
    db.prepare(`INSERT INTO company_automation_runs
      (id, company_id, lane, trigger_type, status, started_at, result)
      VALUES (?, ?, ?, ?, 'running', ?, ?)`).run(runId, companyId, lane, triggerType, now, _json({...(harness ? {harness} : {}), ...(input.executorId ? {executorId:String(input.executorId)} : {})}));
    db.prepare(`UPDATE company_automation_state SET
      scheduler_status = 'running', active_lane = ?, lease_owner = ?,
      lease_expires_at = ?, updated_at = ? WHERE company_id = ?`)
      .run(lane, runId, now + leaseMs, now, companyId);
    return { acquired: true, runId, state: getState(companyId) };
  })();
}

export function renew(companyId, runId, leaseMs = 360_000) {
  const { db } = get();
  return db.prepare(`UPDATE company_automation_state SET lease_expires_at = ?, updated_at = ?
    WHERE company_id = ? AND lease_owner = ? AND lease_expires_at > ?
    AND EXISTS (SELECT 1 FROM companies WHERE id = company_id AND status = 'active')`)
    .run(Date.now() + Math.max(60_000, leaseMs), Date.now(), companyId, runId, Date.now()).changes === 1;
}

export function finish(companyId, runId, input = {}) {
  const { db } = get();
  const now = Number(input.now) || Date.now();
  let status = input.status === "completed" ? "completed" : input.status === "interrupted" ? "interrupted" : "failed";
  let error = input.error || null;
  const run = db.prepare("SELECT * FROM company_automation_runs WHERE id = ? AND company_id = ?").get(runId, companyId);
  if (!run || run.status !== 'running') return getState(companyId);
  const nextColumn = run.lane === "roles" ? "next_roles_at" : "next_ceo_at";
  const lastColumn = run.lane === "roles" ? "last_roles_at" : "last_ceo_at";
  const nextAt = Number(input.nextAt) || null;
  db.transaction(() => {
    const state = getState(companyId);
    // A late completion must never clear a newer harness's lease or overwrite
    // its retry clock. Expired runs are evidence of interruption, not success.
    if (state?.leaseOwner !== runId || !(state.leaseExpiresAt > now)) {
      db.prepare("UPDATE company_automation_runs SET status = 'interrupted', finished_at = ?, error = 'Execution lease no longer held' WHERE id = ? AND status = 'running'").run(now, runId);
      return;
    }
    if (db.prepare('SELECT status FROM companies WHERE id = ?').get(companyId)?.status !== 'active') {
      status = 'interrupted';
      error = error || 'Team paused before this run finished.';
    }
    const harness = _parse(run.result)?.harness;
    const result = harness ? {...(input.result || {}),harness} : input.result;
    db.prepare(`UPDATE company_automation_runs SET status = ?, finished_at = ?, result = ?, error = ? WHERE id = ?`)
      .run(status, now, _json(result), error, runId);
    const failureSql = status === "completed"
      ? "consecutive_failures = 0, last_success_at = @now, last_error = NULL"
      : status === "interrupted" ? "last_error = @error"
      : "consecutive_failures = consecutive_failures + 1, last_error = @error";
    db.prepare(`UPDATE company_automation_state SET
      scheduler_status = @schedulerStatus, active_lane = NULL, lease_owner = NULL,
      lease_expires_at = NULL, ${lastColumn} = @now, ${nextColumn} = @nextAt,
      ${failureSql}, updated_at = @now
      WHERE company_id = @companyId AND lease_owner = @runId`)
      .run({ schedulerStatus: status === "failed" ? "retrying" : "idle", now, nextAt, error, companyId, runId });
  })();
  return getState(companyId);
}

export function getState(companyId) {
  const { db } = get();
  return _stateRow(db.prepare("SELECT * FROM company_automation_state WHERE company_id = ?").get(companyId));
}

export function recent(companyId, limit = 30) {
  const { db } = get();
  return db.prepare(`SELECT * FROM company_automation_runs WHERE company_id = ? ORDER BY started_at DESC LIMIT ?`)
    .all(companyId, Math.max(1, Math.min(200, Number(limit) || 30)))
    .map(_runRow);
}

export function recover(companyId, staleBefore = Date.now() - 600_000) {
  const { db } = get();
  const now = Date.now();
  return db.transaction(() => {
    const state = getState(companyId);
    if (state?.leaseExpiresAt > now) return { recovered: 0, state };
    const runs = db.prepare(`SELECT id FROM company_automation_runs
      WHERE company_id = ? AND status = 'running' AND started_at < ?`).all(companyId, staleBefore);
    if (runs.length) {
      db.prepare(`UPDATE company_automation_runs SET status = 'interrupted', finished_at = ?, error = 'App stopped before the run completed'
        WHERE company_id = ? AND status = 'running' AND started_at < ?`).run(now, companyId, staleBefore);
      db.prepare(`UPDATE company_automation_state SET scheduler_status = 'retrying', active_lane = NULL,
        lease_owner = NULL, lease_expires_at = NULL, last_error = 'Recovered an interrupted run', updated_at = ?
        WHERE company_id = ?`).run(now, companyId);
    }
    return { recovered: runs.length, state: getState(companyId) };
  })();
}

export function clear(companyId) {
  const { db } = get();
  db.transaction(() => {
    db.prepare("DELETE FROM company_automation_runs WHERE company_id = ?").run(companyId);
    db.prepare("DELETE FROM company_automation_state WHERE company_id = ?").run(companyId);
  })();
  return true;
}

/** Called only after Electron confirms that this executor has stopped. */
export function interruptExecutor(executorId) {
  const { db } = get();
  return db.transaction(() => {
    const rows = db.prepare("SELECT id, company_id FROM company_automation_runs WHERE status='running' AND json_extract(result,'$.executorId')=?").all(String(executorId));
    for (const row of rows) {
      db.prepare('UPDATE company_automation_state SET lease_expires_at=0 WHERE company_id=? AND lease_owner=?').run(row.company_id,row.id);
      db.prepare("UPDATE company_intake_sources SET lease_until=0 WHERE company_id=? AND status='processing'").run(row.company_id);
      recover(row.company_id, Date.now()+1);
    }
    return [...new Set(rows.map(row=>row.company_id))];
  })();
}

/** Old process IDs are inspected, never terminated. A live second instance
 * keeps its leases; a confirmed exited instance can be recovered immediately. */
export function recoverStoppedExecutors(isAlive = pid => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}) {
  const { db } = get();
  const rows = db.prepare("SELECT DISTINCT json_extract(result,'$.executorId') AS executor FROM company_automation_runs WHERE status='running'").all();
  const teams = new Set();
  for (const {executor} of rows) {
    const match = /^(\d+):\d+$/.exec(executor || '');
    if (match && Number(match[1]) > 0 && !isAlive(Number(match[1]))) for (const id of interruptExecutor(executor)) teams.add(id);
  }
  return [...teams];
}

function _stateRow(row) {
  if (!row) return null;
  return {
    companyId: row.company_id,
    schedulerStatus: row.scheduler_status,
    activeLane: row.active_lane,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    lastCeoAt: row.last_ceo_at,
    lastRolesAt: row.last_roles_at,
    lastSuccessAt: row.last_success_at,
    consecutiveFailures: row.consecutive_failures,
    nextCeoAt: row.next_ceo_at,
    nextRolesAt: row.next_roles_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

function _runRow(row) {
  return {
    id: row.id, companyId: row.company_id, lane: row.lane, triggerType: row.trigger_type,
    status: row.status, startedAt: row.started_at, finishedAt: row.finished_at,
    result: _parse(row.result), error: row.error,
  };
}

function _json(value) { return value == null ? null : JSON.stringify(value); }
function _parse(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }
