import test from 'node:test';
import assert from 'node:assert/strict';
import { executeConnectorAction } from '../src/services/company/connectorExecutors.js';
import { createTaskExecution, runTaskExecution } from '../src/services/company/taskExecution.js';

function provider({ connectors, respond }) {
  const rows = structuredClone(connectors), requests = [];
  globalThis.window = { electronAPI: {
    db: { connectors: {
      list: async () => rows,
      get: async (_company, id) => rows.find(row => row.id === id) || null,
      getByKind: async (_company, kind) => rows.find(row => row.kind === kind && row.status === 'active') || null,
      update: async (_company, id, patch) => Object.assign(rows.find(row => row.id === id), patch),
    } },
    companyConnector: { request: async spec => { requests.push(spec); return { data: await respond(spec, requests.length) }; } },
  } };
  return { rows, requests };
}
const twilio = { id: 'sms', kind: 'twilio', status: 'active', accountIdentifier: 'AC-test' };
const runStep = async (action, dispatch) => (await runTaskExecution({ execution: createTaskExecution([action]), save: async () => {}, gate: async () => ({ pass: true }), dispatch })).steps[0];

test('an error before any provider request stays correctable; one after a request needs owner review', async () => {
  // Business reason: a missing sender number or disconnected tool sent nothing, so
  // the agent may fix the input. Only a request that may have been accepted is uncertain.
  const { requests } = provider({ connectors: [twilio], respond: async () => { throw new Error('socket hang up'); } });
  const invalid = await runStep({ type: 'twilio.sendSMS', to: '+33100000000', body: 'Hello' },
    action => executeConnectorAction('team', action.type, action, 'team:task:step1'));
  assert.equal(requests.length, 0);
  assert.equal(invalid.status, 'failed');
  assert.equal(invalid.safeToRevise, true);

  const lost = await runStep({ type: 'twilio.sendSMS', to: '+33100000000', from: '+33200000000', body: 'Hello' },
    action => executeConnectorAction('team', action.type, action, 'team:task:step1'));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].idempotencyKey, 'team:task:step1');
  assert.equal(lost.status, 'unknown', 'a lost connection after sending is never treated as “not sent”');
  assert.notEqual(lost.safeToRevise, true);

  // Offline, or refused outright by the provider: the single request did nothing.
  for (const message of ['NOT_SENT: The provider could not be reached (ENOTFOUND). Nothing was sent; check the network connection.', 'HTTP 422: recipient is not a valid number']) {
    provider({ connectors: [twilio], respond: async () => { throw new Error(`Error invoking remote method 'company-connector:request': Error: ${message}`); } });
    const refused = await runStep({ type: 'twilio.sendSMS', to: '+33100000000', from: '+33200000000', body: 'Hello' },
      action => executeConnectorAction('team', action.type, action, 'key'));
    assert.equal(refused.status, 'failed', message);
    assert.equal(refused.safeToRevise, true, message);
  }
  for (const message of ['HTTP 500: upstream error', 'HTTP 429: slow down', 'The operation was aborted due to timeout']) {
    provider({ connectors: [twilio], respond: async () => { throw new Error(message); } });
    const uncertain = await runStep({ type: 'twilio.sendSMS', to: '+33100000000', from: '+33200000000', body: 'Hello' },
      action => executeConnectorAction('team', action.type, action, 'key'));
    assert.equal(uncertain.status, 'unknown', message);
  }

  provider({ connectors: [], respond: async () => ({}) });
  const disconnected = await runStep({ type: 'slack.postMessage', channel: '#ops', text: 'Hi' },
    action => executeConnectorAction('team', action.type, action, 'key'));
  assert.equal(disconnected.status, 'failed');
  assert.equal(disconnected.safeToRevise, true);
  assert.match(disconnected.error, /slack connector is not active/);
});

test('WhatsApp templates are addressed on the WhatsApp channel', async () => {
  const { requests } = provider({ connectors: [twilio], respond: async () => ({ sid: 'SM1', status: 'queued' }) });
  await executeConnectorAction('team', 'whatsapp.sendTemplate', { to: '+33100000000', from: '+33200000000', templateId: 'HX1', vars: { 1: 'Ada' } }, 'key');
  const form = new URLSearchParams(requests[0].body);
  assert.equal(form.get('To'), 'whatsapp:+33100000000');
  assert.equal(form.get('From'), 'whatsapp:+33200000000');
  assert.equal(form.get('ContentSid'), 'HX1');
});

test('a partly failed SMS broadcast reports who was reached so nobody is messaged twice', async () => {
  provider({ connectors: [twilio], respond: async (spec, count) => {
    if (count === 2) throw new Error('HTTP 400: invalid number');
    return { sid: `SM${count}`, status: 'queued' };
  } });
  const result = await executeConnectorAction('team', 'twilio.broadcastSMS', { from: '+33200000000', body: 'Closed Monday', recipients: ['+331', 'bad', '+333'] }, 'key');
  assert.deepEqual(result.delivered, ['+331', '+333']);
  assert.deepEqual(result.failed.map(item => item.to), ['bad']);
  assert.match(result.summary, /2 messages accepted.*1 not sent \(bad\)/);
});

test('only a rejected credential disconnects a tool', async () => {
  // Business reason: "card expired" or a 403 rate limit must not disable every
  // later action of the team until someone reconnects the tool by hand.
  for (const [message, status] of [['HTTP 402: Your card has expired.', 'active'], ['HTTP 403: rate limit exceeded', 'active'],
    ['HTTP 404: Invoice 401 not found', 'active'], ['HTTP 401: Unauthorized', 'expired'], ['HTTP 400: invalid_grant', 'expired']]) {
    const { rows } = provider({ connectors: [twilio], respond: async () => { throw new Error(message); } });
    await assert.rejects(executeConnectorAction('team', 'twilio.sendSMS', { to: '+331', from: '+332', body: 'x' }, 'key'));
    assert.equal(rows[0].status, status, message);
  }
});

test('a provider that was never reached is reported as not sent; a timeout is not', async () => {
  const { connectorFetch } = await import('../src/main/connectors/http.js');
  const unreachable = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  await assert.rejects(connectorFetch('https://api.example.invalid/x', { method: 'POST' }, async () => { throw unreachable; }), /NOT_SENT: .*ENOTFOUND/);
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  await assert.rejects(connectorFetch('https://api.example.invalid/x', { method: 'POST' }, async () => { throw timeout; }), error => !/NOT_SENT/.test(error.message));
});
