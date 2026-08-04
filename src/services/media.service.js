/**
 * Signed /media/stream URLs (R1-R3 Security).
 *
 * HTML <img>/<video>/<audio> elements cannot attach the desktop session
 * header (x-bonzai-session) the Flask inference server otherwise requires,
 * so local media paths must instead be resolved through the main process's
 * media:sign-url IPC (P2 sender-validated, P4 path-contained) into a
 * short-lived (5 min, see MEDIA_SIGNED_URL_TTL_SECONDS in src/main.js)
 * signature carried in the query string. Components must use
 * `signedMediaStreamSrc` below rather than concatenating a raw,
 * unauthenticated `${API_BASE}/media/stream?path=...` URL.
 *
 * A held signed URL stays usable across pauses/seek/typical playback: this
 * module's background renewal loop (see refreshExpiringEntries /
 * startAutoRenewal below) proactively re-signs cache entries ahead of expiry
 * without depending on a component re-rendering to trigger it (R4).
 */

import { reactive } from "vue";

const API_BASE =
  (typeof window !== "undefined" && window?.electronAPI?.env?.API_BASE) ||
  "http://127.0.0.1:65000";

// canonicalPath -> { url, expiresAtMs }. A Vue `reactive` Map so a component
// reading `cache.get(path)` during render is tracked, and re-renders once
// the background refresh below lands -- callers get a plain synchronous
// function (signedMediaStreamSrc) rather than having to thread an async
// call through every v-for'd <img>/<video>/<audio> binding.
const cache = reactive(new Map());
const pending = new Map(); // localPath -> in-flight refresh promise

// Refresh this far ahead of the server-side TTL lapsing, so a slow render
// (or a slow tick of the background renewal loop below) never races a
// signature that has just expired server-side.
const REFRESH_SKEW_MS = 20_000;

// A component that reads signedMediaStreamSrc() only once (e.g. sets a ref
// from getSignedMediaStreamUrl() and never re-reads the reactive cache) would
// otherwise hold a URL that goes stale the moment the server-side TTL lapses,
// since nothing re-triggers refresh() for it. This interval scans the cache
// independently of any component render and proactively re-signs entries
// nearing expiry, so a held URL renews reliably. Only runs in a browser
// context (the renderer); a no-op under `node --test` / SSR.
const AUTO_RENEW_INTERVAL_MS = 15_000;

/**
 * Windows-style absolute path, e.g. `C:\Users\...` or `C:/Users/...`.
 * Local paths on this platform must still be routed through the signed-URL
 * helper rather than falling through to a (broken) base64 fallback.
 */
function isWindowsDrivePath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

/**
 * Windows UNC path, e.g. `\\server\share\clip.mp4`. A user can pick an
 * arbitrary model directory, including one that lives on a network share, so
 * these must be recognized alongside drive-letter paths (R3) rather than
 * falling through as a raw, unsigned renderer URL. (A `//server/share/...`
 * forward-slash UNC form already matches the POSIX-absolute check below.)
 */
function isWindowsUncPath(value) {
  return /^\\\\[^\\/]+[\\/][^\\/]+/.test(value);
}

/**
 * True iff `value` is a local filesystem path (POSIX absolute, Windows
 * drive-letter, or Windows UNC) that should be resolved through the signed
 * /media/stream endpoint, rather than treated as a data URL / remote URL /
 * raw base64 payload. Shared by every component's getImageSrc/getAudioSrc/
 * getVideoSrc so Windows paths (R3) are recognized consistently everywhere.
 */
export function isLocalMediaPath(value) {
  if (typeof value !== "string" || !value) return false;
  return value.startsWith("/") || isWindowsDrivePath(value) || isWindowsUncPath(value);
}

function buildStreamUrl({ path, exp, sig }) {
  const qs = new URLSearchParams({ path, exp: String(exp), sig });
  return `${API_BASE}/media/stream?${qs.toString()}`;
}

function pathFromStreamUrl(url) {
  if (!url) return null;
  try {
    return new URL(url, API_BASE).searchParams.get("path");
  } catch {
    return null;
  }
}

function boundMediaElements(localPath) {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll("audio[src], video[src]")].filter(
    (el) => pathFromStreamUrl(el.currentSrc || el.src) === localPath,
  );
}

