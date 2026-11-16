"""Exercise the tracker without loading ML models or starting the server."""
import ast
import hashlib
from pathlib import Path
import sys
import threading
import time
import traceback
from typing import Any, Dict, Optional
import unittest


class ActivityDiagnosticsTest(unittest.TestCase):
    def test_snapshot_keeps_prompt_and_traceback_but_not_credentials_or_media(self):
        source = Path('src/server/diffuser.py').read_text()
        tree = ast.parse(source)
        tracker = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'GenerationTracker')
        events = []
        class Request:
            def get_json(self, silent=True):
                return {'prompt': 'Full creative brief', 'steps': 25, 'api_key': 'secret', 'image_base64': 'private media'}
        namespace = dict(globals(), request=Request(), has_request_context=lambda: True,
                         socket_emit=lambda event, data, channel: events.append((event, data)))
        exec(compile(ast.Module(body=[tracker], type_ignores=[]), '<tracker>', 'exec'), namespace)
        bus = namespace['GenerationTracker']()
        gid = bus.new('image_standard', {'prompt': 'Full'})
        try:
            raise ValueError('Detailed numerical failure')
        except ValueError:
            bus.error(gid, 'Generation failed. Please try again.')
        record = bus.snapshot()['operations'][0]
        self.assertEqual(record['meta']['prompt'], 'Full creative brief')
        self.assertNotIn('api_key', record['meta'])
        self.assertNotIn('image_base64', record['meta'])
        self.assertIn('ValueError: Detailed numerical failure', record['debug_error'])
        self.assertEqual(record['error'], 'Generation failed. Please try again.')
        self.assertIn('Traceback', events[-1][1]['debug_error'])

if __name__ == '__main__':
    unittest.main()
