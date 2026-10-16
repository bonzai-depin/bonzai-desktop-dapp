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

    def test_large_installer_roundtrips_and_each_part_is_bounded(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'BonzAI.deb'
            contents = bytes(range(256)) * 3
            path.write_bytes(contents)
            release.prepare(temp, limit=100)
            parts = sorted(Path(temp).glob('*.part-*'))
            self.assertEqual(b''.join(p.read_bytes() for p in parts), contents)
            self.assertTrue(all(p.stat().st_size <= 100 for p in parts))
            self.assertFalse(path.exists())
            self.assertEqual(len(path.with_name(path.name + '.SHA256SUMS').read_text().splitlines()), len(parts)+1)

    def test_inno_payload_slice_at_limit_keeps_its_installable_filename(self):
        # Inno Setup emits exact-size .bin slices. They already fit the upload
        # limit; renaming each to a single .part-000 would break setup discovery.
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'BonzAI-setup-1.bin'
            path.write_bytes(b'x' * 64)
            release.prepare(temp, limit=64)
            self.assertTrue(path.exists())
            self.assertEqual(list(Path(temp).glob('*.part-*')), [])

    def test_empty_build_fails_instead_of_publishing_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                release.prepare(temp)


if __name__ == '__main__':
    unittest.main()
