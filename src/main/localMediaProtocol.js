import { open } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

// Chromium needs a standard origin for seeking across multiple MP4 range
// requests. Non-standard schemes can fail with FFmpegDemuxer data-source errors.
export const BLOB_MEDIA_SCHEME = {
  scheme: 'bonzai-blob',
  privileges: { standard: true, bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true, secure: true },
};

const MEDIA_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska', ogv: 'video/ogg',
  gltf: 'model/gltf+json', glb: 'model/gltf-binary',
};
const BLOB_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'mp4', 'webm', 'mov', 'm4v', 'gltf', 'glb']);
const unavailable = status => new Response(null, { status, headers: { 'Cache-Control': 'no-store', 'Content-Length': '0' } });

function byteRange(header, size) {
  // Unsupported units and multipart ranges may be ignored; serve the full file.
  if (!header || !/^bytes=/i.test(header) || header.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  if (!match || (!match[1] && !match[2]) || !size) return false;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return false;
  if (first === null) return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : false;
  if (first >= size || (last !== null && last < first)) return false;
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

/** Serve only paths already authorized by the protocol handler below. */
export async function localMediaResponse(request, filePath) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  let file;
  let streaming = false;
  try {
    file = await open(filePath, 'r');
    const stat = await file.stat();
    if (!stat.isFile()) return unavailable(404);
    const range = request.method === 'GET' ? byteRange(request.headers.get('range'), stat.size) : null;
    const headers = new Headers({
      'Content-Type': MEDIA_TYPES[path.extname(filePath).slice(1).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    if (range === false) {
      headers.set('Content-Range', `bytes */${stat.size}`);
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? stat.size - 1;
    headers.set('Content-Length', String(Math.max(0, end - start + 1)));
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    const status = range ? 206 : 200;
    if (request.method === 'HEAD' || !stat.size) return new Response(null, { status, headers });

    // net.fetch(file://...) omits the length and ignores Range. MP4s with their
    // index at the end then fail in Electron's streaming media data source.
    // Stream the requested bytes, keeping memory bounded even for long videos.
    const stream = file.createReadStream({ start, end, highWaterMark: 64 * 1024, signal: request.signal });
    streaming = true; // The stream owns and closes this file handle, including on cancellation.
    return new Response(Readable.toWeb(stream, {
      strategy: { highWaterMark: 64 * 1024, size: chunk => chunk.byteLength },
    }), { status, headers });
  } catch (error) {
    const status = ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : ['EACCES', 'EPERM'].includes(error.code) ? 403 : 500;
    return unavailable(status);
  } finally {
    if (file && !streaming) await file.close();
  }
}

export function createBlobProtocolHandler(blobRoot) {
  return request => {
    try {
      const url = new URL(request.url);
      if (url.username || url.password || url.port) return new Response(null, { status: 400 });
      // Standard schemes append '/' to host-only URLs; retain older path-form refs too.
      const target = url.host
        ? `${url.host}${url.pathname === '/' ? '' : url.pathname}`
        : url.pathname.replace(/^\/+/, '');
      const match = /^([a-f0-9]{64})\.([a-z0-9]{1,12})$/i.exec(target);
      if (!match) return new Response(null, { status: 400 });
      const id = match[1].toLowerCase();
      const ext = match[2].toLowerCase();
      if (!BLOB_EXTENSIONS.has(ext)) return new Response(null, { status: 403 });
      return localMediaResponse(request, path.join(blobRoot, id.slice(0, 2), `${id}.${ext}`));
    } catch {
      return new Response(null, { status: 400 });
    }
  };
}
