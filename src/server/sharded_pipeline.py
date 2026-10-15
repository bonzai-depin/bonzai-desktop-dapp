"""
Per-DiT shard adapters for the privacy pipeline (provider side).

Each adapter registers a `runner(hidden, conditioning, step, record)`
callable in shard._SHARD_RUNNERS keyed by model_id. The shard worker
dispatches incoming activation frames through the appropriate runner;
when no runner is registered the worker falls back to loopback echo
mode (used by bridge smoke tests).

Phase 1 ships IDENTITY-PASSTHROUGH stubs for all six DiT pipelines.
This validates the registry → dispatch path end-to-end without
committing to model-specific slicing code that needs hardware testing
on the actual GGUF weights. The real per-model implementations swap in
behind these stubs without touching the bridge or registry.

Models covered (mapping to BonzaiProviderRegistry pipeline categories):

    z_image_turbo / z_image_advanced  →  IMAGE_QUALITY (2)   DiT
    flux_klein                         →  IMAGE_TURBO   (1)   DiT
    ltx2_video                         →  VIDEO_FAST    (9)   DiT (3D)
    wan22_high / wan22_low             →  VIDEO_QUALITY       DiT (2× per gen)
    chatterbox                         →  AUDIO_QUALITY (7)   transformer-decoder
    ace_step                           →  MUSIC         (8)   transformer-encoder + diffusion

NOT covered:
    sdxl                — U-Net with skip connections, single-peer in
                          shard mode (router excludes from shardable set;
                          inferenceRouter.service.js NON_SHARDABLE_PIPELINES).

Real-implementation notes for the next commit:

    1. Each adapter loads its transformer once per-shard with
       `from_single_file(GGUF_PATH, ...)` and slices `transformer.blocks`
       (or `main_layers` for Z-Image, `transformer_blocks` for LTX-2,
       etc. — the attribute names differ across diffusers families).
    2. Free the discarded slices via `del transformer.blocks[m:]; del
       transformer.blocks[:k]; gc.collect()` to release VRAM.
    3. Wrap the slice in a `ShardForward(nn.Module)` whose forward
       accepts `(hidden, cond, timestep)` and runs the kept blocks in
       sequence. Z-Image / LTX-2 / Wan have different cross-attn keying
       conventions — handle per model.
    4. Cache the loaded shard in a module-level dict keyed by
       (model_id, block_range, precision) so subsequent sessions for
       the same slice don't reload from disk.
    5. Apply LoRA on top if record.precision indicates lightning/etc.
       (see Wan 2.2 `pipe.load_lora_weights` calls in diffuser.py).

The adapters import torch + the relevant transformer classes lazily so
this module is importable on machines that haven't downloaded any
models. Bridge smoke tests can then run without the GGUFs present.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional

import torch

from shard import register_runner

logger = logging.getLogger("bonzai-server")


# ─────────────────────────────────────────────────────────────────────────
# IDENTITY PASSTHROUGH STUB
# ─────────────────────────────────────────────────────────────────────────

def _identity_runner(hidden: torch.Tensor, conditioning,
                     step: int, record: Optional[Any] = None) -> torch.Tensor:
    """
    Returns the activation unchanged. The bridge-test fallback — used
    when BONZAI_SHARD_REAL_DIT=1 isn't set, or when a real runner
    can't lazy-load (no GGUF on disk, etc.).

    Doc invariant: real runners MUST preserve `hidden.shape`.
    """
    return hidden


# Real DiT execution is opt-in via env var so the bridge alone (which
# loads no model) doesn't surprise users with multi-GB VRAM allocations
# the moment a peer connects. Providers who want to actually serve
# inference set BONZAI_SHARD_REAL_DIT=1 in their environment.
import os as _os
_REAL_DIT_ENABLED = _os.environ.get("BONZAI_SHARD_REAL_DIT") == "1"


# ─────────────────────────────────────────────────────────────────────────
# Z-IMAGE (image_quality / image_advanced)
# ─────────────────────────────────────────────────────────────────────────
#
# Loaded transformer is cached process-wide. First session pays the
# full GGUF load cost (~30-90s); subsequent sessions reuse the
# already-resident weights and just create a fresh layer slice.
# Memory cost: full transformer stays in VRAM for the lifetime of the
# Flask process. A future optimization can drop to slice-only loading
# via direct GGUF parsing, saving ~70 % VRAM at the cost of more code.

import threading
_Z_TRANSFORMER_LOCK = threading.Lock()
_Z_TRANSFORMER = None
_Z_LAYERS = None  # full nn.ModuleList — sliced views reference these by index

def _ensure_z_image_loaded():
    """Lazy-load the full Z-Image transformer on first call. Reuses
    the same import paths and constants as diffuser.py's /image/quality
    handler so we never end up with two diverging configs."""
    global _Z_TRANSFORMER, _Z_LAYERS
    with _Z_TRANSFORMER_LOCK:
        if _Z_TRANSFORMER is not None:
            return _Z_TRANSFORMER
        # Imports are local — diffuser.py is the source of truth for the
        # constants (Z_REPO, Z_GGUF_NAME, MODEL_DIR, DeviceManager).
        import diffuser as df
        from diffusers import ZImageTransformer2DModel
        from diffusers import GGUFQuantizationConfig

        device = df.DeviceManager.get_device()
        if device.type == "mps":
            compute_dtype = torch.bfloat16
        elif device.type == "cuda":
            compute_dtype = torch.bfloat16
        else:
            compute_dtype = torch.float32

        tr_cfg = df.repo_local_dir(df.Z_REPO) / "transformer" / "config.json"
        gguf_path = df.MODEL_DIR / df.Z_GGUF_NAME
        if not gguf_path.exists():
            raise RuntimeError(
                f"Z-Image GGUF not found at {gguf_path} — run /image/quality "
                "once locally or trigger pre-flight to download it."
            )

        logger.info("[shard] loading Z-Image transformer (this is a one-time cost per Flask process)")
        transformer = ZImageTransformer2DModel.from_single_file(
            str(gguf_path),
            config=str(tr_cfg),
            quantization_config=GGUFQuantizationConfig(compute_dtype=compute_dtype),
            dtype=compute_dtype,
        ).to(device)
        transformer.eval()
        _Z_TRANSFORMER = transformer
        _Z_LAYERS = transformer.layers
        logger.info("[shard] Z-Image ready: %d layers loaded on %s", len(_Z_LAYERS), device)
        return transformer


def _z_image_runner(hidden, conditioning, step, record=None):
    """Real Z-Image shard runner. block_range comes from the SHARD_LOAD
    record; the runner executes layers[k:m] in sequence, threading
    `hidden` through with the per-step conditioning kwargs that the
    consumer's ShardedDiTPipeline shipped via FRAME_COND_FORWARD."""
    if not _REAL_DIT_ENABLED:
        return _identity_runner(hidden, conditioning, step, record)
    if record is None or not getattr(record, "block_range", None):
        # No range → can't slice. Fall back to identity.
        return _identity_runner(hidden, conditioning, step, record)

    transformer = _ensure_z_image_loaded()
    k, m = record.block_range
    layers = _Z_LAYERS
    if not (0 <= k <= m <= len(layers)):
        logger.warning("[shard] z_image block_range [%d, %d] out of bounds for L=%d",
                       k, m, len(layers))
        return _identity_runner(hidden, conditioning, step, record)

    # Move hidden onto the transformer's device + dtype if needed.
    target_device = next(transformer.parameters()).device
    target_dtype = next(transformer.parameters()).dtype
    if hidden.device != target_device or hidden.dtype != target_dtype:
        hidden = hidden.to(device=target_device, dtype=target_dtype)

    kwargs = conditioning if isinstance(conditioning, dict) else {}
    # Tensors in kwargs need to ride along on the same device.
    moved_kwargs = {}
    for name, val in kwargs.items():
        if isinstance(val, torch.Tensor):
            moved_kwargs[name] = val.to(device=target_device)
        else:
            moved_kwargs[name] = val

    with torch.no_grad():
        for layer in layers[k:m]:
            hidden = layer(hidden, **moved_kwargs)
    return hidden


