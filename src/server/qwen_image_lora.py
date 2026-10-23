"""Convert Qwen Image 2.1 fused gate/up adapters to Diffusers modules."""


def convert_qwen_image_lora(weights):
    converted = {}
    for key, value in weights.items():
        key = key.removeprefix('diffusion_model.').removeprefix('transformer.')
        if '.img_mlp.gate_up.lora_' in key:
            if '.lora_A.' in key:
                gate, up = value, value
            elif '.lora_B.' in key:
                if value.shape[0] % 2:
                    raise ValueError('The Qwen Image adapter has incompatible gate/up weights.')
                gate, up = value.chunk(2, dim=0)
            else:
                raise ValueError('The Qwen Image adapter format is unsupported.')
            converted['transformer.' + key.replace('.gate_up.', '.gate_layer.')] = gate
            converted['transformer.' + key.replace('.gate_up.', '.proj.')] = up
        else:
            converted['transformer.' + key] = value
    return converted
