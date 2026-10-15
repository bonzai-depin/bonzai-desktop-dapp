"""Low-memory GGUF loaders for MiniMax H3 and its Qwen3-VL conditioner."""

from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path
import re
from typing import Callable, Iterable, TypeVar
import warnings
from h3_weight_stream import WeightFile, WeightRows

import torch
from gguf import GGMLQuantizationType, GGUFReader
from torch import nn


ModelT = TypeVar("ModelT", bound=nn.Module)


_PLAIN_TYPES = {
    GGMLQuantizationType.F32,
    GGMLQuantizationType.F16,
}


@dataclass(frozen=True)
class GGUFWeight:
    tensor: torch.Tensor
    quant_type: GGMLQuantizationType
    logical_shape: tuple[int, ...]
    row_indices: torch.Tensor | None = None
    swap_output_halves: bool = False
    disk_rows: WeightRows | None = None

    @property
    def quantized(self) -> bool:
        return self.quant_type not in _PLAIN_TYPES


def _logical_shape(reader: GGUFReader, name: str, fallback: Iterable[int]) -> tuple[int, ...]:
    suffix = f"orig_shape.{name}"
    field = next((value for key, value in reader.fields.items() if key.endswith(suffix)), None)
    if field is not None:
        return tuple(int(field.parts[index][0]) for index in field.data)
    return tuple(int(value) for value in reversed(tuple(fallback)))


def _read_weights(path: str | Path) -> tuple[GGUFReader, dict[str, GGUFWeight]]:
    reader = GGUFReader(str(path))
    file = WeightFile(path)
    weights = {}
    for item in reader.tensors:
        # GGUFReader exposes read-only mmap-backed NumPy views. The tensors are
        # immutable model weights, so sharing that storage is intentional and
        # avoids copying multi-gigabyte GGUF files into RAM.
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="The given NumPy array is not writable",
                category=UserWarning,
            )
            tensor = torch.from_numpy(item.data)
        weights[item.name] = GGUFWeight(
            tensor=tensor,
            quant_type=item.tensor_type,
            logical_shape=_logical_shape(reader, item.name, item.shape),
            disk_rows=WeightRows(file, item.data_offset, tensor.shape, tensor.dtype),
        )
    return reader, weights


def _dequantize(weight: GGUFWeight, device: torch.device, dtype: torch.dtype) -> torch.Tensor:
    tensor = weight.tensor
    if weight.row_indices is not None:
        tensor = tensor.index_select(0, weight.row_indices.to(tensor.device))
    if not weight.quantized:
        return tensor.to(device=device, dtype=dtype).reshape(weight.logical_shape)

    if weight.quant_type == GGMLQuantizationType.BF16:
        # GGUF stores little-endian BF16 bytes verbatim. Reinterpret them
        # instead of expanding the complete tensor through FP32 intermediates.
        # Supported desktop CPUs are little-endian; keep the generic converter
        # available on any other byte order.
        import sys
        if sys.byteorder == 'little':
            return tensor.contiguous().view(torch.bfloat16).reshape(weight.logical_shape).to(device=device, dtype=dtype)

    from diffusers.quantizers.gguf.utils import GGUFParameter, dequantize_gguf_tensor

    packed = GGUFParameter(tensor.to(device), quant_type=weight.quant_type)
    return dequantize_gguf_tensor(packed).reshape(weight.logical_shape).to(dtype=dtype)


class GGUFLinear(nn.Linear):
    """Linear layer that keeps packed weights resident until its forward pass."""

    def __init__(self, source: nn.Linear, weight: GGUFWeight, compute_dtype: torch.dtype):
        super().__init__(source.in_features, source.out_features, source.bias is not None, device="meta")
        if source.bias is not None:
            # Bias entries commonly precede weights in GGUF. Preserve a bias
            # already materialized on the source module when replacing it.
            self.bias = source.bias
        self.weight = nn.Parameter(weight.tensor, requires_grad=False)
        self.quant_type = weight.quant_type
        self.logical_shape = weight.logical_shape
        self.compute_dtype = compute_dtype
        self.row_indices = weight.row_indices
        self.swap_output_halves = weight.swap_output_halves
        self.disk_rows = weight.disk_rows

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        # Output-row tiling keeps GGUF unpacking from expanding a whole MLP
        # matrix at once. Packed weights remain file-backed on the CPU.
        x = inputs.to(self.compute_dtype)
        result = torch.empty(*x.shape[:-1], self.out_features, device=x.device, dtype=self.compute_dtype)
        for start in range(0, self.out_features, 256):
            stop = min(start + 256, self.out_features)
            rows = self.row_indices[start:stop] if self.row_indices is not None else None
            if x.device.type == 'mps' and self.disk_rows is not None:
                packed = self.disk_rows.read(rows.tolist() if rows is not None else range(start, stop))
            else:
                packed = _select_h3_rows(self.weight, rows) if rows is not None else self.weight[start:stop]
            weight = _dequantize(GGUFWeight(packed, self.quant_type,
                (stop-start, self.in_features)), x.device, self.compute_dtype)
            bias = None if self.bias is None else self.bias[start:stop].to(device=x.device, dtype=self.compute_dtype)
            y = nn.functional.linear(x, weight, bias)
            if self.swap_output_halves:
                half = self.out_features // 2
                for a, b in ((start, min(stop, half)), (max(start, half), stop)):
                    if a < b:
                        dest = a + half if a < half else a - half
                        result[..., dest:dest+b-a] = y[..., a-start:b-start]
            else:
                result[..., start:stop] = y
            if x.device.type == 'mps':
                torch.mps.synchronize()
        return result


