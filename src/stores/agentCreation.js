import { reactive } from 'vue';
import { reportOperation } from './activityStore.js';

// Application-scoped: a view may subscribe/unsubscribe without owning the job.
export const agentCreation = reactive({ id: null, status: 'idle', stage: '', prompt: '', preview: null, error: null, pendingSave: false, inputs: {} });
export function updateAgentCreation(patch) {
  Object.assign(agentCreation, patch);
  if (!agentCreation.id) return;
  reportOperation({ id: agentCreation.id, source: 'agent-creation', mode: 'agent',
    title: agentCreation.preview?.name ? `Smart Agent · ${agentCreation.preview.name}` : 'Creating Smart Agent',
    status: agentCreation.status, stage: agentCreation.stage, progress: null,
    metadata: { prompt: agentCreation.prompt, ...agentCreation.inputs }, error: agentCreation.error });
}
export function beginAgentCreation(prompt, inputs = {}) {
  if (agentCreation.status === 'running') return false;
  updateAgentCreation({ id: `agent-creation:${crypto.randomUUID()}`, prompt, status: 'running', stage: 'Writing identity', preview: null, error: null, pendingSave: false, inputs });
  return true;
}
