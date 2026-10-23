import { ethers } from 'ethers';
import { verifyWorkerGrant } from './agentWorkerProtocol.js';
import { verifyServiceAssetOwner } from './agentServiceAssets.js';
import { assertNoPendingPayment } from './transactionJournal.js';
import { confirmedReceipt } from './transactionReceipt.js';
import { acquireWorkflowTokens } from './workflowCheckout.js';
import { assertMintReference } from './agentMintEligibility.js';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { BonzaiJobEscrowABI } from '../contracts/abi/BonzaiJobEscrow.abi.js';
import { buildSmartAgentJobTerms, verifySmartAgentQuote } from './smartAgentJobTerms.js';
import { walletProviderService } from './walletProvider.service.js';
import { createJobPacket, verifyJobPacket, workerRoleForJob, jobPacketMessage } from './smartAgentHandoff.js';

const TOKEN_ABI = ['function decimals() view returns(uint8)', 'function symbol() view returns(string)', 'function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'];
const FACTORY_ABI = ['function getToken(uint256) view returns(address)', 'function companionContract() view returns(address)'];
const AGENT_ABI = ['function ownerOf(uint256) view returns(address)', 'function getAgentWallet(uint256) view returns(address)'];
const config = () => CONFIG.contributionEconomy;
const journalScope = () => `${config().chainId}:${config().jobEscrowAddress}`;
const journalKey = () => `bonzai.smartAgentJobs.${config().chainId}`;
export const smartAgentJobsConfigured = () => Boolean(config().jobEscrowAddress && (CONFIG.smartAgentIssuance?.factoryAddress || CONFIG.companionTokenFactory?.contractAddress));

async function escrow(write = false) {
  if (!smartAgentJobsConfigured()) throw new Error('Smart-agent job settlement is not configured on this network.');
  if (write) {
    await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
    const provider = await web3Service.getBrowserProvider();
    return new ethers.Contract(config().jobEscrowAddress, BonzaiJobEscrowABI, await provider.getSigner());
  }
  return new ethers.Contract(config().jobEscrowAddress, BonzaiJobEscrowABI, await web3Service.getProvider(ECONOMY_NETWORK_KEY));
}

