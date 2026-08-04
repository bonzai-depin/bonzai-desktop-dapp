/**
 * Signed /media/stream URLs (R1-R3 Security).
 *
 * HTML <img>/<video>/<audio> elements cannot attach the desktop session
 * header (x-bonzai-session) the Flask inference server otherwise requires,
 * so local media paths must instead be resolved through the main process's
 * media:sign-url IPC (P2 sender-validated, P4 path-contained) into a
 * short-lived (60s) signature carried in the query string. Components must
 * use `signedMediaStreamSrc` below rather than concatenating a raw,
 * unauthenticated `${API_BASE}/media/stream?path=...` URL.
 */

import { reactive, nextTick } from "vue";

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

// Refresh a few seconds before the 60s server-side TTL actually lapses, so a
// slow render never races a signature that has just expired server-side.
const REFRESH_SKEW_MS = 10_000;

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
// <video> bound to the old URL sees its `src` attribute change and the
// browser reloads the resource from byte 0, killing in-progress playback.
// Snapshot playback position/state for elements bound to `localPath` before
// the cache update lands, then restore it once they've picked up the new src.
function applyRenewedEntry(localPath, entry) {
  const bound = boundMediaElements(localPath).map((el) => ({
    el,
    time: el.currentTime,
    wasPlaying: !el.paused && !el.ended,
  }));
  cache.set(localPath, entry);
  if (!bound.length) return;
  nextTick(() => {
    for (const { el, time, wasPlaying } of bound) {
      const resume = () => {
        el.currentTime = time;
        if (wasPlaying) el.play().catch(() => {});
      };
      if (el.readyState >= 1) resume();
      else el.addEventListener("loadedmetadata", resume, { once: true });
    }
  });
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
