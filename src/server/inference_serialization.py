"""Serialize device inference and unloading across Flask request threads."""
import threading
import time
from urllib.error import HTTPError
from flask import request, g, jsonify
from inference_coordinator import device_lease

_PATHS = {
    "/image/standard", "/image/quality", "/image/advanced", "/image/turbo",
    "/image/image/turbo", "/image/experimental/klein-9b",
    "/audio/turbo", "/audio/quality/design", "/audio/quality/clone",
    "/audio/quality/persona", "/audio/music",
    "/video", "/video/sota", "/video/quality", "/video/test", "/video/enhance",
    "/vision/analyze", "/vision/ocr", "/vision/caption", "/vision/unload",
    "/forecast",
    "/vision/ocr/unload", "/vision/caption/unload", "/memory/clear",
}

def install_inference_serialization(app, on_acquired=None):
    lock = threading.Lock()

    @app.before_request
    def acquire_device():
        if request.method == "POST" and request.path in _PATHS:
            g.bonzai_request_started = time.perf_counter()
            body = request.get_json(silent=True)
            benchmark = isinstance(body, dict) and body.get('_benchmark') is True
            if request.path != "/memory/clear":
                lease = device_lease(benchmark=benchmark)
                try:
                    lease.__enter__()
                except HTTPError as error:
                    if error.code == 409:
                        return jsonify({'error': 'Local inference is busy'}), 409
                    raise
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
        if g.pop("bonzai_device_lock", False):
            lock.release()
        lease = g.pop("bonzai_external_lease", None)
        if lease is not None:
            lease.__exit__(None, None, None)

    def run_background(task, path):
        """Hold the device for the worker lifetime, not its HTTP 202 response."""
        with device_lease(background=True), lock:
            if on_acquired is not None:
                on_acquired(path)
            return task()

    return run_background
