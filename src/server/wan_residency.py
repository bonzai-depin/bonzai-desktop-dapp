"""Load one Wan noise expert at a time, keeping the stock denoising loop."""
from contextlib import contextmanager
import weakref

import torch
from diffusers import ModelMixin
from diffusers.configuration_utils import ConfigMixin
from inference_memory import bound_gguf_layers, detach_hooks, reclaim, release_components


class WanExpert(ModelMixin, ConfigMixin):
    def __init__(self, config, dtype):
        super().__init__()
        # Checkpoint configs may omit constructor defaults such as image_dim.
        import inspect
        from diffusers import WanTransformer3DModel
        defaults = {name: parameter.default for name, parameter in
                    inspect.signature(WanTransformer3DModel.__init__).parameters.items()
                    if name != 'self' and parameter.default is not inspect.Parameter.empty}
        self.register_to_config(**(defaults | dict(config)))
        self._dtype = dtype
        self.manager = None
        self.low = False

    @property
    def dtype(self):
        return self._dtype

    @property
    def device(self):
        return torch.device('cpu')

    @contextmanager
    def cache_context(self, name):
        model = self.manager().activate(self.low)
        with model.cache_context(name):
            yield

    def forward(self, *args, **kwargs):
        return self.manager().activate(self.low)(*args, **kwargs)


class WanResidency:
    def __init__(self, pipe, high, low, paths, model_dir, options, device, dtype, logger, repo):
        self.pipe = weakref.ref(pipe)
        self.experts = (high, low)
        self.paths, self.model_dir, self.options = paths, model_dir, options
        self.device, self.dtype, self.logger, self.repo = device, dtype, logger, repo
        self.current = None
        self.current_low = None
        self.applied = []
        for index, expert in enumerate(self.experts):
            expert.manager = weakref.ref(self)
            expert.low = bool(index)

    def activate(self, low):
        if self.current is not None and self.current_low == low:
            return self.current
        self.release()
        pipe = self.pipe()
        # The standard Wan pipeline has finished prompt/image encoding before
        # it enters an expert's cache context. Preserve embeddings, drop models.
        release_components(pipe, ('text_encoder', 'image_encoder'), self.device)
        from diffusers import WanTransformer3DModel, GGUFQuantizationConfig
        from diffusers.hooks import apply_group_offloading
        from wan_adapters import load_wan_adapters
        model = WanTransformer3DModel.from_single_file(
            str(self.paths[int(low)]), quantization_config=GGUFQuantizationConfig(compute_dtype=self.dtype),
            config=self.repo, subfolder='transformer_2' if low else 'transformer', torch_dtype=self.dtype)
        self.current, self.current_low = model, low
        # LoRA loader works against the real expert. The absent expert is None,
        # so PEFT never tries to attach adapters to the lightweight proxy.
        pipe.register_modules(transformer=None if low else model, transformer_2=model if low else None)
        try:
            self.applied.extend(load_wan_adapters(pipe, self.model_dir, self.options, self.logger, only_low_noise=low))
            # Never replace a requested adapter with zeros: that would silently
            # change the output while claiming the adapter had been applied.
            for name, parameter in model.named_parameters():
                if parameter.is_meta:
                    raise RuntimeError(f'Wan checkpoint or adapter left an unloaded parameter: {name}')
            if self.device.type != 'cpu':
                apply_group_offloading(model, onload_device=self.device, offload_device='cpu', offload_type='leaf_level')
            bound_gguf_layers(model, self.device, self.paths[int(low)])
        finally:
            pipe.register_modules(transformer=self.experts[0], transformer_2=self.experts[1])
        return model

    def release(self):
        if self.current is not None:
            detach_hooks(self.current)
            self.current = None
            self.current_low = None
            reclaim(self.device)
