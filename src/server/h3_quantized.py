"""BonzAI's portable INT8/packed-W4 H3 linear layers (no ComfyUI dependency).

Wire format: Comfy-Org comfy-kitchen int8_tensorwise / asym_w4a8_int8.
Weights remain packed between forwards. Temporary unpacking is output-row bounded.
"""
from functools import lru_cache
import torch
from torch import nn


@lru_cache(maxsize=16)
def _rotation(size, device, dtype):
    if size < 4 or size & (size - 1) or (size.bit_length() - 1) % 2:
        raise ValueError('ConvRot requires a power-of-four group size')
    base = torch.ones(4, 4, device=device, dtype=dtype)
    base = base - 2 * torch.eye(4, device=device, dtype=dtype).flip(1)
    result = base
    while result.shape[0] < size:
        result = torch.kron(result, base)
    return result / size ** 0.5


def unpack_w4(packed, relative_scales, codebook, group_size):
    """Even columns are low nibbles; reconstruct INT8 before channel scaling."""
    n, half = packed.shape
    if group_size not in (4, 8, 16) or half * 2 % group_size:
        raise ValueError('Unsupported W4 group size')
    if relative_scales.shape != (n, half * 2 // group_size) or codebook.numel() != 16:
        raise ValueError('Invalid W4 scales/codebook shape')
    b = packed.to(torch.int32) & 255
    indices = torch.stack((b & 15, b >> 4), dim=-1).reshape(n, -1)
    values = codebook.float()[indices.long()].reshape(n, -1, group_size)
    return (values * relative_scales.float().unsqueeze(-1)).reshape(n, -1).round().clamp(-127, 127).to(torch.int8)


class H3QuantizedLinear(nn.Linear):
    """W8A8-compatible activation rounding, ConvRot and bounded MPS execution."""
    def __init__(self, source, packed, scales, config, *, relative=None, codebook=None,
                 swap_output_halves=False, chunk_rows=256, chunk_tokens=256):
        super().__init__(source.in_features, source.out_features, source.bias is not None, device='meta')
        self.weight = nn.Parameter(packed, requires_grad=False)
        self.bias = source.bias
        self.register_buffer('scales', scales.float().reshape(-1))
        # MPS cannot cast FP8: decode only compact scales on CPU, not full weights.
        self.register_buffer('relative', relative.to(torch.float16) if relative is not None else None)
        self.register_buffer('codebook', codebook.float() if codebook is not None else None)
        self.format = config['format']
        self.group_size = int(config.get('group_size', 16))
        self.rotation_size = int(config.get('convrot_groupsize', 256)) if config.get('convrot') else 0
        self.swap_output_halves = swap_output_halves
        if chunk_rows < 1 or chunk_tokens < 1:
            raise ValueError("H3 chunk dimensions must be positive")
        self.chunk_tokens = chunk_tokens
        self.chunk_rows = chunk_rows
        self.last_backend = None
        self.disk_rows = None
        if self.format not in ('int8_tensorwise', 'asym_w4a8_int8') or packed.dtype != torch.int8:
            raise ValueError('Unsupported H3 quantization format or weight dtype')
        multiplier = 2 if self.format == 'asym_w4a8_int8' else 1
        if tuple(packed.shape) != (source.out_features, source.in_features // multiplier):
            raise ValueError('Quantized H3 weight shape mismatch')
        if self.scales.numel() not in (1, source.out_features):
            raise ValueError('Invalid H3 channel scales')
        if self.rotation_size and source.in_features % self.rotation_size:
            raise ValueError('ConvRot does not divide input features')
        if self.format == 'asym_w4a8_int8' and (relative is None or codebook is None):
            raise ValueError('Missing W4 scale/codebook tensors')

    def forward(self, inputs):
        shape, dtype = inputs.shape, inputs.dtype
        x = inputs.reshape(-1, self.in_features)
        result = torch.empty(x.shape[0], self.out_features, device=x.device, dtype=dtype)
        native = (x.device.type == 'mps' and self.in_features % 32 == 0
                  and torch._C._dispatch_has_kernel_for_dispatch_key('aten::_weight_int8pack_mm', 'MPS'))
        # Quantize activations once into compact INT8 storage. Weight-major
        # traversal reads each disk tile only once even for long token sequences.
        # FP32 conversion still stays bounded to chunk_tokens at a time.
        quantized_inputs = torch.empty(x.shape, device=x.device, dtype=torch.int8)
        activation_scales = torch.empty((x.shape[0], 1), device=x.device, dtype=torch.float32)
        for token_start in range(0, x.shape[0], self.chunk_tokens):
            token_stop = min(token_start + self.chunk_tokens, x.shape[0])
            # Rotate in FP32 before activation quantization. Rotating BF16/FP16
            # first loses precision (and can overflow FP16) before scaling can
            # protect the INT8 conversion. The temporary remains token-bounded.
            values = x[token_start:token_stop].float()
            if self.rotation_size:
                h = _rotation(self.rotation_size, str(x.device), torch.float32)
                values = (values.reshape(-1, self.rotation_size) @ h).reshape(-1, self.in_features)
            scale_x = (values.abs().amax(-1, keepdim=True) / 127).clamp_min(1e-30)
            quantized_inputs[token_start:token_stop] = (values / scale_x).round().clamp(-127, 127).to(torch.int8)
            activation_scales[token_start:token_stop] = scale_x
        for start in range(0, self.out_features, self.chunk_rows):
            stop = min(start + self.chunk_rows, self.out_features)
            packed = (self.disk_rows.read(range(start, stop))
                      if x.device.type == 'mps' and self.disk_rows is not None
                      else self.weight[start:stop])
            weight = packed.to(x.device)
            if self.format == 'asym_w4a8_int8':
                weight = unpack_w4(weight, self.relative[start:stop].to(x.device), self.codebook.to(x.device), self.group_size)
            scales = (self.scales if self.scales.numel() == 1 else self.scales[start:stop]).to(x.device)
            for token_start in range(0, x.shape[0], self.chunk_tokens):
                token_stop = min(token_start + self.chunk_tokens, x.shape[0])
                qx = quantized_inputs[token_start:token_stop].float()
                scale_x = activation_scales[token_start:token_stop]
                if native and weight.shape[0] % 32 == 0:
                    y = torch.ops.aten._weight_int8pack_mm(qx.contiguous(), weight.contiguous(), scales.expand(weight.shape[0]).contiguous())
                    self.last_backend = 'mps_int8pack'
                else:
                    y = (qx @ weight.float().T) * scales
                    self.last_backend = f'{x.device.type}_chunked_fp32'
                y = y * scale_x
                if self.bias is not None:
                    y = y + self.bias[start:stop].to(device=x.device, dtype=y.dtype)
                if self.swap_output_halves:
                    half = self.out_features // 2
                    for a, b in ((start, min(stop, half)), (max(start, half), stop)):
                        if a < b:
                            dest = a + half if a < half else a - half
                            result[token_start:token_stop, dest:dest+b-a] = y[:, a-start:b-start].to(dtype)
                else:
                    result[token_start:token_stop, start:stop] = y.to(dtype)
                if x.device.type == 'mps':
                    torch.mps.synchronize()
        return result.reshape(*shape[:-1], self.out_features)


def preserve_h3_quantized_storage(model):
    """Keep packed file-backed weights on CPU; forward transfers bounded slices.

    Call immediately after leaf group-offloading is installed, before inference.
    Round-tripping entire packed layers through MPS would replace mmap views
    with private CPU allocations and gradually duplicate the checkpoint.
    """
    for module in model.modules():
        if not isinstance(module, H3QuantizedLinear):
            continue
        if module.weight.device.type != 'cpu':
            raise ValueError('Install H3 streaming before moving weights to an accelerator')
        registry = getattr(module, '_diffusers_hook', None)
        if registry is not None:
            registry.remove_hook('group_offloading', recurse=False)


def reclaim_h3_mps_cache(device):
    """Return unused GPU buffers at block boundaries when system RAM is tight."""
    if torch.device(device).type != 'mps':
        return False
    import psutil
    if psutil.virtual_memory().available >= 8 * 1024**3:
        return False
    torch.mps.synchronize()
    torch.mps.empty_cache()
    return True


def install_h3_memory_reclaim(blocks, device):
    if torch.device(device).type != 'mps':
        return
    for block in blocks:
        if getattr(block, '_bonzai_memory_reclaim', False):
            continue
        def after_block(module, args, output):
            reclaim_h3_mps_cache(device)
        block.register_forward_hook(after_block)
        block._bonzai_memory_reclaim = True
