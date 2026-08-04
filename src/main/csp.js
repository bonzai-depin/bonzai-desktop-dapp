// src/main/csp.js
//
// P12 — Renderer Content-Security-Policy.
//
// The renderer previously shipped with no CSP at all and loaded Bulma from
// a CDN with no integrity check — an unrestricted script/style/connect
// surface plus an unauthenticated supply-chain dependency. This module is
// the single source of truth for the policy: one restrictive "packaged"
// policy for the built app (loaded via file://), and a "development"
// variant that adds only the fixed loopback Vite dev-server/HMR origin on
// top of it (see vite.renderer.config.ts, which pins that server to the
// same host/port so the addition below never has to be a wildcard).
//
// Delivered as a response header only (installCsp, wired in src/main.js
// before the renderer navigates) — never also as an index.html <meta> tag.
// A meta CSP and a header CSP present together are combined by the browser
// via intersection, which is easy to turn into a broken/stricter-than-
// intended policy by accident, and some directives (frame-ancestors) are
// silently ignored in a meta tag in the first place. One delivery point
// only.

// The Vite dev server and its HMR websocket always bind here (see
// vite.renderer.config.ts) — pinning host+port lets the development policy
// grant this single fixed loopback origin instead of a wildcard.
export const DEV_VITE_HOST = "127.0.0.1";
export const DEV_VITE_PORT = 5173;
export const DEV_VITE_HTTP_ORIGIN = `http://${DEV_VITE_HOST}:${DEV_VITE_PORT}`;
export const DEV_VITE_WS_ORIGIN = `ws://${DEV_VITE_HOST}:${DEV_VITE_PORT}`;

// The app's own local services (Flask diffuser, OpenClaw API, rpc-server)
// all listen on loopback-only addresses, on ports chosen at runtime/config
// (see PY_SERVER_PORT / OPENCLAW_PORT / rpc-server in main.js) — the port
// is wildcarded so this policy doesn't have to track each one, while the
// host stays pinned to loopback rather than opening up to any remote host.
const LOCAL_SERVICE_HTTP = "http://127.0.0.1:*";
const LOCAL_SERVICE_WS = "ws://127.0.0.1:*";
// The renderer's own fetch/media-stream/socket calls (RoleplayChat,
// SmartAgent, SkillDownloader, MeditationForgeSkill) address the same local
// services via the "localhost" hostname rather than its 127.0.0.1 literal.
// CSP source matching is exact on host, so both forms have to be listed —
// "localhost" is never treated as equivalent to 127.0.0.1.
const LOCAL_SERVICE_HTTP_LOCALHOST = "http://localhost:*";
const LOCAL_SERVICE_WS_LOCALHOST = "ws://localhost:*";

// The only remaining remote static dependency (R4): pinned to its exact
// origin, never a wildcard subdomain/scheme match. The matching integrity
// digest lives on the <link> tag in index.html; BULMA_INTEGRITY here is
// the same value, kept alongside the origin so tests can assert the two
// never drift apart.
export const BULMA_STYLE_ORIGIN = "https://cdn.jsdelivr.net";
export const BULMA_STYLESHEET_URL =
  "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css";
// Verified by fetching the resource and computing sha384 over the exact
// bytes served (207302 bytes, matching the published npm package size).
export const BULMA_INTEGRITY =
  "sha384-HmYpsz2Aa9Gh3JlkCoh8kUJ2mUKJKTnkyC2Lzt8aLzpPOpnDe8KpFE2xNiBpMDou";

// Custom schemes the renderer loads media/images through (protocol.handle()
// registrations in main.js). Never granted to script-src/object-src.
const CUSTOM_MEDIA_SCHEMES = ["bonzai-blob:", "local-video:", "app:"];