export async function fetchSmartAgentQuote(agent) {
  if (agent?.tokenId == null) throw new Error('Issue this smart agent’s social token before offering paid jobs.');
  const contract = await escrow();
  const provider = contract.runner;
  const configuredFactory = agent.contractAddress?.toLowerCase() === CONFIG.smartAgentIssuance?.contractAddress?.toLowerCase()
    ? CONFIG.smartAgentIssuance?.factoryAddress : CONFIG.companionTokenFactory?.contractAddress;
  if (!configuredFactory) throw new Error('This agent collection has no configured job-settlement factory.');
  const [factoryAddress, arbitrator, platformBps, contributionBps, treasuryBps, holderBps, acceptWindow, deliveryWindow, reviewWindow, disputeWindow] = await Promise.all([
    contract.socialTokenFactory(), contract.owner(), contract.platformBps(), contract.contributionBps(), contract.treasuryBps(), contract.holderBps(), contract.ACCEPT_WINDOW(), contract.DELIVERY_WINDOW(), contract.REVIEW_WINDOW(), contract.DISPUTE_WINDOW(),
  ]);
  if (factoryAddress.toLowerCase() !== configuredFactory.toLowerCase()) throw new Error('Smart-agent token factory is not configured in the escrow.');
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  const [tokenAddress, agentsAddress] = await Promise.all([factory.getToken(agent.tokenId), factory.companionContract()]);
  if (tokenAddress === ethers.ZeroAddress) throw new Error('This smart agent has no issued social token.');
  if (agent.tokenAddress && tokenAddress.toLowerCase() !== agent.tokenAddress.toLowerCase()) throw new Error('The listed token does not match the smart agent’s onchain token.');
  assertMintReference(agent, agentsAddress, config().chainId);
  const identity = new ethers.Contract(agentsAddress, AGENT_ABI, provider);
  const token = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);
  const [owner, wallet, decimals, symbol] = await Promise.all([identity.ownerOf(agent.tokenId), identity.getAgentWallet(agent.tokenId), token.decimals(), token.symbol()]);
  const precision = Number(decimals);
  if (!Number.isInteger(precision) || precision < 0 || precision > 36) throw new Error('Unsupported social-token precision.');
  let serviceOffer;
  if (agent.offer) {
    const { resolveWorkerIdentity, verifyWorkerSignature } = await import('./agentWorkerRuntime.js');
    const health = await window.electronAPI.p2pHealth(agent.peerId);
    const descriptor = health?.workers?.find(w => String(w.grant.tokenId) === String(agent.tokenId) && w.grant.collection.toLowerCase() === agent.contractAddress.toLowerCase());
    if (!descriptor) throw new Error('This provider is offline. Reconnect before hiring.');
    const { grant } = await verifyWorkerGrant(descriptor, resolveWorkerIdentity, agent.peerId, Date.now(), verifyWorkerSignature);
    if (grant.offer?.hash !== agent.offer.hash) throw new Error('The provider updated this offer. Refresh the market before hiring.');
    serviceOffer = grant.offer;
    await Promise.all(serviceOffer.assets.map(asset => verifyServiceAssetOwner(asset, owner)));
  }
  return { ...(serviceOffer ? {serviceOffer} : {}), tokenId: String(agent.tokenId), tokenAddress, decimals: precision, symbol: String(symbol).slice(0, 32), worker: wallet !== ethers.ZeroAddress ? wallet : owner, owner, arbitrator, platformBps: Number(platformBps), treasuryBps: Number(treasuryBps), holderBps: Number(holderBps), contributionBps: Number(contributionBps), acceptWindow: Number(acceptWindow), deliveryWindow: Number(deliveryWindow), reviewWindow: Number(reviewWindow), disputeWindow: Number(disputeWindow), routeAssetId: agent.routeAssetId || ethers.ZeroHash, escrow: config().jobEscrowAddress, chainId: config().chainId };
}

export async function listSmartAgentJobs(companyId, wallet = web3Service.state.walletAddress) {
  let entries = [];
  if (window.electronAPI?.agentJobsList && smartAgentJobsConfigured()) {
    entries = await window.electronAPI.agentJobsList(journalScope());
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem(journalKey()) || '[]'); } catch { /* retain the native journal */ }
    for (const record of legacy.filter(item => item.terms?.escrow?.toLowerCase() === config().jobEscrowAddress?.toLowerCase() && !entries.some(entry => entry.jobId === item.jobId))) {
      await window.electronAPI.agentJobsSave(journalScope(), record);
      entries.push(record);
    }
  } else {
    try { entries = JSON.parse(localStorage.getItem(journalKey()) || '[]'); } catch { return []; }
    entries = entries.filter(entry => entry.terms?.escrow?.toLowerCase() === config().jobEscrowAddress?.toLowerCase());
  }
  return entries.filter(entry => (!companyId || entry.companyId === companyId) && (!wallet || [entry.employer, entry.worker].some(address => address?.toLowerCase() === wallet.toLowerCase())));
}

async function saveJob(record) {
  if (window.electronAPI?.agentJobsSave) {
    await window.electronAPI.agentJobsSave(journalScope(), record);
    window.dispatchEvent(new CustomEvent('bonzai:smart-agent-job', { detail: record }));
    return;
  }
  let entries = [];
  try { entries = JSON.parse(localStorage.getItem(journalKey()) || '[]'); } catch { /* recover a corrupt index from the current job */ }
  localStorage.setItem(journalKey(), JSON.stringify([record, ...entries.filter(entry => entry.jobId !== record.jobId || entry.companyId !== record.companyId)]));
  window.dispatchEvent(new CustomEvent('bonzai:smart-agent-job', { detail: record }));
}

