import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "src/server"))
from meditation_timing import narration_timeline


class MeditationTimingTests(unittest.TestCase):
    def test_short_and_long_sessions_distribute_breaths_and_finish_on_time(self):
        for target, count, spoken in [(30, 3, 20), (180, 10, 110), (900, 40, 600)]:
            lengths = [round(spoken / count * 24000)] * count
            timing = narration_timeline(lengths, ["Breathe calmly."] * count, 24000, target)
            self.assertAlmostEqual(timing["duration_seconds"], target, places=4)
            self.assertEqual(sum(timing["before_samples"]) + sum(lengths) + timing["tail_samples"], target * 24000)
            self.assertGreater(timing["before_samples"][1], 0)

    def test_long_speech_is_never_cut_or_sped_up(self):
        timing = narration_timeline([20 * 24000, 15 * 24000], ["Opening.", "Complete ending."], 24000, 30)
        self.assertAlmostEqual(timing["duration_seconds"], 36.6)
        self.assertEqual(timing["narration_seconds"], 35)
        self.assertEqual(timing["caption_segments"][-1]["text"], "Complete ending.")

    def test_tiny_fallback_cannot_masquerade_as_fifteen_minute_session(self):
        with self.assertRaisesRegex(ValueError, "too short"):
            narration_timeline([20 * 24000] * 3, ["A."] * 3, 24000, 900)

    def test_regular_tts_has_no_extra_silence(self):
        timing = narration_timeline([24000, 12000], ["A.", "B."], 24000)
        self.assertEqual(timing["duration_seconds"], 1.5)
        self.assertEqual(timing["before_samples"], [0, 0])
        self.assertEqual(timing["tail_samples"], 0)

    def test_invalid_timings_rejected(self):
        for duration in [float('nan'), float('inf'), 1, 10000]:
            with self.assertRaises(ValueError):
                narration_timeline([24000], ['A.'], 24000, duration)


if __name__ == '__main__':
    unittest.main()
