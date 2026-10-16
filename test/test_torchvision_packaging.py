"""Nightly and stable torchvision wheels must retain dynamically loaded operators."""
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class TorchvisionPackagingTests(unittest.TestCase):
    def test_native_libraries_survive_for_each_wheel_layout(self):
        layouts = {
            'macos-nightly': ['_C_stable.so', 'image_stable.so', '.dylibs/libjpeg.dylib'],
            'linux-nightly': ['_C_stable.so', 'image_stable.so', 'libs/libjpeg.so.8'],
            'windows-nightly': ['_C_stable.pyd', 'image_stable.pyd', 'jpeg.dll'],
            'stable': ['_C.cpython-311-x86_64-linux-gnu.so', 'image.so'],
        }
        for platform, files in layouts.items():
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as folder:
                package = Path(folder) / 'torchvision'
                for name in files:
                    file = package / name
                    file.parent.mkdir(parents=True, exist_ok=True)
                    file.touch()
                with patch('PyInstaller.utils.hooks.is_package', return_value=True), \
                        patch('PyInstaller.utils.hooks.get_all_package_paths', return_value=[str(package)]):
                    hook = runpy.run_path(str(ROOT / 'scripts/pyinstaller-hooks/hook-torchvision.py'))
                collected = {str(Path(source).relative_to(package)): dest for source, dest in hook['binaries']}
                self.assertEqual(set(collected), set(files))
                for name, destination in collected.items():
                    self.assertEqual(Path(destination), Path('torchvision') / Path(name).parent)


if __name__ == '__main__':
    unittest.main()
