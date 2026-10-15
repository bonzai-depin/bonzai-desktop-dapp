/** Accept generated pixels or a local file; never turn a model response into a remote URL. */
export function meditationArtworkSource(data, baseUrl) {
  const value = String(data?.image_path || data?.image_base64 || data?.image || '').trim();
  if (/^(?:\/(?!\/)|[A-Za-z]:[\\/]|\\\\)[^\0]+\.(?:png|jpe?g|webp)$/i.test(value)) {
    return `${baseUrl}/media/stream?path=${encodeURIComponent(value)}`;
  }
  const inline = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (inline) return value;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return `data:image/png;base64,${value}`;
  throw new Error('The image service returned no usable artwork.');
}

export async function validateMeditationArtwork(source, { ImageClass = globalThis.Image, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const image = new ImageClass();
    let timer;
    const finish = (error) => {
      clearTimeout(timer); image.onload = null; image.onerror = null;
      if (error) reject(error); else resolve(source);
    };
    image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
      ? finish() : finish(new Error('The generated artwork could not be opened.'));
    image.onerror = () => finish(new Error('The generated artwork could not be opened.'));
    timer = setTimeout(() => finish(new Error('Opening the artwork timed out.')), timeoutMs);
    image.src = source;
  });
}
