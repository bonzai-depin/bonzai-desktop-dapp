"""
BonzAI inference-server security primitives.

Loopback-only binding, trusted-origin CORS, central request authentication,
and real EIP-191 (personal_sign) wallet-challenge verification.

This module is deliberately dependency-light (stdlib + Flask + eth-account) so
it can be imported and unit-tested without the torch/diffusers stack that
``src/server/diffuser.py`` pulls in. ``diffuser.py`` wires these primitives
into its Flask app and Socket.IO server; the response shapes for valid
clients are unchanged.

Threat model
------------
The inference server binds to loopback only. Authentication is a per-launch
scoped credential delivered by the Electron main process through the
environment (``BONZAI_SESSION_CREDENTIAL``) — sufficient on its own for local,
wallet-optional creation — plus optional wallet JWTs for economy features.
Wallet sign-in verifies a real signature over an HMAC-protected, single-use
challenge. No level is ever fabricated; economy gating belongs to the
configured chain, never a server default.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from typing import Optional

from eth_account import Account
from eth_account.messages import encode_defunct
from eth_utils import to_checksum_address
from flask import Flask, jsonify, request

# ─────────────────────────────────────────────────────────────────────────────
# Configuration knobs — every value is env-driven; no hardcoded prod secret.
# ─────────────────────────────────────────────────────────────────────────────

# R1: loopback-only default host, non-privileged default port.
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 65000

# P5: workflow orchestrator (src/server/orchestrator.py) bind/origin env vars.
# A distinct env-var namespace from the inference server so the two local
# Flask processes can be configured independently; the default port (5000)
# is the port orchestrator.py already bound to (Flask's implicit default
# from the pre-hardening `app.run(debug=True)` call).
ORCHESTRATOR_HOST_ENV = "BONZAI_ORCHESTRATOR_HOST"
ORCHESTRATOR_PORT_ENV = "BONZAI_ORCHESTRATOR_PORT"
ORCHESTRATOR_TRUSTED_ORIGINS_ENV = "BONZAI_ORCHESTRATOR_TRUSTED_ORIGINS"
ORCHESTRATOR_DEFAULT_PORT = 5000

# R2: the legacy default Flask signing secret we must refuse to run with.
DEFAULT_FLASK_SECRET = "bonzai-secret-key"

# Environment variable names (documented without values in .env.example).
SERVER_HOST_ENV = "BONZAI_SERVER_HOST"
SERVER_PORT_ENV = "BONZAI_SERVER_PORT"
TRUSTED_ORIGINS_ENV = "BONZAI_TRUSTED_ORIGINS"
FLASK_SECRET_ENV = "SECRET_KEY"                  # Electron-supplied signing secret.
SESSION_CREDENTIAL_ENV = "BONZAI_SESSION_CREDENTIAL"  # scoped local credential.
SESSION_EXPIRES_ENV = "BONZAI_SESSION_EXPIRES"   # epoch-second credential expiry.
JWT_SECRET_ENV = "BONZAI_JWT_SECRET"             # persisted wallet-JWT secret.
HMAC_SECRET_ENV = "BONZAI_HMAC_SECRET"           # challenge MAC secret.
MEDIA_SIGNING_SECRET_ENV = "BONZAI_MEDIA_SIGNING_SECRET"  # short-lived media-URL HMAC secret.

# R3: the ONLY paths reachable without authentication. Everything else on the
# Flask URL map is covered by the before_request guard installed by
# install_security(), so it requires the desktop session credential and/or a
# valid wallet access JWT.
#
# /auth/refresh and /auth/logout are public because they are reachable from
# the production client without the desktop session credential: the renderer's
# refreshToken() sends only the HttpOnly refresh cookie (the refresh JWT is
# verified by the handler), and logout() clears its in-memory credential
# before issuing the cookie-clearing request. Guarding them returned 401 and
# left the refresh cookie intact.
PUBLIC_PATHS = frozenset({"/auth/challenge", "/auth/verify", "/auth/refresh", "/auth/logout"})

# B2/B3/B6/B7: HTML media elements (<img>/<video>/<audio>) cannot attach the
# x-bonzai-session header, so these two routes ALSO accept a short-lived HMAC
# signature carried in the query string (see media_signature_valid below).
# The signature only ever substitutes for authentication -- resolve_media_path
# in diffuser.py still applies the full P4 containment check to every request,
# signed or not.
MEDIA_SIGNED_PATHS = frozenset({"/media/stream", "/media/info"})
MEDIA_SIGNED_URL_TTL = 300  # seconds (R4: matches MEDIA_SIGNED_URL_TTL_SECONDS in src/main.js).

# R1: trusted renderer origins. No wildcard; credentials are only ever attached
# to an exact/prefix match against one of these. Override via BONZAI_TRUSTED_ORIGINS.
DEFAULT_TRUSTED_ORIGINS = (
    "http://localhost:5173",   # Vite dev server
    "http://127.0.0.1:5173",
    "app://.",                 # packaged Electron renderer scheme
    "file://",                 # packaged Electron renderer (file:// path)
    "null",                    # opaque Origin Chromium emits for the packaged
                               # file:// renderer (loadFile cross-origin)
)

# R4: x-bonzai-session is sent cross-origin by the P2 client, so it MUST be in
# the CORS allow-headers list or the browser preflight rejects it.
CORS_ALLOW_HEADERS = ("Content-Type", "Authorization", "X-Requested-With", "x-bonzai-session")
CORS_ALLOW_METHODS = ("GET", "POST", "PUT", "DELETE", "OPTIONS")

ACCESS_TOKEN_EXPIRY = 48 * 60 * 60        # 48 hours
REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60   # 7 days
CHALLENGE_EXPIRY = 300                     # 5 minutes


# ─────────────────────────────────────────────────────────────────────────────
# Server bind / origin configuration (R1)
# ─────────────────────────────────────────────────────────────────────────────

def _is_loopback(host: str) -> bool:
    """True for IPv4/IPv6/hostname loopback only."""
    return host in {"localhost", "::1", "0:0:0:0:0:0:0:1"} or host.startswith("127.")


def get_server_host(env: Optional[dict] = None, env_var: str = SERVER_HOST_ENV,
                     default: str = DEFAULT_HOST) -> str:
    """Loopback-only bind host.

    The default is loopback and any non-loopback value (including ``0.0.0.0``)
    is coerced back to ``127.0.0.1`` so the server never binds all interfaces,
    even under misconfiguration (R1). ``env_var``/``default`` let other local
    services (e.g. the orchestrator's ``BONZAI_ORCHESTRATOR_HOST``) reuse this
    same loopback-enforcing logic under their own env var.
    """
    env = env if env is not None else os.environ
    host = (env.get(env_var) or default).strip().lower()
    if not host or not _is_loopback(host):
        return default
    return "127.0.0.1" if host == "localhost" else host


def get_server_port(env: Optional[dict] = None, env_var: str = SERVER_PORT_ENV,
                     default: int = DEFAULT_PORT) -> int:
    env = env if env is not None else os.environ
    try:
        port = int(env.get(env_var) or default)
    except (TypeError, ValueError):
        return default
    return port if 0 < port < 65536 else default


def get_trusted_origins(env: Optional[dict] = None, env_var: str = TRUSTED_ORIGINS_ENV) -> list:
    """Trusted origins, never containing a wildcard.

    A wildcard would re-enable credentialed CORS for every origin, so any '*'
    in the configured value is dropped and we fall back to the loopback
    defaults rather than fail open.
    """
    env = env if env is not None else os.environ
    raw = (env.get(env_var) or "").strip()
    if not raw:
        return list(DEFAULT_TRUSTED_ORIGINS)
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    origins = [o for o in origins if o != "*"]
    return origins or list(DEFAULT_TRUSTED_ORIGINS)


# ─────────────────────────────────────────────────────────────────────────────
# Startup secret validation (R2) — fail fast; never log the values.
# ─────────────────────────────────────────────────────────────────────────────

def is_default_flask_secret(secret: Optional[str]) -> bool:
    return not secret or secret == DEFAULT_FLASK_SECRET


def validate_startup_secrets(env: Optional[dict] = None) -> None:
    """Raise RuntimeError if the server cannot start securely.

    Requires a non-default Flask signing secret and the Electron-supplied
    scoped local credential. Both are delivered by the Electron main process
    via the environment; neither is ever logged. Standalone runs must set
    them (see .env.example).
    """
    env = env if env is not None else os.environ
    if is_default_flask_secret(env.get(FLASK_SECRET_ENV)):
        raise RuntimeError(
            f"{FLASK_SECRET_ENV} must be set to a non-default secret "
            f"(the bundled '{DEFAULT_FLASK_SECRET}' default is refused)"
        )
    if not env.get(SESSION_CREDENTIAL_ENV):
        raise RuntimeError(
            f"{SESSION_CREDENTIAL_ENV} must be set to the Electron-supplied "
            f"scoped local credential (it is consumed, never logged)"
        )
    # The credential's expiry must travel with it so Flask can reject a stolen
    # credential once its declared lifetime elapses (the registry limits it to
    # 24h; without this Flask would accept it for the life of the process).
    if not env.get(SESSION_EXPIRES_ENV):
        raise RuntimeError(
            f"{SESSION_EXPIRES_ENV} must be set to the credential's "
            f"epoch-second expiry (delivered with the credential, never logged)"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Constant-time comparison helpers
# ─────────────────────────────────────────────────────────────────────────────

def const_time_str_eq(a: Optional[str], b: Optional[str]) -> bool:
    """Constant-time string compare that fails closed on None / length mismatch.

    A same-length self-comparison still runs on the mismatch path so the two
    branches take roughly equal time, avoiding a length-based oracle on the
    secret.
    """
    if a is None or b is None:
        return False
    ab = a.encode("utf-8") if isinstance(a, str) else bytes(a)
    bb = b.encode("utf-8") if isinstance(b, str) else bytes(b)
    if len(ab) != len(bb):
        hmac.compare_digest(ab, ab)
        return False
    return hmac.compare_digest(ab, bb)


def session_credential_active(env: Optional[dict] = None) -> bool:
    """True iff the env-declared credential expiry is still in the future.

    The Electron registry delivers ``BONZAI_SESSION_EXPIRES`` (epoch seconds)
    alongside the credential. A missing or malformed value fails closed so the
    credential cannot be accepted indefinitely.
    """
    env = env if env is not None else os.environ
    try:
        expires = float(env.get(SESSION_EXPIRES_ENV) or 0)
    except (TypeError, ValueError):
        return False
    return expires > time.time()


def session_credential_matches(header_value: Optional[str], env: Optional[dict] = None) -> bool:
    """True iff the request's session header equals the scoped local credential
    AND the credential is still within its declared lifetime.

    The credential is read from the environment and compared in constant time;
    it is never assigned to a name that could be logged. The expiry check fails
    closed so a stolen credential does not outlive its declared lifetime.
    """
    env = env if env is not None else os.environ
    if not const_time_str_eq(header_value, env.get(SESSION_CREDENTIAL_ENV)):
        return False
    return session_credential_active(env)


# ─────────────────────────────────────────────────────────────────────────────
# Wallet JWT (HMAC-signed) — economy features layered on top of local auth.
# ─────────────────────────────────────────────────────────────────────────────

def create_jwt(payload: dict, expiry_seconds: int, secret: str) -> str:
    body = {
        **payload,
        "exp": int(time.time()) + expiry_seconds,
        "iat": int(time.time()),
    }
    body_json = json.dumps(body, separators=(",", ":"))
    body_b64 = base64.urlsafe_b64encode(body_json.encode()).decode().rstrip("=")
    sig = hmac.new(secret.encode(), body_b64.encode(), hashlib.sha256).hexdigest()
    return f"{body_b64}.{sig}"


def verify_jwt(token: str, secret: str) -> Optional[dict]:
    """Verify and decode a JWT. Returns None on any failure; never raises and
    never logs token material."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        body_b64, sig = parts
        expected = hmac.new(secret.encode(), body_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        pad = 4 - len(body_b64) % 4
        if pad != 4:
            body_b64 += "=" * pad
        body = json.loads(base64.urlsafe_b64decode(body_b64).decode())
        if int(body.get("exp", 0)) < time.time():
            return None
        return body
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Wallet challenge — HMAC-protected, single-use, EIP-191 verified (R5)
# ─────────────────────────────────────────────────────────────────────────────

def _b64decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    if pad != 4:
        s += "=" * pad
    return base64.urlsafe_b64decode(s)


def _build_challenge_message(address_lower: str, nonce: str, expires: int) -> str:
    """The EXACT string the wallet signs.

    Reconstructed byte-for-byte on verification so EIP-191 recovery runs over
    the precise message that was signed. The address is the lowercased,
    HMAC-protected payload address, so the signed bytes are tamper-evident.
    """
    return f"Sign in to BonzAI\n\nAddress: {address_lower}\nNonce: {nonce}\nExpires: {expires}"


def create_auth_challenge(address: str, hmac_secret: str) -> dict:
    address_lower = address.strip().lower()
    nonce = secrets.token_hex(16)
    expires = int(time.time()) + CHALLENGE_EXPIRY
    payload = {"address": address_lower, "nonce": nonce, "expires": expires}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    mac = hmac.new(hmac_secret.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    message = _build_challenge_message(address_lower, nonce, expires)
    return {"challenge": payload_b64, "mac": mac, "message": message}


# Single-use consumption store. A challenge can be redeemed exactly once
# (R5 replay protection). Consume-then-recover under the lock guarantees that
# two concurrent redemptions of the same challenge cannot both succeed.
_consumed_challenges: set = set()
_consumed_lock = threading.Lock()


def reset_challenge_store() -> None:
    """Clear the one-time consumption store (test helper)."""
    with _consumed_lock:
        _consumed_challenges.clear()


def verify_auth_challenge(
    challenge: str, mac: str, address: str, signature: str, hmac_secret: str
) -> bool:
    """Verify a wallet challenge redemption.

    Checks, in order: server-issued HMAC over the blob, expiry, normalized
    claimed-address match against the issued address, atomic single-use
    consumption, then real EIP-191 recovery over the exact issued message with
    a normalized recovered-address comparison. Returns False on any mismatch;
    a consumed-but-failed challenge stays burned (fail-closed).
    """
    # 1. HMAC over the exact issued blob (tamper-evident).
    expected_mac = hmac.new(hmac_secret.encode(), challenge.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(mac or "", expected_mac):
        return False

    # 2. Decode payload.
    try:
        payload = json.loads(_b64decode(challenge).decode())
    except Exception:
        return False
    if not isinstance(payload, dict):
        return False

    # 3. Expiry.
    try:
        if int(payload.get("expires", 0)) < time.time():
            return False
    except (TypeError, ValueError):
        return False

    # 4. Normalized claimed-address must equal the issued (HMAC-protected) one.
    address_lower = (address or "").strip().lower()
    issued_address = str(payload.get("address", "")).strip().lower()
    if not address_lower or address_lower != issued_address:
        return False

    # 5. Atomic single-use consumption (replay protection).
    with _consumed_lock:
        if challenge in _consumed_challenges:
            return False
        _consumed_challenges.add(challenge)

    # 6. Real EIP-191 recovery over the exact issued message.
    message = _build_challenge_message(address_lower, payload.get("nonce"), payload.get("expires"))
    try:
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
        return to_checksum_address(recovered) == to_checksum_address(address_lower)
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Wallet level — never fabricated (R7)
# ─────────────────────────────────────────────────────────────────────────────

def get_wallet_level(address: str) -> tuple:
    """Return no level.

    Economy-only lookups must use the configured chain (see web3.config.js),
    not a server default. ``(None, 0)`` lets the client map absent data to no
    economy privilege (auth.service.js normalizeLevel). Local inference needs
    no wallet and no level.
    """
    return (None, 0)


# ─────────────────────────────────────────────────────────────────────────────
# Short-lived signed media URLs (R1) — /media/stream, /media/info
#
# HTML <img>/<video>/<audio> elements cannot send the x-bonzai-session header,
# so these two routes accept an alternative: a query-string signature over the
# EXACT `path` value the request also carries, HMAC-SHA256 keyed by a secret
# shared with the Electron main process only (never disclosed to the
# renderer). Production signing happens in Electron's media:sign-url IPC
# (src/main.js); sign_media_url below exists for tests and standalone use and
# must stay byte-for-byte compatible with that IPC's scheme.
# ─────────────────────────────────────────────────────────────────────────────

def compute_media_signature(path: str, exp: int, secret: str) -> str:
    """HMAC-SHA256 (hex) over ``f"{path}|{exp}"``. The exact wire format the
    Electron signer and this verifier must agree on bit-for-bit."""
    return hmac.new(secret.encode(), f"{path}|{exp}".encode(), hashlib.sha256).hexdigest()


def sign_media_url(path: str, secret: str, ttl: int = MEDIA_SIGNED_URL_TTL) -> dict:
    """Mint a ``{exp, sig}`` pair authorizing ``path`` for ``ttl`` seconds."""
    exp = int(time.time()) + int(ttl)
    return {"exp": exp, "sig": compute_media_signature(path, exp, secret)}


def media_signature_valid(path: Optional[str], exp, sig: Optional[str],
                           secret: Optional[str]) -> bool:
    """True iff ``sig`` is a valid, unexpired signature over ``path|exp``.

    Fails closed on a missing secret/path/sig, a malformed ``exp``, or an
    expiry in the past. Compared in constant time. Callers must pass the
    SAME ``path`` string that will subsequently go through
    ``resolve_media_path`` -- this function authenticates the request only;
    P4 containment is enforced separately and unconditionally.
    """
    if not secret or not path or not sig:
        return False
    try:
        exp_int = int(exp)
    except (TypeError, ValueError):
        return False
    if exp_int < int(time.time()):
        return False
    expected = compute_media_signature(path, exp_int, secret)
    return hmac.compare_digest(sig, expected)


def media_request_signature_valid(env: Optional[dict] = None) -> bool:
    """``media_signature_valid`` applied to the in-flight Flask request's
    ``path``/``exp``/``sig`` query params, keyed by ``BONZAI_MEDIA_SIGNING_SECRET``."""
    env = env if env is not None else os.environ
    secret = env.get(MEDIA_SIGNING_SECRET_ENV)
    args = request.args
    return media_signature_valid(args.get("path"), args.get("exp"), args.get("sig"), secret)


# ─────────────────────────────────────────────────────────────────────────────
# Request authentication (R3, R4)
# ─────────────────────────────────────────────────────────────────────────────

def request_authenticated(env: Optional[dict], jwt_secret: Optional[str]) -> bool:
    """True iff the in-flight request carries valid credentials.

    Accepts either a valid wallet access JWT (``Authorization: Bearer``) or the
    scoped local session credential (``x-bonzai-session``). Local-first
    creation therefore works with the session credential alone; wallet JWTs
    layer on top for economy features.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        claims = verify_jwt(auth_header[7:].strip(), jwt_secret or "")
        if claims and claims.get("type") == "access":
            try:
                request.auth_user = claims
            except Exception:
                pass
            return True
    return session_credential_matches(request.headers.get("x-bonzai-session"), env)


# ─────────────────────────────────────────────────────────────────────────────
# Trusted-origin CORS (R1) — no wildcard, no credentials for untrusted origins.
# ─────────────────────────────────────────────────────────────────────────────

def origin_allowed(origin: Optional[str], trusted) -> bool:
    if not origin:
        return False
    for entry in trusted:
        if origin == entry:
            return True
        if entry.endswith("://") and origin.startswith(entry):
            return True
        if origin.rstrip("/") == entry.rstrip("/"):
            return True
    return False


def install_cors(app: Flask, env: Optional[dict] = None,
                  origins_env_var: str = TRUSTED_ORIGINS_ENV) -> list:
    """Attach trusted-origin CORS to ``app`` and return the trusted list."""
    env = env if env is not None else os.environ
    trusted = get_trusted_origins(env, env_var=origins_env_var)

    @app.after_request
    def _cors_headers(resp):
        origin = request.headers.get("Origin")
        if origin and origin_allowed(origin, trusted):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers["Access-Control-Allow-Headers"] = ", ".join(CORS_ALLOW_HEADERS)
            resp.headers["Access-Control-Allow-Methods"] = ", ".join(CORS_ALLOW_METHODS)
            resp.headers["Vary"] = "Origin"
        # Untrusted or absent Origin: no ACAO, no credentials — never "*".
        return resp

    @app.before_request
    def _cors_preflight():
        if request.method == "OPTIONS":
            return "", 204
        return None

    return trusted


# ─────────────────────────────────────────────────────────────────────────────
# Central authentication guard (R3)
# ─────────────────────────────────────────────────────────────────────────────

def install_auth(app: Flask, env: Optional[dict] = None, jwt_secret: Optional[str] = None) -> None:
    """Require authentication on every route except PUBLIC_PATHS.

    R1: MEDIA_SIGNED_PATHS additionally accept a valid, unexpired
    ``path``/``exp``/``sig`` query-string signature in place of the header
    credential -- the only routes this applies to, since only they are ever
    loaded by an HTML media element that cannot attach a custom header.
    """
    env = env if env is not None else os.environ

    @app.before_request
    def _auth_guard():
        if request.path in PUBLIC_PATHS:
            return None
        if request_authenticated(env, jwt_secret):
            return None
        if request.path in MEDIA_SIGNED_PATHS and media_request_signature_valid(env):
            return None
        return jsonify({"error": "Unauthorized"}), 401


def install_session_credential_auth(app: Flask, env: Optional[dict] = None) -> None:
    """Require the Electron-issued x-bonzai-session credential on every route.

    Unlike :func:`install_auth`, this guard never accepts a wallet ``Bearer``
    JWT: local services with no wallet/economy routes of their own (e.g. the
    workflow orchestrator, P5) have no JWT secret configured, and accepting
    the Bearer path there would mean validating against an empty HMAC key --
    a publicly-known "secret" an attacker could sign a forged token with. A
    credential scoped to a different service/purpose (a wallet JWT) is
    therefore rejected the same as a missing one, consistently as 401.
    """
    env = env if env is not None else os.environ

    @app.before_request
    def _session_auth_guard():
        if request.method == "OPTIONS":
            return None
        if session_credential_matches(request.headers.get("x-bonzai-session"), env):
            return None
        return jsonify({"error": "Unauthorized"}), 401


def install_security(app: Flask, env: Optional[dict] = None, jwt_secret: Optional[str] = None) -> None:
    """Wire CORS preflight, trusted-origin headers, and the central auth guard.

    CORS preflight is registered first so OPTIONS short-circuits to 204 before
    the auth guard runs (preflight never carries credentials).
    """
    install_cors(app, env)
    install_auth(app, env, jwt_secret)


def authenticate_socketio_connect(
    data: Optional[dict] = None,
    env: Optional[dict] = None,
    jwt_secret: Optional[str] = None,
) -> bool:
    """Authenticate a Socket.IO connect from inside a namespace connect handler.

    flask_socketio pushes a Flask request context for the connect event, so
    ``request.headers`` (transport-level) is checked first. Socket.IO clients
    may also pass credentials in the connect handshake ``auth`` payload, which
    flask_socketio delivers to the handler as its first argument: the renderer
    sends the local session credential as ``{session: ...}``
    (auth.service.js socketAuthPayload) or a wallet bearer as
    ``{token: ...}``. That payload is consulted as a fallback so the
    generation/downloads/training sockets authenticate. Returning False from
    the handler rejects the connection.
    """
    env = env if env is not None else os.environ
    if not jwt_secret:
        jwt_secret = env.get(JWT_SECRET_ENV)
    if request_authenticated(env, jwt_secret):
        return True
    data = data if isinstance(data, dict) else {}
    session = data.get("session")
    if isinstance(session, str) and session_credential_matches(session, env):
        return True
    bearer = data.get("token") or data.get("authorization")
    if isinstance(bearer, str) and bearer.lower().startswith("bearer "):
        claims = verify_jwt(bearer[7:].strip(), jwt_secret or "")
        if claims and claims.get("type") == "access":
            try:
                request.auth_user = claims
            except Exception:
                pass
            return True
    return False
