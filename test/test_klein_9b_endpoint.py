"""Persisted Klein download names resolve to the replacement Qwen pipeline."""
import ast, fnmatch, unittest
from pathlib import Path
TREE=ast.parse((Path(__file__).parents[1]/'src/server/diffuser.py').read_text())
class LegacyImageAliasTests(unittest.TestCase):
    def test_legacy_download_names_use_qwen_without_original_denoiser_weights(self):
        env={'List':list,'Optional':__import__('typing').Optional,'Dict':dict,'Any':object,'_sf':lambda name,url:{'name':name,'url':url}}
        for node in TREE.body:
            if isinstance(node,ast.Assign):
                try:value=ast.literal_eval(node.value)
                except (ValueError,TypeError):continue
                for target in node.targets:
                    if isinstance(target,ast.Name):env[target.id]=value
        nodes=[n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name in {'allow_patterns_for_repo','_plan_for'}]
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'manifest','exec'),env)
        plan=env['_plan_for']('image_turbo')
        for alias in ['flux_klein','flux_klein_9b_gguf','qwen_image_21_turbo']:
            self.assertEqual(env['_plan_for'](alias),plan)
        self.assertEqual(plan['repos_to_fetch'],['Qwen/Qwen-Image-2.1-Turbo'])
        self.assertEqual([f['name'] for f in plan['single_files']],['qwen-image-2.1-turbo-q4_k_m.gguf','qwen-image-2.1-lora.safetensors'])
        standard=env['_plan_for']('image_standard')
        self.assertEqual(standard,env['_plan_for']('qwen_image_21'))
        self.assertNotEqual(standard,plan)
        self.assertEqual(standard['single_files'][0]['name'],'qwen-image-2.1-q4_k_m.gguf')
        patterns=env['allow_patterns_for_repo']('Qwen/Qwen-Image-2.1')
        included=lambda name:any(fnmatch.fnmatch(name,p) for p in patterns)
        self.assertFalse(included('transformer/diffusion_pytorch_model.safetensors'))
        for name in ['transformer/config.json','text_encoder/model.safetensors','processor/tokenizer.json','vae/diffusion_pytorch_model.safetensors']:
            self.assertTrue(included(name))
