"""Exercise ACE-Step placement with real torch/accelerate and tiny CPU weights."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src/server'))
import torch
from diffusers.utils.accelerate_utils import apply_forward_hook
from music_memory import configure_music_decode, configure_streamed_music
from inference_budget import watch_pipeline_memory


class Component(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = torch.nn.Linear(2, 2)
        self.register_buffer('silence_latent', torch.ones(1, 2))

    def forward(self, value):
        return self.linear(value)


class Denoiser(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.layers = torch.nn.ModuleList([Component(), Component()])

    def forward(self, value):
        for layer in self.layers:
            value = layer(value)
        return value


class Decoder(Component):
    def __init__(self):
        super().__init__()
        self.decoder = Component()

    @apply_forward_hook
    def decode(self, value):
        return self.decoder(value)


class Pipeline:
    def __init__(self):
        self.text_encoder = Component()
        self.condition_encoder = Component()
        self.transformer = Denoiser()
        self.vae = Decoder()

    @property
    def components(self):
        return {name: getattr(self, name) for name in ('text_encoder', 'condition_encoder', 'transformer', 'vae')}

    def register_modules(self, **values):
        for key, value in values.items():
            setattr(self, key, value)


class StreamedMusicTests(unittest.TestCase):
    def test_same_weights_and_output_with_components_released_before_decode(self):
        pipe = Pipeline()
        value = torch.ones(1, 2)
        with torch.inference_mode():
            expected_latent = pipe.transformer(pipe.condition_encoder(pipe.text_encoder(value)))
            expected = pipe.vae.decode(pipe.transformer(expected_latent))
            configure_streamed_music(pipe, torch.device('cpu'))
            self.assertEqual(next(pipe.transformer.parameters()).device.type, 'meta')
            # ACE-Step reads this before condition_encoder.forward.
            self.assertEqual(pipe.condition_encoder.silence_latent.device.type, 'cpu')
            embeddings = pipe.condition_encoder(pipe.text_encoder(value))
            latent = pipe.transformer(embeddings)
            self.assertIsNone(pipe.text_encoder)
            self.assertIsNone(pipe.condition_encoder)
            # Repeated denoising steps must keep reusing the original weights.
            result = pipe.vae.decode(pipe.transformer(latent))
            self.assertIsNone(pipe.transformer)
            torch.testing.assert_close(result, expected)

    def test_pressure_is_checked_inside_steps_and_tiles_and_hooks_are_removed(self):
        pipe = Pipeline()
        device = torch.device('cpu')
        with patch('inference_budget.check_memory_pressure') as pressure:
            handles = watch_pipeline_memory(pipe, device)
            pressure.reset_mock()
            pipe.transformer(torch.ones(1, 2))
            self.assertEqual(pressure.call_count, 3)  # transformer + two blocks
            pressure.reset_mock()
            pipe.vae.decode(torch.ones(1, 2))
            self.assertEqual(pressure.call_count, 2)  # decode + one tile
            for handle in handles:
                handle.remove()
            pressure.reset_mock()
            pipe.transformer(torch.ones(1, 2))
            pipe.vae.decode(torch.ones(1, 2))
            pressure.assert_not_called()

    def test_decode_enables_overlapping_tiles_without_changing_sample_rate(self):
        pipe = Pipeline()
        pipe.sample_rate = 48000
        configure_music_decode(pipe)
        self.assertTrue(pipe.vae.use_tiling)
        self.assertGreater(pipe.vae.tile_latent_min_length, 2 * pipe.vae.tile_latent_overlap)
        self.assertEqual(pipe.sample_rate, 48000)

    def test_metal_finishes_and_releases_transfers_before_the_next_block(self):
        pipe = Pipeline()
        events = []
        for layer in pipe.transformer.layers:
            layer.register_forward_pre_hook(lambda *_: events.append('compute'))
        # Keep tiny weights on CPU while testing the Metal scheduling boundary.
        with patch('accelerate.cpu_offload'), patch('accelerate.cpu_offload_with_hook'), \
                patch('inference_memory.reclaim'), \
                patch('torch.mps.synchronize', side_effect=lambda: events.append('finish')), \
                patch('torch.mps.empty_cache', side_effect=lambda: events.append('release')):
            configure_streamed_music(pipe, torch.device('mps'))
            pipe.transformer(torch.ones(1, 2))
        self.assertEqual(events, ['compute', 'finish', 'release'] * 2)


class MusicAttentionTests(unittest.TestCase):
    def test_tiles_preserve_grouped_attention_and_sliding_mask(self):
        from music_memory import BoundedMusicAttention
        from diffusers.models.transformers.ace_step_transformer import AceStepAttention
        torch.manual_seed(1)
        attention = AceStepAttention(16, 4, 2, 4).eval()
        x = torch.randn(1, 19, 16)
        indices = torch.arange(19)
        mask = (indices[:, None] - indices[None, :]).abs() <= 3
        with torch.inference_mode():
            expected = attention(x, attention_mask=mask[None, None])
            attention.set_processor(BoundedMusicAttention(5))
            actual = attention(x, attention_mask=mask[None, None])
        torch.testing.assert_close(actual, expected, atol=1e-6, rtol=1e-5)


if __name__ == '__main__':
    unittest.main()
