import ast
import os
import re
import base64
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch
from xml.etree import ElementTree as ET

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/upload-local-models.py'

class Response(io.BytesIO):
    def __init__(self, body=b'', headers=None):
        super().__init__(body)
        self.headers = headers or {}

class LocalUploadTest(unittest.TestCase):
    def test_upload_allowlist_accepts_gguf_and_legacy_safetensors_only(self):
        tree = ast.parse((SCRIPT.parent / 'prepare-model-upload.py').read_text())
        validation = []
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 's3' for t in node.targets):
                break
            if not isinstance(node, (ast.Import, ast.ImportFrom, ast.Expr)):
                validation.append(node)
        code = compile(ast.Module(body=validation, type_ignores=[]), 'validation', 'exec')
        for name, allowed in [('wan2.2_high_q5.gguf', True), ('sdxl-lora.safetensors', True),
                              ('wan-lora-animation-high-safetensors', True),
                              ('../model.gguf', False), ('model.exe', False),
                              ('model.safetensors.exe', False), ('MODEL.gguf', False)]:
            manifest = json.dumps([dict(name=name, bytes=128, sha256='a'*64)])
            with patch.dict(os.environ, MODEL_MANIFEST=manifest):
                if allowed:
                    exec(code, dict(os=os, json=json, re=re))
                else:
                    with self.assertRaises(ValueError): exec(code, dict(os=os, json=json, re=re))

    def test_parallel_parts_match_source_and_verified_files_resume_without_reupload(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            content = b'complete model fixture'
            name = 'fixture.safetensors'
            (root / name).write_bytes(content)
            row = dict(name=name, source_name=name, bytes=len(content), sha256=hashlib.sha256(content).hexdigest())
            (root / 'inventory.json').write_text(json.dumps([row]))
            chunk = 4
            count = (len(content)+chunk-1)//chunk
            plan = dict(row, key='models/'+name, chunk=chunk, parts=[f'https://test/part/{n}' for n in range(count)], complete='https://test/complete', abort='https://test/abort')
            (root / 'upload-plan.json').write_text(json.dumps([plan]))
            parts = {}
            completed = []
            def http(req, timeout):
                if req.get_method() == 'PUT':
                    n = int(req.full_url.rsplit('/',1)[1])
                    self.assertEqual(req.get_header('Content-md5'), base64.b64encode(hashlib.md5(req.data).digest()).decode())
                    parts[n] = req.data
                    return Response(headers={'ETag': f'"part-{n}"'})
                if req.get_method() == 'POST':
                    xml = ET.fromstring(req.data)
                    self.assertEqual([int(p.findtext('PartNumber')) for p in xml], list(range(1,count+1)))
                    completed.append(True)
                    return Response(b'<CompleteMultipartUploadResult/>')
                self.assertEqual(req.get_method(), 'HEAD')
                return Response(headers={'Content-Length': str(len(content))})
            argv = [str(SCRIPT), '--directory', folder, '--model-dir', folder]
            with patch.object(sys, 'argv', argv), patch('urllib.request.urlopen', http):
                runpy.run_path(str(SCRIPT), run_name='__main__')
                runpy.run_path(str(SCRIPT), run_name='__main__')
            self.assertEqual(b''.join(parts[n] for n in sorted(parts)), content)
            self.assertEqual(len(completed), 1)
            self.assertEqual(json.loads((root / 'status.json').read_text())[name]['state'], 'verified')

if __name__ == '__main__': unittest.main()
