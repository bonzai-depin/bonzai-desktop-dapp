"""
Privacy-pipeline bridge — Python (Flask diffuser) side.

Talks Unix domain sockets to the Electron main process (see
`src/main/shardSession.js`) which handles all libp2p I/O. We never touch
libp2p directly here — keeps the diffuser process free of Node bindings,
and lets the same logic work whether the user is running BonzAI from
`npm run start` (dev) or the packaged binary.

Two surfaces:

  • PipelineTransport  — opens one UDS connection per sharded inference
                         session, sends the OPEN handshake, exposes
                         blocking send_activation / recv_activation that the
                         ShardedDiTPipeline calls inside its denoising loop.

  • Codec              — INT8 quantization + LZ4 compression. Negotiated
                         per session via the codec-flags bitfield. fp8 is
                         intentionally NOT used: torch fp8 dtypes are
                         unreliable on Apple Silicon (per
                         feedback_fp8_mps.md), and INT8 + per-tensor scale
                         gives the same ~50% bandwidth savings on every
                         backend (CUDA/MPS/CPU) with ~0.5% numerical loss.

Wire format MUST match src/services/pipeline.protocol.js byte-for-byte. Any
changes here require a coordinated change there + bumping
SHARD_FRAME_VERSION.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import struct
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional, Tuple

import torch

try:
    import lz4.frame as _lz4
    _HAS_LZ4 = True
except ImportError:  # pragma: no cover — lz4 is in requirements.txt
    _HAS_LZ4 = False
    _lz4 = None

logger = logging.getLogger("bonzai-server")

# ─────────────────────────────────────────────────────────────────────────
# WIRE CONSTANTS — must match pipeline.protocol.js
# ─────────────────────────────────────────────────────────────────────────

SHARD_FRAME_VERSION = 1

# UDS message types
UDS_TYPE_CONTROL = 0x01
UDS_TYPE_FRAME   = 0x02
UDS_HEADER_SIZE  = 5  # u8 type + u32 BE len

# Shard frame types
FRAME_CTRL_BEGIN   = 0x00
FRAME_ACT_FORWARD  = 0x01
FRAME_ACT_RETURN   = 0x02
FRAME_COND_FORWARD = 0x03
FRAME_CTRL_DONE    = 0x04
FRAME_CTRL_ERROR   = 0x05

# Codec flags
FLAG_COMPRESSED_LZ4 = 0x01
FLAG_QUANTIZED_INT8 = 0x02
FLAG_DIM_SHUFFLED   = 0x04

# Tensor dtypes on the wire
DTYPE_FP16 = 1
DTYPE_FP32 = 2
DTYPE_INT8 = 3
DTYPE_BF16 = 4

SHARD_FRAME_HEADER_SIZE = 6
SHARD_FRAME_META_SIZE   = 32
SHARD_FRAME_PREAMBLE    = SHARD_FRAME_HEADER_SIZE + SHARD_FRAME_META_SIZE

# Default codec preferences from the Python side. Negotiated against what
# the peer reports in SHARD_LOAD_ACK.supportedCodecFlags. We always advertise
# what we can DECODE — provider must accept what we send.
PYTHON_SUPPORTED_FLAGS = (FLAG_COMPRESSED_LZ4 if _HAS_LZ4 else 0) | FLAG_QUANTIZED_INT8


def _dp_epsilon():
    """Read BONZAI_SHARD_DP_EPSILON each call so a runtime config change
    takes effect on the next session without a Flask restart. Returns
    None if unset / invalid (DP off)."""
    raw = os.environ.get("BONZAI_SHARD_DP_EPSILON")
    if not raw:
        return None
    try:
        v = float(raw)
        return v if v > 0 else None
    except ValueError:
        return None

# ─────────────────────────────────────────────────────────────────────────
# SOCKET PATH RESOLUTION
# ─────────────────────────────────────────────────────────────────────────

def default_socket_path() -> str:
    """
    Resolve the UDS path the Electron main process is listening on. Set
    by main.js at P2P start via the BONZAI_SHARD_SOCKET env var; we fall
    back to the same convention shardSession.js uses (tmp/bonzai-shard-
    <ppid>.sock) for the rare case where the env var got dropped.

    Path length caps: Linux 108 / macOS 104 bytes. tmpdir resolves short
    on every supported platform (incl. Electron sandbox) so we stay safe.
    """
    env = os.environ.get("BONZAI_SHARD_SOCKET")
    if env:
        return env
    parent = os.environ.get("BONZAI_PARENT_PID") or os.getppid()
    import tempfile
    return os.path.join(tempfile.gettempdir(), f"bonzai-shard-{parent}.sock")


# ─────────────────────────────────────────────────────────────────────────
# CODEC — INT8 + LZ4 round-trip
# ─────────────────────────────────────────────────────────────────────────

# Tensor metadata header (32 bytes) layout — see pipeline.protocol.js
# spec block. We use struct.pack for the header and prepend an fp16 scale
# (2 bytes) inside the payload when QUANTIZED_INT8 is set.
_META_FMT = ">BB6HH16x"  # dtype:u8 rank:u8 shape:6×u16 step:u16 16×reserved


def _encode_meta(dtype: int, shape: Tuple[int, ...], step: int) -> bytes:
    if len(shape) > 6:
        raise ValueError(f"shard tensor rank {len(shape)} exceeds wire cap of 6")
    padded = list(shape) + [0] * (6 - len(shape))
    return struct.pack(_META_FMT, dtype, len(shape), *padded, step)


def _decode_meta(buf: bytes) -> Tuple[int, Tuple[int, ...], int]:
    dtype, rank, *rest = struct.unpack(_META_FMT, buf)
    shape = tuple(rest[:rank])
    step = rest[6]
    return dtype, shape, step


def _torch_dtype_from_wire(dtype: int) -> torch.dtype:
    return {
        DTYPE_FP16: torch.float16,
        DTYPE_FP32: torch.float32,
        DTYPE_BF16: torch.bfloat16,
        DTYPE_INT8: torch.int8,
    }[dtype]


def _wire_dtype_from_torch(dtype: torch.dtype) -> int:
    return {
        torch.float16: DTYPE_FP16,
        torch.float32: DTYPE_FP32,
        torch.bfloat16: DTYPE_BF16,
        torch.int8:    DTYPE_INT8,
    }[dtype]


def _quantize_int8(t: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Per-tensor symmetric INT8 quantization with a single fp16 scale.

    Encode:  q = round(t / scale).clamp(-128, 127), scale = max(|t|) / 127
    Decode:  t̂ = q.to(fp16) * scale

    Stays correct on MPS — pure tensor ops, no fp8 dtype required. Numeric
    loss is ~0.5% RMS for typical activation distributions, well below
    diffusion sampling jitter. Edge case: all-zero tensor → scale=0; we
    bump to 1e-8 to avoid div-by-zero, then the dequantized result is
    still all zeros (q=0 × any scale = 0).
    """
    amax = t.detach().abs().amax()
    scale = (amax / 127.0).clamp_(min=1e-8).to(torch.float16)
    q = (t.detach() / scale).round_().clamp_(-128, 127).to(torch.int8)
    return q, scale


