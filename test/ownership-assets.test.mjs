import test from 'node:test';
import assert from 'node:assert/strict';
import { ownershipAssets, filterOwnershipAssets, imageSource, safeOwnershipLink } from '../src/services/ownershipAssets.js';
test('ownership keeps token zero, distinguishes unconfirmed mints and covers every local asset type', () => {
  const assets = ownershipAssets([{ id: 'minted', type: 'image', question: 'A new scene', nft: { tokenId: 0, trainingMaterial: { eligible: true } } }, { id: 'pending', nft: {} }, { id: 'local-no-mint' }], [{ id: 'm1', filename: 'model.gguf' }], [{ packId: 'pack', recordCount: 17 }]);
  assert.equal(assets.length, 4); assert.equal(assets[0].tokenId, '0'); assert.equal(assets[1].status, 'Mint unconfirmed');
  assert.equal(filterOwnershipAssets(assets, { state: 'minted' }).length, 1);
  assert.equal(filterOwnershipAssets(assets, { kind: 'model', query: 'model.gguf' }).length, 1);
  assert.equal(filterOwnershipAssets(assets, { state: 'training' }).length, 1);
  assert.equal(filterOwnershipAssets(assets, { query: '0', state: 'minted' })[0].id, 'creation:minted');
});
test('local library does not fetch remote previews or open unsafe marketplace URLs', () => {
  assert.equal(imageSource('https://example.com/private-image.png'), null);
  assert.equal(safeOwnershipLink('javascript:alert(1)'), null);
  assert.equal(safeOwnershipLink('https://opensea.io/assets/example'), 'https://opensea.io/assets/example');
});
