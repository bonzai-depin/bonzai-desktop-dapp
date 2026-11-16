import * as companies from '../../../src/main/db/repos/companies.js';
import * as distribution from '../../../src/main/db/repos/distribution.js';
import * as issues from '../../../src/main/db/repos/issues.js';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as repo from '../../../src/main/db/repos/publicSessions.js';
import { get } from './connection.js';
import * as blobs from '../../../src/main/db/blobs.js';
import { registerXChannel, createXTransport, validXRequest } from '../../../src/main/social/xChannel.js';
import { processPublicRequest, publicConversationContext } from '../../../src/services/chat/publicRuntime.js';
import { createMeditation } from '../../../src/services/chat/meditation.js';

const handlers = new Map();
let mode = 'ok', posts = [], uploads = [], failAppend = false;
const transport = async (_agent, input) => {
  if (input.path === '/users/me') return { status: 200, data: { id: '99', username: 'agent' } };
  if (input.path === '/tweets') {
    posts.push(input.body);
    if (mode === 'timeout') return { status: 0, error: 'Timed out' };
    return { status: 201, data: { id: String(900 + posts.length) } };
  }
  if (input.path.includes('/media/')) {
    uploads.push(input);
    if (failAppend && input.path.endsWith('/append')) return { status: 403, error: 'Upload denied' };
    return { status: 200, data: { id: '44', processing_info: { state: 'succeeded' } } };
  }
  return { status: 200, data: [] };
};
registerXChannel({ ipcMain: { handle: (key, fn) => handlers.set(key, fn) }, store: { get: () => 'client', set() {} }, transport, ffmpegPath: () => process.env.BONZAI_FFMPEG || path.resolve('node_modules/ffmpeg-static-electron-forge/dist/bin', process.platform, process.arch, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg') });
const call = (name, ...args) => handlers.get(`social:${name}`)(null, ...args);
await call('public-list');
const settings = { enabled: true, persona: 'Friendly AI meditation guide', media: ['image','audio'], workflows: ['meditation-forge-v1.0.0'], dailyLimit: 50, platformApproved: true };
await call('public-configure', 'a', settings);
get().db.prepare('UPDATE public_agent_sessions SET started_at=?').run('2026-01-01T00:00:00.000Z');
const mention = (id, text = '@agent Please generate an image', author = '123') => ({ id, text, author_id: author, conversation_id: '100', created_at: '2026-09-28T12:00:00.000Z', entities: { mentions: [{ id: '99', username: 'agent' }] } });
repo.ingest('a', { data: [mention('101')], meta: { next_token: 'next' } });
assert.equal(repo.session('a').since_id, null);
repo.ingest('a', { data: [mention('101'), mention('100')], meta: {} });
assert.equal(repo.session('a').since_id, '101'); assert.equal(repo.requests('a').length, 2);
const row = repo.requests('a')[0];
await call('public-claim', row.id);
assert.throws(() => repo.claim(row.id), /changed/);
const saved = blobs.write(Buffer.from([1, 2, 3]), 'png');
const imageResult = { version: 1, title: 'Forest', artifacts: [{ kind: 'image', blobId: saved.id, ext: 'png', mime: 'image/png' }] };
await call('public-complete', row.id, imageResult);
await call('public-publish', row.id);
assert.equal(repo.request(row.id).status, 'posted'); assert.equal(posts[0].reply.in_reply_to_tweet_id, row.post_id); assert.deepEqual(posts[0].media.media_ids, ['44']);
await assert.rejects(call('public-publish', row.id), /changed/); assert.equal(posts.length, 1);

const unknown = repo.nextRequest('a'); repo.claim(unknown.id); await call('public-complete', unknown.id, imageResult);
mode = 'timeout'; await assert.rejects(call('public-publish', unknown.id), /Timed out/);
assert.equal(repo.request(unknown.id).status, 'unknown'); assert.throws(() => call('public-retry', unknown.id), /changed/);
mode = 'ok';
repo.ingest('a', { data: [mention('103')], meta: {} });
const failedUpload = repo.nextRequest('a'); repo.claim(failedUpload.id); await call('public-complete', failedUpload.id, imageResult);
failAppend = true; const postCount = posts.length; await assert.rejects(call('public-publish', failedUpload.id), /Upload denied/); assert.equal(posts.length, postCount); assert.equal(repo.request(failedUpload.id).status, 'review'); failAppend = false;
repo.ingest('a', { data: [mention('104', '@agent stop')], meta: {} });
assert.equal(repo.request(failedUpload.id).status, 'skipped');
repo.ingest('a', { data: [mention('105')], meta: {} }); assert.equal(repo.requests('a').find(r => r.post_id === '105').status, 'skipped');

// Genuine WAV -> ffmpeg MP4 -> X upload/reply. No live network or language model.
repo.ingest('a', { data: [mention('106', '@agent Can I get a meditation?', '456')], meta: {} });
const meditationRequest = repo.nextRequest('a');
const wav = Buffer.alloc(44 + 24000 * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const artifact = blobs.write(wav, 'wav');
const publicAgent = { id: 'a', assignedWorkflowIds: ['meditation-forge-v1.0.0'], privateProfile: 'NEVER SEND THIS', memories: ['PRIVATE'] };
companies.save({ id:'meditation-team', name:'Meditation studio', status:'active', roles:{CEO:{companion:'a'}}, workspace:{executionWorkflowId:'meditation-forge-v1.0.0'} });
await call('public-configure', 'a', {...settings, teamRoutes:[{teamId:'meditation-team',workflowId:'meditation-forge-v1.0.0'}]});
const api = { publicClaim: id => call('public-claim', id), publicTeam: (id,task) => call('public-team',id,task), publicComplete: (id, result, error) => call('public-complete', id, result, error), publicPublish: id => call('public-publish', id) };
await processPublicRequest(repo.session('a'), meditationRequest, [], { api, agents: [publicAgent], catalog: async () => [], startTeam:async()=>{} });
assert.equal(repo.request(meditationRequest.id).status, 'waiting_team');
const ref = repo.request(meditationRequest.id).result.teamTask;
assert.equal(call('public-team',meditationRequest.id,{workflowId:'meditation-forge-v1.0.0'}).result.teamTask.issueId,ref.issueId, 'duplicate delegate keeps one task');
repo.recover(); assert.equal(repo.request(meditationRequest.id).status,'waiting_team','team jobs survive restart');
assert.equal(call('public-team-result',meditationRequest.id).status,'waiting_team','unfinished work must not be presented as a deliverable');
const record = distribution.publish(ref.companyId,{pipeline:'audio',blobId:artifact.id,blobExt:'wav',meta:{issueId:ref.issueId,mimeType:'audio/wav'}});
const privateRecord = distribution.publish(ref.companyId,{pipeline:'text',payload:'PRIVATE COMPANY DATA',meta:{issueId:'another-task'}});
const execution = issues.getById(ref.companyId,ref.issueId).execution;
execution.steps[0].status='completed';execution.steps[0].output={contentIds:[record.id,privateRecord.id]};
get().db.prepare("UPDATE issues SET status='done', execution=? WHERE id=?").run(JSON.stringify(execution),ref.issueId);
call('public-team-result',meditationRequest.id);
assert.equal(repo.request(meditationRequest.id).result.artifacts.length,1,'unrelated company data excluded');
assert.equal(repo.request(meditationRequest.id).status, 'review', repo.request(meditationRequest.id).error);
await call('public-publish', meditationRequest.id);
assert.equal(repo.request(meditationRequest.id).status, 'posted');
assert.equal(uploads.filter(item => item.path.endsWith('initialize')).at(-1).body.media_type, 'video/mp4');
assert.equal(posts.at(-1).reply.in_reply_to_tweet_id, '106');
assert.ok(!publicConversationContext(repo.session('a'), meditationRequest, [{ agent_id: 'a', conversation_id: '100', author_id: 'someone-else', status: 'posted', text: 'PRIVATE' }]).includes('PRIVATE'));
repo.ingest('a', {data:[mention('108','@agent /workflow meditation-forge-v1.0.0','456')],meta:{}});
const unsafe=repo.nextRequest('a');repo.claim(unsafe.id);
assert.throws(()=>call('public-team',unsafe.id,{workflowId:'meditation-forge-v1.0.0',inputs:{image_path:'/private/customer.pdf'}}),/attachments/);
assert.equal(repo.request(unsafe.id).status,'generating','invalid input leaves no delegated job');
repo.transition(unsafe.id,['generating'],'failed');
companies.save({id:'meditation-team',name:'Meditation studio',status:'active',roles:{CEO:{companion:'someone-else'}},workspace:{executionWorkflowId:'meditation-forge-v1.0.0'}});
repo.ingest('a',{data:[mention('109','@agent make a meditation','456')],meta:{}});const revoked=repo.nextRequest('a');repo.claim(revoked.id);
assert.throws(()=>call('public-team',revoked.id,{workflowId:'meditation-forge-v1.0.0',inputs:{}}),/member/);repo.transition(revoked.id,['generating'],'failed');
repo.ingest('a', { data: [mention('107', '@agent Please help', '456')], meta: {} }); const interrupted = repo.nextRequest('a'); repo.claim(interrupted.id); repo.recover(); assert.equal(repo.request(interrupted.id).status, 'failed');

assert.equal(validXRequest({ path: '/users/me', method: 'GET' }), true);
for (const path of ['https://evil.test', '/../oauth2/token', '/users/me/../../secrets', '/tweets/123/likes']) assert.equal(validXRequest({ path }), false);
let attempts = 0, refreshes = 0;
const request = createXTransport({ credentials: () => ({ access_token: 'secret' }), refresh: async () => { refreshes++; }, fetchImpl: async (_url, input) => { assert.equal(input.redirect, 'error'); attempts++; return { status: 401, json: async () => ({}) }; } });
assert.equal((await request('a', { path: '/users/me' })).status, 401); assert.equal(refreshes, 1); assert.equal(attempts, 2);
// A configured zero cap must permit work even after earlier completed requests.
repo.configure('a', {id:'99',username:'agent'}, {...settings, dailyLimit:1});
repo.ingest('a', {data:[mention('991', '@agent please create an image', '789')],meta:{}});
const limited = repo.requests('a').find(item => item.post_id === '991');
assert.throws(() => repo.claim(limited.id), /daily generation limit/);
repo.configure('a', {id:'99',username:'agent'}, {...settings, dailyLimit:0});
assert.equal(repo.session('a').settings.dailyLimit, 0);
assert.equal(repo.claim(limited.id).status, 'generating');
repo.transition(limited.id, ['generating'], 'failed');
repo.configure('a', {id:'99',username:'agent'}, {...settings, dailyLimit:0, automatic:true, platformApproved:false});
assert.equal(repo.session('a').settings.automatic, false, 'automatic default never bypasses platform approval');

console.log('Public sessions: durable mention dedup, image replies, real meditation MP4, opt-out, recovery, private-context isolation, bounded auth refresh passed.');
