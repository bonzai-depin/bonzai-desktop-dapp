# Flask executor for agentic workflow.
#
# Hardened per bonzai-sec-P5: loopback-bound, requires the Electron-issued
# session credential (x-bonzai-session / BONZAI_SESSION_CREDENTIAL) on every
# route, trusted-origin CORS only, non-default Flask secret required to
# start, debug/reload always off, and sanitized error responses. Reuses the
# P3 security primitives in bonzai_security.py (see its module docstring for
# the shared threat model).
from __future__ import annotations

import os

from flask import Flask, request, jsonify
from werkzeug.exceptions import HTTPException
import requests

import bonzai_security as security

# R3: refuse to start without a non-default Flask secret and the Electron
# -supplied scoped session credential (raises RuntimeError; never logged).
security.validate_startup_secrets(os.environ)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ[security.FLASK_SECRET_ENV]

# R2: trusted-origin CORS only, under the orchestrator's own env var so it
# can be configured independently of the inference server.
security.install_cors(app, env=os.environ, origins_env_var=security.ORCHESTRATOR_TRUSTED_ORIGINS_ENV)

# R1: every route requires the scoped local session credential. The
# orchestrator has no wallet/economy routes, so wallet Bearer JWTs are never
# accepted here (see install_session_credential_auth docstring).
security.install_session_credential_auth(app, env=os.environ)

# R1/R2: execute_workflow dispatches each step back into this same Flask
# process over HTTP, so its target must track the actual bind host/port
# (BONZAI_ORCHESTRATOR_HOST/PORT) and must present the same scoped session
# credential the auth guard above now requires on every route -- otherwise
# every non-empty workflow 401s against itself.
_SELF_HOST = security.get_server_host(os.environ, env_var=security.ORCHESTRATOR_HOST_ENV)
_SELF_PORT = security.get_server_port(
    os.environ, env_var=security.ORCHESTRATOR_PORT_ENV,
    default=security.ORCHESTRATOR_DEFAULT_PORT,
)


@app.errorhandler(Exception)
def _sanitize_errors(exc):
    """Never leak stack traces, secrets, or interactive tracebacks (R3)."""
    if isinstance(exc, HTTPException):
        return jsonify({"error": exc.description}), exc.code
    app.logger.exception("Unhandled error executing workflow")
    return jsonify({"error": "Internal server error"}), 500


@app.route("/execute", methods=["POST"])
def execute_workflow():
    payload = request.get_json(silent=True) or {}
    steps = payload.get("steps", [])
    data_context = {}

    for step in steps:
        task = step["task"]
        endpoint = step["endpoint"]
        input_expr = step.get("input")

        if isinstance(input_expr, str):
            # Evaluate dotted input path (e.g. json.meals[0].description)
            value = resolve_input(data_context, input_expr)
        else:
            value = input_expr

        # POST request back to this same Flask service, on its actual bind
        # host/port and carrying the scoped session credential the auth guard
        # requires (see _SELF_HOST/_SELF_PORT above).
        response = requests.post(
            f"http://{_SELF_HOST}:{_SELF_PORT}{endpoint}",
            json={"input": value},
            headers={"x-bonzai-session": os.environ.get(security.SESSION_CREDENTIAL_ENV, "")},
        )
        result = response.json()

        # Store result under step name
        data_context[task] = result

    return jsonify(data_context), 200


def resolve_input(ctx, path):
    parts = path.split('.')
    for part in parts:
        if part.endswith(']') and '[' in part:
            key, idx = part[:-1].split('[')
            ctx = ctx.get(key, [])[int(idx)]
        else:
            ctx = ctx.get(part)
    return ctx


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="BonzAI Workflow Orchestrator")
    parser.add_argument(
        "--port", type=int, default=_SELF_PORT,
        help="Port to run the orchestrator on (default: BONZAI_ORCHESTRATOR_PORT or 5000)",
    )
    args = parser.parse_args()

    # A --port override must also update the target execute_workflow dispatches
    # to, or a non-default port would leave every non-empty workflow calling
    # the wrong port (see _SELF_HOST/_SELF_PORT above).
    _SELF_PORT = args.port

    # R2: loopback-only bind; R3: debug and reload always off.
    app.run(host=_SELF_HOST, port=_SELF_PORT, debug=False, use_reloader=False)