register_runner("z_image_turbo", _z_image_runner)
register_runner("z_image_advanced", _z_image_runner)


# ─────────────────────────────────────────────────────────────────────────
# GENERIC DiT RUNNER FACTORY (LTX-2, Wan 2.2, FLUX, Chatterbox, ACE-Step)
# ─────────────────────────────────────────────────────────────────────────
#
# Every other DiT-style model on the provider follows the same shape:
#   1. Cache a loaded transformer keyed by model_id (lazy, under a lock).
#   2. Per call: slice .<attr>[k:m]; iterate; pass conditioning kwargs.
#
# The differences are small: which attribute holds the main blocks, and
# (rarely) whether the layer's forward accepts kwargs verbatim. We
# encapsulate those differences in a `_DiTSpec` and synthesize a runner.
#
# Hardware caveat: the exact attribute name for each model needs to be
# verified against diffusers' currently-installed source on the
# provider machine. Defaults below are based on diffusers main as of
# late 2025; if a future diffusers version renames an attr (e.g.
# `.layers` → `.transformer_blocks`), update the spec and ship.

@dataclass
class _DiTSpec:
    model_id: str
    layer_attr: str         # e.g. "layers", "blocks", "transformer_blocks"
    loader: Callable        # returns the loaded transformer
    label: str = ""

