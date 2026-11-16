import { socialCredentialVault } from './social/credentials.js';

const API = 'https://api.pinata.cloud';
const GATEWAY = 'https://gateway.pinata.cloud/ipfs';
export const MAX_PUBLIC_UPLOAD = 512 * 1024 * 1024;

/** Fixed-destination uploads: secrets never leave main or enter the public build. */
export function createPublicStorage({ store, safeStorage, fetchImpl = fetch }) {
  const vault = socialCredentialVault(store, safeStorage, 'bonzai-storage-credentials');
  const credentials = () => vault.read('pinata', 'device');
  const status = () => ({ configured: Boolean(credentials()?.jwt), persistent: true });
  const receipts = () => store.get('bonzai-storage-receipts', []);
  async function request(endpoint, body, json = false) {
    const jwt = credentials()?.jwt;
    if (!jwt) throw new Error('Set up IPFS storage in Ownership → Web3 Guide → Decentralized Storage.');
    let response;
    try {
      response = await fetchImpl(`${API}${endpoint}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000),
        headers: { Authorization: `Bearer ${jwt}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
        body: json ? JSON.stringify(body) : body,
      });
    } catch { throw new Error('IPFS upload could not be confirmed. Check Pinata before uploading again.'); }
    // Do not forward upstream bodies: they can echo request headers or credentials.
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? 'Pinata rejected these credentials. Check their pinning permissions in Storage settings.'
      : `IPFS upload failed (HTTP ${response.status}). Check your Pinata plan and retry.`);
    const result = await response.json();
    if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(result.IpfsHash || '')) throw new Error('Pinata returned an invalid content identifier. Check your Pinata account before retrying.');
    return { transactionId: result.IpfsHash, cid: result.IpfsHash, url: `ipfs://${result.IpfsHash}`, gatewayUrl: `${GATEWAY}/${result.IpfsHash}`, timestamp: result.Timestamp || new Date().toISOString(), size: result.PinSize, signature: null, tags: [] };
  }
  function remember(receipt, name) {
    try { store.set('bonzai-storage-receipts', [{ ...receipt, name }, ...receipts().filter(row => row.cid !== receipt.cid)].slice(0, 100)); }
    catch { receipt.localRecordWarning = 'Uploaded to IPFS, but the local receipt could not be saved. Keep the CID.'; }
    return receipt;
  }
  return {
    status, receipts,
    configure(jwt) {
      if (typeof jwt !== 'string' || !jwt.trim() || jwt.length > 16384 || /\s/.test(jwt.trim())) throw new Error('Enter a valid Pinata JWT.');
      vault.write('pinata', 'device', { jwt: jwt.trim() });
      return status();
    },
    disconnect() { vault.remove('pinata', 'device'); return status(); },
    async upload({ data, contentType, name = 'bonzai-content', keyvalues = {} } = {}) {
      if (!(data instanceof Uint8Array) || !data.byteLength || data.byteLength > MAX_PUBLIC_UPLOAD) throw new Error('Choose a non-empty file up to 512 MiB.');
      if (typeof name !== 'string' || name.length > 200 || typeof contentType !== 'string' || contentType.length > 200) throw new Error('Invalid upload metadata.');
      const body = new FormData();
      body.append('file', new Blob([data], { type: contentType }), name);
      body.append('pinataMetadata', JSON.stringify({ name, keyvalues }));
      body.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
      return remember(await request('/pinning/pinFileToIPFS', body), name);
    },
    async uploadMetadata({ metadata, name = 'bonzai-metadata.json', keyvalues = {} } = {}) {
      if (!metadata || typeof metadata !== 'object' || JSON.stringify(metadata).length > 8 * 1024 * 1024) throw new Error('Choose JSON metadata up to 8 MiB.');
      return remember(await request('/pinning/pinJSONToIPFS', { pinataContent: metadata, pinataMetadata: { name, keyvalues }, pinataOptions: { cidVersion: 1 } }, true), name);
    },
  };
}