export async function fundSmartAgentJob(agent, reviewed, input) {
  const contract = await escrow(true);
  const employer = await contract.runner.getAddress();
  if (employer.toLowerCase() !== String(input.expectedWallet).toLowerCase()) throw new Error('Wallet changed. Review the job again.');
  await assertNoPendingPayment(config().chainId, employer, await web3Service.getProvider(ECONOMY_NETWORK_KEY), [config().jobEscrowAddress]);
  const current = await fetchSmartAgentQuote(agent);
  verifySmartAgentQuote(reviewed, current);
  const { terms, amount, termsHash } = buildSmartAgentJobTerms(current, input);
  if ([employer.toLowerCase(), current.worker.toLowerCase()].includes(current.arbitrator.toLowerCase())) throw new Error('This job requires an independent arbitrator.');
  const token = new ethers.Contract(current.tokenAddress, TOKEN_ABI, contract.runner);
  if (input.paymentMethod === 'usdc') await acquireWorkflowTokens(input.checkout, current, input.amount, employer);
  const [balance, allowance] = await Promise.all([token.balanceOf(employer), token.allowance(employer, current.escrow)]);
  if (balance < amount) throw new Error(`Insufficient ${current.symbol}. Acquire the smart agent’s token before funding.`);
  if (allowance < amount) {
    const approval = await token.approve(current.escrow, amount);
    await confirmedReceipt(approval);
  }
  // Revalidate after approval, before a payment transaction can be proposed.
  verifySmartAgentQuote(reviewed, await fetchSmartAgentQuote(agent));
  if ((await contract.runner.getAddress()).toLowerCase() !== employer.toLowerCase()
    || web3Service.state.walletAddress?.toLowerCase() !== employer.toLowerCase()
    || Number(web3Service.state.currentChainId) !== Number(current.chainId)) throw new Error('Wallet or network changed. Review the job again.');
  const jobId = ethers.hexlify(ethers.randomBytes(32));
  const transaction = await contract.fundTokenJob(jobId, current.worker, current.tokenId, amount, termsHash, current.routeAssetId, current.arbitrator);
  const record = { ...(input.execution ? { execution: input.execution } : {}), jobId, txHash: transaction.hash, companyId: input.companyId || null, agentId: agent.id, agentName: agent.name, employer, worker: current.worker, tokenAddress: current.tokenAddress, symbol: current.symbol, decimals: current.decimals, amount: ethers.formatUnits(amount, current.decimals), terms, termsHash, createdAt: Date.now(), status: 'pending' };
  // Record the submitted transaction before waiting so a closed window cannot lose it.
  let storageError = '';
  try { await saveJob(record); } catch { storageError = 'The job was submitted, but its local record could not be saved. Keep the job ID and transaction hash.'; }
  let receipt;
  try { receipt = await confirmedReceipt(transaction); }
  catch (failure) {
    // A submitted transaction may still confirm after an RPC timeout. Never
    // propose a second payment merely because confirmation was unavailable.
    record.status = failure.receipt?.status === 0 ? 'failed' : 'pending';
    try { await saveJob(record); } catch { /* the transaction identifiers are returned below */ }
    return { ...record, storageError, confirmationError: failure.shortMessage || failure.message };
  }
  record.txHash = receipt.hash;
  record.status = 'funded';
  try { await saveJob(record); } catch { storageError ||= 'Keep the job ID and transaction hash; local storage is unavailable.'; }
  return { ...record, storageError };
}

