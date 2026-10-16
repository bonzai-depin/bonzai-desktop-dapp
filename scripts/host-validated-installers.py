#!/usr/bin/env python3
"""Promote successful CI installer artifacts to immutable R2 test-build paths."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024**2), b''):
            h.update(block)
    return h.hexdigest()


def checkout_revision(logs):
    # actions/checkout logs /usr/bin/git on Unix and a quoted git.exe on Windows.
    revisions = re.findall(
        r'\bgit(?:\.exe)?"? log -1 --format=%H[^\r\n]*\r?\n'
        r'[^\r\n]*?\b([a-f0-9]{40})[ \t]*\r?(?:\n|$)', logs)
    if not revisions or len(set(revisions)) != 1:
        raise ValueError('Cannot establish a single checked-out build revision')
    return revisions[0]


def main():
    import boto3
    repo = os.environ['GITHUB_REPOSITORY']
    run_id = os.environ['SOURCE_RUN']
    if not run_id.isdigit():
        raise ValueError('Source run must be numeric')
    run = json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}/actions/runs/{run_id}']))
    deadline = time.monotonic() + 3 * 3600
    while run.get('status') in ('queued', 'in_progress', 'waiting', 'requested', 'pending'):
        if time.monotonic() > deadline:
            raise TimeoutError('Source build did not finish within three hours')
        print('Waiting for source build ' + run_id, flush=True)
        time.sleep(60)
        run = json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}/actions/runs/{run_id}']))
    if run['conclusion'] != 'success' or run['event'] not in ('workflow_dispatch', 'release'):
        raise ValueError('Only successful manually dispatched/release builds may be hosted')
    if run['name'] not in ('Release (macOS)', 'Release (Linux)', 'Release (Windows)'):
        raise ValueError('Not a desktop build workflow')
    # workflow_dispatch may check out a ref different from the workflow revision.
    logs = subprocess.check_output(['gh', 'run', 'view', run_id, '--repo', repo, '--log'], text=True)
    sha = checkout_revision(logs)
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('Invalid source revision')
    artifacts = json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}/actions/runs/{run_id}/artifacts']))['artifacts']
    if not artifacts or any(a['expired'] for a in artifacts):
        raise ValueError('Missing or expired build artifacts')
    s3 = boto3.client('s3', endpoint_url=os.environ['R2_ENDPOINT'], region_name='auto')
    bucket = os.environ['R2_BUCKET']
    public = os.environ['R2_PUBLIC_URL'].rstrip('/')
    if not public.startswith('https://'):
        raise ValueError('Public hosting must use HTTPS')
    rows = []
    for artifact in artifacts:
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run(['gh', 'run', 'download', run_id, '--repo', repo, '--name', artifact['name'], '--dir', temp], check=True)
            folder = Path(temp)
            if list(folder.rglob('*.bin')) or list(folder.rglob('*.part-*')):
                raise ValueError('Split installers are not permitted')
            installers = [p for p in folder.rglob('*') if p.suffix in ('.dmg', '.exe', '.deb')]
            if not installers:
                raise ValueError('Artifact has no installer')
            for path in installers:
                digest = sha256(path)
                recorded = path.with_name(path.name + '.SHA256SUMS').read_text().strip()
                if recorded != f'{digest}  {path.name}':
                    raise ValueError('Build checksum mismatch: ' + path.name)
                key = f'releases/test-builds/{sha}/{path.name}'
                params = {'Bucket': bucket, 'Key': key}
                try:
                    existing = s3.head_object(**params)
                except s3.exceptions.ClientError as error:
                    if error.response['ResponseMetadata']['HTTPStatusCode'] != 404:
                        raise
                    s3.upload_file(str(path), bucket, key, ExtraArgs={
                        'ContentType': 'application/octet-stream',
                        'ContentDisposition': f'attachment; filename="{path.name}"',
                        'Metadata': {'sha256': digest, 'source-run': run_id, 'source-sha': sha},
                    })
                else:
                    if existing.get('Metadata', {}).get('sha256') != digest or existing['ContentLength'] != path.stat().st_size:
                        raise ValueError('Refusing to overwrite a different installer')
                url = public + '/' + urllib.parse.quote(key, safe='/')
                request = urllib.request.Request(url, headers={'User-Agent': 'BonzAI-Release-Check/4.0'})
                h = hashlib.sha256()
                size = 0
                with urllib.request.urlopen(request, timeout=120) as response:
                    while block := response.read(8 * 1024**2):
                        h.update(block)
                        size += len(block)
                if h.hexdigest() != digest or size != path.stat().st_size:
                    raise ValueError('Public download integrity failure: ' + path.name)
                s3.put_object(Bucket=bucket, Key=key + '.SHA256SUMS', Body=(recorded + '\n').encode(), ContentType='text/plain')
                rows.append({'name': path.name, 'url': url, 'bytes': size, 'sha256': digest, 'source_run': run_id, 'source_sha': sha,
                             'signing': 'unsigned test build; macOS not notarized'})
                print('Verified public installer: ' + url, flush=True)
    manifest = json.dumps(rows, indent=2) + '\n'
    s3.put_object(Bucket=bucket, Key=f'releases/test-builds/{sha}/run-{run_id}.json', Body=manifest.encode(), ContentType='application/json')
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
        summary.write('## Verified test installers\n\nUnsigned test builds; macOS is not notarized.\n\n')
        for row in rows:
            summary.write(f"- [{row['name']}]({row['url']}) — {row['bytes']:,} bytes; SHA-256 `{row['sha256']}`\n")


if __name__ == '__main__':
    main()