// A signature renewal swaps the query string (new exp/sig), so any <audio>/
// <video> bound to the old URL needs its `src` attribute updated to the new
// one, which makes the browser reload the resource from byte 0 and kills
// in-progress playback. Snapshot playback position/state for elements bound
// to `localPath` before the cache update lands, then restore it once they've
// picked up the new src.
//
// `el.src` is set HERE, directly, rather than left to a reactive `:src`
// binding to pick up the `cache.set` below on its next render. A caller that
// captured this URL once via getSignedMediaStreamUrl() (a plain string
// assigned to a ref/prop, e.g. `myRef.value = await getSignedMediaStreamUrl(p)`
// then `<video :src="myRef">`) has no reactive dependency on `cache` at all,
// so relying on Vue's reactivity alone would never reach that element - the
// held URL would silently go stale the moment the server-side TTL lapses,
// contradicting the module doc's R4 promise. Updating the DOM element
// directly makes renewal work for every caller found by boundMediaElements,
// reactive-binding or not; a Vue-bound element re-renders to the same value
// afterward, which is a no-op.
function applyRenewedEntry(localPath, entry) {
  const bound = boundMediaElements(localPath).map((el) => ({
    el,
    time: el.currentTime,
    wasPlaying: !el.paused && !el.ended,
  }));
  cache.set(localPath, entry);
  for (const { el, time, wasPlaying } of bound) {
    el.addEventListener(
      "loadedmetadata",
      () => {
        el.currentTime = time;
        if (wasPlaying) el.play().catch(() => {});
      },
      { once: true },
    );
    el.src = entry.url;
  }
}

function refresh(localPath) {
  const inFlight = pending.get(localPath);
  if (inFlight) return inFlight;
  const promise = (async () => {
    try {
      const result = await window?.electronAPI?.session?.signMediaUrl?.(localPath);
      if (result?.ok) {
        const entry = { url: buildStreamUrl(result), expiresAtMs: result.exp * 1000 };
        if (cache.has(localPath)) {
          applyRenewedEntry(localPath, entry);
        } else {
          cache.set(localPath, entry);
        }
      } else {
        cache.delete(localPath);
      }
    } catch {
      cache.delete(localPath);
    } finally {
      pending.delete(localPath);
    }
  })();
  pending.set(localPath, promise);
  return promise;
}

/**
 * Synchronous, reactive lookup for a signed /media/stream URL over a local
 * filesystem path. Returns "" before the first signature lands (the IPC
 * round-trip is local and typically sub-millisecond, so this resolves well
 * before the next paint in practice) and kicks off / refreshes the signing
 * IPC in the background. Call from a computed/render context so the reactive
 * cache re-renders the caller once the signed URL is available.
 */
export function signedMediaStreamSrc(localPath) {
  if (!localPath) return "";
  const entry = cache.get(localPath);
  const fresh = entry && entry.expiresAtMs - Date.now() > REFRESH_SKEW_MS;
  if (!fresh) refresh(localPath);
  return entry?.url || "";
}

/**
 * Async counterpart for call sites that already await a generation response
 * (e.g. setting a ref exactly once after a fetch resolves) rather than
 * reading reactively during render. Resolves to "" if signing is denied
 * (untrusted sender or a path outside the media roots).
 */
export async function getSignedMediaStreamUrl(localPath) {
  if (!localPath) return "";
  await refresh(localPath);
  return cache.get(localPath)?.url || "";
}

/**
 * Re-sign every cache entry nearing expiry, independent of whether any
 * component's render happens to read it again. This is what makes renewal
 * reliable (R4): `signedMediaStreamSrc` only refreshes an entry when IT is
 * called again, which never happens for a component that captured the URL
 * once (e.g. via getSignedMediaStreamUrl) and just holds a ref/prop — that
 * held URL would otherwise go stale the moment the server-side TTL lapses.
 * `refresh()` updates the reactive `cache` in place, so any element/component
 * still bound to a renewed path picks up the new URL automatically (video/
 * audio elements are additionally kept mid-playback via applyRenewedEntry).
 *
 * Exported (rather than only wired to the interval below) so tests can drive
 * a renewal deterministically without waiting on a real timer.
 */
export function refreshExpiringEntries(nowMs = Date.now()) {
  for (const [localPath, entry] of cache.entries()) {
    if (entry.expiresAtMs - nowMs <= REFRESH_SKEW_MS) {
      refresh(localPath);
    }
  }
}

let autoRenewHandle = null;

/**
 * Start the background renewal loop. Idempotent, and a no-op outside a
 * browser context (no `window` — e.g. under `node --test` or SSR), so
 * importing this module never schedules a timer a test would have to clean
 * up itself.
 */
export function startAutoRenewal() {
  if (autoRenewHandle || typeof window === "undefined") return;
  autoRenewHandle = setInterval(() => refreshExpiringEntries(), AUTO_RENEW_INTERVAL_MS);
  // Node-style timers expose unref(); browsers' setInterval return value
  // doesn't, so guard the call rather than assume either shape.
  if (typeof autoRenewHandle.unref === "function") autoRenewHandle.unref();
}

startAutoRenewal();
