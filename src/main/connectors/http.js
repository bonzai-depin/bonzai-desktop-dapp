/** Retry only reads. A timed-out financial write has an unknown outcome. */
export async function connectorFetch(url, options, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const readOnly = (options.method || 'GET').toUpperCase() === 'GET';
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!readOnly || attempt >= 2 || ![429, 502, 503, 504].includes(response.status)) return response;
    const retryAfter = response.headers.get('retry-after');
    const seconds = Number(retryAfter);
    const delay = retryAfter ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()) : 500 * 2 ** attempt;
    // Long provider waits should surface to the user, not hold the UI indefinitely.
    if (!Number.isFinite(delay) || delay > 5000) return response;
    await response.body?.cancel();
    await sleep(Math.max(0, delay));
  }
}
