import sys
import tempfile
import unittest
import importlib.util
from pathlib import Path

import torch
from gguf import GGMLQuantizationType


sys.path.insert(0, str(Path(__file__).parents[1] / "src" / "server"))

from minimax_h3_gguf import (
    GGUFEmbedding,
    GGUFLinear,
    GGUFWeight,
    H3AdaLNCurveTable,
    H3LoRALinear,
    H3PrunedAdaLNModulation,
    _convert_audio_vae_tensor,
    _convert_video_vae_tensor,
    _install_weights,
    _load_safetensors_component,
    _map_h3_weights,
    _normalize_h3_lora_target,
    _patch_video_vae_tile_dtype,
    _reshape_for_h3_target,
    load_h3_lora,
)


HAS_DIFFUSERS = importlib.util.find_spec("diffusers") is not None
HAS_ACCELERATE = importlib.util.find_spec("accelerate") is not None


class MiniMaxH3GGUFTest(unittest.TestCase):
    def test_streaming_decode_matches_fp32_without_promoting_storage(self):
        from minimax_h3_gguf import stream_h3_cpu_decode
        import copy
        model = torch.nn.Sequential(torch.nn.Conv3d(2,4,1), torch.nn.SiLU()).half()
        expected = copy.deepcopy(model).float()
        original = model[0].weight.data_ptr()
        stream_h3_cpu_decode(model)
        x = torch.randn(1,2,3,4,4)
        with torch.inference_mode():
            torch.testing.assert_close(model(x), expected(x))
        self.assertEqual(model[0].weight.dtype, torch.float16)
        self.assertEqual(model[0].weight.data_ptr(), original)
        linear = torch.nn.Sequential(torch.nn.Linear(7,1027), torch.nn.LayerNorm(1027)).half()
        expected = copy.deepcopy(linear).float()
        stream_h3_cpu_decode(linear)
        x = torch.randn(2,7)
        torch.testing.assert_close(linear(x), expected(x))

    def test_gguf_chunked_projection_matches_dense_with_qkv_rows_and_swap(self):
        source = torch.nn.Linear(8,514)
        weight = torch.randn(1028,8)
        rows = torch.arange(200,714)
        packed = GGUFWeight(weight, GGMLQuantizationType.F32, (514,8), row_indices=rows, swap_output_halves=True)
        layer = GGUFLinear(source, packed, torch.float32)
        x = torch.randn(2,3,8)
        expected = torch.nn.functional.linear(x, weight[200:714], source.bias)
        expected = torch.cat((expected[...,257:],expected[...,:257]),-1)
        torch.testing.assert_close(layer(x), expected)

    def test_gguf_storage_survives_offload_registration(self):
        from diffusers.hooks import apply_group_offloading
        from minimax_h3_gguf import preserve_h3_gguf_storage
        layer = GGUFLinear(torch.nn.Linear(8,4), GGUFWeight(torch.ones(4,8),GGMLQuantizationType.F32,(4,8)),torch.float32)
        model = torch.nn.Sequential(layer,torch.nn.Linear(4,2))
        ptr = layer.weight.data_ptr()
        apply_group_offloading(model,onload_device='cpu',offload_device='cpu',offload_type='leaf_level')
        preserve_h3_gguf_storage(model)
        self.assertIsNone(layer._diffusers_hook.get_hook('group_offloading'))
        self.assertIsNotNone(model[1]._diffusers_hook.get_hook('group_offloading'))
        self.assertEqual(ptr,layer.weight.data_ptr())

    def test_bf16_gguf_reuses_storage_without_fp32_expansion(self):
        from minimax_h3_gguf import _dequantize
        original = torch.tensor([[1.0,-2.5,0.0,100.0]],dtype=torch.bfloat16)
        packed = original.view(torch.uint8)
        actual = _dequantize(GGUFWeight(packed,GGMLQuantizationType.BF16,(1,4)),torch.device('cpu'),torch.bfloat16)
        torch.testing.assert_close(actual,original)
        self.assertEqual(actual.data_ptr(),packed.data_ptr())

    @staticmethod
    def _tiny_h3_model():
        class Attention(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.to_q = torch.nn.Linear(3, 2, bias=False)
                self.to_k = torch.nn.Linear(3, 2, bias=False)
                self.to_v = torch.nn.Linear(3, 2, bias=False)

        class Block(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.attn = Attention()
                self.ff = torch.nn.Module()
                gated = torch.nn.Module()
                gated.proj = torch.nn.Linear(3, 4, bias=False)
                self.ff.net = torch.nn.ModuleList(
                    [gated, torch.nn.Identity(), torch.nn.Linear(2, 3, bias=False)]
                )

        class Model(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.transformer_blocks = torch.nn.ModuleList([Block()])

        model = Model()
        for parameter in model.parameters():
            parameter.data.zero_()
        return model

    @unittest.skipUnless(HAS_DIFFUSERS, "diffusers is not installed in this test interpreter")
    def test_linear_dequantizes_packed_rows_at_forward_time(self):
        source = torch.nn.Linear(256, 2, bias=False)
        packed = torch.zeros((2, 110), dtype=torch.uint8)
        weight = GGUFWeight(packed, GGMLQuantizationType.Q3_K, (2, 256))
        layer = GGUFLinear(source, weight, torch.float32)

        output = layer(torch.ones((1, 256)))

        self.assertEqual(tuple(output.shape), (1, 2))
        self.assertTrue(torch.isfinite(output).all())

    def test_qwen_vision_patch_embed_restores_flattened_gguf_shape(self):
        module = torch.nn.Conv3d(3, 4, kernel_size=(2, 2, 2), device="meta")
        flattened = torch.arange(4 * 3 * 2 * 2 * 2).reshape(12, 2, 2, 2)

        restored = _reshape_for_h3_target(module, "weight", flattened, "patch_embed.proj.weight")

        self.assertEqual(tuple(restored.shape), (4, 3, 2, 2, 2))
        self.assertTrue(torch.equal(restored.reshape(-1), flattened.reshape(-1)))

    def test_pruned_adaln_curve_interpolates_and_skips_second_silu(self):
        table = H3AdaLNCurveTable(torch.tensor([[0.0, 2.0], [2.0, 4.0], [4.0, 6.0]]))
        self.assertIs(table.linear_1.weight, table.table)
        coordinates = table(torch.tensor([0.25]))
        self.assertTrue(torch.equal(coordinates, torch.tensor([[1.0, 3.0]])))

        source = torch.nn.Module()
        source.hidden_size = 1
        source.linear = torch.nn.Linear(2, 18, bias=False)
        source.linear.weight.data.fill_(1.0)
        modulation = H3PrunedAdaLNModulation(source)
        chunks = modulation(coordinates)

        self.assertEqual(len(chunks), 6)
        self.assertTrue(all(torch.equal(chunk, torch.tensor([[4.0], [4.0], [4.0]])) for chunk in chunks))

    def test_video_vae_tile_dtype_patch_does_not_capture_model_instance(self):
        class TinyVae(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.encoder = torch.nn.Linear(1, 1, bias=False, dtype=torch.float16)
                self.post_quant_conv = torch.nn.Linear(1, 1, bias=False, dtype=torch.float32)

            def _encode_clip(self, value):
                return value.dtype

            def _decode_clip(self, value):
                return value.dtype

        model = TinyVae()
        _patch_video_vae_tile_dtype(model)

        self.assertNotIn("_encode_clip", model.__dict__)
        self.assertNotIn("_decode_clip", model.__dict__)
        self.assertEqual(model._encode_clip(torch.ones((), dtype=torch.float32)), torch.float16)
        self.assertEqual(model._decode_clip(torch.ones((), dtype=torch.float16)), torch.float32)

    @unittest.skipUnless(HAS_DIFFUSERS, "diffusers is not installed in this test interpreter")
    def test_embedding_only_dequantizes_referenced_rows(self):
        source = torch.nn.Embedding(3, 256)
        packed = torch.zeros((3, 84), dtype=torch.uint8)
        weight = GGUFWeight(packed, GGMLQuantizationType.Q2_K, (3, 256))
        layer = GGUFEmbedding(source, weight, torch.float32)

        output = layer(torch.tensor([[2, 0, 2]]))

        self.assertEqual(tuple(output.shape), (1, 3, 256))
        self.assertTrue(torch.equal(output[:, 0], output[:, 2]))

    def test_linear_applies_row_selection_to_plain_fused_weights(self):
        source = torch.nn.Linear(3, 2, bias=False)
        fused = torch.arange(18, dtype=torch.float16).reshape(6, 3)
        weight = GGUFWeight(
            fused,
            GGMLQuantizationType.F16,
            (2, 3),
            row_indices=torch.tensor([4, 1]),
        )
        layer = GGUFLinear(source, weight, torch.float32)

        output = layer(torch.ones((1, 3)))

        expected = torch.tensor([[39.0, 12.0]])
        self.assertTrue(torch.equal(output, expected))

    def test_linear_replacement_preserves_already_loaded_bias(self):
        source = torch.nn.Linear(3, 2, bias=True)
        source.bias.data.copy_(torch.tensor([4.0, 7.0]))
        weight = GGUFWeight(torch.ones((2, 3)), GGMLQuantizationType.F16, (2, 3))

        layer = GGUFLinear(source, weight, torch.float32)

        self.assertIs(layer.bias, source.bias)
        self.assertTrue(torch.equal(layer.bias, torch.tensor([4.0, 7.0])))

    @unittest.skipUnless(HAS_ACCELERATE, "accelerate is not installed in this test interpreter")
    def test_plain_weights_follow_compute_dtype_contract(self):
        model = torch.nn.Module()
        model.adaln = torch.nn.Linear(3, 2, bias=False)
        weights = {
            "adaln.weight": GGUFWeight(
                torch.ones((2, 3), dtype=torch.float16),
                GGMLQuantizationType.F16,
                (2, 3),
            ),
        }

        _install_weights(model, weights, torch.bfloat16)

        self.assertEqual(model.adaln.weight.dtype, torch.bfloat16)

    @unittest.skipUnless(HAS_ACCELERATE, "accelerate is not installed in this test interpreter")
    def test_h3_loader_preserves_mixed_precision_contract(self):
        model = torch.nn.Module()
        model.proj_in = torch.nn.Linear(256, 2, bias=False)
        model.block = torch.nn.Linear(256, 2, bias=False)
        weights = {
            "proj_in.weight": GGUFWeight(
                torch.zeros((2, 84), dtype=torch.uint8),
                GGMLQuantizationType.Q2_K,
                (2, 256),
            ),
            "block.weight": GGUFWeight(
                torch.zeros((2, 84), dtype=torch.uint8),
                GGMLQuantizationType.Q2_K,
                (2, 256),
            ),
        }

        _install_weights(
            model,
            weights,
            torch.bfloat16,
            keep_in_fp32_patterns=("proj_in",),
        )

        self.assertEqual(model.proj_in.compute_dtype, torch.float32)
        self.assertEqual(model.block.compute_dtype, torch.bfloat16)

    def test_h3_mapping_splits_qkv_and_swaps_swiglu_halves(self):
        fc1 = torch.arange(8 * 2, dtype=torch.uint8).reshape(8, 2)
        source = {
            "blocks.0.mlp.fc1.weight": GGUFWeight(
                fc1, GGMLQuantizationType.F16, (8, 2)
            ),
        }

        mapped = _map_h3_weights(source)
        result = mapped["transformer_blocks.0.ff.net.0.proj.weight"]

        self.assertIs(result.tensor, fc1)
        self.assertTrue(result.swap_output_halves)

    def test_h3_mapping_splits_transformer_qkv_into_contiguous_ranges(self):
        rows = 56 * 128
        fused = torch.empty((rows * 3, 2), dtype=torch.uint8)
        source = {
            "blocks.0.attn.qkv_proj.weight": GGUFWeight(
                fused, GGMLQuantizationType.Q2_K, (rows * 3, 256)
            ),
        }

        mapped = _map_h3_weights(source)

        self.assertTrue(torch.equal(mapped["transformer_blocks.0.attn.to_q.weight"].row_indices, torch.arange(rows)))
        self.assertTrue(torch.equal(mapped["transformer_blocks.0.attn.to_k.weight"].row_indices, torch.arange(rows, rows * 2)))
        self.assertTrue(torch.equal(mapped["transformer_blocks.0.attn.to_v.weight"].row_indices, torch.arange(rows * 2, rows * 3)))

    def test_h3_lora_normalizes_kohya_target_names(self):
        target = _normalize_h3_lora_target("lora_unet_blocks_7_self_attn_q")
        self.assertEqual(target, "transformer_blocks.7.attn.to_q")
        target = _normalize_h3_lora_target("lora_unet_blocks_49_mlp_fc1")
        self.assertEqual(target, "transformer_blocks.49.ff.net.0.proj")
        target = _normalize_h3_lora_target("lora_unet_blocks_24_attn_out_proj")
        self.assertEqual(target, "transformer_blocks.24.attn.to_out.0")

    def test_h3_lora_attaches_diffusers_pair_without_merging_base(self):
        from safetensors.torch import save_file

        model = self._tiny_h3_model()
        weights = {
            "diffusion_model.blocks.0.self_attn.q.lora_A.weight": torch.tensor(
                [[1.0, 0.0, 0.0]]
            ),
            "diffusion_model.blocks.0.self_attn.q.lora_B.weight": torch.tensor(
                [[2.0], [3.0]]
            ),
            "diffusion_model.blocks.0.self_attn.q.alpha": torch.tensor(1.0),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            checkpoint = Path(temp_dir) / "h3.safetensors"
            save_file(weights, checkpoint)
            installed = load_h3_lora(model, checkpoint, compute_dtype=torch.float32)

        self.assertEqual(installed, ["transformer_blocks.0.attn.to_q"])
        self.assertIsInstance(model.transformer_blocks[0].attn.to_q, H3LoRALinear)
        output = model.transformer_blocks[0].attn.to_q(torch.tensor([[1.0, 0.0, 0.0]]))
        self.assertTrue(torch.equal(output, torch.tensor([[2.0, 3.0]])))

    def test_h3_lora_splits_fused_qkv_output_across_diffusers_modules(self):
        from safetensors.torch import save_file

        model = self._tiny_h3_model()
        weights = {
            "diffusion_model.blocks.0.self_attn.qkv_proj.lora_down.weight": torch.tensor(
                [[1.0, 0.0, 0.0]]
            ),
            "diffusion_model.blocks.0.self_attn.qkv_proj.lora_up.weight": torch.arange(
                1.0, 7.0
            ).reshape(6, 1),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            checkpoint = Path(temp_dir) / "h3.safetensors"
            save_file(weights, checkpoint)
            installed = load_h3_lora(model, checkpoint, compute_dtype=torch.float32)

        self.assertEqual(
            installed,
            [
                "transformer_blocks.0.attn.to_q",
                "transformer_blocks.0.attn.to_k",
                "transformer_blocks.0.attn.to_v",
            ],
        )
        sample = torch.tensor([[1.0, 0.0, 0.0]])
        outputs = [
            getattr(model.transformer_blocks[0].attn, name)(sample)
            for name in ("to_q", "to_k", "to_v")
        ]
        self.assertTrue(torch.equal(outputs[0], torch.tensor([[1.0, 2.0]])))
        self.assertTrue(torch.equal(outputs[1], torch.tensor([[3.0, 4.0]])))
        self.assertTrue(torch.equal(outputs[2], torch.tensor([[5.0, 6.0]])))

    def test_h3_lora_supports_peft_default_keys_and_metadata_alpha(self):
        from safetensors.torch import save_file

        model = self._tiny_h3_model()
        weights = {
            "transformer_blocks.0.attn.to_q.lora_A.default.weight": torch.tensor(
                [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
            ),
            "transformer_blocks.0.attn.to_q.lora_B.default.weight": torch.tensor(
                [[2.0, 0.0], [0.0, 4.0]]
            ),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            checkpoint = Path(temp_dir) / "turbo.safetensors"
            save_file(weights, checkpoint, metadata={"alpha": "1"})
            installed = load_h3_lora(model, checkpoint, compute_dtype=torch.float32)

        self.assertEqual(installed, ["transformer_blocks.0.attn.to_q"])
        output = model.transformer_blocks[0].attn.to_q(
            torch.tensor([[1.0, 1.0, 0.0]])
        )
        self.assertTrue(torch.equal(output, torch.tensor([[1.0, 2.0]])))

    def test_h3_lora_does_not_reapply_baked_global_alpha(self):
        from safetensors.torch import save_file

        model = self._tiny_h3_model()
        weights = {
            "transformer_blocks.0.attn.to_q.lora_A.default.weight": torch.tensor(
                [[1.0, 0.0, 0.0]]
            ),
            "transformer_blocks.0.attn.to_q.lora_B.default.weight": torch.tensor(
                [[2.0], [3.0]]
            ),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            checkpoint = Path(temp_dir) / "hyperflow.safetensors"
            save_file(
                weights,
                checkpoint,
                metadata={
                    "alpha": "256",
                    "alpha_tensors": "removed (scale baked)",
                    "baked_scale": "source alpha/rank scale baked into lora_B",
                },
            )
            load_h3_lora(model, checkpoint, compute_dtype=torch.float32)

        output = model.transformer_blocks[0].attn.to_q(
            torch.tensor([[1.0, 0.0, 0.0]])
        )
        self.assertTrue(torch.equal(output, torch.tensor([[2.0, 3.0]])))

    def test_h3_lora_reorders_native_swiglu_fc1_delta_for_diffusers(self):
        from safetensors.torch import save_file

        model = self._tiny_h3_model()
        weights = {
            "lora_unet_blocks_0_mlp_fc1.lora_down.weight": torch.tensor(
                [[1.0, 0.0, 0.0]]
            ),
            "lora_unet_blocks_0_mlp_fc1.lora_up.weight": torch.arange(
                1.0, 5.0
            ).reshape(4, 1),
            "lora_unet_blocks_0_mlp_fc1.alpha": torch.tensor(1.0),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            checkpoint = Path(temp_dir) / "h3.safetensors"
            save_file(weights, checkpoint)
            load_h3_lora(model, checkpoint, compute_dtype=torch.float32)

        projection = model.transformer_blocks[0].ff.net[0].proj
        output = projection(torch.tensor([[1.0, 0.0, 0.0]]))
        self.assertTrue(torch.equal(output, torch.tensor([[3.0, 4.0, 1.0, 2.0]])))

    def test_extra_lora_preserves_int8_base_at_full_strength(self):
        from safetensors.torch import save_file
        from h3_quantized import H3QuantizedLinear
        model = self._tiny_h3_model()
        original = model.transformer_blocks[0].attn.to_q
        packed = torch.zeros((2, 3), dtype=torch.int8)
        quantized = H3QuantizedLinear(original, packed, torch.ones(2),
                                     {"format": "int8_tensorwise"})
        model.transformer_blocks[0].attn.to_q = quantized
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "h3_extra.safetensors"
            save_file({
                "diffusion_model.blocks.0.self_attn.q.lora_A.weight": torch.tensor([[1., 0., 0.]]),
                "diffusion_model.blocks.0.self_attn.q.lora_B.weight": torch.tensor([[5.], [7.]]),
            }, path)
            load_h3_lora(model, path, strength=1.0, compute_dtype=torch.float32)
        projection = model.transformer_blocks[0].attn.to_q
        self.assertIs(projection.base_layer, quantized)
        self.assertEqual(quantized.weight.dtype, torch.int8)
        torch.testing.assert_close(projection(torch.tensor([[1., 0., 0.]])),
                                   torch.tensor([[5., 7.]]))

    def test_h3_loras_compose_on_the_same_base_module(self):
        from safetensors.torch import save_file

        model = self._tiny_h3_model()
        with tempfile.TemporaryDirectory() as temp_dir:
            first = Path(temp_dir) / "h3.safetensors"
            second = Path(temp_dir) / "h3_extra.safetensors"
            common_down = torch.tensor([[1.0, 0.0, 0.0]])
            save_file({
                "diffusion_model.blocks.0.self_attn.q.lora_A.weight": common_down,
                "diffusion_model.blocks.0.self_attn.q.lora_B.weight": torch.tensor([[2.0], [3.0]]),
            }, first)
            save_file({
                "diffusion_model.blocks.0.self_attn.q.lora_A.weight": common_down,
                "diffusion_model.blocks.0.self_attn.q.lora_B.weight": torch.tensor([[5.0], [7.0]]),
            }, second)
            load_h3_lora(model, first, compute_dtype=torch.float32)
            load_h3_lora(model, second, compute_dtype=torch.float32)

        projection = model.transformer_blocks[0].attn.to_q
        self.assertIsInstance(projection, H3LoRALinear)
        self.assertIsInstance(projection.base_layer, H3LoRALinear)
        output = projection(torch.tensor([[1.0, 0.0, 0.0]]))
        self.assertTrue(torch.equal(output, torch.tensor([[7.0, 10.0]])))

    def test_h3_lora_splits_native_qkv_into_contiguous_ranges(self):
        from safetensors.torch import save_file

        class Attention(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.to_q = torch.nn.Linear(3, 7168, bias=False)
                self.to_k = torch.nn.Linear(3, 7168, bias=False)
                self.to_v = torch.nn.Linear(3, 7168, bias=False)

        class Block(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.attn = Attention()

        model = torch.nn.Module()
        model.transformer_blocks = torch.nn.ModuleList([Block()])
        for parameter in model.parameters():
            parameter.data.zero_()

        weights = {
            "lora_unet_blocks_0_attn_qkv_proj.lora_down.weight": torch.tensor(
                [[1.0, 0.0, 0.0]]
            ),
            "lora_unet_blocks_0_attn_qkv_proj.lora_up.weight": torch.arange(
                21504.0
            ).reshape(21504, 1),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            checkpoint = Path(temp_dir) / "h3_extra.safetensors"
            save_file(weights, checkpoint)
            load_h3_lora(model, checkpoint, compute_dtype=torch.float32)

        sample = torch.tensor([[1.0, 0.0, 0.0]])
        query = model.transformer_blocks[0].attn.to_q(sample)
        key = model.transformer_blocks[0].attn.to_k(sample)
        value = model.transformer_blocks[0].attn.to_v(sample)
        self.assertEqual(query[0, 128].item(), 128.0)
        self.assertEqual(key[0, 0].item(), 7168.0)
        self.assertEqual(value[0, 0].item(), 14336.0)

    def test_unsloth_video_vae_fused_qkv_is_split_for_diffusers(self):
        fused = torch.arange(32 * 3 * 64 * 2, dtype=torch.float16).reshape(32 * 3 * 64, 2)
        converted = _convert_video_vae_tensor(
            "decoder.transformer_blocks.0.attn.to_qkv.weight", fused, set()
        )

        self.assertEqual(
            [name for name, _ in converted],
            [
                "decoder.transformer_blocks.0.attn.to_q.weight",
                "decoder.transformer_blocks.0.attn.to_k.weight",
                "decoder.transformer_blocks.0.attn.to_v.weight",
            ],
        )
        self.assertTrue(all(tuple(value.shape) == (2048, 2) for _, value in converted))

    def test_unsloth_audio_vae_effective_weight_restores_weight_norm_pair(self):
        weight = torch.arange(24, dtype=torch.float32).reshape(2, 3, 4)
        expected = {"decoder.conv.weight_g", "decoder.conv.weight_v"}
        converted = dict(_convert_audio_vae_tensor("decoder.conv.weight", weight, expected))

        restored = torch._weight_norm(
            converted["decoder.conv.weight_v"], converted["decoder.conv.weight_g"], 0
        )
        self.assertTrue(torch.allclose(restored, weight))

    def test_standalone_vae_loader_materializes_meta_model_without_dtype_loss(self):
        try:
            import accelerate  # noqa: F401
        except ImportError:
            self.skipTest("accelerate is not installed in this test interpreter")
        from safetensors.torch import save_file

        class TinyComponent(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.proj = torch.nn.Linear(3, 2)
                self.register_buffer("computed", torch.arange(2), persistent=False)

            @classmethod
            def load_config(cls, _path):
                return {}

            @classmethod
            def from_config(cls, _config):
                return cls()

        weights = {
            "proj.weight": torch.arange(6, dtype=torch.float16).reshape(2, 3),
            "proj.bias": torch.tensor([1, 2], dtype=torch.float16),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            checkpoint = Path(temp_dir) / "vae.safetensors"
            save_file(weights, checkpoint)
            model = _load_safetensors_component(TinyComponent, temp_dir, checkpoint)

        self.assertEqual(model.proj.weight.dtype, torch.float16)
        self.assertTrue(torch.equal(model.proj.weight, weights["proj.weight"]))
        self.assertEqual(model.computed.device.type, "cpu")
        self.assertFalse(any(value.device.type == "meta" for value in model.state_dict().values()))


if __name__ == "__main__":
    unittest.main()
