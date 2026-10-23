import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'src/server'))
from training_tools import find_converter, find_quantizer, converter_command, run_converter


class TrainingToolsTests(unittest.TestCase):
    def test_development_quantizer_matches_build_output_on_all_platforms(self):
        with tempfile.TemporaryDirectory() as tmp, patch('training_tools.shutil.which', return_value=None):
            root = Path(tmp)
            server = root / 'src/server'
            for system, machine, folder, name in [
                ('Darwin', 'arm64', 'macos-arm64', 'llama-quantize'),
                ('Windows', 'AMD64', 'windows-x64', 'llama-quantize.exe'),
                ('Linux', 'x86_64', 'linux-x64', 'llama-quantize'),
            ]:
                binary = root / 'bin' / folder / name
                binary.parent.mkdir(parents=True)
                binary.write_text('fixture')
                binary.chmod(0o755)
                self.assertEqual(find_quantizer(root / 'models', server, system, machine), str(binary))

    def test_frozen_converter_runs_in_worker_instead_of_starting_server(self):
        with patch.object(sys, 'frozen', True, create=True):
            self.assertEqual(converter_command('/bundle/scripts/convert.py', '--help'),
                             [sys.executable, '--bonzai-convert-hf', '/bundle/scripts/convert.py', '--help'])

    def test_converter_is_discovered_in_bundle(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(sys, '_MEIPASS', tmp, create=True):
            script = Path(tmp) / 'scripts/convert_hf_to_gguf.py'
            script.parent.mkdir()
            script.touch()
            self.assertEqual(find_converter(Path(tmp) / 'models'), str(script))

    def test_worker_sets_script_arguments_and_module_path(self):
        with patch.object(sys, 'argv', ['diffuser', '--bonzai-convert-hf', '/bundle/scripts/convert.py', '--help']), \
             patch.object(sys, 'path', list(sys.path)), patch('runpy.run_path') as run:
            run_converter()
            self.assertEqual(sys.argv, ['/bundle/scripts/convert.py', '--help'])
            self.assertIn('/bundle/scripts', sys.path)
            run.assert_called_once_with('/bundle/scripts/convert.py', run_name='__main__')


if __name__ == '__main__':
    unittest.main()
