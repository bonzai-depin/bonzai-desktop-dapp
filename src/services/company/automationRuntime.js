import { automationHealth } from "../../shared/companyAutomation.js";

const _api = () => window.electronAPI?.db?.automation || null;

export async function begin(companyId, input) {
  const api = _api();
  if (typeof api?.begin !== "function") throw new Error("Durable company scheduling is unavailable. Restart the desktop app.");
  return api.begin(companyId, input);
}

export async function finish(companyId, runId, input) {
  const api = _api();
  if (typeof api?.finish !== "function" || String(runId).startsWith("memory-")) return null;
  return api.finish(companyId, runId, input);
}

export async function status(companyId) {
  const api = _api();
  const state = typeof api?.state === "function" ? await api.state(companyId) : null;
  return { state, health: automationHealth(state) };
}

export async function recent(companyId, limit = 30) {
  const api = _api();
  return typeof api?.recent === "function" ? api.recent(companyId, limit) : [];
}

export async function recover(companyId, staleBefore) {
  const api = _api();
  return typeof api?.recover === "function" ? api.recover(companyId, staleBefore) : { recovered: 0, state: null };
}

export async function clear(companyId) {
  const api = _api();
  return typeof api?.clear === "function" ? api.clear(companyId) : { ok: true };
}

export async function renew(companyId, runId, leaseMs) {
  const api = _api();
  if (!api?.renew) throw new Error("Restart BonzAI to enable execution lease renewal.");
  return api.renew(companyId, runId, leaseMs);
}
