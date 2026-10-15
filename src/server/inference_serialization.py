"""Serialize device inference and unloading across Flask request threads."""
import threading
import time
from flask import request, g

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
