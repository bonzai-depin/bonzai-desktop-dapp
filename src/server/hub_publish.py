"""Explicit, model-artifact-only Hub publishing. Tokens live only in the worker."""
import hashlib
import json
import re
import threading
import uuid
from pathlib import Path

CONFIGS = {'config.json', 'adapter_config.json', 'generation_config.json', 'tokenizer.json',
           'tokenizer_config.json', 'special_tokens_map.json', 'added_tokens.json',
           'vocab.json', 'merges.txt', 'tokenizer.model', 'model.safetensors.index.json',
           'pytorch_model.bin.index.json'}
WEIGHTS = re.compile(r'(?:.*\.gguf|.*\.safetensors|pytorch_model(?:-\d+-of-\d+)?\.bin|adapter_model\.bin)$')


def artifact_manifest(root, model_id):
    if not re.fullmatch(r'[\w-]+', model_id):
        raise ValueError('Invalid model identifier')
    base = Path(root).resolve()
    folder = base / model_id
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError('Model not found')
    files = []
    for item in sorted(folder.rglob('*')):
        relative = item.relative_to(folder)
        if any(part.startswith('.') or part in {'checkpoint', 'logs', 'datasets'} or part.startswith('checkpoint-') for part in relative.parts):
            continue
        if item.is_symlink() or any(parent.is_symlink() for parent in item.parents if parent != base):
            continue
        if item.is_file() and (item.name in CONFIGS or WEIGHTS.fullmatch(item.name)):
            stat = item.stat()
            repo_path = Path(*relative.parts[1:]).as_posix() if relative.parts[0] in {'lora', 'tokenizer'} else relative.as_posix()
            files.append({'path': relative.as_posix(), 'repo_path': repo_path, 'size': stat.st_size, 'modified': stat.st_mtime_ns})
    if not any(WEIGHTS.fullmatch(Path(f['path']).name) and f['size'] > 0 for f in files):
        raise ValueError('No completed model weights found. Train or export a model first.')
    if len({f['repo_path'] for f in files}) != len(files):
        raise ValueError('Conflicting export filenames. Export a single model before uploading.')
    digest = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
    return folder, files, digest


def register_hub_publish(app, model_root):
    from flask import request, jsonify
    jobs = {}
    lock = threading.Lock()

    @app.get('/training/models/<model_id>/hub-preview')
    def hub_preview(model_id):
        try:
            _, files, digest = artifact_manifest(model_root, model_id)
            return jsonify(files=files, digest=digest, bytes=sum(f['size'] for f in files))
        except ValueError as error:
            return jsonify(error=str(error)), 400

    @app.post('/training/models/<model_id>/hub-upload')
    def hub_upload(model_id):
        data = request.get_json(silent=True) or {}
        repo = str(data.get('repository', ''))
        token = str(data.get('token', ''))
        if not re.fullmatch(r'[A-Za-z0-9][\w.-]*/[A-Za-z0-9][\w.-]*', repo) or not token.startswith('hf_'):
            return jsonify(error='Enter an owner/repository and a Hugging Face write token.'), 400
        try:
            folder, files, digest = artifact_manifest(model_root, model_id)
            if data.get('confirmed') is not True or data.get('digest') != digest:
                raise ValueError('Review the current file list before confirming upload.')
        except ValueError as error:
            return jsonify(error=str(error)), 400
        with lock:
            if any(job['status'] in {'uploading', 'creating repository'} for job in jobs.values()):
                return jsonify(error='An upload is already running.'), 409
            job_id = uuid.uuid4().hex
            jobs[job_id] = {'status': 'creating repository', 'repository': repo}

        def worker():
            try:
                from huggingface_hub import HfApi, CommitOperationAdd
                api = HfApi(token=token)
                # Never change or overwrite an existing repository implicitly.
                api.create_repo(repo_id=repo, private=data.get('private', True) is not False, exist_ok=False)
                jobs[job_id]['status'] = 'uploading'
                operations = [CommitOperationAdd(path_in_repo=f['repo_path'], path_or_fileobj=str(folder / f['path'])) for f in files]
                result = api.create_commit(repo_id=repo, operations=operations, commit_message='Upload BonzAI trained model')
                jobs[job_id].update(status='complete', url=result.commit_url)
            except Exception as error:
                # Do not expose SDK errors that might contain authorization or local paths.
                code = getattr(getattr(error, 'response', None), 'status_code', None)
                message = {401: 'Token rejected.', 403: 'Token lacks write permission.', 409: 'Repository already exists; choose a new name.'}.get(code, 'Upload failed. Check connectivity, repository name and token permissions. A partially created repository may remain on Hugging Face.')
                jobs[job_id].update(status='error', error=message)
        threading.Thread(target=worker, daemon=True).start()
        return jsonify(job_id=job_id), 202

    @app.get('/training/hub-uploads/<job_id>')
    def hub_status(job_id):
        if job_id not in jobs:
            return jsonify(error='Upload not found; the server may have restarted.'), 404
        return jsonify(jobs[job_id])
