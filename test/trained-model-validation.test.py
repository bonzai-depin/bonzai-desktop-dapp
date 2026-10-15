"""Actual validation handler tests without loading GPU or inference dependencies."""
import ast
import hashlib
import json
import math
import os
from datetime import datetime
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'src/server/diffuser.py'
TREE = ast.parse(SOURCE.read_text())


def validation_handler(root):
    function = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == 'validate_trained_model')
    function.decorator_list = []
    namespace = {
        'MODEL_DIR': root, 'Path': Path, 'hashlib': hashlib, 'json': json,
        'math': math, 'datetime': datetime, 'os': os,
        'jsonify': lambda value: value, '_json_sanitize': lambda value: value,
        '_read_json_file': lambda path, fallback: json.loads(path.read_text()) if path.exists() else fallback,
        '_write_json_file': lambda path, value: path.write_text(json.dumps(value)),
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(SOURCE), 'exec'), namespace)
    return namespace['validate_trained_model']


class ArtifactByteValidation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.model = self.root / 'trained' / 'test-model'
        self.model.mkdir(parents=True)
        (self.model / 'metadata.json').write_text(json.dumps({'type': 'llm_lora', 'final_loss': 0.5}))
        self.validate = validation_handler(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_same_size_different_weights_have_distinct_validation_hashes(self):
        artifact = self.model / 'model.gguf'
        artifact.write_bytes(b'GGUFaaaa')
        first, status = self.validate('test-model')
        self.assertEqual(status, 200)
        self.assertEqual(first['validation']['scheme'], 'bonzai-local-artifact-sha256-v1')
        self.assertEqual(first['validation']['artifacts'][0]['sha256'], hashlib.sha256(b'GGUFaaaa').hexdigest())
        artifact.write_bytes(b'GGUFbbbb')
        second, status = self.validate('test-model')
        self.assertEqual(status, 200)
        self.assertNotEqual(first['validation']['hash'], second['validation']['hash'])
        repeated, _ = self.validate('test-model')
        self.assertEqual(second['validation']['hash'], repeated['validation']['hash'])

    def test_large_weights_are_hashed_and_paths_are_deterministically_sorted(self):
        weights = b'GGUF' + b'x' * (2 * 1024 * 1024 + 17)
        (self.model / 'z-model.gguf').write_bytes(weights)
        (self.model / 'a-config.json').write_text('{}')
        result, status = self.validate('test-model')
        self.assertEqual(status, 200)
        artifacts = result['validation']['artifacts']
        self.assertEqual([item['path'] for item in artifacts], ['a-config.json', 'z-model.gguf'])
        self.assertEqual(artifacts[1]['sha256'], hashlib.sha256(weights).hexdigest())
        self.assertEqual(artifacts[1]['bytes'], len(weights))

    def test_external_file_and_directory_symlinks_fail_without_hashing_target(self):
        outside = self.root / 'private'
        outside.mkdir()
        secret = outside / 'private.gguf'
        secret.write_bytes(b'GGUFprivate-data')
        (self.model / 'linked.gguf').symlink_to(secret)
        (self.model / 'linked-directory').symlink_to(outside, target_is_directory=True)
        result, status = self.validate('test-model')
        self.assertEqual(status, 422)
        self.assertEqual(result['validation']['status'], 'failed')
        self.assertEqual(result['validation']['artifacts'], [])
        self.assertTrue(any('linked.gguf' in item for item in result['validation']['errors']))
        self.assertTrue(any('linked-directory' in item for item in result['validation']['errors']))

    def test_model_directory_and_metadata_cannot_escape_through_symlinks(self):
        outside = self.root / 'outside'
        outside.mkdir()
        metadata = outside / 'metadata.json'
        original = '{"private":true}'
        metadata.write_text(original)
        (self.root / 'trained' / 'escape').symlink_to(outside, target_is_directory=True)
        self.assertEqual(self.validate('escape')[1], 422)
        (self.model / 'metadata.json').unlink()
        (self.model / 'metadata.json').symlink_to(metadata)
        self.assertEqual(self.validate('test-model')[1], 422)
        self.assertEqual(metadata.read_text(), original)


if __name__ == '__main__':
    unittest.main()
