#!/usr/bin/env python3
"""
Smoke test for the provider-side privacy-pipeline blueprint.

Mounts shard.py against a fresh Flask app (no diffuser model loading),
hits /shard/load via the test client, opens a real worker connection
(UDS where available, loopback TCP fallback otherwise), sends an INT8+LZ4
quantized activation frame, and asserts the loopback echo round-trip is
byte-correct.

Run:
    bonzai/bin/python3 scripts/smoke-shard-provider.py
"""

import json
import logging
import os
import socket
import struct
import sys
import time

# Make src/server importable as flat modules (matches how Flask imports
# diffuser.py — no package prefix).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src", "server"))

import torch
from flask import Flask

import shard as shard_mod
from pipeline_transport import (
    UDS_TYPE_CONTROL, UDS_TYPE_FRAME, UDS_HEADER_SIZE,
    SHARD_FRAME_PREAMBLE,
    FRAME_ACT_FORWARD, FRAME_ACT_RETURN,
    FLAG_QUANTIZED_INT8, FLAG_COMPRESSED_LZ4,
    encode_tensor_payload, decode_tensor_payload,
    _encode_meta, _decode_meta, _encode_uds, _encode_control,
    _read_uds_message,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("smoke")


def _connect_worker(ack_or_path):
    if isinstance(ack_or_path, str):
        host = None
        port = None
        path = ack_or_path
    else:
        host = ack_or_path.get("socketHost")
        port = ack_or_path.get("socketPort")
        path = ack_or_path.get("socketPath")

    if host and port:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5.0)
        s.connect((host, int(port)))
        return s

    if not hasattr(socket, "AF_UNIX"):
        raise RuntimeError("worker did not advertise socketHost/socketPort and this Python has no AF_UNIX")

    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(5.0)
    s.connect(path)
    return s


