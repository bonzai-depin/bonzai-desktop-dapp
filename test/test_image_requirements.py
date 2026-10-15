"""Validate real image readiness helpers without loading the ML runtime."""
import ast
import json
import tempfile
import unittest
from pathlib import Path
from typing import Dict, Any

SOURCE = Path(__file__).parents[1] / 'src/server/diffuser.py'
TREE = ast.parse(SOURCE.read_text())


class ImageRequirementsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = dict(Path=Path, Dict=Dict, Any=Any, json=json,
                        _safetensors_open=None, repo_local_dir=lambda _: self.root)
        names = {'_nonzero', '_is_valid_safetensors', '_is_valid_gguf',
                 '_tokenizer_ok', '_has_any_weights', '_repo_completeness'}
        nodes = [n for n in TREE.body if
                 isinstance(n, ast.FunctionDef) and n.name in names or
                 isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in {'REPO_SPECS', 'DEFAULT_SPEC'} for t in n.targets)]
        # Constants used by unrelated repository specifications.
        self.env.update(CHATTERBOX_T3_MODEL='t3.safetensors', FLUX_KLEIN_9B_REPO='black-forest-labs/FLUX.2-klein-9B')
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), self.env)

    def write(self, name, data='{}'):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)

    def test_every_image_component_is_required(self):
        for repo in ['black-forest-labs/FLUX.2-klein-4b', 'Tongyi-MAI/Z-Image-Turbo']:
            spec = self.env['REPO_SPECS'][repo]
            for name in spec['must_files']:
                self.write(name)
            self.write('tokenizer/tokenizer.json')
            for component in spec['must_weight_dirs']:
                self.write(component + '/model.safetensors', 'weights')
            self.assertTrue(self.env['_repo_completeness'](repo)['ok'])
            for component in spec['must_weight_dirs']:
                path = self.root / component / 'model.safetensors'
                path.unlink()
                self.assertFalse(self.env['_repo_completeness'](repo)['ok'], component)
                self.write(str(path.relative_to(self.root)), 'weights')

    def test_missing_shard_never_passes_readiness(self):
        self.write('text_encoder/model.safetensors.index.json', json.dumps({'weight_map': {'a': 'one.safetensors', 'b': 'two.safetensors'}}))
        self.write('text_encoder/one.safetensors', 'weights')
        check = lambda: self.env['_has_any_weights'](self.root / 'text_encoder')
        self.assertFalse(check())
        self.write('text_encoder/two.safetensors', 'weights')
        self.assertTrue(check())
        self.write('text_encoder/two.safetensors', '')
        self.assertFalse(check())


if __name__ == '__main__':
    unittest.main()
