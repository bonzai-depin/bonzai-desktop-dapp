import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyOAuth } from '../src/main/connectors/companyOAuth.js';
import { refreshMailToken } from '../src/main/connectors/mailOAuth.js';

function fixture(options = {}) {
  const values = new Map(), changes = [], calls = [];
  const rows = [{ id: 'gmail', kind: 'gmail' }, { id: 'calendar', kind: 'google_calendar' }, { id: 'outlook', kind: 'outlook_mail' }].map(row => ({ ...row, companyId: 'team', status: 'needs_auth' }));
  const store = { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) };
  // Storage encryption is Electron's responsibility; assert this seam is used
  // rather than putting plain credentials in connector metadata or IPC results.
  const secureStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(`protected:${value}`), decryptString: value => value.toString().slice(10) };
  const repository = { getById: (team, id) => rows.find(row => row.companyId === team && row.id === id), update: (team, id, patch) => Object.assign(repository.getById(team, id), patch) };
  const service = createCompanyOAuth({ store, secureStorage, repository, changed: id => changes.push(id), env: {}, openExternal: () => {}, authorize: async input => {
    calls.push(input);
    return { account: 'owner@example.invalid', credential: { clientId: input.clientId, clientSecret: input.clientSecret, accessToken: 'token', refreshToken: 'renewal' }, scopes: ['test'] };
  }, ...options });
  return { service, values, rows, calls, changes };
}

test('provider registration is reused across teams and Google tools without asking users for credentials', async () => {
  const f = fixture();
  assert.equal(f.service.status('gmail').ready, false);
  f.service.configure({ kind: 'gmail', clientId: 'desktop-app', clientSecret: 'native-secret' });
  assert.deepEqual(f.service.status('google_calendar'), { ready: true, provider: 'google' });
  assert.equal(f.service.status('outlook_mail').ready, false);
  const result = await f.service.connect({ companyId: 'team', connectorId: 'calendar', clientId: 'untrusted-renderer-override' });
  assert.deepEqual(result, { ok: true, account: 'owner@example.invalid' });
  assert.equal(f.calls[0].clientId, 'desktop-app');
  assert.equal(f.calls[0].clientSecret, 'native-secret');
  assert.equal(f.rows[1].status, 'active');
  assert.equal(f.rows[1].accountIdentifier, result.account);
  assert.deepEqual(f.changes, ['team']);
  assert.ok(f.values.get(f.rows[1].secretRef).encrypted);
  assert.doesNotMatch(JSON.stringify(f.rows), /native-secret|renewal|accessToken/);
});

test('packaged and deployment client IDs allow immediate sign-in; missing setup never fakes a connection', async () => {
  for (const options of [{ registered: { google: 'shipped-app' } }, { env: { BONZAI_GOOGLE_OAUTH_CLIENT_ID: 'deployment-app' } }]) {
    const f = fixture(options);
    assert.equal(f.service.status('gmail').ready, true);
    await f.service.connect({ companyId: 'team', connectorId: 'gmail' });
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  await assert.rejects(f.service.connect({ companyId: 'team', connectorId: 'gmail' }), /administrator setup/);
  assert.equal(f.rows[0].status, 'needs_auth');
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.service.connect({ companyId: 'wrong-team', connectorId: 'gmail' }), /not found/);
});

test('a cancelled or deleted connection cannot be activated by a late provider callback', async () => {
  for (const action of ['cancel', 'delete']) {
    let complete;
    const f = fixture({ registered: { google: 'app' }, authorize: () => new Promise(resolve => { complete = resolve; }) });
    const input = { companyId: 'team', connectorId: 'gmail' };
    const result = f.service.connect(input);
    await assert.rejects(f.service.connect(input), /in progress/);
    if (action === 'cancel') f.service.cancel(input); else f.rows.splice(0, 1);
    complete({ account: 'stale@example.invalid', credential: { accessToken: 'late-token' }, scopes: [] });
    await assert.rejects(result, /cancelled/);
    assert.equal(f.changes.length, 0);
    assert.equal(f.values.has('company-connector:team:gmail'), false);
  }
});

test('Google Calendar renews offline credentials and retains rotating refresh tokens', async () => {
  const next = await refreshMailToken('google_calendar', { clientId: 'app', refreshToken: 'previous', clientSecret: 'secret' }, async (url, input) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(new URLSearchParams(input.body).get('refresh_token'), 'previous');
    return { ok: true, json: async () => ({ access_token: 'new-access', refresh_token: 'rotated', expires_in: 3600 }) };
  });
  assert.equal(next.refreshToken, 'rotated');
  assert.equal(next.accessToken, 'new-access');
});
