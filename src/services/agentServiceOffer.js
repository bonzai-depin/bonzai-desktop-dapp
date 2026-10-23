import { ethers } from 'ethers';

export const OFFER_USES = Object.freeze(['knowledge', 'model', 'delivery']);
const hash = value => ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(value)));
const bounded = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export const serviceAssetKey = asset => `${asset.chainId}:${asset.collection.toLowerCase()}:${asset.tokenId}`;

/** Only this allowlisted manifest is advertised. Originals and local bindings never leave the provider. */
export function serviceOffer(input) {
  if (!input || !bounded(input.title, 100) || !bounded(input.outcome, 600)
    || !bounded(input.price, 60) || !/^\d+(?:\.\d{1,36})?$/.test(input.price) || !/[1-9]/.test(input.price)
    || !Array.isArray(input.assets) || !input.assets.length || input.assets.length > 12) throw new Error('Describe the service, its payment and at least one tokenized asset.');
  const assets = input.assets.map(a => {
    if (!Number.isSafeInteger(a.chainId) || a.chainId <= 0 || !ethers.isAddress(a.collection) || a.collection === ethers.ZeroAddress
      || !/^\d{1,78}$/.test(String(a.tokenId)) || !bounded(a.title, 160) || !bounded(a.kind, 40)
      || !/^0x[0-9a-f]{64}$/.test(a.digest) || !bounded(a.license, 1000) || !OFFER_USES.includes(a.use)) throw new Error('Each asset needs its token reference, fingerprint, use and license terms.');
    return { chainId: a.chainId, collection: a.collection.toLowerCase(), tokenId: String(a.tokenId), title: a.title.trim(), kind: a.kind,
      digest: a.digest, use: a.use, license: a.license.trim() };
  });
  if (new Set(assets.map(serviceAssetKey)).size !== assets.length || assets.filter(a => a.use === 'model').length > 1) throw new Error('Choose each asset once and only one inference model.');
  const value = { version: 1, title: input.title.trim(), outcome: input.outcome.trim(), price: input.price,
    access: 'per-job', assets: assets.sort((a,b) => serviceAssetKey(a).localeCompare(serviceAssetKey(b))) };
  return { ...value, hash: hash(value) };
}
export function validateServiceOffer(offer, grant) {
  if (offer?.version !== 1 || offer.access !== 'per-job' || serviceOffer(offer).hash !== offer.hash) throw new Error('This service offer has changed. Refresh it before hiring.');
  // Reject unrecognized fields, including accidental credentials or private paths.
  if (JSON.stringify(serviceOffer(offer)) !== JSON.stringify(offer)) throw new Error('Invalid public service manifest.');
  if (grant && (offer.assets.some(a => a.chainId !== grant.chainId)
    || (offer.assets.some(a => a.use === 'model') && grant.capabilities.some(c => !['text','3d','skill','assets'].includes(c)))
    || (grant.capabilities.includes('assets') && !offer.assets.some(a => a.use === 'delivery'))
    || (grant.capabilities.includes('assets') && grant.capabilities.length !== 1)
    || grant.capabilities.includes('workflow')
    || (grant.capabilities.includes('assets') && offer.assets.some(a=>a.use!=='delivery'))
    || (!grant.capabilities.includes('assets') && offer.assets.some(a=>a.use==='delivery')))) throw new Error('Choose compatible creation capabilities for this asset package.');
  return offer;
}
export function verifyOfferPayment(offer, terms) {
  validateServiceOffer(offer);
  if (terms.serviceOffer?.hash !== offer.hash || serviceOffer(terms.serviceOffer).hash !== offer.hash) throw new Error('The funded asset package differs from this offer. Ask the provider to restore it or use the job refund controls.');
  if (BigInt(terms.amount) < ethers.parseUnits(offer.price, terms.decimals)) throw new Error('The payment is below the published service price.');
}

/** Deterministic, bounded retrieval over only the explicitly selected provider sources. */
export function serviceKnowledge(sources, query, budget = 12000) {
  const terms = new Set(String(query).toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const chunks = sources.flatMap(source => String(source.text || '').match(/[\s\S]{1,1800}/g)?.map((text, index) => ({
    text, source, index, score: [...terms].reduce((n,t) => n + (text.toLocaleLowerCase().includes(t) ? 1 : 0), 0),
  })) || []);
  chunks.sort((a,b) => b.score-a.score || a.source.asset.title.localeCompare(b.source.asset.title) || a.index-b.index);
  const selected = []; let remaining = budget;
  for (const chunk of chunks) {
    const citation = `${serviceAssetKey(chunk.source.asset)}#${chunk.index + 1}`;
    const block = `[Source ${citation} · ${chunk.source.asset.title}]\n${chunk.text}`;
    const length = block.length + (selected.length ? 2 : 0);
    if (remaining < length) continue;
    selected.push({ citation, text: block }); remaining -= length;
  }
  return { text: selected.map(c=>c.text).join('\n\n'), citations: selected.map(c=>c.citation) };
}