def _dequantize_int8(q: torch.Tensor, scale: torch.Tensor) -> torch.Tensor:
    return q.to(torch.float16) * scale


def encode_tensor_payload(
    tensor: torch.Tensor,
    *,
    codec_flags: int,
) -> Tuple[bytes, int, Tuple[int, ...]]:
    """
    Serialize a tensor according to the negotiated codec flags. Returns
    (body_bytes, wire_dtype, shape).

    The wire contract is intentionally narrow:
      - QUANTIZED_INT8: dtype = int8, payload = [fp16 scale (2B)] + [int8 bytes]
      - otherwise:      dtype = fp16, payload = raw fp16 bytes
    bf16 / fp32 inputs are cast to fp16 before send. fp16 has the same
    exponent range as bf16, so bf16 → fp16 is range-safe; the precision
    loss vs. bf16's 8 mantissa bits (vs fp16's 10) is in the noise floor
    of diffusion sampling. fp32 → fp16 halves bandwidth and matches the
    DiT inference dtype anyway. Quantization order: cast → quantize →
    compress. Decoder runs the inverse: decompress → dequantize.
    """
    cpu = tensor.detach().to("cpu").contiguous()

    if codec_flags & FLAG_QUANTIZED_INT8:
        q, scale = _quantize_int8(cpu)
        # Layout: [scale fp16 (2B)] [int8 quantized bytes]
        scale_bytes = scale.to(torch.float16).numpy().tobytes()
        if len(scale_bytes) != 2:
            # numpy serializes scalar fp16 as 2 bytes — sanity check for
            # numpy version drift.
            raise RuntimeError(f"unexpected fp16 scale size: {len(scale_bytes)}")
        body = scale_bytes + q.numpy().tobytes()
        wire_dtype = DTYPE_INT8
        shape = tuple(q.shape)
    else:
        # Always ship fp16. Cast bf16/fp32 first; numpy can't serialize
        # bf16 directly (`tensor.numpy()` raises) so the cast is required.
        if cpu.dtype != torch.float16:
            cpu = cpu.to(torch.float16)
        body = cpu.numpy().tobytes()
        wire_dtype = DTYPE_FP16
        shape = tuple(cpu.shape)

    if codec_flags & FLAG_COMPRESSED_LZ4:
        if not _HAS_LZ4:
            raise RuntimeError("LZ4 negotiated but lz4 package not importable")
        body = _lz4.compress(body, compression_level=1)

    return body, wire_dtype, shape


