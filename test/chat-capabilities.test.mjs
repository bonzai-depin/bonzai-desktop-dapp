import test from 'node:test';
import assert from 'node:assert/strict';
import { chatRequest, runChatCapability, MEDITATION_ID } from '../src/services/chat/capabilities.js';
import { createMeditation } from '../src/services/chat/meditation.js';
import { creationRequest } from '../src/services/company/createCapabilities.js';
import { XClient, publicReplyText } from '../src/services/social/xClient.js';
import { socialCredentialVault } from '../src/main/social/credentials.js';

test('mentions and local chat route actual media and meditation requests, not ordinary roleplay references', () => {
  assert.equal(chatRequest('@bonzai Please draw me an image of a calm forest').pipeline, 'image');
  assert.deepEqual(chatRequest('@bonzai Can I get a 5-minute meditation?'), { kind: 'workflow', workflowId: MEDITATION_ID, inputs: { intention: 'Can I get a 5-minute meditation?', duration: 5, environment: 'a peaceful natural setting' } });
  for (const pipeline of ['image','audio','music','video','3d','vision']) assert.equal(chatRequest(`/${pipeline} something`).pipeline, pipeline);
  assert.equal(chatRequest('I enjoyed the meditation yesterday.'), null);
  assert.throws(() => chatRequest('/workflow abc bad JSON'), /JSON object/);
});
test('Kokoro gets its real prompt field (not only a text field)', () => {
  const request = creationRequest({ pipeline: 'audio', mode: 'turbo', prompt: 'Breathe slowly.' });
  assert.equal(request.params.prompt, 'Breathe slowly.');
  assert.equal(request.params.auto_download, false);
});
test('Meditation Forge produces narration and cover; missing audio fails instead of claiming success', async () => {
  const steps = [];
  const create = async action => { steps.push(action); const target = Number(action.prompt.match(/approximately (\d+) words/)?.[1]) || 225; return { pipeline: action.pipeline, payload: action.pipeline === 'text' ? `${Array(target).fill('Breathe').join(' ')}.` : 'encoded-media', meta: { payloadEncoding: action.pipeline === 'text' ? 'text' : 'base64', durationSeconds: action.params?.target_duration_seconds || null } }; };
  const result = await createMeditation({ duration: 3, intention: 'Relax' }, {}, create);
  assert.equal(result.success, true); assert.equal(result.artifacts[0].pipeline, 'audio');
  assert.equal(steps[1].mode, 'turbo'); assert.equal(steps[1].prompt, result.meditation.script);
  await assert.rejects(createMeditation({ duration: 3 }, {}, async action => { if (action.pipeline === 'audio') throw new Error('audio download required'); return create(action); }), /audio download required/);
  const partial = await createMeditation({ duration: 1 }, {}, async action => { if (action.pipeline === 'image') throw new Error('image unavailable'); return create(action); });
  assert.equal(partial.artifacts.length, 1); assert.equal(partial.warnings.length, 1);
  await assert.rejects(createMeditation({ duration: 100 }, {}, create), /30 seconds to 15 minutes/);
  assert.equal(result.meditation.durationSeconds, 180);
  assert.equal(steps[1].params.target_duration_seconds, 180);
});
test('public requests respect explicit session workflow and media permissions', async () => {
  const catalog = [{ id: MEDITATION_ID, name: 'Meditation Forge' }];
  const deps = { catalog: async () => catalog };
  await assert.rejects(runChatCapability({ kind: 'workflow', workflowId: MEDITATION_ID }, { agent: { id: 'a', assignedWorkflowIds: [] }, workflowIds: [] }, deps), /not enabled/);
  await assert.rejects(runChatCapability({ kind: 'create', pipeline: 'image', prompt: 'x' }, { enabledMedia: [] }), /not enabled/);
  await assert.rejects(runChatCapability({ kind: 'create', pipeline: '3d', prompt: 'x' }, { channel: 'x' }), /local chat workspace/);
});
test('a meditation chat result includes saved playable artifacts, not just an execution acknowledgement', async () => {
  const skill = { id: MEDITATION_ID, name: 'Meditation Forge' };
  const result = await runChatCapability({ kind: 'workflow', workflowId: MEDITATION_ID }, { agent: { id: 'a', assignedWorkflowIds: [] } }, {
    catalog: async () => [skill], service: async () => ({ validateSkillInputs: () => ({ valid: true, normalizedInputs: {} }), executeSkill: async () => ({ success: true, result: { meditation: { title: 'Calm', script: 'Breathe', narration: 'abc' }, artifacts: [{ pipeline: 'audio', payload: 'abc' }] } }) }),
    persist: async output => ({ kind: output.pipeline, blobId: 'saved-blob' }),
  });
  assert.equal(result.artifacts[0].blobId, 'saved-blob'); assert.equal(result.text, 'Breathe');
});
test('X uploads every segment and preserves the mention reply target for media', async () => {
  const calls = [];
  const client = new XClient(async input => { calls.push(input); if (input.path === '/tweets') return { status: 201, data: { id: '777' } }; return { status: 200, data: { id: '123', processing_info: { state: 'succeeded' } } }; });
  const id = await client.upload(new Uint8Array(5 * 1024 * 1024), 'video/mp4');
  const result = await client.post('Your meditation', { replyTo: '456', mediaIds: [id] });
  assert.equal(calls.filter(item => /append/.test(item.path)).length, 2);
  assert.deepEqual(calls.at(-1).body.reply, { in_reply_to_tweet_id: '456' });
  assert.deepEqual(calls.at(-1).body.media, { media_ids: ['123'] }); assert.equal(result.postId, '777');
});
test('failed uploads and uncertain post responses are never treated as published', async () => {
  const client = new XClient(async input => input.path.includes('append') ? { status: 403, detail: 'Denied' } : { status: 200, data: { id: '123' } });
  await assert.rejects(client.upload(new Uint8Array([1]), 'image/png'), /Denied/);
  await assert.rejects(new XClient(async () => ({ status: 200 })).post('Hello'), error => error.status === 0);
  assert.throws(() => publicReplyText({ text: 'x'.repeat(300), artifacts: [] }), /too long/);
});
test('social tokens migrate to encrypted storage without exposing their plaintext', () => {
  let value = { 'x:a': { access_token: 'private-token' } };
  const store = { get: () => value, set: (_key, v) => { value = v; } };
  const encryption = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text.split('').reverse().join('')), decryptString: bytes => bytes.toString().split('').reverse().join('') };
  const vault = socialCredentialVault(store, encryption);
  assert.equal(vault.read('x', 'a').access_token, 'private-token');
  assert.ok(value['x:a'].encrypted); assert.ok(!JSON.stringify(value).includes('private-token'));
  assert.equal(vault.read('x', 'a').access_token, 'private-token');
  assert.throws(() => socialCredentialVault(store, { isEncryptionAvailable: () => false }).write('x', 'a', {}), /unavailable/);
});

test('roleplay Create preserves portrait conditioning and routes video through Wan', async () => {
  const actions = [];
  const deps = {
    create: async action => { actions.push(action); return { pipeline: action.pipeline, payload: 'output' }; },
    persist: async output => ({ ...output, url: 'bonzai-blob://output' }),
  };
  await runChatCapability({ kind: 'create', pipeline: 'image', prompt: 'In a garden' },
    { referenceImage: 'portrait' }, deps);
  assert.equal(actions[0].mode, 'turbo_edit');
  assert.equal(actions[0].params.image_base64, 'portrait');
  await runChatCapability({ kind: 'create', pipeline: 'video', prompt: 'Wave hello' },
    { image: 'scene-frame', mediaModes: { video: 'quality' } }, deps);
  assert.equal(actions[1].mode, 'quality');
  assert.equal(actions[1].params.image_base64, 'scene-frame');
  assert.equal(actions.length, 2, 'Video must not generate voice implicitly');
});
