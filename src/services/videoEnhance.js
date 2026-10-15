/** Shared enhancement transport. Downloads are polled, never mistaken for a video. */
export function videoEnhanceSource(data) {
  if (!data || data.enhancement_backend === 'seedvr2') return null;
  return (data.enhanced && data.enhanced_from) || data.video_path || null;
}

export async function enhanceVideo({ baseUrl, videoPath, headers = {}, onProgress = () => {},
  backend = 'seedvr2', autoDownload = true, signal,
  fetchImpl = globalThis.fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now, downloadTimeoutMs = 2 * 60 * 60 * 1000 }) {
  const base = baseUrl.replace(/\/$/, '');
  const body = JSON.stringify({ video_path: videoPath, backend, upscale: true,
    interp_factor: 1, auto_download: autoDownload });
  const deadline = now() + downloadTimeoutMs;
  // One initial request and one retry after verified download completion.
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    onProgress({ stage: 'enhancing' });
    const response = await fetchImpl(`${base}/video/enhance`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body, signal,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status !== 202) {
      if (!response.ok) throw new Error(data.message || data.error || `Enhancement failed (${response.status}).`);
      if (!data.video_path) throw new Error('Enhancement returned no video.');
      onProgress({ stage: 'completed' });
      return data;
    }
    if (!data.pipeline_id) throw new Error('Enhancement returned no download identifier.');
    let state = data.pipeline || { status: 'downloading' };
    while (true) {
      signal?.throwIfAborted();
      if (state.status === 'failed' || state.status === 'cancelled') {
        const failed = Object.values(state.tasks || {}).find(task => task.status === 'failed');
        throw new Error(failed?.error || `Enhancement download ${state.status}.`);
      }
      if (state.status === 'completed') break;
      if (now() >= deadline) throw new Error('Enhancement download is still in progress. Try again when it finishes.');
      onProgress({ stage: 'downloading', percent: Math.round(state.total_progress || 0) });
      await wait(3000);
      const status = await fetchImpl(`${base}/downloads/status/${encodeURIComponent(data.pipeline_id)}`, { headers, signal });
      if (!status.ok) throw new Error('Unable to check enhancement download progress.');
      state = await status.json();
    }
  }
  throw new Error('Enhancement assets failed verification after downloading.');
}
