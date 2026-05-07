"""
Consumer-side ShardedDiTPipeline wrapper.

Takes a fully loaded diffusers Pipeline + a model-specific `LayerAdapter`
and patches the transformer's main layer list so that — at the chosen
`k` (head depth) — the activation is shipped to a remote shard provider
via the libp2p bridge, the result blocks back, and execution continues
through the local tail blocks.

Why a layer-list patch (not a forward override): every DiT family has a
different `forward()` (Z-Image's omni mode, LTX-2's temporal cross-attn,
Wan 2.2's two-noise transformers). All of them iterate a ModuleList of
"main layers" exactly once. By replacing that ModuleList with a hybrid
container of length L where:

    layers[0      .. k-1   ]  = original   (run locally as head)
    layers[k              ]  = ShardLayer  (ship → block → return processed)
    layers[k+1    .. L-r-1 ]  = NoopLayer  (pass-through; provider already ran them)
    layers[L-r    .. L-1   ]  = original   (run locally as tail)

we don't have to touch any model-specific forward code. The transformer's
own forward calls each item with whatever args it normally would; we just
need the ShardLayer + NoopLayer to accept and forward those args.

Privacy claim: the prompt-derived caption features (CLIP/T5 output) live
inside the conditioning bundle that rides alongside each per-step
activation. A motivated adversary with the same encoders could approximate
the prompt — that's the documented soft-spot the strategy doc calls out.
DP noise on conditioning is the Phase 2 hardening; this v1 ships without
it.

The model adapter (LayerAdapter ABC below) names the model_id, points at
the layer attribute on the transformer, and lists the conditioning arg
names. Each DiT family ships its own adapter (Z-Image is the reference;
others mirror it).
"""

from __future__ import annotations

import io
import logging
import threading
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, List, Optional, Sequence, Tuple

import torch
import torch.nn as nn
from safetensors.torch import load as st_load
from safetensors.torch import save as st_save

from pipeline_transport import (
    PipelineTransport,
    open_session,
    encode_tensor_payload,
    decode_tensor_payload,
    _encode_meta,
    _decode_meta,
    _encode_uds,
    _encode_shard_frame,
    _read_uds_message,
    UDS_TYPE_FRAME,
    UDS_TYPE_CONTROL,
    SHARD_FRAME_HEADER_SIZE,
    SHARD_FRAME_META_SIZE,
    FRAME_ACT_FORWARD,
    FRAME_ACT_RETURN,
    FRAME_COND_FORWARD,
    FRAME_CTRL_DONE,
    FRAME_CTRL_ERROR,
    FLAG_QUANTIZED_INT8,
    FLAG_COMPRESSED_LZ4,
    DTYPE_FP16,
    DTYPE_INT8,
    PYTHON_SUPPORTED_FLAGS,
)

logger = logging.getLogger("bonzai-server")


# ─────────────────────────────────────────────────────────────────────────
# LAYER ADAPTER — per-DiT family
# ─────────────────────────────────────────────────────────────────────────

class LayerAdapter(ABC):
    """Each DiT family supplies one of these. Names are deliberate:
    `model_id` matches the runner registry on the provider side; the
    conditioning keys MUST match the parameter names of the layer's
    forward method (we serialize them via safetensors keyed by name)."""

    model_id: str = ""

    @abstractmethod
    def get_layers(self, transformer: nn.Module) -> nn.ModuleList:
        """Return the ModuleList containing the main transformer blocks."""

    @abstractmethod
    def set_layers(self, transformer: nn.Module, layers: nn.ModuleList) -> None:
        """Install a replacement ModuleList. Called once per session."""

    @abstractmethod
    def restore_layers(self, transformer: nn.Module) -> None:
        """Put the original layers back when the session closes."""

    @abstractmethod
    def conditioning_keys(self) -> Sequence[str]:
        """Names of the conditioning args (everything except the hidden
        tensor) that each layer's forward accepts. ShardLayer collects
        these by position when called, packs them by name."""


class ZImageLayerAdapter(LayerAdapter):
    model_id = "z_image_turbo"

    # Z-Image layer signature, from diffusers source:
    #   layer(unified, unified_mask, unified_freqs, adaln_input,
    #         unified_noise_tensor, t_noisy, t_clean)
    # The first positional arg is the hidden state; the rest are
    # conditioning that's recomputed per denoising step (timestep
    # embeddings change with `t`) but constant across the loop.
    _COND = (
        "unified_mask",
        "unified_freqs",
        "adaln_input",
        "unified_noise_tensor",
        "t_noisy",
        "t_clean",
    )

    _saved_layers: Optional[nn.ModuleList] = None

    def get_layers(self, transformer):
        return transformer.layers

    def set_layers(self, transformer, layers):
        if self._saved_layers is None:
            self._saved_layers = transformer.layers
        transformer.layers = layers

    def restore_layers(self, transformer):
        if self._saved_layers is not None:
            transformer.layers = self._saved_layers
            self._saved_layers = None

    def conditioning_keys(self):
        return self._COND


