#!/usr/bin/env python3
"""Publish explicitly approved unsigned releases from verified hosted installers."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request

spec = importlib.util.spec_from_file_location('hosting', Path(__file__).with_name('host-validated-installers.py'))
hosting = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hosting)


def validate_manifest(rows, sha, run_id, public, expected_count, version):
    prefix = public.rstrip('/') + '/releases/'
    if not isinstance(rows, list) or len(rows) != expected_count:
        raise ValueError('Unexpected installer count')
    for row in rows:
        name = row['name']
        if (Path(name).name != name or '/' in name or '\\' in name
                or version not in name or Path(name).suffix not in {'.dmg', '.exe', '.deb'}):
            raise ValueError('Unexpected installer name or version')
        if row['source_sha'] != sha or str(row['source_run']) != str(run_id):
            raise ValueError('Installer provenance mismatch')
        if row['url'] != prefix + urllib.parse.quote(name, safe=''):
            raise ValueError('Installer URL does not match verified hosting')
        if not re.fullmatch(r'[a-f0-9]{64}', row['sha256']) or row['bytes'] <= 0:
            raise ValueError('Invalid checksum or size')
    return rows


def api(repo, suffix):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}/{suffix}']))


def main():
    repo = os.environ['GITHUB_REPOSITORY']
    tag, sha = os.environ['RELEASE_TAG'], os.environ['SOURCE_SHA']
    public = os.environ['R2_PUBLIC_URL'].rstrip('/')
    stable = os.environ.get('ALLOW_STABLE_RELEASE') == 'true'
    pattern = r'v\d+\.\d+\.\d+' if stable else r'v\d+\.\d+\.\d+-rc\.\d+'
    if not re.fullmatch(pattern, tag) or not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('A full source SHA and vX.Y.Z-rc.N tag are required')
    if os.environ.get('ALLOW_UNSIGNED_MACOS') != 'true':
        raise ValueError('Explicit unsigned macOS RC approval is required')
    if not public.startswith('https://'):
        raise ValueError('Public hosting must use HTTPS')
    package = api(repo, f'contents/package.json?ref={sha}')
    version = json.loads(base64.b64decode(package['content']))['version']
    if tag != 'v' + version:
        raise ValueError('Release version differs from the built package')
    rows = []
    for platform, workflow, count, extension in [('MACOS', 'Release (macOS)', 1, '.dmg'),
                ('WINDOWS', 'Release (Windows)', 1, '.exe'), ('LINUX', 'Release (Linux)', 2, '.deb')]:
        run_id = os.environ[f'{platform}_RUN']
        if not run_id.isdigit():
            raise ValueError('Run IDs must be numeric')
        run = api(repo, f'actions/runs/{run_id}')
        if run['conclusion'] != 'success' or run['name'] != workflow or run['event'] not in ('workflow_dispatch', 'release'):
            raise ValueError('All native builds must have succeeded')
        logs = subprocess.check_output(['gh', 'run', 'view', run_id, '--repo', repo, '--log'], text=True)
        if hosting.checkout_revision(logs) != sha:
            raise ValueError('Native builds do not share the release revision')
        request = urllib.request.Request(public + f'/releases/manifests/{sha}/run-{run_id}.json',
                                         headers={'User-Agent': 'BonzAI-RC-Publisher'})
        with urllib.request.urlopen(request, timeout=60) as response:
            manifest = validate_manifest(json.load(response), sha, run_id, public, count, version)
        if any(Path(row['name']).suffix != extension for row in manifest):
            raise ValueError('Installer platform mismatch')
        rows.extend(manifest)
    if len({row['name'] for row in rows}) != 4:
        raise ValueError('Expected four distinct platform installers')
    if not any('cuda' in row['name'].lower() for row in rows) or not any('rocm' in row['name'].lower() for row in rows):
        raise ValueError('Both Linux backends are required')
    # Refuse an existing conflicting tag; never silently move a release tag.
    existing = subprocess.run(['gh', 'api', f'repos/{repo}/commits/{tag}', '--jq', '.sha'], capture_output=True, text=True)
    if existing.returncode == 0 and existing.stdout.strip() != sha:
        raise ValueError('Release tag already points to another revision')
    notes = Path(f'.github/release-notes/{tag}.md').read_text()
    notes += '\n## Downloads\n\n**macOS: unsigned and not notarized. Windows: unsigned.**\n\n'
    for row in rows:
        notes += f"- [{row['name']}]({row['url']}) — SHA-256 `{row['sha256']}`\n"
    notes += f'\nBuilt from `{sha}`. Each hosted installer was downloaded and verified against its build checksum.\n'
    with tempfile.TemporaryDirectory() as temp:
        folder = Path(temp)
        (folder/'notes.md').write_text(notes)
        (folder/'installers.json').write_text(json.dumps(rows, indent=2) + '\n')
        (folder/'SHA256SUMS').write_text(''.join(f"{row['sha256']}  {row['name']}\n" for row in rows))
        subprocess.run(['gh', 'release', 'create', tag, '--repo', repo, '--target', sha, *([] if stable else ['--prerelease']),
                        '--title', f'BonzAI v{version}' + ('' if stable else ' RC'), '--notes-file', str(folder/'notes.md'),
                        str(folder/'installers.json'), str(folder/'SHA256SUMS')], check=True)


if __name__ == '__main__':
    main()
