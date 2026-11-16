import { findWorkflowTeam, workflowTeamPresets } from './workflowTeams.js';

const creating = new Map();
// Concurrent handoffs share the same creation; existing teams keep their settings.
export async function ensureWorkflowTeam(target, { companies, catalog, form }) {
  const existing = findWorkflowTeam(companies(), target);
  if (existing) return existing;
  if (target.companyId) throw new Error('This team is no longer available.');
  if (creating.has(target.skillId)) return creating.get(target.skillId);
  const pending = (async () => {
    const preset = workflowTeamPresets(await catalog()).find(item => item.executionWorkflowId === target.skillId);
    if (!preset) throw new Error('This workflow is not installed. Choose an available workflow.');
    const found = findWorkflowTeam(companies(), target);
    if (found) return found;
    return form(preset.templateId, {
      businessName: preset.title, businessType: preset.title,
      workflowId: preset.id, executionWorkflowId: preset.executionWorkflowId,
      currentWorkflow: preset.summary, approvalOwner: 'the local human operator',
    }, {
      name: preset.title, mode: 'solo', demoMode: false,
      includeOptionalHumans: false, initialGoals: [], connectorKinds: [],
      treasury: { currency: 'USD', reserveFloor: 0, perHeartbeatSpendCap: 0 },
    });
  })();
  creating.set(target.skillId, pending);
  try { return await pending; } finally { creating.delete(target.skillId); }
}