class GGUFEmbedding(nn.Embedding):
    """Dequantize only vocabulary rows referenced by the current prompt."""

    def __init__(self, source: nn.Embedding, weight: GGUFWeight, compute_dtype: torch.dtype):
        super().__init__(source.num_embeddings, source.embedding_dim, device="meta")
        self.weight = nn.Parameter(weight.tensor, requires_grad=False)
        self.quant_type = weight.quant_type
        self.logical_shape = weight.logical_shape
        self.compute_dtype = compute_dtype
        self.disk_rows = weight.disk_rows

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        unique, inverse = torch.unique(inputs, sorted=False, return_inverse=True)
        if inputs.device.type == 'mps' and self.disk_rows is not None:
            selected = self.disk_rows.read(unique.cpu().tolist())
        else:
            selected = self.weight.index_select(0, unique.to(self.weight.device))
        selected_weight = GGUFWeight(
            selected,
            self.quant_type,
            (unique.numel(), self.logical_shape[1]),
        )
        rows = _dequantize(selected_weight, inputs.device, self.compute_dtype)
        return rows.index_select(0, inverse.reshape(-1)).reshape(*inputs.shape, self.logical_shape[1])


class H3LoRALinear(nn.Module):
    """Runtime LoRA branch that leaves the packed GGUF base weight untouched."""

    def __init__(
        self,
        base_layer: nn.Module,
        down_weight: torch.Tensor,
        up_weight: torch.Tensor,
        scale: float,
        compute_dtype: torch.dtype,
    ):
        super().__init__()
        self.base_layer = base_layer
        self.lora_down = nn.Linear(down_weight.shape[1], down_weight.shape[0], bias=False)
        self.lora_up = nn.Linear(up_weight.shape[1], up_weight.shape[0], bias=False)
        self.lora_down.weight = nn.Parameter(
            down_weight.to(device="cpu", dtype=compute_dtype, copy=True), requires_grad=False
        )
        self.lora_up.weight = nn.Parameter(
            up_weight.to(device="cpu", dtype=compute_dtype, copy=True), requires_grad=False
        )
        self.scale = float(scale)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        output = self.base_layer(inputs)
        lora_inputs = inputs.to(dtype=self.lora_down.weight.dtype)
        delta = self.lora_up(self.lora_down(lora_inputs))
        return output + delta.to(dtype=output.dtype) * self.scale


class H3AdaLNCurveTable(nn.Module):
    """Continuous timestep lookup used by pruned H3 checkpoints."""

    def __init__(self, table: torch.Tensor):
        super().__init__()
        self.register_buffer("table", table)

    @property
    def linear_1(self):
        # MiniMaxH3Transformer3DModel uses the first MLP weight solely to
        # choose the timestep-input dtype. Preserve that interface without
        # registering a fake module (and therefore fake checkpoint weights).
        return self

    @property
    def weight(self):
        return self.table

    def forward(self, timesteps: torch.Tensor) -> torch.Tensor:
        table = self.table
        positions = timesteps.to(device=table.device, dtype=torch.float32).clamp(0.0, 1.0)
        positions = positions * (table.shape[0] - 1)
        lower = positions.floor().long().clamp(max=table.shape[0] - 2)
        fraction = (positions - lower).unsqueeze(-1).to(table.dtype)
        return torch.lerp(table[lower], table[lower + 1], fraction)


class H3PrunedAdaLNModulation(nn.Module):
    """AdaLN projection for a curve table that already contains SiLU output."""

    def __init__(self, source: nn.Module):
        super().__init__()
        self.hidden_size = source.hidden_size
        self.linear = source.linear

    def forward(self, temb: torch.Tensor) -> tuple[torch.Tensor, ...]:
        projected = self.linear(temb.to(self.linear.weight.dtype))
        projected = projected.view(-1, 6 * self.hidden_size)
        return projected.chunk(6, dim=-1)


class H3PrunedAdaLNOut(nn.Module):
    """Final pruned AdaLN projection without the full-model SiLU step."""

    def __init__(self, source: nn.Module):
        super().__init__()
        self.norm = source.norm
        self.linear = source.linear

    def forward(
        self, hidden_states: torch.Tensor, temb: torch.Tensor, timestep_indices: torch.Tensor
    ) -> torch.Tensor:
        shift, scale = self.linear(temb.to(self.linear.weight.dtype)).chunk(2, dim=-1)
        hidden_states = self.norm(hidden_states)
        return hidden_states * (1.0 + scale.index_select(0, timestep_indices)) + shift.index_select(
            0, timestep_indices
        )


def _module_and_name(model: nn.Module, key: str) -> tuple[nn.Module, str]:
    path, name = key.rsplit(".", 1)
    return model.get_submodule(path), name


def _parent_and_child(model: nn.Module, module_path: str) -> tuple[nn.Module, str]:
    if "." not in module_path:
        return model, module_path
    parent_path, child_name = module_path.rsplit(".", 1)
    return model.get_submodule(parent_path), child_name


def _reshape_for_h3_target(
    module: nn.Module, name: str, value: torch.Tensor, key: str
) -> torch.Tensor:
    """Restore shapes flattened by GGUF's limited tensor dimensionality."""
    target = getattr(module, name, None)
    if not isinstance(target, torch.Tensor):
        return value
    expected_shape = tuple(target.shape)
    if tuple(value.shape) == expected_shape:
        return value
    if value.numel() != target.numel():
        raise ValueError(
            f"GGUF tensor {key} has shape {tuple(value.shape)}, expected {expected_shape}"
        )
    return value.reshape(expected_shape)


