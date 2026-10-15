import sys
import tempfile
import unittest
from unittest.mock import Mock
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parents[1] / 'src/server'))
from h3_weight_stream import WeightFile, WeightRows


class H3WeightStreamTests(unittest.TestCase):
    @unittest.skipUnless(torch.backends.mps.is_available(), 'MPS unavailable')
    def test_mps_streamed_quantized_weights_match_resident_without_repeated_reads(self):
        from h3_quantized import H3QuantizedLinear
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.bin'
            source = torch.nn.Linear(256, 64, bias=False)
            packed = torch.randint(-127, 127, (64, 256), dtype=torch.int8)
            path.write_bytes(packed.numpy().tobytes())
            layer = H3QuantizedLinear(source, packed, torch.ones(64) * .001,
                {'format': 'int8_tensorwise', 'convrot': True, 'convrot_groupsize': 256},
                chunk_rows=32, chunk_tokens=2)
            x = torch.randn(3, 5, 256, device='mps')
            with torch.inference_mode():
                expected = layer(x).cpu()
                layer.disk_rows = WeightRows(WeightFile(path), 0, packed.shape, packed.dtype)
                layer.disk_rows.read = Mock(wraps=layer.disk_rows.read)
                actual = layer(x).cpu()
            torch.testing.assert_close(actual, expected)
            self.assertEqual(layer.disk_rows.read.call_count, 2)
            torch.mps.empty_cache()

    @unittest.skipUnless(torch.backends.mps.is_available(), 'MPS unavailable')
    def test_mps_streamed_gguf_projection_and_embedding_match_resident(self):
        from minimax_h3_gguf import GGUFWeight, GGUFLinear, GGUFEmbedding
        from gguf import GGMLQuantizationType
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.bin'
            source = torch.randn(20, 32)
            path.write_bytes(source.numpy().tobytes())
            weight = GGUFWeight(source, GGMLQuantizationType.F32, source.shape,
                disk_rows=WeightRows(WeightFile(path), 0, source.shape, source.dtype))
            layer = GGUFLinear(torch.nn.Linear(32,20,bias=False), weight, torch.float32)
            embedding = GGUFEmbedding(torch.nn.Embedding(20,32), weight, torch.float32)
            with torch.inference_mode():
                x = torch.randn(2,32,device='mps')
                torch.testing.assert_close(layer(x).cpu(), x.cpu() @ source.T)
                indices = torch.tensor([[7,2,7,0]],device='mps')
                torch.testing.assert_close(embedding(indices).cpu(), source[indices.cpu()])
            torch.mps.empty_cache()

    def test_offset_partition_and_reordered_rows_match_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.bin'
            source = torch.arange(96, dtype=torch.int8).reshape(12, 8)
            path.write_bytes(b'header!' + source.numpy().tobytes())
            file = WeightFile(path)
            rows = WeightRows(file, 7, source.shape, source.dtype, row_offset=4)
            torch.testing.assert_close(rows.read([2, 0, 1, 2]), source[[6, 4, 5, 6]])
            pointer = rows.read(range(4)).data_ptr()
            for _ in range(10):
                actual = rows.read(range(2))
                self.assertEqual(actual.data_ptr(), pointer)
                torch.testing.assert_close(actual, source[4:6])

    def test_bfloat16_bytes_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.bin'
            source = torch.randn(4, 32).bfloat16()
            path.write_bytes(source.view(torch.uint8).numpy().tobytes())
            actual = WeightRows(WeightFile(path), 0, source.shape, source.dtype).read([1, 3])
            torch.testing.assert_close(actual, source[[1, 3]], rtol=0, atol=0)

    def test_truncated_checkpoint_and_invalid_rows_fail_explicitly(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.bin'
            path.write_bytes(bytes(8))
            rows = WeightRows(WeightFile(path), 0, (2, 8), torch.int8)
            with self.assertRaises(EOFError):
                rows.read([1])
            with self.assertRaises(IndexError):
                rows.read([-1])
            with self.assertRaises(IndexError):
                rows.read([2])

if __name__ == '__main__':
    unittest.main()
