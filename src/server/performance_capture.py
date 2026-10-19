"""Opt-in, content-free request measurements shared with Electron's local journal.
No dependency on torch; never fails a generation if storage is unavailable.
"""
import json
import os
import platform
import time
import uuid
from pathlib import Path
from flask import g, request

PARAMETERS = ('width', 'height', 'steps', 'steps_base', 'steps_refiner', 'seed', 'fps', 'duration', 'num_frames', 'guidance_scale', 'cfg', 'temperature', 'max_tokens', 'batch_size', 'resolution', 'strength', 'lora_strength')
EXCLUDED = ('/unload', '/info', '/voices', '/history', '/cancel')


def measured_path(path):
    return (path == '/forecast' or path == '/video' or path.startswith(('/image/', '/audio/', '/video/', '/vision/', '/workflows/finger-frame/'))) and not path.endswith(EXCLUDED)


def numeric_fields(value):
    import math
    return {key: value[key] for key in PARAMETERS if type(value.get(key)) in (int, float) and math.isfinite(value[key])}


def write_atomic(file, value):
    temp = file.with_name(file.name + '.' + str(uuid.uuid4()) + '.tmp')
    with open(temp, 'x', encoding='utf-8') as stream:
        os.chmod(temp, 0o600)
        json.dump(value, stream, allow_nan=False)
    os.replace(temp, file)


def install_performance_capture(app, directory=None, runtime=None):
    directory = directory or os.environ.get('BONZAI_BENCHMARK_DIR')
    if not directory:
        return
    root = Path(directory)

    @app.before_request
    def begin_measurement():
        if request.method != 'POST' or request.url_rule is None or not measured_path(request.url_rule.rule):
            return
        try:
            active = json.loads((root / 'active.json').read_text())
            session_id = str(uuid.UUID(active['id']))
            suite_file = root / 'suite.json'
            if suite_file.exists():
                suite = json.loads(suite_file.read_text())
                body = request.get_json(silent=True)
                if not isinstance(body, dict) or body.get('_benchmark') is not True:
                    write_atomic(root / str(uuid.UUID(suite['id'])) / ('interference-' + str(uuid.uuid4()) + '.json'),
                                 {'pipeline': request.url_rule.rule})
            if 'pipelines' in active and request.url_rule.rule not in active['pipelines']:
                return
            data = request.get_json(silent=True) or {}
            if not isinstance(data, dict):
                data = {}
            sample_id = str(uuid.uuid4())
            sample = {'id': sample_id, 'pipeline': request.url_rule.rule, 'source': 'local',
                      'startedAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
                      'status': 'running', 'parameters': numeric_fields(data),
                      'quality': 'not-assessed', 'runtime': {'python': platform.python_version(), **(runtime() if runtime else {})}}
            file = root / session_id / ('sample-' + sample_id + '.json')
            write_atomic(file, sample)
            g.benchmark = (file, sample, time.perf_counter())
        except (OSError, ValueError, KeyError, TypeError):
            pass

    @app.after_request
    def finish_measurement(response):
        pending = g.pop('benchmark', None)
        if pending is None:
            return response
        try:
            file, sample, started = pending
            payload = response.get_json(silent=True) if response.is_json else None
            payload = payload if isinstance(payload, dict) else {}
            status = 'failed' if response.status_code >= 400 or payload.get('error') else 'completed'
            if response.status_code == 202:
                status = 'accepted'  # Async acceptance is NOT completion.
            metrics = {'elapsedMs': round((time.perf_counter() - started) * 1000)}
            for source, target in [('queue_ms', 'queueMs'), ('execution_ms', 'executionMs')]:
                if type(payload.get(source)) in (int, float):
                    metrics[target] = payload[source]
            sample.update(status=status, httpStatus=response.status_code, metrics=metrics,
                          finishedAt=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat())
            # Requested parameters remain separate from reported output metadata.
            sample['output'] = numeric_fields(payload)
            write_atomic(file, sample)
        except (OSError, ValueError, TypeError):
            pass
        return response

    @app.teardown_request
    def failed_measurement(error):
        pending = g.pop('benchmark', None)
        if pending:
            try:
                file, sample, started = pending
                sample.update(status='failed', metrics={'elapsedMs': round((time.perf_counter() - started) * 1000)})
                write_atomic(file, sample)
            except (OSError, ValueError):
                pass
