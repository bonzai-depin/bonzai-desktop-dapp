import { workflowReviewApprovals, workflowReviewTasks } from './workflowReview.js';

// Navigation follows the outcome: creative workflows review generated results;
// operational teams retain their domain queues and incoming records.
export const workspaceViews = [
  ['overview','Today','space_dashboard'],
  ['studio','Workflow','auto_awesome'],
  ['getting-started','Getting started','help_outline'],
  ['grants','Grant dossiers','account_balance'],
  ['sales','Customers & sales','handshake'],
  ['command', 'Chat', 'chat_bubble'],
  ['issues', 'Backlog', 'checklist'], ['activity', 'Activity', 'graphic_eq'],
  ['approvals', 'Inbox', 'inbox'], ['deliverables', 'Results', 'folder_open'],
  ['org', 'Team', 'groups'], ['mission', 'Mission', 'flag'],
  ['connectors', 'Tools', 'extension'], ['charter', 'Team settings', 'settings'],
  ['billing', 'Billing', 'receipt_long'], ['purchasing', 'Purchasing', 'shopping_bag'],
].map(([value, label, icon]) => ({ key: value, value, label, icon }));

export const maintenanceViews = [
  ['today', 'today', 'Today', 'space_dashboard'],
  ['schedule', 'planning', 'Schedule', 'calendar_month'],
  ['work-orders', 'interventions', 'Work orders', 'assignment'],
  ['clients', 'clients', 'Clients', 'domain'],
  ['parts', 'purchasing', 'Parts requests', 'shopping_bag'],
  ['operations-settings', 'settings', 'Operations settings', 'settings'],
].map(([key, focus, label, icon]) => ({ key, value: 'gmao', focus, label, icon }));

const maintenanceAliases = {
  gmao: 'today', cockpit: 'today', 'maintenance-cockpit': 'today', 'sla-risk': 'today',
  preventive: 'planning', dispatch: 'interventions',
  assets: 'settings', compliance: 'settings',
};
const reviewAliases = ['ai', 'documents', 'outbox', 'review'];
const viewByValue = value => workspaceViews.find(view => view.value === value);
export function maintenanceDestination(focus = 'today') {
  if (['finance', 'billing'].includes(focus)) return viewByValue('billing');
  if (reviewAliases.includes(focus)) return viewByValue('approvals');
  const normalized = maintenanceAliases[focus] || focus;
  return maintenanceViews.find(view => view.key === normalized || view.focus === normalized) || maintenanceViews[0];
}

// Domain queues retain their identity instead of collapsing into the team backlog.
export function domainWorkspaceViews(channels = []) {
  return channels.filter(item => !['pipeline'].includes(item.key) && (item.view || item.value) === 'issues' && !['work', 'issues', 'receivables'].includes(item.key))
    .map(item => ({ ...item, value: 'issues', section: item.key, domain: true }));
}
export function supportsBilling(channels = []) {
  return channels.some(item => (item.view || item.value) === 'gmao' || item.key === 'receivables' || item.key === 'billing');
}
export function workInDomain(issue, key) {
  return issue?.labels?.includes(`workspace:${key}`);
}

export function workspaceSection(view, focus, maintenance = false) {
  if (view === 'gmao') {
    const destination = maintenanceDestination(focus);
    if (destination.key === 'operations-settings') return 'settings';
    return destination.key;
  }
  if (view === 'approvals') return 'approvals';
  if (view === 'treasury') return 'charter';
  if (view === 'team-exchanges') return 'command';
  return viewByValue(view)?.value || (maintenance ? 'today' : 'command');
}