def _normalize_h3_lora_target(target: str) -> str:
    """Map Diffusers, Musubi/Kohya, and Comfy H3 names to this model."""
    prefixes = ("base_model.model.", "diffusion_model.", "pipe.dit.", "transformer.")
    while any(target.startswith(prefix) for prefix in prefixes):
        for prefix in prefixes:
            if target.startswith(prefix):
                target = target[len(prefix):]
                break

    if target.startswith("lora_unet_"):
        target = target[len("lora_unet_"):]
        target = re.sub(
            r"^token_refiner_(?:refiner_)?blocks_(\d+)_",
            r"token_refiner.refiner_blocks.\1.",
            target,
        )
        target = re.sub(r"^(?:transformer_)?blocks_(\d+)_", r"transformer_blocks.\1.", target)
        flattened = (
            ("self_attn_out_proj", "attn.to_out.0"),
            ("self_attn_to_out_0", "attn.to_out.0"),
            ("self_attn_qkv_proj", "attn.qkv_proj"),
            ("self_attn_to_q", "attn.to_q"),
            ("self_attn_to_k", "attn.to_k"),
            ("self_attn_to_v", "attn.to_v"),
            ("self_attn_q", "attn.to_q"),
            ("self_attn_k", "attn.to_k"),
            ("self_attn_v", "attn.to_v"),
            ("self_attn_o", "attn.to_out.0"),
            ("attn_out_proj", "attn.to_out.0"),
            ("attn_to_out_0", "attn.to_out.0"),
            ("attn_qkv_proj", "attn.qkv_proj"),
            ("attn_to_q", "attn.to_q"),
            ("attn_to_k", "attn.to_k"),
            ("attn_to_v", "attn.to_v"),
            ("ffn_net_0_proj", "ff.net.0.proj"),
            ("ffn_net_2", "ff.net.2"),
            ("ffn_0", "ff.net.0.proj"),
            ("ffn_2", "ff.net.2"),
            ("mlp_fc1", "ff.net.0.proj"),
            ("mlp_fc2", "ff.net.2"),
        )
        for source, destination in flattened:
            target = target.replace(source, destination)

    if target.startswith("token_refiner.blocks."):
        target = target.replace(
            "token_refiner.blocks.", "token_refiner.refiner_blocks.", 1
        )
    elif target.startswith("blocks."):
        target = target.replace("blocks.", "transformer_blocks.", 1)

    # A trailing sentinel lets the same rules handle both a terminal module
    # name (the common LoRA case) and a module followed by another segment.
    target = f"{target}."
    replacements = (
        (".self_attn.qkv_proj.", ".attn.qkv_proj."),
        (".self_attn.q.", ".attn.to_q."),
        (".self_attn.k.", ".attn.to_k."),
        (".self_attn.v.", ".attn.to_v."),
        (".self_attn.o.", ".attn.to_out.0."),
        (".self_attn.out_proj.", ".attn.to_out.0."),
        (".attn.q.", ".attn.to_q."),
        (".attn.k.", ".attn.to_k."),
        (".attn.v.", ".attn.to_v."),
        (".attn.out_proj.", ".attn.to_out.0."),
        (".mlp.fc1.", ".ff.net.0.proj."),
        (".mlp.fc2.", ".ff.net.2."),
        (".ffn.0.", ".ff.net.0.proj."),
        (".ffn.2.", ".ff.net.2."),
    )
    for source, destination in replacements:
        target = target.replace(source, destination)
    target = target.replace("final_layer.adaln_proj.linear", "norm_out.linear")
    return target.rstrip(".")


def _split_h3_lora_key(key: str) -> tuple[str, str, bool] | None:
    suffixes = (
        (".lora_A.default.weight", "a"),
        (".lora_B.default.weight", "b"),
        (".lora_A.weight", "a"),
        (".lora_B.weight", "b"),
        (".lora_down.weight", "a"),
        (".lora_up.weight", "b"),
        (".alpha", "alpha"),
    )
    for suffix, kind in suffixes:
        if key.endswith(suffix):
            source_target = key[: -len(suffix)]
            # Native H3/Musubi fc1 stores [gate, values], while Diffusers'
            # SwiGLU projection consumes [values, gate]. Its LoRA delta needs
            # the same half swap as the corresponding GGUF base weight.
            swap_output_halves = source_target.endswith(".mlp.fc1") or source_target.endswith(
                "_mlp_fc1"
            )
            return _normalize_h3_lora_target(source_target), kind, swap_output_halves
    return None


def _orient_lora_pair(
    down: torch.Tensor, up: torch.Tensor, in_features: int, out_features: int
) -> tuple[torch.Tensor, torch.Tensor]:
    if down.ndim != 2 or up.ndim != 2:
        raise ValueError("H3 LoRA linear weights must be rank-2 tensors")
    if down.shape[1] == in_features and up.shape == (out_features, down.shape[0]):
        return down, up
    if down.shape[0] == in_features and up.shape == (down.shape[1], out_features):
        return down.T.contiguous(), up.T.contiguous()
    raise ValueError(
        f"H3 LoRA shapes {tuple(down.shape)} and {tuple(up.shape)} do not match "
        f"a {out_features}x{in_features} linear layer"
    )


def _h3_linear_dimensions(module: nn.Module) -> tuple[int, int] | None:
    if isinstance(module, nn.Linear):
        return module.in_features, module.out_features
    if isinstance(module, H3LoRALinear):
        return module.lora_down.in_features, module.lora_up.out_features
    return None


