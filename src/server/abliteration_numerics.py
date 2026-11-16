"""BonzAI's numerically stable OBLITERATUS projection boundary.

Keep the upstream algorithm and quantized-weight adapters, but accumulate norms
in FP32. FP16 sum-of-squares over large embeddings overflows even when every
weight is finite, causing inf/inf rescaling and corrupting Nuclear exports.
"""
import math
import torch


def stable_projection(module, direction, candidate_names, norm_preserve=False, regularization=0.0):
    from obliteratus.abliterate import AbliterationPipeline, _MAX_NORM_RATIO
    scale = 1.0 - regularization
    count = 0
    for name in candidate_names:
        projection = getattr(module, name, None)
        if projection is None or not hasattr(projection, 'weight'):
            continue
        weight, quantized = AbliterationPipeline._dequantize_weight(projection)
        d = direction.to(device=weight.device, dtype=weight.dtype)
        if not torch.isfinite(weight).all() or not torch.isfinite(d).all():
            continue
        normal = weight.shape[-1] == d.shape[0]
        if not normal and weight.shape[0] != d.shape[0]:
            continue
        # Explicit p=2 also works on MPS, whose Frobenius norm rejects dtype.
        original_sq = weight.norm(p=2, dtype=torch.float32).square().item() if norm_preserve else 0.0
        coefficient = weight @ d if normal else d.T @ weight
        if not torch.isfinite(coefficient).all():
            continue
        coefficient_sq = coefficient.norm(p=2, dtype=torch.float32).square().item() if norm_preserve else 0.0
        weight.sub_(d.T * (scale * coefficient) if normal else (scale * d) * coefficient)
        if norm_preserve and original_sq > 0:
            new_sq = max(0.0, original_sq - scale * (2 - scale) * coefficient_sq)
            if new_sq > 0:
                weight.mul_(min(math.sqrt(original_sq / new_sq), _MAX_NORM_RATIO))
        if quantized:
            AbliterationPipeline._replace_quantized_weight(projection, weight)
        count += 1
    return count


def stabilize_abliteration(pipeline_class):
    pipeline_class._project_out_advanced = staticmethod(stable_projection)
