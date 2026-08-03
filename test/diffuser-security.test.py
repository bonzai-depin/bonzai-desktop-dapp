"""
BonzAI inference-server security tests (spec: bonzai-sec-P3-flask-auth).

Covers loopback binding & trusted-origin CORS (AC1), startup-secret fail-fast
and session-credential validation (AC2), central route-map authentication
(AC3), refresh/logout token-type and Socket.IO auth (AC4), real EIP-191
wallet-challenge verification (AC5), the pinned recovery dependency (AC6), no
fabricated level / wallet-optional local inference (AC7), and debug/reload off
(AC8). Runs without the torch/diffusers stack by exercising
src/server/bonzai_security.py directly.

Also covers the workflow orchestrator (spec: bonzai-sec-P5-orchestrator,
src/server/orchestrator.py): its URL-map inventory, session-credential-only
auth on /execute, loopback binding, configurable port, absent-secret startup
failure, and sanitized error responses. orchestrator.py has no torch/diffusers
dependency, so it is imported directly (not skipped).

Run: python3 -m pytest test/diffuser-security.test.py -q
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import importlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

# ── Make src/server importable for bonzai_security (no torch needed). ──
REPO_ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = REPO_ROOT / "src" / "server"
sys.path.insert(0, str(SERVER_DIR))

import bonzai_security as security  # noqa: E402
from eth_account import Account  # noqa: E402
from eth_account.messages import encode_defunct  # noqa: E402
from flask import Flask, jsonify, request  # noqa: E402

DIFFUSER_PATH = SERVER_DIR / "diffuser.py"
ORCHESTRATOR_PATH = SERVER_DIR / "orchestrator.py"
REQUIREMENTS_PATH = REPO_ROOT / "requirements.txt"

JWT_SECRET = "test-jwt-secret"
HMAC_SECRET = "test-hmac-secret"
SESSION_CRED = "scoped-session-credential-from-electron"
TRUSTED_ORIGIN = "http://localhost:5173"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _privkey(seed: int) -> str:
    return "0x" + format(seed, "064x")


def _account(seed: int):
    return Account.from_key(_privkey(seed))


def _sign(message: str, privkey: str) -> str:
    """Hex-encoded EIP-191 personal_sign signature (what a wallet sends)."""
    return Account.sign_message(encode_defunct(text=message), privkey).signature.hex()


def _build_challenge(address: str, mac_secret: str, expires_at: int) -> dict:
    """Build a challenge blob with a controllable expiry, mirroring the wire
    format produced by security.create_auth_challenge."""
    payload = {"address": address.lower(), "nonce": "deadbeef", "expires": expires_at}
    blob = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    mac = hmac.new(mac_secret.encode(), blob.encode(), hashlib.sha256).hexdigest()
    message = security._build_challenge_message(address.lower(), payload["nonce"], expires_at)
    return {"challenge": blob, "mac": mac, "message": message}


def _base_env(**overrides) -> dict:
    env = {
        security.FLASK_SECRET_ENV: "non-default-standalone-secret",
        security.SESSION_CREDENTIAL_ENV: SESSION_CRED,
        # Mirrors childEnvSecrets() in src/main/credentialRegistry.js: the
        # expiry always travels alongside the credential, epoch seconds,
        # comfortably in the future for tests that don't exercise expiry.
        security.SESSION_EXPIRES_ENV: str(int(time.time()) + 3600),
        security.JWT_SECRET_ENV: JWT_SECRET,
    }
    env.update(overrides)
    return env


def make_app(env: dict, routes=()) -> Flask:
    """A Flask app wired exactly like diffuser.py: trusted-origin CORS + the
    central auth guard, plus the auth endpoints and any extra protected
    routes. Used to exercise the security surface without importing torch."""
    app = Flask(__name__)
    app.config["SECRET_KEY"] = env[security.FLASK_SECRET_ENV]
    security.install_security(app, env=env, jwt_secret=env.get(security.JWT_SECRET_ENV))

    @app.post("/auth/challenge")
    def auth_challenge():
        data = request.get_json(force=True) or {}
        address = (data.get("address") or "").strip()
        if len(address) != 42 or not address.startswith("0x"):
            return jsonify({"error": "Invalid Ethereum address"}), 400
        return jsonify(security.create_auth_challenge(address, HMAC_SECRET))

    @app.post("/auth/verify")
    def auth_verify():
        data = request.get_json(force=True) or {}
        address = (data.get("address") or "").strip().lower()
        ok = security.verify_auth_challenge(
            data.get("challenge", ""), data.get("mac", ""),
            address, data.get("signature", ""), HMAC_SECRET,
        )
        if not ok:
            return jsonify({"error": "Invalid challenge or signature"}), 401
        level, level_value = security.get_wallet_level(address)
        access = security.create_jwt(
            {"sub": address, "level": level, "level_value": level_value, "type": "access"},
            security.ACCESS_TOKEN_EXPIRY, env[security.JWT_SECRET_ENV],
        )
        refresh = security.create_jwt({"sub": address, "type": "refresh"},
                                      security.REFRESH_TOKEN_EXPIRY, env[security.JWT_SECRET_ENV])
        resp = jsonify({"access_token": access, "expires_in": security.ACCESS_TOKEN_EXPIRY,
                        "level": level, "level_value": level_value})
        resp.set_cookie("refresh_token", refresh, httponly=True, samesite="Lax",
                        max_age=security.REFRESH_TOKEN_EXPIRY, path="/")
        return resp

    @app.post("/auth/refresh")
    def auth_refresh():
        # Central guard already required the desktop session credential; here
        # we additionally require a refresh-TYPE token (R4).
        refresh = request.cookies.get("refresh_token")
        claims = security.verify_jwt(refresh or "", env[security.JWT_SECRET_ENV])
        if not claims or claims.get("type") != "refresh":
            return jsonify({"error": "Invalid refresh token"}), 401
        level, level_value = security.get_wallet_level(claims["sub"])
        access = security.create_jwt(
            {"sub": claims["sub"], "level": level, "level_value": level_value, "type": "access"},
            security.ACCESS_TOKEN_EXPIRY, env[security.JWT_SECRET_ENV],
        )
        return jsonify({"access_token": access, "level": level, "level_value": level_value})

    @app.post("/auth/logout")
    def auth_logout():
        resp = jsonify({"ok": True})
        resp.delete_cookie("refresh_token", path="/")
        return resp

    @app.get("/auth/status")
    def auth_status():
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            claims = security.verify_jwt(header[7:], env[security.JWT_SECRET_ENV])
            if claims and claims.get("type") == "access":
                return jsonify({"authenticated": True, "address": claims.get("sub")})
        return jsonify({"authenticated": False})

    @app.get("/secret")
    def secret():
        return jsonify({"secret": True})

    for path in routes:
        def _dummy(path=path):
            return jsonify({"path": path})
        app.add_url_rule(path, f"route_{path.replace('/', '_')}", _dummy)

    return app


@pytest.fixture(autouse=True)
def _reset_challenge_store():
    security.reset_challenge_store()
    yield
    security.reset_challenge_store()


@pytest.fixture
def client():
    return make_app(_base_env()).test_client()


def _authed(client, path, **kw):
    return client.get(path, headers={"x-bonzai-session": SESSION_CRED}, **kw)


# ─────────────────────────────────────────────────────────────────────────────
# AC1 — loopback binding, configurable port, trusted-origin CORS
# ─────────────────────────────────────────────────────────────────────────────

class TestLoopbackAndCors:
    def test_default_host_is_loopback_not_wildcard(self):
        assert security.DEFAULT_HOST == "127.0.0.1"
        assert security.get_server_host({}) == "127.0.0.1"
        assert security.get_server_host({security.SERVER_HOST_ENV: "127.0.0.1"}) == "127.0.0.1"

    def test_non_loopback_host_coerced_to_loopback(self):
        # R1: loopback-ONLY. Even an explicit 0.0.0.0 (or public IP) never binds
        # all interfaces.
        assert security.get_server_host({security.SERVER_HOST_ENV: "0.0.0.0"}) == "127.0.0.1"
        assert security.get_server_host({security.SERVER_HOST_ENV: "10.0.0.5"}) == "127.0.0.1"
        assert security.get_server_host({security.SERVER_HOST_ENV: "localhost"}) == "127.0.0.1"

    def test_port_is_configurable(self):
        assert security.get_server_port({}) == 65000
        assert security.get_server_port({security.SERVER_PORT_ENV: "7000"}) == 7000
        assert security.get_server_port({security.SERVER_PORT_ENV: "junk"}) == 65000
        assert security.get_server_port({security.SERVER_PORT_ENV: "0"}) == 65000
        assert security.get_server_port({security.SERVER_PORT_ENV: "99999"}) == 65000

    def test_no_wildcard_in_trusted_origins(self):
        origins = security.get_trusted_origins({security.TRUSTED_ORIGINS_ENV: "*"})
        assert "*" not in origins
        origins = security.get_trusted_origins(
            {security.TRUSTED_ORIGINS_ENV: "*,https://app.bonzai.sh"})
        assert "*" not in origins
        assert "https://app.bonzai.sh" in origins

    def test_allowed_origin_accepted_with_credentials(self):
        app = make_app(_base_env())
        c = app.test_client()
        resp = c.get("/secret", headers={"Origin": TRUSTED_ORIGIN,
                                         "x-bonzai-session": SESSION_CRED})
        assert resp.headers.get("Access-Control-Allow-Origin") == TRUSTED_ORIGIN
        assert resp.headers.get("Access-Control-Allow-Credentials") == "true"
        assert "x-bonzai-session" in resp.headers.get("Access-Control-Allow-Headers", "")

    def test_unknown_origin_denied_no_credentials(self):
        app = make_app(_base_env())
        c = app.test_client()
        resp = c.get("/secret", headers={"Origin": "https://evil.example",
                                         "x-bonzai-session": SESSION_CRED})
        assert resp.headers.get("Access-Control-Allow-Origin") is None
        assert resp.headers.get("Access-Control-Allow-Credentials") is None

    def test_never_emits_wildcard_acao(self):
        app = make_app(_base_env())
        c = app.test_client()
        for origin in ("https://evil.example", "http://127.0.0.1:9999", None):
            headers = {"x-bonzai-session": SESSION_CRED}
            if origin:
                headers["Origin"] = origin
            resp = c.get("/secret", headers=headers)
            assert resp.headers.get("Access-Control-Allow-Origin") != "*"

    def test_preflight_short_circuits_and_carries_cors_headers(self):
        app = make_app(_base_env())
        c = app.test_client()
        resp = c.options("/secret", headers={"Origin": TRUSTED_ORIGIN,
                                             "Access-Control-Request-Method": "POST"})
        assert resp.status_code == 204
        assert resp.headers.get("Access-Control-Allow-Origin") == TRUSTED_ORIGIN
        assert "x-bonzai-session" in resp.headers.get("Access-Control-Allow-Headers", "")


# ─────────────────────────────────────────────────────────────────────────────
# AC2 — startup-secret fail-fast + session-credential validation
# ─────────────────────────────────────────────────────────────────────────────

class TestStartupSecretsAndCredentials:
    def test_startup_fails_without_session_secret(self):
        with pytest.raises(RuntimeError):
            security.validate_startup_secrets({})

    def test_startup_fails_with_default_secret(self):
        with pytest.raises(RuntimeError):
            security.validate_startup_secrets({security.FLASK_SECRET_ENV: security.DEFAULT_FLASK_SECRET})

    def test_startup_fails_without_session_credential(self):
        with pytest.raises(RuntimeError):
            security.validate_startup_secrets({security.FLASK_SECRET_ENV: "real-secret"})

    def test_startup_succeeds_with_non_default_secret_and_credential(self):
        security.validate_startup_secrets(_base_env())  # must not raise

    def test_valid_session_credential_passes_guard(self):
        c = client = make_app(_base_env()).test_client()
        assert c.get("/secret").status_code == 401
        assert c.get("/secret", headers={"x-bonzai-session": SESSION_CRED}).status_code == 200

    def test_missing_session_credential_rejected(self):
        c = make_app(_base_env()).test_client()
        assert c.get("/secret").status_code == 401

    def test_invalid_session_credential_rejected(self):
        c = make_app(_base_env()).test_client()
        assert c.get("/secret", headers={"x-bonzai-session": "wrong"}).status_code == 401
        assert c.get("/secret", headers={"x-bonzai-session": ""}).status_code == 401

    def test_expired_or_absent_credential_fails_closed(self):
        # If the Electron registry has not delivered (or has expired) the
        # credential, the env has none and the guard rejects every request.
        env = _base_env()
        del env[security.SESSION_CREDENTIAL_ENV]
        c = make_app(env).test_client()
        assert c.get("/secret", headers={"x-bonzai-session": SESSION_CRED}).status_code == 401
        assert c.get("/secret", headers={"x-bonzai-session": "anything"}).status_code == 401

    def test_startup_fails_without_session_expiry(self):
        env = _base_env()
        del env[security.SESSION_EXPIRES_ENV]
        with pytest.raises(RuntimeError):
            security.validate_startup_secrets(env)

    def test_credential_past_its_declared_expiry_rejected(self):
        # A credential that is otherwise byte-for-byte correct must still be
        # rejected once BONZAI_SESSION_EXPIRES (delivered alongside it by the
        # Electron registry) is in the past -- a stolen credential must not
        # outlive its declared lifetime.
        env = _base_env(**{security.SESSION_EXPIRES_ENV: str(int(time.time()) - 1)})
        c = make_app(env).test_client()
        assert c.get("/secret", headers={"x-bonzai-session": SESSION_CRED}).status_code == 401

    def test_valid_bearer_jwt_also_passes(self):
        # Wallet access JWT is accepted in addition to the session credential.
        env = _base_env()
        c = make_app(env).test_client()
        token = security.create_jwt({"sub": "0xwallet", "type": "access"}, 60, JWT_SECRET)
        assert c.get("/secret", headers={"Authorization": f"Bearer {token}"}).status_code == 200

    def test_refresh_type_bearer_rejected_for_protected_route(self):
        env = _base_env()
        c = make_app(env).test_client()
        token = security.create_jwt({"sub": "0xwallet", "type": "refresh"}, 60, JWT_SECRET)
        assert c.get("/secret", headers={"Authorization": f"Bearer {token}"}).status_code == 401

    def test_credential_never_logged(self, caplog):
        # The credential value must not appear in any log line emitted by the
        # security module during a guarded request.
        import logging
        caplog.set_level(logging.DEBUG, logger="bonzai-server")
        c = make_app(_base_env()).test_client()
        c.get("/secret", headers={"x-bonzai-session": SESSION_CRED})
        c.get("/secret")  # unauthorized
        for record in caplog.records:
            assert SESSION_CRED not in (record.getMessage() or "")


# ─────────────────────────────────────────────────────────────────────────────
# AC3 — every route except PUBLIC_PATHS requires auth. /auth/refresh and
# /auth/logout are public (R3): the production client reaches them without
# the desktop session credential (refresh sends only the HttpOnly cookie;
# logout clears its in-memory credential before its cookie-clearing request).
# ─────────────────────────────────────────────────────────────────────────────

# A representative inventory of the real diffuser.py route paths, sampled from
# the live URL map. The central before_request guard covers them all except
# PUBLIC_PATHS (/auth/challenge, /auth/verify, /auth/refresh, /auth/logout).
DIFFUSER_PROTECTED_PATHS = [
    "/", "/config", "/health", "/memory/clear", "/memory/status",
    "/pipelines/plan", "/pipelines/prefetch", "/downloads/list",
    "/downloads/status/abc", "/downloads/cancel/abc", "/media/stream",
    "/media/info", "/image/standard", "/image/quality", "/image/advanced",
    "/image/turbo", "/audio/turbo", "/audio/music", "/audio/info",
    "/video", "/video/quality", "/video/test", "/video/enhance",
    "/forecast", "/forecast/history", "/training/datasets",
    "/training/llm/start", "/training/models", "/training/info",
    "/vision/analyze", "/vision/ocr", "/vision/caption", "/auth/status",
]


class TestRouteMapAuth:
    def test_public_paths_are_exactly_challenge_verify_refresh_and_logout(self):
        assert security.PUBLIC_PATHS == frozenset(
            {"/auth/challenge", "/auth/verify", "/auth/refresh", "/auth/logout"}
        )

    def test_public_routes_reachable_without_credentials(self):
        c = make_app(_base_env()).test_client()
        assert c.post("/auth/challenge", json={"address": _account(1).address}).status_code == 200
        assert c.post("/auth/verify",
                      json={"address": "0x" + "0" * 40, "signature": "x",
                            "challenge": "x", "mac": "x"}).status_code == 401
        # /auth/refresh and /auth/logout are public too -- reachable with no
        # session credential and no wallet bearer at all.
        assert c.post("/auth/refresh").status_code == 401  # no refresh cookie -> 401, not 403/redirect
        assert c.post("/auth/logout").status_code == 200

    def test_every_protected_route_requires_authentication(self):
        app = make_app(_base_env(), routes=DIFFUSER_PROTECTED_PATHS)
        c = app.test_client()
        for path in DIFFUSER_PROTECTED_PATHS:
            assert c.get(path).status_code == 401, f"{path} should require auth"
            assert c.get(path, headers={"x-bonzai-session": SESSION_CRED}).status_code == 200, (
                f"{path} should accept a valid session credential")

    def test_real_diffuser_url_map_guarded(self, monkeypatch):
        # When the full torch/diffusers stack is importable, confirm the real
        # app's URL map exposes exactly the two public paths and nothing else
        # as unguarded. The central before_request guard exempts only
        # PUBLIC_PATHS, so every other registered route is authenticated.
        for k, v in _base_env().items():
            monkeypatch.setenv(k, v)
        import importlib
        try:
            diffuser = importlib.import_module("diffuser")
        except Exception:
            pytest.skip("diffuser.py not importable without the torch/diffusers stack")
        paths = {str(rule) for rule in diffuser.app.url_map.iter_rules()}
        assert "/auth/challenge" in paths and "/auth/verify" in paths
        assert (paths & security.PUBLIC_PATHS) == security.PUBLIC_PATHS


# ─────────────────────────────────────────────────────────────────────────────
# AC4 — refresh/logout token type + Socket.IO connection auth
# ─────────────────────────────────────────────────────────────────────────────

class TestTokenTypeAndSocketio:
    def test_refresh_requires_refresh_type_token(self):
        env = _base_env()
        c = make_app(env).test_client()
        access = security.create_jwt({"sub": "0xwallet", "type": "access"}, 60, JWT_SECRET)
        refresh = security.create_jwt({"sub": "0xwallet", "type": "refresh"}, 60, JWT_SECRET)
        sess = {"x-bonzai-session": SESSION_CRED}
        # access token in the cookie slot is rejected (wrong type)
        c.set_cookie("refresh_token", access, domain="localhost")
        assert c.post("/auth/refresh", headers=sess).status_code == 401
        # refresh token is accepted
        c.set_cookie("refresh_token", refresh, domain="localhost")
        r = c.post("/auth/refresh", headers=sess)
        assert r.status_code == 200
        assert r.get_json()["access_token"]

    def test_refresh_reachable_without_session_credential(self):
        # /auth/refresh is public (R3): the renderer's refreshToken() sends
        # only the HttpOnly refresh cookie, never the desktop session header,
        # so a valid refresh token must succeed with no session credential.
        env = _base_env()
        c = make_app(env).test_client()
        refresh = security.create_jwt({"sub": "0xwallet", "type": "refresh"}, 60, JWT_SECRET)
        c.set_cookie("refresh_token", refresh, domain="localhost")
        r = c.post("/auth/refresh")
        assert r.status_code == 200
        assert r.get_json()["access_token"]

    def test_logout_reachable_without_session_credential(self):
        # /auth/logout is public (R3): the renderer clears its in-memory
        # session credential before issuing the cookie-clearing request, so
        # the guard must not require the (already-cleared) credential.
        env = _base_env()
        c = make_app(env).test_client()
        assert c.post("/auth/logout").status_code == 200
        assert c.post("/auth/logout", headers={"x-bonzai-session": SESSION_CRED}).status_code == 200

    def test_socketio_connect_authenticated_with_session(self):
        app = Flask(__name__)
        with app.test_request_context("/", headers={"x-bonzai-session": SESSION_CRED}):
            assert security.authenticate_socketio_connect(env=_base_env()) is True

    def test_socketio_connect_rejected_without_credentials(self):
        app = Flask(__name__)
        with app.test_request_context("/"):
            assert security.authenticate_socketio_connect(env=_base_env()) is False

    def test_socketio_connect_accepts_valid_bearer(self):
        app = Flask(__name__)
        token = security.create_jwt({"sub": "0xw", "type": "access"}, 60, JWT_SECRET)
        with app.test_request_context("/", headers={"Authorization": f"Bearer {token}"}):
            assert security.authenticate_socketio_connect(env=_base_env()) is True

    def test_auth_failures_return_consistent_json(self):
        c = make_app(_base_env()).test_client()
        r = c.get("/secret")
        assert r.status_code == 401
        assert isinstance(r.get_json(), dict) and "error" in r.get_json()


# ─────────────────────────────────────────────────────────────────────────────
# AC5 — real EIP-191 challenge verification (single-use)
# ─────────────────────────────────────────────────────────────────────────────

class TestChallengeVerification:
    def _issue_and_sign(self, seed=1):
        acct = _account(seed)
        ch = security.create_auth_challenge(acct.address, HMAC_SECRET)
        sig = _sign(ch["message"], _privkey(seed))
        return acct.address, ch, sig

    def test_valid_personal_sign_recovery_succeeds(self):
        address, ch, sig = self._issue_and_sign()
        assert security.verify_auth_challenge(ch["challenge"], ch["mac"], address, sig, HMAC_SECRET) is True

    def test_challenge_redeemable_exactly_once_replay_rejected(self):
        address, ch, sig = self._issue_and_sign()
        assert security.verify_auth_challenge(ch["challenge"], ch["mac"], address, sig, HMAC_SECRET) is True
        assert security.verify_auth_challenge(ch["challenge"], ch["mac"], address, sig, HMAC_SECRET) is False

    def test_dummy_signature_rejected(self):
        address, ch, _ = self._issue_and_sign()
        assert security.verify_auth_challenge(ch["challenge"], ch["mac"], address, "0x" + "ab" * 65, HMAC_SECRET) is False

    def test_malformed_signatures_rejected(self):
        address, ch, _ = self._issue_and_sign()
        for bad in ("", "not-a-signature", "0xdeadbeef", "0x" + "00" * 64, None):
            assert security.verify_auth_challenge(ch["challenge"], ch["mac"], address, bad, HMAC_SECRET) is False

    def test_altered_message_rejected(self):
        # Sign a different message than the one issued; recovery over the
        # issued message yields the wrong signer.
        address, ch, _ = self._issue_and_sign()
        wrong_sig = _sign(ch["message"] + "tampered", _privkey(1))
        assert security.verify_auth_challenge(ch["challenge"], ch["mac"], address, wrong_sig, HMAC_SECRET) is False

    def test_altered_mac_rejected(self):
        address, ch, sig = self._issue_and_sign()
        bad_mac = "0" * 64 if ch["mac"] != "0" * 64 else "1" * 64
        assert security.verify_auth_challenge(ch["challenge"], bad_mac, address, sig, HMAC_SECRET) is False

    def test_altered_address_rejected(self):
        address, ch, sig = self._issue_and_sign(seed=1)
        other = _account(2).address
        assert security.verify_auth_challenge(ch["challenge"], ch["mac"], other, sig, HMAC_SECRET) is False

    def test_tampered_challenge_blob_rejected(self):
        address, ch, sig = self._issue_and_sign()
        # Flip a character inside the base64 blob -> HMAC no longer matches.
        tampered = ("A" + ch["challenge"][1:]) if ch["challenge"][0] != "A" else ("B" + ch["challenge"][1:])
        assert security.verify_auth_challenge(tampered, ch["mac"], address, sig, HMAC_SECRET) is False

    def test_expired_challenge_rejected(self):
        acct = _account(1)
        ch = _build_challenge(acct.address, HMAC_SECRET, expires_at=int(time.time()) - 10)
        sig = _sign(ch["message"], _privkey(1))
        assert security.verify_auth_challenge(ch["challenge"], ch["mac"], acct.address, sig, HMAC_SECRET) is False

    def test_mismatched_signer_rejected(self):
        # Issue for address A, but sign with key B.
        acct_a = _account(1)
        ch = security.create_auth_challenge(acct_a.address, HMAC_SECRET)
        sig_b = _sign(ch["message"], _privkey(2))
        assert security.verify_auth_challenge(ch["challenge"], ch["mac"], acct_a.address, sig_b, HMAC_SECRET) is False

    def test_full_verify_flow_issues_tokens(self):
        c = make_app(_base_env()).test_client()
        acct = _account(7)
        ch = c.post("/auth/challenge", json={"address": acct.address}).get_json()
        sig = _sign(ch["message"], _privkey(7))
        r = c.post("/auth/verify", json={
            "address": acct.address, "signature": sig,
            "challenge": ch["challenge"], "mac": ch["mac"],
        })
        assert r.status_code == 200
        body = r.get_json()
        assert body["access_token"]
        # R7: no fabricated level
        assert body["level"] is None
        assert body["level_value"] == 0

    def test_address_case_normalized(self):
        acct = _account(1)
        ch = security.create_auth_challenge(acct.address, HMAC_SECRET)
        sig = _sign(ch["message"], _privkey(1))
        # Claimed address in mixed/upper case still verifies against the
        # lowercased issued address.
        assert security.verify_auth_challenge(ch["challenge"], ch["mac"], acct.address.upper(), sig, HMAC_SECRET) is True


# ─────────────────────────────────────────────────────────────────────────────
# AC6 — requirements.txt pins the recovery dependency with a justification
# ─────────────────────────────────────────────────────────────────────────────

class TestRequirementsPin:
    def test_eth_account_pinned(self):
        text = REQUIREMENTS_PATH.read_text()
        pins = [ln for ln in text.splitlines() if ln.strip().startswith("eth-account==")]
        assert len(pins) == 1, "exactly one eth-account pin expected"
        assert "eth-account==" in pins[0]

    def test_justification_comment_present(self):
        text = REQUIREMENTS_PATH.read_text()
        idx = next(i for i, ln in enumerate(text.splitlines())
                   if ln.strip().startswith("eth-account=="))
        # A comment on one of the few preceding lines explains why it is pinned.
        nearby = "\n".join(text.splitlines()[max(0, idx - 4):idx])
        assert "#" in nearby
        assert any(k in nearby.lower() for k in ("signature", "eip-191", "personal", "recovery", "wallet"))

    def test_no_other_new_dependency_for_auth(self):
        text = REQUIREMENTS_PATH.read_text().lower()
        # No web3 / eth-keys / coincurve pulled in beyond eth-account.
        for extra in ("web3==", "eth-keys==", "coincurve==", "eth-utils=="):
            assert extra not in text


# ─────────────────────────────────────────────────────────────────────────────
# AC7 — no fabricated level; wallet-optional local inference
# ─────────────────────────────────────────────────────────────────────────────

class TestNoFabricatedLevel:
    def test_wallet_level_returns_none(self):
        level, value = security.get_wallet_level("0x" + "1" * 40)
        assert level is None
        assert value == 0

    def test_diffuser_has_no_hardcoded_max_level(self):
        text = DIFFUSER_PATH.read_text()
        assert '"LVL6"' not in text and "'LVL6'" not in text
        assert "grant full access" not in text

    def test_local_inference_without_wallet(self):
        # The session credential alone (no wallet bearer) reaches a protected
        # local route -> local creation is wallet-optional.
        c = make_app(_base_env()).test_client()
        r = c.get("/secret", headers={"x-bonzai-session": SESSION_CRED})
        assert r.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# AC8 — debug and reload off
# ─────────────────────────────────────────────────────────────────────────────

class TestDebugOff:
    def test_socketio_run_disables_debug_and_reload(self):
        text = DIFFUSER_PATH.read_text()
        # The single socketio.run(...) call must turn both flags off.
        assert "debug=False" in text
        assert "use_reloader=False" in text
        assert "debug=True" not in text
        # Loopback host comes from the security module, never a literal wildcard.
        assert 'host="0.0.0.0"' not in text
        assert "security.get_server_host" in text

    def test_secrets_not_logged(self):
        text = DIFFUSER_PATH.read_text()
        # The signing secret / session credential must not be printed.
        assert "bonzai-secret-key" not in text
        for forbidden in ("print(SECRET_KEY", "print(JWT_SECRET", "print(HMAC_SECRET",
                          "logger.info(f\"[Auth] {JWT_SECRET}", "logger.info(JWT_SECRET"):
            assert forbidden not in text


# ─────────────────────────────────────────────────────────────────────────────
# P5 — workflow orchestrator (src/server/orchestrator.py) hardening
#
# orchestrator.py validates its startup secrets and installs its auth guard
# at import time (mirroring diffuser.py), so every test here reloads the
# module under a controlled environment. It has no torch/diffusers
# dependency, so unlike _import_diffuser this never skips.
# ─────────────────────────────────────────────────────────────────────────────

# Every env var orchestrator.py / bonzai_security.py might read, so each
# reload starts from a clean slate instead of leaking a prior test's values.
_ORCHESTRATOR_ENV_KEYS = (
    security.FLASK_SECRET_ENV,
    security.SESSION_CREDENTIAL_ENV,
    security.SESSION_EXPIRES_ENV,
    security.JWT_SECRET_ENV,
    security.ORCHESTRATOR_HOST_ENV,
    security.ORCHESTRATOR_PORT_ENV,
    security.ORCHESTRATOR_TRUSTED_ORIGINS_ENV,
)


def _import_orchestrator(monkeypatch, env: dict):
    """(Re)import orchestrator.py with exactly `env` set in os.environ."""
    for k in _ORCHESTRATOR_ENV_KEYS:
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    if "orchestrator" in sys.modules:
        return importlib.reload(sys.modules["orchestrator"])
    return importlib.import_module("orchestrator")


@pytest.fixture
def orchestrator_client(monkeypatch):
    orchestrator = _import_orchestrator(monkeypatch, _base_env())
    return orchestrator.app.test_client()


class TestOrchestratorUrlMapAndAuth:
    """R1/AC1 — the Electron session credential is required on /execute, and
    consistently on every other path (missing/malformed/expired/wrong-service
    credentials all rejected the same way)."""

    def test_url_map_has_execute_and_nothing_public(self, orchestrator_client, monkeypatch):
        orchestrator = sys.modules["orchestrator"]
        paths = {rule.rule for rule in orchestrator.app.url_map.iter_rules()}
        assert "/execute" in paths
        # The orchestrator defines no public paths at all (unlike diffuser.py's
        # /auth/* exemptions) -- every registered route requires the
        # credential, verified below across the whole map, not just /execute.
        for rule in orchestrator.app.url_map.iter_rules():
            if "GET" in rule.methods or "POST" in rule.methods:
                method = "POST" if "POST" in rule.methods and "GET" not in rule.methods else "GET"
                resp = orchestrator_client.open(rule.rule.replace("<path:filename>", "x"), method=method)
                assert resp.status_code == 401, f"{rule.rule} should require auth"

    def test_valid_scoped_credential_executes(self, orchestrator_client):
        r = orchestrator_client.post(
            "/execute", json={"steps": []}, headers={"x-bonzai-session": SESSION_CRED},
        )
        assert r.status_code == 200
        assert r.get_json() == {}

    def test_missing_credential_rejected(self, orchestrator_client):
        r = orchestrator_client.post("/execute", json={"steps": []})
        assert r.status_code == 401
        assert "error" in r.get_json()

    def test_non_empty_workflow_dispatches_to_configured_port_with_session_header(
        self, monkeypatch,
    ):
        # Regression: execute_workflow's internal requests.post must target
        # the orchestrator's own configured host/port (not a hard-coded
        # localhost:5000) and must carry x-bonzai-session, or every
        # non-empty workflow 401s against the auth guard on this same
        # process / a wrong port once BONZAI_ORCHESTRATOR_PORT is set.
        env = _base_env(**{security.ORCHESTRATOR_PORT_ENV: "6001"})
        orchestrator = _import_orchestrator(monkeypatch, env)
        c = orchestrator.app.test_client()

        calls = []

        class _FakeResponse:
            def json(self):
                return {"ok": True}

        def _fake_post(url, json=None, headers=None, **kwargs):
            calls.append((url, headers))
            return _FakeResponse()

        monkeypatch.setattr(orchestrator.requests, "post", _fake_post)

        r = c.post(
            "/execute",
            json={"steps": [{"task": "step1", "endpoint": "/step1"}]},
            headers={"x-bonzai-session": SESSION_CRED},
        )
        assert r.status_code == 200
        assert r.get_json() == {"step1": {"ok": True}}
        assert len(calls) == 1
        url, headers = calls[0]
        assert url == "http://127.0.0.1:6001/step1"
        assert headers.get("x-bonzai-session") == SESSION_CRED

    def test_malformed_credential_rejected(self, orchestrator_client):
        for bad in ("wrong", "", "scoped-session-credential-from-electron-extra"):
            r = orchestrator_client.post(
                "/execute", json={"steps": []}, headers={"x-bonzai-session": bad},
            )
            assert r.status_code == 401

    def test_expired_credential_rejected(self, monkeypatch):
        env = _base_env(**{security.SESSION_EXPIRES_ENV: str(int(time.time()) - 1)})
        orchestrator = _import_orchestrator(monkeypatch, env)
        c = orchestrator.app.test_client()
        r = c.post("/execute", json={"steps": []}, headers={"x-bonzai-session": SESSION_CRED})
        assert r.status_code == 401

    def test_wrong_service_credential_rejected(self, orchestrator_client):
        # A valid wallet access JWT (the "service" diffuser.py's /auth/* flow
        # issues) is a credential for a *different* service/purpose and must
        # not authenticate the orchestrator -- it accepts only the scoped
        # local session credential, never a Bearer JWT.
        token = security.create_jwt({"sub": "0xwallet", "type": "access"}, 60, JWT_SECRET)
        r = orchestrator_client.post(
            "/execute", json={"steps": []}, headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 401

    def test_every_other_path_rejected_consistently(self, orchestrator_client):
        # R1: "reject every other unauthenticated request consistently" --
        # even a path with no registered route still 401s (the guard runs
        # before route resolution), never a bare 404 that would leak which
        # paths exist.
        for path in ("/nonexistent", "/execute/../secret", "/../etc/passwd"):
            r = orchestrator_client.get(path)
            assert r.status_code == 401


class TestOrchestratorCors:
    """R2/AC2 — explicit trusted origins only; no wildcard."""

    def test_trusted_origin_gets_credentialed_cors(self, monkeypatch):
        orchestrator = _import_orchestrator(
            monkeypatch, _base_env(**{security.ORCHESTRATOR_TRUSTED_ORIGINS_ENV: TRUSTED_ORIGIN}),
        )
        c = orchestrator.app.test_client()
        r = c.post("/execute", json={"steps": []},
                   headers={"Origin": TRUSTED_ORIGIN, "x-bonzai-session": SESSION_CRED})
        assert r.headers.get("Access-Control-Allow-Origin") == TRUSTED_ORIGIN
        assert r.headers.get("Access-Control-Allow-Credentials") == "true"

    def test_disallowed_origin_gets_no_cors_headers(self, orchestrator_client):
        r = orchestrator_client.post(
            "/execute", json={"steps": []},
            headers={"Origin": "https://evil.example", "x-bonzai-session": SESSION_CRED},
        )
        assert r.headers.get("Access-Control-Allow-Origin") is None

    def test_wildcard_origin_config_never_honored(self):
        origins = security.get_trusted_origins(
            {security.ORCHESTRATOR_TRUSTED_ORIGINS_ENV: "*"},
            env_var=security.ORCHESTRATOR_TRUSTED_ORIGINS_ENV,
        )
        assert "*" not in origins


class TestOrchestratorBindAndPort:
    """R2/AC2 — loopback bind, configurable non-privileged port, current
    default (5000) retained."""

    def test_default_host_is_loopback(self):
        assert security.get_server_host(
            {}, env_var=security.ORCHESTRATOR_HOST_ENV,
        ) == "127.0.0.1"

    def test_non_loopback_host_coerced(self):
        assert security.get_server_host(
            {security.ORCHESTRATOR_HOST_ENV: "0.0.0.0"}, env_var=security.ORCHESTRATOR_HOST_ENV,
        ) == "127.0.0.1"

    def test_default_port_is_5000(self):
        assert security.ORCHESTRATOR_DEFAULT_PORT == 5000
        assert security.get_server_port(
            {}, env_var=security.ORCHESTRATOR_PORT_ENV, default=security.ORCHESTRATOR_DEFAULT_PORT,
        ) == 5000

    def test_port_is_configurable(self):
        assert security.get_server_port(
            {security.ORCHESTRATOR_PORT_ENV: "6001"},
            env_var=security.ORCHESTRATOR_PORT_ENV, default=security.ORCHESTRATOR_DEFAULT_PORT,
        ) == 6001


class TestOrchestratorStartupAndErrors:
    """R3/AC3 — non-default secret required to start, debug/reload off,
    sanitized error responses, no secrets printed."""

    def test_startup_fails_without_secret(self, monkeypatch):
        with pytest.raises(RuntimeError):
            _import_orchestrator(monkeypatch, {})

    def test_startup_fails_with_default_flask_secret(self, monkeypatch):
        env = _base_env(**{security.FLASK_SECRET_ENV: security.DEFAULT_FLASK_SECRET})
        with pytest.raises(RuntimeError):
            _import_orchestrator(monkeypatch, env)

    def test_startup_succeeds_with_electron_supplied_secrets(self, monkeypatch):
        orchestrator = _import_orchestrator(monkeypatch, _base_env())
        assert orchestrator.app is not None

    def test_debug_and_reload_disabled(self):
        text = ORCHESTRATOR_PATH.read_text()
        assert "debug=False" in text
        assert "use_reloader=False" in text
        assert "debug=True" not in text
        assert 'host="0.0.0.0"' not in text
        assert "security.get_server_host" in text

    def test_secrets_not_printed(self):
        text = ORCHESTRATOR_PATH.read_text()
        assert "bonzai-secret-key" not in text
        assert "print(" not in text

    def test_error_response_is_sanitized(self, orchestrator_client):
        # A step missing "task" raises KeyError inside execute_workflow; the
        # response must be a generic JSON error, never a Werkzeug traceback
        # page or the exception's own message/file paths.
        r = orchestrator_client.post(
            "/execute", json={"steps": [{"endpoint": "/x"}]},
            headers={"x-bonzai-session": SESSION_CRED},
        )
        assert r.status_code == 500
        body = r.get_json()
        assert body == {"error": "Internal server error"}
        text = r.get_data(as_text=True)
        for leak in ("Traceback", "KeyError", "orchestrator.py", "line "):
            assert leak not in text

    def test_unauthorized_response_carries_no_secret(self, orchestrator_client):
        r = orchestrator_client.post("/execute", json={"steps": []})
        assert SESSION_CRED not in r.get_data(as_text=True)


# ─────────────────────────────────────────────────────────────────────────────
# P4 — media path confinement (/media/stream, /media/info)
#
# resolve_media_path() in diffuser.py is the ONE canonical validator behind
# both endpoints: roots are ONLY the configured MODEL_DIR/FILES_DIR, resolved
# through filesystem links, with component-aware containment (Path.relative_to)
# so a `..`/symlink escape or a sibling directory that merely shares the root's
# string prefix cannot pass. These tests exercise the real diffuser.py Flask
# app with MODEL_DIR/FILES_DIR pointed at an isolated tmp_path; like
# TestRouteMapAuth.test_real_diffuser_url_map_guarded above, they skip when
# the torch/diffusers stack isn't installed.
# ─────────────────────────────────────────────────────────────────────────────

AUTH = {"x-bonzai-session": SESSION_CRED}


def _import_diffuser(monkeypatch, model_dir: Path):
    """Import (or reload) diffuser.py with BONZAI_MODEL_DIR pointed at
    model_dir, so MODEL_DIR/FILES_DIR are test-scoped. Skips the caller's
    test if the torch/diffusers stack isn't installed."""
    for k, v in _base_env().items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("BONZAI_MODEL_DIR", str(model_dir))
    try:
        if "diffuser" in sys.modules:
            return importlib.reload(sys.modules["diffuser"])
        return importlib.import_module("diffuser")
    except ImportError:
        pytest.skip("diffuser.py not importable without the torch/diffusers stack")


