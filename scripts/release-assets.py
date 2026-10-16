#!/usr/bin/env python3
"""Prepare bounded GitHub release assets without removing runtime functionality."""
import argparse
import hashlib
from pathlib import Path
import subprocess

LIMIT = 1_900_000_000  # below GitHub's strict 2 GiB per-asset limit


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def prepare(folder, limit=LIMIT):
    """Keep installers intact. Hosting limits must never become user chores."""
    folder = Path(folder)
    inputs = sorted(p for p in folder.iterdir() if p.suffix in {'.deb', '.dmg', '.exe'})
    if not inputs:
        raise ValueError('No complete release installers found')
    if list(folder.glob('*.bin')) or list(folder.glob('*.part-*')):
        raise ValueError('Split installers are not distributable; rebuild as a single installer')
    for path in inputs:
        checksum = digest(path)
        path.with_name(path.name + '.SHA256SUMS').write_text(f'{checksum}  {path.name}\n', encoding='utf-8')
        print(f'Prepared complete installer {path.name}: {path.stat().st_size:,} bytes; SHA256 {checksum}')


def upload(folder, tag, repo):
    import os
    import json
    import urllib.parse
    import urllib.request
    required = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_PUBLIC_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
    if any(not os.environ.get(key) for key in required):
        raise ValueError('Configure R2 installer hosting before publishing: ' + ', '.join(required))
    endpoint, bucket, public = (os.environ[key] for key in required[:3])
    if not endpoint.startswith('https://') or not public.startswith('https://'):
        raise ValueError('Release hosting requires HTTPS')
    base = ['gh', 'release']
    if subprocess.run(base + ['view', tag, '--repo', repo], stdout=subprocess.DEVNULL).returncode:
        # Concurrent platform jobs may both attempt creation; recheck on conflict.
        result = subprocess.run(base + ['create', tag, '--repo', repo, '--title', f'BonzAI {tag}', '--notes', 'BonzAI desktop installers.'])
        if result.returncode:
            subprocess.run(base + ['view', tag, '--repo', repo], check=True)
    folder = Path(folder)
    files = sorted(p for p in folder.iterdir() if p.suffix in {'.dmg', '.exe', '.deb'})
    if not files:
        raise ValueError('No complete installers to upload')
    links = []
    for path in files:
        key = f'releases/{tag}/{path.name}'
        url = public.rstrip('/') + '/' + urllib.parse.quote(key, safe='/')
        # Multipart transfer supports complete GPU installers larger than GitHub allows.
        subprocess.run(['aws', 's3', 'cp', str(path), f's3://{bucket}/{key}',
                        '--endpoint-url', endpoint, '--only-show-errors',
                        '--content-type', 'application/octet-stream',
                        '--content-disposition', f'attachment; filename="{path.name}"'], check=True)
        request = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'BonzAI-Release-Check/4.0'})
        with urllib.request.urlopen(request, timeout=60) as response:
            if int(response.headers.get('Content-Length', -1)) != path.stat().st_size:
                raise ValueError(f'Public installer size check failed: {path.name}')
        links.append({'name': path.name, 'url': url, 'size': path.stat().st_size, 'sha256': digest(path)})
        subprocess.run(base + ['upload', tag, str(path.with_name(path.name + '.SHA256SUMS')), '--repo', repo, '--clobber'], check=True)
    manifest = folder / (files[0].name + '.download.json')
    manifest.write_text(json.dumps(links, indent=2) + '\n', encoding='utf-8')
    subprocess.run(base + ['upload', tag, str(manifest), '--repo', repo, '--clobber'], check=True)
    # Rebuild links from all platform manifests, so later jobs preserve earlier downloads.
    import tempfile
    with tempfile.TemporaryDirectory() as temp:
        subprocess.run(base + ['download', tag, '--repo', repo, '--pattern', '*.download.json', '--dir', temp], check=True)
        all_links = {item['name']: item for file in Path(temp).glob('*.download.json') for item in json.loads(file.read_text())}
        current = json.loads(subprocess.check_output(base + ['view', tag, '--repo', repo, '--json', 'body'], text=True))['body'] or ''
        marker = '<!-- bonzai-installers -->'
        notes = current.split(marker)[0].rstrip() + '\n\n' + marker + '\n## Install BonzAI\n\nDownload one installer for your system, open it, and follow the installation steps.\n\n'
        notes += '\n'.join(f"- [{item['name']}]({item['url']})" for item in sorted(all_links.values(), key=lambda item: item['name'])) + '\n'
        notes_file = Path(temp) / 'notes.md'
        notes_file.write_text(notes, encoding='utf-8')
        subprocess.run(base + ['edit', tag, '--repo', repo, '--notes-file', str(notes_file)], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'upload'])
    parser.add_argument('folder', type=Path)
    parser.add_argument('--tag')
    parser.add_argument('--repo')
    args = parser.parse_args()
    if args.action == 'prepare':
        prepare(args.folder)
    else:
        if not args.tag or not args.repo:
            parser.error('upload requires --tag and --repo')
        upload(args.folder, args.tag, args.repo)