@dataclass
class _CachedDiT:
    transformer: Any
    layers: Any            # the ModuleList referenced by spec.layer_attr


_DIT_CACHE: dict = {}
_DIT_LOCK = threading.Lock()


def _make_dit_runner(spec: _DiTSpec) -> Callable:
    def _runner(hidden, conditioning, step, record=None):
        if not _REAL_DIT_ENABLED:
            return _identity_runner(hidden, conditioning, step, record)
        if record is None or not getattr(record, "block_range", None):
            return _identity_runner(hidden, conditioning, step, record)

        with _DIT_LOCK:
            cached = _DIT_CACHE.get(spec.model_id)
            if cached is None:
                logger.info("[shard] loading %s transformer (one-time per Flask process)", spec.label or spec.model_id)
                t = spec.loader()
                t.eval()
                layers = getattr(t, spec.layer_attr, None)
                if layers is None:
                    raise RuntimeError(
                        f"DiT spec for {spec.model_id} expects attribute "
                        f"`{spec.layer_attr}` on the transformer — verify "
                        "against diffusers source for the installed version"
                    )
                cached = _CachedDiT(transformer=t, layers=layers)
                _DIT_CACHE[spec.model_id] = cached

        k, m = record.block_range
        layers = cached.layers
        if not (0 <= k <= m <= len(layers)):
            logger.warning(
                "[shard] %s block_range [%d, %d] out of bounds for L=%d",
                spec.model_id, k, m, len(layers),
            )
            return _identity_runner(hidden, conditioning, step, record)

        target_device = next(cached.transformer.parameters()).device
        target_dtype = next(cached.transformer.parameters()).dtype
        if hidden.device != target_device or hidden.dtype != target_dtype:
            hidden = hidden.to(device=target_device, dtype=target_dtype)

        kwargs = conditioning if isinstance(conditioning, dict) else {}
        moved = {}
        for name, val in kwargs.items():
            moved[name] = val.to(device=target_device) if isinstance(val, torch.Tensor) else val

        with torch.no_grad():
            for layer in layers[k:m]:
                hidden = layer(hidden, **moved)
        return hidden

    return _runner


def _ltx2_loader():
    """LTX-2 video DiT (Q3_K_S GGUF). Loaded the same way as
    diffuser.py:4373 — share the constants via the diffuser module."""
    import diffuser as df
    from diffusers import LTX2VideoTransformer3DModel, GGUFQuantizationConfig
    device = df.DeviceManager.get_device()
    dtype = df.DeviceManager.get_dtype(device)
    gguf_path = df.MODEL_DIR / df.LTX2_GGUF_NAME
    if not gguf_path.exists():
        raise RuntimeError(f"LTX-2 GGUF not found at {gguf_path}")
    return LTX2VideoTransformer3DModel.from_single_file(
        str(gguf_path),
        quantization_config=GGUFQuantizationConfig(compute_dtype=dtype),
        dtype=dtype,
    ).to(device)


