import fs from 'node:fs/promises';
import path from 'node:path';

/** Bounded parallel transfers. Completed chunks resume only against the same strong ETag. */
export async function parallelDownload(url, destination, { signal, onProgress = () => {}, connections = 4, chunkSize = 32 * 1024 ** 2, minimumSize = 64 * 1024 ** 2 } = {}) {
  let head;
  try { head = await fetch(url, { method: 'HEAD', signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(30000)]) }); }
  catch (error) { if (signal?.aborted) throw error; return null; }
  const size = Number(head.headers.get('content-length'));
  const etag = head.headers.get('etag');
  if (!head.ok || !Number.isSafeInteger(size) || size < minimumSize || head.headers.get('accept-ranges') !== 'bytes' || !etag || etag.startsWith('W/')) return null;
  const dir = `${destination}.parts`;
  await fs.mkdir(dir, { recursive: true });
  const manifest = JSON.stringify({ url, size, etag, chunkSize });
  let previous;
  try { previous = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'); } catch {}
  if (previous !== manifest) {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'manifest.json'), manifest);
  }
  const count = Math.ceil(size / chunkSize), progress = Array(count).fill(0);
  const abort = new AbortController();
  const combined = AbortSignal.any([signal || new AbortController().signal, abort.signal]);
  let lastReport = 0;
  const report = () => { if (Date.now() - lastReport > 150) { lastReport = Date.now(); onProgress(progress.reduce((sum, n) => sum + n, 0) / size); } };
  let cursor = 0;
  const worker = async () => {
    while (cursor < count) {
      combined.throwIfAborted();
      const index = cursor++, start = index * chunkSize, end = Math.min(size - 1, start + chunkSize - 1), length = end - start + 1;
      const target = path.join(dir, `${index}`);
      try { if ((await fs.stat(target)).size === length) { progress[index] = length; report(); continue; } } catch {}
      for (let attempt = 0; attempt < 3; attempt++) {
        let file;
        try {
          const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, 'If-Range': etag, 'Accept-Encoding': 'identity' }, signal: AbortSignal.any([combined, AbortSignal.timeout(300000)]) });
          if (res.status !== 206 || res.headers.get('content-range') !== `bytes ${start}-${end}/${size}`) {
            await res.body?.cancel(); const error = new Error('Server did not honor the requested byte range'); error.code = res.status === 200 || res.status === 416 || res.status === 206 ? 'RANGE_UNSUPPORTED' : 'HTTP_ERROR'; throw error;
          }
          file = await fs.open(`${target}.partial`, 'w');
          let received = 0;
          for await (const chunk of res.body) {
            received += chunk.length;
            if (received > length) throw new Error('Invalid download length');
            let offset = 0;
            while (offset < chunk.length) offset += (await file.write(chunk, offset, chunk.length - offset)).bytesWritten;
            progress[index] = received; report();
          }
          if (received !== length) throw new Error('Incomplete download');
          await file.close(); file = null;
          await fs.rename(`${target}.partial`, target);
          break;
        } catch (error) {
          progress[index] = 0;
          if (combined.aborted || error.code === 'RANGE_UNSUPPORTED' || attempt === 2) throw error;
        } finally { await file?.close(); }
      }
    }
  };
  const tasks = Array.from({ length: Math.min(connections, count) }, () => worker().catch(error => { abort.abort(); throw error; }));
  const results = await Promise.allSettled(tasks);
  const failure = results.find(result => result.status === 'rejected');
  if (results.some(result => result.reason?.code === 'RANGE_UNSUPPORTED') && !signal?.aborted) return null;
  if (failure) throw failure.reason;
  const output = `${destination}.partial`;
  const file = await fs.open(output, 'w');
  try {
    for (let i = 0; i < count; i++) {
      combined.throwIfAborted();
      const data = await fs.readFile(path.join(dir, `${i}`));
      let offset = 0;
      while (offset < data.length) offset += (await file.write(data, offset, data.length - offset)).bytesWritten;
    }
    await file.sync();
  } finally { await file.close(); }
  combined.throwIfAborted();
  await fs.rename(output, destination);
  await fs.rm(dir, { recursive: true, force: true });
  onProgress(1);
  return destination;
}
