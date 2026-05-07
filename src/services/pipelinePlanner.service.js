/**
 * Pipeline planner with a per-peer path-state machine.
 *
 * Borrowed shape from MRC §9.3.1 (EV state machine): each peer for a
 * given pipeline category sits in one of four states. Selection only
 * draws from `GOOD`. Transitions are driven by the bridge's
 * NACK / timeout / explicit-deny signals; recovery happens on a timer
 * or via an explicit health probe.
 *
 *     ┌──────────┐  manual deny       ┌────────┐
 *     │   GOOD   │ ─────────────────▶ │ DENIED │
 *     │          │                    └────────┘
 *     │          │  recurring failure ┌──────────────┐
 *     │          │ ─────────────────▶ │ ASSUMED_BAD  │
 *     │          │                    └──────┬───────┘
 *     │          │  one-shot failure         │ probe success
 *     │          │ ──── SKIP_TTL ────┐       │ or manual reset
 *     └────┬─────┘                   ▼       ▼
 *          ▲              ┌──────────────────┐
 *          │ TTL elapses  │       SKIP       │
 *          └──────────────┤ (transient bad)  │
 *                         └──────────────────┘
 *
 * The state is held in main-process memory; it does not persist
 * across BonzAI restarts (intentionally — peers come and go, fresh
 * state on launch is cheaper than coherent persistence).
 *
 * Independent of any libp2p / contract layer — call sites pass in
 * peer-id strings and ask for "give me an eligible peer for this
 * pipeline." Wires into the inference orchestrator's private-mode
 * branch in src/main.js.
 */

// ─────────────────────────────────────────────────────────────────────
// STATE CONSTANTS
// ─────────────────────────────────────────────────────────────────────

export const PEER_STATE = Object.freeze({
  GOOD:         "good",          // eligible for selection
  SKIP:         "skip",          // transient fault — recovers after TTL
  ASSUMED_BAD: "assumed_bad",    // repeated failures — recovers only via probe
  DENIED:       "denied",        // operator explicitly disabled
});

// Tunables. Sane defaults; can be overridden via setConfig().
const _CONFIG = {
  // After a single timeout/NACK, peer goes to SKIP for this long.
  // 30 s is a balance between re-trying flapping peers too aggressively
  // and waiting forever after a single hiccup.
  skipTtlMs: 30_000,

  // Failures within `failureWindowMs` count toward the threshold below.
  // Older failures are forgotten so a peer that worked for an hour and
  // then had two NACKs isn't penalized for a stale grudge.
  failureWindowMs: 5 * 60_000,

  // N failures inside the window flip GOOD → ASSUMED_BAD.
  failureThreshold: 3,

  // Once ASSUMED_BAD, the planner should periodically attempt recovery
  // via a probe. The probe interval grows up to maxRecoveryProbeMs.
  recoveryProbeBaseMs: 60_000,
  maxRecoveryProbeMs: 30 * 60_000,
};

export function setConfig(overrides) {
  Object.assign(_CONFIG, overrides);
}

// ─────────────────────────────────────────────────────────────────────
// STATE TABLE
// ─────────────────────────────────────────────────────────────────────

/**
 * peerId -> {
 *   state, lastTransitionAt, failureTimes[], skipExpiresAt,
 *   recoveryProbeIntervalMs, lastProbeAt
 * }
 *
 * Single Map keyed by peerId — pipeline category is *not* part of the
 * key because peers advertise their pipelines on the registry side.
 * Selection filters by pipeline at lookup time. State is per-peer-
 * health, not per-pipeline-health, since a peer that's flaky on one
 * pipeline is generally flaky on others (bandwidth, NIC, uplink).
 */
const _peers = new Map();

function _now() { return Date.now(); }

function _entryFor(peerId) {
  let e = _peers.get(peerId);
  if (!e) {
    e = {
      state: PEER_STATE.GOOD,
      lastTransitionAt: _now(),
      failureTimes: [],
      skipExpiresAt: 0,
      recoveryProbeIntervalMs: _CONFIG.recoveryProbeBaseMs,
      lastProbeAt: 0,
    };
    _peers.set(peerId, e);
  }
  return e;
}

function _trimFailures(entry, now) {
  const cutoff = now - _CONFIG.failureWindowMs;
  while (entry.failureTimes.length && entry.failureTimes[0] < cutoff) {
    entry.failureTimes.shift();
  }
}

