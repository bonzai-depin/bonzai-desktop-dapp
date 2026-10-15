"""Local Klein adapters, including full-factor LyCORIS LoKr on GGUF linears.

LoKr is evaluated as two small contractions, never merged into quantized
weights. Full-factor alpha scaling is 1, per LyCORIS LokrModule.
"""
import re
import torch
from safetensors.torch import load_file


def _targets(name):
    name = name.removeprefix("diffusion_model.").removeprefix("transformer.")
    match = re.fullmatch(r"double_blocks\.(\d+)\.(.+)", name)
    if match:
        block, suffix = match.groups()
        prefix = f"transformer_blocks.{block}."
        if suffix in ("img_attn.qkv", "txt_attn.qkv"):
            keys = ("to_q", "to_k", "to_v") if suffix.startswith("img") else ("add_q_proj", "add_k_proj", "add_v_proj")
            return [(prefix + "attn." + key, index) for index, key in enumerate(keys)]
        mapping = {"img_attn.proj": "attn.to_out.0", "txt_attn.proj": "attn.to_add_out",
                   "img_mlp.0": "ff.linear_in", "img_mlp.2": "ff.linear_out",
                   "txt_mlp.0": "ff_context.linear_in", "txt_mlp.2": "ff_context.linear_out"}
        if suffix in mapping:
            return [(prefix + mapping[suffix], None)]
    match = re.fullmatch(r"single_blocks\.(\d+)\.linear([12])", name)
    if match:
        block, number = match.groups()
        return [(f"single_transformer_blocks.{block}.attn." + ("to_qkv_mlp_proj" if number == "1" else "to_out"), None)]
    if name.startswith(("transformer_blocks.", "single_transformer_blocks.")):
        return [(name, None)]
    raise ValueError(f"Unsupported Klein LoKr target: {name}")


def lokr_delta(x, w1, w2):
    # x @ kron(w1,w2).T, without allocating the dense Kronecker matrix.
    shaped = x.reshape(*x.shape[:-1], w1.shape[1], w2.shape[1])
    inner = torch.nn.functional.linear(shaped, w2)
    return torch.matmul(w1, inner).flatten(-2)


def install_lokr(transformer, state, strength):
    groups = {}
    for key, value in state.items():
        name, suffix = key.rsplit(".", 1)
        if suffix not in ("lokr_w1", "lokr_w2", "alpha"):
            raise ValueError(f"Unsupported Klein LoKr tensor: {key}")
        groups.setdefault(name, {})[suffix] = value
    planned = []
    for name, values in groups.items():
        w1, w2 = values.get("lokr_w1"), values.get("lokr_w2")
        if w1 is None or w2 is None or w1.ndim != 2 or w2.ndim != 2:
            raise ValueError(f"Klein LoKr requires two full matrix factors: {name}")
        if not torch.isfinite(w1).all() or not torch.isfinite(w2).all():
            raise ValueError(f"Non-finite Klein LoKr weights: {name}")
        targets = _targets(name)
        out_size, in_size = w1.shape[0]*w2.shape[0], w1.shape[1]*w2.shape[1]
        if out_size % len(targets):
            raise ValueError(f"Invalid fused Klein LoKr dimensions: {name}")
        for target, chunk in targets:
            module = transformer.get_submodule(target)
            if module.in_features != in_size or module.out_features != out_size // len(targets):
                raise ValueError(f"Klein LoKr shape mismatch: {name} -> {target}")
            planned.append((module, w1, w2, chunk))
    if not planned:
        raise ValueError("Empty Klein LoKr adapter")
    handles = []
    try:
        for module, w1, w2, chunk in planned:
            def hook(_module, args, output, w1=w1, w2=w2, chunk=chunk):
                x = args[0]
                delta = lokr_delta(x, w1.to(device=x.device, dtype=x.dtype), w2.to(device=x.device, dtype=x.dtype))
                if chunk is not None:
                    delta = delta.chunk(3, dim=-1)[chunk]
                return output + delta.to(output.dtype) * strength
            handles.append(module.register_forward_hook(hook))
    except Exception:
        for handle in handles:
            handle.remove()
        raise
    return handles


def load_klein_adapter(pipe, path, adapter, strength):
    state = load_file(str(path), device="cpu")
    if any(".lokr_" in key for key in state):
        return install_lokr(pipe.transformer, state, strength), False
    pipe.load_lora_weights(state, adapter_name=adapter)
    return [], True
