"""
Privacy-pipeline provider blueprint.

Mounted on the diffuser Flask app only when BonzAI is running in
"provider" mode. Exposes:

  HTTP control plane (port 65000, same Flask process as the rest)
    POST /shard/load       — allocate a layer slice for a session
    POST /shard/unload     — free a slice
    GET  /shard/status     — diagnostic snapshot

  local data plane (separate listener, this module owns it)
    AF_UNIX path: <tempdir>/bonzai-shard-worker-<pid>.sock
    or loopback TCP on Python builds without AF_UNIX
    Protocol:     same UDS framing as src/main/shardSession.js
                  (1B type + 4B BE length + body)
    First message MUST be a CONTROL with op="run" carrying a shardId
    that was already returned by /shard/load. Subsequent messages are
    binary shard frames carrying activations (see pipeline.protocol.js
    for the byte-level spec). Provider sends ACT_RETURN frames back on
    the same connection.

Loopback mode (default until DiT adapters land): /shard/run echoes each
ACT_FORWARD as ACT_RETURN with the same payload bytes. Lets us
end-to-end-test the bridge before any model code ships. To enable real
shard execution, populate `_SHARD_RUNNERS[modelId]` with a callable
`(hidden, conditioning, step) -> hidden` and the run loop will dispatch
through it instead of echoing.

No payment plumbing — remote inference is free, and providers earn from
BonzaiMintPool at epoch end via BonzaiServiceTime.recordServiceTime. We
write `(pipelineId, secondsServed)` rows to ~/bonzai-server/service_time.ndjson;
serviceTime.service.js batches them into on-chain submissions.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import struct
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

from flask import Blueprint, jsonify, request

# Reuse the wire constants + codec from the consumer-side transport so
# encode/decode match byte-for-byte across both ends.
from pipeline_transport import (
    UDS_TYPE_CONTROL,
    UDS_TYPE_FRAME,
    UDS_HEADER_SIZE,
    SHARD_FRAME_VERSION,
    SHARD_FRAME_HEADER_SIZE,
    SHARD_FRAME_META_SIZE,
    SHARD_FRAME_PREAMBLE,
    FRAME_CTRL_BEGIN,
    FRAME_ACT_FORWARD,
    FRAME_ACT_RETURN,
    FRAME_COND_FORWARD,
    FRAME_CTRL_DONE,
    FRAME_CTRL_ERROR,
    FLAG_COMPRESSED_LZ4,
    FLAG_QUANTIZED_INT8,
    FLAG_DIM_SHUFFLED,
    PYTHON_SUPPORTED_FLAGS,
    DTYPE_FP16,
    DTYPE_INT8,
    encode_tensor_payload,
    decode_tensor_payload,
    _encode_meta,
    _decode_meta,
    _encode_uds,
    _encode_control,
    _read_uds_message,
)

logger = logging.getLogger("bonzai-server")

bp = Blueprint("shard", __name__)

# ─────────────────────────────────────────────────────────────────────────
# SHARD REGISTRY
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class ShardRecord:
    shard_id: str
    session_id: str
    model_id: str
    block_range: Tuple[int, int]
    precision: str
    hidden_dim: int
    vram_mb: int
    runner: Optional[Callable[[Any, Any, int], Any]]
    loaded_at: float = field(default_factory=time.monotonic)
    last_used_at: float = field(default_factory=time.monotonic)
    in_use: bool = False
    started_serving_at: Optional[float] = None
    seconds_served: float = 0.0


_REGISTRY: Dict[str, ShardRecord] = {}
_REGISTRY_LOCK = threading.Lock()

# Map from model_id → callable executing one forward pass through the
# shard's layers. Populated by the per-DiT adapters in
# sharded_pipeline.py (Z-Image, LTX-2, Wan 2.2, …) when they're
# imported. Empty by default → loopback echo mode for bridge testing.
_SHARD_RUNNERS: Dict[str, Callable] = {}

# Idle-evict shards that haven't been used for this many seconds. Frees
# VRAM if a session crashed without sending SHARD_UNLOAD. Tightens to a
# few seconds in tests via _set_idle_seconds.
_IDLE_SECONDS = 60.0


def register_runner(model_id: str, runner: Callable) -> None:
    """
    Adapter modules call this on import to register themselves. The
    runner signature is `runner(hidden_tensor, conditioning_tensor, step)
    -> hidden_tensor`. The shard.run loop wraps this with codec encode/
    decode and frame I/O.
    """
    _SHARD_RUNNERS[model_id] = runner
    logger.info("[shard] runner registered: %s", model_id)


def _set_idle_seconds(seconds: float) -> None:
    """Test hook — shorten idle eviction so unit tests don't block 60s."""
    global _IDLE_SECONDS
    _IDLE_SECONDS = float(seconds)


