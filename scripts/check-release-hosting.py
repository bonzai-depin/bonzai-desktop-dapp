#!/usr/bin/env python3
"""Verify R2 write, public read, integrity and cleanup without uploading user data."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.parse
import urllib.request
import uuid

required = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_PUBLIC_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
missing = [key for key in required if not os.environ.get(key)]
if missing:
    raise SystemExit('Missing hosting settings: ' + ', '.join(missing))
endpoint, bucket, public = (os.environ[key].rstrip('/') for key in required[:3])
if not endpoint.startswith('https://') or not public.startswith('https://'):
    raise SystemExit('Hosting endpoint and public URL must use HTTPS')
key = f'releases/_checks/{uuid.uuid4()}.txt'
url = public + '/' + urllib.parse.quote(key, safe='/')
# Exceed the AWS CLI multipart threshold to exercise real installer transfers.
content = bytes(range(256)) * (9 * 1024 * 4)
with tempfile.TemporaryDirectory() as temp:
    path = Path(temp) / 'hosting-check.txt'
    path.write_bytes(content)
    target = f's3://{bucket}/{key}'
    try:
        subprocess.run(['aws', 's3', 'cp', str(path), target, '--endpoint-url', endpoint, '--only-show-errors', '--content-type', 'text/plain', '--cache-control', 'no-store'], check=True)
        request = urllib.request.Request(url, headers={'User-Agent': 'BonzAI-Release-Check/4.0'})
        with urllib.request.urlopen(request, timeout=60) as response:
            received = response.read(len(content) + 1)
        if received != content:
            raise RuntimeError('Public download contents do not match uploaded bytes')
        print('PASS: 9 MiB multipart upload, public HTTPS download and SHA-256 integrity')
        print('SHA-256: ' + hashlib.sha256(received).hexdigest())
    finally:
        subprocess.run(['aws', 's3', 'rm', target, '--endpoint-url', endpoint, '--only-show-errors'], check=True)
        print('Temporary test object removed.')