function _settle(entry, now) {
  // Lazy SKIP → GOOD when TTL elapses.
  if (entry.state === PEER_STATE.SKIP && entry.skipExpiresAt && now >= entry.skipExpiresAt) {
    entry.state = PEER_STATE.GOOD;
    entry.lastTransitionAt = now;
    entry.skipExpiresAt = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC API — state inspection
// ─────────────────────────────────────────────────────────────────────

export function getState(peerId) {
  const entry = _peers.get(peerId);
  if (!entry) return PEER_STATE.GOOD; // unknown peers default to selectable
  _settle(entry, _now());
  return entry.state;
}

/** Diagnostic snapshot for the NetworkSettings UI / debugging. */
export function snapshot() {
  const now = _now();
  const out = [];
  for (const [peerId, e] of _peers.entries()) {
    _settle(e, now);
    _trimFailures(e, now);
    out.push({
      peerId,
      state: e.state,
      recentFailures: e.failureTimes.length,
      ageMs: now - e.lastTransitionAt,
      skipRemainingMs: e.state === PEER_STATE.SKIP
        ? Math.max(0, e.skipExpiresAt - now) : 0,
      nextProbeInMs: e.state === PEER_STATE.ASSUMED_BAD
        ? Math.max(0, e.lastProbeAt + e.recoveryProbeIntervalMs - now)
        : null,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC API — transition signals
// ─────────────────────────────────────────────────────────────────────

/**
 * Reasons map directly to MRC's NACK codes plus our own. The reason
 * influences which transition we take — a TRIM_LASTHOP is a transient
 * congestion signal (→ SKIP), but UNEXP_EVENT or repeated timeouts
 * are escalating (→ ASSUMED_BAD eventually).
 */
export const FAILURE_REASON = Object.freeze({
  TIMEOUT:        "timeout",        // peer never responded within ack window
  NACK_TRIM:      "nack_trim",      // transient congestion, retry-friendly
  NACK_NOBITMAP:  "nack_nobitmap",  // peer out of resources, retry-friendly
  NACK_RESOURCE:  "nack_resource",  // peer out of generic resources
  NACK_PSN_OOR:   "nack_psn_oor",   // session-fatal protocol error
  WORKER_ERROR:   "worker_error",   // shard.py raised — bridge surfaced CTRL_ERROR
  UDS_DISCONNECT: "uds_disconnect", // local UDS to shard.py died mid-session
  PROBE_FAILED:   "probe_failed",   // recovery probe didn't get a response
});

const _TRANSIENT_REASONS = new Set([
  FAILURE_REASON.TIMEOUT,
  FAILURE_REASON.NACK_TRIM,
  FAILURE_REASON.NACK_NOBITMAP,
  FAILURE_REASON.NACK_RESOURCE,
]);

const _FATAL_REASONS = new Set([
  FAILURE_REASON.NACK_PSN_OOR,
]);

/**
 * Mark a session failure against this peer. The reason chooses which
 * transition fires; one fatal reason flips straight to ASSUMED_BAD,
 * a transient one bumps the failure counter.
 *
 * Returns the new state for caller logging.
 */
export function markFailure(peerId, reason) {
  const now = _now();
  const e = _entryFor(peerId);
  _settle(e, now);

  if (e.state === PEER_STATE.DENIED) return e.state;

  if (_FATAL_REASONS.has(reason)) {
    e.state = PEER_STATE.ASSUMED_BAD;
    e.lastTransitionAt = now;
    e.recoveryProbeIntervalMs = _CONFIG.recoveryProbeBaseMs;
    e.lastProbeAt = now;
    e.failureTimes = [];
    return e.state;
  }

  if (_TRANSIENT_REASONS.has(reason)) {
    e.failureTimes.push(now);
    _trimFailures(e, now);
    if (e.failureTimes.length >= _CONFIG.failureThreshold) {
      e.state = PEER_STATE.ASSUMED_BAD;
      e.lastTransitionAt = now;
      e.recoveryProbeIntervalMs = _CONFIG.recoveryProbeBaseMs;
      e.lastProbeAt = now;
      e.failureTimes = [];
    } else if (e.state === PEER_STATE.GOOD) {
      e.state = PEER_STATE.SKIP;
      e.lastTransitionAt = now;
      e.skipExpiresAt = now + _CONFIG.skipTtlMs;
    }
    return e.state;
  }

  // Unknown reason — treat as one transient strike, don't escalate.
  e.failureTimes.push(now);
  _trimFailures(e, now);
  if (e.state === PEER_STATE.GOOD) {
    e.state = PEER_STATE.SKIP;
    e.lastTransitionAt = now;
    e.skipExpiresAt = now + _CONFIG.skipTtlMs;
  }
  return e.state;
}

/** Successful session — clear transient failure history. */
export function markSuccess(peerId) {
  const now = _now();
  const e = _entryFor(peerId);
  if (e.state === PEER_STATE.DENIED) return;
  e.failureTimes = [];
  if (e.state !== PEER_STATE.GOOD) {
    e.state = PEER_STATE.GOOD;
    e.lastTransitionAt = now;
    e.skipExpiresAt = 0;
    e.recoveryProbeIntervalMs = _CONFIG.recoveryProbeBaseMs;
  }
}

/** Operator action from NetworkSettings — explicitly block a peer. */
export function deny(peerId) {
  const e = _entryFor(peerId);
  e.state = PEER_STATE.DENIED;
  e.lastTransitionAt = _now();
}

/** Reverse of deny() — operator manually re-enables. */
export function allow(peerId) {
  const e = _entryFor(peerId);
  e.state = PEER_STATE.GOOD;
  e.lastTransitionAt = _now();
  e.failureTimes = [];
  e.skipExpiresAt = 0;
}

/**
 * Recovery probe machinery. Returns the list of peers in
 * ASSUMED_BAD whose probe interval has elapsed; caller (the bridge)
 * sends a tiny test session and reports back via markSuccess /
 * markFailure(PROBE_FAILED).
 */
export function dueForRecoveryProbe() {
  const now = _now();
  const out = [];
  for (const [peerId, e] of _peers.entries()) {
    if (e.state !== PEER_STATE.ASSUMED_BAD) continue;
    if (now - e.lastProbeAt < e.recoveryProbeIntervalMs) continue;
    e.lastProbeAt = now;
    // Exponential backoff up to the cap — each failed probe doubles
    // the wait before the next one. markSuccess() resets it.
    e.recoveryProbeIntervalMs = Math.min(
      e.recoveryProbeIntervalMs * 2,
      _CONFIG.maxRecoveryProbeMs,
    );
    out.push(peerId);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC API — selection
// ─────────────────────────────────────────────────────────────────────

/**
 * Filter+pick a single peer for the given pipeline.
 *
 * @param {string} pipeline           "image_quality" / "video_fast" / etc.
 * @param {Array}  registryProviders  list of `{ peerId, readyPipelines, computeScore?, … }`
 * @returns {object|null}             the selected provider entry, or null
 */
export function pickPeer(pipeline, registryProviders) {
  if (!Array.isArray(registryProviders) || registryProviders.length === 0) return null;

  // Pre-filter by pipeline eligibility (registry's own filter).
  const advertised = registryProviders.filter((p) => {
    if (!p.readyPipelines || p.readyPipelines.length === 0) return true;
    return p.readyPipelines.includes(pipeline);
  });
  if (advertised.length === 0) return null;

  // Then drop anyone not in GOOD state.
  const eligible = advertised.filter((p) => getState(p.peerId) === PEER_STATE.GOOD);
  if (eligible.length === 0) return null;

  // compute_score-weighted random pick. Biases toward faster providers
  // without making selection deterministic (which would let a single
  // peer accumulate sessions and therefore data about you).
  return _weightedPick(eligible);
}

/**
 * Pick N distinct peers for a multi-hop topology. Returns ordered
 * sequence; first peer takes the most layers, allocation logic is in
 * the orchestrator.
 */
export function pickTopology(pipeline, registryProviders, n) {
  const picks = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const remaining = registryProviders.filter((p) => !used.has(p.peerId));
    if (remaining.length === 0) break;
    const pick = pickPeer(pipeline, remaining);
    if (!pick) break;
    picks.push(pick);
    used.add(pick.peerId);
  }
  return picks;
}

/**
 * Allocate L transformer layers across the picked peers proportional
 * to compute_score. Slowest peer gets the smallest slice; fastest
 * gets the most. Last peer absorbs the remainder so the math always
 * sums to L.
 *
 * @returns Array<[k_start, k_end_exclusive]>
 */
export function allocateLayers(picks, totalLayers) {
  if (picks.length === 0) return [];
  const scores = picks.map((p) => Math.max(1, Number(p.computeScore || 1)));
  const total = scores.reduce((a, b) => a + b, 0);
  const ranges = [];
  let cursor = 0;
  for (let i = 0; i < picks.length; i++) {
    const isLast = i === picks.length - 1;
    const slice = isLast
      ? totalLayers - cursor
      : Math.max(1, Math.floor((totalLayers * scores[i]) / total));
    ranges.push([cursor, cursor + slice]);
    cursor += slice;
  }
  return ranges;
}

function _weightedPick(items) {
  let total = 0;
  for (const item of items) {
    total += Math.max(1, Number(item.computeScore || 1));
  }
  let target = Math.random() * total;
  for (const item of items) {
    target -= Math.max(1, Number(item.computeScore || 1));
    if (target <= 0) return item;
  }
  return items[items.length - 1];
}

// Test hook — clear all state. NOT exported through the index;
// reachable only through __test for unit tests.
export const __test = {
  reset() { _peers.clear(); },
  PEER_STATE,
};
