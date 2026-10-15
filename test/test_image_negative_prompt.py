import ast
import unittest
from pathlib import Path

TREE = ast.parse((Path(__file__).parents[1] / 'src/server/diffuser.py').read_text())
NODES = [n for n in TREE.body if
         isinstance(n, ast.FunctionDef) and n.name == '_image_negative_prompt' or
         isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'IMAGE_NEGATIVE_PROMPT' for t in n.targets)]
ENV = {}
exec(compile(ast.Module(body=NODES, type_ignores=[]), 'image-negative-prompt', 'exec'), ENV)

class ImageNegativePromptTest(unittest.TestCase):
    def test_defaults_are_used_for_missing_or_empty_input(self):
        for value in [None, '', 12]:
            self.assertEqual(ENV['_image_negative_prompt']({'negative_prompt':value}),ENV['IMAGE_NEGATIVE_PROMPT'])

    def test_caller_constraints_survive_without_duplicate_terms(self):
        result=ENV['_image_negative_prompt']({'negative_prompt':'watermark, extra hands, WORST QUALITY'})
        terms=result.lower().split(', ')
        self.assertIn('extra hands',terms)
        self.assertEqual(terms.count('watermark'),1)
        self.assertEqual(terms.count('worst quality'),1)
        self.assertEqual(terms.count('futa'),1)

    def test_standard_and_quality_share_defaults(self):
        for name in ['image_standard_sdxl','z_image_quality']:
            node=next(n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name==name)
            self.assertTrue(any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='_image_negative_prompt' for n in ast.walk(node)))

if __name__ == '__main__':
    unittest.main()