# ─────────────────────────────────────────────────────────────────────────
# SERVICE-TIME LEDGER (provider-side, tracks billable seconds per session)
# ─────────────────────────────────────────────────────────────────────────

# Keep in sync with src/main/shardSession.js's ledgerPath() — both write
# to the same NDJSON file, the on-chain submitter reads + truncates.
def _ledger_path() -> Path:
    home = os.environ.get("HOME") or os.environ.get("USERPROFILE") or tempfile.gettempdir()
    p = Path(home) / "bonzai-server" / "service_time.ndjson"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


# pipelineId mapping mirrors p2p.contract.service.js PIPELINE_CATEGORY_IDS.
# Reported as the underlying generation category (image_quality=2 etc.),
# not PIPELINE_SHARD=11, so rewards flow to the same MintPool the mint
# fees fund. Confirmed against BonzaiServiceTime.sol pool mapping before
# mainnet — see open item (1) in the plan.
_PIPELINE_ID = {
    "z_image_turbo":   2,   # image_quality
    "z_image_advanced":2,
    "flux_klein":      1,   # image_turbo
    "ltx2_video":      9,   # video_fast
    "wan22_high":      9,   # video_quality (until VIDEO_QUALITY=10 lands)
    "wan22_low":       9,
    "chatterbox":      7,   # audio_quality
    "ace_step":        8,   # music
}