def _attach_h3_lora_pair(
    model: nn.Module,
    target: str,
    down: torch.Tensor,
    up: torch.Tensor,
    alpha: torch.Tensor | None,
    strength: float,
    compute_dtype: torch.dtype,
    swap_output_halves: bool = False,
) -> list[str]:
    targets = [target]
    if target.endswith(".attn.qkv_proj"):
        prefix = target.removesuffix("qkv_proj")
        targets = [f"{prefix}{name}" for name in ("to_q", "to_k", "to_v")]
        modules = [model.get_submodule(name) for name in targets]
        dimensions = [_h3_linear_dimensions(module) for module in modules]
        if any(item is None for item in dimensions):
            raise ValueError(f"H3 LoRA fused QKV target is not linear: {target}")
        in_features = dimensions[0][0]
        output_sizes = [item[1] for item in dimensions]
        if any(item[0] != in_features for item in dimensions):
            raise ValueError(f"H3 LoRA fused QKV inputs differ for {target}")
        down, up = _orient_lora_pair(down, up, in_features, sum(output_sizes))
        # Native H3 stores three contiguous Q, K and V output ranges. This is
        # also how the reference runner splits qkv_proj.forward(...). Do not
        # apply the per-head interleave used by the video VAE's unrelated
        # fused attention tensors.
        up_parts = up.split(output_sizes, dim=0)
        pairs = [(name, module, down, part) for name, module, part in zip(targets, modules, up_parts)]
    else:
        module = model.get_submodule(target)
        dimensions = _h3_linear_dimensions(module)
        if dimensions is None:
            raise ValueError(f"H3 LoRA target is not a linear layer: {target}")
        down, up = _orient_lora_pair(down, up, *dimensions)
        if swap_output_halves:
            if up.shape[0] % 2:
                raise ValueError(f"H3 LoRA SwiGLU output is not even for {target}")
            values, gate = up.chunk(2, dim=0)
            up = torch.cat((gate, values), dim=0).contiguous()
        pairs = [(target, module, down, up)]

    rank = down.shape[0]
    alpha_value = float(alpha.reshape(-1)[0]) if alpha is not None else float(rank)
    if not math.isfinite(alpha_value):
        raise ValueError(f"H3 LoRA alpha is not finite for {target}")
    scale = float(strength) * alpha_value / max(rank, 1)
    installed = []
    for name, module, pair_down, pair_up in pairs:
        parent, child_name = _parent_and_child(model, name)
        branch_dtype = getattr(module, "compute_dtype", compute_dtype)
        setattr(
            parent,
            child_name,
            H3LoRALinear(module, pair_down, pair_up, scale, branch_dtype),
        )
        installed.append(name)
    return installed


def load_h3_lora(
    model: nn.Module,
    path: str | Path,
    strength: float = 1.0,
    compute_dtype: torch.dtype = torch.bfloat16,
) -> list[str]:
    """Attach a local H3 LoRA to a GGUF-backed transformer at runtime."""
    from safetensors import safe_open

    if not math.isfinite(strength):
        raise ValueError("H3 LoRA strength must be finite")
    installed: list[str] = []
    with safe_open(str(path), framework="pt", device="cpu") as checkpoint:
        metadata = checkpoint.metadata() or {}
        metadata_alpha = metadata.get("alpha")
        baked_scale = any(
            "baked" in str(metadata.get(field, "")).lower()
            for field in ("baked_scale", "alpha_tensors", "scale")
        )
        # Dynamic-rank conversions can bake the source alpha/rank factor into
        # each B matrix and retain the original global alpha for provenance.
        # Reapplying that global value per resized rank massively over-scales
        # the smallest branches. Explicit per-target alpha tensors, when
        # present, still take precedence below.
        if baked_scale:
            metadata_alpha = None
        if metadata_alpha is not None:
            try:
                metadata_alpha = float(metadata_alpha)
            except (TypeError, ValueError) as exc:
                raise ValueError("H3 LoRA metadata alpha must be numeric") from exc
            if not math.isfinite(metadata_alpha) or metadata_alpha <= 0:
                raise ValueError("H3 LoRA metadata alpha must be finite and positive")
        groups: dict[str, dict[str, str]] = {}
        swap_output_targets: set[str] = set()
        for key in checkpoint.keys():
            parsed = _split_h3_lora_key(key)
            if parsed is None:
                continue
            target, kind, swap_output_halves = parsed
            groups.setdefault(target, {})[kind] = key
            if swap_output_halves:
                swap_output_targets.add(target)
        if not groups:
            raise ValueError("H3 LoRA contains no supported adapter tensors")

        incomplete = []
        for target, parts in groups.items():
            if "a" not in parts or "b" not in parts:
                incomplete.append(target)
                continue
            try:
                installed.extend(
                    _attach_h3_lora_pair(
                        model,
                        target,
                        checkpoint.get_tensor(parts["a"]),
                        checkpoint.get_tensor(parts["b"]),
                        (
                            checkpoint.get_tensor(parts["alpha"])
                            if "alpha" in parts
                            else torch.tensor(metadata_alpha)
                            if metadata_alpha is not None
                            else None
                        ),
                        strength,
                        compute_dtype,
                        target in swap_output_targets,
                    )
                )
            except (AttributeError, KeyError) as exc:
                raise ValueError(f"H3 LoRA target does not exist: {target}") from exc
    if incomplete:
        raise ValueError(f"H3 LoRA has incomplete tensor pairs: {incomplete[:5]}")
    if not installed:
        raise ValueError("H3 LoRA did not match any transformer layers")
    model.requires_grad_(False).eval()
    return installed


