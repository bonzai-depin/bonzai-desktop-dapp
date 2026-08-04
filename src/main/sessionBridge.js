// src/main/sessionBridge.js
//
// P2 — trusted local-session lifecycle (wallet-optional).
//
// Narrowly scoped operations around the P1 credential registry:
//
//   obtain  — return the live session credential (token + redacted
//             descriptor) so the renderer's auth.service can attach it to
//             local HTTP / Socket.IO auth. Never discloses the Flask
//             signing secret.
//   rotate  — invalidate the current registry generation (issue() bumps it),
//             rekey/restart dependent local services with the fresh
//             credential, then return the replacement. The old generation
//             is rejected by the registry from this point on.
//
// Sender validation is deterministic and strict: only the current BonzAI
// top-level renderer may call. Remote, subframe, stale-window, and
// origin-mismatched senders are denied. Packaged and supported development
// origins have separate allowlists.
//
// This module imports nothing from Electron. The ipcMain.handle wiring and
// the event → sender normalization live here as pure functions that main.js
// calls; authorizeSessionSender and the handler factories are unit-testable
// under `node --test` without a live Electron process. The handler bodies
// take a plain sender descriptor (the stable contract), so tests invoke them
// directly through the bridge seam.

// Supported development origins: loopback http(s) on any port. The packaged
// build loads from file://. These are the only origins a top-level BonzAI
// renderer may legitimately come from.
import path from "node:path";

const DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
const PACKAGED_ORIGIN = "file://";

/**
 * Extract a normalized origin string from a URL. Node's URL.origin returns
 * the string "null" for the file scheme, so map that explicitly to a stable
 * "file://" sentinel. Returns null for non-URL input.
 */
function originOf(url) {
  if (typeof url !== "string" || !url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === "file:") return PACKAGED_ORIGIN;
  const o = parsed.origin;
  return o && o !== "null" ? o : null;
}

/**
 * Validate that a session-bridge caller is the current BonzAI top-level
 * renderer. `sender` is the normalized descriptor produced by
 * normalizeSessionEvent (or a synthetic equivalent in tests):
 *
 *   { url, origin?, windowAlive?, isMainWindow?, isMainFrame? }
 *
 * Denies, in order:
 *   - destroyed / closed senders               -> 'stale-window'
 *   - senders that are not the current window   -> 'stale-window'
 *   - subframes (nested iframe injection)        -> 'subframe'
 *   - senders whose origin is not supported for  -> 'remote'
 *     the active mode (packaged file:// vs dev loopback)
 *   - senders whose origin does not match the   -> 'origin-mismatch'
 *     configured main window origin exactly
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function authorizeSessionSender(sender, { isPackaged, mainWindowUrl } = {}) {
  if (!sender || typeof sender !== "object") return { ok: false, reason: "no-sender" };

  // Window lifecycle — a destroyed or swapped-out window is never trusted.
  if (sender.windowAlive === false) return { ok: false, reason: "stale-window" };
  if (sender.isMainWindow === false) return { ok: false, reason: "stale-window" };

  // Top-frame only — a nested iframe in the renderer must not reach the bridge.
  if (sender.isMainFrame === false) return { ok: false, reason: "subframe" };

  const senderOrigin = originOf(sender.url ?? sender.origin);
  if (!senderOrigin) return { ok: false, reason: "remote" };

  if (isPackaged) {
    // Packaged mode: the sender must be the EXACT main-window file. The
    // file:// scheme sentinel is not sufficient — any local file loaded
    // into the main window after a top-level navigation would otherwise
    // satisfy a scheme-only comparison.
    const senderPath = filePathOf(sender.url);
    const mainPath = filePathOf(mainWindowUrl);
    if (!senderPath || !mainPath || senderPath !== mainPath) {
      return { ok: false, reason: "origin-mismatch" };
    }
  } else {
    // Development mode: loopback origin, matching the main window's origin
    // exactly so a nearby loopback port cannot impersonate.
    const modeOk = DEV_ORIGIN_RE.test(senderOrigin);
    if (!modeOk) return { ok: false, reason: "remote" };
    const mainOrigin = originOf(mainWindowUrl);
    if (!mainOrigin || senderOrigin !== mainOrigin) {
      return { ok: false, reason: "origin-mismatch" };
    }
  }

  return { ok: true };
}

/**
 * Normalized filesystem path for a file: URL, or null for any other scheme.
 * Packaged sender validation compares EXACT file paths — the file:// scheme
 * alone does not identify the application document.
 */