def _wan22_loader_high():
    import diffuser as df
    from diffusers import WanTransformer3DModel, GGUFQuantizationConfig
    device = df.DeviceManager.get_device()
    dtype = df.DeviceManager.get_dtype(device)
    gguf_path = df.MODEL_DIR / df.WAN_GGUF_HIGH
    if not gguf_path.exists():
        raise RuntimeError(f"Wan 2.2 high-noise GGUF not found at {gguf_path}")
    return WanTransformer3DModel.from_single_file(
        str(gguf_path),
        quantization_config=GGUFQuantizationConfig(compute_dtype=dtype),
        config=df.WAN_REPO,
        subfolder="transformer",
        dtype=dtype,
    ).to(device)


def _wan22_loader_low():
    import diffuser as df
    from diffusers import WanTransformer3DModel, GGUFQuantizationConfig
    device = df.DeviceManager.get_device()
    dtype = df.DeviceManager.get_dtype(device)
    gguf_path = df.MODEL_DIR / df.WAN_GGUF_LOW
    if not gguf_path.exists():
        raise RuntimeError(f"Wan 2.2 low-noise GGUF not found at {gguf_path}")
    return WanTransformer3DModel.from_single_file(
        str(gguf_path),
        quantization_config=GGUFQuantizationConfig(compute_dtype=dtype),
        config=df.WAN_REPO,
        subfolder="transformer_2",
        dtype=dtype,
    ).to(device)


def _flux_klein_loader():
    """Load the same quantized Turbo transformer used by local image generation."""
    import diffuser as df
    from diffusers import Flux2Transformer2DModel, GGUFQuantizationConfig
    device = df.DeviceManager.get_device()
    dtype = torch.float32 if device.type == "cpu" else torch.float16
    if device.type == "cuda" and torch.cuda.is_bf16_supported():
        dtype = torch.bfloat16
    return Flux2Transformer2DModel.from_single_file(
        str(df.MODEL_DIR / df.FLUX_KLEIN_9B_GGUF_NAME),
        config=str(df.repo_local_dir(df.FLUX_KLEIN_9B_REPO)), subfolder="transformer",
        quantization_config=GGUFQuantizationConfig(compute_dtype=dtype),
        torch_dtype=dtype, local_files_only=True,
    ).to(device)


def _chatterbox_loader():
    """Chatterbox V3 T3 decoder loader placeholder for privacy sharding."""
    raise NotImplementedError(
        "chatterbox loader: T3 block slicing needs hardware verification."
    )


def _ace_step_loader():
    """ACE-Step diffusion transformer. Wrapped inside the ACEStep
    pipeline; the transformer is exposed as `pipe.transformer`. Block
    list likely `pipe.transformer.transformer_blocks`."""
    raise NotImplementedError(
        "ace_step loader: pipeline attribute path needs hardware verification."
    )


_DIT_SPECS = [
    _DiTSpec("ltx2_video", "transformer_blocks", _ltx2_loader, "LTX-2"),
    _DiTSpec("wan22_high", "blocks",             _wan22_loader_high, "Wan 2.2 (high noise)"),
    _DiTSpec("wan22_low",  "blocks",             _wan22_loader_low,  "Wan 2.2 (low noise)"),
    _DiTSpec("flux_klein", "transformer_blocks", _flux_klein_loader, "FLUX Klein"),
    _DiTSpec("chatterbox", "layers",             _chatterbox_loader, "Chatterbox V3"),
    _DiTSpec("ace_step",   "transformer_blocks", _ace_step_loader,   "ACE-Step"),
]

# Replace the identity stubs registered earlier with the real factory.
# Identity is still the runtime fallback when BONZAI_SHARD_REAL_DIT is
# unset, so behavior is unchanged for non-opted-in providers.
for _spec in _DIT_SPECS:
    register_runner(_spec.model_id, _make_dit_runner(_spec))


