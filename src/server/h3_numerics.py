"""Request-local H3 numerical stability and stage diagnostics.

Keep packed weights and bounded working buffers; never sanitize invalid model
outputs into a seemingly successful video.
"""
import math
import types

import torch
from torch import nn


def require_finite(value, stage):
    if isinstance(value, torch.Tensor):
        if not bool(torch.isfinite(value).all()):
            raise RuntimeError(f"MiniMax H3 numerical failure in {stage} ({value.dtype}, {tuple(value.shape)})")
    elif isinstance(value, (tuple, list)):
        for index, item in enumerate(value):
            require_finite(item, f"{stage}[{index}]")


def check_conditioning(state, key):
    value = state.get(key)
    if value is None:
        raise RuntimeError(f"MiniMax H3 missing {key}")
    require_finite(value, key)


def _stable_rms_forward(module, inputs):
    # Normalization is sensitive to low-precision squaring. Accumulate in FP32
    # with max scaling, so even a finite large input cannot overflow its square.
    width = math.prod(module.normalized_shape)
    rows = inputs.reshape(-1, width)
    result = torch.empty_like(rows)
    eps = module.eps if module.eps is not None else torch.finfo(inputs.dtype).eps
    weight = module.weight.reshape(-1).float() if module.weight is not None else None
    for start in range(0, rows.shape[0], 256):
        values = rows[start:start + 256].float()
        scale = values.abs().amax(-1, keepdim=True).clamp_min(1.0)
        scaled = values / scale
        normalized = scaled * torch.rsqrt(scaled.square().mean(-1, keepdim=True) + (eps / scale) / scale)
        if weight is not None:
            normalized = normalized * weight
        result[start:start + 256] = normalized.to(inputs.dtype)
    return result.reshape_as(inputs)


def stabilize_norms(model):
    """Apply only to this request's models, without changing installed libraries."""
    for module in model.modules():
        if isinstance(module, nn.RMSNorm):
            module.forward = types.MethodType(_stable_rms_forward, module)


def watch_transformer(model):
    """Locate the first failing block instead of spending all steps on NaNs."""
    step = [0]

    def before(_module, args, kwargs):
        step[0] += 1
        require_finite(args, f"denoising step {step[0]} inputs")
        for key, value in kwargs.items():
            require_finite(value, f"denoising step {step[0]} input {key}")

    model.register_forward_pre_hook(before, with_kwargs=True)
    for name, module in model.named_modules():
        if name in {"context_embedder", "norm_out"} or (
            name.startswith("transformer_blocks.") and name.count(".") == 1
        ):
            def after(_module, _args, output, label=name):
                require_finite(output, f"denoising step {step[0]}, {label}")
            module.register_forward_hook(after)

    def after_model(_module, _args, output):
        require_finite(output, f"denoising step {step[0]} prediction")
    model.register_forward_hook(after_model)


def watch_scheduler(scheduler, label):
    original = scheduler.step
    count = [0]

    def checked_step(_scheduler, *args, **kwargs):
        count[0] += 1
        result = original(*args, **kwargs)
        sample = result[0] if isinstance(result, tuple) else result.prev_sample
        require_finite(sample, f"{label} scheduler step {count[0]}")
        return result

    scheduler.step = types.MethodType(checked_step, scheduler)
