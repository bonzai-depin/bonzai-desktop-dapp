import ast
import base64
import re
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'src/server/diffuser.py'


def helpers(root):
    tree = ast.parse(SOURCE.read_text())
    nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef)
             and node.name in ('_validated_training_files', '_training_record_path')]
    values = {'base64': base64, 're': re, 'MODEL_DIR': root}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), values)
    return values


class TrainingUploadSecurity(unittest.TestCase):
    def test_no_uploaded_name_can_escape_or_replace_metadata(self):
        validate = helpers(Path('/tmp'))['_validated_training_files']
        for name in ('../escape', '/absolute', 'a\\b', 'C:drive', 'metadata.json',
                     'PROVENANCE.md', 'NUL.txt', 'file.', 'file ', '..', '\x00'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate([{'filename': name, 'content_base64': 'YQ=='}])
        self.assertEqual(validate([{'filename': 'échantillon.txt', 'content_base64': 'YQ=='}]), [('échantillon.txt', b'a')])

    def test_invalid_base64_and_case_collisions_are_rejected_before_writes(self):
        validate = helpers(Path('/tmp'))['_validated_training_files']
        with self.assertRaises(ValueError):
            validate([{'filename': 'x.txt', 'content_base64': '%%%'}])
        with self.assertRaises(ValueError):
            validate([{'filename': name, 'content_base64': 'YQ=='} for name in ('x.txt', 'X.txt')])

    def test_record_access_rejects_paths_and_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            resolve = helpers(root)['_training_record_path']
            for identifier in ('..', '../other', '/absolute', 'a/b', 'a\\b'):
                with self.assertRaises(ValueError):
                    resolve('datasets', identifier)
            (root / 'datasets').mkdir()
            (root / 'datasets/link').symlink_to(root, target_is_directory=True)
            with self.assertRaises(ValueError):
                resolve('datasets', 'link')
            self.assertEqual(resolve('datasets', 'valid-id'), root.resolve() / 'datasets/valid-id')


if __name__ == '__main__':
    unittest.main()
