import re
import ast
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
DIFFUSER = (ROOT / "src" / "server" / "diffuser.py").read_text(encoding="utf-8")
PACKAGE = (ROOT / "package.json").read_text(encoding="utf-8")


class MiniMaxH3AssetContractTest(unittest.TestCase):
    def test_local_hybrid_replaces_only_transformer_and_plan_refreshes(self):
        tree=ast.parse(DIFFUSER)
        nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in ('_plan_for','_cached_plan_for')]
        constants={}
        for node in tree.body:
            if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name):
                key=node.targets[0].id
                if key.startswith('MINIMAX_H3_'):
                    try: constants[key]=ast.literal_eval(node.value)
                    except (ValueError,TypeError): pass
        for key in ('TRANSFORMER','TEXT_ENCODER','VIDEO_VAE','AUDIO_VAE'):
            constants['MINIMAX_H3_'+key+'_URL']='https://example.invalid/'+key
        with tempfile.TemporaryDirectory() as folder:
            scope={**constants,'MODEL_DIR':Path(folder),'Dict':dict,'Any':object,'_plan_cache':{},'_sf':lambda name,url: {'name':name,'url':url}}
            exec(compile(ast.Module(body=nodes,type_ignores=[]),'<plan>','exec'),scope)
            gguf=scope['_cached_plan_for']('video_sota')
            hybrid=Path(folder)/constants['MINIMAX_H3_HYBRID_NAME'];hybrid.touch()
            local=scope['_cached_plan_for']('video_sota')
            self.assertEqual(local['single_files'][0]['name'],'h3_hybrid.safetensors')
            self.assertEqual(local['single_files'][0]['url'],'')
            self.assertEqual(local['single_files'][1:],gguf['single_files'][1:])
            hybrid.unlink()
            self.assertEqual(scope['_cached_plan_for']('video_sota'),gguf)

    def test_sota_endpoint_and_pipeline_are_wired(self):
        self.assertIn('@app.route("/video/sota", methods=["POST"])', DIFFUSER)
        self.assertIn('"video_sota", auto_download=', DIFFUSER)

    def test_requested_unsloth_quant_and_vaes_are_explicit_downloads(self):
        expected = {
            "MINIMAX_H3_GGUF_REPO": "unsloth/MiniMax-H3-GGUF",
            "MINIMAX_H3_TRANSFORMER_NAME": "minimax_h3_fl2va_pruned-ud-q2_k_xl.gguf",
            "MINIMAX_H3_TEXT_ENCODER_NAME": "qwen3vl_32b_minimax_h3-q2_k_m.gguf",
            "MINIMAX_H3_VIDEO_VAE_NAME": "minimax_h3_video_vae_fp16.safetensors",
            "MINIMAX_H3_AUDIO_VAE_NAME": "minimax_h3_audio_vae_fp32.safetensors",
            "MINIMAX_H3_LORA_NAME": "h3_lora.safetensors",
        }
        for name, value in expected.items():
            self.assertRegex(DIFFUSER, rf'(?m)^{name} = "{re.escape(value)}"$', name)

        for name in (
            "MINIMAX_H3_TRANSFORMER_NAME",
            "MINIMAX_H3_TEXT_ENCODER_NAME",
            "MINIMAX_H3_VIDEO_VAE_NAME",
            "MINIMAX_H3_AUDIO_VAE_NAME",
        ):
            self.assertIn(f"_sf({name},", DIFFUSER)

        self.assertNotIn("MINIMAX_H3_ACCELERATOR_NAME", DIFFUSER)
        self.assertNotIn("MINIMAX_H3_HYPERFLOW_SIGMAS", DIFFUSER)
        self.assertNotIn("h3_extra.safetensors", DIFFUSER)
        self.assertNotIn("MINIMAX_H3_EXTRA_LORA", DIFFUSER)
        self.assertNotIn("h3_more.safetensors", DIFFUSER)
        self.assertNotIn("_sf(MINIMAX_H3_LORA_NAME,", DIFFUSER)
        self.assertNotIn("h3_turbo.safetensors", DIFFUSER)
        self.assertIn("MODEL_DIR / MINIMAX_H3_LORA_NAME", DIFFUSER)
        self.assertIn("MINIMAX_H3_LORA_STRENGTH = 0.5", DIFFUSER)
        self.assertIn('"loras": h3_applied_loras', DIFFUSER)
        self.assertIn('MINIMAX_H3_SAMPLER = "euler_ancestral"', DIFFUSER)
        self.assertIn('MINIMAX_H3_SCHEDULER = "simple"', DIFFUSER)
        self.assertIn("MINIMAX_H3_GUIDANCE_SCALE = 1.0", DIFFUSER)
        self.assertIn("_install_h3_euler_ancestral_scheduler(pipe.scheduler, seed + 1)", DIFFUSER)
        self.assertIn("_install_h3_euler_ancestral_scheduler(pipe.audio_scheduler, seed + 2)", DIFFUSER)
        self.assertIn('"schedule": MINIMAX_H3_SCHEDULER', DIFFUSER)
        self.assertIn("requested_steps < 4 or requested_steps > 8", DIFFUSER)

    def test_sota_ui_keeps_the_local_lora_preset_backend_only(self):
        video_ui = (ROOT / "src" / "components" / "GenerativeVideo.vue").read_text(encoding="utf-8")
        self.assertNotIn("useH3Lora", video_ui)
        self.assertNotIn("useH3Extra", video_ui)
        self.assertNotIn("Local adapters", video_ui)
        self.assertNotIn('sampler: "euler_ancestral"', video_ui)
        self.assertIn('default_sampler = "euler" if hybrid_checkpoint', DIFFUSER)
        self.assertIn("guidance_scale: 1", video_ui)

    def test_h3_reports_each_denoising_step(self):
        self.assertIn("def _attach_h3_step_progress(", DIFFUSER)
        self.assertIn('f"generating video and audio ({current}/{total})"', DIFFUSER)

    def test_h3_audio_is_peak_protected_before_aac_export(self):
        self.assertIn("def _prepare_h3_audio_for_export(audio):", DIFFUSER)
        self.assertIn('audio=export_audio', DIFFUSER)
        self.assertIn('"audio_export_gain": audio_metrics["export_gain"]', DIFFUSER)

    def test_official_repo_download_is_metadata_only(self):
        start = DIFFUSER.index("if repo_id == MINIMAX_H3_REPO:")
        end = DIFFUSER.index("    return None", start)
        patterns = DIFFUSER[start:end]
        self.assertIn('"vae/config.json"', patterns)
        self.assertIn('"audio_vae/config.json"', patterns)
        self.assertNotIn('"vae/**"', patterns)
        self.assertNotIn('"audio_vae/**"', patterns)

    def test_diffusers_components_load_from_the_downloaded_local_repo(self):
        start = DIFFUSER.index("def minimax_h3_video():")
        end = DIFFUSER.index('@app.route("/video/quality"', start)
        endpoint = DIFFUSER[start:end]
        self.assertEqual(endpoint.count("pretrained_model_name_or_path=str(official_dir)"), 3)
        self.assertEqual(endpoint.count("local_files_only=True"), 3)

    def test_q2_k_xl_uses_the_diffusers_modular_pipeline(self):
        self.assertIn("load_h3_transformer(transformer_path", DIFFUSER)
        self.assertIn('_minimax_h3_phase(["denoise"])', DIFFUSER)
        self.assertIn('"runtime": "diffusers"', DIFFUSER)
        self.assertNotIn("def _run_h3_native(", DIFFUSER)
        self.assertNotIn("stable-diffusion.cpp", DIFFUSER)
        self.assertNotIn('"build:h3-runtime"', PACKAGE)

    def test_public_step_count_maps_to_actual_transformer_evaluations(self):
        self.assertIn("num_inference_steps=steps + 1", DIFFUSER)
        self.assertIn('"num_inference_steps": steps', DIFFUSER)


if __name__ == "__main__":
    unittest.main()
