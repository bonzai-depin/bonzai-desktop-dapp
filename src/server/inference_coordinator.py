"""A socket-held lease shared with Electron's LLM and workflow runtimes."""
import os
import urllib.request
from contextlib import contextmanager

@contextmanager
def device_lease(benchmark=False, background=False):
    url = os.environ.get('BONZAI_INFERENCE_COORDINATOR_URL')
    token = os.environ.get('BONZAI_INFERENCE_COORDINATOR_TOKEN')
    if not url or not token:
        # Standalone Python keeps its existing in-process serialization.
        yield
        return
    req = urllib.request.Request(url + '/lease', headers={'Authorization': 'Bearer ' + token, 'X-Bonzai-Benchmark': '1' if benchmark else '0', 'X-Bonzai-Background': '1' if background else '0'})
    # A failed configured coordinator must never silently run concurrently.
    response = urllib.request.urlopen(req, timeout=None)
    try:
        if response.read(1) != b'1':
            raise RuntimeError('Local inference coordinator refused the lease')
        yield
    finally:
        response.close()
