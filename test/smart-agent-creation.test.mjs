import test from 'node:test';
import assert from 'node:assert/strict';
import { creationRequest, executeCreation, CREATE_PIPELINES } from '../src/services/company/createCapabilities.js';
import { projectCompanion, SMART_AGENT_CREATE_CAPABILITIES } from '../src/services/smartAgentCatalog.js';
import { getAgentWorkflowIds, normalizeAssignedWorkflowIds } from '../src/services/agentWorkflows.js';
import { gateAction, requiresOwnerApproval, approve, consumeOwnerApproval } from '../src/services/company/governance.solo.js';

const mock = (overrides = {}) => ({ acquire: () => true, release: () => {}, chat: async () => 'Completed draft', request: async () => ({ image_base64: 'aW1hZ2U=' }), ...overrides });

const workflows = [{ id: 'video-captioning-v1.0.0' }, { id: 'roleplay-companion-v1.0.0' }];

test('company projects the existing companion identity, token and real workflows without a second agent record', () => {
  const companion = { id: 'custom-maya', firstName: 'Maya', familyName: 'Studio', shortBio: 'Product photography', tokenId: 0, chainId: 4663, contractAddress: '0x0000000000000000000000000000000000000002', tokenSymbol: 'MAYA', tokenAddress: '0x0000000000000000000000000000000000000001', assignedWorkflowIds: ['video-captioning-v1.0.0', 'video-captioning-v1.0.0', 'skill.notion_docs'], capabilities: [] };
  const agent = projectCompanion(companion, workflows);
  assert.deepEqual(agent.capabilities, [...SMART_AGENT_CREATE_CAPABILITIES]);
  assert.ok(agent.capabilities.every(cap => CREATE_PIPELINES.includes(cap)));
  assert.deepEqual(agent.assignedWorkflowIds, workflows.map(w => w.id));
  assert.equal(agent.id, companion.id);
  assert.equal(agent.name, 'Maya Studio');
  assert.equal(agent.mission, companion.shortBio);
  assert.equal(agent.tokenId, 0, 'Legacy token zero is preserved as a reference; live verification still decides eligibility');
  assert.equal(agent.tokenAddress, companion.tokenAddress);
  assert.equal(agent.tokenSymbol, companion.tokenSymbol);
  assert.equal(agent.isLocal, false);
  assert.equal(companion.assignedWorkflowIds.length, 3, 'Projection does not overwrite the saved companion');
});

test('all agents share the available catalog regardless of legacy workflow assignments', () => {
  assert.deepEqual(normalizeAssignedWorkflowIds(['video-captioning-v1.0.0', 'skill.notion_docs', 'missing', 'video-captioning-v1.0.0'], workflows), ['video-captioning-v1.0.0']);
  assert.deepEqual(getAgentWorkflowIds({ id: 'maya', assignedWorkflowIds: [] }, workflows), workflows.map(w => w.id));
  assert.deepEqual(getAgentWorkflowIds({ id: 'custom-maya' }, workflows), workflows.map(w => w.id));
});

test('model output cannot invent arbitrary endpoints or start downloads', () => {
  assert.throws(() => creationRequest({ pipeline: 'network', endpoint: 'https://example.com' }), /Unknown Create/);
  assert.throws(() => creationRequest({ pipeline: 'image', prompt: 'x', mode: '../../delete' }), /Unsupported/);
  const request = creationRequest({ pipeline: 'image', prompt: 'product', params: { auto_download: true } });
  assert.equal(request.endpoint, '/image/turbo');
  assert.equal(request.params.auto_download, false);
});

test('each supported media mode routes to its real Create endpoint', () => {
  const cases = [
    ['image', 'turbo_edit', '/image/image/turbo'], ['image', 'quality', '/image/quality'],
    ['audio', 'design', '/audio/quality/design'], ['audio', 'clone', '/audio/quality/clone'],
    ['audio', 'music', '/audio/music'], ['video', 'sota', '/video/sota'],
    ['video', 'quality', '/video/quality'], ['vision', 'ocr', '/vision/ocr'],
  ];
  for (const [pipeline, mode, endpoint] of cases) assert.equal(creationRequest({ pipeline, mode, prompt: 'brief' }).endpoint, endpoint);
});

