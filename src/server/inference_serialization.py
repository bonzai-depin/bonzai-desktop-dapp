"""Serialize device inference and unloading across Flask request threads."""
import threading
import time
import uuid
from collections import deque
from urllib.error import HTTPError, URLError
from flask import request, g, jsonify
from inference_coordinator import device_lease

_PATHS = {
    "/image/standard", "/image/quality", "/image/advanced", "/image/turbo",
    "/image/image/turbo", "/image/qwen-2.1", "/image/sdxl", "/image/image/standard", "/image/experimental/klein-9b",
    "/audio/turbo", "/audio/quality/design", "/audio/quality/clone",
    "/audio/quality/persona", "/audio/music",
    "/video", "/video/sota", "/video/quality", "/video/test", "/video/enhance",
    "/vision/analyze", "/vision/ocr", "/vision/caption", "/vision/unload",
    "/forecast", "/workflows/finger-frame/analyze", "/workflows/finger-frame/composite",
    "/vision/ocr/unload", "/vision/caption/unload", "/memory/clear",
}

class FairDeviceLock:
    """FIFO also when the media server is used without Electron's broker."""
    def __init__(self):
        self.condition = threading.Condition()
        self.waiting = deque()
        self.busy = False

    def acquire(self, blocking=True):
        with self.condition:
            if not blocking:
                if self.busy or self.waiting:
                    return False
                self.busy = True
                return True
            ticket = object()
            self.waiting.append(ticket)
            try:
                self.condition.wait_for(lambda: not self.busy and self.waiting[0] is ticket)
                self.waiting.popleft()
                self.busy = True
                return True
            except BaseException:
                self.waiting.remove(ticket)
                self.condition.notify_all()
                raise

    def release(self):
        with self.condition:
            self.busy = False
            self.condition.notify_all()

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, *_args):
        self.release()


def install_inference_serialization(app, on_acquired=None, on_queue=None):
    lock = FairDeviceLock()
    queued = {}
    queue_lock = threading.Lock()
    def snapshot():
        with queue_lock:
            return list(queued.values())
    app.extensions['bonzai_inference_queue'] = snapshot

    def publish(job_id, path, stage, background=False):
        event = {'id': job_id, 'path': path, 'stage': stage, 'background': background}
        with queue_lock:
            if stage == 'queued' or (background and stage == 'running'):
                queued[event['id']] = event
            else:
                queued.pop(event['id'], None)
        if on_queue is not None:
            try:
                on_queue(event)
            except Exception:
                # Progress transport must never strand the device lock.
                app.logger.exception('Could not publish inference queue status')

    def report(stage):
        if g.get('bonzai_queue_id'):
            publish(g.bonzai_queue_id, request.path, stage)

    @app.before_request
    def acquire_device():
        if request.method == "POST" and request.path in _PATHS:
            g.bonzai_request_started = time.perf_counter()
            body = request.get_json(silent=True)
            benchmark = isinstance(body, dict) and body.get('_benchmark') is True
            if request.path != "/memory/clear":
                g.bonzai_queue_id = uuid.uuid4().hex
                report('queued')
                lease = device_lease(benchmark=benchmark)
                try:
                    lease.__enter__()
                except HTTPError as error:
                    if error.code == 409:
                        return jsonify({'error': 'Local inference is busy'}), 409
                    return jsonify({'error': 'The inference queue is unavailable. Please try again.'}), 503
                except (URLError, OSError):
                    return jsonify({'error': 'The inference queue is unavailable. Please try again.'}), 503
                g.bonzai_external_lease = lease
            if benchmark:
                if not lock.acquire(blocking=False):
                    return jsonify({'error': 'Local inference is busy'}), 409
            else:
                lock.acquire()
            g.bonzai_device_lock = True
            g.bonzai_execution_started = time.perf_counter()
            if on_acquired is not None and request.path != "/memory/clear":
                on_acquired(request.path)
            report("running")

    @app.after_request
    def measure_request(response):
        started = g.get("bonzai_request_started")
        if started is None:
            return response
        finished = time.perf_counter()
        execution = g.get("bonzai_execution_started", started)
        timing = {
            "elapsed_ms": round((finished - started) * 1000),
            "queue_ms": round((execution - started) * 1000),
            "execution_ms": round((finished - execution) * 1000),
        }
        response.headers["Server-Timing"] = (
            f"queue;dur={timing['queue_ms']}, inference;dur={timing['execution_ms']}"
        )
        if response.is_json:
            payload = response.get_json(silent=True)
            if isinstance(payload, dict):
                payload.update(timing)
                response.set_data(app.json.dumps(payload))
        return response

    @app.teardown_request
    def release_device(_error):
        report("finished")
        if g.pop("bonzai_device_lock", False):
            lock.release()
        lease = g.pop("bonzai_external_lease", None)
        if lease is not None:
            lease.__exit__(None, None, None)

    def run_background(task, path):
        """Hold the device for the worker lifetime, not its HTTP 202 response."""
        job_id = uuid.uuid4().hex
        publish(job_id, path, 'queued', background=True)
        status = 'completed'
        try:
            with device_lease(), lock:
                if on_acquired is not None:
                    on_acquired(path)
                publish(job_id, path, 'running', background=True)
                result = task()
                if result is False:
                    status = 'failed'
                return result
        except BaseException:
            status = 'failed'
            raise
        finally:
            publish(job_id, path, status, background=True)

    return run_background
