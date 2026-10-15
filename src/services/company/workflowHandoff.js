import { shallowRef } from 'vue';
export const companyWorkflowHandoff = shallowRef(null);
export const pendingCompanyWorkflow = shallowRef(null);
export function requestCompanyWorkflow(value) {
  if (!value?.skillId) return;
  if (value.companyId && value.issueId) setCompanyWorkflowHandoff(value);
  pendingCompanyWorkflow.value = { ...value };
}
export function setCompanyWorkflowHandoff(value) {
  companyWorkflowHandoff.value = value?.companyId && value?.issueId ? { ...value } : null;
}
