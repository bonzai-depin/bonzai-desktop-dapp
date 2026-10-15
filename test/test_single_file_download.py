"""Exercise production download helpers without importing the ML server stack."""
import ast
import logging
import hashlib
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Optional, Dict, Any
from unittest.mock import Mock

SOURCE = Path(__file__).parents[1] / 'src/server/diffuser.py'
sys.path.insert(0, str(SOURCE.parent))
TREE = ast.parse(SOURCE.read_text())
NAMES = {'_expected_size', '_download_single_file', '_single_file_status', '_is_valid_gguf'}


class SingleFileDownloadTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = dict(Path=Path, Optional=Optional, Dict=Dict, Any=Any,
                        PipelineDownload=object, MODEL_DIR=self.root,
                        normalize_model_filename=str.lower,
                        _gguf_lock=lambda _: threading.Lock(), _hf_token=lambda: None,
                        download_manager=Mock(), requests=Mock(), logger=logging.getLogger(__name__))
        nodes = [node for node in TREE.body if
                 isinstance(node, ast.FunctionDef) and node.name in NAMES or
                 isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'EXPECTED_SIZES' for t in node.targets)]
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), self.env)
        self.name = 'z-image-turbo-q4_k_m.gguf'
        self.path = self.root / self.name
        self.size = 5_017_613_376  # upstream LFS metadata, 2026-10-04
        self.pipeline = SimpleNamespace(cancelled=False)

    def write_model(self, size=None, magic=b'GGUF'):
        # Sparse file tests exact multi-GB accounting without downloading/allocating it.
        with self.path.open('wb') as handle:
            handle.write(magic)
            handle.truncate(self.size if size is None else size)

    def download(self):
        self.env['_download_single_file'](self.pipeline, 'test', self.name, 'https://example.test/model')

    def test_completed_upstream_file_survives_final_validation_and_is_ready(self):
        def transfer(url, dest, headers, update, is_cancelled):
            self.write_model()
            update(self.size)
        self.env['_stream_download'] = Mock(side_effect=transfer)
        self.download()
        self.assertEqual(self.path.stat().st_size, self.size)
        self.assertTrue(self.env['_single_file_status']({'name': self.name})['ok'])
        self.download()
        self.env['_stream_download'].assert_called_once()  # retry reuses the complete file

    def test_truncated_file_is_not_accepted_as_complete(self):
        self.env['_stream_download'] = Mock(side_effect=lambda *a, **k: self.write_model(1024))
        with self.assertRaisesRegex(ValueError, 'has size 1024'):
            self.download()
        self.assertFalse(self.path.exists())

    def test_matching_length_invalid_file_is_redownloaded(self):
        self.write_model(magic=b'HTML')
        self.env['_stream_download'] = Mock(side_effect=lambda *a, **k: self.write_model())
        self.download()
        self.env['_stream_download'].assert_called_once()
        self.assertTrue(self.env['_is_valid_gguf'](self.path))

    def test_http_error_page_length_is_not_cached_as_model_size(self):
        response = self.env['requests'].head.return_value
        response.headers = {'content-length': '1234'}
        response.raise_for_status.side_effect = OSError('404')
        self.assertEqual(self.env['_expected_size']('missing.gguf', 'https://example.test/missing'), 0)
        self.assertNotIn('missing.gguf', self.env['EXPECTED_SIZES'])

    def test_pinned_runtime_redownloads_same_size_corruption_and_checks_new_bytes(self):
        name = 'seedvr2-fixture.zip'
        path = self.root / name
        correct = b'reviewed runtime'
        digest = hashlib.sha256(correct).hexdigest()
        path.write_bytes(b'X' * len(correct))
        self.env['_stream_download'] = Mock(side_effect=lambda *a, **k: path.write_bytes(correct))
        self.env['_download_single_file'](self.pipeline, 'runtime', name, 'https://example.test/runtime',
                                          size_hint=len(correct), sha256=digest)
        self.assertEqual(path.read_bytes(), correct)
        self.env['_stream_download'].assert_called_once()
        path.unlink()
        self.env['_stream_download'] = Mock(side_effect=lambda *a, **k: path.write_bytes(b'X' * len(correct)))
        with self.assertRaisesRegex(ValueError, 'integrity'):
            self.env['_download_single_file'](self.pipeline, 'runtime', name, 'https://example.test/runtime',
                                              size_hint=len(correct), sha256=digest)
        self.assertFalse(path.exists())


if __name__ == '__main__':
    unittest.main()