@pytest.fixture
def media(monkeypatch, tmp_path):
    """Real diffuser app with a populated MODEL_DIR/FILES_DIR tree, plus
    out-of-root fixtures (home/temp/external/sibling-prefix/symlink-escape)
    for denial tests."""
    model_dir = (tmp_path / "bonzai-models").resolve()
    files_dir = model_dir / "files"
    files_dir.mkdir(parents=True)

    model_video = model_dir / "model_clip.mp4"
    model_video.write_bytes(b"MODEL-ROOT-VIDEO-BYTES" * 100)

    files_video = files_dir / "gen_clip.mp4"
    files_video.write_bytes(b"FILES-ROOT-VIDEO-BYTES" * 100)

    unsupported = files_dir / "notes.txt"
    unsupported.write_text("not media")

    # Out-of-root fixtures for denial tests.
    home_secret = Path.home() / f"__bonzai_test_secret_{os.getpid()}.mp4"
    home_secret.write_bytes(b"HOME-SECRET-BYTES")

    tmp_secret = Path(tempfile.gettempdir()) / f"__bonzai_test_secret_{os.getpid()}.mp4"
    tmp_secret.write_bytes(b"TMP-SECRET-BYTES")

    try:
        external_root = tmp_path / "external-volume"
        external_root.mkdir()
        external_secret = external_root / "secret.mp4"
        external_secret.write_bytes(b"EXTERNAL-SECRET-BYTES")

        sibling_root = tmp_path / "bonzai-models-evil"  # shares MODEL_DIR's string prefix
        sibling_root.mkdir()
        sibling_secret = sibling_root / "secret.mp4"
        sibling_secret.write_bytes(b"SIBLING-SECRET-BYTES")

        outside_target_dir = tmp_path / "outside-target"
        outside_target_dir.mkdir()
        outside_secret = outside_target_dir / "outside.mp4"
        outside_secret.write_bytes(b"SYMLINK-ESCAPE-SECRET-BYTES")
        in_root_symlink = files_dir / "escape_link.mp4"
        in_root_symlink.symlink_to(outside_secret)

        diffuser = _import_diffuser(monkeypatch, model_dir)
        client = diffuser.app.test_client()

        yield SimpleNamespace(
            client=client,
            model_dir=model_dir,
            files_dir=files_dir,
            model_video=model_video,
            files_video=files_video,
            unsupported=unsupported,
            home_secret=home_secret,
            tmp_secret=tmp_secret,
            external_secret=external_secret,
            sibling_secret=sibling_secret,
            in_root_symlink=in_root_symlink,
            outside_secret=outside_secret,
        )
    finally:
        for p in (home_secret, tmp_secret):
            try:
                p.unlink()
            except OSError:
                pass