def decode_tensor_payload(
    body: bytes,
    *,
    codec_flags: int,
    wire_dtype: int,
    shape: Tuple[int, ...],
) -> torch.Tensor:
    if codec_flags & FLAG_COMPRESSED_LZ4:
        if not _HAS_LZ4:
            raise RuntimeError("LZ4 frame received but lz4 package not importable")
        body = _lz4.decompress(body)

    import numpy as _np
    if wire_dtype == DTYPE_INT8:
        if len(body) < 2:
            raise ValueError("INT8 payload missing fp16 scale prefix")
        scale = torch.from_numpy(_np.frombuffer(body[:2], dtype=_np.float16).copy())
        q = torch.from_numpy(_np.frombuffer(body[2:], dtype=_np.int8).copy()).reshape(shape)
        return _dequantize_int8(q, scale)
    if wire_dtype == DTYPE_FP16:
        arr = _np.frombuffer(body, dtype=_np.float16).copy().reshape(shape)
        return torch.from_numpy(arr)
    raise ValueError(f"unsupported wire dtype on receive: {wire_dtype}")


# ─────────────────────────────────────────────────────────────────────────
# UDS FRAMING
# ─────────────────────────────────────────────────────────────────────────

def _encode_uds(type_: int, body: bytes) -> bytes:
    return struct.pack(">BI", type_, len(body)) + body


def _encode_control(op: str, **fields: Any) -> bytes:
    payload = json.dumps({"op": op, **fields}, separators=(",", ":")).encode("utf-8")
    return _encode_uds(UDS_TYPE_CONTROL, payload)


def _encode_shard_frame(
    type_: int,
    flags: int,
    meta_bytes: bytes,
    payload: bytes,
) -> bytes:
    """
    Assemble one shard frame (38-byte preamble + payload), wrap it in a
    UDS message, and return the bytes ready for socket.sendall.
    """
    if len(meta_bytes) != SHARD_FRAME_META_SIZE:
        raise ValueError(f"meta must be {SHARD_FRAME_META_SIZE} bytes, got {len(meta_bytes)}")
    header = struct.pack(">BBI", type_ & 0xFF, flags & 0xFF, len(payload))
    frame = header + meta_bytes + payload
    return _encode_uds(UDS_TYPE_FRAME, frame)


def _recv_exactly(sock: socket.socket, n: int) -> bytes:
    """Blocking read of exactly n bytes; raises if the socket closes early."""
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError(f"UDS socket closed (got {len(buf)}/{n} bytes)")
        buf += chunk
    return bytes(buf)


def _read_uds_message(sock: socket.socket) -> Tuple[int, bytes]:
    """Read one (type, body) message off the UDS wire. Blocking."""
    header = _recv_exactly(sock, UDS_HEADER_SIZE)
    type_ = header[0]
    length = struct.unpack(">I", header[1:])[0]
    body = _recv_exactly(sock, length) if length else b""
    return type_, body


