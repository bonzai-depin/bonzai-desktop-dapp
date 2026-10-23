"""CPU regression cases; intentionally not executed during active generation."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from dataclasses import dataclass

import torch
from torch import nn

sys.path.insert(0, str(Path(__file__).parents[1] / "src/server"))
from h3_numerics import check_conditioning, require_finite, stabilize_norms, watch_scheduler, watch_transformer


class H3NumericsTests(unittest.TestCase):
    def test_structured_prediction_checks_audio_as_well_as_video(self):
        @dataclass
        class Prediction:
            sample: torch.Tensor
            audio_sample: torch.Tensor
        prediction = Prediction(torch.ones(2), torch.tensor([float('nan')]))
        with self.assertRaisesRegex(RuntimeError, 'prediction.audio_sample'):
            require_finite(prediction, 'prediction')
        with self.assertRaisesRegex(RuntimeError, 'prediction.audio_sample'):
            require_finite(vars(prediction), 'prediction')

    def test_detailed_trace_catches_invalid_input_before_quantization_can_hide_it(self):
        class Block(nn.Module):
            def __init__(self):
                super().__init__()
                self.ff = nn.Identity()

            def forward(self, x):
                return self.ff(x * float('inf')).to(torch.int8).float()

        model = nn.Module()
        model.transformer_blocks = nn.ModuleList([Block()])
        model.forward = lambda x: model.transformer_blocks[0](x)
        watch_transformer(model, detailed=True)
        with self.assertRaisesRegex(RuntimeError, r'transformer_blocks\.0.ff inputs'):
            model(torch.ones(2))

    def test_normalization_preserves_finite_extreme_inputs_and_ordinary_values(self):
        norm = nn.RMSNorm(4, eps=1e-5)
        ordinary = torch.tensor([[1., -2., 3., 0.], [0., 0., 0., 0.]])
        expected = norm(ordinary)
        stabilize_norms(norm)
        torch.testing.assert_close(norm(ordinary), expected)
        extreme = torch.full((1, 4), 1e30)
        torch.testing.assert_close(norm(extreme), torch.ones_like(extreme))

    def test_invalid_conditioning_is_rejected_before_denoising(self):
        with self.assertRaisesRegex(RuntimeError, "condition_latents"):
            check_conditioning({"condition_latents": [torch.tensor([float('inf')])]}, "condition_latents")
        with self.assertRaisesRegex(RuntimeError, "missing prompt_embeds"):
            check_conditioning({}, "prompt_embeds")

    def test_first_bad_transformer_block_is_identified(self):
        class Broken(nn.Module):
            def forward(self, x):
                return x * float('nan')

        class Model(nn.Module):
            def __init__(self):
                super().__init__()
                self.transformer_blocks = nn.ModuleList([nn.Identity(), Broken()])

            def forward(self, x):
                for block in self.transformer_blocks:
                    x = block(x)
                return (x, x)

        model = Model()
        watch_transformer(model)
        with self.assertRaisesRegex(RuntimeError, r"step 1, transformer_blocks\.1"):
            model(torch.ones(2))

    def test_scheduler_preserves_success_and_reports_invalid_update(self):
        scheduler = SimpleNamespace(step=lambda sample: (sample,))
        watch_scheduler(scheduler, "video")
        sample = torch.ones(3)
        self.assertIs(scheduler.step(sample)[0], sample)
        with self.assertRaisesRegex(RuntimeError, "video scheduler step 2"):
            scheduler.step(torch.tensor([float('nan')]))
