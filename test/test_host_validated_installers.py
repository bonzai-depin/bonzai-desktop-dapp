import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('hosting', Path(__file__).parents[1] / 'scripts/host-validated-installers.py')
hosting = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hosting)

class HostingTests(unittest.TestCase):
    def exercise(self, *, conclusion='success', corrupt=False, split=False):
        content = b'complete installer fixture'
        digest = hashlib.sha256(content).hexdigest()
        client = Mock()
        client.head_object.return_value = {'ContentLength': len(content), 'Metadata': {'sha256': digest}}
        run = {'conclusion': conclusion, 'event': 'workflow_dispatch', 'name': 'Release (macOS)', 'head_sha': 'a'*40}
        responses = [json.dumps(run).encode(), 'git log -1 --format=%H\n' + 'a'*40 + '\n', json.dumps({'artifacts': [{'name': 'bonzai-macos-arm64', 'expired': False}]}).encode()]
        def download(command, **kwargs):
            folder = Path(command[-1])
            (folder/'BonzAI.dmg').write_bytes(content)
            (folder/'BonzAI.dmg.SHA256SUMS').write_text(f'{"0"*64 if corrupt else digest}  BonzAI.dmg\n')
            if split:
                (folder/'setup-1.bin').write_bytes(b'part')
        with tempfile.TemporaryDirectory() as temp:
            env = dict(GITHUB_REPOSITORY='owner/repo', SOURCE_RUN='123', R2_ENDPOINT='https://s3.example.test', R2_BUCKET='bucket', R2_PUBLIC_URL='https://public.example.test', GITHUB_STEP_SUMMARY=str(Path(temp)/'summary'))
            with patch.dict(os.environ, env), patch.dict('sys.modules', {'boto3': types.SimpleNamespace(client=lambda *a, **kw: client)}), patch.object(hosting.subprocess, 'check_output', side_effect=responses), patch.object(hosting.subprocess, 'run', side_effect=download), patch.object(hosting.urllib.request, 'urlopen', return_value=io.BytesIO(content)):
                if conclusion != 'success' or corrupt or split:
                    with self.assertRaises(ValueError):
                        hosting.main()
                    client.put_object.assert_not_called()
                    client.upload_file.assert_not_called()
                else:
                    hosting.main()
                    self.assertIn('BonzAI.dmg', (Path(temp)/'summary').read_text())
                    self.assertEqual(client.put_object.call_count, 2)
    def test_verified_installer_is_published(self): self.exercise()
    def test_failed_build_is_not_published(self): self.exercise(conclusion='failure')
    def test_corrupt_artifact_is_not_published(self): self.exercise(corrupt=True)
    def test_split_installer_is_not_published(self): self.exercise(split=True)

class CheckoutRevisionTests(unittest.TestCase):
    def test_windows_and_unix_checkout_logs(self):
        sha = '0b74703abf08574bb9ac130547f4008e9ac306cf'
        for command in ('/usr/bin/git', '/opt/homebrew/bin/git', r'"C:\Program Files\Git\bin\git.exe"'):
            with self.subTest(command=command):
                logs = f'job\tcheckout\t2026-10-16Z [command]{command} log -1 --format=%H\r\njob\tcheckout\t2026-10-16Z {sha}\r\n'
                self.assertEqual(hosting.checkout_revision(logs), sha)
    def test_missing_or_conflicting_revisions_are_rejected(self):
        for logs in ('', 'git log -1 --format=%H\n' + 'a'*40 + '\ngit log -1 --format=%H\n' + 'b'*40 + '\n'):
            with self.assertRaises(ValueError): hosting.checkout_revision(logs)

if __name__ == '__main__': unittest.main()
