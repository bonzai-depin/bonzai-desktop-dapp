import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


SERVER_DIR = Path(__file__).resolve().parents[1] / "src" / "server"
sys.path.insert(0, str(SERVER_DIR))

from finger_frame_workflow import FingerFrameTracker, order_quad  # noqa: E402


def hand(width, height, wrist, index, thumb):
    points = [SimpleNamespace(x=wrist[0] / width, y=wrist[1] / height) for _ in range(21)]
    points[0] = SimpleNamespace(x=wrist[0] / width, y=wrist[1] / height)
    points[4] = SimpleNamespace(x=thumb[0] / width, y=thumb[1] / height)
    points[8] = SimpleNamespace(x=index[0] / width, y=index[1] / height)
    points[9] = SimpleNamespace(x=wrist[0] / width, y=(wrist[1] - 60) / height)
    return points


class FingerFrameTrackerTest(unittest.TestCase):
    def test_orders_an_unordered_rectangle(self):
        self.assertEqual(
            order_quad([(700, 500), (100, 100), (100, 500), (700, 100)]),
            [(100.0, 100.0), (700.0, 100.0), (700.0, 500.0), (100.0, 500.0)],
        )

    def test_requires_two_open_hands(self):
        tracker = FingerFrameTracker(800, 600)
        left = hand(800, 600, (180, 400), (120, 110), (130, 500))
        right = hand(800, 600, (620, 400), (680, 110), (670, 500))
        result = tracker.update([right, left])
        self.assertIsNotNone(result.quad)
        self.assertEqual(result.quad[0], (120.0, 110.0))

    def test_rejects_closed_fingers_and_holds_short_dropouts(self):
        tracker = FingerFrameTracker(800, 600)
        left = hand(800, 600, (180, 400), (120, 110), (130, 500))
        right = hand(800, 600, (620, 400), (680, 110), (670, 500))
        tracker.update([left, right])
        self.assertIsNotNone(tracker.update([]).quad)

        closed = hand(800, 600, (180, 400), (120, 110), (125, 115))
        self.assertIsNotNone(tracker.update([closed, right]).quad)
        for _ in range(13):
            result = tracker.update([])
        self.assertIsNone(result.quad)


if __name__ == "__main__":
    unittest.main()
