import sys
import unittest
from pathlib import Path
import torch
import gguf
from diffusers.quantizers.gguf.utils import GGUFParameter

sys.path.insert(0, str(Path(__file__).parents[1] / 'src/server'))
from qwen_image_gguf import prepare_qwen_gguf


class QwenGGUFTests(unittest.TestCase):
    def test_direct_norm_weights_are_decoded_not_treated_as_bytes(self):
        values = torch.tensor([0.25, -0.5, 1.0, 2.0], dtype=torch.bfloat16)
        norm = torch.nn.Module()
        norm.weight = GGUFParameter(values.view(torch.uint8), quant_type=gguf.GGMLQuantizationType.BF16)
        prepare_qwen_gguf(norm, torch.bfloat16)
        self.assertNotIsInstance(norm.weight, GGUFParameter)
        torch.testing.assert_close(norm.weight, values)
