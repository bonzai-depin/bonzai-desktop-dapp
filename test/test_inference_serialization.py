import sys
import threading
import time
import unittest
from unittest.mock import patch
from pathlib import Path
from flask import Flask
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src/server"))
from inference_serialization import install_inference_serialization

class InferenceSerializationTests(unittest.TestCase):
    def test_request_timing_preserves_media_duration_and_reports_failures(self):
        app = Flask(__name__)
        install_inference_serialization(app)
        @app.post('/video/sota')
        def video():
            return {'duration': 5.166, 'video_path': '/local/video.mp4'}
        @app.post('/image/turbo')
        def fail_json():
            return {'error': 'invalid latents'}, 500
        with app.test_client() as client:
            for path in ['/video/sota', '/image/turbo']:
                with patch('inference_serialization.time.perf_counter', side_effect=[10., 12., 17.]):
                    result = client.post(path)
                data = result.get_json()
                self.assertEqual(data['elapsed_ms'], 7000)
                self.assertEqual(data['queue_ms'], 2000)
                self.assertEqual(data['execution_ms'], 5000)
                self.assertIn('inference;dur=5000', result.headers['Server-Timing'])
                if path == '/video/sota':
                    self.assertEqual(data['duration'], 5.166)
                else:
                    self.assertEqual(result.status_code, 500)

    def test_voice_and_unloading_wait_for_image_but_health_remains_available(self):
        app = Flask(__name__)
        install_inference_serialization(app)
        entered = threading.Event()
        release = threading.Event()
        order = []
        @app.post("/image/turbo")
        def image():
            order.append("image")
            entered.set()
            release.wait(3)
            order.append("image done")
            return {}
        @app.post("/audio/quality/persona")
        def audio():
            order.append("audio")
            return {}
        @app.get("/health")
        def health():
            return {}
        def post(path):
            with app.test_client() as client:
                client.post(path)
        first = threading.Thread(target=post, args=("/image/turbo",))
        second = threading.Thread(target=post, args=("/audio/quality/persona",))
        first.start()
        self.assertTrue(entered.wait(1))
        second.start()
        with app.test_client() as client:
            self.assertEqual(client.get("/health").status_code, 200)
        time.sleep(.05)
        self.assertEqual(order, ["image"])
        release.set()
        first.join(2); second.join(2)
        self.assertEqual(order, ["image", "image done", "audio"])

    def test_failed_inference_releases_device_for_next_request(self):
        app = Flask(__name__)
        install_inference_serialization(app)
        @app.post("/image/turbo")
        def fail():
            raise ValueError("generation failed")
        @app.post("/memory/clear")
        def clear():
            return {}
        with app.test_client() as client:
            self.assertEqual(client.post("/image/turbo").status_code, 500)
            self.assertEqual(client.post("/memory/clear").status_code, 200)

if __name__ == "__main__":
    unittest.main()
