import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('payload', Path(__file__).parents[1] / 'scripts/prune-desktop-payload.py')
payload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(payload)

class PayloadTests(unittest.TestCase):
    def test_runtime_and_target_ffmpeg_survive(self):
        with tempfile.TemporaryDirectory() as temp:
            app = Path(temp)
            def put(name):
                path = app / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('{}')
                return path
            put('package.json')
            put('node_modules/example/package.json')
            runtime = put('node_modules/example/dist/index.js')
            fixture = put('node_modules/example/tests/fixture.bin')
            source_map = put('node_modules/example/dist/index.js.map')
            selected = put('node_modules/ffmpeg-static-electron-forge/dist/bin/win32/x64/ffmpeg.exe')
            foreign = put('node_modules/ffmpeg-static-electron-forge/dist/bin/darwin/arm64/ffmpeg')
            payload.prune(app, 'win32', 'x64')
            self.assertTrue(runtime.exists())
            self.assertTrue(selected.exists())
            self.assertFalse(fixture.exists())
            self.assertFalse(source_map.exists())
            self.assertFalse(foreign.exists())
