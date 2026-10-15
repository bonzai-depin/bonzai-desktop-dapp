/** Pure policy helpers shared by the renderer scheduler and main-process DB. */

export const AUTOMATION_DEFAULTS = Object.freeze({
  maxActiveGoals: 8,
  maxOpenIssues: 30,
  maxAttempts: 3,
  retryBaseMs: 30_000,
  retryMaxMs: 30 * 60_000,
  staleRunMs: 10 * 60_000,
  leaseMs: 30 * 60_000,
});

// Workflow teams execute explicit requests with their supplied inputs. An idle
// production workspace is not permission to invent company goals or setup work.
export function allowsAutonomousPlanning(charter = {}) {
  return !charter.workspace?.executionWorkflowId;
}

// Keep earlier autonomous plans inspectable without running them as production
// requests. CEO-assigned work under an owner-created goal remains authorized.
export function isAutonomousWorkflowTask(charter, issue, parentGoal = null) {
  return !allowsAutonomousPlanning(charter) && issue?.createdBy === 'ceo'
    && (!issue.goalId || parentGoal?.createdBy === 'ceo');
}

export function automationPolicy(charter = {}) {
  const configured = charter.automation || {};
  return {
    maxActiveGoals: _bounded(configured.maxActiveGoals, 1, 100, AUTOMATION_DEFAULTS.maxActiveGoals),
    maxOpenIssues: _bounded(configured.maxOpenIssues, 1, 1000, AUTOMATION_DEFAULTS.maxOpenIssues),
    maxAttempts: _bounded(configured.maxAttempts, 1, 10, AUTOMATION_DEFAULTS.maxAttempts),
    retryBaseMs: _bounded(configured.retryBaseMs, 1_000, 60 * 60_000, AUTOMATION_DEFAULTS.retryBaseMs),
    retryMaxMs: _bounded(configured.retryMaxMs, 1_000, 24 * 60 * 60_000, AUTOMATION_DEFAULTS.retryMaxMs),
    staleRunMs: _bounded(configured.staleRunMs, 60_000, 60 * 60_000, AUTOMATION_DEFAULTS.staleRunMs),
    leaseMs: _bounded(configured.leaseMs, 60_000, 60 * 60_000, AUTOMATION_DEFAULTS.leaseMs),
  };
}

export function retryDelayMs(attempt, policy = AUTOMATION_DEFAULTS, jitterKey = "") {
  const exponent = Math.max(0, Number(attempt || 1) - 1);
  const base = policy.retryBaseMs * (2 ** exponent);
  if (!jitterKey) return Math.min(policy.retryMaxMs, base);
  const spread = 0.85 + (_hashFraction(jitterKey) * 0.3);
  return Math.min(policy.retryMaxMs, Math.round(base * spread));
}

export function normalizeIntent(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .sort()
    .join(" ");
}

export function intentSimilarity(left, right) {
  const a = new Set(normalizeIntent(left).split(" ").filter(Boolean));
  const b = new Set(normalizeIntent(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / new Set([...a, ...b]).size;
}

export function isDuplicateIntent(title, existingTitles, threshold = 0.72) {
  const normalized = normalizeIntent(title);
  if (!normalized) return true;
  return (existingTitles || []).some((candidate) => {
    const other = normalizeIntent(candidate);
    return other === normalized || intentSimilarity(normalized, other) >= threshold;
  });
}

export function automationHealth(state, now = Date.now()) {
  if (!state) return { level: "idle", label: "Ready", detail: "No run recorded yet" };
  if (state.leaseExpiresAt > now) return { level: "running", label: "Running", detail: state.activeLane || "automation" };
  if ((state.consecutiveFailures || 0) >= 3) return { level: "error", label: "Needs attention", detail: state.lastError || "Repeated failures" };
  if (state.lastError && (!state.lastSuccessAt || state.updatedAt > state.lastSuccessAt)) {
    return { level: "warning", label: "Needs review", detail: state.lastError };
  }
  return { level: "healthy", label: "Ready", detail: "Waiting for the next task" };
}

function _bounded(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function _hashFraction(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "this", "that",
  "les", "des", "pour", "avec", "dans", "une", "sur", "aux",
]);