export async function fetchSmartAgentJob(jobId) {
  const contract = await escrow();
  const [job, terms, currency] = await Promise.all([contract.jobs(jobId), contract.jobTerms(jobId), contract.jobCurrency(jobId)]);
  if (!Number(job.status)) throw new Error('Job not found on this network.');
  const wallet = web3Service.state.walletAddress;
  const withdrawable = wallet ? await contract.tokenWithdrawable(currency, wallet) : 0n;
  const workerWithdrawable = await contract.tokenWithdrawable(currency, job.worker);
  return { jobId, termsHash: job.termsHash, companionTokenId: job.companionTokenId.toString(), employer: job.employer, worker: job.worker, status: Number(job.status), routeAssetId: job.routeAssetId, evidenceHash: job.evidenceHash, currency, amount: job.amount.toString(), arbitrator: terms.arbitrator, acceptBy: Number(terms.acceptBy), deliverBy: Number(terms.deliverBy), reviewBy: Number(terms.reviewBy), resolveBy: Number(terms.resolveBy), withdrawable: withdrawable.toString(), workerWithdrawable: workerWithdrawable.toString() };
}

/** Each route/currency balance covers all of its jobs, so show it once. */
export function knownSmartAgentRoyaltyRoutes(records = []) {
  const routes = new Map();
  for (const record of records) {
    const route = record.terms?.routeAssetId;
    const currency = record.live?.currency;
    if (!ethers.isHexString(route, 32) || route === ethers.ZeroHash
      || route.toLowerCase() !== record.live?.routeAssetId?.toLowerCase()
      || !ethers.isAddress(currency) || currency === ethers.ZeroAddress
      || currency.toLowerCase() !== record.terms?.currency?.toLowerCase()) continue;
    const key = `${route.toLowerCase()}:${currency.toLowerCase()}`;
    if (!routes.has(key)) routes.set(key, { key, assetId: route, currency, agentName: record.agentName, jobCount: 0 });
    routes.get(key).jobCount++;
  }
  return [...routes.values()];
}

const ACTIONS = new Set(['acceptJob', 'submitWork', 'approveWork', 'cancelJob', 'raiseDispute', 'expireJob']);
export async function actOnSmartAgentJob(action, jobId, detail, options = {}) {
  if (!ACTIONS.has(action)) throw new Error('Unsupported job action.');
  const hash = detail ? ethers.keccak256(ethers.toUtf8Bytes(String(detail))) : null;
  if (['submitWork', 'raiseDispute'].includes(action) && !hash) throw new Error('Enter evidence or a dispute reason.');
  let contract;
  if (options.agent) {
    const signer = await walletProviderService.getAgentJobSigner(options.agent.id, { approved: options.approved, action, jobId, evidenceHash: hash });
    const live = await fetchSmartAgentJob(jobId);
    if ((await signer.getAddress()).toLowerCase() !== live.worker.toLowerCase()) throw new Error('This smart agent is not the hired worker.');
    contract = new ethers.Contract(config().jobEscrowAddress, BonzaiJobEscrowABI, signer);
  } else {
    const expected = options.expectedWallet || web3Service.state.walletAddress;
    contract = await escrow(true);
    if ((await contract.runner.getAddress()).toLowerCase() !== String(expected).toLowerCase()) throw new Error('Wallet changed. Review this job action again.');
  }
  const transaction = await contract[action](jobId, ...(['submitWork', 'raiseDispute'].includes(action) ? [hash] : []));
  const receipt = await confirmedReceipt(transaction);
  window.dispatchEvent(new CustomEvent('bonzai:smart-agent-job'));
  return { txHash: receipt.hash };
}

export async function withdrawSmartAgentPayment(currency, expectedWallet = web3Service.state.walletAddress) {
  const contract = await escrow(true);
  const wallet = await contract.runner.getAddress();
  if (wallet.toLowerCase() !== String(expectedWallet).toLowerCase()) throw new Error('Wallet changed. Review the withdrawal again.');
  const transaction = await contract.withdrawTokenPayments(currency, wallet);
  const receipt = await confirmedReceipt(transaction);
  window.dispatchEvent(new CustomEvent('bonzai:smart-agent-job'));
  return { txHash: receipt.hash };
}

