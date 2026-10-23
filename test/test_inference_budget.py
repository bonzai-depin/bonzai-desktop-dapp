import sys
import unittest
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src/server'))
from inference_budget import check_music_budget, check_memory_pressure, watch_pipeline_memory, configure_music_device_budget, GIB

class MusicBudgetTests(unittest.TestCase):
    def memory(self, available):
        return patch('inference_budget.psutil.virtual_memory', return_value=SimpleNamespace(total=32*GIB, available=available*GIB))

    def test_long_song_rejected_before_model_load_without_shortening_request(self):
        with tempfile.TemporaryDirectory() as directory, self.memory(10):
            check_music_budget(directory, 60)
            with self.assertRaises(MemoryError):
                check_music_budget(directory, 600)

    def test_leaves_system_reserve_and_recovers_when_memory_available(self):
        with self.memory(2), self.assertRaises(MemoryError):
            check_memory_pressure()
        with self.memory(12):
            check_memory_pressure()

    def test_hooks_detect_pressure_and_are_removable(self):
        removed=[]
        class Component:
            def register_forward_pre_hook(self, callback):
                self.callback=callback
                return SimpleNamespace(remove=lambda: removed.append(True))
        component=Component()
        with self.memory(12):
            hooks=watch_pipeline_memory(SimpleNamespace(components={'transformer':component, 'tokenizer':object()}))
        with self.memory(1), self.assertRaises(MemoryError):
            component.callback(component, ())
        for hook in hooks: hook.remove()
        self.assertEqual(removed,[True])

    def test_metal_budget_reserves_host_headroom_before_weights_are_mapped(self):
        fractions=[]
        torch=SimpleNamespace(mps=SimpleNamespace(recommended_max_memory=lambda:24*GIB,
            driver_allocated_memory=lambda:2*GIB, set_per_process_memory_fraction=fractions.append))
        with self.memory(8):
            configure_music_device_budget(torch, SimpleNamespace(type='mps'))
        self.assertAlmostEqual(fractions[0], (8 - 32*.12 + 2)/24)
        configure_music_device_budget(None, SimpleNamespace(type='cuda'))

    def test_32gb_mac_streams_the_same_xl_weights_instead_of_rejecting_a_song(self):
        checkpoint = SimpleNamespace(name='weights.safetensors', stat=lambda: SimpleNamespace(st_size=10.324*GIB))
        with patch('inference_budget.Path.rglob', return_value=[checkpoint]), self.memory(12), \
                patch('inference_budget.macos_memory_pressure', return_value=1):
            device = SimpleNamespace(type='mps')
            check_music_budget('music', 60, stream_weights=True, device=device)
            check_music_budget('music', 180, stream_weights=True, device=device)
            # The resident policy still needs room for the whole checkpoint.
            with self.assertRaises(MemoryError):
                check_music_budget('music', 60, device=device)
            # Streaming does not remove the activation/duration budget.
            with self.assertRaises(MemoryError):
                check_music_budget('music', 600, stream_weights=True, device=device)

    def test_five_minute_streamed_song_fits_without_relaxing_pressure_guard(self):
        checkpoint = SimpleNamespace(name='weights.safetensors', stat=lambda: SimpleNamespace(st_size=10.324*GIB))
        device = SimpleNamespace(type='mps')
        with patch('inference_budget.Path.rglob', return_value=[checkpoint]), self.memory(10.77), patch('inference_budget.macos_memory_pressure', return_value=1):
            check_music_budget('music', 290, stream_weights=True, device=device)
            with self.assertRaises(MemoryError):
                check_music_budget('music', 290, device=device)
        with tempfile.TemporaryDirectory() as directory, self.memory(10.77), patch('inference_budget.macos_memory_pressure', return_value=4), self.assertRaises(MemoryError):
            check_music_budget(directory, 290, stream_weights=True, device=device)

    def test_streaming_preserves_physical_capacity_and_workspace_reserve(self):
        checkpoint = SimpleNamespace(name='weights.safetensors', stat=lambda: SimpleNamespace(st_size=30*GIB))
        with patch('inference_budget.Path.rglob', return_value=[checkpoint]), self.memory(12), self.assertRaises(MemoryError):
            check_music_budget('music', 60, stream_weights=True)
        with tempfile.TemporaryDirectory() as directory, self.memory(6), self.assertRaises(MemoryError):
            check_music_budget(directory, 60, stream_weights=True)

    def test_mps_pressure_check_preserves_headroom_and_handles_transient_warnings(self):
        device = SimpleNamespace(type='mps')
        with self.memory(12), patch('inference_budget.macos_memory_pressure', return_value=2):
            check_memory_pressure(device)
        with self.memory(12), patch('inference_budget.macos_memory_pressure', return_value=4), self.assertRaises(MemoryError):
            check_memory_pressure(device)
        for pressure in (1, 2, None):
            with self.memory(2), patch('inference_budget.macos_memory_pressure', return_value=pressure), self.assertRaises(MemoryError):
                check_memory_pressure(device)
        # If the OS signal is unavailable, the conservative reserve still applies.
        with self.memory(2), patch('inference_budget.macos_memory_pressure', return_value=None), self.assertRaises(MemoryError):
            check_memory_pressure(device)
        # macOS information never loosens the CPU/CUDA path.
        with self.memory(2), patch('inference_budget.macos_memory_pressure', return_value=1), self.assertRaises(MemoryError):
            check_memory_pressure(SimpleNamespace(type='cuda'))

    def test_direct_decoder_calls_check_pressure_and_restore_method(self):
        class Decoder:
            def decode(self, value): return value
        decoder=Decoder()
        original=decoder.decode
        with self.memory(12):
            hooks=watch_pipeline_memory(SimpleNamespace(components={'vae':decoder}))
        with self.memory(1), self.assertRaises(MemoryError):
            decoder.decode('audio')
        for hook in hooks: hook.remove()
        self.assertEqual(decoder.decode,original)
