"""Materialize packed non-linear parameters used directly by Qwen norms."""
import torch


def prepare_qwen_gguf(model, dtype):
    from diffusers.quantizers.gguf.utils import GGUFLinear, GGUFParameter, dequantize_gguf_tensor
    for module in model.modules():
        for name, parameter in list(module.named_parameters(recurse=False)):
            if not isinstance(parameter, GGUFParameter):
                continue
            if isinstance(module, GGUFLinear) and name == 'weight':
                continue
            # GGUF BF16 stores bytes; RMSNorm reads the scale directly rather
            # than through GGUFLinear's dequantizing forward method.
            value = dequantize_gguf_tensor(parameter).to(dtype=dtype)
            setattr(module, name, torch.nn.Parameter(value, requires_grad=False))
    return model