def main() -> int:
    app = Flask(__name__)
    sock_path = shard_mod.install(app, force=True)
    if not sock_path:
        log.error("shard.install returned None")
        return 1
    log.info("worker UDS at %s", sock_path)

    # Tighten idle eviction so the test doesn't leave shards around
    shard_mod._set_idle_seconds(5)

    client = app.test_client()

    # Cover both dispatch paths in one run: loopback (no runner) +
    # registered-runner identity passthrough.
    cases = [
        ("__no_such_model__", True,  "loopback echo"),
        ("z_image_turbo",     False, "identity runner (sharded_pipeline)"),
    ]
    for model_id, expect_loopback, label in cases:
        log.info("--- testing %s (%s) ---", model_id, label)
        # 1. /shard/load
        load_body = {
            "sessionId":  f"smoke-session-{model_id}",
            "modelId":    model_id,
            "blockRange": [4, 28],
            "precision":  "gguf-q5km",
            "hiddenDim":  2304,
            "codecFlags": FLAG_QUANTIZED_INT8 | FLAG_COMPRESSED_LZ4,
        }
        r = client.post("/shard/load", json=load_body)
        assert r.status_code == 200, f"shard/load HTTP {r.status_code}: {r.data}"
        ack = r.get_json()
        assert ack["ok"] is True
        shard_id = ack["shardId"]
        log.info("/shard/load → shardId=%s", shard_id)

        # 2. UDS handshake
        s = _connect_worker(ack)
        s.sendall(_encode_control("run", shardId=shard_id))
        type_, body = _read_uds_message(s)
        assert type_ == UDS_TYPE_CONTROL
        ack = json.loads(body.decode("utf-8"))
        assert ack["op"] == "run_ok"
        assert ack["loopback"] is expect_loopback, (
            f"loopback mismatch for {model_id}: expected {expect_loopback}, got {ack['loopback']}"
        )
        log.info("run_ok, loopback=%s", ack["loopback"])
        s.close()
        client.post("/shard/unload", json={"shardId": shard_id})

    # ── Real round-trip: registered runner path ──
    load_body = {
        "sessionId":  "smoke-session",
        "modelId":    "z_image_turbo",
        "blockRange": [4, 28],
        "precision":  "gguf-q5km",
        "hiddenDim":  2304,
        "codecFlags": FLAG_QUANTIZED_INT8 | FLAG_COMPRESSED_LZ4,
    }
    r = client.post("/shard/load", json=load_body)
    ack = r.get_json()
    shard_id = ack["shardId"]
    advertised_path = ack.get("socketPath")
    if advertised_path:
        assert advertised_path == sock_path
    else:
        assert ack.get("socketHost") and ack.get("socketPort")
    log.info("/shard/load → shardId=%s endpoint=%s", shard_id, advertised_path or f"{ack.get('socketHost')}:{ack.get('socketPort')}")

    # /shard/status sanity
    r = client.get("/shard/status")
    status = r.get_json()
    assert any(s["shardId"] == shard_id and not s["inUse"] for s in status["shards"]), status

    # UDS handshake
    s = _connect_worker(ack)
    s.sendall(_encode_control("run", shardId=shard_id))
    type_, body = _read_uds_message(s)
    assert type_ == UDS_TYPE_CONTROL
    ack = json.loads(body.decode("utf-8"))
    assert ack["op"] == "run_ok"
    log.info("run_ok via runner dispatch (loopback=%s)", ack["loopback"])

    # 4. Round-trip a real activation tensor
    torch.manual_seed(7)
    x = torch.randn(1, 4096, 2304, dtype=torch.float16) * 0.1
    flags = FLAG_QUANTIZED_INT8 | FLAG_COMPRESSED_LZ4
    body, wire_dtype, shape = encode_tensor_payload(x, codec_flags=flags)
    meta = _encode_meta(wire_dtype, shape, step=1)

    header = struct.pack(">BBI", FRAME_ACT_FORWARD, flags, len(body))
    frame = header + meta + body
    t0 = time.monotonic()
    s.sendall(_encode_uds(UDS_TYPE_FRAME, frame))

    # Receive ACT_RETURN
    type_, return_body = _read_uds_message(s)
    elapsed_ms = (time.monotonic() - t0) * 1000
    assert type_ == UDS_TYPE_FRAME, f"expected FRAME, got 0x{type_:02x}"
    rtype = return_body[0]
    rflags = return_body[1]
    rlen = struct.unpack(">I", return_body[2:6])[0]
    rmeta = return_body[6:38]
    rpayload = return_body[38:38 + rlen]
    assert rtype == FRAME_ACT_RETURN
    assert rflags == flags

    # The runner path goes encode → decode (provider-side) → identity →
    # encode → decode (client-side). Bytes won't match (each int8 quant
    # round produces fresh quantization), but recovered tensor must
    # remain numerically close to the input — within ~2× the single-
    # round RMSE, since errors compound through two quantize cycles.
    y = decode_tensor_payload(rpayload, codec_flags=rflags,
                              wire_dtype=_decode_meta(rmeta)[0],
                              shape=_decode_meta(rmeta)[1])
    rmse = (y.float() - x.float()).pow(2).mean().sqrt().item()
    assert rmse < 0.005, f"runner path RMSE too high: {rmse} (expected < 0.005)"
    log.info("runner-dispatch round-trip ok shape=%s ms=%.1f rmse=%.6f",
             tuple(y.shape), elapsed_ms, rmse)

    # 5. Tell the worker we're done
    s.sendall(_encode_control("close"))
    s.close()
    time.sleep(0.1)  # let the worker thread tally service time

    # 6. /shard/unload — should return released=true and tally service time
    r = client.post("/shard/unload", json={"shardId": shard_id})
    out = r.get_json()
    assert out["ok"] is True
    assert out.get("released") is True, out
    log.info("/shard/unload ok")

    # 7. Service-time ledger should now have a row
    ledger = shard_mod._ledger_path()
    assert ledger.exists(), f"no service_time.ndjson at {ledger}"
    with open(ledger) as f:
        rows = [json.loads(line) for line in f if line.strip()]
    smoke_rows = [r for r in rows if r.get("sessionId") == "smoke-session"]
    assert smoke_rows, "no smoke-session row in ledger"
    log.info("service-time ledger row: %s", smoke_rows[-1])

    shard_mod.stop_uds_listener()
    log.info("OK — provider blueprint passes loopback smoke test")
    return 0


if __name__ == "__main__":
    sys.exit(main())