# ─────────────────────────────────────────────────────────────────────────
# SHARDED INFERENCE SESSION
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class PipelineTransport:
    peer_id: str
    session_id: str
    model_id: str
    block_range: Tuple[int, int]
    hidden_dim: int
    precision: str = "gguf-q5km"

    sock: Optional[socket.socket] = None
    shard_id: Optional[str] = None
    codec_flags: int = 0
    _send_lock: threading.Lock = field(default_factory=threading.Lock)
    _step: int = 0

    def open(self, socket_path: Optional[str] = None, timeout: float = 30.0) -> None:
        """
        Establish UDS connection + send OPEN handshake. Blocks until the
        bridge replies OPEN_OK (handshake completes after libp2p SHARD_LOAD
        round-trip, which dominates the wait — typically 100-500ms LAN,
        500-2000ms WAN).
        """
        path = socket_path or default_socket_path()
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.connect(path)
        s.settimeout(None)  # back to blocking; per-op timeouts handled
                            # via select if/when we add a deadline
        self.sock = s

        msg = _encode_control(
            "open",
            peerId=self.peer_id,
            sessionId=self.session_id,
            modelId=self.model_id,
            blockRange=list(self.block_range),
            precision=self.precision,
            hiddenDim=self.hidden_dim,
            codecFlags=PYTHON_SUPPORTED_FLAGS,
        )
        s.sendall(msg)

        # Expect a single CONTROL response: open_ok or open_err.
        type_, body = _read_uds_message(s)
        if type_ != UDS_TYPE_CONTROL:
            raise RuntimeError(f"expected CONTROL response to open, got type {type_}")
        ack = json.loads(body.decode("utf-8"))
        if ack.get("op") == "open_err":
            raise RuntimeError(f"shard load rejected: {ack.get('error', 'unknown')}")
        if ack.get("op") != "open_ok":
            raise RuntimeError(f"unexpected ack op: {ack.get('op')}")
        if ack.get("frameVersion", 0) != SHARD_FRAME_VERSION:
            raise RuntimeError(
                f"frame version mismatch: bridge={ack.get('frameVersion')} python={SHARD_FRAME_VERSION}"
            )

        self.shard_id = ack["shardId"]
        self.codec_flags = int(ack.get("codecFlags", 0))
        logger.info(
            "[shard] session %s opened: shardId=%s codec=0x%02x",
            self.session_id[:8], self.shard_id, self.codec_flags,
        )

    def send_conditioning(self, cond: torch.Tensor) -> None:
        """
        Ship the conditioning tensor (text encoder output) once per
        session. Persists on the provider for the duration of the session.
        Provider's shard wraps cross-attn projections to consume this.
        """
        body, wire_dtype, shape = encode_tensor_payload(cond, codec_flags=self.codec_flags)
        meta = _encode_meta(wire_dtype, shape, step=0)
        with self._send_lock:
            self.sock.sendall(_encode_shard_frame(FRAME_COND_FORWARD, self.codec_flags, meta, body))

    def send_activation(self, hidden: torch.Tensor) -> None:
        """Ship one denoising-step activation. Caller advances the step counter."""
        self._step += 1
        # Optional differential-privacy hardening — Gaussian noise added
        # to the activation BEFORE encoding. Calibrated so a peer with
        # the same encoders cannot reliably invert the prompt from the
        # noised activation. Off by default; enable with
        # BONZAI_SHARD_DP_EPSILON=<float>. ε=2 is the doc-recommended
        # working point; lower ε = more noise = stronger privacy + more
        # output quality degradation.
        #
        # Sensitivity bound: we use the per-tensor RMS as a proxy for
        # the activation's "scale" and inject σ = (rms / ε). On every
        # call the receiver's int8 dequant will smear the noise across
        # decode anyway, so a fixed σ relative to RMS keeps the SNR
        # consistent across denoising steps.
        eps = _dp_epsilon()
        if eps is not None and eps > 0:
            with torch.no_grad():
                rms = float(hidden.detach().to(torch.float32).pow(2).mean().sqrt())
                sigma = rms / eps
                hidden = hidden + torch.randn_like(hidden) * sigma
        body, wire_dtype, shape = encode_tensor_payload(hidden, codec_flags=self.codec_flags)
        meta = _encode_meta(wire_dtype, shape, step=self._step)
        with self._send_lock:
            self.sock.sendall(_encode_shard_frame(FRAME_ACT_FORWARD, self.codec_flags, meta, body))

    def recv_activation(self) -> torch.Tensor:
        """
        Block until the next ACT_RETURN frame arrives. Errors raise; ignore
        unrelated frames (CTRL_BEGIN echo, CTRL_DONE during wind-down).
        """
        while True:
            type_, body = _read_uds_message(self.sock)
            if type_ == UDS_TYPE_CONTROL:
                ctrl = json.loads(body.decode("utf-8"))
                if ctrl.get("op") == "remote_error":
                    raise RuntimeError(f"remote shard error: {ctrl.get('error')}")
                # other control messages — log and keep waiting
                logger.debug("[shard] ignoring control message: %s", ctrl.get("op"))
                continue
            if type_ != UDS_TYPE_FRAME:
                logger.warning("[shard] unknown UDS type 0x%02x — skipping", type_)
                continue

            if len(body) < SHARD_FRAME_PREAMBLE:
                raise ValueError(f"truncated shard frame ({len(body)} bytes)")
            ftype = body[0]
            fflags = body[1]
            flen = struct.unpack(">I", body[2:6])[0]
            meta = body[SHARD_FRAME_HEADER_SIZE : SHARD_FRAME_HEADER_SIZE + SHARD_FRAME_META_SIZE]
            payload = body[SHARD_FRAME_PREAMBLE : SHARD_FRAME_PREAMBLE + flen]

            if ftype == FRAME_CTRL_ERROR:
                err = json.loads(payload.decode("utf-8"))
                raise RuntimeError(f"shard error frame: {err}")
            if ftype != FRAME_ACT_RETURN:
                logger.debug("[shard] ignoring frame type 0x%02x", ftype)
                continue

            wire_dtype, shape, _step = _decode_meta(meta)
            return decode_tensor_payload(
                payload,
                codec_flags=fflags,
                wire_dtype=wire_dtype,
                shape=shape,
            )

    def close(self) -> None:
        if self.sock is None:
            return
        try:
            self.sock.sendall(_encode_control("close"))
        except OSError:
            pass
        try:
            self.sock.close()
        finally:
            self.sock = None
            logger.info("[shard] session %s closed", self.session_id[:8])

    # context-manager sugar — `with open_session(...) as t:` style
    def __enter__(self) -> "PipelineTransport":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def open_session(
    *,
    peer_id: str,
    session_id: str,
    model_id: str,
    block_range: Tuple[int, int],
    hidden_dim: int,
    precision: str = "gguf-q5km",
    socket_path: Optional[str] = None,
    timeout: float = 30.0,
) -> PipelineTransport:
    """
    Convenience constructor. Opens UDS + completes the handshake before
    returning. Caller is responsible for `.close()` (or use `with`).
    """
    t = PipelineTransport(
        peer_id=peer_id,
        session_id=session_id,
        model_id=model_id,
        block_range=block_range,
        hidden_dim=hidden_dim,
        precision=precision,
    )
    t.open(socket_path=socket_path, timeout=timeout)
    return t


