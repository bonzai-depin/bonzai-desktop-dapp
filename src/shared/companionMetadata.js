/** Local companion fields that do not have dedicated SQLite columns.
 * Keep this explicit: credentials, company memory and obsolete connector
 * grants are not companion metadata and must not enter this payload.
 */
const STRING_FIELDS = [
  'lastName', 'style', 'firstMessage', 'defaultImage',
  'voiceSample', 'voiceInstruct', 'voicePreview',
  'network', 'standard', 'agentWalletProvider', 'creator', 'owner',
  'ownerWallet', 'ownerAddress', 'universalProfile',
  'tokenAddress', 'tokenName', 'tokenSymbol', 'poolId', 'pairAddress',
  'txHash', 'tokenLaunchTx', 'launchContract', 'metadataURI', 'agentURI',
  'launchStatus', 'launchError', 'tokenLaunchEth', 'tokenLaunchStatus',
];
const BOOLEAN_FIELDS = ['isNFT', 'isBare', 'needsSetup', 'x402Support', 'launchPending'];
const NUMBER_FIELDS = ['tokenLaunchDate', 'mintedAt'];

export function companionExtraMetadata(value = {}) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const extra = {};
  for (const field of STRING_FIELDS) {
    if (typeof value[field] === 'string' || value[field] === null) extra[field] = value[field];
  }
  for (const field of BOOLEAN_FIELDS) {
    if (typeof value[field] === 'boolean' || value[field] === null) extra[field] = value[field];
  }
  for (const field of NUMBER_FIELDS) {
    if ((typeof value[field] === 'number' && Number.isFinite(value[field])) || value[field] === null) extra[field] = value[field];
  }
  if (Array.isArray(value.assignedWorkflowIds)) {
    // The workflow catalog validates availability. Persistence keeps only
    // selected IDs and never converts connector action aliases into skills.
    extra.assignedWorkflowIds = [...new Set(value.assignedWorkflowIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))];
  }
  return extra;
}
