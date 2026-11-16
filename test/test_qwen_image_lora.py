import sys
import unittest
from pathlib import Path
import torch

sys.path.insert(0, str(Path(__file__).parents[1] / 'src/server'))
from qwen_image_lora import convert_qwen_image_lora


class QwenAdapterTests(unittest.TestCase):
    def test_split_adapter_preserves_fused_gate_and_up_updates(self):
        a = torch.arange(6.).reshape(2, 3)
        b = torch.arange(16.).reshape(8, 2)
        prefix = 'diffusion_model.transformer_blocks.0.img_mlp.gate_up.'
        converted = convert_qwen_image_lora({prefix + 'lora_A.weight': a, prefix + 'lora_B.weight': b})
        outputs = []
        for layer in ('gate_layer', 'proj'):
            target = 'transformer.transformer_blocks.0.img_mlp.' + layer + '.'
            outputs.append(converted[target + 'lora_B.weight'] @ converted[target + 'lora_A.weight'])
        torch.testing.assert_close(torch.cat(outputs), b @ a)
