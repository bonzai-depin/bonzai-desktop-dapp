import test from 'node:test';
import assert from 'node:assert/strict';
import { syncMailbox } from '../src/services/company/mailIntake.js';

test('one unusable attachment is flagged for the owner without stopping the mailbox', async () => {
  // Business reason: a single oversized or linked attachment used to make the same
  // page fail forever, so every later customer email was never read.
  const ingested = [], imported = [], checkpoints = [];
  const page = { value: [
    { id: 'm1', subject: 'Contract', from: { emailAddress: { address: 'client@example.invalid' } }, hasAttachments: true, body: { contentType: 'text', content: 'See attached.' } },
    { id: 'm2', subject: 'Order 42', from: { emailAddress: { address: 'client@example.invalid' } }, hasAttachments: false, body: { contentType: 'text', content: 'Please confirm.' } },
  ] };
  const attachments = { value: [
    { '@odata.type': '#microsoft.graph.fileAttachment', name: 'huge.pdf', size: 31 * 1024 * 1024, contentBytes: 'AA==' },
    { '@odata.type': '#microsoft.graph.itemAttachment', name: 'forwarded.msg', size: 10 },
    { '@odata.type': '#microsoft.graph.fileAttachment', name: 'order.txt', size: 2, contentBytes: 'b2s=', contentType: 'text/plain' },
  ] };
  await syncMailbox('team', { connectorId: 'mail', revision: 1, since: 0 }, async () => ({ ok: true }), {
    api: {
      ingest: async (_company, input) => { ingested.push(input); return { id: `source-${ingested.length}` }; },
      mailboxCheckpoint: async (_company, input) => { checkpoints.push(input); return input; },
    },
    getConnector: async () => ({ id: 'mail', kind: 'outlook_mail', status: 'active' }),
    request: async (_company, _connector, spec) => spec.url.includes('/attachments') ? attachments : page,
    importFile: async (_company, file, metadata) => { imported.push({ name: file.name, parentId: metadata.parentId }); },
  });
  assert.deepEqual(ingested.map(item => item.name), ['Contract', 'Order 42'], 'later mail is still read');
  assert.match(ingested[0].error, /huge\.pdf: exceeds 30 MB.*forwarded\.msg: linked or attached emails/);
  assert.equal(ingested[1].error, undefined);
  assert.deepEqual(imported, [{ name: 'order.txt', parentId: 'source-1' }], 'usable attachments are still imported');
  assert.equal(checkpoints.length, 1, 'the mailbox advances past the page');
  assert.equal(checkpoints[0].error, undefined);
});
