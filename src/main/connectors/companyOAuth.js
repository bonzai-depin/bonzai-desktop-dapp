import { COMPANY_OAUTH_PROVIDERS } from '../../shared/companyOAuth.js';
import { authorizeMailbox } from './mailAuthorization.js';

/** A single native-provider registration per device, separate from the user's
 * account tokens. Renderer status responses never contain secrets or tokens. */
export function createCompanyOAuth({ store, secureStorage, repository, openExternal, changed, env = process.env, registered = {}, authorize = authorizeMailbox }) {
  const pending = new Map();
  const provider = kind => {
    const config = COMPANY_OAUTH_PROVIDERS[kind];
    if (!config) throw new Error('Browser sign-in is unavailable for this tool.');
    return config.provider;
  };
  const appKey = kind => `company-oauth-app-${provider(kind)}`;
  const secretKey = (companyId, connectorId) => `company-connector:${companyId}:${connectorId}`;
  function settings(kind) {
    const name = provider(kind), prefix = name === 'google' ? 'BONZAI_GOOGLE_OAUTH' : 'BONZAI_MICROSOFT_OAUTH';
    const stored = store.get(appKey(kind));
    if (stored?.encrypted) return JSON.parse(secureStorage.decryptString(Buffer.from(stored.encrypted, 'base64')));
    return {
      clientId: env[`${prefix}_CLIENT_ID`] || registered[name] || store.get(`mail-oauth-${kind}-client-id`, '') || '',
      clientSecret: name === 'google' ? env[`${prefix}_CLIENT_SECRET`] || '' : '',
      tenant: env.BONZAI_MICROSOFT_OAUTH_TENANT || 'common',
    };
  }
  function status(kind) {
    const config = settings(kind);
    return { ready: !!config.clientId?.trim(), provider: provider(kind) };
  }
  function configure({ kind, clientId, clientSecret = '', tenant = 'common' }) {
    provider(kind);
    if (!secureStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this device');
    clientId = String(clientId || '').trim();
    if (!clientId || clientId.length > 256 || /\s/.test(clientId)) throw new Error('Enter a valid desktop application ID.');
    if (!/^[a-zA-Z0-9.-]+$/.test(tenant)) throw new Error('Invalid Microsoft tenant.');
    const config = { clientId, clientSecret: provider(kind) === 'google' ? String(clientSecret) : '', tenant };
    store.set(appKey(kind), { encrypted: secureStorage.encryptString(JSON.stringify(config)).toString('base64') });
    return status(kind);
  }
  async function connect({ companyId, connectorId }) {
    const row = repository.getById(companyId, connectorId);
    if (!row) throw new Error('Connection not found in this team.');
    provider(row.kind);
    if (!secureStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this device');
    const key = secretKey(companyId, connectorId);
    if (pending.has(key)) throw new Error('A connection is already in progress.');
    const config = settings(row.kind);
    if (!config.clientId?.trim()) throw new Error('Provider sign-in needs one-time administrator setup.');
    const controller = new AbortController();
    pending.set(key, controller);
    try {
      const result = await authorize({ kind: row.kind, ...config, openExternal, signal: controller.signal });
      if (controller.signal.aborted || !repository.getById(companyId, connectorId)) throw new Error('Connection cancelled.');
      store.set(key, { encrypted: secureStorage.encryptString(JSON.stringify(result.credential)).toString('base64'), protected: true, kind: row.kind, accountIdentifier: result.account, updatedAt: Date.now() });
      repository.update(companyId, connectorId, { status: 'active', secretRef: key, accountIdentifier: result.account, scopes: result.scopes, lastValidatedAt: Date.now(), error: null });
      changed(companyId);
      return { ok: true, account: result.account };
    } finally { pending.delete(key); }
  }
  function cancel({ companyId, connectorId }) {
    pending.get(secretKey(companyId, connectorId))?.abort();
    return { ok: true };
  }
  return { status, configure, connect, cancel };
}
