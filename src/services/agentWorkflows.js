
let availableWorkflows = [];

// The same catalog rendered by Automate → Workflows. Connector manifests
// are implementation tools, never a second catalog of agent skills.
export async function getAvailableAgentWorkflows() {
  const { skillService } = await import('./skill.service.js');
  await skillService.initializeSkills();
  availableWorkflows = skillService.getAllSkills().filter(skill => !skill.disabled);
  return [...availableWorkflows];
}

export function normalizeAssignedWorkflowIds(ids, catalog = availableWorkflows) {
  const allowed = new Set(catalog.map(workflow => workflow.id));
  return [...new Set((Array.isArray(ids) ? ids : []).filter(id => allowed.has(id)))];
}

// Agent identity does not gate workflows. Session/provider permissions remain separate.
export function getAgentWorkflowIds(_companion, catalog = availableWorkflows) {
  return [...new Set(catalog.filter(workflow => !workflow.disabled).map(workflow => workflow.id))];
}
