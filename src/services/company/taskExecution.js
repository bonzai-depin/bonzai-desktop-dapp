// Durable, ordered execution. Every effect is checkpointed before dispatch;
// an interrupted effect is never retried automatically.
export function createTaskExecution(actions) {
  if (!Array.isArray(actions) || !actions.length || actions.length > 24) throw new Error('A task needs between 1 and 24 concrete actions.');
  const ids = new Set();
  const steps = actions.map((action, index) => {
    if (!action || typeof action.type !== 'string') throw new Error('Every step needs an action type.');
    const id = action.stepId || `step${index + 1}`;
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id) || ids.has(id)) throw new Error('Step IDs must be unique.');
    ids.add(id);
    return { id, action: JSON.parse(JSON.stringify(action)), status: 'planned' };
  });
  return { version: 1, steps };
}

export function resolveTaskInputs(value, steps) {
  if (Array.isArray(value)) return value.map(item => resolveTaskInputs(item, steps));
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$ref === 'string') {
      const [id, ...path] = value.$ref.split('.');
      const source = steps.find(step => step.id === id);
      if (source?.status !== 'completed') throw new Error(`Result ${id} is not ready.`);
      let result = source.output;
      for (const key of path) {
        if (['__proto__', 'prototype', 'constructor'].includes(key) || result == null || !Object.hasOwn(result, key)) throw new Error(`Missing result: ${value.$ref}`);
        result = result[key];
      }
      return JSON.parse(JSON.stringify(result));
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTaskInputs(item, steps)]));
  }
  return value;
}

export const settledStep = step => step.status === 'completed' || (step.status === 'superseded' && step.safeToRevise === true);
export const hasCompletedExecution = execution => Boolean(execution?.steps?.some(step => step.status === 'completed')
  && execution.steps.every(settledStep) && (!execution.agent || execution.agent.status === 'complete'));

export function executionOutcome(execution) {
  const steps = execution.steps;
  if (execution.agent) {
    if (hasCompletedExecution(execution)) return 'done';
    if (steps.some(step => step.status === 'waiting_approval')) return 'queued';
    if (['waiting_team', 'waiting_owner'].includes(execution.agent.status)) return 'waiting';
    if (!execution.pauseReason && execution.agent.status === 'running' && steps.every(step => step.status === 'planned' || settledStep(step))) return 'continue';
    return 'blocked';
  }
  if (steps.length && steps.every(step => step.status === 'completed')) return 'done';
  if (steps.some(step => step.status === 'waiting_approval')) return 'queued';
  return 'blocked';
}

export async function runTaskExecution({ execution, save, gate, dispatch, canRun = async () => true, approval = null }) {
  // Work on a detached value; a failed checkpoint must not mutate the stored plan.
  const state = JSON.parse(JSON.stringify(execution));
  const checkpoint = async () => {
    try { await save(state); } catch (error) { error.checkpointFailure = true; throw error; }
  };
  const ready = async () => {
    const validity = await canRun();
    const ok = typeof validity === 'object' ? validity?.ok === true : Boolean(validity);
    if (ok) { delete state.pauseReason; return true; }
    state.pauseReason = validity?.reason || 'Company paused or execution lease lost.';
    await checkpoint();
    return false;
  };
  for (const step of state.steps) {
    if (settledStep(step)) continue;
    if (!await ready()) break;
    if (['unknown', 'running', 'failed', 'rejected', 'unsupported', 'simulated', 'requires_input'].includes(step.status)) break;
    const approved = approval?.stepId === step.id;
    if (step.status === 'waiting_approval' && !approved) break;
    try {
      const action = approved ? approval.action : resolveTaskInputs(step.action, state.steps);
      if (approved && (step.approvalId !== approval.id || JSON.stringify(action) !== JSON.stringify(step.resolvedAction))) throw new Error('The approval does not match the saved task step.');
      step.resolvedAction = action;
      if (!approved) {
        const decision = await gate(action, step);
        if (!decision.pass) {
          if (!decision.queued) { step.safeToRevise = decision.correctable === true; throw new Error(decision.error || 'Action was not authorized.'); }
          step.status = 'waiting_approval';
          step.approvalId = decision.queued;
          await checkpoint();
          break;
        }
      }
      // An approval/policy check can await IPC. Re-check the team after it returns.
      if (!await ready()) break;
      step.status = 'running';
      step.startedAt = Date.now();
      await checkpoint(); // no dispatch if persistence fails
      // A pause or configuration edit may have landed during the checkpoint.
      // No effect has been dispatched, so preserve a resumable planned step.
      if (!await ready()) {
        step.status = 'planned';
        delete step.startedAt;
        await checkpoint();
        break;
      }
      let output;
      try { output = await dispatch(action, step, approved ? approval.id : null); }
      catch (error) {
        // The request may have reached its destination. Inspect evidence before retrying.
        step.status = error.beforeDispatch === true ? 'failed' : 'unknown';
        step.safeToRevise = error.beforeDispatch === true;
        step.error = error.message || 'Execution interrupted; verify the outcome.';
        await checkpoint();
        break;
      }
      step.output = output ?? null;
      step.finishedAt = Date.now();
      if (output?.status === 'requires_input') {
        step.status = 'requires_input';
        step.error = output.error || output.message || 'Open the workflow workspace to provide the required input.';
        step.safeToRevise = false;
      } else if (['unknown', 'running', 'queued', 'processing', 'pending'].includes(output?.status)) {
        step.status = 'unknown';
        step.error = output.error || output.message || 'The action has not confirmed its outcome. Check its receipt before continuing.';
        step.safeToRevise = false;
      } else if (!output || output.ok === false || output.success === false || output.isError === true || output.error || ['failed', 'error', 'cancelled', 'canceled', 'rejected', 'unsupported'].includes(output.status)) {
        step.status = output?.status === 'unsupported' ? 'unsupported' : 'failed';
        step.error = output?.error || 'No result was returned.';
        step.safeToRevise = output?.beforeDispatch === true;
      } else if (output.simulated || output.status === 'simulated') {
        step.status = 'simulated'; step.error = 'Simulation only; no business action was performed.';
      } else if (!(output.id || output.contentId || output.externalId || output.txHash || output.receipt || output.status === 'completed')) {
        step.status = 'failed'; step.error = 'The action returned no verifiable result.';
      } else step.status = 'completed';
      await checkpoint();
      if (step.status !== 'completed') break;
    } catch (error) {
      // Do not disguise a storage failure as a completed or safely retryable action.
      if (error.checkpointFailure || step.status === 'running') throw error;
      step.safeToRevise = step.safeToRevise === true || !step.resolvedAction;
      step.status = 'failed'; step.error = error.message;
      await checkpoint();
      break;
    }
  }
  return state;
}
