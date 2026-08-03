// src/main/egressPolicy.js
//
// P8 — Per-integration outbound (egress) policy for social:api-call,
// social:media-upload, and proxy:fetch (all wired in main.js).
//
// Previously those three handlers forwarded a caller-supplied URL and
// headers straight to `fetch` with no allowlist — a renderer (or anything
// that can reach it, e.g. an XSS in a companion-rendered page) could make
// the main process issue arbitrary HTTPS requests, including to loopback,
// RFC1918, link-local, and cloud metadata addresses (SSRF), and could set
// arbitrary headers (Host/Cookie/Proxy-Authorization/Authorization) on
// those requests.
//
// This module is the single choke point every outbound call now goes
// through:
//   - Immutable per-integration policies (`SOCIAL_POLICIES`, keyed by
//     platform+action; `PROXY_INTEGRATIONS`, keyed by hostname) declare
//     the only allowed origin/path-prefix/method combinations.
//   - `performEgressRequest` validates the target against that policy,
//     resolves DNS itself, rejects any answer that lands in a private/
//     loopback/link-local/unique-local/metadata range, and pins the actual
//     TCP connection to the exact address it just validated (via a custom
//     `dns.lookup` handed to the HTTP client) so a second, different DNS
//     answer at connect time (rebinding) can never be used.
//   - Redirects are never followed automatically (`redirect: "manual"`);
//     each hop is re-validated against the same policy before it is
//     followed, up to a small hop limit.
//   - Headers are allowlisted per route, not blocklisted: Host, cookies,
//     Proxy-Authorization, and anything not on that route's explicit list
//     are stripped unconditionally. Authorization is either passed through
//     from the caller (only for routes that declare `authFrom:
//     "callerHeader"` — the token the renderer already holds via the
//     platform's own OAuth flow) or built by this module from a vetted,
//     non-header field (`authFrom: "accessTokenField"`, used by media
//     upload) — never both, and never anything else.
//
// No Electron imports here — pure functions plus injectable I/O seams
// (`lookup`, `fetchImpl`, `buildDispatcher`) so this is unit-testable
// under `node --test` without a real network or a real Electron runtime.