class ZImageAdvancedAdapter(ZImageLayerAdapter):
    model_id = "z_image_advanced"


# ─────────────────────────────────────────────────────────────────────────
# CONDITIONING BUNDLE — safetensors-backed, never pickle
# ─────────────────────────────────────────────────────────────────────────

def _pack_conditioning(adapter: LayerAdapter, args: Tuple[Any, ...]) -> bytes:
    """
    Serialize the layer's positional conditioning args (everything past
    the hidden tensor) into a safetensors blob. safetensors is used in
    place of pickle because the receiver is a remote peer — pickle
    deserialization on attacker-controlled bytes is a code-execution
    risk; safetensors only handles tensor data.

    Non-tensor args (bool, int, etc.) are wrapped as 0-d tensors with
    a name suffix so the unpacker can reconstruct the original Python
    value. `None` values are skipped and the unpacker fills them back
    in by name.
    """
    keys = adapter.conditioning_keys()
    bundle: dict = {}
    for i, key in enumerate(keys):
        if i >= len(args):
            break
        v = args[i]
        if v is None:
            continue
        if isinstance(v, torch.Tensor):
            bundle[key] = v.detach().to("cpu").contiguous()
        elif isinstance(v, bool):
            bundle[f"{key}__bool"] = torch.tensor(int(v), dtype=torch.int8)
        elif isinstance(v, (int, float)):
            bundle[f"{key}__num"] = torch.tensor(float(v), dtype=torch.float32)
        else:
            # Unknown — log and skip; provider's get() will see None
            logger.warning("[shard] dropping non-tensor conditioning %s: %r", key, type(v))
    return st_save(bundle)


def _unpack_conditioning(adapter: LayerAdapter, blob: bytes) -> dict:
    """Inverse of _pack_conditioning. Returns kwargs dict for layer call."""
    raw = st_load(blob)
    out = {}
    for k, v in raw.items():
        if k.endswith("__bool"):
            out[k[:-6]] = bool(v.item())
        elif k.endswith("__num"):
            out[k[:-5]] = float(v.item())
        else:
            out[k] = v
    return out


# ─────────────────────────────────────────────────────────────────────────
# LAYER WRAPPERS
# ─────────────────────────────────────────────────────────────────────────

class _NoopLayer(nn.Module):
    """Pass-through. Sits in the slots `k+1..L-r-1` of the patched
    layers list — those indices' work has been done remotely already, so
    the local transformer just needs the loop to iterate without
    transforming the activation."""

    def forward(self, hidden, *args, **kwargs):
        return hidden


class _ShardLayer(nn.Module):
    """At index k of the patched layers list. Ships activation+conditioning
    to the bridge, blocks until the remote returns the post-shard
    activation, returns it for the rest of the local loop to pass through
    the noops and into the tail blocks.

    NOT a normal nn.Module — `forward` runs no math itself. The remote is
    doing the work."""

    def __init__(self, transport: PipelineTransport, adapter: LayerAdapter):
        super().__init__()
        self._transport = transport
        self._adapter = adapter

    def forward(self, hidden: torch.Tensor, *cond_args):
        # Ship the conditioning bundle as one COND_FORWARD frame, then
        # the activation as ACT_FORWARD. Receiver pairs them by stream
        # ordering — bridge guarantees in-order delivery.
        cond_blob = _pack_conditioning(self._adapter, cond_args)
        # Use the transport's bytes-only path: send_conditioning currently
        # accepts a tensor; we override to emit a raw bytes COND_FORWARD.
        self._transport.send_conditioning_blob(cond_blob)
        self._transport.send_activation(hidden)
        return self._transport.recv_activation()


# Add the bytes-only conditioning helper to PipelineTransport without
# editing the file in place — it's a small extension that the original
# transport doesn't need (the v1 transport had a tensor-only API).
def _send_conditioning_blob(self: PipelineTransport, blob: bytes) -> None:
    import struct
    # Conditioning meta is empty — the receiver knows to safetensors-load
    # the payload as a key/value bundle. Use rank=0, all-zero shape.
    meta = _encode_meta(DTYPE_FP16, (), step=self._step + 1)
    payload = blob
    if self.codec_flags & FLAG_COMPRESSED_LZ4:
        # LZ4 helps a bit on safetensors framing; INT8 doesn't apply
        # (this is metadata, not a tensor).
        try:
            import lz4.frame as _lz4
            payload = _lz4.compress(blob, compression_level=1)
        except ImportError:
            pass
    with self._send_lock:
        self.sock.sendall(_encode_shard_frame(
            FRAME_COND_FORWARD,
            self.codec_flags,
            meta,
            payload,
        ))

