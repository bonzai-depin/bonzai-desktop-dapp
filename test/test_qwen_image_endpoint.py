"""Standard and Turbo must retain distinct models and sampling schedules, including edits."""
import ast, json, gc, logging, math, sys, tempfile, threading, time, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).parents[1]/'src/server'))
TREE=ast.parse((Path(__file__).parents[1]/'src/server/diffuser.py').read_text())
class QwenEndpointTests(unittest.TestCase):
    def test_generation_and_editing_enforce_the_same_preset(self):
        for editing, turbo in [(False,False),(True,False),(False,True),(True,True)]:
            with self.subTest(editing=editing,turbo=turbo), tempfile.TemporaryDirectory() as directory:
                Path(directory,'model_index.json').write_text(json.dumps({'sample_sigmas':[1,.97,.95,.92,.89,.84,.70,.41]}))
                pipe=Mock(return_value=SimpleNamespace(images=[Mock()]))
                loader=Mock(); pipeline=Mock();pipeline.from_pretrained.return_value=pipe
                env=dict(app=SimpleNamespace(route=lambda *a,**k:lambda fn:fn),request=Mock(),jsonify=lambda x:x,
                    json=json,math=math,time=time,gc=gc,logger=logging.getLogger(__name__),
                    QWEN_IMAGE_21_TURBO_REPO='Qwen/Qwen-Image-2.1-Turbo',QWEN_IMAGE_21_TURBO_GGUF_NAME='qwen-image-2.1-turbo-q4_k_m.gguf',
                    QWEN_IMAGE_21_LOCK=threading.Lock(),QWEN_IMAGE_21_REPO='Qwen/Qwen-Image-2.1',
                    QWEN_IMAGE_21_GGUF_NAME='qwen-image-2.1-q4_k_m.gguf',QWEN_IMAGE_21_LORA_NAME='qwen-image-2.1-lora.safetensors',
                    MODEL_DIR=Path(directory),FILES_DIR=Path(directory),repo_local_dir=lambda _:Path(directory),
                    _ensure_files_present_or_start=Mock(return_value=None),DeviceManager=Mock(),torch=Mock(),genbus=Mock(),
                    GGUFQuantizationConfig=Mock(),_is_valid_safetensors=lambda _:True,_image_negative_prompt=lambda _:'',
                    _img_b64_to_pil=Mock(),_json_sanitize=lambda x:x,encode_image_to_webp=lambda _:'image',
                    image_webp_payload=lambda *a:{'image_base64':'image'},generation_url=lambda:'ws://local')
                env['DeviceManager'].get_device.return_value=SimpleNamespace(type='mps')
                env['request'].get_json.return_value={'prompt':'A teapot','width':256,'height':256,'steps':4,'guidance_scale':1,'lora_scale':0.5,'image_base64':'reference'}
                nodes=[n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name=='image_qwen_21']
                exec(compile(ast.Module(body=nodes,type_ignores=[]),'qwen','exec'),env)
                with patch.dict(sys.modules,{'diffusers':SimpleNamespace(FlowMatchEulerDiscreteScheduler=Mock(),QwenImage21Transformer2DModel=loader,QwenImage21Pipeline=pipeline),
                    'safetensors.torch':SimpleNamespace(load_file=lambda _:{'diffusion_model.a.lora_A.weight':'tensor'}),
                    'qwen_image_scheduler':SimpleNamespace(qwen_scheduler=Mock()),
                    'qwen_image_gguf':SimpleNamespace(prepare_qwen_gguf=Mock()),
                    'qwen_image_memory':SimpleNamespace(configure_qwen_pipeline=Mock()),
                    'inference_memory':SimpleNamespace(configure_pipeline=Mock(),release_on_first_forward=Mock(),release_before_decode=Mock())}):
                    result,status=env['image_qwen_21'](edit=editing,turbo=turbo)
                self.assertEqual(status,201,result)
                self.assertEqual(pipe.call_args.kwargs['num_inference_steps'],8 if turbo else 25)
                self.assertEqual(pipe.call_args.kwargs['true_cfg_scale'],1 if turbo else 4)
                self.assertEqual(pipe.call_args.kwargs['output_resolution'],256)
                self.assertTrue(callable(pipe.call_args.kwargs['callback_on_step_end']))
                self.assertEqual(pipe.call_args.kwargs['negative_prompt'],None if turbo else '')
                self.assertEqual('image' in pipe.call_args.kwargs,editing)
                pipe.set_adapters.assert_called_once_with(['qwen_image_21'],adapter_weights=[1.0])
                self.assertEqual(result['sampler'],'euler' if turbo else 'er_sde');self.assertEqual(result['scheduler'],'qwen_turbo' if turbo else 'beta')
                self.assertEqual(result['loras'],['qwen-image-2.1-lora.safetensors'])
                self.assertEqual(result['model'], env['QWEN_IMAGE_21_TURBO_GGUF_NAME' if turbo else 'QWEN_IMAGE_21_GGUF_NAME'])
                env['_ensure_files_present_or_start'].assert_called_once_with('image_turbo' if turbo else 'image_standard',auto_download=False)
                self.assertEqual('sigmas' in pipe.call_args.kwargs,turbo)
                if turbo:self.assertEqual(pipe.call_args.kwargs['sigmas'],[1,.97,.95,.92,.89,.84,.70,.41])