export async function withdrawAgentJobPayment(agent, jobId, { approved } = {}) {
  const live = await fetchSmartAgentJob(jobId);
  const signer = await walletProviderService.getAgentJobSigner(agent.id, { approved, action: 'withdrawTokenPayments', currency: live.currency });
  const recipient = await signer.getAddress();
  if (recipient.toLowerCase() !== live.worker.toLowerCase()) throw new Error('This smart agent is not the hired worker.');
  const contract = new ethers.Contract(config().jobEscrowAddress, BonzaiJobEscrowABI, signer);
  const transaction = await contract.withdrawTokenPayments(live.currency, recipient);
  const receipt = await confirmedReceipt(transaction);
  window.dispatchEvent(new CustomEvent('bonzai:smart-agent-job'));
  return { txHash: receipt.hash };
}

/** Explicit transfer of the reviewed brief; receiving a packet never accepts a job. */
export async function sendSmartAgentJob(record, peerId) {
  if (!window.electronAPI?.agentJobsSend) throw new Error('Restart BonzAI to enable peer job delivery.');
  const packet = createJobPacket(record);
  const live = await fetchSmartAgentJob(record.jobId);
  verifyJobPacket(packet, live, { chainId: config().chainId, escrow: config().jobEscrowAddress });
  if (live.employer.toLowerCase() !== web3Service.state.walletAddress?.toLowerCase()) throw new Error('Connect the employer wallet before sharing this job.');
  const signer = await (await web3Service.getBrowserProvider()).getSigner();
  if ((await signer.getAddress()).toLowerCase() !== live.employer.toLowerCase()) throw new Error('Employer wallet changed.');
  packet.signature = await signer.signMessage(jobPacketMessage(packet));
  verifyJobPacket(packet, live, { chainId: config().chainId, escrow: config().jobEscrowAddress });
  const receipt = await window.electronAPI.agentJobsSend(peerId, packet);
  if (!receipt?.ok) throw new Error(receipt?.error || 'The worker did not acknowledge this brief.');
  await saveJob({ ...record, employerSignature: packet.signature, handoff: { peerId, status: 'received', at: Date.now() } });
  return receipt;
}

export async function importSmartAgentJob(packet, agent, companyId) {
  const live = await fetchSmartAgentJob(packet.jobId);
  verifyJobPacket(packet, live, { chainId: config().chainId, escrow: config().jobEscrowAddress });
  const quote = await fetchSmartAgentQuote(agent);
  if (quote.tokenId !== live.companionTokenId || quote.tokenAddress.toLowerCase() !== live.currency.toLowerCase()
    || quote.worker.toLowerCase() !== live.worker.toLowerCase() || quote.decimals !== packet.terms.decimals) throw new Error('This assignment belongs to another worker.');
  if (quote.owner.toLowerCase() !== web3Service.state.walletAddress?.toLowerCase()) throw new Error('Connect the agent owner wallet to receive this assignment.');
  const record = { jobId: packet.jobId, companyId, agentId: agent.id, agentName: agent.name,
    employer: live.employer, worker: live.worker, tokenAddress: live.currency, symbol: quote.symbol,
    decimals: quote.decimals, amount: ethers.formatUnits(live.amount, quote.decimals), terms: packet.terms,
    termsHash: live.termsHash, employerSignature: packet.signature, createdAt: Date.now(), status: 'received' };
  await saveJob(record);
  return record;
}

/** A saved team task uses the same durable harness as local agents. Settlement stays explicit. */
export async function queueSmartAgentJob(record, charter, agent) {
  const live = await fetchSmartAgentJob(record.jobId);
  verifyJobPacket(createJobPacket(record), live, { chainId: config().chainId, escrow: config().jobEscrowAddress });
  const quote = await fetchSmartAgentQuote(agent);
  if (quote.owner.toLowerCase() !== web3Service.state.walletAddress?.toLowerCase()) throw new Error('Connect the agent owner wallet before starting work.');
  const role = workerRoleForJob(charter, agent, live);
  const { create } = await import('./company/issues.js');
  const issue = await create(charter.id, {
    title: record.terms.title,
    description: `${record.terms.outcome}\n\nPaid job: ${record.jobId}\nProduce local deliverables for review. Do not claim payment, publish, send messages, or submit work to escrow without separate approval.`,
    assigneeRole: role, assigneeCompanion: agent.id, createdBy: 'user',
    externalJobReference: `${journalScope()}:${record.jobId}`,
  });
  if (!issue?.id) throw new Error('The assignment could not be saved to the team backlog.');
  await saveJob({ ...record, companyId: charter.id, issueId: issue.id });
  return issue;
}

