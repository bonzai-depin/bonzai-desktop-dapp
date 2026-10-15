"""Exercise the production tracker without importing GPU/model services."""
import ast
import hashlib
import threading
import time
import unittest
from pathlib import Path
from typing import Dict, Any, Optional
from unittest.mock import patch


class GenerationTimingTests(unittest.TestCase):
    def test_success_failure_events_and_snapshot_retain_monotonic_elapsed(self):
        source = (Path(__file__).parents[1] / 'src/server/diffuser.py').read_text()
        tracker = next(n for n in ast.parse(source).body if isinstance(n, ast.ClassDef) and n.name == 'GenerationTracker')
        events = []
        scope = dict(threading=threading, time=time, hashlib=hashlib, Dict=Dict, Any=Any, Optional=Optional,
                     socket_emit=lambda name, data, namespace: events.append((name, data)))
        exec(compile(ast.Module(body=[tracker], type_ignores=[]), '<tracker>', 'exec'), scope)
        jobs = scope['GenerationTracker']()
        with patch.object(time, 'perf_counter', side_effect=[10, 15, 20, 28]):
            jobs.new('video', gen_id='success')
            jobs.finish('success', {'video_path': '/local/output.mp4'})
            jobs.new('video', gen_id='failure')
            jobs.error('failure', 'invalid latents')
        finished = next(data for name, data in events if name == 'gen_finished')
        failed = next(data for name, data in events if name == 'gen_error')
        self.assertEqual(finished['payload']['elapsed_ms'], 5000)
        self.assertEqual(failed['elapsed_ms'], 8000)
        self.assertEqual([job['elapsed_ms'] for job in jobs.snapshot()['operations']], [5000, 8000])
        self.assertEqual(jobs._started, {})
