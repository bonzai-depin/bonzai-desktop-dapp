const tokenId = nft => nft?.tokenId !== null && nft?.tokenId !== undefined && nft?.tokenId !== '' ? String(nft.tokenId) : null;
export function ownershipAssets(generations = [], models = [], contributions = []) {
  return [
    ...generations.filter(item => item.nft).map(item => ({
      id: `creation:${item.id}`, sourceId: item.id, kind: 'creation', type: item.type || 'text',
      title: item.question || item.prompt || 'Untitled creation',
      date: item.nft?.mintedAt || item.timestamp, nft: item.nft, tokenId: tokenId(item.nft),
      status: tokenId(item.nft) === null ? 'Mint unconfirmed' : 'Mint recorded',
      blocked: Boolean(item.nft?.contentSafety?.nsfw || item.nft?.marketplace?.blockedReason),
      discoverable: item.nft?.marketplace?.discoverable === true,
      training: item.nft?.trainingMaterial?.eligible === true,
      image: item.type === 'image' ? imageSource(item.answer?.data?.image || item.answer?.image || item.image) : null,
      owners: (item.nft?.trainingMaterial?.downstreamRevenue?.dataOwners || []).map(owner => owner.wallet).filter(Boolean),
      detail: item.nft?.marketplace?.blockedReason || null,
    })),
    ...models.map(model => ({
      id: `model:${model.id}`, sourceId: model.id, kind: 'model', type: model.type || 'model',
      title: model.name || model.filename || model.base_model || model.id, date: model.created_at || model.createdAt,
      nft: model.nft, tokenId: tokenId(model.nft), status: tokenId(model.nft) !== null ? 'Mint recorded' : 'Local model',
      symbol: model.fineTuneToken?.symbol, tokenAddress: model.fineTuneToken?.tokenAddress,
      owners: model.data_owner_wallets || [], origins: model.origin_record_count || 0,
      route: model.revenueRoute?.assetId, registry: model.modelRegistry?.modelId,
      baseModel: model.base_model,
    })),
    ...contributions.map((entry, index) => ({
      id: `dataset:${entry.id || entry.packId || index}`, sourceId: entry.id || entry.packId, kind: 'dataset', type: 'dataset',
      title: entry.fileName || entry.packId || 'Contribution pack', date: entry.importedAt || entry.createdAt,
      status: entry.status === 'published' ? 'Publication recorded' : 'Imported',
      records: entry.recordCount || 0, royalties: entry.royaltyBearing || 0,
      owners: entry.dataOwnerWallets || [], ownerCount: entry.dataOwnerCount || 0,
    })),
  ];
}
export function imageSource(value) {
  if (typeof value !== 'string' || !value) return null;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value)) return value;
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 100) return `data:image/png;base64,${value}`;
  // The library never fetches remote images just to render a local portfolio.
  return null;
}
export function safeOwnershipLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function filterOwnershipAssets(assets, { kind = 'all', query = '', state = 'all', sort = 'recent' } = {}) {
  const term = query.trim().toLowerCase();
  return assets.filter(asset => (kind === 'all' || asset.kind === kind)
    && (!term || [asset.title, asset.tokenId, asset.symbol, asset.sourceId, ...(asset.owners || [])].filter(value => value != null).join(' ').toLowerCase().includes(term))
    && (state === 'all' || state === 'minted' && asset.tokenId !== null && asset.tokenId !== undefined
      || state === 'training' && asset.training || state === 'blocked' && asset.blocked))
    .sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
}