def _install_weights(
    model: nn.Module,
    weights: dict[str, GGUFWeight],
    compute_dtype: torch.dtype,
    keep_in_fp32_patterns: tuple[str, ...] = (),
) -> None:
    from accelerate.utils import set_module_tensor_to_device

    model_keys = set(model.state_dict().keys())
    unexpected = sorted(set(weights) - model_keys)
    if unexpected:
        raise ValueError(f"GGUF contains unmapped weights: {unexpected[:5]}")

    for key, weight in weights.items():
        module, name = _module_and_name(model, key)
        tensor_compute_dtype = (
            torch.float32 if any(pattern in key for pattern in keep_in_fp32_patterns) else compute_dtype
        )
        # GGUF stores BF16 as packed uint8 pairs. It is not smaller than the
        # compute representation, and H3 uses it for biases, norms, and the
        # Qwen vision tower (including Conv3d), so materialize it directly
        # instead of installing a quantized Linear wrapper.
        if weight.quant_type == GGMLQuantizationType.BF16:
            value = _dequantize(weight, torch.device("cpu"), tensor_compute_dtype)
            value = _reshape_for_h3_target(module, name, value, key)
            set_module_tensor_to_device(model, key, "cpu", value=value, dtype=value.dtype)
            continue
        if name == "weight" and isinstance(module, nn.Linear) and (
            weight.quantized or weight.row_indices is not None or weight.swap_output_halves
        ):
            parent, child_name = _parent_and_child(model, key.rsplit(".", 1)[0])
            setattr(parent, child_name, GGUFLinear(module, weight, tensor_compute_dtype))
            continue
        if name == "weight" and weight.quantized and isinstance(module, nn.Embedding):
            parent, child_name = _parent_and_child(model, key.rsplit(".", 1)[0])
            setattr(parent, child_name, GGUFEmbedding(module, weight, tensor_compute_dtype))
            continue
        if weight.quantized:
            raise ValueError(f"Unsupported quantized module for {key}: {type(module).__name__}")
        # Plain F16/F32 tensors must follow the same mixed-precision contract
        # as dequantized tensors. Leaving AdaLN weights in checkpoint FP16
        # promotes BF16 residual arithmetic to FP32 and corrupts the denoising
        # trajectory. copy=True also detaches mmap-backed, read-only arrays.
        value = weight.tensor.reshape(weight.logical_shape).to(
            dtype=tensor_compute_dtype, copy=True
        )
        value = _reshape_for_h3_target(module, name, value, key)
        set_module_tensor_to_device(model, key, "cpu", value=value, dtype=value.dtype)

    missing = sorted(key for key in model_keys - set(weights) if not key.endswith("rope.inv_freq"))
    if missing:
        raise ValueError(f"GGUF is missing model weights: {missing[:5]}")


def _map_h3_weights(source: dict[str, GGUFWeight]) -> dict[str, GGUFWeight]:
    mapped: dict[str, GGUFWeight] = {}
    inner_dim = 56 * 128
    for key, weight in source.items():
        if key == "rope.inv_freq":
            continue
        target = key
        if target.startswith("token_refiner.blocks."):
            target = target.replace("token_refiner.blocks.", "token_refiner.refiner_blocks.", 1)
        elif target.startswith("blocks."):
            target = target.replace("blocks.", "transformer_blocks.", 1)
        replacements = {
            "time_embedder.proj_in.": "time_embedder.linear_1.",
            "time_embedder.proj_out.": "time_embedder.linear_2.",
            "video_patch_proj.": "proj_in.",
            "audio_patch_proj.": "audio_proj_in.",
            "condition_proj.": "context_embedder.",
            "final_layer.norm.": "norm_out.norm.",
            "final_layer.adaln_proj.linear.": "norm_out.linear.",
            "final_layer.video_out.": "proj_out.",
            "final_layer.audio_out.": "audio_proj_out.",
            ".attn.q_norm.": ".attn.norm_q.",
            ".attn.k_norm.": ".attn.norm_k.",
            ".attn.out_proj.": ".attn.to_out.0.",
        }
        for before, after in replacements.items():
            target = target.replace(before, after)

        if target.endswith(".attn.qkv_proj.weight"):
            if weight.tensor.ndim != 2 or weight.logical_shape[0] != 3 * inner_dim:
                raise ValueError(f"Cannot split packed QKV tensor {key}")
            prefix = target.removesuffix("qkv_proj.weight")
            for index, name in enumerate(("to_q", "to_k", "to_v")):
                rows = torch.arange(index * inner_dim, (index + 1) * inner_dim)
                mapped[f"{prefix}{name}.weight"] = GGUFWeight(
                    weight.tensor,
                    weight.quant_type,
                    (inner_dim, weight.logical_shape[1]),
                    row_indices=rows,
                    disk_rows=weight.disk_rows,
                )
            continue
        if target.endswith(".mlp.fc1.weight"):
            target = target.replace(".mlp.fc1.", ".ff.net.0.proj.")
            mapped[target] = GGUFWeight(
                weight.tensor,
                weight.quant_type,
                weight.logical_shape,
                swap_output_halves=True,
                disk_rows=weight.disk_rows,
            )
            continue
        target = target.replace(".mlp.fc2.", ".ff.net.2.")
        mapped[target] = weight
    return mapped


def _new_h3_transformer(source):
    from accelerate import init_empty_weights
    from diffusers import MiniMaxH3Transformer3DModel

    curve = source.get("adaln_t_table")
    with init_empty_weights():
        model = MiniMaxH3Transformer3DModel(
            time_embed_dim=curve.logical_shape[1] if curve is not None else 2688
        )
    if curve is not None:
        # The pruned checkpoint stores samples of silu(time_embedder(t)) in a
        # shared curve table. It consumes scalar normalized timesteps directly,
        # so bypass the full model's sinusoidal ``time_proj`` as well as its
        # timestep MLP. Each AdaLN projection then consumes the already-
        # activated curve coordinates directly.
        model.time_proj = nn.Identity()
        model.time_embedder = H3AdaLNCurveTable(
            torch.empty(curve.logical_shape, dtype=torch.float32, device="meta")
        )
        for block in model.transformer_blocks:
            block.adaln_proj = H3PrunedAdaLNModulation(block.adaln_proj)
        model.norm_out = H3PrunedAdaLNOut(model.norm_out)
    return model