class TestMediaConfinementPositive:
    def test_info_under_model_root(self, media):
        r = media.client.get("/media/info", query_string={"path": str(media.model_video)}, headers=AUTH)
        assert r.status_code == 200
        body = r.get_json()
        assert body["exists"] is True
        assert body["size"] == media.model_video.stat().st_size
        assert body["mime_type"] == "video/mp4"

    def test_info_under_files_root(self, media):
        r = media.client.get("/media/info", query_string={"path": str(media.files_video)}, headers=AUTH)
        assert r.status_code == 200
        body = r.get_json()
        assert body["exists"] is True
        assert body["mime_type"] == "video/mp4"

    def test_stream_full_file_under_model_root(self, media):
        r = media.client.get("/media/stream", query_string={"path": str(media.model_video)}, headers=AUTH)
        assert r.status_code == 200
        assert r.data == media.model_video.read_bytes()

    def test_stream_full_file_under_files_root(self, media):
        r = media.client.get("/media/stream", query_string={"path": str(media.files_video)}, headers=AUTH)
        assert r.status_code == 200
        assert r.data == media.files_video.read_bytes()

    def test_stream_range_request_under_files_root(self, media):
        content = media.files_video.read_bytes()
        r = media.client.get(
            "/media/stream", query_string={"path": str(media.files_video)},
            headers={**AUTH, "Range": "bytes=0-4"},
        )
        assert r.status_code == 206
        assert r.data == content[0:5]
        assert r.headers["Content-Range"] == f"bytes 0-4/{len(content)}"
        assert r.headers["Accept-Ranges"] == "bytes"

    def test_stream_url_has_no_credentials(self, media):
        r = media.client.get("/media/info", query_string={"path": str(media.files_video)}, headers=AUTH)
        stream_url = r.get_json()["stream_url"]
        assert stream_url.startswith("/media/stream?path=")
        for leak in (SESSION_CRED, "session", "token", "Bearer", "Authorization"):
            assert leak.lower() not in stream_url.lower()
        # The returned stream_url itself must still be usable and authorized.
        follow = media.client.get(stream_url, headers=AUTH)
        assert follow.status_code == 200
        assert follow.data == media.files_video.read_bytes()

    def test_symlinked_root_resolves_through_link(self, monkeypatch, tmp_path):
        real_storage = tmp_path / "real-storage"
        (real_storage / "files").mkdir(parents=True)
        linked_model_dir = tmp_path / "bonzai-models-link"
        linked_model_dir.symlink_to(real_storage, target_is_directory=True)
        vid = real_storage / "files" / "clip.mp4"
        vid.write_bytes(b"LINKED-ROOT-BYTES")

        diffuser = _import_diffuser(monkeypatch, linked_model_dir)
        client = diffuser.app.test_client()

        r = client.get("/media/stream", query_string={"path": str(vid)}, headers=AUTH)
        assert r.status_code == 200
        assert r.data == b"LINKED-ROOT-BYTES"