import dns from "node:dns";
import { isIP, BlockList } from "node:net";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class EgressPolicyError extends Error {
  constructor(message, code = "EGRESS_DENIED") {
    super(message);
    this.name = "EgressPolicyError";
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocked address ranges (loopback / private / unique-local / link-local /
// metadata). Built on node:net's BlockList rather than hand-rolled CIDR
// parsing, so range matching itself is Node's well-tested implementation.
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKED_IPV4_SUBNETS = [
  ["0.0.0.0", 8],       // "this network"
  ["10.0.0.0", 8],      // RFC1918
  ["100.64.0.0", 10],   // carrier-grade NAT
  ["127.0.0.0", 8],     // loopback
  ["169.254.0.0", 16],  // link-local (covers 169.254.169.254 cloud metadata)
  ["172.16.0.0", 12],   // RFC1918
  ["192.0.0.0", 24],    // IETF protocol assignments
  ["192.168.0.0", 16],  // RFC1918
  ["198.18.0.0", 15],   // benchmarking
  ["224.0.0.0", 4],     // multicast
  ["240.0.0.0", 4],     // reserved / broadcast
];

const BLOCKED_IPV4_ADDRESSES = [
  "100.100.100.200", // Alibaba Cloud metadata
];

// NOTE: deliberately no ::ffff:0:0/96 (IPv4-mapped) subnet rule here — Node's
// BlockList.check("ipv4") for some IPv4 addresses matches against IPv4-mapped
// IPv6 subnet rules too, which made adding that subnet block *every* IPv4
// address, not just the mapped range. IPv4-mapped literals are instead
// unwrapped and checked against the IPv4 rules explicitly below.
const BLOCKED_IPV6_SUBNETS = [
  ["::1", 128],       // loopback
  ["::", 128],         // unspecified
  ["fc00::", 7],       // unique-local
  ["fe80::", 10],      // link-local
  ["64:ff9b::", 96],   // NAT64 well-known prefix
  ["2001:db8::", 32],  // documentation range, never a real destination
];

const BLOCKED_IPV6_ADDRESSES = [
  "fd00:ec2::254", // AWS IMDSv6 (also covered by fc00::/7, kept explicit)
];

let cachedBlockList = null;
function getBlockList() {
  if (cachedBlockList) return cachedBlockList;
  const list = new BlockList();
  for (const [addr, prefix] of BLOCKED_IPV4_SUBNETS) list.addSubnet(addr, prefix, "ipv4");
  for (const addr of BLOCKED_IPV4_ADDRESSES) list.addAddress(addr, "ipv4");
  for (const [addr, prefix] of BLOCKED_IPV6_SUBNETS) list.addSubnet(addr, prefix, "ipv6");
  for (const addr of BLOCKED_IPV6_ADDRESSES) list.addAddress(addr, "ipv6");
  cachedBlockList = list;
  return list;
}

const IPV4_MAPPED_RE = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/** True iff `address` is a loopback/private/unique-local/link-local/metadata
 * literal, or simply not a valid IP. Handles IPv4-mapped IPv6 by also
 * checking the embedded IPv4 address against the IPv4 rules. */
export function isBlockedIpAddress(address) {
  const family = isIP(address);
  if (family === 0) return true; // not a valid literal — never a safe pin target
  const blockList = getBlockList();
  if (family === 4) return blockList.check(address, "ipv4");
  const mapped = address.match(IPV4_MAPPED_RE);
  if (mapped && blockList.check(mapped[1], "ipv4")) return true;
  return blockList.check(address, "ipv6");
}

// ─────────────────────────────────────────────────────────────────────────────
// Immutable per-integration policies
// ─────────────────────────────────────────────────────────────────────────────

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

// Headers every route may inject itself, regardless of caller input. These
// can never be overridden by the caller — sanitizeRequestHeaders applies
// them last.
const DEFAULT_INJECTED_HEADERS = { Accept: "application/json", "User-Agent": "BonzAI/1.0" };

// Headers a caller can never set, no matter what a route allowlists.
const ALWAYS_STRIPPED_HEADERS = new Set([
  "host",
  "cookie",
  "proxy-authorization",
  "content-length",
  "transfer-encoding",
  "connection",
  "upgrade",
]);

/**
 * The social platforms currently wired through social:api-call /
 * social:media-upload (see src/services/social/*.adapter.js and
 * src/config/social.platforms.config.js). `authFrom`:
 *   - "callerHeader": the renderer already obtained this exact bearer token
 *     from main-process-managed storage via social:get-credentials moments
 *     earlier in the same flow; passthrough is allowed because the token's
 *     scope is the request's own destination, not a foreign one — the URL
 *     itself is now locked to the platform's real API origin.
 *   - "accessTokenField": the Authorization header is built by this module
 *     from the dedicated `accessToken` field, never from a caller-supplied
 *     headers object (media-upload's IPC shape has no headers param at all).
 */
export const SOCIAL_POLICIES = deepFreeze({
  instagram: {
    apiCall: {
      name: "social:instagram:apiCall",
      routes: [
        {
          origin: "https://graph.facebook.com",
          pathPrefix: "/v21.0/",
          methods: ["GET", "POST", "DELETE"],
          allowedHeaders: ["content-type"],
          authFrom: "callerHeader",
        },
      ],
    },
    mediaUpload: {
      name: "social:instagram:mediaUpload",
      // No route: the temporary file:// hosting result has been removed
      // (it violated the outbound boundary — R6). Instagram's Graph API
      // requires a publicly reachable image_url; this app has no CDN, so
      // the handler now always denies before any fetch.
      routes: [],
    },
  },
  tiktok: {
    apiCall: {
      name: "social:tiktok:apiCall",
      routes: [
        {
          origin: "https://open.tiktokapis.com",
          pathPrefix: "/v2/",
          methods: ["GET", "POST"],
          allowedHeaders: ["content-type"],
          authFrom: "callerHeader",
        },
      ],
    },
    mediaUpload: {
      name: "social:tiktok:mediaUpload",
      routes: [
        {
          // TikTok's Content Posting API returns a session-specific
          // upload_url on this fixed host at init time; the path segment
          // is opaque/dynamic, so only the host is pinned.
          origin: "https://open-upload.tiktokapis.com",
          pathPrefix: "/",
          methods: ["POST"],
          allowedHeaders: [],
          authFrom: "accessTokenField",
        },
      ],
    },
  },
  x: {
    apiCall: {
      name: "social:x:apiCall",
      routes: [
        {
          origin: "https://api.twitter.com",
          pathPrefix: "/2/",
          methods: ["GET", "POST", "DELETE"],
          allowedHeaders: ["content-type"],
          authFrom: "callerHeader",
        },
        {
          origin: "https://upload.twitter.com",
          pathPrefix: "/1.1/media/",
          methods: ["GET", "POST"],
          allowedHeaders: ["content-type"],
          authFrom: "callerHeader",
        },
      ],
    },
    mediaUpload: {
      name: "social:x:mediaUpload",
      routes: [
        {
          origin: "https://upload.twitter.com",
          pathPrefix: "/1.1/media/",
          methods: ["POST"],
          allowedHeaders: [],
          authFrom: "accessTokenField",
        },
      ],
    },
  },
});

export const SOCIAL_PLATFORMS = Object.freeze(Object.keys(SOCIAL_POLICIES));

/**
 * proxy:fetch has no `platform` field — it forwards any URL a caller hands
 * it. Since removing that is the point of this step, the "integration" is
 * derived from the URL's hostname against this fixed table instead. Any
 * hostname not listed here is an unknown integration and is denied before
 * any DNS lookup or fetch.
 */
export const PROXY_INTEGRATIONS = deepFreeze({
  "api.coingecko.com": {
    name: "proxy:coingecko",
    routes: [
      {
        origin: "https://api.coingecko.com",
        pathPrefix: "/api/v3/",
        methods: ["GET"],
        allowedHeaders: [],
        authFrom: "none",
      },
    ],
  },
  "gamma-api.polymarket.com": {
    name: "proxy:polymarket-gamma",
    routes: [
      {
        origin: "https://gamma-api.polymarket.com",
        pathPrefix: "/",
        methods: ["GET"],
        allowedHeaders: [],
        authFrom: "none",
      },
    ],
  },
  "data-api.polymarket.com": {
    name: "proxy:polymarket-data",
    routes: [
      {
        origin: "https://data-api.polymarket.com",
        pathPrefix: "/",
        methods: ["GET"],
        allowedHeaders: [],
        authFrom: "none",
      },
    ],
  },
  "clob.polymarket.com": {
    name: "proxy:polymarket-clob",
    routes: [
      {
        origin: "https://clob.polymarket.com",
        pathPrefix: "/prices",
        methods: ["GET"],
        allowedHeaders: [],
        authFrom: "none",
      },
    ],
  },
  "www.moltbook.com": {
    name: "proxy:moltbook",
    routes: [
      {
        origin: "https://www.moltbook.com",
        pathPrefix: "/api/v1/",
        methods: ["GET", "POST", "PATCH", "DELETE"],
        allowedHeaders: ["content-type"],
        // Moltbook's own agent API key, obtained during registration and
        // held by the renderer already — same rationale as social's
        // "callerHeader" platforms.
        authFrom: "callerHeader",
      },
    ],
  },
});

export const PROXY_HOSTS = Object.freeze(Object.keys(PROXY_INTEGRATIONS));

export function resolveSocialPolicy(platform, action) {
  const forPlatform = SOCIAL_POLICIES[platform];
  if (!forPlatform) return null;
  return forPlatform[action] || null;
}

export function resolveProxyPolicy(rawUrl) {
  let hostname;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    return null;
  }
  return PROXY_INTEGRATIONS[hostname] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Target + header validation
// ─────────────────────────────────────────────────────────────────────────────

function matchRoute(policy, parsedUrl, method) {
  const upperMethod = String(method || "GET").toUpperCase();
  for (const route of policy.routes) {
    if (route.origin !== parsedUrl.origin) continue;
    if (!parsedUrl.pathname.startsWith(route.pathPrefix)) continue;
    if (!route.methods.includes(upperMethod)) continue;
    return route;
  }
  return null;
}

/** Parse + validate a target URL against a policy. Never touches the
 * network — scheme/credential/origin/path/method checks only, so an
 * unknown integration or disallowed target is rejected before any DNS
 * lookup or fetch (R1/R2). */
export function validateTargetUrl(rawUrl, policy, method) {
  if (!policy) throw new EgressPolicyError("Unknown integration", "UNKNOWN_INTEGRATION");

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new EgressPolicyError("Malformed URL", "INVALID_URL");
  }

  if (parsed.protocol !== "https:") {
    throw new EgressPolicyError(`Only HTTPS destinations are permitted, got ${parsed.protocol}`, "INVALID_SCHEME");
  }
  if (parsed.username || parsed.password) {
    throw new EgressPolicyError("URL credentials are not permitted", "URL_CREDENTIALS");
  }

  const route = matchRoute(policy, parsed, method);
  if (!route) {
    throw new EgressPolicyError(
      `Target not permitted by ${policy.name}: ${parsed.origin}${parsed.pathname} [${String(method || "GET").toUpperCase()}]`,
      "TARGET_NOT_ALLOWED",
    );
  }

  return { parsed, route };
}

/** Allowlist headers per route, always stripping Host/Cookie/
 * Proxy-Authorization/Authorization (unless the route explicitly wants
 * caller Authorization) and anything not explicitly allowed, then apply
 * main-process-injected headers last so they can never be overridden. */
export function sanitizeRequestHeaders(callerHeaders, route, injectedHeaders = {}) {
  const allow = new Set((route.allowedHeaders || []).map((h) => h.toLowerCase()));
  const out = {};
  for (const [key, value] of Object.entries(callerHeaders || {})) {
    if (value === undefined || value === null) continue;
    const lower = key.toLowerCase();
    if (ALWAYS_STRIPPED_HEADERS.has(lower)) continue;
    if (lower === "authorization") {
      if (route.authFrom !== "callerHeader") continue;
    } else if (!allow.has(lower)) {
      continue;
    }
    out[key] = value;
  }
  Object.assign(out, DEFAULT_INJECTED_HEADERS, injectedHeaders);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// DNS resolution + blocked-range enforcement
// ─────────────────────────────────────────────────────────────────────────────

async function defaultLookup(hostname, options) {
  return dns.promises.lookup(hostname, options);
}

// URL#hostname keeps the enclosing brackets for an IPv6 host (e.g. "[::1]"),
// which net.isIP/dns.lookup do not understand — unwrap before checking.
function unwrapIPv6Brackets(hostname) {
  if (hostname.length > 1 && hostname[0] === "[" && hostname[hostname.length - 1] === "]") {
    return hostname.slice(1, -1);
  }
  return hostname;
}

async function resolveHostAddresses(hostname, lookup) {
  const bare = unwrapIPv6Brackets(hostname);
  const literalFamily = isIP(bare);
  if (literalFamily) return [{ address: bare, family: literalFamily }];

  const results = await lookup(bare, { all: true, verbatim: true });
  if (!Array.isArray(results) || results.length === 0) {
    throw new EgressPolicyError(`DNS resolution failed for ${hostname}`, "DNS_FAILURE");
  }
  return results;
}

/** Resolve `hostname`, reject if ANY answer (or the literal itself) falls in
 * a blocked range — a mixed answer set (some public, some private) is
 * treated as fully unsafe rather than picking the "nice" one, since an
 * attacker controlling the answer order/selection could otherwise steer a
 * retried request onto the private address (rebinding). Returns the first
 * address, which the caller pins the actual connection to. */
async function assertResolvableAndSafe(hostname, lookup) {
  const addresses = await resolveHostAddresses(hostname, lookup);
  for (const { address } of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new EgressPolicyError(
        `Resolved address for ${hostname} is in a blocked range: ${address}`,
        "BLOCKED_ADDRESS",
      );
    }
  }
  return addresses[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pinned dispatcher (prevents DNS-rebinding between validation and connect)
// ─────────────────────────────────────────────────────────────────────────────

function defaultBuildDispatcher(pinnedAddress, pinnedFamily) {
  return new UndiciAgent({
    connect: {
      lookup: (hostname, options, callback) => {
        if (typeof options === "function") {
          callback = options;
          options = {};
        }
        if (options && options.all) {
          callback(null, [{ address: pinnedAddress, family: pinnedFamily }]);
        } else {
          callback(null, pinnedAddress, pinnedFamily);
        }
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;

/** Cancel a response body we're discarding (redirects we follow internally,
 * never returned to the caller) so it doesn't sit unread — an unread body
 * keeps its underlying agent/socket alive through Undici's graceful close. */
async function discardResponseBody(response) {
  try {
    if (response?.body && typeof response.body.cancel === "function") {
      await response.body.cancel();
    } else if (response && typeof response.arrayBuffer === "function") {
      await response.arrayBuffer();
    }
  } catch {
    // Best-effort cleanup only; a failed cancel/drain shouldn't block redirect handling.
  }
}

/**
 * Validate + perform one egress request under `policy`, following redirects
 * manually (never automatically) and re-validating + re-resolving every hop
 * against the same policy. Throws EgressPolicyError before any DNS lookup or
 * fetch for anything the policy doesn't allow. Returns a fetch-style
 * Response (from `fetchImpl`, default undici's `fetch`).
 *
 * `deps` is an injection seam for tests: `lookup` replaces DNS resolution,
 * `fetchImpl` replaces the network call (a spy can assert it's never
 * invoked for denied requests), `buildDispatcher` replaces the pinned
 * connector (irrelevant once `fetchImpl` is faked).
 */
export async function performEgressRequest(request, deps = {}) {
  const { policy, url, method, headers = {}, body, accessToken } = request || {};
  const {
    lookup = defaultLookup,
    fetchImpl = undiciFetch,
    buildDispatcher = defaultBuildDispatcher,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
  } = deps;

  if (!policy || !Array.isArray(policy.routes)) {
    throw new EgressPolicyError("Unknown integration", "UNKNOWN_INTEGRATION");
  }

  let currentUrl = url;
  let currentMethod = String(method || "GET").toUpperCase();
  let currentBody = body;

  for (let hop = 0; ; hop++) {
    const { parsed, route } = validateTargetUrl(currentUrl, policy, currentMethod);
    const pinned = await assertResolvableAndSafe(parsed.hostname, lookup);

    const injected = {};
    if (route.authFrom === "accessTokenField" && accessToken) {
      injected.Authorization = `Bearer ${accessToken}`;
    }
    const finalHeaders = sanitizeRequestHeaders(headers, route, injected);

    const init = { method: currentMethod, headers: finalHeaders, redirect: "manual" };
    if (currentBody !== undefined && currentMethod !== "GET" && currentMethod !== "HEAD") {
      init.body = currentBody;
    }

    const dispatcher = buildDispatcher ? buildDispatcher(pinned.address, pinned.family, parsed.hostname) : null;
    if (dispatcher) init.dispatcher = dispatcher;

    let response;
    try {
      response = await fetchImpl(parsed.toString(), init);
    } finally {
      if (dispatcher && typeof dispatcher.close === "function") {
        dispatcher.close().catch(() => {});
      }
    }

    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers?.get ? response.headers.get("location") : null;
    if (!location) return response;

    // This redirect response's body is never handed to the caller (we only
    // follow Location), so it must be cancelled here — otherwise it's left
    // unread and Undici's graceful dispatcher.close() above (which waits
    // for active requests to finish) can never resolve, retaining this
    // hop's agent and socket. A slow/unbounded body compounds that across
    // repeated redirected requests.
    await discardResponseBody(response);

    if (hop >= maxRedirects) {
      throw new EgressPolicyError("Too many redirects", "TOO_MANY_REDIRECTS");
    }

    currentUrl = new URL(location, parsed).toString();
    const preserveMethod = currentMethod === "GET" || currentMethod === "HEAD";
    if (response.status === 303 || (!preserveMethod && (response.status === 301 || response.status === 302))) {
      currentMethod = "GET";
      currentBody = undefined;
    }
    // 307/308 (and GET/HEAD redirected by 301/302) keep method + body, and
    // loop back to re-validate + re-resolve the new URL against `policy`
    // before it is ever fetched (R4).
  }
}
