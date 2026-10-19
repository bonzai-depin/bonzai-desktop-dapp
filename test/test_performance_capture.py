import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src/server'))
from flask import Flask, jsonify
from performance_capture import install_performance_capture
from inference_serialization import install_inference_serialization

class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.id = str(uuid.uuid4())
        (self.root/self.id).mkdir()
        self.app=Flask(__name__)
        install_performance_capture(self.app, self.root, lambda: {'backend':'test'})
        install_inference_serialization(self.app)
        @self.app.post('/image/turbo')
        def image(): return jsonify(width=512, image='PRIVATE', prompt='PRIVATE'), 201
        @self.app.post('/video/sota')
        def failed(): return jsonify(error='PRIVATE'), 500
        @self.app.post('/video/quality')
        def accepted(): return jsonify(job='async'), 202
        self.client=self.app.test_client()
    def active(self):
        (self.root/'active.json').write_text(json.dumps({'id':self.id}))
    def rows(self): return [json.loads(f.read_text()) for f in (self.root/self.id).glob('sample-*.json')]
    def test_opt_in_and_content_free_timings(self):
        self.client.post('/image/turbo',json={'prompt':'PRIVATE'})
        self.assertEqual(self.rows(),[])
        self.active()
        self.client.post('/image/turbo',json={'prompt':'PRIVATE','width':512,'image_path':'PRIVATE'})
        row=self.rows()[0]
        self.assertEqual(row['status'],'completed')
        self.assertNotIn('PRIVATE',json.dumps(row))
        self.assertIn('executionMs',row['metrics'])
        self.assertEqual(row['output'],{'width':512})
    def test_errors_and_async_acceptance_not_success(self):
        self.active()
        self.client.post('/video/sota')
        self.client.post('/video/quality')
        self.assertEqual({r['status'] for r in self.rows()},{'failed','accepted'})
        self.assertNotIn('PRIVATE',json.dumps(self.rows()))
    def test_selected_pipelines_exclude_video_without_blocking_requests(self):
        (self.root/'active.json').write_text(json.dumps({'id': self.id, 'pipelines': ['/image/turbo']}))
        self.assertEqual(self.client.post('/video/quality').status_code, 202)
        self.assertEqual(self.rows(), [])
        self.client.post('/image/turbo')
        self.assertEqual(len(self.rows()), 1)

    def test_standardized_capture_isolated_and_concurrent_work_flagged(self):
        self.active()
        (self.root/'suite.json').write_text(json.dumps({'id': self.id, 'mode': 'standardized'}))
        self.client.post('/image/turbo',json={'_benchmark':True})
        self.assertEqual(len(self.rows()), 1)
        self.assertEqual(len(list((self.root/self.id).glob('interference-*'))),0)
        self.client.post('/image/turbo',json={'prompt':'PRIVATE'})
        self.assertEqual(len(self.rows()), 2)
        files=list((self.root/self.id).glob('interference-*'))
        self.assertEqual(len(files),1)
        self.assertNotIn('PRIVATE',files[0].read_text())

    def test_invalid_control_does_not_break_inference(self):
        (self.root/'active.json').write_text('{bad')
        self.assertEqual(self.client.post('/image/turbo').status_code,201)

if __name__=='__main__': unittest.main()
