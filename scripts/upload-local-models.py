#!/usr/bin/env python3
"""Upload local models using CI-issued links, without accessing R2 credentials."""
import argparse, base64, hashlib, json, time, urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from xml.etree import ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--model-dir', type=Path, required=True)
args = parser.parse_args()
rows = json.loads((args.directory / 'inventory.json').read_text())
sources = {r['name']: r for r in rows}
plan = json.loads((args.directory / 'upload-plan.json').read_text())
status_path = args.directory / 'status.json'
status = json.loads(status_path.read_text()) if status_path.exists() else {}

def request(url, method, data=None, headers=None):
    headers = dict(headers or {}, **{'User-Agent': 'BonzAI-Model-Upload/4.0'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=headers), timeout=180) as response:
                return response.headers, response.read()
        except (OSError, urllib.error.URLError):
            if attempt == 4:
                raise RuntimeError(f'{method} failed after five attempts') from None
            time.sleep(2 ** attempt)

def save():
    status_path.write_text(json.dumps(status, indent=2))

for row in plan:
    name = row['name']
    if status.get(name, {}).get('state') == 'verified':
        continue
    source = args.model_dir / sources[name]['source_name']
    if source.stat().st_size != row['bytes']:
        raise RuntimeError('Local file changed: ' + name)
    status[name] = {'state': 'uploading', 'bytes': row['bytes'], 'sent': 0}
    save()
    started = time.monotonic()
    if not row.get('skip'):
        root = ET.Element('CompleteMultipartUpload')
        digest = hashlib.sha256()
        try:
            def upload_part(item):
                n, url = item
                with source.open('rb') as stream:
                    stream.seek((n - 1) * row['chunk'])
                    data = stream.read(row['chunk'])
                headers, _ = request(url, 'PUT', data, {'Content-MD5': base64.b64encode(hashlib.md5(data).digest()).decode()})
                return n, headers['ETag'], len(data)
            # At most three 128 MiB buffers; no model tensors are loaded.
            with ThreadPoolExecutor(max_workers=3) as executor:
                futures = []
                items = iter(enumerate(row['parts'], 1))
                for _ in range(min(3, len(row['parts']))):
                    futures.append(executor.submit(upload_part, next(items)))
                while futures:
                    n, etag, size = futures.pop(0).result()
                    part = ET.SubElement(root, 'Part')
                    ET.SubElement(part, 'PartNumber').text = str(n)
                    ET.SubElement(part, 'ETag').text = etag
                    status[name]['sent'] += size
                    save()
                    item = next(items, None)
                    if item: futures.append(executor.submit(upload_part, item))
            with source.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256')
            if digest.hexdigest() != row['sha256']:
                raise RuntimeError('Local checksum changed: ' + name)
            _, body = request(row['complete'], 'POST', ET.tostring(root), {'Content-Type': 'application/xml'})
            if ET.fromstring(body).tag.split('}')[-1] != 'CompleteMultipartUploadResult':
                raise RuntimeError('Multipart completion failed: ' + name)
        except Exception:
            status[name]['state'] = 'failed'
            save()
            for pending in plan:
                if pending.get('abort') and status.get(pending['name'], {}).get('state') != 'verified':
                    try: request(pending['abort'], 'DELETE')
                    except Exception: pass
            raise
    public = 'https://pub-c63241af101045fb837462e5c4c67e33.r2.dev/' + row['key']
    headers, _ = request(public, 'HEAD')
    if int(headers['Content-Length']) != row['bytes']:
        raise RuntimeError('Public object size mismatch: ' + name)
    status[name].update(state='verified', url=public, sha256=row['sha256'], seconds=round(time.monotonic()-started, 1))
    save()
    print(f"Verified {name}: {row['bytes']/1024**2:.1f} MiB in {status[name]['seconds']}s", flush=True)
