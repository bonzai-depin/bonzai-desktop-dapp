import sys
import threading
import time
import unittest
from contextlib import contextmanager
from unittest.mock import patch
from pathlib import Path
from flask import Flask
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src/server"))
from inference_serialization import install_inference_serialization

class InferenceSerializationTests(unittest.TestCase):
    def test_qwen_alias_uses_the_same_device_lease_as_turbo(self):
        app = Flask(__name__)
        install_inference_serialization(app)
        app.add_url_rule('/image/qwen-2.1', 'qwen', lambda: {'ok': True}, methods=['POST'])
        with patch('inference_serialization.device_lease') as lease, app.test_client() as client:
            self.assertEqual(client.post('/image/qwen-2.1').status_code, 200)
            lease.assert_called_once()

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

    def test_benchmark_does_not_queue_behind_or_cancel_user_work(self):
        app = Flask(__name__)
        install_inference_serialization(app)
        entered, release = threading.Event(), threading.Event()
        @app.post('/image/turbo')
        def image():
            entered.set()
            release.wait(3)
            return {}
        def work():
            with app.test_client() as client:
                client.post('/image/turbo')
        worker = threading.Thread(target=work)
        worker.start()
        self.assertTrue(entered.wait(1))
        try:
            with app.test_client() as client:
                self.assertEqual(client.post('/image/turbo',json={'_benchmark':True}).status_code,409)
            self.assertTrue(worker.is_alive())
        finally:
            release.set()
            worker.join(2)

    def test_background_training_holds_device_until_finished_and_releases_on_failure(self):
        app = Flask(__name__)
        run_background = install_inference_serialization(app)
        entered, release = threading.Event(), threading.Event()
        @app.post('/image/turbo')
        def image():
            return {}
        def train():
            entered.set()
            release.wait(3)
        worker = threading.Thread(target=lambda: run_background(train, '/training/start'))
        worker.start()
        self.assertTrue(entered.wait(1))
        try:
            with app.test_client() as client:
                self.assertEqual(client.post('/image/turbo', json={'_benchmark': True}).status_code, 409)
        finally:
            release.set()
            worker.join(2)
        with self.assertRaises(ValueError):
            run_background(lambda: (_ for _ in ()).throw(ValueError('training failed')), '/training/start')
        with app.test_client() as client:
            self.assertEqual(client.post('/image/turbo', json={'_benchmark': True}).status_code, 200)

    def test_native_handoff_can_clear_caches_before_media_acquires_python_lock(self):
        app = Flask(__name__)
        install_inference_serialization(app)
        events = []
        @app.post('/memory/clear')
        def clear():
            events.append('clear')
            return {}
        @app.post('/image/turbo')
        def image():
            events.append('image')
            return {}
        @contextmanager
        def broker(**kwargs):
            # Electron asks Python to clear caches during handoff. The pending
            # image must not already own the Python mutex or this deadlocks.
            with app.test_client() as client:
                self.assertEqual(client.post('/memory/clear').status_code, 200)
            events.append('lease')
            try:
                yield
            finally:
                events.append('release')
        with patch('inference_serialization.device_lease', broker):
            with app.test_client() as client:
                self.assertEqual(client.post('/image/turbo').status_code, 200)
        self.assertEqual(events, ['clear', 'lease', 'image', 'release'])

    def test_queue_announces_wait_before_loading_and_finishes_after_failure(self):
        app = Flask(__name__)
        events = []
        install_inference_serialization(app, on_acquired=lambda path: events.append('load'),
            on_queue=lambda event: events.append(event['stage']))
        @app.post('/audio/music')
        def music():
            events.append('inference')
            return {'error': 'Not enough free memory'}, 503
        with app.test_client() as client:
            self.assertEqual(client.post('/audio/music').status_code, 503)
        self.assertEqual(events, ['queued', 'load', 'running', 'inference', 'finished'])

    def test_progress_transport_failure_never_strands_the_device(self):
        app = Flask(__name__)
        def fail(_event):
            raise RuntimeError('socket disconnected')
        install_inference_serialization(app, on_queue=fail)
        @app.post('/audio/music')
        def music():
            return {'ok': True}
        with patch.object(app.logger, 'exception'), app.test_client() as client:
            self.assertEqual(client.post('/audio/music').status_code, 200)
            self.assertEqual(client.post('/audio/music').status_code, 200)
        self.assertEqual(app.extensions['bonzai_inference_queue'](), [])

    def test_standalone_queue_is_fifo(self):
        from inference_serialization import FairDeviceLock
        lock = FairDeviceLock()
        lock.acquire()
        order = []
        def worker(index):
            with lock:
                order.append(index)
        workers = []
        for index in range(3):
            thread = threading.Thread(target=worker, args=(index,))
            workers.append(thread)
            thread.start()
            deadline = time.monotonic() + 2
            while len(lock.waiting) < index + 1 and time.monotonic() < deadline:
                time.sleep(.001)
            self.assertEqual(len(lock.waiting), index + 1)
        lock.release()
        for thread in workers:
            thread.join(2)
        self.assertEqual(order, [0, 1, 2])

    def test_training_queue_is_visible_before_acquisition_and_on_reconnect(self):
        app = Flask(__name__)
        events = []
        run = install_inference_serialization(app, on_queue=lambda event: events.append(event.copy()))
        def train():
            snapshot = app.extensions['bonzai_inference_queue']()
            self.assertEqual(len(snapshot), 1)
            self.assertEqual(snapshot[0]['stage'], 'running')
            self.assertTrue(snapshot[0]['background'])
            raise ValueError('failed')
        with self.assertRaises(ValueError):
            run(train, '/training/start')
        self.assertEqual([e['stage'] for e in events], ['queued', 'running', 'failed'])
        self.assertEqual(app.extensions['bonzai_inference_queue'](), [])

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
