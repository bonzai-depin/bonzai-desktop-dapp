import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src/server'))
from flask import Flask
from benchmark_environment import install_benchmark_environment

class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        (self.root/'model.gguf').write_bytes(b'fake model')
        self.app=Flask(__name__)
        install_benchmark_environment(self.app,plan=lambda p:{'single_files':[{'name':'model.gguf'}]},
            ready=lambda p:True,repo_dir=lambda p:self.root,model_dir=self.root,
            activity=lambda:{'operations':[]},device=lambda:'cpu')
        self.client=self.app.test_client()
    def test_manifest_is_content_based_and_contains_no_local_paths(self):
        first=self.client.post('/benchmark/environment',json={'pipeline':'image_quality'}).json
        self.assertTrue(first['ready'])
        self.assertNotIn(str(self.root),json.dumps(first))
        (self.root/'model.gguf').write_bytes(b'changed model')
        second=self.client.post('/benchmark/environment',json={'pipeline':'image_quality'}).json
        self.assertNotEqual(first['files'],second['files'])
    def test_unknown_pipeline_cannot_read_paths(self):
        self.assertEqual(self.client.post('/benchmark/environment',json={'pipeline':'../../private'}).status_code,400)
    def test_status_does_not_expose_generation_payloads(self):
        value=self.client.get('/benchmark/status').json
        self.assertFalse(value['busy'])
        self.assertEqual(value['device'],'cpu')
        self.assertEqual(len(value['implementation']),64)

if __name__=='__main__': unittest.main()
