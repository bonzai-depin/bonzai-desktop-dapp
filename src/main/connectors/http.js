/** Retry only reads. A timed-out financial write has an unknown outcome. */
const NEVER_CONNECTED = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH']);
export async function connectorFetch(url, options, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const readOnly = (options.method || 'GET').toUpperCase() === 'GET';
  for (let attempt = 0; ; attempt++) {
    let response;
    try { response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
    catch (error) {
      // The connection was never established, so the provider received nothing.
      // A timeout or a reset mid-request stays an unknown outcome.
      const code = error?.cause?.code || error?.code;
      if (NEVER_CONNECTED.has(code)) throw Object.assign(new Error(`NOT_SENT: The provider could not be reached (${code}). Nothing was sent; check the network connection.`), { code, notSent: true });
      throw error;
    }
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