def load_h3_transformer(path: str | Path, compute_dtype: torch.dtype = torch.bfloat16):
    if Path(path).suffix == ".safetensors":
        return load_h3_safetensors(path, compute_dtype)
    reader, source = _read_weights(path)
    model = _new_h3_transformer(source)
    mapped = _map_h3_weights(source)
    if "adaln_t_table" in mapped:
        mapped["time_embedder.table"] = mapped.pop("adaln_t_table")
    # Match the official Diffusers checkpoint's mixed-precision contract.
    # AdaLN projections stay in the compute dtype: promoting their gates to
    # FP32 promotes the residual stream too, so the next BF16 RMSNorm receives
    # mismatched inputs and produces materially different denoising results.
    fp32_patterns = tuple(model._keep_in_fp32_modules or ()) + (
        "time_embedder.table",
    )
    _install_weights(model, mapped, compute_dtype, keep_in_fp32_patterns=fp32_patterns)
    model._bonzai_gguf_reader = reader
    model.requires_grad_(False).eval()
    return model


def _map_qwen_key(key: str) -> str:
    if key.startswith("visual."):
        return "model." + key
    if key.startswith("model.embed_tokens."):
        return key.replace("model.embed_tokens.", "model.language_model.embed_tokens.", 1)
    if key.startswith("model.layers."):
        return key.replace("model.layers.", "model.language_model.layers.", 1)
    if key.startswith("model.norm."):
        return key.replace("model.norm.", "model.language_model.norm.", 1)
    return key


def load_h3_text_encoder(
    path: str | Path,
    config_source: str = "MiniMaxAI/MiniMax-H3",
    compute_dtype: torch.dtype = torch.bfloat16,
):
    from accelerate import init_empty_weights
    from transformers import AutoConfig, Qwen3VLForConditionalGeneration

    config = AutoConfig.from_pretrained(config_source, subfolder="text_encoder")
    with init_empty_weights():
        model = Qwen3VLForConditionalGeneration(config)
    # The H3 conditioner checkpoint intentionally stops after decoder layer 50.
    # H3 consumes that layer's pre-final-norm state and never uses layers 51-64
    # or the language-model head.
    model.model.language_model.layers = nn.ModuleList(list(model.model.language_model.layers[:50]))
    model.model.language_model.norm = nn.Identity()
    reader, source = _read_weights(path)
    mapped = {_map_qwen_key(key): value for key, value in source.items()}
    mapped.pop("lm_head.weight", None)
    mapped.pop("model.language_model.norm.weight", None)
    model.lm_head = nn.Identity()
    _install_weights(model, mapped, compute_dtype)
    model._bonzai_gguf_reader = reader
    model.requires_grad_(False).eval()
    return model


def _load_safetensors_component(
    model_class: type[ModelT],
    config_dir: str | Path,
    checkpoint_path: str | Path,
    converter: Callable[[str, torch.Tensor, set[str]], list[tuple[str, torch.Tensor]]] | None = None,
) -> ModelT:
    """Load and optionally convert a component without a duplicate random model."""
    from accelerate import init_empty_weights
    from accelerate.utils import set_module_tensor_to_device
    from safetensors import safe_open

    config = model_class.load_config(str(config_dir))
    # Parameters dominate these VAEs and stay on meta until streamed from the
    # checkpoint. Keep computed, non-persistent buffers (notably rotary
    # inv_freq) materialized on CPU because no checkpoint tensor exists for
    # them and they are only a few bytes.
    with init_empty_weights(include_buffers=False):
        model = model_class.from_config(config)

    expected = set(model.state_dict().keys())
    loaded: set[str] = set()
    unexpected: list[str] = []
    with safe_open(str(checkpoint_path), framework="pt", device="cpu") as checkpoint:
        for source_key in checkpoint.keys():
            value = checkpoint.get_tensor(source_key)
            converted = converter(source_key, value, expected) if converter else [(source_key, value)]
            for key, converted_value in converted:
                if key not in expected:
                    unexpected.append(key)
                    continue
                set_module_tensor_to_device(
                    model, key, "cpu", value=converted_value, dtype=converted_value.dtype
                )
                loaded.add(key)

    missing = sorted(expected - loaded)
    if missing or unexpected:
        details = []
        if missing:
            details.append(f"missing={missing[:5]}")
        if unexpected:
            details.append(f"unexpected={sorted(unexpected)[:5]}")
        raise ValueError(f"Incompatible {model_class.__name__} checkpoint: {'; '.join(details)}")

    meta_tensors = [
        name
        for name, value in (*model.named_parameters(), *model.named_buffers())
        if value.device.type == "meta"
    ]
    if meta_tensors:
        raise ValueError(
            f"{model_class.__name__} still has uninitialized tensors: {meta_tensors[:5]}"
        )
    model.requires_grad_(False).eval()
    return model


def _reorder_interleaved_qkv(
    weight: torch.Tensor, num_attention_heads: int = 32, attention_head_dim: int = 64
) -> torch.Tensor:
    expected_rows = num_attention_heads * 3 * attention_head_dim
    if weight.shape[0] != expected_rows:
        raise ValueError(f"Fused QKV has {weight.shape[0]} rows; expected {expected_rows}")
    grouped = weight.reshape(num_attention_heads, 3 * attention_head_dim, *weight.shape[1:])
    query, key, value = grouped.split(attention_head_dim, dim=1)
    return torch.cat(
        [part.reshape(num_attention_heads * attention_head_dim, *weight.shape[1:]) for part in (query, key, value)],
        dim=0,
    )


def _rename_video_vae_key(source_key: str) -> str:
    target_key = source_key
    if target_key.startswith("encoder.down."):
        level, rest = target_key.removeprefix("encoder.down.").split(".", 1)
        rest = rest.replace("block.", "resnets.", 1).replace("nin_shortcut.", "conv_shortcut.", 1)
        rest = rest.replace("downsample.", "downsamplers.0.", 1)
        target_key = f"encoder.down_blocks.{level}.{rest}"
    target_key = target_key.replace("decoder.x_embedder.", "decoder.proj_in.")
    target_key = target_key.replace(".attn.to_out.", ".attn.to_out.0.")
    target_key = target_key.replace(".ff.w1.", ".ff.net.0.proj.")
    target_key = target_key.replace(".ff.w2.", ".ff.net.2.")
    return target_key


