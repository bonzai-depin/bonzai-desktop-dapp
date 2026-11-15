/** Owner attention: tells the owner, outside the app window, that an agent
 * team is waiting on them. The query and the plan are pure so the "notify
 * once, remind daily, stay quiet after a restart" rule can be tested. */

export const OWNER_ATTENTION_STATE_KEY = 'company.ownerAttention.notified';
export const OWNER_ATTENTION_SETTING_KEY = 'company.ownerNotifications';
export const REMIND_AFTER_MS = 24 * 60 * 60 * 1000;

const ACTIVE_TEAM = `c.status='active' AND COALESCE(c.demo_mode,0)=0
  AND COALESCE(CASE WHEN json_valid(c.charter) THEN json_extract(c.charter,'$.demoRun') END,0)=0`;

const parse = value => {
  if (!value || typeof value !== 'string') return value || null;
  try { return JSON.parse(value); } catch { return null; }
};

/** Everything currently waiting on the owner, for active non-demo teams.
 * @returns {{key:string,companyId:string,companyName:string,kind:'approval'|'question'|'review'|'failed',title:string,since:number}[]} */
export function queryOwnerAttention(db) {
  const items = [];
  const approvalTasks = new Set();
  const approvals = db.prepare(`SELECT p.id, p.cls, p.issue_id AS issueId, p.requested_at AS since, i.title,
      c.id AS companyId, c.name AS companyName
    FROM pending_approvals p JOIN companies c ON c.id=p.company_id
    LEFT JOIN issues i ON i.id=p.issue_id AND i.company_id=p.company_id
    WHERE p.status='pending' AND ${ACTIVE_TEAM}
    ORDER BY p.requested_at, p.id`).all();
  for (const row of approvals) {
    if (row.issueId) approvalTasks.add(row.issueId);
    items.push({ key: `approval:${row.id}`, companyId: row.companyId, companyName: row.companyName,
      kind: 'approval', title: row.title || row.cls, since: Number(row.since) || 0 });
  }
  const blocked = db.prepare(`SELECT i.id, i.title, i.execution, i.attempt_count AS attempts, i.max_attempts AS maxAttempts,
      i.updated_at AS since, c.id AS companyId, c.name AS companyName
    FROM issues i JOIN companies c ON c.id=i.company_id
    WHERE i.status='blocked' AND ${ACTIVE_TEAM}
    ORDER BY i.updated_at, i.id`).all();
  for (const row of blocked) {
    const execution = parse(row.execution);
    const base = { companyId: row.companyId, companyName: row.companyName, title: row.title, since: Number(row.since) || 0 };
    if (execution?.agent?.status === 'waiting_owner') {
      // A second question on the same task is a new request, not a reminder.
      const asked = Number(execution.agent.wait?.since) || 0;
      items.push({ ...base, key: `question:${row.id}${asked ? `:${asked}` : ''}`, kind: 'question', since: asked || base.since });
    } else if (Array.isArray(execution?.steps) && execution.steps.some(step => step?.status === 'unknown')) {
      items.push({ ...base, key: `review:${row.id}`, kind: 'review' });
    } else if (!approvalTasks.has(row.id) && Number(row.attempts) > 0 && Number(row.attempts) >= Number(row.maxAttempts || 0)) {
      items.push({ ...base, key: `failed:${row.id}`, kind: 'failed' });
    }
  }
  return items;
}

/** Decide what to announce now. `state` maps item key -> last notified time.
 * New items notify immediately, waiting items again every `remindAfterMs`,
 * and items that are no longer waiting are forgotten. */
export function planNotifications(items, state, now, { remindAfterMs = REMIND_AFTER_MS } = {}) {
  const previous = state && typeof state === 'object' ? state : {};
  const next = {}, notify = [];
  for (const item of items || []) {
    if (!item?.key || item.key in next) continue;
    const last = Number(previous[item.key]);
    // A clock set backwards must not silence reminders forever.
    const due = !Number.isFinite(last) || last <= 0 || now - last >= remindAfterMs || last > now;
    if (due) { notify.push(item); next[item.key] = now; } else next[item.key] = last;
  }
  return { notify, state: next };
}

const LABELS = { approval: ['approval', 'approvals'], question: ['question', 'questions'],
  review: ['outcome to review', 'outcomes to review'], failed: ['stopped task', 'stopped tasks'] };

/** One summary per team per pass: "Finance Martin: 2 approvals, 1 question waiting". */
export function groupByCompany(items) {
  const groups = new Map();
  for (const item of items || []) {
    if (!groups.has(item.companyId)) groups.set(item.companyId, { companyId: item.companyId, companyName: item.companyName || 'Team', counts: {}, items: [] });
    const group = groups.get(item.companyId);
    group.counts[item.kind] = (group.counts[item.kind] || 0) + 1;
    group.items.push(item);
  }
  return [...groups.values()].map(group => {
    const parts = Object.keys(LABELS).filter(kind => group.counts[kind])
      .map(kind => `${group.counts[kind]} ${LABELS[kind][group.counts[kind] === 1 ? 0 : 1]}`);
    return { ...group, summary: `${group.companyName}: ${parts.join(', ')} waiting` };
  });
}

/** Main-process wiring. Everything OS-specific is injected.
 *  - `enabled()`: the owner's setting (default on)
 *  - `focused()`: true while the owner is already looking at the workspace
 *  - `open()`: show or recreate the main window */
export function createOwnerAttention({ store, Notification, enabled = () => true, focused = () => false, open = () => {}, now = Date.now, remindAfterMs = REMIND_AFTER_MS }) {
  const shown = new Map(); // keeps click handlers alive until replaced
  function evaluate(db) {
    if (!enabled() || !Notification?.isSupported?.() || focused()) return [];
    const plan = planNotifications(queryOwnerAttention(db), store.get(OWNER_ATTENTION_STATE_KEY, {}), now(), { remindAfterMs });
    const groups = groupByCompany(plan.notify);
    for (const group of groups) {
      // Titles of tasks stay inside the app; the OS only sees the team name and counts.
      const notification = new Notification({ title: 'BonzAI', body: group.summary, silent: false });
      notification.on('click', () => { try { open(group.companyId); } catch { /* window is closing */ } });
      shown.set(group.companyId, notification);
      notification.show();
    }
    store.set(OWNER_ATTENTION_STATE_KEY, plan.state);
    return groups;
  }
  return { evaluate };
}
