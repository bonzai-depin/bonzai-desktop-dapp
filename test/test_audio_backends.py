import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
DIFFUSER = (ROOT / "src" / "server" / "diffuser.py").read_text(encoding="utf-8")
INSTALLER = (ROOT / "scripts" / "install-python-deps.py").read_text(encoding="utf-8")


class AudioBackendContractTest(unittest.TestCase):
    def test_quality_tts_no_longer_depends_on_qwen_tts(self):
        self.assertIn('CHATTERBOX_REPO = "ResembleAI/chatterbox"', DIFFUSER)
        self.assertIn('CHATTERBOX_T3_MODEL = "t3_mtl23ls_v3.safetensors"', DIFFUSER)
        self.assertNotIn("from qwen_tts import", DIFFUSER)
        self.assertIn('"model": "chatterbox-multilingual-v3"', DIFFUSER)

    def test_chatterbox_download_is_minimal_complete_and_offline_loadable(self):
        for filename in (
            "ve.pt",
            "s3gen.pt",
            "conds.pt",
            "grapheme_mtl_merged_expanded_v1.json",
            "Cangjie5_TC.json",
            "t3_mtl23ls_v3.safetensors",
        ):
            self.assertIn(f'"{filename}"', DIFFUSER)
        self.assertIn("ChatterboxMultilingualTTS.from_local", DIFFUSER)
        self.assertIn("chatterbox_tokenizer.hf_hub_download", DIFFUSER)

    def test_music_uses_the_official_diffusers_checkpoint(self):
        self.assertIn(
            'ACE_STEP_REPO = "ACE-Step/acestep-v15-xl-turbo-diffusers"',
            DIFFUSER,
        )
        self.assertIn("from diffusers import AceStepPipeline", DIFFUSER)
        self.assertNotIn("from acestep", DIFFUSER)
        self.assertIn("steps = max(1, min(8", DIFFUSER)
        self.assertIn("guidance_scale=1.0", DIFFUSER)

    def test_shared_ml_stack_is_current_and_reproducible(self):
        self.assertIn('"--no-cache-dir"', INSTALLER)
        self.assertIn('"--pre"', INSTALLER)
        self.assertIn("0377f0c1b34e3ff313d41edad1bd79c2ed8bb5ec", INSTALLER)
        self.assertIn("5de7a54aa4e5e2baadb0182dde554908b48b85c2", INSTALLER)


if __name__ == "__main__":
    unittest.main()
