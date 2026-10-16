#!/usr/bin/env python3
"""Remove development fixtures and foreign FFmpeg binaries from a staged app only."""
import argparse
from pathlib import Path
import shutil


def prune(app, platform, arch):
    app = Path(app)
    modules = app / 'node_modules'
    if not modules.is_dir() or not (app / 'package.json').is_file():
        raise ValueError('Expected a staged Electron resources/app directory')
    removed = 0
    # Only package-root development directories; never strip runtime src/dist/lib.
    packages = [p.parent for p in modules.rglob('package.json') if p.parent.parent == modules or p.parent.parent.name.startswith('@') or p.parent.parent.name == 'node_modules']
    for package in packages:
        for name in ('test', 'tests', '__tests__', 'examples', 'example', 'coverage', '.github', '.git'):
            target = package / name
            if target.is_dir() and not target.is_symlink():
                removed += sum(p.stat().st_size for p in target.rglob('*') if p.is_file() and not p.is_symlink())
                shutil.rmtree(target)
    for target in modules.rglob('*.map'):
        if target.is_file() and not target.is_symlink():
            removed += target.stat().st_size
            target.unlink()
    ffmpeg = modules / 'ffmpeg-static-electron-forge' / 'dist' / 'bin'
    if ffmpeg.is_dir():
        for system in ffmpeg.iterdir():
            if not system.is_dir(): continue
            for target in list(system.iterdir()):
                if system.name != platform or target.name != arch:
                    if target.is_dir():
                        removed += sum(p.stat().st_size for p in target.rglob('*') if p.is_file())
                        shutil.rmtree(target)
    print(f'Removed {removed / 1024**2:.1f} MiB of development/foreign-platform payload')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app'); parser.add_argument('platform'); parser.add_argument('arch')
    args = parser.parse_args()
    prune(args.app, args.platform, args.arch)