test('local engine results become real artifacts and release the device on failure', async () => {
  let releases = 0;
  const action = { pipeline: 'image', prompt: 'product photograph' };
  const out = await executeCreation(action, {}, mock({ release: () => releases++ }));
  assert.equal(out.payload, 'aW1hZ2U=');
  assert.equal(out.meta.payloadEncoding, 'base64');
  await assert.rejects(executeCreation(action, {}, mock({ request: async () => { throw new Error('Download required'); }, release: () => releases++ })), /Download required/);
  assert.equal(releases, 2);
  await assert.rejects(executeCreation(action, {}, mock({ request: async () => ({ useLocal: true }) })), /no artifact/);
});

test('file outputs retain their encoding instead of being treated as base64', async () => {
  const out = await executeCreation({ pipeline: 'audio', prompt: 'Hello' }, {}, mock({ request: async () => ({ audio_path: '/local/voice.wav' }) }));
  assert.equal(out.meta.payloadEncoding, 'path');
  assert.equal(out.payload, '/local/voice.wav');
});

test('training needs a real dataset and owner approval; acceptance is not completion', async () => {
  assert.throws(() => creationRequest({ pipeline: 'fineTune', params: { base_model: 'qwen3_5_9b' } }), /dataset/);
  const action = { pipeline: 'fineTune', params: { dataset_id: 'approved-dataset', base_model: 'qwen3_5_9b' } };
  await assert.rejects(executeCreation(action, {}, mock()), /owner approval/);
  await assert.rejects(executeCreation(action, { approved: true }, mock({ request: async () => ({ training_id: 'job' }) })), /not produced a completed model/);
  const out = await executeCreation(action, { approved: true }, mock({ request: async () => ({ training_id: 'job', model_id: 'trained-model' }) }));
  assert.equal(out.meta.status, 'completed');
  assert.equal(out.meta.modelId, 'trained-model');
});

test('new jobs cannot overlap a busy device or read unapproved local paths', async () => {
  await assert.rejects(executeCreation({ pipeline: 'text', prompt: 'Draft' }, {}, mock({ acquire: () => false })), /Another creation/);
  await assert.rejects(executeCreation({ pipeline: 'audio', mode: 'clone', prompt: 'Hello', params: { ref_audio_path: '/private/recording.wav' } }, {}, mock()), /owner approval/);
});

test('3D and skill creation preserve inspectable source artifacts', async () => {
  const out = await executeCreation({ pipeline: '3d', prompt: 'Display stand' }, {}, mock({ chat: async () => '```javascript\nexport default async function generate(params) { return new params.THREE.Group(); }\n```' }));
  assert.match(out.payload, /^export default/);
  assert.equal(out.meta.format, 'javascript');
  assert.equal(out.meta.payloadEncoding, 'text');
});

test('training and asset references cannot bypass approvals through AUTO or a missing database', async () => {
  const previous = globalThis.window;
  globalThis.window = { electronAPI: {} };
  try {
    for (const action of [
      { type: 'produce', pipeline: 'fineTune' },
      { type: 'runFineTune' },
      { type: 'produce', pipeline: 'image', params: { image_url: 'https://example.com/image.png' } },
    ]) {
      const result = await gateAction('company', { rules: { vetoMode: { 'produce.fineTune': 'auto' } } }, action);
      assert.equal(result.pass, false);
      assert.equal(result.degraded, true);
    }
    assert.equal((await gateAction('company', { rules: {} }, { type: 'produce', pipeline: 'text' })).pass, true);
  } finally { globalThis.window = previous; }
});

test('granting skills never grants permission to send, charge, publish or alter external records', () => {
  for (const type of ['email.send', 'stripe.refund', 'stripe.chargeOnFile', 'hubspot.upsertContact', 'notion.appendBlock', 'gcal.createEvent', 'publishContent', 'paySupplier', 'smartAgent.acceptJob']) {
    assert.equal(requiresOwnerApproval({ type }), true, type);
  }
  for (const type of ['qbo.reportAR', 'gcal.findSlots', 'shopify.listOrders', 'notion.queryDB']) assert.equal(requiresOwnerApproval({ type }), false, type);
  assert.equal(requiresOwnerApproval({ type: 'produce', pipeline: 'text' }), false);
});

test('an approval authorizes only its exact company, action details and one execution', async () => {
  const previous = globalThis.window;
  globalThis.window = { dispatchEvent() {}, electronAPI: { db: { approvals: { approve: async () => ({ type: 'smartAgent.acceptJob', jobId: 'funded-job', agentId: 'maya' }) }, audit: { append: async () => ({}) } } } };
  try {
    const action = await approve('company', 'approval-1');
    assert.equal(consumeOwnerApproval('other-company', 'approval-1', action), false);
    assert.equal(consumeOwnerApproval('company', 'approval-1', { ...action }), false);
    action.jobId = 'different-job';
    assert.equal(consumeOwnerApproval('company', 'approval-1', action), false);
    action.jobId = 'funded-job';
    assert.equal(consumeOwnerApproval('company', 'approval-1', action), true);
    assert.equal(consumeOwnerApproval('company', 'approval-1', action), false);
  } finally { globalThis.window = previous; }
});

