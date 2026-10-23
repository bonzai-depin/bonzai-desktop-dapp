import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { serviceOffer, serviceAssetKey } from './agentServiceOffer.js';

export async function verifyServiceAssetOwner(asset, owner) {
  if (Number(asset.chainId) !== Number(CONFIG.contributionEconomy.chainId)) throw new Error('Select assets on the configured economy network.');
  const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  if (Number((await provider.getNetwork()).chainId) !== asset.chainId) throw new Error('Asset verification is on another network.');
  const nft = new ethers.Contract(asset.collection, ['function ownerOf(uint256) view returns(address)'], provider);
  if ((await nft.ownerOf(asset.tokenId)).toLowerCase() !== owner.toLowerCase()) throw new Error('The provider no longer owns an asset in this offer.');
}
export async function prepareServicePackage(draft, owner) {
  if (!draft.rightsConfirmed) throw new Error('Confirm that you can license these assets for the selected uses.');
  const assets = [], bindings = []; let deliveryBytes=0, fileCount=0, hasModelBundle=false;
  for (const choice of draft.assets) {
    const source = await window.electronAPI.agentServiceAssetInspect(choice.id);
    if (!source.uses.includes(choice.use)) throw new Error('This original cannot be used in that way.');
    if (choice.use === 'delivery') { deliveryBytes+=source.deliveryBytes; fileCount+=source.fileCount; hasModelBundle ||= ['checkpoint','abliteration','lora'].includes(source.kind); }
    const asset = { ...source, use:choice.use, license:choice.license };
    await verifyServiceAssetOwner(asset, owner);
    assets.push(asset); bindings.push({ id:choice.id, key:serviceAssetKey(asset) });
  }
  if (!Number.isFinite(deliveryBytes) || deliveryBytes > (hasModelBundle ? 32*1024**3 : 128*1024**2) || fileCount>128) throw new Error('This delivery package is too large. Offer fewer originals together.');
  return { offer:serviceOffer({...draft,assets}), bindings };
}
