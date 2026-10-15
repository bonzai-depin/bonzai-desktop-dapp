export function walletConnectionCancelled() {
  const error = new Error('Sign-in cancelled');
  error.name = 'AbortError';
  return error;
}

// RPC requests need not support AbortSignal themselves. Stop waiting promptly,
// and consume their eventual result without letting it finish a cancelled login.
export function awaitWalletStep(operation, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(walletConnectionCancelled());
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      if (signal?.aborted) throw walletConnectionCancelled();
      return operation();
    }).then(value => finish(null, value), error => finish(error));
  });
}

// A cancelled sign-in must not leave a listener that authenticates a later window.
export function waitForWalletAddress(api, { signal, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe;
    let timer;
    const finish = (error, address) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(address);
    };
    const abort = () => finish(walletConnectionCancelled());
    const receive = address => {
      if (typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address)) finish(null, address);
    };
    if (signal?.aborted) return abort();
    if (!api?.wallet?.getAddress || !api?.onWalletAddress) return finish(new Error('Wallet sign-in is unavailable.'));
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(new Error('Wallet setup timed out. Open the wallet window and sign in.')), timeoutMs);
    try {
      unsubscribe = api.onWalletAddress(receive);
      if (settled) unsubscribe?.();
      Promise.resolve(api.wallet.getAddress()).then(receive, error => finish(error));
    } catch (error) { finish(error); }
  });
}
