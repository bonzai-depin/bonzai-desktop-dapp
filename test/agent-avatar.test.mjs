import test from 'node:test';
import assert from 'node:assert/strict';
import { agentAvatarSource } from '../src/utils/agentAvatar.js';
import { getAgentWorkflowIds } from '../src/services/agentWorkflows.js';

test('team portraits normalize raw generated images while retaining persisted URLs', () => {
  const raw = 'A'.repeat(128);
  assert.equal(agentAvatarSource(raw), 'data:image/png;base64,' + raw);
  for (const url of ['data:image/webp;base64,AAAA', 'bonzai-blob://abc.webp', 'https://example.test/a.png', '/src/assets/a.webp', './assets/a.webp']) {
    assert.equal(agentAvatarSource(url), url);
  }
  assert.equal(agentAvatarSource('/Users/me/portrait.png', 1234), 'http://localhost:1234/media/stream?path=%2FUsers%2Fme%2Fportrait.png');
  assert.equal(agentAvatarSource('C:\\portraits\\me.png', 1234), 'http://localhost:1234/media/stream?path=C%3A%5Cportraits%5Cme.png');
  assert.equal(agentAvatarSource('person'), null);
  assert.equal(agentAvatarSource(null), null);
  assert.equal(agentAvatarSource('iVBORw0KGgo' + 'A'.repeat(40)), 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(40));
});

test('legacy workflow assignments never restrict an agent or hide newly available workflows', () => {
  const catalog = [{ id: 'old' }, { id: 'new' }, { id: 'disabled', disabled: true }];
  assert.deepEqual(getAgentWorkflowIds({ assignedWorkflowIds: ['old'] }, catalog), ['old', 'new']);
  assert.deepEqual(getAgentWorkflowIds({ assignedWorkflowIds: [] }, catalog), ['old', 'new']);
});
