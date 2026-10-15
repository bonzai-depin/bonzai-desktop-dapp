import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src/server"))
from wan_validation import validate_wan_frames, validate_wan_latents


class WanValidationTests(unittest.TestCase):
    def test_valid_frames_are_preserved(self):
        frames = np.zeros((5, 8, 8, 3), dtype=np.float32)
        self.assertIs(validate_wan_frames(frames), frames)

    def test_corruption_is_rejected_not_silently_blackened(self):
        for invalid in [float("nan"), float("inf"), -float("inf")]:
            frames = np.zeros((5, 8, 8, 3), dtype=np.float32)
            frames[2, 0, 0, 0] = invalid
            with self.assertRaisesRegex(RuntimeError, "1/5 frames"):
                validate_wan_frames(frames)

    def test_empty_or_malformed_frames_fail(self):
        for frames in [[], np.zeros((2, 8, 8))]:
            with self.assertRaisesRegex(RuntimeError, "malformed"):
                validate_wan_frames(frames)

    def test_denoising_stops_at_first_invalid_step(self):
        import torch
        payload = {"latents": torch.zeros(2)}
        self.assertIs(validate_wan_latents(None, 0, None, payload), payload)
        with self.assertRaisesRegex(RuntimeError, "step 2"):
            validate_wan_latents(None, 1, None, {"latents": torch.tensor([float("nan")])})


if __name__ == "__main__":
    unittest.main()
