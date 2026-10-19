import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const hashes = new Map();
export async function fingerprintFile(file) {
  const before = await fs.promises.stat(file);
  const key = `${file}:${before.size}:${before.mtimeMs}`;
  if (!hashes.has(key)) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    const after = await fs.promises.stat(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Model changed during fingerprinting');
    hashes.set(key, hash.digest('hex'));
  }
  return { name: path.basename(file), bytes: before.size, sha256: hashes.get(key) };
}

// Only callers supply built-in routes; never expose an arbitrary URL through IPC.
export function localRequest(port, route, body, timeoutMs = 4 * 60 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const request = http.request({ hostname: '127.0.0.1', port, path: route, method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 128 * 1024 * 1024) { response.destroy(new Error('Benchmark response too large')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch { reject(new Error('Invalid local runtime response')); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Local runtime timed out')));
    request.on('error', reject);
    request.end(data);
  });
}

export function validateScenarioOutput(item, data) {
  if (item.kind === 'image') return !!(data.image || data.image_base64 || data.image_path);
  if (item.kind === 'audio') return !!(data.audio || data.audio_base64 || data.audio_path);
  if (item.kind === 'video') return !!data.video_path;
  if (item.kind === 'analysis') return typeof (data.text ?? data.response) === 'string' && !!(data.text ?? data.response).trim();
  if (item.kind === 'forecast') return data.forecast?.length === item.params.horizon && data.forecast.every(Number.isFinite);
  return false;
}