if not hasattr(PipelineTransport, "send_conditioning_blob"):
    PipelineTransport.send_conditioning_blob = _send_conditioning_blob


# ─────────────────────────────────────────────────────────────────────────
# PIPELINE WRAPPER
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class ShardedDiTSession:
    """A live private inference session. Constructed by `with_pipeline()`,
    closed automatically when the wrapped pipeline finishes (or via
    explicit `.close()`)."""

    transport: PipelineTransport
    adapter: LayerAdapter
    transformer: nn.Module
    _patched: bool = False

    def install(self, k: int, r: int) -> None:
        original = self.adapter.get_layers(self.transformer)
        L = len(original)
        if not (0 <= k < L and 0 <= r < L and k + r < L):
            raise ValueError(f"invalid k/r for L={L}: k={k}, r={r} (k+r must be < L)")

        replacement: List[nn.Module] = []
        for i in range(L):
            if i < k or i >= L - r:
                replacement.append(original[i])  # head + tail run locally
            elif i == k:
                replacement.append(_ShardLayer(self.transport, self.adapter))
            else:
                replacement.append(_NoopLayer())  # provider already ran this slot
        new_list = nn.ModuleList(replacement)
        # Match device/dtype of the originals so the transformer's own
        # device tracking (used by some pipelines for autocast) doesn't
        # see a mismatched module.
        try:
            target_device = next(original.parameters()).device
            new_list = new_list.to(target_device)
        except StopIteration:
            pass
        self.adapter.set_layers(self.transformer, new_list)
        self._patched = True
        logger.info(
            "[shard] patched layers L=%d head=[0:%d] remote=[%d:%d] tail=[%d:%d]",
            L, k, k, L - r, L - r, L,
        )

    def close(self) -> None:
        if self._patched:
            self.adapter.restore_layers(self.transformer)
            self._patched = False
        try:
            self.transport.close()
        except Exception:
            pass


def with_pipeline(
    pipeline: Any,
    adapter: LayerAdapter,
    *,
    peer_id: str,
    k: int = 4,
    r: int = 4,
    block_range: Optional[Tuple[int, int]] = None,
    precision: str = "gguf-q5km",
    socket_path: Optional[str] = None,
    timeout: float = 30.0,
) -> ShardedDiTSession:
    """
    Open a shard session, patch the pipeline's transformer to route
    middle layers through the remote, and return a session you should
    close after generation. Usage:

        sess = with_pipeline(pipe, ZImageLayerAdapter(),
                             peer_id=peer, k=4, r=4)
        try:
            out = pipe(prompt=..., ...)
        finally:
            sess.close()

    `block_range` defaults to `[k, L-r]` based on the pipeline's
    transformer, derived after the session opens (we need the layer
    count to compute it, and we'd rather not hardcode per-model
    layer counts here).
    """
    transformer = pipeline.transformer
    layers = adapter.get_layers(transformer)
    L = len(layers)
    if block_range is None:
        block_range = (k, L - r)

    # Hidden dim is needed for the SHARD_LOAD payload (peer uses it for
    # sanity checking). For Z-Image and most DiTs, it's transformer.config.hidden_size
    # or .dim. Fall back to 0 if unavailable — provider treats 0 as "skip check".
    hidden_dim = (
        getattr(getattr(transformer, "config", None), "hidden_size", None)
        or getattr(transformer, "dim", None)
        or getattr(getattr(transformer, "config", None), "dim", None)
        or 0
    )

    transport = open_session(
        peer_id=peer_id,
        session_id="sd_" + uuid.uuid4().hex[:16],
        model_id=adapter.model_id,
        block_range=block_range,
        hidden_dim=int(hidden_dim),
        precision=precision,
        socket_path=socket_path,
        timeout=timeout,
    )

    session = ShardedDiTSession(
        transport=transport, adapter=adapter, transformer=transformer,
    )
    session.install(k, r)
    return session


# ─────────────────────────────────────────────────────────────────────────
# ADAPTER REGISTRY (consumer-side counterpart to the provider runners)
# ─────────────────────────────────────────────────────────────────────────

ADAPTERS: dict = {
    "z_image_turbo":     ZImageLayerAdapter(),
    "z_image_advanced":  ZImageAdvancedAdapter(),
    # Other DiT adapters land alongside their provider runners — for now
    # they import from sharded_pipeline.py as identity stubs. Each new
    # adapter needs (a) the right `get_layers` attribute path,
    # (b) the conditioning keys matching its layer forward signature.
}


def get_adapter(model_id: str) -> Optional[LayerAdapter]:
    return ADAPTERS.get(model_id)
