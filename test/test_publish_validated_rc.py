import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('publish_rc', Path(__file__).parents[1] / 'scripts/publish-validated-rc.py')
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)

class ReleaseManifestTests(unittest.TestCase):
    def row(self):
        name = 'BonzAI-4.0.1-rc.1-arm64.dmg'
        return dict(name=name, source_sha='a'*40, source_run='123', sha256='b'*64, bytes=100,
                    url='https://public.example/releases/test-builds/'+'a'*40+'/'+name)

    def validate(self, rows):
        return rc.validate_manifest(rows, 'a'*40, '123', 'https://public.example', 1, '4.0.1-rc.1')

    def test_matching_build_manifest_is_accepted(self):
        row = self.row()
        self.assertEqual(self.validate([row]), [row])

    def test_wrong_revision_run_host_version_and_checksum_are_rejected(self):
        for key, value in [('source_sha','c'*40), ('source_run','124'), ('url','https://evil.example/app.dmg'),
                           ('name','BonzAI-4.0.0-rc.1.dmg'), ('name','../4.0.1-rc.1.dmg'),
                           ('sha256','broken'), ('bytes',0)]:
            with self.subTest(key=key, value=value):
                row = self.row(); row[key] = value
                with self.assertRaises(ValueError): self.validate([row])

    def test_missing_or_duplicate_platform_artifacts_are_rejected(self):
        for rows in [[], [self.row(), self.row()]]:
            with self.assertRaises(ValueError): self.validate(rows)

if __name__ == '__main__': unittest.main()
