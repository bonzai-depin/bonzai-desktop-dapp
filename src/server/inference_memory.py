"""Request-local memory policy; never changes sampling or rejects a request.

Use existing offload hooks for ordinary layers. GGUF projections can retain
packed CPU weights and dequantize output rows, rather than a full weight matrix.
No process-wide model-class monkeypatches or accelerator-specific requirement.
"""
import gc
import logging
import types

import torch

logger = logging.getLogger(__name__)
GiB = 1024 ** 3


def constrained(device, reserve_gib=12):
    """Choose placement, not admission. CPU/MPS share host memory."""
    import psutil
    if torch.device(device).type == 'cuda':
        free, _ = torch.cuda.mem_get_info(device)
        return free < reserve_gib * GiB
    memory = psutil.virtual_memory()
    return memory.total <= 48 * GiB or memory.available < reserve_gib * GiB


def reclaim(device):
    gc.collect()
    if torch.device(device).type == 'cuda':
        torch.cuda.empty_cache()
    elif torch.device(device).type == 'mps':
        torch.mps.empty_cache()


def detach_hooks(model):
    if model is None:
        return
    from accelerate.hooks import remove_hook_from_module
    remove_hook_from_module(model, recurse=True)
    for module in model.modules():
        registry = getattr(module, '_diffusers_hook', None)
        if registry is not None:
            registry.remove_hook('group_offloading', recurse=False)


def release_components(pipe, names, device):
    """Only for one-shot pipelines, after the component's last use."""
    for name in names:
        model = getattr(pipe, name, None)
        if model is not None:
            detach_hooks(model)
            pipe.register_modules(**{name: None})
            del model
    reclaim(device)


def release_before_decode(pipe, names, device):
    """Denoisers are no longer needed when VAE decoding begins."""
    import weakref
    reference = weakref.ref(pipe)
    vae = pipe.vae
    original = type(vae).decode
    released = False
    def decode(self, *args, **kwargs):
        nonlocal released
        owner = reference()
        if not released and owner is not None:
            released = True
            release_components(owner, names, device)
        return original(self, *args, **kwargs)
    vae.decode = types.MethodType(decode, vae)


def _bounded_gguf_forward(self, inputs):
    from diffusers.quantizers.gguf.utils import GGUFParameter, dequantize_gguf_tensor
    output = torch.empty((*inputs.shape[:-1], self.out_features),
                         dtype=self.compute_dtype, device=inputs.device)
    x = inputs.to(self.compute_dtype)
    for start in range(0, self.out_features, self._bonzai_rows):
        end = min(start + self._bonzai_rows, self.out_features)
        if self._bonzai_disk_rows is not None:
            raw = self._bonzai_disk_rows.read(range(start, end))
        else:
            raw = self.weight.as_tensor()[start:end]
        # Blocking copy: the disk reader lends a reusable staging buffer.
        packed = GGUFParameter(raw.to(inputs.device, non_blocking=False),
                               quant_type=self._bonzai_quant_type)
        weight = dequantize_gguf_tensor(packed).to(self.compute_dtype)
        bias = None if self.bias is None else self.bias[start:end].to(inputs.device, self.compute_dtype)
        output[..., start:end] = torch.nn.functional.linear(x, weight, bias)
        if inputs.device.type == 'mps':
            torch.mps.synchronize()
        del packed, weight, bias, raw
    return output


def bound_gguf_layers(model, device, checkpoint=None):
    """Keep PEFT wrappers intact; change only request-owned GGUF base forwards.

    CUDA's native path remains available on roomy devices. On constrained
    devices exact-name disk tensors are used only after full byte equality;
    renamed/repacked tensors retain their CPU packed weights as a safe fallback.
    """
    if not constrained(device):
        return 0
    from diffusers.quantizers.gguf.utils import GGUFLinear, GGUFParameter
    reader = None
    tensors = {}
    file = None
    if checkpoint is not None:
        from gguf import GGUFReader
        from h3_weight_stream import WeightFile
        reader = GGUFReader(str(checkpoint))
        tensors = {tensor.name: tensor for tensor in reader.tensors}
        file = WeightFile(checkpoint)
    count = 0
    for name, module in model.named_modules():
        if not isinstance(module, GGUFLinear) or hasattr(module, '_bonzai_rows'):
            continue
        if module.weight.device.type != 'cpu':
            raise ValueError('Install bounded GGUF before accelerator placement')
        # Leaf offload would otherwise move the entire packed projection.
        registry = getattr(module, '_diffusers_hook', None)
        if registry is not None:
            registry.remove_hook('group_offloading', recurse=False)
        module._bonzai_rows = 256
        module._bonzai_disk_rows = None
        module._bonzai_quant_type = module.weight.quant_type
        key = name.replace('.base_layer', '') + '.weight'
        tensor = tensors.get(key)
        if tensor is not None and tensor.tensor_type == module.weight.quant_type:
            raw = module.weight.as_tensor()
            if tuple(tensor.data.shape) == tuple(raw.shape):
                from h3_weight_stream import WeightRows
                rows = WeightRows(file, int(tensor.data_offset), raw.shape, raw.dtype)
                # Verify conversion did not reorder/alter this projection. Compare
                # bounded chunks, without copying/dequantizing the whole matrix.
                exact = all(torch.equal(raw[start:start+256], rows.read(range(start, min(start+256, raw.shape[0]))))
                            for start in range(0, raw.shape[0], 256))
                if exact:
                    module._bonzai_disk_rows = rows
                    # A zero-stride CPU placeholder retains PEFT shape/device metadata
                    # without retaining a full packed tensor in host memory.
                    module.weight = GGUFParameter(torch.zeros(1, dtype=raw.dtype).expand(raw.shape),
                                                   quant_type=module._bonzai_quant_type)
                del raw
        module.forward = types.MethodType(_bounded_gguf_forward, module)
        count += 1
    del reader, tensors
    logger.info('Bounded GGUF projections: %s', count)
    return count