// Resolve saved blueprint links and current UI destinations through one path.
export function resolveWorkspaceDestination(key, channels = [], maintenance = false) {
  if (key && typeof key === 'object') {
    const target = resolveWorkspaceDestination(key.view, channels, maintenance);
    return { ...target, ...(key.section ? { section: key.section } : {}) };
  }
  const workflow = channels.some(item => (item.view || item.value) === 'studio');
  const purchasing = channels.some(item => item.key === 'purchasing-room' || item.view === 'purchasing');
  const finance = channels.some(item => item.key === 'cash' || item.key === 'receivables');
  const grants = channels.some(item => (item.view || item.value) === 'grants');
  const fallback = workflow ? viewByValue('studio') : grants ? viewByValue('grants') : maintenance ? maintenanceViews[0] : purchasing ? viewByValue('purchasing') : domainWorkspaceViews(channels)[0] || viewByValue(finance && supportsBilling(channels) ? 'billing' : 'command');
  if (!key) return workflow ? viewByValue('studio') : maintenance ? maintenanceViews[0] : viewByValue('overview');
  // These legacy destinations create goals through CEO planning. Native
  // workflows instead collect their inputs and execute explicit tasks.
  if (workflow && ['mission', 'command', 'chat', 'requests', 'team-exchanges'].includes(key)) return viewByValue('studio');
  if (key === 'intake') return {...viewByValue('approvals'),key:'intake',focus:'intake'};
  if (['revenue','pipeline','sales'].includes(key) && channels.some(c=>['revenue','pipeline'].includes(c.key)||c.view==='sales')) return viewByValue('sales');
  if (['finance', 'billing', 'receivables'].includes(key)) return supportsBilling(channels) || maintenance ? viewByValue('billing') : fallback;
  const domain = domainWorkspaceViews(channels).find(item => item.key === key);
  if (domain) return domain;
  if (['purchasing-room', 'purchasing'].includes(key) && purchasing) return viewByValue('purchasing');
  if (['team-exchanges', 'chat', 'requests'].includes(key)) return viewByValue('command');
  if (key === 'backlog') return viewByValue('issues');
  if (key === 'team') return viewByValue('org');
  if (key === 'tools') return viewByValue('connectors');
  if (key === 'team-settings') return viewByValue('charter');
  if (key === 'settings') return maintenance ? maintenanceDestination('settings') : viewByValue('charter');
  if (maintenance && (reviewAliases.includes(key) || key in maintenanceAliases || maintenanceViews.some(view => view.key === key || view.focus === key))) return maintenanceDestination(key);
  const channel = channels.find(item => item.key === key || item.value === key || item.view === key);
  if (channel) {
    const value = channel.value || channel.view;
    if (workflow && ['mission', 'command', 'team-exchanges'].includes(value)) return viewByValue('studio');
    if (value === 'team-exchanges') return viewByValue('command');
    return value === 'gmao' ? maintenanceDestination(channel.focus || channel.domainView)
      : viewByValue(value) || fallback;
  }
  if (key === 'work') return maintenance ? maintenanceDestination('work-orders') : viewByValue('issues');
  return viewByValue(key) || fallback;
}

export const needsMessageReview = message => ['draft', 'unknown', 'failed'].includes(message.status);
export function reviewCount(state = {}) {
  const gmao = state.gmao || {};
  return (state.approvals || []).length
    + (state.intakeReviewCount || 0)
    + (gmao.documentIntake || []).filter(document => document.status === 'to_review').length
    + (gmao.outbox || []).filter(needsMessageReview).length
    + (gmao.notifications || []).filter(notification => notification.deliveryStatus === 'ready').length;
}

export function workspaceNavigation(channels, state = {}, charter = {}) {
  const workflow = channels.some(item => (item.view || item.value) === 'studio');
  const maintenance = channels.some(item => (item.view || item.value) === 'gmao');
  const purchasing = channels.some(item => item.key === 'purchasing-room' || (item.view || item.value) === 'purchasing');
  const inbox = { ...viewByValue('approvals'), section: 'approvals',
    ...(workflow ? { label: 'Review', icon: 'fact_check' } : {}),
    badge: workflow ? workflowReviewApprovals(state, charter).length + workflowReviewTasks(state, charter).length : reviewCount(state) };
  const teamViews = (workflow ? ['org', 'issues', 'activity', 'connectors', 'charter'] : ['org', 'mission', 'issues', 'command', 'activity', 'connectors', 'charter']).map(value => ({
    ...viewByValue(value), section: value, utility: true, iconOnly: value !== 'org',
  }));
  const settings = { ...(maintenance ? maintenanceDestination('settings') : viewByValue('charter')), key: 'settings', label: 'Operations settings', section: 'settings', iconOnly: true };
  const deliverables = { ...viewByValue('deliverables'), section: 'deliverables' };
  return [
    ...(!maintenance && !channels.some(c => (c.view || c.value) === 'studio') ? [{...viewByValue('overview'),section:'overview'}] : []),
    ...(workflow ? [{ ...viewByValue('studio'), section: 'studio' }] : []),
    ...(channels.some(c=>['revenue','pipeline'].includes(c.key)||c.view==='sales') ? [{...viewByValue('sales'),section:'sales'}] : []),
    ...(channels.some(item => (item.view || item.value) === 'grants') ? [{...viewByValue('grants'),section:'grants'}] : []),
    ...(maintenance ? maintenanceViews.slice(0, 5).map(view => ({ ...view, section: view.key })) : []),
    ...(purchasing ? [{ ...viewByValue('purchasing'), section: 'purchasing' }] : []),
    ...(!maintenance && !purchasing ? domainWorkspaceViews(channels).map(view => ({ ...view, badge: (state.issues || []).filter(issue => workInDomain(issue, view.key) && !['done', 'cancelled'].includes(issue.status)).length || null })) : []),
    ...(supportsBilling(channels) ? [{ ...viewByValue('billing'), section: 'billing' }] : []),
    inbox, deliverables, { ...viewByValue('getting-started'), section: 'getting-started' }, ...(maintenance ? [settings] : []), ...teamViews,
  ];
}
