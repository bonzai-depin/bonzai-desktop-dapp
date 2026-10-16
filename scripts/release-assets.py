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
    folder = Path(folder)
    inputs = sorted(p for p in folder.iterdir() if p.suffix in {'.deb', '.dmg', '.exe', '.bin', '.zip'})
    if not inputs:
        raise ValueError('No release installers found')
    for path in inputs:
        checksum = digest(path)
        assets = [path]
        if path.stat().st_size > limit:
            assets = []
            with path.open('rb') as source:
                index = 0
                while source.tell() < path.stat().st_size:
                    part = path.with_name(f'{path.name}.part-{index:03d}')
                    remaining = limit
                    with part.open('wb') as dest:
                        while remaining:
                            block = source.read(min(8 * 1024 * 1024, remaining))
                            if not block:
                                break
                            dest.write(block)
                            remaining -= len(block)
                    assets.append(part)
                    index += 1
            # Verify the stream before removing the original oversized installer.
            combined = hashlib.sha256()
            for part in assets:
                with part.open('rb') as stream:
                    for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
                        combined.update(block)
            if combined.hexdigest() != checksum:
                raise ValueError(f'Split verification failed: {path.name}')
            names = ' '.join(p.name for p in assets)
            instructions = path.with_name(path.name + '.README.txt')
            instructions.write_text(
                f'Download every part into one directory. Original SHA256: {checksum}\n\n'
                f'macOS/Linux: cat {names} > "{path.name}"\n'
                f'Check: shasum -a 256 "{path.name}" (Linux: sha256sum)\n\n'
                f'Windows Command Prompt: copy /b {"+".join(p.name for p in assets)} "{path.name}"\n'
                f'Check in PowerShell: Get-FileHash "{path.name}" -Algorithm SHA256\n\n'
                'Compare the checksum above before opening/installing the reconstructed file.\n', encoding='utf-8')
            assets.append(instructions)
            path.unlink()
        manifest = path.with_name(path.name + '.SHA256SUMS')
        manifest.write_text(''.join(f'{digest(p)}  {p.name}\n' for p in assets), encoding='utf-8')
        print(f'Prepared {path.name}: {len(assets)} assets; SHA256 {checksum}')
    oversized = [p.name for p in folder.iterdir() if p.is_file() and p.stat().st_size >= 2**31]
    if oversized:
        raise ValueError(f'Assets exceed GitHub limit: {oversized}')


def upload(folder, tag, repo):
    base = ['gh', 'release']
    if subprocess.run(base + ['view', tag, '--repo', repo], stdout=subprocess.DEVNULL).returncode:
        # Concurrent platform jobs may both attempt creation; recheck on conflict.
        result = subprocess.run(base + ['create', tag, '--repo', repo, '--title', f'BonzAI {tag}', '--notes', 'BonzAI desktop installers.'])
        if result.returncode:
            subprocess.run(base + ['view', tag, '--repo', repo], check=True)
    files = sorted(p for p in Path(folder).iterdir() if p.is_file())
    if not files:
        raise ValueError('No release assets to upload')
    for path in files:
        if path.stat().st_size >= 2**31:
            raise ValueError(f'Asset too large: {path.name}')
        subprocess.run(base + ['upload', tag, str(path), '--repo', repo, '--clobber'], check=True)


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
