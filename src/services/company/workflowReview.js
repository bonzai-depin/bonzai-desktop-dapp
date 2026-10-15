import { isAutonomousWorkflowTask } from '../../shared/companyAutomation.js';

// Earlier autonomous plans cannot be resumed by the dispatcher. Do not offer
// their approvals as actionable reviews, while preserving standalone owner
// permissions and work delegated under an explicitly created goal.
export function workflowReviewApprovals(state = {}, charter = {}) {
  return (state.approvals || []).filter(approval => {
    if (charter.id && approval.companyId && approval.companyId !== charter.id) return false;
    if (approval.status && approval.status !== 'pending') return false;
    const issue = (state.issues || []).find(item => item.id === approval.issueId);
    if (charter.id && issue?.companyId && issue.companyId !== charter.id) return false;
    const goal = issue?.goalId ? (state.goals || []).find(item => item.id === issue.goalId
      && (!charter.id || !item.companyId || item.companyId === charter.id)) : null;
    return !isAutonomousWorkflowTask(charter, issue, goal);
  });
}

// A review is a saved result awaiting the owner, not an unstarted brief or an
// old autonomous planning task. Keep the same scope in the tab badge and queue.
export function workflowReviewTasks(state = {}, charter = {}) {
  const workflowId = charter.workspace?.executionWorkflowId;
  return (state.issues || []).filter(issue => {
    if (charter.id && issue.companyId && issue.companyId !== charter.id) return false;
    if (['done', 'cancelled'].includes(issue.status)) return false;
    if (isAutonomousWorkflowTask(charter, issue, (state.goals || []).find(goal => goal.id === issue.goalId))) return false;
    return issue.execution?.steps?.some(step => step.action?.type === 'runWorkflow'
      && (!workflowId || step.action.workflowId === workflowId)
      && step.status === 'requires_input' && step.output?.status === 'ready_for_review'
      && step.output.contentIds?.length);
  });
}

export function workflowReviewItems(state, charter) {
  return workflowReviewTasks(state, charter).map(issue => {
    const steps = issue.execution.steps.filter(step => step.action?.type === 'runWorkflow'
      && (!charter.workspace?.executionWorkflowId || step.action.workflowId === charter.workspace.executionWorkflowId)
      && step.status === 'requires_input' && step.output?.status === 'ready_for_review');
    const ids = new Set(steps.flatMap(step => step.output.contentIds || []));
    return { key: `result:${issue.id}`, id: issue.id, kind: 'result', title: issue.title,
      subtitle: '', status: 'Ready for review', pending: true, record: issue,
      timestamp: issue.updatedAt || issue.createdAt,
      results: (state.catalog || []).filter(row => ids.has(row.id) && (!row.companyId || row.companyId === charter.id)),
      resultCount: ids.size };
  });
}