# ─────────────────────────────────────────────────────────────────────────
# FLUX KLEIN (image_turbo)
# ─────────────────────────────────────────────────────────────────────────

def _flux_klein_runner(hidden, conditioning, step, record=None):
    """
    Real implementation: load Flux2KleinTransformer2DModel separately
    (today the pipeline bundles it via from_pretrained — needs refactor),
    slice `transformer_blocks`, run forward. T5 + CLIP conditioning
    rides on `encoder_hidden_states`.
    """
    return _identity_runner(hidden, conditioning, step, record)


register_runner("flux_klein", _flux_klein_runner)


# ─────────────────────────────────────────────────────────────────────────
# LTX-2 (video_fast)
# ─────────────────────────────────────────────────────────────────────────

def _ltx2_runner(hidden, conditioning, step, record=None):
    """
    Real implementation: LTX2VideoTransformer3DModel.from_single_file
    (already loaded as a separate object in diffuser.py:4373). Slice
    `transformer_blocks` to record.block_range. Caveat: LTX-2 has
    cross-attn throughout, so DP noise on conditioning is recommended
    before send to mitigate prompt inversion (see plan limitations).
    Activation tensors are LARGE for video — bandwidth budget gates
    multi-hop topologies for this model.
    """
    return _identity_runner(hidden, conditioning, step, record)


register_runner("ltx2_video", _ltx2_runner)


# ─────────────────────────────────────────────────────────────────────────
# WAN 2.2 (video_quality)
# ─────────────────────────────────────────────────────────────────────────

def _wan22_runner(hidden, conditioning, step, record=None):
    """
    Wan 2.2 has TWO transformers per generation (high-noise + low-noise);
    each gen runs as two back-to-back shard sessions, one per transformer.
    The shard provider doesn't need to coordinate — each session is
    independent from its perspective. Consumer drives the sequencing.
    """
    return _identity_runner(hidden, conditioning, step, record)


register_runner("wan22_high", _wan22_runner)
register_runner("wan22_low", _wan22_runner)


# ─────────────────────────────────────────────────────────────────────────
# CHATTERBOX V3 (audio_quality)
# ─────────────────────────────────────────────────────────────────────────

def _chatterbox_runner(hidden, conditioning, step, record=None):
    """
    Decoder-only transformer architecture. Sharding splits the decoder
    blocks similar to LLM pipeline parallelism. Conditioning (text
    embeddings + speaker embedding) rides on the cross-attn k/v cache.
    Smaller per-step tensors than image/video DiTs — bandwidth not a
    concern.
    """
    return _identity_runner(hidden, conditioning, step, record)


register_runner("chatterbox", _chatterbox_runner)


# ─────────────────────────────────────────────────────────────────────────
# ACE-STEP (music)
# ─────────────────────────────────────────────────────────────────────────

def _ace_step_runner(hidden, conditioning, step, record=None):
    """
    ACE-Step combines a text encoder with a diffusion transformer. We
    shard the transformer blocks only — the text encoder stays on the
    client (privacy: lyrics never leave). Activations are mid-sized
    (longer sequence than image but smaller hidden dim).
    """
    return _identity_runner(hidden, conditioning, step, record)


register_runner("ace_step", _ace_step_runner)


# ─────────────────────────────────────────────────────────────────────────
# DOC: WHY NO SDXL
# ─────────────────────────────────────────────────────────────────────────
# SDXL is a U-Net, not a DiT. Its skip connections cross between early
# downsample and late upsample blocks, so there's no clean depth-pipeline
# split — a "middle" remote peer can't be self-contained without seeing
# both ends of the latent. In Consumer + Privacy mode, SDXL falls back
# to single-provider routing through /bonzai/v1/inference (same privacy
# model as Consumer mode without the toggle on); see
# inferenceRouter.service.js NON_SHARDABLE_PIPELINES.

logger.info("[shard] sharded_pipeline registered %d identity stubs (Phase 1)", 8)
