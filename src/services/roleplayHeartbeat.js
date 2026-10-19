// Bounded local scheduling. Losing window focus alone is not consent to run.
export function heartbeatConfig(value = {}) {
  const number = (key, fallback, min, max) => Number.isFinite(Number(value[key]))
    ? Math.min(max, Math.max(min, Number(value[key]))) : fallback;
  return { idleTimeout: number('idleTimeout', 5, 1, 60), messageInterval: number('messageInterval', 15, 5, 120), maxMessages: Math.floor(number('maxMessages', 12, 1, 48)) };
}
export function heartbeatDue({ enabled, busy, lastActive, lastRun, now, config }) {
  const c = heartbeatConfig(config);
  return enabled && !busy && now - lastActive >= c.idleTimeout * 60000 && now - lastRun >= c.messageInterval * 60000;
}

export function heartbeatActivity({ enabled, generating, busy, count = 0, config, lastActive = 0, lastRun = 0, now = Date.now() }) {
  const normalized = heartbeatConfig(config);
  if (generating) return { stage: enabled ? 'Creating an update' : 'Finishing current update', remaining: 0 };
  if (!enabled) return { stage: count >= normalized.maxMessages ? 'Update limit reached' : 'Paused', remaining: 0 };
  if (busy) return { stage: 'Waiting for current generation', remaining: 0 };
  const remaining = Math.max(0, Math.ceil((Math.max(lastActive + normalized.idleTimeout * 60000, lastRun + normalized.messageInterval * 60000) - now) / 1000));
  return { stage: remaining ? 'Next check' : 'Ready for next check', remaining };
}