// Order is preserved on serialization; keep it stable so PACKAGED_CSP is
// deterministic across process runs (tests assert against parsed output,
// not string equality, but a stable order still makes diffs readable).
const PACKAGED_DIRECTIVES = Object.freeze({
  "default-src": ["'none'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", BULMA_STYLE_ORIGIN],
  // style-src governs style *attributes* too as long as style-src-attr is
  // absent, but per-directive fallback stops once style-src-attr is given
  // explicitly — so it's split out here rather than adding 'unsafe-inline'
  // to style-src itself, which would also (unnecessarily) allow injected
  // <style> blocks/sheets in the packaged build. The renderer's Vue
  // templates bind many inline style="..." attributes (App.vue's
  // notification controls and theme swatches, among others) that have no
  // digest/nonce to allowlist them by instead.
  "style-src-attr": ["'unsafe-inline'"],
  // https: covers avatar/media URLs the renderer resolves to remote
  // gateways before use (e.g. App.vue rewriting ipfs:// UP avatars to
  // https://api.universalprofile.cloud/...); the loopback additions cover
  // RoleplayChat/MeditationForgeSkill's generated-image previews served
  // from the local Flask media-stream endpoint -- both the "localhost" and
  // "127.0.0.1" host forms, since CSP source matching is exact on host and
  // 127.0.0.1 is the default API_BASE the renderer's signed-media-URL
  // helper (src/services/media.service.js) resolves against.
  "img-src": ["'self'", "data:", "blob:", "https:", LOCAL_SERVICE_HTTP, LOCAL_SERVICE_HTTP_LOCALHOST, ...CUSTOM_MEDIA_SCHEMES],
  "font-src": ["'self'", "data:"],
  // data: covers MintModal's base64 video preview src; the loopback
  // additions cover RoleplayChat/MeditationForgeSkill's generated
  // audio/video served from the local Flask media-stream endpoint (both
  // host forms -- see img-src above).
  "media-src": ["'self'", "data:", "blob:", LOCAL_SERVICE_HTTP, LOCAL_SERVICE_HTTP_LOCALHOST, ...CUSTOM_MEDIA_SCHEMES],
  // 'self' plus the app's own loopback services; https:/wss: cover the
  // many third-party chain RPC / wallet / social APIs the renderer talks
  // to directly (see .env.example), scoped by scheme (blocks plaintext
  // http to remote hosts, blocks data:/blob: exfiltration channels) since
  // those hosts are numerous, partly user/env-configured, and not owned
  // by this app the way the loopback services and Bulma CDN are.
  "connect-src": [
    "'self'",
    LOCAL_SERVICE_HTTP,
    LOCAL_SERVICE_WS,
    LOCAL_SERVICE_HTTP_LOCALHOST,
    LOCAL_SERVICE_WS_LOCALHOST,
    "https:",
    "wss:",
  ],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  // MintModal's 3D mint preview renders into an iframe whose src is a
  // blob: URL created via URL.createObjectURL — the only iframe in the
  // renderer. Scoped to the blob: scheme only, not 'self', so no other
  // same-origin document can be framed.
  "frame-src": ["blob:"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
});

function cloneDirectives(directives) {
  const clone = {};
  for (const [name, values] of Object.entries(directives)) clone[name] = [...values];
  return clone;
}

function serializeCsp(directives) {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

// Development gets the packaged directives plus the fixed Vite/HMR origin
// on connect-src, and 'unsafe-inline' scoped to style-src only (never
// script-src — R5). The latter is a Vite dev-mode fact, not a loopback
// grant: `vite build` extracts real .css files loaded via <link> (what
// style-src's CDN/'self' allowlist already covers), but the dev server
// injects component styles via <style> elements it creates at runtime, so
// there is no digest/nonce to allowlist them by in this mode.
function buildDevDirectives() {
  const dev = cloneDirectives(PACKAGED_DIRECTIVES);
  dev["connect-src"] = [...dev["connect-src"], DEV_VITE_HTTP_ORIGIN, DEV_VITE_WS_ORIGIN];
  dev["style-src"] = [...dev["style-src"], "'unsafe-inline'"];
  return dev;
}

const DEV_DIRECTIVES = Object.freeze(buildDevDirectives());

export const PACKAGED_CSP = serializeCsp(PACKAGED_DIRECTIVES);
export const DEV_CSP = serializeCsp(DEV_DIRECTIVES);

export function getPolicyDirectives({ isPackaged }) {
  return isPackaged ? PACKAGED_DIRECTIVES : DEV_DIRECTIVES;
}

export function getPolicyString({ isPackaged }) {
  return isPackaged ? PACKAGED_CSP : DEV_CSP;
}

// Parses a "name val1 val2; name2 val1" CSP string back into
// { name: [values] } — used by tests to assert on structure rather than
// exact string formatting.
export function parseCsp(policy) {
  const map = {};
  for (const part of policy.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    map[name] = values;
  }
  return map;
}

// Simplified single-directive source matcher, covering just what this
// policy actually uses ('none', 'self', 'unsafe-inline', exact origins,
// bare schemes like "https:", and custom URL schemes like "bonzai-blob:").
// `candidate` is either an absolute origin ("https://evil.example.com"),
// the literal "inline" (to test unsafe-inline gating), or a bare scheme
// ("https:"). Not a full CSP engine — just enough to let tests assert the
// policy denies what it's supposed to deny.
export function directiveAllowsOrigin(values, candidate) {
  if (!values || values.length === 0) return false;
  if (values.includes("'none'")) return false;
  if (candidate === "inline") return values.includes("'unsafe-inline'");
  if (values.includes(candidate)) return true;
  const scheme = candidate.includes("://") ? `${candidate.split("://")[0]}:` : candidate;
  if (values.includes(scheme)) return true;
  return false;
}

// True only for the app's own renderer document: file:// in the packaged
// build, or the pinned Vite dev-server origin in development. installCsp is
// wired on session.defaultSession (main.js), which every unpartitioned
// BrowserWindow shares — including the bonzai.sh/wallet BrowserView and the
// third-party social-OAuth popup windows, neither of which sets its own
// session partition. Without this check, this renderer-only policy would
// overwrite those windows' own CSPs on every top-level navigation, which
// can break their scripts/styles and the auth/wallet flows that depend on
// them. resourceType alone can't distinguish them — they're mainFrame loads
// too — so the URL has to be checked as well.
function isOwnRendererDocument(url, { isPackaged }) {
  if (typeof url !== "string") return false;
  if (isPackaged) return url.startsWith("file://");
  return url.startsWith(DEV_VITE_HTTP_ORIGIN);
}

// Installs the response-header CSP on `targetSession` for the renderer's
// own top-level document loads only (never subresources — CSP response
// headers on non-document responses are meaningless to the browser and
// would just be pointless overhead here — and never other windows sharing
// this session, see isOwnRendererDocument above). Must be called before the
// window navigates (R2) so the very first document response already
// carries the policy.
export function installCsp(targetSession, { isPackaged }) {
  const policy = getPolicyString({ isPackaged });
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== "mainFrame" || !isOwnRendererDocument(details.url, { isPackaged })) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const headers = { ...details.responseHeaders };
    // Strip any pre-existing CSP (there shouldn't be one — no meta tag,
    // nothing upstream sets it — but defend against a future accidental
    // second source rather than silently intersecting with it).
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "content-security-policy") delete headers[key];
    }
    headers["Content-Security-Policy"] = [policy];
    callback({ responseHeaders: headers });
  });
  return policy;
}
