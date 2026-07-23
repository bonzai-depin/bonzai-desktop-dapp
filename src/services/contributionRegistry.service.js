import { ethers } from 'ethers';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

const CONTRIBUTION_REGISTRY_ABI = [
  'function registerContribution(bytes32 contentHash,string metadataURI,string licenseURI,string sourceURI,uint8 contributionType,uint16 qualityScore,uint8 visibility,bytes32[] parents) returns (bytes32)',
  'event ContributionRegistered(bytes32 indexed contributionId,address indexed contributor,uint8 indexed contributionType,bytes32 contentHash,string metadataURI,uint16 qualityScore,uint256 timestamp)',
];

const DATASET_REGISTRY_ABI = [
  'function registerDataset(bytes32 contentHash,string metadataURI,string licenseURI,bool trainingAllowed,bool commercialAllowed,bool royaltyBearing,bytes32[] contributionIds) returns (bytes32)',
  'event DatasetRegistered(bytes32 indexed datasetId,address indexed owner,bytes32 contentHash,string metadataURI,uint256 contributionCount,uint256 timestamp)',
];

const MODEL_REGISTRY_ABI = [
  'function publishModel(uint8 modelType,bytes32 modelHash,string metadataURI,string licenseURI,address revenueRecipient,uint16 qualityScore,bytes32[] datasetIds,bytes32[] evaluationIds) returns (bytes32)',
  'event ModelPublished(bytes32 indexed modelId,address indexed publisher,uint8 indexed modelType,bytes32 modelHash,string metadataURI,uint16 qualityScore,uint256 timestamp)',
];

function registryConfig() {
  return CONFIG.contributionEconomy || {};
}

function requiredAddress(key) {
  const value = registryConfig()[key];
  if (!value) throw new Error(`Contribution economy contract not deployed. Set CONFIG.contributionEconomy.${key}.`);
  return value;
}

async function signerContract(address, abi) {
  const chainId = registryConfig().chainId;
  const networkKey = Object.entries(CONFIG.networks || {})
    .find(([, network]) => Number(network.chainId) === Number(chainId))?.[0] || 'base';
  await web3Service.switchNetwork?.(networkKey);
  const browserProvider = await web3Service.getBrowserProvider();
  const signer = await browserProvider.getSigner();
  return new ethers.Contract(address, abi, signer);
}

function hashString(value) {
  return ethers.id(String(value || 'bonzai-empty'));
}

function contributionTypeId(kind) {
  const map = registryConfig().contributionTypes || {};
  return map[kind] ?? map.dataset_text ?? 0;
}

function visibilityId(visibility) {
  const map = registryConfig().visibility || {};
  return map[visibility] ?? map.publishable ?? 2;
}

function qualityScore(record) {
  const score = Number(record.contribution_quality || record.quality_score || 0);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function modelQualityScore(model, provenance) {
  if (Number.isFinite(Number(model?.quality_score))) {
    return Math.max(0, Math.min(100, Math.round(Number(model.quality_score))));
  }
  const plan = provenance?.attribution?.revenuePlan?.participants || [];
  if (!plan.length) return 50;
  const total = plan.reduce((sum, participant) => sum + Number(participant.weight || 0), 0);
  return Math.max(50, Math.min(100, Math.round(total / Math.max(1, plan.length))));
}

function modelTypeId(model) {
  const raw = String(model?.type || model?.target || model?.base_model || '').toLowerCase();
  if (raw.includes('image') || raw.includes('sdxl') || raw.includes('flux')) return 1;
  if (raw.includes('audio') || raw.includes('tts') || raw.includes('music')) return 2;
  if (raw.includes('video') || raw.includes('wan') || raw.includes('ltx')) return 3;
  if (raw.includes('vision')) return 4;
  if (raw.includes('embedding')) return 5;
  if (raw.includes('lora') || raw.includes('adapter') || raw.includes('fine')) return 6;
  return 0;
}

function parentIds(record) {
  const raw = record.parents
    || record.contribution_parents
    || record.contribution_manifest?.parents
    || record.contribution_manifest?.parentIds
    || []
  if (!Array.isArray(raw)) return []
  return raw
    .map(value => String(value || ''))
    .filter(value => /^0x[a-fA-F0-9]{64}$/.test(value))
}

function licenseURI(record) {
  return record.contribution_license || record.license || registryConfig().defaultLicenseURI || 'https://bonzai.sh/licenses/contribution-v1';
}

function metadataURIForRecord(record, fallbackPackURI, index) {
  if (record.metadata_uri) return record.metadata_uri;
  if (record.contribution_manifest?.metadataURI) return record.contribution_manifest.metadataURI;
  if (fallbackPackURI) return `${fallbackPackURI}#record-${index}`;
  return `bonzai-local://contribution/${record.contribution_id || index}`;
}

function parseRegisteredId(receipt, contract, eventName) {
  for (const log of receipt.logs || []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) return parsed.args[0];
    } catch {
      // Ignore unrelated logs.
    }
  }
  return null;
}

