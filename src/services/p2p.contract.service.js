/**
 * Provider-registry access for free P2P inference.
 * Consumer payments do not exist in this release. Provider compensation is
 * accounted by BonzaiServiceTime and paid from protocol reward pools.
 */

import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

const PROVIDER_TUPLE = 'tuple(address wallet,string peerId,string[] multiaddrs,uint8[] pipelines,uint256 totalEarnings,uint256 completedJobs,uint256 registeredAt,uint256 lastSeenAt,bool isActive,bool isRelay,uint16 maxLayers,uint32 computeScore,uint32 memoryMB)';
const PROVIDER_REGISTRY_ABI = [
  'function register(string peerId,string[] multiaddrs,uint8[] pipelines,bool isRelay)',
  'function activate()',
  'function deactivate()',
  'function heartbeat()',
  'function setShardCapabilities(uint16 maxLayers,uint32 computeScore,uint32 memoryMB)',
  `function getProvider(address wallet) view returns (${PROVIDER_TUPLE})`,
  `function getProviderByPeerId(string peerId) view returns (${PROVIDER_TUPLE})`,
  `function getProvidersForPipeline(uint8 pipeline) view returns (${PROVIDER_TUPLE}[])`,
  `function getRelayNodes() view returns (${PROVIDER_TUPLE}[])`,
  `function getShardProviders(uint16 minLayers,uint32 minMemoryMB) view returns (${PROVIDER_TUPLE}[])`,
  'function getProviderCount() view returns (uint256)',
  'function getActiveProviderCount() view returns (uint256)',
];

export const PIPELINE_CATEGORY_IDS = {
  llm: 0,
  image_turbo: 1,
  image_quality: 2,
  image_standard: 3,
  image_advanced: 4,
  audio_turbo: 6,
  audio_quality: 7,
  music: 8,
  video_fast: 9,
  video_sota: 9,
  video_quality: 9,
  vision: 10,
  pipeline_shard: 11,
};

async function registry(needsSigner = false) {
  const address = CONFIG.p2pNetwork?.providerRegistryAddress;
  if (!address) throw new Error('Provider registry not deployed');
  if (needsSigner) await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
  const connection = needsSigner
    ? await web3Service.getSigner()
    : await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  return new ethers.Contract(address, PROVIDER_REGISTRY_ABI, connection);
}

function formatProvider(provider) {
  if (!provider || provider.wallet === ethers.ZeroAddress) return null;
  const pipelineNames = Object.entries(PIPELINE_CATEGORY_IDS);
  return {
    wallet: provider.wallet,
    peerId: provider.peerId,
    multiaddrs: provider.multiaddrs,
    pipelines: provider.pipelines.map((id) =>
      pipelineNames.find(([, value]) => value === Number(id))?.[0] || `unknown_${id}`,
    ),
    rewardMode: 'service-time-pool',
    totalEarnings: ethers.formatEther(provider.totalEarnings),
    completedJobs: Number(provider.completedJobs),
    registeredAt: new Date(Number(provider.registeredAt) * 1000),
    lastSeenAt: new Date(Number(provider.lastSeenAt) * 1000),
    isActive: provider.isActive,
    isRelay: provider.isRelay,
    maxLayers: Number(provider.maxLayers || 0),
    computeScore: Number(provider.computeScore || 0),
    memoryMB: Number(provider.memoryMB || 0),
  };
}

async function send(method, args = []) {
  const contract = await registry(true);
  const tx = await contract[method](...args);
  const receipt = await tx.wait();
  return { success: true, txHash: receipt.hash };
}

export async function registerProvider({ peerId, multiaddrs = [], pipelines = [], isRelay = false }) {
  try {
    const pipelineIds = pipelines.map((pipeline) => PIPELINE_CATEGORY_IDS[pipeline] ?? Number(pipeline));
    return await send('register', [peerId, multiaddrs, pipelineIds, isRelay]);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function activateProvider() {
  try { return await send('activate'); } catch (error) { return { success: false, error: error.message }; }
}

export async function deactivateProvider() {
  try { return await send('deactivate'); } catch (error) { return { success: false, error: error.message }; }
}

export async function sendHeartbeat() {
  try { return await send('heartbeat'); } catch (error) { return { success: false, error: error.message }; }
}

export async function setShardCapabilities(maxLayers, computeScore, memoryMB) {
  try {
    return await send('setShardCapabilities', [maxLayers, computeScore, memoryMB]);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getProvider(walletAddress) {
  try { return formatProvider(await (await registry()).getProvider(walletAddress)); } catch { return null; }
}

export async function getProviderByPeerId(peerId) {
  try { return formatProvider(await (await registry()).getProviderByPeerId(peerId)); } catch { return null; }
}

export async function getProvidersForPipeline(pipeline) {
  try {
    const id = typeof pipeline === 'string' ? PIPELINE_CATEGORY_IDS[pipeline] : pipeline;
    return (await (await registry()).getProvidersForPipeline(id)).map(formatProvider).filter(Boolean);
  } catch { return []; }
}

export async function getRelayNodes() {
  try { return (await (await registry()).getRelayNodes()).map(formatProvider).filter(Boolean); } catch { return []; }
}

export async function getShardProviders(minLayers = 1, minMemoryMB = 0) {
  try {
    return (await (await registry()).getShardProviders(minLayers, minMemoryMB)).map(formatProvider).filter(Boolean);
  } catch { return []; }
}

export async function getProviderStats() {
  try {
    const contract = await registry();
    const [total, active] = await Promise.all([
      contract.getProviderCount(),
      contract.getActiveProviderCount(),
    ]);
    return { totalProviders: Number(total), activeProviders: Number(active), rewardMode: 'service-time-pool' };
  } catch { return null; }
}

export function areContractsDeployed() {
  return Boolean(CONFIG.p2pNetwork?.providerRegistryAddress && CONFIG.p2pNetwork?.serviceTimeAddress);
}

export default {
  PIPELINE_CATEGORY_IDS,
  registerProvider,
  activateProvider,
  deactivateProvider,
  sendHeartbeat,
  setShardCapabilities,
  getProvider,
  getProviderByPeerId,
  getProvidersForPipeline,
  getRelayNodes,
  getShardProviders,
  getProviderStats,
  areContractsDeployed,
};