def configure_pipeline(pipe, device, checkpoint=None):
    """Layer offload on constrained accelerators; resident fast path otherwise."""
    from diffusers.hooks import apply_group_offloading
    # Estimate resident weights plus working space; a large CUDA card should
    # not be treated as roomy merely because it has >12 GiB free.
    weight_bytes = sum(p.numel() * p.element_size() for c in pipe.components.values()
                       if isinstance(c, torch.nn.Module) for p in c.parameters())
    reserve = max(12, weight_bytes / GiB * 1.3 + 4)
    if not constrained(device, reserve):
        pipe.to(device)
        return
    for name, component in pipe.components.items():
        if not isinstance(component, torch.nn.Module):
            continue
        if name in ('vae', 'audio_vae', 'vocoder'):
            component.to(device)
            continue
        if torch.device(device).type != 'cpu':
            apply_group_offloading(component, onload_device=device, offload_device='cpu', offload_type='leaf_level')
        bound_gguf_layers(component, device, checkpoint if name == 'transformer' else None)


def release_on_first_forward(pipe, names, device):
    """Wait until all prompt/image encoding is finished, including CFG passes."""
    import weakref
    owner = weakref.ref(pipe)
    handle = None
    def before(_module, _args):
        handle.remove()
        pipeline = owner()
        if pipeline is not None:
            release_components(pipeline, names, device)
    handle = pipe.transformer.register_forward_pre_hook(before)


def video_to_uint8(video):
    """One output allocation; frame-sized conversion scratch, not float copies."""
    import numpy as np
    source = np.asarray(video)
    if source.dtype == np.uint8:
        return source
    result = np.empty(source.shape, dtype=np.uint8)
    # Support both FHWC and BFHWC layouts without making a contiguous input copy.
    for index in np.ndindex(source.shape[:-3]):
        frame = np.array(source[index], dtype=np.float32, copy=True)
        np.nan_to_num(frame, copy=False, nan=0.0, posinf=1.0, neginf=0.0)
        np.clip(frame, 0, 1, out=frame)
        frame *= 255
        np.rint(frame, out=frame)
        result[index] = frame
    return result


def release_idle_caches(namespace, path):
    """Called only after Flask's device lock is held; never evict active work.

    Keep the requested family's cache warm and preserve small voice references.
    Forecasting is serialized alongside inference so its cache is safe to evict.
    """
    keep = ('music' if path == '/audio/music' else
            'kokoro' if path == '/audio/turbo' else
            'chatterbox' if path.startswith('/audio/quality/') else
            'forecast' if path == '/forecast' else None)
    changed = False
    for family, key in (('music', '_ace_step_pipeline'), ('kokoro', '_kokoro_pipeline'),
                        ('chatterbox', '_chatterbox_tts')):
        if family != keep and namespace.get(key) is not None:
            namespace[key] = None
            changed = True
            if family == 'music':
                namespace['_ace_step_offload'] = None
    for family, key in (('forecast', '_TIMESFM_CACHE'), ('enhance', '_ESRGAN_CACHE')):
        cache = namespace.get(key)
        if family != keep and cache and cache.get('model') is not None:
            cache['model'] = None
            changed = True
    if changed:
        reclaim(namespace['DeviceManager'].get_device())
        logger.info('Released idle model caches before %s', path)


def release_video_decoder_before_audio(pipe, device):
    import weakref
    owner = weakref.ref(pipe)
    original = type(pipe.audio_vae).decode
    released = False
    def decode(self, *args, **kwargs):
        nonlocal released
        pipeline = owner()
        if not released and pipeline is not None:
            released = True
            release_components(pipeline, ('vae',), device)
        return original(self, *args, **kwargs)
    pipe.audio_vae.decode = types.MethodType(decode, pipe.audio_vae)
