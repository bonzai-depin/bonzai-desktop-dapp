import { setTimeout as delay } from 'node:timers/promises';

function abortError(reason) {
  const error = new Error('Server readiness check was cancelled.', { cause: reason });
  error.name = 'AbortError';
  return error;
}

/**
 * Poll one server startup attempt. Its owner must abort the signal when the
 * process exits or is replaced so that an old attempt cannot report readiness.
 */
export async function waitForServer(url, {
  signal,
  timeoutMs = 30000,
  requestTimeoutMs = 5000,
  pollIntervalMs = 1000,
  progressIntervalMs = 5000,
  onProgress,
} = {}) {
  for (const [name, value] of Object.entries({ timeoutMs, requestTimeoutMs, progressIntervalMs })) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive.`);
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new RangeError('pollIntervalMs must be nonnegative.');
  }
  if (signal?.aborted) throw abortError(signal.reason);

  const operation = new AbortController();
  const cancel = () => operation.abort(abortError(signal.reason));
  signal?.addEventListener('abort', cancel, { once: true });
  const timeoutError = new Error(`The server did not start within ${Math.ceil(timeoutMs / 1000)}s.`);
  timeoutError.name = 'TimeoutError';
  const deadlineTimer = setTimeout(() => operation.abort(timeoutError), timeoutMs);
  const startedAt = performance.now();
  let lastProgress = 0;

  try {
    while (!operation.signal.aborted) {
      const request = new AbortController();
      const cancelRequest = () => request.abort(operation.signal.reason);
      operation.signal.addEventListener('abort', cancelRequest, { once: true });
      const requestTimer = setTimeout(() => request.abort(), requestTimeoutMs);
      let ready = false;

      try {
        const response = await fetch(url, { signal: request.signal });
        ready = response.ok;
        // Only headers determine readiness. Release the response connection
        // without waiting for a body that the server might never finish.
        await response.body?.cancel();
      } catch {
        // Connection failures and individual request timeouts are retryable.
        // Cancellation of the complete attempt is handled below.
      } finally {
        clearTimeout(requestTimer);
        operation.signal.removeEventListener('abort', cancelRequest);
      }

      operation.signal.throwIfAborted();
      if (ready) return true;

      const elapsedMs = performance.now() - startedAt;
      if (elapsedMs - lastProgress >= progressIntervalMs) {
        onProgress?.(Math.floor(elapsedMs / 1000));
        lastProgress = elapsedMs;
      }
      // onProgress may synchronously cancel a superseded startup attempt.
      operation.signal.throwIfAborted();
      await delay(pollIntervalMs, undefined, { signal: operation.signal });
    }
    operation.signal.throwIfAborted();
  } catch (error) {
    if (operation.signal.aborted) throw operation.signal.reason;
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
    signal?.removeEventListener('abort', cancel);
  }
}