class TestMediaConfinementDenials:
    ENDPOINTS = ("/media/stream", "/media/info")

    def _assert_denied(self, resp, endpoint, secret_bytes=None, rejected_path=None):
        if endpoint == "/media/stream":
            assert resp.status_code == 403
        else:
            assert resp.status_code == 200
            assert resp.get_json() == {"exists": False}
        body = resp.get_data(as_text=True)
        if secret_bytes is not None:
            assert secret_bytes.decode("latin-1") not in resp.get_data(as_text=True)
        if rejected_path is not None:
            assert str(rejected_path) not in body

    def test_unauthenticated_denied(self, media):
        for endpoint in self.ENDPOINTS:
            r = media.client.get(endpoint, query_string={"path": str(media.files_video)})
            assert r.status_code == 401

    def test_home_directory_denied(self, media):
        for endpoint in self.ENDPOINTS:
            r = media.client.get(endpoint, query_string={"path": str(media.home_secret)}, headers=AUTH)
            self._assert_denied(r, endpoint, b"HOME-SECRET-BYTES", media.home_secret)

    def test_temp_directory_denied(self, media):
        for endpoint in self.ENDPOINTS:
            r = media.client.get(endpoint, query_string={"path": str(media.tmp_secret)}, headers=AUTH)
            self._assert_denied(r, endpoint, b"TMP-SECRET-BYTES", media.tmp_secret)

    def test_external_volume_denied(self, media):
        for endpoint in self.ENDPOINTS:
            r = media.client.get(endpoint, query_string={"path": str(media.external_secret)}, headers=AUTH)
            self._assert_denied(r, endpoint, b"EXTERNAL-SECRET-BYTES", media.external_secret)

    def test_sibling_prefix_directory_denied(self, media):
        # bonzai-models-evil shares MODEL_DIR's string prefix but is a
        # different directory; a startswith()-style check would wrongly admit it.
        for endpoint in self.ENDPOINTS:
            r = media.client.get(endpoint, query_string={"path": str(media.sibling_secret)}, headers=AUTH)
            self._assert_denied(r, endpoint, b"SIBLING-SECRET-BYTES", media.sibling_secret)

    def test_dot_dot_traversal_denied(self, media):
        traversal = media.files_dir / ".." / ".." / "bonzai-models-evil" / "secret.mp4"
        for endpoint in self.ENDPOINTS:
            r = media.client.get(endpoint, query_string={"path": str(traversal)}, headers=AUTH)
            self._assert_denied(r, endpoint, b"SIBLING-SECRET-BYTES")

    def test_encoded_traversal_denied(self, media):
        # Percent-encoded ".." segments decode (by Werkzeug, as they would by
        # any front-end) to the same literal traversal before reaching the
        # validator, and must be denied identically.
        raw = f"{media.files_dir}/%2e%2e/%2e%2e/bonzai-models-evil/secret.mp4"
        for endpoint in self.ENDPOINTS:
            r = media.client.get(f"{endpoint}?path={raw}", headers=AUTH)
            self._assert_denied(r, endpoint, b"SIBLING-SECRET-BYTES")

    def test_directory_denied(self, media):
        for endpoint in self.ENDPOINTS:
            r = media.client.get(endpoint, query_string={"path": str(media.files_dir)}, headers=AUTH)
            self._assert_denied(r, endpoint)

    def test_unsupported_media_type_denied(self, media):
        for endpoint in self.ENDPOINTS:
            r = media.client.get(endpoint, query_string={"path": str(media.unsupported)}, headers=AUTH)
            self._assert_denied(r, endpoint)

    def test_missing_file_denied(self, media):
        missing = media.files_dir / "does-not-exist.mp4"
        for endpoint in self.ENDPOINTS:
            r = media.client.get(endpoint, query_string={"path": str(missing)}, headers=AUTH)
            self._assert_denied(r, endpoint)

    def test_in_root_symlink_to_outside_denied(self, media):
        # The symlink itself lives inside FILES_DIR, but it resolves to a
        # target outside every configured root and must be denied.
        for endpoint in self.ENDPOINTS:
            r = media.client.get(
                endpoint, query_string={"path": str(media.in_root_symlink)}, headers=AUTH)
            self._assert_denied(r, endpoint, b"SYMLINK-ESCAPE-SECRET-BYTES", media.outside_secret)


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q"]))
