// Credentials and account routing remain in the main process.
export function financeAuthHeaders(kind, credential, accountIdentifier = '') {
  const token = credential.accessToken || credential.apiKey || credential.token;
  if (!token || /[\r\n]/.test(token)) throw new Error('A valid connector credential is required');
  if (kind === 'qonto') {
    if (credential.accessToken) return { Authorization: `Bearer ${token}` };
    if (!/^[a-zA-Z0-9_-]+$/.test(accountIdentifier)) throw new Error('Qonto organization login is required');
    return { Authorization: `${accountIdentifier}:${token}` };
  }
  if (kind === 'stripe') {
    if (accountIdentifier && !/^acct_[a-zA-Z0-9]+$/.test(accountIdentifier)) throw new Error('Invalid Stripe Connect account ID');
    return { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`, ...(accountIdentifier ? { 'Stripe-Account': accountIdentifier } : {}) };
  }
  throw new Error('Unsupported financial connector');
}
