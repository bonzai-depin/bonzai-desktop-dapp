import { memoryService } from "./memory.service.js";
import { web3Service } from "./web3.service.js";

const api = () => window.electronAPI?.db?.jobs;
export const listJobs = (status = "all") => api()?.list({ status }) || [];
export const createJob = (input) => api().create({ ...input, employerWallet: web3Service.state?.walletAddress || null });
export const listApplications = (jobId) => api().applications(jobId);
export const applyToJob = (jobId, companion, pitch, proposedCents) => api().apply(jobId, { companionId: companion.id, ownerWallet: web3Service.state?.walletAddress || companion.owner || null, pitch, proposedCents });
export async function hireCompanion(job, application, companion) {
  const contract = await api().hire(job.id, application.id);
  const team = { id: `job-${job.id}`, name: job.title, roles: { worker: { companion: companion?.name || application.companion_id } } };
  await memoryService.ingestTeamRoleMemory(team, "worker", {
    sourceId: `job-contract:${contract.id}`,
    type: "job_contract",
    text: `Hired for ${job.title}. Scope: ${job.description}. Accepted pitch: ${application.pitch}`,
    noteKind: "professional_context",
  });
  return contract;
}
export const getContract = (jobId) => api().contract(jobId);
export const addMilestone = (contractId, input) => api().addMilestone(contractId, input);
export const listMilestones = (contractId) => api().milestones(contractId);
export const submitEvidence = (id, evidence) => api().submitEvidence(id, evidence);
export const approveMilestone = (id) => api().approveMilestone(id);
export const reviewContract = (contract, rating, review) => api().review(contract.id, {
  reviewerWallet: web3Service.state?.walletAddress || null,
  companionId: contract.companionId,
  rating,
  review,
});
export const getReputation = (companionId) => api().reputation(companionId);
