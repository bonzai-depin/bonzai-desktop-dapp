import * as repo from '../db/repos/publicSessions.js';
import * as blobs from '../db/blobs.js';
import { XClient, publicReplyText } from '../../services/social/xClient.js';
import { audioToVideo } from './audioVideo.js';

export function validXRequest({ path, method = 'GET' }) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\\')) return false;
  const url = new URL(`https://api.x.com/2${path}`);
  if (url.origin !== 'https://api.x.com' || !url.pathname.startsWith('/2/')) return false;
  const route = url.pathname.slice(2);
  return method === 'GET' ? /^\/(users\/me|users\/\d+\/mentions|tweets\/\d+|media\/upload)$/.test(route)
    : method === 'POST' ? /^\/(tweets|media\/upload\/initialize|media\/upload\/\d+\/(append|finalize))$/.test(route)
      : method === 'DELETE' && /^\/tweets\/\d+$/.test(route);
}

export function createXTransport({ credentials, refresh, fetchImpl = fetch }) {
  return async (agentId, input) => {
    if (!validXRequest(input)) throw new Error('Unsupported X operation.');
    const run = async retry => {
      let tokens = credentials(agentId);
      if (!tokens?.access_token) throw new Error('Connect this smart agent to X first.');
      if (!retry && tokens.expires_at && tokens.expires_at <= Date.now()) { await refresh(agentId); tokens = credentials(agentId); }
      const response = await fetchImpl(`https://api.x.com/2${input.path}`, { method: input.method || 'GET', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' }, ...(input.body && { body: JSON.stringify(input.body) }) });
      if (response.status === 401 && !retry) { await refresh(agentId); return run(true); }
      const data = await response.json().catch(() => ({}));
      return { ...data, status: response.status };
    };
    try { return await run(false); } catch (error) { return { status: 0, error: error.message }; }
  };
}

export function registerXChannel({ ipcMain, store, transport, ffmpegPath }) {
  const clients = id => new XClient(input => transport(id, input));
  const polling = new Set();
  let recovered = false;
  ipcMain.handle('social:x-request', (_e, agentId, input) => transport(agentId, input));
  ipcMain.handle('social:x-client', (_e, clientId) => {
    if (clientId !== undefined) {
      if (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{5,200}$/.test(clientId)) throw new Error('Enter the OAuth 2.0 client ID from your X developer app.');
      store.set('social-x-client-id', clientId);
    }
    return { clientId: store.get('social-x-client-id', ''), redirectUri: 'bonzai://social/callback/x' };
  });
  ipcMain.handle('social:public-list', () => {
    if (!recovered) { repo.recover(); recovered = true; }
    return repo.sessions();
  });
  ipcMain.handle('social:public-configure', async (_e, agentId, settings) => repo.configure(agentId, await clients(agentId).me(), settings));
  ipcMain.handle('social:public-pause', (_e, agentId) => repo.pause(agentId));
  ipcMain.handle('social:public-requests', (_e, agentId) => repo.requests(agentId));
  ipcMain.handle('social:public-next', (_e, agentId) => repo.nextRequest(agentId));
  ipcMain.handle('social:public-poll', async (_e, agentId) => {
    const active = repo.session(agentId);
    if (!active?.settings.enabled || polling.has(agentId) || Date.now() - active.checked_at < 60000) return;
    polling.add(agentId);
    try {
      // One page per minute bounds X API use; the durable page token preserves backlog.
      const data = await clients(agentId).mentions(active.account_id, { sinceId: active.since_id, page: active.next_page, startTime: active.started_at });
      repo.ingest(agentId, data);
    } catch (error) { repo.pollError(agentId, error.message); throw error; }
    finally { polling.delete(agentId); }
  });
  ipcMain.handle('social:public-claim', (_e, id) => repo.claim(id));
  ipcMain.handle('social:public-complete', (_e, id, result, error) => {
    if (!error && (!result?.version || !Array.isArray(result.artifacts) || (!result.text && !result.artifacts.length))) throw new Error('No deliverable was produced.');
    if (JSON.stringify(result || {}).length > 2 * 1024 * 1024) throw new Error('Store media as local artifacts before completing the request.');
    return repo.transition(id, ['generating'], error ? 'failed' : 'review', { result, error });
  });
  ipcMain.handle('social:public-dismiss', (_e, id) => repo.transition(id, ['pending', 'review', 'failed', 'unknown'], 'skipped', { error: 'Dismissed by owner' }));
  ipcMain.handle('social:public-retry', (_e, id) => repo.transition(id, ['failed'], 'pending'));
  ipcMain.handle('social:public-edit', (_e, id, text) => {
    const row = repo.request(id);
    if (!row?.result) throw new Error('No saved reply to edit.');
    const result = { ...row.result, replyText: String(text || '').trim() };
    publicReplyText(result);
    return repo.transition(id, ['review'], 'review', { result });
  });
  ipcMain.handle('social:public-publish', async (_e, id, automatic = false) => {
    const initial = repo.request(id);
    const active = initial && repo.session(initial.agent_id);
    if (!active?.settings.platformApproved) throw new Error('X requires written approval for AI reply bots before generated replies can be published.');
    if (automatic && !active.settings.automatic) throw new Error('Automatic replies are not enabled.');
    const row = repo.claim(id, 'preparing');
    const client = clients(row.agent_id);
    let dispatched = false;
    try {
      const me = await client.me();
      if (me.id !== active.account_id) throw new Error('The connected X account changed. Reconnect the original account.');
      const result = row.result;
      const text = publicReplyText(result);
      const read = artifact => {
        if (!/^[a-f0-9]{64}$/.test(artifact.blobId || '') || !/^(png|jpg|webp|wav|mp3|mp4)$/.test(artifact.ext || '')) throw new Error('Reply media is not a saved local artifact.');
        return blobs.read(artifact.blobId, artifact.ext);
      };
      const audio = result.artifacts.find(item => item.kind === 'audio');
      const video = result.artifacts.find(item => item.kind === 'video');
      const images = result.artifacts.filter(item => item.kind === 'image');
      if (result.artifacts.some(item => ['3d'].includes(item.kind))) throw new Error('X cannot attach this project. It remains available in BonzAI.');
      const mediaIds = [];
      if (audio) {
        const wrapped = await audioToVideo({ audio: read(audio), coverImage: images[0] ? read(images[0]) : null }, ffmpegPath());
        mediaIds.push(await client.upload(wrapped, 'video/mp4'));
      } else if (video) mediaIds.push(await client.upload(read(video), video.mime));
      else for (const image of images.slice(0, 4)) mediaIds.push(await client.upload(read(image), image.mime));
      // Re-check pause/opt-out after slow inference/transcoding/upload; no post if the owner paused.
      const current = repo.session(row.agent_id);
      if (!current?.settings.enabled || !current.settings.platformApproved || (automatic && !current.settings.automatic)) throw new Error('Public replies were paused during media preparation.');
      repo.transition(id, ['preparing'], 'publishing');
      dispatched = true;
      const posted = await client.post(text, { replyTo: row.post_id, mediaIds });
      return repo.transition(id, ['publishing'], 'posted', { replyId: posted.postId });
    } catch (error) {
      // A network failure after POST may mean X accepted it. Never blindly post twice.
      const uncertain = dispatched && (!error.status || error.status >= 500);
      const latest = repo.request(id);
      if (['preparing', 'publishing'].includes(latest?.status)) repo.transition(id, [latest.status], uncertain ? 'unknown' : 'review', { error: error.message });
      throw error;
    }
  });
  ipcMain.handle('social:wrap-audio-video', async (_e, input) => new Uint8Array(await audioToVideo(input, ffmpegPath())));
}
