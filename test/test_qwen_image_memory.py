import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import torch

sys.path.insert(0, str(Path(__file__).parents[1] / 'src/server'))
from inference_memory import configure_pipeline


class QwenMemoryTests(unittest.TestCase):
    def test_large_encoder_keeps_original_cpu_weights_while_denoiser_stays_bounded(self):
        encoder, denoiser = torch.nn.Linear(2, 2), torch.nn.Linear(2, 2)
        pipe = SimpleNamespace(components={'text_encoder': encoder, 'transformer': denoiser})
        with patch('inference_memory.constrained', return_value=True), \
             patch('accelerate.cpu_offload') as sequential, \
             patch('diffusers.hooks.apply_group_offloading') as group, \
             patch('inference_memory.bound_gguf_layers') as bounded:
            configure_pipeline(pipe, torch.device('mps'), sequential_components=('text_encoder',))
        sequential.assert_called_once_with(encoder, execution_device=torch.device('mps'))
        self.assertIs(group.call_args.args[0], denoiser)
        self.assertIs(bounded.call_args.args[0], denoiser)
