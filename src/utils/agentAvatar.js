// Stored portraits may be raw generator output, persisted blob URLs, or local files.
export function agentAvatarSource(value, serverPort = globalThis.window?.BONZAI_SERVER_PORT || 65000) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const source = value.trim();
  if (/^(data:image\/|https?:\/\/|bonzai-blob:\/\/|blob:|file:)/i.test(source)) return source;
  if (/^(\/src\/assets\/|\.?\/?assets\/)/.test(source)) return source;
  if (source.startsWith('/') || /^[a-z]:[\\/]/i.test(source)) {
    return `http://localhost:${serverPort}/media/stream?path=${encodeURIComponent(source)}`;
  }
  if (/^[a-z0-9+/=\s]+$/i.test(source) && (source.length > 100 || /^(iVBORw0KGgo|\/9j\/|UklGR|R0lGOD)/.test(source))) {
    return `data:image/png;base64,${source.replace(/\s/g, '')}`;
  }
  return null;
}
