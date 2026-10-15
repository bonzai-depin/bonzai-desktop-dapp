import { get } from '../connection.js';
import crypto from 'node:crypto';

const parseSession = row => row && ({ ...row, settings: JSON.parse(row.settings) });
const parseRequest = row => row && ({ ...row, result: row.result ? JSON.parse(row.result) : null });
export function sessions() { return get().db.prepare('SELECT * FROM public_agent_sessions').all().map(parseSession); }
export function session(agentId) { return parseSession(get().db.prepare('SELECT * FROM public_agent_sessions WHERE agent_id = ?').get(agentId)); }
export function configure(agentId, account, settings) {
  if (!agentId || !/^\d+$/.test(account?.id || '') || !/^\w{1,15}$/.test(account?.username || '')) throw new Error('A verified X account is required.');
  const previous = session(agentId);
  if (previous && previous.account_id !== account.id) throw new Error('This agent session belongs to another X account. Reconnect that account to preserve reply history.');
  const safe = {
    enabled: settings.enabled === true,
    persona: String(settings.persona || '').trim().slice(0, 2000),
    media: [...new Set((settings.media || []).filter(type => ['image', 'audio', 'music', 'video'].includes(type)))],
    workflows: [...new Set((settings.workflows || []).filter(id => typeof id === 'string').slice(0, 30))],
    dailyLimit: Math.max(1, Math.min(50, Math.floor(Number(settings.dailyLimit) || 5))),
    // Review is intentionally the default. Automatic activation requires a distinct explicit setting.
    automatic: settings.automatic === true && settings.platformApproved === true,
    platformApproved: settings.platformApproved === true,
  };
  if (safe.enabled && !safe.persona) throw new Error('Write the public persona before enabling this session.');
  get().db.prepare(`INSERT INTO public_agent_sessions(agent_id,account_id,username,settings,started_at) VALUES(?,?,?,?,?)
    ON CONFLICT(agent_id) DO UPDATE SET username=excluded.username, settings=excluded.settings`).run(agentId, account.id, account.username, JSON.stringify(safe), new Date().toISOString());
  return session(agentId);
}
export function pause(agentId) {
  const row = session(agentId);
  if (!row) return;
  row.settings.enabled = false;
  get().db.prepare('UPDATE public_agent_sessions SET settings=? WHERE agent_id=?').run(JSON.stringify(row.settings), agentId);
}
export function requests(agentId, limit = 100) { return get().db.prepare('SELECT * FROM public_agent_requests WHERE agent_id=? ORDER BY created_at DESC LIMIT ?').all(agentId, Math.min(200, limit)).map(parseRequest); }
export function request(id) { return parseRequest(get().db.prepare('SELECT * FROM public_agent_requests WHERE id=?').get(id)); }
export function nextRequest(agentId) { return parseRequest(get().db.prepare("SELECT * FROM public_agent_requests WHERE agent_id=? AND status='pending' ORDER BY created_at LIMIT 1").get(agentId)); }
export function pollError(agentId, error) { get().db.prepare('UPDATE public_agent_sessions SET error=?, checked_at=? WHERE agent_id=?').run(String(error).slice(0, 1000), Date.now(), agentId); }
export function ingest(agentId, response) {
  const db = get().db;
  return db.transaction(() => {
    const active = session(agentId);
    if (!active?.settings.enabled) return;
    let highest = active.page_high || active.since_id;
    for (const post of response.data || []) {
      if (!/^\d+$/.test(post.id || '')) continue;
      if (!highest || BigInt(post.id) > BigInt(highest)) highest = post.id;
      if (!post.author_id || post.author_id === active.account_id || !post.created_at || post.created_at < active.started_at) continue;
      if (!post.entities?.mentions?.some(item => item.id === active.account_id || item.username?.toLowerCase() === active.username.toLowerCase())) continue;
      const clean = String(post.text || '').replace(/@\w+/g, '').trim();
      const stop = /^(stop|unsubscribe|opt out|do not reply|don't reply)[.!\s]*$/i.test(clean);
      if (stop) {
        db.prepare('INSERT OR IGNORE INTO public_agent_optouts(agent_id,author_id) VALUES(?,?)').run(agentId, post.author_id);
        db.prepare("UPDATE public_agent_requests SET status='skipped',error='User opted out',updated_at=? WHERE agent_id=? AND author_id=? AND status IN ('pending','generating','review','preparing','failed')").run(Date.now(), agentId, post.author_id);
      }
      const optedOut = db.prepare('SELECT 1 FROM public_agent_optouts WHERE agent_id=? AND author_id=?').get(agentId, post.author_id);
      const invited = /[?？]|\b(please|create|make|generate|draw|send|give|meditate|help|tell|explain|can you|could you|want|need)\b|^\//i.test(clean);
      const status = stop || optedOut || !invited ? 'skipped' : 'pending';
      db.prepare('INSERT OR IGNORE INTO public_agent_requests(id,agent_id,post_id,author_id,conversation_id,text,status,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), agentId, post.id, post.author_id, post.conversation_id || post.id, String(post.text).slice(0, 10000), status, stop || optedOut ? 'User opted out' : !invited ? 'Mention did not request a reply' : null, Date.parse(post.created_at), Date.now());
    }
    // The since cursor only advances after the last page. A crash re-fetches safely (unique post ID).
    db.prepare('UPDATE public_agent_sessions SET since_id=?,next_page=?,page_high=?,checked_at=?,error=NULL WHERE agent_id=?').run(response.meta?.next_token ? active.since_id : highest, response.meta?.next_token || null, response.meta?.next_token ? highest : null, Date.now(), agentId);
  })();
}
export function transition(id, from, status, { result, error = null, replyId } = {}) {
  const row = request(id);
  if (!row || !from.includes(row.status)) throw new Error('This request has already changed. Refresh the session.');
  const change = get().db.prepare(`UPDATE public_agent_requests SET status=?, result=?, error=?, reply_id=?, updated_at=? WHERE id=? AND status=?`).run(status, result ? JSON.stringify(result) : row.result ? JSON.stringify(row.result) : null, error, replyId || row.reply_id, Date.now(), id, row.status);
  if (!change.changes) throw new Error('Request is already being handled.');
  return request(id);
}
export function claim(id, phase = 'generating') {
  return get().db.transaction(() => {
    const row = request(id);
    const active = row && session(row.agent_id);
    if (!active?.settings.enabled) throw new Error('Public session is paused.');
    if (get().db.prepare('SELECT 1 FROM public_agent_optouts WHERE agent_id=? AND author_id=?').get(row.agent_id, row.author_id)) throw new Error('This user opted out.');
    const count = get().db.prepare("SELECT COUNT(*) AS count FROM public_agent_requests WHERE agent_id=? AND updated_at>=? AND status IN ('generating','review','preparing','publishing','posted','unknown','failed')").get(row.agent_id, Date.now() - 86400000).count;
    if (phase === 'generating' && count >= active.settings.dailyLimit) throw new Error('The daily generation limit has been reached.');
    return transition(id, phase === 'generating' ? ['pending'] : ['review'], phase);
  })();
}
export function recover() {
  const db = get().db;
  db.prepare("UPDATE public_agent_requests SET status='failed',error='Interrupted before publishing. Review and retry locally.' WHERE status='generating'").run();
  db.prepare("UPDATE public_agent_requests SET status='review',error='Media preparation interrupted. No post was dispatched.' WHERE status='preparing'").run();
  db.prepare("UPDATE public_agent_requests SET status='unknown',error='Publishing was interrupted. Check X before resolving; automatic retry is disabled.' WHERE status='publishing'").run();
}
