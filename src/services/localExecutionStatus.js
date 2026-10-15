// Device-wide LLM telemetry. A team in swap mode uses the shared server, not
// the parallel pool. Configured models/budgets are never evidence of activity.
export async function readLocalExecutionStatus(manager, pool) {
  let shared = manager.getRuntimeState();
  const metrics = shared.phase === 'ready' ? await manager.getMetrics() : null;
  const latest = manager.getRuntimeState();
  const sameProcess = shared.pid === latest.pid && shared.port === latest.port;
  shared = latest;
  const slots = sameProcess && Array.isArray(metrics?.slots) ? metrics.slots : null;
  const slotsKnown = slots?.every(slot => typeof slot.is_processing === 'boolean') === true;
  const instances = pool.inventory().map(instance => ({
    source: 'pool', phase: instance.phase, inFlight: instance.inFlight,
  }));
  if (shared.running) instances.push({
    source: 'shared', phase: shared.phase,
    // Tracked requests may be waiting for a slot. Do not double count them;
    // /slots additionally sees gateway/API requests.
    inFlight: Math.max(shared.inFlight, slotsKnown ? slots.filter(slot => slot.is_processing).length : 0),
  });
  return {
    observedAt: Date.now(),
    loaded: instances.filter(instance => instance.phase === 'ready').length,
    loading: instances.filter(instance => instance.phase === 'loading').length,
    activeRequests: instances.reduce((sum, instance) => sum + (instance.inFlight || 0), 0),
    activityComplete: (!shared.running || shared.phase !== 'ready' || slotsKnown)
      && instances.every(instance => ['ready', 'loading'].includes(instance.phase)),
  };
}