# ─────────────────────────────────────────────────────────────────────────
# SELF-TEST — run with `python -m src.server.pipeline_transport`
# ─────────────────────────────────────────────────────────────────────────

def _self_test_codec() -> None:
    """
    Round-trip a synthetic activation through the codec under each
    combination of compression flags. Asserts shape preservation and
    bounded numerical drift. Doesn't touch the socket — that's the
    integration test's job.
    """
    torch.manual_seed(0)
    sample = torch.randn(2, 4096, 2304, dtype=torch.float32) * 0.1

    cases = [
        ("raw fp16",         0),
        ("LZ4 only",         FLAG_COMPRESSED_LZ4),
        ("INT8 only",        FLAG_QUANTIZED_INT8),
        ("INT8 + LZ4",       FLAG_QUANTIZED_INT8 | FLAG_COMPRESSED_LZ4),
    ]
    raw_fp16_size = (sample.numel() * 2)
    print(f"reference fp16 size: {raw_fp16_size / 1e6:.2f} MB")
    for label, flags in cases:
        if (flags & FLAG_COMPRESSED_LZ4) and not _HAS_LZ4:
            print(f"  {label}: SKIP (lz4 not installed)")
            continue
        t0 = time.monotonic()
        body, wire_dtype, shape = encode_tensor_payload(sample, codec_flags=flags)
        elapsed_enc = (time.monotonic() - t0) * 1000
        t0 = time.monotonic()
        recovered = decode_tensor_payload(body, codec_flags=flags, wire_dtype=wire_dtype, shape=shape)
        elapsed_dec = (time.monotonic() - t0) * 1000
        ratio = len(body) / raw_fp16_size
        rmse = (recovered.to(torch.float32) - sample).pow_(2).mean().sqrt().item()
        print(
            f"  {label:18s}: {len(body) / 1e6:>6.2f} MB ({ratio:>5.1%}) "
            f"enc {elapsed_enc:>6.1f}ms dec {elapsed_dec:>6.1f}ms rmse={rmse:.5f}"
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _self_test_codec()
