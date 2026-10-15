import { reactive } from 'vue';

// One choice and one result, even when several views request a connection.
export const connectionDialog = reactive({ open: false, error: '' });
let pending;

export function requestConnection() {
  if (pending) return pending.promise;
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  pending = { promise, resolve };
  connectionDialog.error = '';
  connectionDialog.open = true;
  return promise;
}

export function finishConnection(result) {
  if (!result?.success) {
    connectionDialog.error = result?.error || 'Connection failed';
    return;
  }
  const request = pending;
  pending = null;
  connectionDialog.open = false;
  connectionDialog.error = '';
  request?.resolve(result);
}

export function cancelConnectionDialog() {
  const request = pending;
  pending = null;
  connectionDialog.open = false;
  connectionDialog.error = '';
  request?.resolve({ success: false, cancelled: true, error: 'Connection cancelled' });
}
