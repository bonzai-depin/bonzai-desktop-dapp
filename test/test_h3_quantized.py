import sys
import unittest
import json
import tempfile
from unittest.mock import patch
from pathlib import Path
import torch
from torch import nn
sys.path.insert(0, str(Path(__file__).parents[1] / 'src/server'))
from h3_quantized import H3QuantizedLinear, unpack_w4, _rotation

class QuantizedH3Tests(unittest.TestCase):
    def test_h3_has_no_custom_memory_admission_or_pressure_abort(self):
        import ast
        source = (Path(__file__).parents[1] / 'src/server/diffuser.py').read_text()
        route = next(n for n in ast.parse(source).body
                     if isinstance(n, ast.FunctionDef) and n.name == 'minimax_h3_video')
        code = ast.get_source_segment(source, route)
        self.assertNotIn('check_hybrid_memory', code)
        self.assertNotIn('H3MemoryBudget', code)
        self.assertNotIn('set_per_process_memory_fraction', code)

    def test_h3_reference_orientation_preserves_selected_resolution(self):
        import ast
        source = (Path(__file__).parents[1] / 'src/server/diffuser.py').read_text()
        function = next(n for n in ast.parse(source).body
                        if isinstance(n, ast.FunctionDef) and n.name == '_h3_image_canvas')
        scope = {}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<canvas>', 'exec'), scope)
        canvas = scope['_h3_image_canvas']
        self.assertEqual(canvas(960, 544, 600, 1000), (544, 960))
        self.assertEqual(canvas(544, 960, 1000, 600), (960, 544))
        self.assertEqual(canvas(544, 960, 600, 1000), (544, 960))
        self.assertEqual(canvas(256, 256, 600, 1000), (256, 256))

    def test_w4_nibble_order_scaling_rounding_and_clamp(self):
        data = torch.tensor([[0x10, 0x32]], dtype=torch.int8)
        actual = unpack_w4(data, torch.tensor([[2.0]]), torch.arange(16).float()-8, 4)
        torch.testing.assert_close(actual, torch.tensor([[-16,-14,-12,-10]], dtype=torch.int8))

    def check_linear(self, device, w4, rotate):
        torch.manual_seed(42)
        width, rows = 256, 64
        source=nn.Linear(width, rows, bias=True)
        if w4:
            packed=torch.randint(-128,127,(rows,width//2),dtype=torch.int8)
            rel=torch.ones(rows,width//8)*9
            code=torch.arange(16).float()-8
            weight=unpack_w4(packed,rel,code,8)
        else:
            packed=weight=torch.randint(-127,127,(rows,width),dtype=torch.int8)
            rel=code=None
        scales=torch.rand(rows)*0.001
        config={'format':'asym_w4a8_int8' if w4 else 'int8_tensorwise','group_size':8,'convrot':rotate,'convrot_groupsize':256}
        layer=H3QuantizedLinear(source,packed,scales,config,relative=rel,codebook=code,chunk_rows=32,chunk_tokens=2).to(device)
        x=torch.randn(2,3,width)
        rotated=x @ _rotation(256,'cpu',torch.float32) if rotate else x
        sx=(rotated.abs().amax(-1,keepdim=True)/127).clamp_min(1e-30)
        q=(rotated/sx).round().clamp(-127,127)
        expected=(q @ weight.float().T)*sx*scales+source.bias.detach().cpu()
        actual=layer(x.to(device)).cpu()
        torch.testing.assert_close(actual,expected,rtol=0.002,atol=0.0002)
        if device=='mps': self.assertEqual(layer.last_backend,'mps_int8pack')

    def test_cpu_int8(self): self.check_linear('cpu',False,True)
    def test_cpu_w4(self): self.check_linear('cpu',True,True)
    def test_cpu_unrotated(self): self.check_linear('cpu',False,False)
    @unittest.skipUnless(torch.backends.mps.is_available(),'MPS unavailable')
    def test_mps_int8(self): self.check_linear('mps',False,True)
    @unittest.skipUnless(torch.backends.mps.is_available(),'MPS unavailable')
    def test_mps_w4(self): self.check_linear('mps',True,True)
    def test_rotation_is_orthogonal(self):
        h=_rotation(256,'cpu',torch.float32)
        torch.testing.assert_close(h@h.T,torch.eye(256))
    def test_header_only_int8_loader_and_lora_branch(self):
        self.check_safetensors_loader(embedded=False)

    def test_conflicting_layer_metadata_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Conflicting quantization metadata'):
            self.check_safetensors_loader(conflicting=True)

    def test_hybrid_safetensors_loader_and_lora_branch(self):
        self.check_safetensors_loader()

    def check_safetensors_loader(self, embedded=True, conflicting=False):
        from safetensors.torch import save_file
        from minimax_h3_gguf import load_h3_transformer, H3LoRALinear
        config={'format':'int8_tensorwise','convrot':True,'convrot_groupsize':256,'per_row':True}
        layer='final_layer.video_out'
        weight=torch.randint(-127,127,(64,256),dtype=torch.int8)
        scale=torch.ones(64,1)*0.001
        tensors={layer+'.weight':weight, layer+'.weight_scale':scale,
                 layer+'.bias':torch.zeros(64),
                 layer+'.comfy_quant':torch.tensor(list(json.dumps(config).encode()),dtype=torch.uint8)}
        if not embedded:
            tensors.pop(layer+'.comfy_quant')
        elif conflicting:
            bad = dict(config, convrot=False)
            tensors[layer+'.comfy_quant'] = torch.tensor(list(json.dumps(bad).encode()), dtype=torch.uint8)
        def small_model(source):
            model=nn.Module();model.proj_out=nn.Linear(256,64,device='meta')
            model._keep_in_fp32_modules=[]
            return model
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'h3_hybrid.safetensors'
            save_file(tensors,str(path),metadata={'_quantization_metadata':json.dumps({'layers':{layer:config}})})
            with patch('minimax_h3_gguf._new_h3_transformer',small_model):
                model=load_h3_transformer(path,torch.float32)
            self.assertIsInstance(model.proj_out,H3QuantizedLinear)
            self.assertEqual(model.proj_out.weight.dtype,torch.int8)
            torch.testing.assert_close(model.proj_out.disk_rows.read(range(64)), weight)
            x=torch.randn(2,256);base=model.proj_out(x)
            down=torch.randn(2,256);up=torch.randn(64,2)
            adapted=H3LoRALinear(model.proj_out,down,up,0.5,torch.float32)
            torch.testing.assert_close(adapted(x),base+0.5*(x@down.T@up.T))
            self.assertEqual(adapted.base_layer.weight.dtype,torch.int8)

    def test_qkv_views_do_not_duplicate_checkpoint_storage(self):
        from minimax_h3_gguf import _select_h3_rows
        weight = torch.arange(96).reshape(12, 8)
        selected = _select_h3_rows(weight, torch.arange(4, 8))
        self.assertEqual(selected.untyped_storage().data_ptr(), weight.untyped_storage().data_ptr())
        torch.testing.assert_close(selected, weight[4:8])
        torch.testing.assert_close(_select_h3_rows(weight, torch.tensor([1, 3])), weight[[1, 3]])

    def test_swapped_output_across_chunk_boundary(self):
        source = nn.Linear(32, 10)
        layer = H3QuantizedLinear(source, torch.ones(10,32,dtype=torch.int8),
            torch.ones(10), {'format':'int8_tensorwise'}, chunk_rows=3, chunk_tokens=2)
        x = torch.randn(5,32)
        expected = layer(x).detach()
        layer.swap_output_halves = True
        torch.testing.assert_close(layer(x), torch.cat((expected[:,5:],expected[:,:5]),-1))

    def test_streaming_removes_only_quantized_offload_hooks(self):
        from diffusers.hooks import apply_group_offloading
        from h3_quantized import preserve_h3_quantized_storage
        quant = H3QuantizedLinear(nn.Linear(32,32), torch.ones(32,32,dtype=torch.int8),
            torch.ones(32), {'format':'int8_tensorwise'})
        model = nn.Sequential(quant, nn.Linear(32,32))
        original = quant.weight.untyped_storage().data_ptr()
        apply_group_offloading(model, onload_device='cpu', offload_device='cpu', offload_type='leaf_level')
        preserve_h3_quantized_storage(model)
        self.assertIsNone(quant._diffusers_hook.get_hook('group_offloading'))
        self.assertIsNotNone(model[1]._diffusers_hook.get_hook('group_offloading'))
        with torch.inference_mode():
            self.assertTrue(torch.isfinite(model(torch.randn(3,32))).all())
        self.assertEqual(original, quant.weight.untyped_storage().data_ptr())

    def test_reclaim_only_on_mps_under_system_pressure(self):
        from h3_quantized import reclaim_h3_mps_cache
        from types import SimpleNamespace
        with patch('psutil.virtual_memory', return_value=SimpleNamespace(available=7*1024**3)), patch('torch.mps.synchronize') as sync, patch('torch.mps.empty_cache') as empty:
            self.assertFalse(reclaim_h3_mps_cache('cpu'))
            self.assertTrue(reclaim_h3_mps_cache('mps'))
            sync.assert_called_once();empty.assert_called_once()
        with patch('psutil.virtual_memory', return_value=SimpleNamespace(available=9*1024**3)), patch('torch.mps.empty_cache') as empty:
            self.assertFalse(reclaim_h3_mps_cache('mps'))
            empty.assert_not_called()

    def test_invalid_format_rejected(self):
        with self.assertRaises(ValueError):
            H3QuantizedLinear(nn.Linear(32,32),torch.zeros(32,32,dtype=torch.int8),torch.ones(32),{'format':'unknown'})

if __name__=='__main__':unittest.main()