export async function checkFundedAssignment(issue, companion) {
  const label = issue.labels?.find(value => value.startsWith('funded-job:'));
  if (!label) return { ok: true };
  try {
    const reference = label.slice('funded-job:'.length);
    const prefix = `${journalScope()}:`.toLowerCase();
    if (!reference.startsWith(prefix)) throw new Error('This task belongs to another settlement network.');
    const jobId = reference.slice(prefix.length);
    const record = (await listSmartAgentJobs(issue.companyId, null)).find(item => item.jobId === jobId);
    if (!record || record.agentId !== companion) throw new Error('The funded assignment is not linked to this worker.');
    const live = await fetchSmartAgentJob(jobId);
    verifyJobPacket(createJobPacket(record), live, { chainId: config().chainId, escrow: config().jobEscrowAddress });
    if (live.status !== 2 || live.deliverBy * 1000 <= Date.now()) throw new Error('Paid work paused: job is no longer accepted or its deadline has passed.');
    return { ok: true };
  } catch (failure) { return { ok: false, reason: failure.message }; }
}

/** Text or explicit deliverable references only. Never dereference or transmit local files implicitly. */
export async function sendSmartAgentDelivery(record, peerId, detail) {
  if (!window.electronAPI?.agentJobsSend) throw new Error('Restart BonzAI to enable peer delivery.');
  if (!record.employerSignature) throw new Error('Receive a signed brief before returning work over the peer network.');
  const packet = { ...createJobPacket(record), delivery: detail };
  const live = await fetchSmartAgentJob(record.jobId);
  verifyJobPacket(packet, live, { chainId: config().chainId, escrow: config().jobEscrowAddress });
  const receipt = await window.electronAPI.agentJobsSend(peerId, packet);
  if (!receipt?.ok) throw new Error(receipt?.error || 'The customer did not acknowledge delivery.');
  await saveJob({ ...record, delivery: { detail, sentAt: Date.now(), peerId } });
  return receipt;
}

export async function importSmartAgentDelivery(packet, companyId) {
  if (!packet.delivery) throw new Error('No deliverable in this message.');
  const live = await fetchSmartAgentJob(packet.jobId);
  verifyJobPacket(packet, live, { chainId: config().chainId, escrow: config().jobEscrowAddress });
  if (live.employer.toLowerCase() !== web3Service.state.walletAddress?.toLowerCase()) throw new Error('Connect the employer wallet to receive this delivery.');
  const record = (await listSmartAgentJobs(companyId, null)).find(item => item.jobId === packet.jobId);
  if (!record) throw new Error('Open the company that funded this job before importing delivery.');
  const { publishContent, listCatalog } = await import('./company/distribution.solo.js');
  const existing = (await listCatalog(companyId)).find(item => item.meta?.jobId === packet.jobId && item.meta?.evidenceHash === live.evidenceHash);
  const artifact = existing || await publishContent(companyId, {
    pipeline: 'text', prompt: record.terms.title, payload: packet.delivery, companion: record.agentId,
    meta: { payloadEncoding: 'text', jobId: packet.jobId, evidenceHash: live.evidenceHash, source: 'paid-worker' },
  });
  if (!artifact?.id) throw new Error('Delivery could not be saved to company deliverables.');
  await saveJob({ ...record, delivery: { detail: packet.delivery, artifactId: artifact.id, receivedAt: Date.now() } });
  return artifact;
}
