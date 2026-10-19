"""Read-only fingerprinting for standardized benchmarks. No inference or downloads."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
from flask import jsonify, request

ALLOWED = {'image_turbo', 'image_quality', 'music', 'vision', 'ocr', 'forecast', 'video_fast', 'video_quality', 'video_sota'}
_cache = {}

def fingerprint(file):
    stat = file.stat()
    key = (str(file.resolve()), stat.st_size, stat.st_mtime_ns)
    if key not in _cache:
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                digest.update(chunk)
        # A file being downloaded or edited cannot produce a stable identity.
        after = file.stat()
        if (stat.st_size, stat.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError('Model changed while fingerprinting')
        _cache[key] = digest.hexdigest()
    return {'bytes': stat.st_size, 'sha256': _cache[key]}

def install_benchmark_environment(app, *, plan, ready, repo_dir, model_dir, activity, device, extras=lambda key: []):
    @app.get('/benchmark/status')
    def benchmark_status():
        packages = {}
        for name in ('torch', 'diffusers', 'transformers', 'safetensors'):
            try:
                packages[name] = importlib.metadata.version(name)
            except importlib.metadata.PackageNotFoundError:
                packages[name] = 'unavailable'
        source = hashlib.sha256()
        for file in sorted(Path(__file__).parent.glob('*.py')):
            source.update(file.name.encode())
            source.update(file.read_bytes().replace(b'\r\n', b'\n'))
        return jsonify({'busy': any(o.get('status') == 'running' for o in activity().get('operations', [])),
                        'device': str(device()), 'packages': packages, 'implementation': source.hexdigest()})

    @app.post('/benchmark/environment')
    def benchmark_environment():
        key = (request.get_json(silent=True) or {}).get('pipeline')
        if key not in ALLOWED:
            return jsonify({'error': 'Unknown benchmark pipeline'}), 400
        if not ready(key):
            return jsonify({'ready': False, 'reason': 'Required models are not installed.'})
        try:
            recipe = plan(key)
            files = {}
            for name, required in extras(key):
                file = Path(model_dir) / name
                if not file.is_file():
                    if required:
                        return jsonify({'ready': False, 'reason': 'Required local adapter is missing: ' + name})
                else:
                    files[name] = fingerprint(file)
            for entry in recipe.get('single_files', []):
                file = Path(model_dir) / entry['name'].lower()
                if file.is_file():
                    files[entry['name'].lower()] = fingerprint(file)
            for repo in recipe.get('repos_to_fetch', []):
                root = repo_dir(repo)
                for file in sorted(root.rglob('*')):
                    if file.is_file() and '.cache' not in file.relative_to(root).parts:
                        files[repo + '/' + file.relative_to(root).as_posix()] = fingerprint(file)
            if not files:
                return jsonify({'ready': False, 'reason': 'No verifiable local model files.'})
            return jsonify({'ready': True, 'files': files})
        except (OSError, ValueError):
            return jsonify({'ready': False, 'reason': 'Model files changed or could not be fingerprinted.'})