export function contributionEconomyReady() {
  const config = registryConfig();
  return Boolean(config.contributionRegistryAddress && config.datasetRegistryAddress);
}

export function modelRegistryReady() {
  return Boolean(registryConfig().modelRegistryAddress);
}

export async function publishContributionRows(rows, options = {}) {
  const registry = await signerContract(requiredAddress('contributionRegistryAddress'), CONTRIBUTION_REGISTRY_ABI);
  const results = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const tx = await registry.registerContribution(
      hashString(row.contribution_hash || row.text || row.image_base64 || row.image_url || row.source_url || i),
      metadataURIForRecord(row, options.packMetadataURI, i),
      licenseURI(row),
      row.source_url || '',
      contributionTypeId(row.kind),
      qualityScore(row),
      visibilityId(row.contribution_visibility),
      parentIds(row),
    );
    const receipt = await tx.wait();
    results.push({
      localId: row.contribution_id || '',
      contributionId: parseRegisteredId(receipt, registry, 'ContributionRegistered'),
      txHash: receipt.hash,
    });
  }

  return results;
}

export async function publishDatasetFromRows(rows, options = {}) {
  const contributionResults = options.contributionIds
    ? options.contributionIds.map(id => ({ contributionId: id }))
    : await publishContributionRows(rows, options);

  const contributionIds = contributionResults.map(result => result.contributionId).filter(Boolean);
  const registry = await signerContract(requiredAddress('datasetRegistryAddress'), DATASET_REGISTRY_ABI);
  const tx = await registry.registerDataset(
    hashString(options.datasetHash || JSON.stringify(rows.map(row => row.contribution_hash || row.contribution_id || row.text || row.source_url))),
    options.datasetMetadataURI || options.packMetadataURI || `bonzai-local://dataset/${Date.now()}`,
    options.licenseURI || registryConfig().defaultLicenseURI || 'https://bonzai.sh/licenses/contribution-v1',
    options.trainingAllowed !== false,
    options.commercialAllowed === true,
    options.royaltyBearing === true,
    contributionIds,
  );
  const receipt = await tx.wait();

  return {
    contributionResults,
    datasetId: parseRegisteredId(receipt, registry, 'DatasetRegistered'),
    txHash: receipt.hash,
  };
}

export async function publishModelFromProvenance(model, provenance = {}, options = {}) {
  const registry = await signerContract(requiredAddress('modelRegistryAddress'), MODEL_REGISTRY_ABI);
  const datasetIds = [
    ...(options.datasetIds || []),
    ...((provenance?.dataset?.registryDatasetIds || provenance?.dataset?.datasetIds || []).filter(Boolean)),
  ].filter(value => /^0x[a-fA-F0-9]{64}$/.test(String(value)));
  const evaluationIds = (options.evaluationIds || []).filter(value => /^0x[a-fA-F0-9]{64}$/.test(String(value)));
  const signer = await registry.runner.getAddress();
  const revenueRecipient = options.revenueRecipient || signer;
  const metadataURI = options.metadataURI
    || model?.nft?.metadataUrl
    || model?.nft?.contentUrl
    || `bonzai-model://${model?.id || Date.now()}`;
  const tx = await registry.publishModel(
    modelTypeId(model),
    hashString(options.modelHash || model?.id || model?.filename || metadataURI),
    metadataURI,
    options.licenseURI || provenance?.dataset?.license || registryConfig().defaultLicenseURI || 'https://bonzai.sh/licenses/contribution-v1',
    revenueRecipient,
    modelQualityScore(model, provenance),
    datasetIds,
    evaluationIds,
  );
  const receipt = await tx.wait();

  return {
    modelId: parseRegisteredId(receipt, registry, 'ModelPublished'),
    txHash: receipt.hash,
    metadataURI,
    datasetIds,
    evaluationIds,
    revenueRecipient,
  };
}

export const contributionRegistryService = {
  contributionEconomyReady,
  modelRegistryReady,
  publishContributionRows,
  publishDatasetFromRows,
  publishModelFromProvenance,
};
