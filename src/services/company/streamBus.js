/**
 * BonzAI Company — tiny pub/sub for in-flight LLM streams.
 *
 * The dispatcher emits `begin / chunk / end` events here so the store
 * (and any other consumer — e.g. an Electron main-process telemetry
 * adapter later) can react without taking on a hard dependency on the
 * Vue reactive layer.
 *
 * Lives in its own module to avoid the circular import the dispatcher
 * would otherwise create with companyStore.
 */

const _listeners = new Set();
let relay = null;

/**
 * Emit an event. Listeners are called synchronously; throwing in a
 * listener is logged but doesn't unwind the dispatcher.
 *
 * @param {object} ev
 *   { type: "begin" | "chunk" | "end" | "error",
 *     streamId, role, action, ?chunk, ?meta }
 */
export function emit(ev) {
  for (const l of _listeners) {
    try { l(ev); } catch (err) { console.warn("[streamBus] listener threw:", err?.message); }
  }
}

/**
 * Subscribe. Returns an unsubscribe function.
 */
export function subscribe(listener) {
  if (!relay && !globalThis.window?.__BONZAI_COMPANY_RUNTIME__) relay = globalThis.window?.electronAPI?.companyRuntime?.onStream(emit);
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