def _convert_video_vae_tensor(
    source_key: str, tensor: torch.Tensor, _expected: set[str]
) -> list[tuple[str, torch.Tensor]]:
    # Training-only/config tensors are not part of the Diffusers state dict.
    if source_key in {"decoder.mask_token", "latents_mean", "latents_std"}:
        return []
    if ".attn.to_qkv." in source_key:
        reordered = _reorder_interleaved_qkv(tensor)
        query, key, value = reordered.chunk(3, dim=0)
        prefix, suffix = source_key.split(".attn.to_qkv.")
        return [
            (f"{prefix}.attn.to_q.{suffix}", query.contiguous()),
            (f"{prefix}.attn.to_k.{suffix}", key.contiguous()),
            (f"{prefix}.attn.to_v.{suffix}", value.contiguous()),
        ]
    target_key = _rename_video_vae_key(source_key)
    if ".ff.w1." in source_key:
        gate, up = tensor.chunk(2, dim=0)
        tensor = torch.cat([up, gate], dim=0).contiguous()
    return [(target_key, tensor)]


def _convert_audio_vae_tensor(
    source_key: str, tensor: torch.Tensor, expected: set[str]
) -> list[tuple[str, torch.Tensor]]:
    if source_key in {"latents_mean", "latents_std"}:
        return []
    if source_key in expected:
        return [(source_key, tensor)]
    if source_key.endswith(".weight"):
        prefix = source_key.removesuffix(".weight")
        key_g, key_v = f"{prefix}.weight_g", f"{prefix}.weight_v"
        if key_g in expected and key_v in expected:
            # Unsloth stores the effective, de-weight-normalized convolution.
            # Choosing v=weight and g=||v|| makes weight_norm reproduce it.
            return [(key_g, torch.norm_except_dim(tensor, 2, 0)), (key_v, tensor)]
    return [(source_key, tensor)]


def _patch_video_vae_tile_dtype(model: nn.Module) -> None:
    """Match each tiled VAE path to that path's numerical dtype."""
    model_class = type(model)
    if getattr(model_class, "_bonzai_h3_dtype_patched", False):
        return

    for method_name, dtype_module_name in (
        ("_encode_clip", "encoder"),
        ("_decode_clip", "post_quant_conv"),
    ):
        original = getattr(model_class, method_name)

        def dtype_safe_call(
            self,
            tensor: torch.Tensor,
            *args,
            _original=original,
            _dtype_module_name=dtype_module_name,
            **kwargs,
        ):
            dtype_module = getattr(self, _dtype_module_name, self)
            dtype = getattr(dtype_module, "_bonzai_compute_dtype", None) or next(dtype_module.parameters()).dtype
            return _original(self, tensor.to(dtype=dtype), *args, **kwargs)

        setattr(model_class, method_name, dtype_safe_call)
    model_class._bonzai_h3_dtype_patched = True


def load_h3_video_vae(config_dir: str | Path, checkpoint_path: str | Path):
    from diffusers import AutoencoderKLMiniMaxH3

    model = _load_safetensors_component(
        AutoencoderKLMiniMaxH3, config_dir, checkpoint_path, _convert_video_vae_tensor
    )
    # The Unsloth VAE checkpoint is fp16. Diffusers creates normalized encoder
    # pixels and denormalized decoder latents as fp32 because the official VAE
    # is fp32. Cast at the tiled boundaries instead of doubling this 5.2 GB
    # checkpoint, and patch the class so no bound-method cycle retains a loaded
    # VAE between the encoder and denoiser phases.
    _patch_video_vae_tile_dtype(model)
    return model


def load_h3_audio_vae(config_dir: str | Path, checkpoint_path: str | Path):
    from diffusers import AutoencoderKLMiniMaxH3Audio

    return _load_safetensors_component(
        AutoencoderKLMiniMaxH3Audio, config_dir, checkpoint_path, _convert_audio_vae_tensor
    )


def _select_h3_rows(tensor, rows):
    """Preserve file-backed storage for contiguous Q/K/V partitions."""
    if rows is None or tensor.numel() == 1:
        return tensor
    if rows.numel() and torch.equal(rows, torch.arange(int(rows[0]), int(rows[0]) + rows.numel(), device=rows.device)):
        return tensor.narrow(0, int(rows[0]), rows.numel())
    return tensor.index_select(0, rows.to(tensor.device))