test('a launch remains bound to its reviewed payer and chain across wallet prompts', async () => {
  const { assertLaunchWallet } = await import('../src/services/smartAgentLaunch.js');
  const payer = '0x0000000000000000000000000000000000000001';
  let accounts = [payer], chain = '0x1237';
  const web3 = { getEip1193Provider: () => ({ request: async ({ method }) => method === 'eth_accounts' ? accounts : chain }) };
  await assertLaunchWallet(web3, 4663, payer);
  accounts = ['0x0000000000000000000000000000000000000002'];
  await assert.rejects(assertLaunchWallet(web3, 4663, payer), /wallet changed/);
  accounts = [payer]; chain = '0x1';
  await assert.rejects(assertLaunchWallet(web3, 4663, payer), /network changed/);
  await assert.rejects(assertLaunchWallet(web3, 4663, null), /Connect a wallet/);
});

test('launch recovery cannot treat unrelated logs or unknown confirmation as a new launch opportunity', async () => {
  const { parseSmartAgentLaunchReceipt } = await import('../src/services/smartAgentLaunch.js');
  const { Interface } = await import('ethers');
  const abi = new Interface([
    'event CompanionMinted(uint256 indexed tokenId, address indexed creator, uint8 gender, uint96 indexed spendingProfile, string metadataURI)',
    'event CompanionEconomyLaunched(uint256 indexed tokenId, address indexed token, bytes32 indexed poolId, uint256 liquidity)',
  ]);
  const address = '0x0000000000000000000000000000000000000001';
  const token = '0x0000000000000000000000000000000000000002';
  const logs = [
    { address, ...abi.encodeEventLog(abi.getEvent('CompanionMinted'), [0, address, 0, 0, 'data:application/json,{}']) },
    { address, ...abi.encodeEventLog(abi.getEvent('CompanionEconomyLaunched'), [0, token, '0x' + '00'.repeat(32), 1]) },
  ];
  assert.equal(parseSmartAgentLaunchReceipt(null, address, abi).pending, true);
  assert.equal(parseSmartAgentLaunchReceipt({ status: 0, logs }, address, abi).reverted, true);
  assert.equal(parseSmartAgentLaunchReceipt({ status: 1, logs: logs.map(log => ({ ...log, address: token })) }, address, abi).pending, true);
  const result = parseSmartAgentLaunchReceipt({ status: 1, hash: '0xreceipt', logs }, address, abi);
  assert.equal(result.success, true);
  assert.equal(result.tokenId, '0');
  assert.equal(result.tokenAddress, token);
});

test('licensed knowledge informs media without being read verbatim or routed to an external provider', async () => {
  const calls=[]; let released=0;
  const output=await executeCreation({pipeline:'audio',prompt:'Explain compressor checks in one short paragraph.'},{localOnly:true,instructions:'PRIVATE SOURCE: long proprietary manual'},mock({
    chat:async(prompt,options)=>{calls.push({prompt,options});return '<think>internal</think>Check pressure before replacing the compressor.';},
    request:async(endpoint,payload,options)=>{calls.push({endpoint,payload,options});return {audio_base64:'YXVkaW8='};},release:()=>released++,
  }));
  assert.match(calls[0].prompt,/PRIVATE SOURCE/);assert.equal(calls[0].options.localOnly,true);
  assert.equal(calls[1].payload.text,'Check pressure before replacing the compressor.');assert.doesNotMatch(JSON.stringify(calls[1].payload),/PRIVATE SOURCE|think/);assert.equal(calls[1].options.localOnly,true);
  assert.equal(output.pipeline,'audio');assert.equal(released,1);
});
test('private model selection survives creation routing and cannot fall back after failure',async()=>{
  const model={binding:{id:'original'},asset:{digest:'fixed'}};let requests=0,releases=0;
  await assert.rejects(()=>executeCreation({pipeline:'3d',prompt:'Build a room'},{localOnly:true,serviceModel:model},mock({chat:async(_,options)=>{assert.equal(options.serviceModel,model);assert.equal(options.localOnly,true);throw new Error('Original changed');},request:async()=>{requests++;},release:()=>releases++})),/Original changed/);
  assert.equal(requests,0);assert.equal(releases,1);
});
