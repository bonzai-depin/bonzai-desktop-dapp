#!/usr/bin/env python3
"""Issue short-lived, object-scoped multipart links; credentials stay in CI."""
import json, os, re
from pathlib import Path
import boto3

items = json.loads(os.environ['MODEL_MANIFEST'])
if not isinstance(items, list) or not 0 < len(items) <= 100:
    raise ValueError('Expected 1–100 model files')
for item in items:
    if not re.fullmatch(r'[a-z0-9_.-]+', item['name']) or 'safetensors' not in item['name']:
        raise ValueError('Invalid model filename')
    if not re.fullmatch(r'[a-f0-9]{64}', item['sha256']) or not 0 < item['bytes'] < 100 * 1024**3:
        raise ValueError('Invalid model size or checksum')
s3 = boto3.client('s3', endpoint_url=os.environ['R2_ENDPOINT'], region_name='auto')
bucket = os.environ['R2_BUCKET']
chunk = 128 * 1024**2
plan = []
created = []
try:
    for item in items:
        key = 'models/' + item['name']
        params = {'Bucket': bucket, 'Key': key}
        row = dict(item, key=key, chunk=chunk)
        try:
            existing = s3.head_object(**params)
        except s3.exceptions.ClientError as e:
            if e.response['ResponseMetadata']['HTTPStatusCode'] != 404:
                raise
        else:
            if existing['ContentLength'] == item['bytes'] and existing.get('Metadata', {}).get('sha256') == item['sha256']:
                row['skip'] = True
                plan.append(row)
                continue
            raise RuntimeError('Existing object differs; refusing to overwrite: ' + key)
        upload = s3.create_multipart_upload(**params, ContentType='application/octet-stream', Metadata={'sha256': item['sha256']})
        params['UploadId'] = upload['UploadId']
        created.append(params)
        row['parts'] = [s3.generate_presigned_url('upload_part', Params=dict(params, PartNumber=n), ExpiresIn=21600) for n in range(1, (item['bytes'] + chunk - 1)//chunk + 1)]
        row['complete'] = s3.generate_presigned_url('complete_multipart_upload', Params=params, ExpiresIn=21600)
        row['abort'] = s3.generate_presigned_url('abort_multipart_upload', Params=params, ExpiresIn=21600)
        plan.append(row)
    Path('upload-plan.json').write_text(json.dumps(plan))
    print(f'Prepared scoped upload links for {len(plan)} files; expires in six hours.')
except Exception:
    for params in created:
        s3.abort_multipart_upload(**params)
    raise