def _record_service_time(record: ShardRecord, seconds: float) -> None:
    pipeline_id = _PIPELINE_ID.get(record.model_id, 11)  # fallback PIPELINE_SHARD
    entry = {
        "ts": int(time.time() * 1000),
        "pipelineId": pipeline_id,
        "seconds": round(seconds, 3),
        "modelId": record.model_id,
        "shardId": record.shard_id,
        "sessionId": record.session_id,
        "blockRange": list(record.block_range),
    }
    try:
        with open(_ledger_path(), "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, separators=(",", ":")) + "\n")
    except OSError as e:
        logger.warning("[shard] service-time ledger append failed: %s", e)


# ─────────────────────────────────────────────────────────────────────────
# HTTP CONTROL PLANE
# ─────────────────────────────────────────────────────────────────────────

@bp.route("/shard/load", methods=["POST"])
def shard_load():
    """
    Allocate a layer slice for an incoming sharded inference session.

    Body: { sessionId, modelId, blockRange: [k, m], precision, hiddenDim,
            codecFlags }
    Reply: { ok: true, shardId, vramMB, supportedCodecFlags,
             frameVersion, socketPath } or 4xx { ok: false, error }
    """
    body = request.get_json(silent=True) or {}
    session_id = body.get("sessionId")
    model_id   = body.get("modelId")
    block_rng  = body.get("blockRange") or [0, 0]
    precision  = body.get("precision") or "gguf-q5km"
    hidden_dim = int(body.get("hiddenDim") or 0)
    consumer_flags = int(body.get("codecFlags") or 0)

    if not session_id or not model_id or not isinstance(block_rng, list) or len(block_rng) != 2:
        return jsonify({"ok": False, "error": "missing required fields"}), 400
    if hidden_dim <= 0 or hidden_dim > 65535:
        return jsonify({"ok": False, "error": f"hiddenDim out of range: {hidden_dim}"}), 400

    # In loopback mode the runner is None and the run loop echoes. When
    # a real DiT adapter has registered itself for this model, runner
    # gets bound below and the run loop dispatches through it.
    runner = _SHARD_RUNNERS.get(model_id)
    if runner is None:
        logger.info("[shard] /load %s blocks=%s — LOOPBACK MODE (no runner registered)",
                    model_id, block_rng)
        # Still allocate a record so the consumer can complete its
        # bridge test. VRAM "used" is 0 since no model is loaded.
        vram_mb = 0
    else:
        # Real adapters report their VRAM cost — they may need to load
        # the slice eagerly here. For now, we trust the runner to lazy-
        # load on first frame and report 0 until then.
        vram_mb = 0

    shard_id = "sh_" + uuid.uuid4().hex[:16]
    record = ShardRecord(
        shard_id=shard_id,
        session_id=session_id,
        model_id=model_id,
        block_range=(int(block_rng[0]), int(block_rng[1])),
        precision=precision,
        hidden_dim=hidden_dim,
        vram_mb=vram_mb,
        runner=runner,
    )
    with _REGISTRY_LOCK:
        _REGISTRY[shard_id] = record

    return jsonify({
        "ok": True,
        "shardId": shard_id,
        "vramMB": vram_mb,
        "supportedCodecFlags": PYTHON_SUPPORTED_FLAGS,
        "frameVersion": SHARD_FRAME_VERSION,
        **_worker_endpoint_payload(),
    })


@bp.route("/shard/unload", methods=["POST"])
def shard_unload():
    body = request.get_json(silent=True) or {}
    shard_id = body.get("shardId")
    if not shard_id:
        return jsonify({"ok": False, "error": "missing shardId"}), 400
    record = None
    with _REGISTRY_LOCK:
        record = _REGISTRY.pop(shard_id, None)
    if record is None:
        # Already evicted (idle timeout, prior unload). Idempotent OK.
        return jsonify({"ok": True, "released": False})
    # If a session ran end-to-end its seconds_served has already been
    # tallied; if we're unloading mid-flight (consumer aborted) we still
    # credit elapsed time so the provider isn't penalized for an early
    # disconnect.
    if record.in_use and record.started_serving_at is not None:
        seconds = time.monotonic() - record.started_serving_at
        record.seconds_served += seconds
    if record.seconds_served > 0:
        _record_service_time(record, record.seconds_served)
    logger.info("[shard] /unload %s — served %.2fs", shard_id, record.seconds_served)
    return jsonify({"ok": True, "released": True, "vramMB": record.vram_mb})


@bp.route("/shard/status", methods=["GET"])
def shard_status():
    now = time.monotonic()
    with _REGISTRY_LOCK:
        shards = [
            {
                "shardId":   r.shard_id,
                "modelId":   r.model_id,
                "blockRange": list(r.block_range),
                "vramMB":    r.vram_mb,
                "inUse":     r.in_use,
                "idleSec":   round(now - r.last_used_at, 2),
                "secondsServed": round(r.seconds_served, 2),
            }
            for r in _REGISTRY.values()
        ]
    return jsonify({
        "ok": True,
        "shards": shards,
        "loopback": all(r["modelId"] not in _SHARD_RUNNERS for r in shards),
        **_worker_endpoint_payload(),
        "frameVersion": SHARD_FRAME_VERSION,
    })


# ─────────────────────────────────────────────────────────────────────────
# LOCAL DATA PLANE
# ─────────────────────────────────────────────────────────────────────────

def _worker_socket_path() -> str:
    """
    The path main.js connects to for sharded data plane traffic. PID-
    suffixed so two BonzAI providers on one box don't collide. Same
    `tempfile.gettempdir()` resolution the consumer side uses, so both
    halves of the system land in the same dir on every supported OS.
    """
    return os.path.join(tempfile.gettempdir(), f"bonzai-shard-worker-{os.getpid()}.sock")


_worker_server: Optional[socket.socket] = None
_worker_thread: Optional[threading.Thread] = None
_worker_stop = threading.Event()
_worker_tcp_addr: Optional[Tuple[str, int]] = None


def _supports_unix_sockets() -> bool:
    return hasattr(socket, "AF_UNIX")


def _worker_endpoint_payload() -> Dict[str, Any]:
    if _worker_tcp_addr:
        host, port = _worker_tcp_addr
        return {"socketPath": None, "socketHost": host, "socketPort": port}
    return {"socketPath": _worker_socket_path()}


def _send_uds_control(sock: socket.socket, op: str, **fields: Any) -> None:
    sock.sendall(_encode_control(op, **fields))


def _send_shard_frame(
    sock: socket.socket,
    *,
    type_: int,
    flags: int,
    meta_bytes: bytes,
    payload: bytes,
) -> None:
    header = struct.pack(">BBI", type_ & 0xFF, flags & 0xFF, len(payload))
    frame = header + meta_bytes + payload
    sock.sendall(_encode_uds(UDS_TYPE_FRAME, frame))


def _send_error_and_close(sock: socket.socket, message: str) -> None:
    try:
        _send_uds_control(sock, "remote_error", error=message)
    except OSError:
        pass
    try:
        sock.close()
    except OSError:
        pass


def _read_shard_frame(body: bytes) -> Tuple[int, int, bytes, bytes]:
    """Decompose the shard frame body inside one UDS_TYPE_FRAME message."""
    if len(body) < SHARD_FRAME_PREAMBLE:
        raise ValueError(f"truncated shard frame: {len(body)} bytes")
    ftype  = body[0]
    fflags = body[1]
    flen   = struct.unpack(">I", body[2:6])[0]
    meta   = body[SHARD_FRAME_HEADER_SIZE : SHARD_FRAME_HEADER_SIZE + SHARD_FRAME_META_SIZE]
    payload = body[SHARD_FRAME_PREAMBLE : SHARD_FRAME_PREAMBLE + flen]
    if len(payload) != flen:
        raise ValueError(f"shard frame length mismatch: header={flen}, body={len(payload)}")
    return ftype, fflags, meta, payload


def _decompress_if_lz4(blob: bytes, flags: int) -> bytes:
    """Run-time LZ4 decompress for COND_FORWARD payloads. Activations
    have their own decompress path inside decode_tensor_payload — this
    handler exists separately so the conditioning blob (safetensors,
    not a tensor) can ride the same compression flag without being
    treated as an INT8 quantized tensor."""
    if not (flags & FLAG_COMPRESSED_LZ4):
        return blob
    try:
        import lz4.frame as _lz4
        return _lz4.decompress(blob)
    except ImportError:
        raise RuntimeError("LZ4 conditioning blob received but lz4 unavailable")


def _handle_session(client: socket.socket, peer: Any) -> None:
    """
    One UDS connection = one shard session. First message MUST be a
    CONTROL with op="run" carrying a known shardId. Subsequent messages
    are shard frames; provider replies on the same connection.
    """
    record: Optional[ShardRecord] = None
    conditioning_payload: Optional[bytes] = None
    conditioning_meta: Optional[bytes] = None
    conditioning_flags: int = 0
    conditioning_kwargs: dict = {}

    try:
        # First message: open
        type_, body = _read_uds_message(client)
        if type_ != UDS_TYPE_CONTROL:
            return _send_error_and_close(client, "first message must be CONTROL")
        ctrl = json.loads(body.decode("utf-8"))
        if ctrl.get("op") != "run":
            return _send_error_and_close(client, f"unexpected op: {ctrl.get('op')}")
        shard_id = ctrl.get("shardId")
        if not shard_id:
            return _send_error_and_close(client, "open missing shardId")
        with _REGISTRY_LOCK:
            record = _REGISTRY.get(shard_id)
            if record is None:
                return _send_error_and_close(client, f"unknown shardId: {shard_id}")
            if record.in_use:
                return _send_error_and_close(client, "shard already in use")
            record.in_use = True
            record.started_serving_at = time.monotonic()
            record.last_used_at = record.started_serving_at

        _send_uds_control(
            client, "run_ok",
            shardId=shard_id,
            frameVersion=SHARD_FRAME_VERSION,
            loopback=record.runner is None,
        )

        runner = record.runner  # snapshot — may be None (loopback)

        # Frame loop
        while not _worker_stop.is_set():
            type_, body = _read_uds_message(client)
            if type_ == UDS_TYPE_CONTROL:
                ctrl = json.loads(body.decode("utf-8"))
                if ctrl.get("op") == "close":
                    break
                continue
            if type_ != UDS_TYPE_FRAME:
                logger.warning("[shard] worker got unknown UDS type 0x%02x", type_)
                continue

            ftype, fflags, meta_bytes, payload = _read_shard_frame(body)
            record.last_used_at = time.monotonic()

            if ftype == FRAME_COND_FORWARD:
                # Two formats ride this frame type:
                #   1. Single-tensor conditioning (rank > 0 in meta) —
                #      decoded as a regular fp16/int8 tensor.
                #   2. safetensors BUNDLE (rank == 0, payload is a
                #      safetensors blob) — used by ShardedDiTPipeline
                #      to ship multi-arg conditioning kwargs.
                conditioning_payload = payload
                conditioning_meta = meta_bytes
                conditioning_flags = fflags
                _, _, _meta_rank, _ = (meta_bytes[0], meta_bytes[1], meta_bytes[1], 0)  # readability
                meta_rank = meta_bytes[1]
                if meta_rank == 0 and runner is not None and len(payload) > 0:
                    # Decompress and parse as safetensors → kwargs dict
                    try:
                        from safetensors.torch import load as _st_load
                        blob = _decompress_if_lz4(payload, fflags)
                        raw = _st_load(blob)
                        conditioning_kwargs = {}
                        for k, v in raw.items():
                            if k.endswith("__bool"):
                                conditioning_kwargs[k[:-6]] = bool(v.item())
                            elif k.endswith("__num"):
                                conditioning_kwargs[k[:-5]] = float(v.item())
                            else:
                                conditioning_kwargs[k] = v
                    except Exception as e:
                        logger.warning("[shard] failed to unpack conditioning bundle: %s", e)
                        conditioning_kwargs = {}
                continue

            if ftype == FRAME_CTRL_DONE:
                break

            if ftype != FRAME_ACT_FORWARD:
                # CTRL_BEGIN / CTRL_ERROR shouldn't arrive here
                logger.debug("[shard] worker ignoring frame type 0x%02x", ftype)
                continue

            # Process activation
            try:
                if runner is None:
                    # Loopback: echo back as ACT_RETURN with same bytes.
                    # No tensor decode/encode round-trip — saves CPU and
                    # keeps the bridge testable without any model code.
                    _send_shard_frame(
                        client,
                        type_=FRAME_ACT_RETURN,
                        flags=fflags,
                        meta_bytes=meta_bytes,
                        payload=payload,
                    )
                else:
                    wire_dtype, shape, step = _decode_meta(meta_bytes)
                    hidden = decode_tensor_payload(
                        payload,
                        codec_flags=fflags,
                        wire_dtype=wire_dtype,
                        shape=shape,
                    )
                    # Pass conditioning to the runner. Two paths:
                    #   - kwargs dict (set above when COND_FORWARD frame
                    #     was a safetensors bundle) — used by real DiT
                    #     adapters that need multi-arg conditioning
                    #   - single tensor (legacy / simple runners)
                    if conditioning_kwargs:
                        out = runner(hidden, conditioning_kwargs, step, record)
                    else:
                        cond_tensor = None
                        if conditioning_payload is not None and conditioning_meta is not None:
                            cd, cs, _ = _decode_meta(conditioning_meta)
                            if cd != 0 and cs:  # rank > 0 → real tensor
                                cond_tensor = decode_tensor_payload(
                                    conditioning_payload,
                                    codec_flags=conditioning_flags,
                                    wire_dtype=cd,
                                    shape=cs,
                                )
                        out = runner(hidden, cond_tensor, step, record)
                    out_body, out_dtype, out_shape = encode_tensor_payload(
                        out, codec_flags=fflags,
                    )
                    out_meta = _encode_meta(out_dtype, out_shape, step)
                    _send_shard_frame(
                        client,
                        type_=FRAME_ACT_RETURN,
                        flags=fflags,
                        meta_bytes=out_meta,
                        payload=out_body,
                    )
            except Exception as e:
                logger.exception("[shard] runner failed for %s step %d", record.shard_id, step if 'step' in dir() else -1)
                _send_error_and_close(client, f"runner failed: {e}")
                return

    except (ConnectionError, OSError) as e:
        logger.info("[shard] worker session ended: %s", e)
    except Exception as e:
        logger.exception("[shard] worker session crashed")
        try:
            _send_error_and_close(client, f"session crashed: {e}")
        except Exception:
            pass
    finally:
        # Tally service time for this session
        if record is not None:
            with _REGISTRY_LOCK:
                if record.started_serving_at is not None:
                    record.seconds_served += time.monotonic() - record.started_serving_at
                    record.started_serving_at = None
                record.in_use = False
                record.last_used_at = time.monotonic()
        try:
            client.close()
        except OSError:
            pass


def _idle_evictor() -> None:
    """Background thread — evicts shards that have been idle too long."""
    while not _worker_stop.is_set():
        if _worker_stop.wait(timeout=10):
            return
        now = time.monotonic()
        to_evict = []
        with _REGISTRY_LOCK:
            for sid, r in list(_REGISTRY.items()):
                if r.in_use:
                    continue
                if now - r.last_used_at > _IDLE_SECONDS:
                    to_evict.append(r)
                    del _REGISTRY[sid]
        for r in to_evict:
            if r.seconds_served > 0:
                _record_service_time(r, r.seconds_served)
            logger.info("[shard] idle-evicted %s after %.1fs (served %.2fs)",
                        r.shard_id, now - r.last_used_at, r.seconds_served)


def _accept_loop(server: socket.socket) -> None:
    server.settimeout(1.0)  # so we can poll _worker_stop
    while not _worker_stop.is_set():
        try:
            client, peer = server.accept()
        except socket.timeout:
            continue
        except OSError as e:
            if _worker_stop.is_set():
                return
            logger.warning("[shard] accept error: %s", e)
            continue
        t = threading.Thread(target=_handle_session, args=(client, peer), daemon=True)
        t.start()


def start_uds_listener() -> str:
    """
    Bind the worker socket and start the accept loop. Idempotent —
    safe to call multiple times. Uses AF_UNIX where available and
    loopback TCP on Python builds that do not expose socket.AF_UNIX.
    """
    global _worker_server, _worker_thread, _worker_tcp_addr

    if _worker_server is not None:
        if _worker_tcp_addr:
            return f"tcp://{_worker_tcp_addr[0]}:{_worker_tcp_addr[1]}"
        return _worker_socket_path()

    path = _worker_socket_path()
    if _supports_unix_sockets():
        # Stale socket from a prior crash blocks bind.
        if os.path.exists(path):
            try:
                os.unlink(path)
            except OSError:
                pass
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(path)
        endpoint = path
    else:
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(("127.0.0.1", 0))
        host, port = server.getsockname()
        _worker_tcp_addr = (host, int(port))
        endpoint = f"tcp://{host}:{port}"

    server.listen(8)
    # Owner-only — main.js connects from the same UID, no LAN exposure.
    if _supports_unix_sockets():
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass

    _worker_server = server
    _worker_stop.clear()

    _worker_thread = threading.Thread(target=_accept_loop, args=(server,), daemon=True)
    _worker_thread.start()

    threading.Thread(target=_idle_evictor, daemon=True).start()

    logger.info("[shard] worker listening at %s (loopback ready, %d runners registered)",
                endpoint, len(_SHARD_RUNNERS))
    return endpoint


def stop_uds_listener() -> None:
    """Stop the listener — used by tests + clean shutdown."""
    global _worker_server, _worker_thread, _worker_tcp_addr
    _worker_stop.set()
    if _worker_server is not None:
        try:
            _worker_server.close()
        except OSError:
            pass
        _worker_server = None
    if _worker_thread is not None:
        _worker_thread.join(timeout=2.0)
        _worker_thread = None
    _worker_tcp_addr = None
    path = _worker_socket_path()
    if os.path.exists(path):
        try:
            os.unlink(path)
        except OSError:
            pass


# ─────────────────────────────────────────────────────────────────────────
# REGISTRATION HELPER (called from diffuser.py)
# ─────────────────────────────────────────────────────────────────────────

def install(app, *, force: bool = False) -> Optional[str]:
    """
    Mount the blueprint + start the UDS listener.

    Always activated — the listener is one socket file + one thread,
    cheap enough to have running even when the user is in Local or
    Consumer mode. Gating is enforced at the libp2p side
    (src/main/shardSession.js startProviderBridge), where the inbound
    SHARD_LOAD handler is registered only when networkMode is
    "provider". This way mode changes don't require a Flask restart.

    The `force` parameter is retained for callers (tests) that want to
    explicitly enable the blueprint outside the normal install path.

    Returns the worker socket path. Idempotent.
    """
    # Allow explicit opt-out via env var — useful for headless smoke
    # tests of unrelated Flask routes that don't want the side socket.
    if os.environ.get("BONZAI_DISABLE_SHARD") == "1" and not force:
        return None

    # Import per-DiT adapters here so registration of `_SHARD_RUNNERS`
    # happens at the same point we activate the blueprint.
    try:
        import sharded_pipeline  # noqa: F401 — module side-effect
    except ImportError:
        # Adapters not built yet — loopback mode still works for bridge tests
        logger.info("[shard] sharded_pipeline not importable — loopback only")

    # Avoid double-registration if install() runs twice
    if "shard" not in app.blueprints:
        app.register_blueprint(bp)

    return start_uds_listener()
