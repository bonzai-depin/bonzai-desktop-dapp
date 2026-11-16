import { visibleRecord } from "../../shared/visibleText.js";
import { shallowRef } from 'vue';
export const companyWorkflowHandoff = shallowRef(null);
export const workflowInputDraft = shallowRef(null);
export const pendingCompanyWorkflow = shallowRef(null);
export function requestCompanyWorkflow(value) {
  if (!value?.skillId) return;
  workflowInputDraft.value = value.inputs ? { skillId: value.skillId, inputs: visibleRecord(value.inputs) } : null;
  setCompanyWorkflowHandoff(value);
  pendingCompanyWorkflow.value = { ...value };
}
export function setCompanyWorkflowHandoff(value) {
  companyWorkflowHandoff.value = value?.companyId && value?.issueId ? { ...value } : null;
}
