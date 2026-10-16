import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release_assets', Path(__file__).parents[1] / 'scripts/release-assets.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseAssetsTests(unittest.TestCase):
    def test_small_installer_remains_installable_with_checksum(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'BonzAI.deb'
            path.write_bytes(b'installer')
            release.prepare(temp, limit=64)
            self.assertTrue(path.exists())
            self.assertIn(release.digest(path), path.with_name(path.name + '.SHA256SUMS').read_text())

    def test_large_installer_is_preserved_without_reconstruction(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'BonzAI.deb'
            contents = bytes(range(256)) * 3
            path.write_bytes(contents)
            release.prepare(temp, limit=100)
            self.assertEqual(path.read_bytes(), contents)
            self.assertEqual(list(Path(temp).glob('*.part-*')), [])
            self.assertEqual(len(path.with_name(path.name + '.SHA256SUMS').read_text().splitlines()), 1)

    def test_split_payload_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            (Path(temp) / 'BonzAI.exe').write_bytes(b'installer')
            (Path(temp) / 'BonzAI-1.bin').write_bytes(b'payload')
            with self.assertRaisesRegex(ValueError, 'Split installers'):
                release.prepare(temp)

    def test_empty_build_fails_instead_of_publishing_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                release.prepare(temp)


if __name__ == '__main__':
    unittest.main()
