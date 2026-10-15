"""Numerical checks: never turn failed inference into a black 'successful' video."""
import numpy as np


def validate_wan_latents(_pipeline, step, _timestep, callback_kwargs):
    import torch
    latents = callback_kwargs.get("latents")
    if latents is not None and not bool(torch.isfinite(latents).all().item()):
        raise RuntimeError(
            f"Wan denoising produced non-finite latents at step {step + 1}. "
            "Generation stopped before decoding; no valid video was produced."
        )
    return callback_kwargs


def validate_wan_frames(frames):
    values = np.asarray(frames)
    if values.size == 0 or values.ndim != 4 or values.shape[-1] not in (3, 4):
        raise RuntimeError("Wan returned empty or malformed video frames.")
    if not np.isfinite(values).all():
        affected = int(np.count_nonzero(~np.isfinite(values).all(axis=(1, 2, 3))))
        raise RuntimeError(
            f"Wan decoding produced invalid pixels in {affected}/{len(values)} frames. "
            "Denoising completed, but the video could not be decoded correctly. "
            "No corrupt video was saved. Try a shorter clip to reduce memory pressure."
        )
    return frames
