"""Endpoint orchestration tests with stubbed inference; no model downloads."""
import ast
import gc
import logging
import math
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

TREE = ast.parse((Path(__file__).parents[1] / 'src/server/diffuser.py').read_text())

class KleinEndpointTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pipe = Mock(return_value=SimpleNamespace(images=[Mock()]))
        self.loader = Mock()
        self.env = dict(
            _image_negative_prompt=lambda data: "test negative",
            app=SimpleNamespace(route=lambda *a, **k: lambda fn: fn),
            request=Mock(), jsonify=lambda x: x, _json_sanitize=lambda x: x,
            FLUX_KLEIN_9B_LOCK=threading.Lock(), math=math,
            FLUX_KLEIN_9B_LORA_NAME="flux-2-klein-9b-lora.safetensors",
            FLUX_KLEIN_9B_LORA_EXTRA_NAME="flux-2-klein-9b-lora-extra.safetensors",
            _is_valid_safetensors=Mock(return_value=True),
            FLUX_KLEIN_9B_REPO='black-forest-labs/FLUX.2-klein-9B',
            FLUX_KLEIN_9B_GGUF_NAME='flux-2-klein-9b-q4_k_m.gguf',
            MODEL_DIR=Path(self.temp.name), FILES_DIR=Path(self.temp.name),
            repo_local_dir=lambda _: Path(self.temp.name)/'repo',
            _ensure_files_present_or_start=Mock(return_value=None),
            DeviceManager=Mock(), torch=Mock(), genbus=Mock(),
            Flux2KleinPipeline=Mock(), GGUFQuantizationConfig=Mock(),
            time=time, gc=gc, logger=logging.getLogger(__name__),
            image_webp_payload=lambda *a: {'image_base64':'result'},
            encode_image_to_webp=lambda _: 'result', generation_url=lambda: 'ws://localhost/generation')
        self.env['request'].get_json.return_value={'prompt':'A ceramic teapot'}
        self.env['DeviceManager'].get_device.return_value=SimpleNamespace(type='mps')
        self.env['Flux2KleinPipeline'].from_pretrained.return_value=self.pipe
        self.env['genbus'].new.return_value='test'
        node=next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name=='image_experimental_klein_9b')
        exec(compile(ast.Module(body=[node],type_ignores=[]),'endpoint','exec'),self.env)
        def load_adapter(pipe, path, adapter, strength):
            pipe.load_lora_weights(str(path.parent), weight_name=path.name, adapter_name=adapter, local_files_only=True)
            return [], True
        self.mock_import=patch.dict(sys.modules, {'klein_adapters':SimpleNamespace(load_klein_adapter=load_adapter), 'diffusers':SimpleNamespace(Flux2Transformer2DModel=self.loader)})
        self.mock_import.start()
        self.addCleanup(self.mock_import.stop)

    def call(self, **kwargs):
        return self.env['image_experimental_klein_9b'](**kwargs)

    def test_selective_manifest_skips_original_transformer_weights(self):
        import fnmatch
        from typing import List, Optional, Dict, Any
        env = dict(List=List, Optional=Optional, Dict=Dict, Any=Any,
                   SDXL_BASE_REPO='sdxl', SDXL_REFINER_REPO='refiner',
                   FLUX_KLEIN_9B_REPO='black-forest-labs/FLUX.2-klein-9B',
                   FLUX_KLEIN_9B_GGUF_NAME='flux-2-klein-9b-q4_k_m.gguf',
                   FLUX_KLEIN_9B_GGUF_URL='https://example/flux-2-klein-9b-Q4_K_M.gguf',
                   _sf=lambda name, url: {'name':name,'url':url})
        nodes = [n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in {'allow_patterns_for_repo','_plan_for'}]
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'manifest','exec'),env)
        plan=env['_plan_for']('flux_klein_9b_gguf')
        self.assertEqual(env['_plan_for']('image_turbo'),plan)
        self.assertEqual(env['_plan_for']('flux_klein'),plan)
        self.assertEqual(plan['single_files'][0]['name'],'flux-2-klein-9b-q4_k_m.gguf')
        patterns=env['allow_patterns_for_repo'](plan['repos_to_fetch'][0])
        included=lambda name: any(fnmatch.fnmatch(name,p) for p in patterns)
        self.assertFalse(included('transformer/diffusion_pytorch_model.safetensors'))
        for name in ['transformer/config.json','text_encoder/model.safetensors','tokenizer/tokenizer.json','vae/diffusion_pytorch_model.safetensors','scheduler/scheduler_config.json']:
            self.assertTrue(included(name),name)

    def test_local_gguf_mps_and_seed(self):
        result,status=self.call()
        self.assertEqual(status,201)
        kwargs=self.loader.from_single_file.call_args.kwargs
        self.assertTrue(kwargs['local_files_only'])
        self.assertEqual(kwargs['subfolder'],'transformer')
        self.assertTrue(self.loader.from_single_file.call_args.args[0].endswith('flux-2-klein-9b-q4_k_m.gguf'))
        self.assertEqual(self.pipe.enable_model_cpu_offload.call_args.kwargs['device'].type,'mps')
        self.env['torch'].Generator.assert_called_once_with(device='cpu')
        self.env['_ensure_files_present_or_start'].assert_called_once_with('flux_klein_9b_gguf',auto_download=False)
        self.assertIn('inference_seconds',result)
        self.assertFalse(result['negative_prompt_applied'])
        self.assertNotIn('negative_prompt', self.pipe.call_args.kwargs)
        self.assertFalse(self.env['FLUX_KLEIN_9B_LOCK'].locked())

    def test_all_supported_device_paths(self):
        for device, bf16 in [('cpu',False),('mps',False),('cuda',False),('cuda',True)]:
            self.pipe.reset_mock()
            self.env['DeviceManager'].get_device.return_value=SimpleNamespace(type=device)
            self.env['torch'].cuda.is_bf16_supported.return_value=bf16
            self.assertEqual(self.call()[1],201)
            expected=self.env['torch'].float32 if device=='cpu' else self.env['torch'].bfloat16 if device=='cuda' and bf16 else self.env['torch'].float16
            self.assertEqual(self.loader.from_single_file.call_args.kwargs['torch_dtype'],expected)
            if device=='cpu':
                self.pipe.enable_model_cpu_offload.assert_not_called()
                self.pipe.to.assert_called_once()
            else:
                self.assertEqual(self.pipe.enable_model_cpu_offload.call_args.kwargs['device'].type,device)

    def test_edit_requires_and_passes_reference_image(self):
        self.assertEqual(self.call(edit=True)[1],400)
        self.env['request'].get_json.return_value={'prompt':'Make it blue','image_base64':'encoded'}
        reference=object()
        self.env['_img_b64_to_pil']=Mock(return_value=reference)
        self.assertEqual(self.call(edit=True)[1],201)
        self.assertIs(self.pipe.call_args.kwargs['image'],reference)
        self.assertEqual(self.env['genbus'].new.call_args.args[1]['endpoint'],'/image/image/turbo')

    def test_ui_routes_share_the_gguf_handler(self):
        env={**self.env,'image_experimental_klein_9b':Mock(return_value=({},201))}
        nodes=[n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name in {'image_turbo_flux_klein','image_turbo_flux_klein_i2i'}]
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'routes','exec'),env)
        env['image_turbo_flux_klein']()
        env['image_experimental_klein_9b'].assert_called_with()
        env['image_turbo_flux_klein_i2i']()
        env['image_experimental_klein_9b'].assert_called_with(edit=True)

    def test_local_lora_is_applied_to_generation_and_editing_without_fusing(self):
        (Path(self.temp.name)/self.env['FLUX_KLEIN_9B_LORA_NAME']).write_bytes(b'fixture')
        self.env['_img_b64_to_pil']=Mock()
        for edit in [False,True]:
            self.pipe.reset_mock()
            self.env['request'].get_json.return_value={'prompt':'teapot','image_base64':'image','lora_scale':0.7}
            result,status=self.call(edit=edit)
            self.assertEqual(status,201)
            self.assertEqual(result['lora'],self.env['FLUX_KLEIN_9B_LORA_NAME'])
            self.pipe.set_adapters.assert_called_once_with(['klein_local'],adapter_weights=[0.7])
            self.assertTrue(self.pipe.load_lora_weights.call_args.kwargs['local_files_only'])
            self.pipe.fuse_lora.assert_not_called()
            calls=[c[0] for c in self.pipe.mock_calls]
            self.assertLess(calls.index('load_lora_weights'),calls.index('enable_model_cpu_offload'))

    def test_extra_lora_alone_and_with_primary(self):
        extra = self.env['FLUX_KLEIN_9B_LORA_EXTRA_NAME']
        (Path(self.temp.name)/extra).write_bytes(b'fixture')
        result,status=self.call()
        self.assertEqual(status,201)
        self.assertEqual(result['loras'],[extra])
        self.pipe.set_adapters.assert_called_with(['klein_extra'],adapter_weights=[1.0])
        primary=self.env['FLUX_KLEIN_9B_LORA_NAME']
        (Path(self.temp.name)/primary).write_bytes(b'fixture')
        self.pipe.reset_mock()
        result,status=self.call()
        self.assertEqual(status,201)
        self.assertEqual(result['loras'],[primary,extra])
        self.pipe.set_adapters.assert_called_once_with(['klein_local','klein_extra'],adapter_weights=[0.5,0.5])
        self.pipe.fuse_lora.assert_not_called()

    def test_lora_is_optional_and_can_be_disabled(self):
        result,status=self.call()
        self.assertEqual(status,201)
        self.assertIsNone(result['lora'])
        (Path(self.temp.name)/self.env['FLUX_KLEIN_9B_LORA_NAME']).write_bytes(b'fixture')
        for options in [{'use_lora':False},{'lora_scale':0}]:
            self.env['request'].get_json.return_value={'prompt':'teapot',**options}
            self.assertIsNone(self.call()[0]['lora'])
        self.pipe.load_lora_weights.assert_not_called()

    def test_bad_lora_is_not_silently_ignored(self):
        (Path(self.temp.name)/self.env['FLUX_KLEIN_9B_LORA_NAME']).write_bytes(b'fixture')
        self.pipe.load_lora_weights.side_effect=ValueError('incompatible adapter')
        with self.assertLogs(level='ERROR'):
            result,status=self.call()
        self.assertEqual(status,500)
        self.assertIn('incompatible adapter',result['error'])
        self.pipe.assert_not_called()
        self.assertFalse(self.env['FLUX_KLEIN_9B_LOCK'].locked())

    def test_invalid_lora_controls_are_rejected(self):
        for options in [{'use_lora':'false'},{'lora_scale':float('nan')},{'lora_scale':float('inf')},{'lora_scale':-1},{'lora_scale':3}]:
            self.env['request'].get_json.return_value={'prompt':'teapot',**options}
            self.assertEqual(self.call()[1],400)
        self.loader.from_single_file.assert_not_called()

    def test_download_response_does_not_start_inference(self):
        self.env['_ensure_files_present_or_start'].return_value=({'pipeline_id':'download'},202)
        self.assertEqual(self.call()[1],202)
        self.loader.from_single_file.assert_not_called()
        self.assertFalse(self.env['FLUX_KLEIN_9B_LOCK'].locked())

    def test_invalid_requests_do_not_download(self):
        for data in [None, [], {}, {'prompt':1}, {'prompt':'x','width':777}, {'prompt':'x','steps':999}, {'prompt':'x','auto_download':'false'}]:
            self.env['request'].get_json.return_value=data
            self.assertEqual(self.call()[1],400)
        self.env['_ensure_files_present_or_start'].assert_not_called()

    def test_busy_does_not_load_another_copy(self):
        self.env['FLUX_KLEIN_9B_LOCK'].acquire()
        self.assertEqual(self.call()[1],409)
        self.loader.from_single_file.assert_not_called()
        self.env['FLUX_KLEIN_9B_LOCK'].release()

    def test_failure_releases_memory_and_lock(self):
        self.pipe.side_effect=RuntimeError('out of memory')
        with self.assertLogs(level='ERROR'):
            self.assertEqual(self.call()[1],500)
        self.env['genbus'].error.assert_called_once()
        self.env['DeviceManager'].free_memory.assert_called_once()
        self.assertFalse(self.env['FLUX_KLEIN_9B_LOCK'].locked())

if __name__=='__main__':
    unittest.main()
