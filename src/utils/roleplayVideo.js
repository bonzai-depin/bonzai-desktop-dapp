// Normalize generation responses and saved video references before binding <video>.
export function localVideoPath(value) {
  if (typeof value !== 'string') return null;
  const source = value.trim();
  if (/^file:/i.test(source)) {
    try {
      const url = new URL(source);
      const path = decodeURIComponent(url.pathname);
      if (url.hostname && url.hostname !== 'localhost') return `//${url.hostname}${path}`;
      return /^\/[a-z]:\//i.test(path) ? path.slice(1) : path;
    } catch { return null; }
  }
  return /^(\/|[a-z]:[\\/]|\\\\)/i.test(source) ? source : null;
}

export function roleplayVideoSource(value, port = globalThis.window?.BONZAI_SERVER_PORT || 65000) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const source = value.trim();
  if (/^(data:video\/|https?:\/\/|blob:|bonzai-blob:\/\/)/i.test(source)) return source;
  const path = localVideoPath(source);
  if (path) return `http://localhost:${port}/media/stream?path=${encodeURIComponent(path)}`;
  const base64 = source.replace(/\s/g, '');
  if (base64.length >= 32 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    const mime = base64.startsWith('GkXf') ? 'video/webm' : 'video/mp4';
    return `data:${mime};base64,${base64}`;
  }
  return '';
}