function filePathOf(url) {
  if (typeof url !== "string" || !url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "file:") return null;
  try {
    return path.normalize(decodeURIComponent(parsed.pathname));
  } catch {
    return null;
  }
}

/**
 * Normalize a live ipcMain event into the plain sender descriptor the
 * handlers and authorizeSessionSender consume. Kept here (not in main.js)
 * so the sender contract has one definition. Duck-types the Electron
 * webContents / frame API; never imported by tests.
 */
export function normalizeSessionEvent(event, mainWindow) {
  const wc = event && event.sender;
  if (!wc) return null;

  let url = "";
  try {
    url = typeof wc.getURL === "function" ? wc.getURL() || "" : "";
  } catch {
    url = "";
  }

  const windowAlive = !wc.isDestroyed || !wc.isDestroyed();

  let isMainWindow = false;
  try {
    isMainWindow =
      !!mainWindow &&
      !mainWindow.isDestroyed() &&
      !!mainWindow.webContents &&
      wc.id === mainWindow.webContents.id;
  } catch {
    isMainWindow = false;
  }

  // Top-frame check: the sending frame must be the webContents' main frame.
  // Compare routing ids (stable per frame), falling back to reference equality.
  const frame = event.senderFrame;
  let isMainFrame = false;
  try {
    const mainFrame = wc.mainFrame;
    isMainFrame = !!frame && !!mainFrame && (frame === mainFrame || frame.routingId === mainFrame.routingId);
  } catch {
    isMainFrame = !!frame;
  }

  return { url, origin: url, windowAlive, isMainWindow, isMainFrame };
}

/**
 * Build the obtain/rotate handlers around a credential registry.
 *
 * @param {object} opts
 * @param {ReturnType<import("./credentialRegistry.js").createCredentialRegistry>} opts.registry
 * @param {(sender:object)=>{ok:boolean,reason?:string}} [opts.authorize]
 *        Sender validator (defaults to a deny-all so main.js must wire
 *        authorizeSessionSender explicitly).
 * @param {() => (void|Promise<void>)} [opts.rekeyDependents]
 *        Invoked by rotate AFTER the generation is bumped and BEFORE the
 *        replacement is returned, so restarted local services read the
 *        fresh credential from childEnvSecrets.
 * @returns {{ obtain:(sender)=>object, rotate:(sender)=>Promise<object>, invalidate:(sender)=>object }}
 */
export function createSessionBridge({ registry, authorize, rekeyDependents } = {}) {
  if (!registry) throw new Error("createSessionBridge requires a credential registry");
  const authz =
    typeof authorize === "function"
      ? authorize
      : () => ({ ok: false, reason: "no-authorizer" });

  // Both handlers return only the session token + a redacted descriptor.
  // The Flask signing secret is never part of a bridge result.
  function obtain(sender) {
    const decision = authz(sender);
    if (!decision.ok) return { ok: false, reason: decision.reason };
    const token = registry.getSessionCredential();
    // No live (or expired) credential — fail closed rather than hand out null.
    if (!token) return { ok: false, reason: "no-credential" };
    return { ok: true, descriptor: registry.describe(), token };
  }

  async function rotate(sender) {
    const decision = authz(sender);
    if (!decision.ok) return { ok: false, reason: decision.reason };
    // Bump the generation first (issue mints a fresh token and invalidates
    // the prior generation), THEN rekey dependents so the restarted child
    // processes read the new credential via childEnvSecrets — never the old.
    const descriptor = registry.issue();
    if (typeof rekeyDependents === "function") {
      await rekeyDependents();
    }
    const token = registry.getSessionCredential();
    return { ok: true, descriptor, token };
  }

  /**
   * Synchronous invalidation for logout: kills the current SESSION
   * credential generation immediately so every previously issued session
   * credential dies at once, without waiting for a rotate/rekey round-trip.
   * The renderer calls this over sendSync; the old generation is rejected by
   * the registry from this point on.
   *
   * Scoped to "session" only (registry default) — wallet logout must not
   * take down the external OpenClaw/Hermes credential, which is unrelated to
   * wallet auth and stays live so those integrations keep working.
   */
  function invalidate(sender) {
    const decision = authz(sender);
    if (!decision.ok) return { ok: false, reason: decision.reason };
    registry.invalidate({ scope: "session" });
    return { ok: true };
  }

  return { obtain, rotate, invalidate };
}
