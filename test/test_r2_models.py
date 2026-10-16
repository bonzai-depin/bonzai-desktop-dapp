import ast
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src/server'))
from r2_models import MODEL_FILES, model_file
from wan_adapters import WAN_ADAPTERS

class ModelMirrorTest(unittest.TestCase):
    def test_every_adapter_has_a_checksummed_public_download(self):
        for name in [a[0] for a in WAN_ADAPTERS] + ['flux-2-klein-9b-lora.safetensors', 'flux-2-klein-9b-lora-extra.safetensors', 'h3_lora.safetensors']:
            item = model_file(name)
            self.assertEqual(item['url'], 'https://pub-c63241af101045fb837462e5c4c67e33.r2.dev/models/' + name)
            self.assertGreater(item['size'], 0)
            self.assertRegex(item['sha256'], r'^[a-f0-9]{64}$')

    def test_unknown_names_cannot_become_arbitrary_downloads(self):
        for name in ['../secrets', 'https://other.test/weights', 'missing.safetensors']:
            with self.assertRaises(ValueError): model_file(name)

    def test_download_plan_uses_mirrors_without_network_size_probes(self):
        tree = ast.parse((ROOT / 'src/server/diffuser.py').read_text())
        functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_sf']
        def no_probe(*args): raise AssertionError('Known mirror should not probe network')
        env = {'normalize_model_filename': str.lower, '_expected_size': no_probe}
        exec(compile(ast.Module(body=functions, type_ignores=[]), 'plans', 'exec'), env)
        self.assertEqual(env['_sf']('H3_HYBRID.SAFETENSORS', ''), model_file('h3_hybrid.safetensors'))

    def test_standard_plans_include_active_adapters_only(self):
        import tempfile
        tree = ast.parse((ROOT / 'src/server/diffuser.py').read_text())
        env = {'Dict': dict, 'Any': object, 'normalize_model_filename': str.lower,
               '_expected_size': lambda *args: 0}
        for node in tree.body:
            if isinstance(node, ast.Assign):
                try: value = ast.literal_eval(node.value)
                except (ValueError, TypeError): continue
                for target in node.targets:
                    if isinstance(target, ast.Name): env[target.id] = value
        functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('_sf', '_plan_for')]
        exec(compile(ast.Module(body=functions, type_ignores=[]), 'plans', 'exec'), env)
        with tempfile.TemporaryDirectory() as folder:
            env['MODEL_DIR'] = Path(folder)
            wan = env['_plan_for']('video_quality')['single_files']
            self.assertTrue({a[0] for a in WAN_ADAPTERS}.issubset({f['name'] for f in wan}))
            for name in ('wan2.2_high_q5.gguf', 'wan2.2_low_q5.gguf'):
                self.assertIn(model_file(name), wan)
            self.assertEqual(env['WAN_GGUF_HIGH'], 'wan2.2_high_q5.gguf')
            self.assertEqual(env['WAN_GGUF_LOW'], 'wan2.2_low_q5.gguf')
            sdxl = env['_plan_for']('image_standard')['single_files']
            self.assertEqual(sdxl, [model_file('sdxl-lora.safetensors')])
            klein = env['_plan_for']('image_turbo')['single_files']
            self.assertEqual(len(klein), 3)
            # Leave GGUF as fallback; do not activate the previously removed extra adapter.
            for name in ('MINIMAX_H3_TRANSFORMER_URL', 'MINIMAX_H3_TEXT_ENCODER_URL', 'MINIMAX_H3_VIDEO_VAE_URL', 'MINIMAX_H3_AUDIO_VAE_URL'):
                env[name] = 'https://example.test/weights'
            h3 = env['_plan_for']('video_sota')['single_files']
            self.assertNotIn('h3_extra.safetensors', [f['name'] for f in h3])
            self.assertNotIn('h3_hybrid.safetensors', [f['name'] for f in h3])
            self.assertIn('h3_lora.safetensors', [f['name'] for f in h3])
            individual = env['_plan_for']('model:h3_extra.safetensors')
            self.assertEqual(individual['single_files'], [model_file('h3_extra.safetensors')])

    def test_seedvr2_mirror_preserves_pinned_integrity(self):
        import video_enhance
        for item in video_enhance.SEEDVR2_FILES:
            if item['name'].endswith('.safetensors'):
                self.assertEqual(item, model_file(item['name']))

if __name__ == '__main__': unittest.main()
