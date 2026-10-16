"""Local Wan high/low-noise adapter stack. Never fuse into GGUF weights."""

WAN_ADAPTERS = (
    ("wan-lora-high.safetensors", "general_high", False, "general", 0.25),
    ("wan-lora-low.safetensors", "general_low", True, "general", 0.25),
    ("wan-lora-animation-high-safetensors", "animation_high", False, "animation", 0.75),
    ("wan-lora-animation-low.safetensors", "animation_low", True, "animation", 0.75),
    ("wan-lora-extra-high.safetensors", "extra_high", False, "extra", 0.9),
    ("wan-lora-extra-low.safetensors", "extra_low", True, "extra", 0.9),
)

def load_wan_adapters(pipe, model_dir, options, logger, *, only_low_noise=None):
    from safetensors.torch import load_file
    applied = []
    for filename, name, low_noise, group, strength in WAN_ADAPTERS:
        if only_low_noise is not None and low_noise != only_low_noise:
            continue
        if options.get(f"use_{group}", True) is False:
            continue
        path = model_dir / filename
        if not path.is_file():
            logger.warning("[Wan2.2] Optional adapter missing: %s", filename)
            continue
        # Read safetensors explicitly: animation-high intentionally has no
        # .safetensors extension. Do not let a suffix select a pickle loader.
        try:
            state = load_file(str(path), device="cpu")
            pipe.load_lora_weights(state, adapter_name=name,
                                   load_into_transformer_2=low_noise,
                                   low_cpu_mem_usage=False)
        except Exception as error:
            raise ValueError(f"Could not load Wan adapter {filename}: {error}") from error
        applied.append({"filename": filename, "adapter": name,
                        "strength": strength,
                        "transformer": "transformer_2" if low_noise else "transformer"})
    if applied:
        pipe.set_adapters([item["adapter"] for item in applied],
                          adapter_weights=[item["strength"] for item in applied])
    return applied