def load_h3_safetensors(path, compute_dtype=torch.bfloat16):
    """Load native H3 hybrid INT8/W4 tensors without expanding the full model."""
    import json
    from safetensors import safe_open
    from accelerate.utils import set_module_tensor_to_device
    from h3_quantized import H3QuantizedLinear

    # safe_open validates the checkpoint; header offsets let the MPS runtime
    # read bounded rows without faulting the entire mmap into the file cache.
    with open(path, 'rb') as handle:
        header_size = int.from_bytes(handle.read(8), 'little')
        if header_size > 100_000_000:
            raise ValueError('H3 safetensors header is too large')
        header = json.loads(handle.read(header_size))
    file = WeightFile(path)

    with safe_open(str(path), framework='pt', device='cpu') as reader:
        metadata = reader.metadata() or {}
        quant = json.loads(metadata.get('_quantization_metadata', '{}')).get('layers', {})
        source, quant_by_tensor = {}, {}
        keys = set(reader.keys())
        auxiliary = {'.comfy_quant', '.weight_scale', '.weight_s_rel', '.weight_s_channel', '.weight_codebook'}
        for key in keys:
            # Pruned projections already incorporate the PCA basis and mean.
            if key in ('adaln_basis', 'adaln_mean') or any(key.endswith(s) for s in auxiliary):
                continue
            tensor = reader.get_tensor(key)
            shape = tuple(tensor.shape)
            layer = key.removesuffix('.weight')
            config = quant.get(layer) if key.endswith('.weight') else None
            if config:
                # Star Ultimate Model Converter writes header metadata only.
                # When redundant per-layer metadata exists, it must agree.
                embedded_key = layer + '.comfy_quant'
                if embedded_key in keys:
                    embedded = json.loads(bytes(reader.get_tensor(embedded_key).tolist()))
                    if any(embedded.get(k) != v for k, v in config.items()):
                        raise ValueError(f'Conflicting quantization metadata: {layer}')
                if config['format'] == 'asym_w4a8_int8':
                    shape = (shape[0], shape[1] * 2)
                quant_by_tensor[tensor.data_ptr()] = (layer, config)
            elif tensor.dtype == torch.int8:
                raise ValueError(f'Missing quantization metadata: {key}')
            source[key] = GGUFWeight(tensor, GGMLQuantizationType.F32, shape)
        model = _new_h3_transformer(source)
        mapped = _map_h3_weights(source)
        if 'adaln_t_table' in mapped:
            mapped['time_embedder.table'] = mapped.pop('adaln_t_table')
        expected = set(model.state_dict())
        if set(mapped) != expected:
            raise ValueError(f'H3 checkpoint mapping mismatch: missing={sorted(expected-set(mapped))[:5]}, extra={sorted(set(mapped)-expected)[:5]}')
        fp32 = tuple(model._keep_in_fp32_modules or ()) + ('time_embedder.table',)
        # Assign biases/plain tensors first so replacing linears preserves them.
        quantized = []
        for key, weight in mapped.items():
            entry = quant_by_tensor.get(weight.tensor.data_ptr())
            if entry:
                quantized.append((key, weight, entry)); continue
            value = weight.tensor
            if weight.row_indices is not None:
                value = _select_h3_rows(value, weight.row_indices)
            if weight.swap_output_halves:
                a, b = value.chunk(2, 0); value = torch.cat((b, a), 0)
            dtype = torch.float32 if any(p in key for p in fp32) else compute_dtype
            module, name = _module_and_name(model, key)
            value = _reshape_for_h3_target(module, name, value, key)
            set_module_tensor_to_device(model, key, 'cpu', value=value.to(dtype), dtype=dtype)
        for key, weight, (layer, config) in quantized:
            module, name = _module_and_name(model, key)
            if name != 'weight' or not isinstance(module, nn.Linear):
                raise ValueError(f'Unsupported quantized target: {key}')
            def select(tensor):
                return _select_h3_rows(tensor, weight.row_indices)
            packed = select(weight.tensor)
            is_w4 = config['format'] == 'asym_w4a8_int8'
            scales = select(reader.get_tensor(layer + ('.weight_s_channel' if is_w4 else '.weight_scale')))
            relative = select(reader.get_tensor(layer + '.weight_s_rel').to(torch.float16)) if is_w4 else None
            codebook = reader.get_tensor(layer + '.weight_codebook') if is_w4 else None
            replacement = H3QuantizedLinear(module, packed, scales, config, relative=relative,
                codebook=codebook, swap_output_halves=weight.swap_output_halves)
            rows = weight.row_indices
            # H3 QKV partitions are contiguous. Keep the generic tensor path
            # available for a future checkpoint with noncontiguous partitions.
            if rows is None or torch.equal(rows, torch.arange(int(rows[0]), int(rows[0]) + rows.numel())):
                replacement.disk_rows = WeightRows(file,
                    8 + header_size + header[layer + '.weight']['data_offsets'][0],
                    weight.tensor.shape, weight.tensor.dtype,
                    row_offset=int(rows[0]) if rows is not None else 0)
            parent, child = _parent_and_child(model, key.rsplit('.', 1)[0])
            setattr(parent, child, replacement)
        model._bonzai_checkpoint_metadata = metadata
        model.requires_grad_(False).eval()
        return model


def preserve_h3_gguf_storage(model):
    """Do not onload the full vocabulary or replace mmap with CPU copies."""
    for module in model.modules():
        if isinstance(module, (GGUFLinear, GGUFEmbedding)):
            if module.weight.device.type != 'cpu':
                raise ValueError('Install GGUF streaming before moving packed weights')
            registry = getattr(module, '_diffusers_hook', None)
            if registry is not None:
                registry.remove_hook('group_offloading', recurse=False)


class _CPUFloatLinear(nn.Linear):
    def forward(self, inputs):
        x = inputs.float()
        result = torch.empty(*x.shape[:-1], self.out_features, device=x.device, dtype=torch.float32)
        # Do not expand/cache a full 128 MiB decoder MLP matrix per layer.
        for start in range(0, self.out_features, 512):
            stop = min(start + 512, self.out_features)
            result[..., start:stop] = nn.functional.linear(x, self.weight[start:stop].float(),
                None if self.bias is None else self.bias[start:stop].float())
        return result


class _CPUFloatConv3d(nn.Conv3d):
    def forward(self, inputs):
        return self._conv_forward(inputs.float(), self.weight.float(),
            None if self.bias is None else self.bias.float())


def stream_h3_cpu_decode(model):
    """FP32 VAE arithmetic without permanently doubling decoder storage.

    Model is private to this request. Tiny norm/modulation parameters use
    FP32 permanently; large affine/conv weights use temporary FP32 copies.
    """
    model._bonzai_compute_dtype = torch.float32
    for module in model.modules():
        if type(module) is nn.Linear:
            module.__class__ = _CPUFloatLinear
        elif type(module) is nn.Conv3d:
            module.__class__ = _CPUFloatConv3d
        elif not isinstance(module, (_CPUFloatLinear, _CPUFloatConv3d)):
            for parameter in module.parameters(recurse=False):
                if parameter.is_floating_point():
                    parameter.data = parameter.data.float()
