import importlib.util
import tempfile
import unittest
import sys
import types
import time
from unittest.mock import patch
from pathlib import Path
spec = importlib.util.spec_from_file_location('hub_publish', Path(__file__).parents[1] / 'src/server/hub_publish.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ManifestTest(unittest.TestCase):
    def test_artifacts_only_and_review_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / 'model'; folder.mkdir()
            (folder / 'adapter_model.safetensors').write_bytes(b'weights')
            (folder / 'adapter_config.json').write_text('{}')
            (folder / 'metadata.json').write_text('{"private":"data"}')
            (folder / 'dataset.jsonl').write_text('private')
            (folder / 'token.txt').write_text('secret')
            (folder / 'linked.gguf').symlink_to(folder / 'token.txt')
            _, files, digest = module.artifact_manifest(tmp, 'model')
            self.assertEqual({f['path'] for f in files}, {'adapter_model.safetensors', 'adapter_config.json'})
            (folder / 'adapter_model.safetensors').write_bytes(b'changed weights')
            self.assertNotEqual(digest, module.artifact_manifest(tmp, 'model')[2])
            with self.assertRaises(ValueError): module.artifact_manifest(tmp, '../model')
    def test_metadata_only_is_not_a_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / 'model'; folder.mkdir()
            (folder / 'metadata.json').write_text('{}')
            with self.assertRaises(ValueError): module.artifact_manifest(tmp, 'model')

class PublishTest(unittest.TestCase):
    def test_confirmation_and_commit(self):
        routes = {}
        class App:
            def get(self, route):
                return lambda fn: routes.setdefault(('GET', route), fn)
            def post(self, route):
                return lambda fn: routes.setdefault(('POST', route), fn)
        payload = {}
        flask = types.SimpleNamespace(request=types.SimpleNamespace(get_json=lambda **kwargs: payload), jsonify=lambda *args, **kwargs: args[0] if args else kwargs)
        calls = []
        class Api:
            def __init__(self, token): self.token = token
            def create_repo(self, **kwargs): calls.append(('repo', kwargs))
            def create_commit(self, **kwargs):
                calls.append(('commit', kwargs))
                return types.SimpleNamespace(commit_url='https://huggingface.co/test/model/commit/abc')
        sdk = types.SimpleNamespace(HfApi=Api, CommitOperationAdd=lambda **kwargs: kwargs)
        with tempfile.TemporaryDirectory() as tmp, patch.dict(sys.modules, {'flask': flask, 'huggingface_hub': sdk}):
            folder = Path(tmp) / 'model'; (folder / 'lora').mkdir(parents=True)
            (folder / 'lora/adapter_model.safetensors').write_bytes(b'weights')
            (folder / 'metadata.json').write_text('{"private":"data"}')
            module.register_hub_publish(App(), tmp)
            preview = routes[('GET', '/training/models/<model_id>/hub-preview')]('model')
            payload.update(repository='test/model', token='hf_fake', digest=preview['digest'])
            upload = routes[('POST', '/training/models/<model_id>/hub-upload')]
            self.assertEqual(upload('model')[1], 400)
            self.assertEqual(calls, [])
            payload['confirmed'] = True
            result, code = upload('model'); self.assertEqual(code, 202)
            status = routes[('GET', '/training/hub-uploads/<job_id>')]
            for _ in range(100):
                if status(result['job_id'])['status'] == 'complete': break
                time.sleep(.01)
            self.assertEqual(status(result['job_id'])['status'], 'complete')
            self.assertEqual(calls[0][1]['private'], True)
            self.assertEqual(calls[0][1]['exist_ok'], False)
            self.assertEqual(calls[1][1]['operations'][0]['path_in_repo'], 'adapter_model.safetensors')
            self.assertNotIn('hf_fake', str(status(result['job_id'])))

if __name__ == '__main__': unittest.main()
