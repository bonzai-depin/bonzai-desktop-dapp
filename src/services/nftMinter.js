/**
 * BonzAI — NFT Minting Service
 * Tokenizes AI outputs (images, videos, audio, games, robotic datasets) as NFTs on Arbitrum
 */

import { ethers } from 'ethers';
import { tokenGating } from './tokenGating.js';

const BONZAI_NFT_ADDRESS = '0x0000000000000000000000000000000000000000'; // Deploy address
const NFT_ABI = [
  'function mint(address to, string memory tokenURI) public returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

const uploadToIPFS = async (content, name, contentType = 'application/json') => {
  const pinataApiKey = typeof process !== 'undefined' ? process.env?.VITE_PINATA_API_KEY : null;
  if (!pinataApiKey) {
    const base64 = btoa(typeof content === 'string' ? content : JSON.stringify(content));
    return `data:${contentType};base64,${base64}`;
  }
  const formData = new FormData();
  const blob = typeof content === 'string' ? new Blob([content], { type: contentType })
    : content instanceof Blob ? content : new Blob([JSON.stringify(content)], { type: 'application/json' });
  formData.append('file', blob, name);
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST', headers: { 'pinata_api_key': pinataApiKey, 'pinata_secret_api_key': process.env?.VITE_PINATA_SECRET_KEY }, body: formData,
  });
  if (!response.ok) throw new Error(`IPFS upload failed: ${response.statusText}`);
  return `${IPFS_GATEWAY}${(await response.json()).IpfsHash}`;
};

const createMetadata = (type, data, contentUrl) => ({
  name: `BonzAI ${type.charAt(0).toUpperCase() + type.slice(1)} #${Date.now()}`,
  description: data.prompt || `AI-generated ${type} by BonzAI`,
  external_url: 'https://bonzai.io',
  ...(type === 'image' || type === 'game' || type === 'robotic' ? { image: contentUrl } : { animation_url: contentUrl }),
  attributes: [
    { trait_type: 'Type', value: type },
    { trait_type: 'Generator', value: 'BonzAI' },
    { trait_type: 'Created', value: new Date().toISOString() },
    ...(data.pipeline ? [{ trait_type: 'Pipeline', value: data.pipeline }] : []),
    ...(data.successRate ? [{ trait_type: 'Success Rate', value: `${data.successRate}%` }] : []),
  ],
});

export const mint = async (data, type) => {
  const access = await tokenGating.verifyAccess('mint');
  if (!access.allowed) throw new Error(access.reason);
  const { walletAddress } = tokenGating.state;
  if (!walletAddress) throw new Error('Wallet not connected');

  let contentUrl;
  if (type === 'image' && data.imageData) {
    const blob = await fetch(`data:image/png;base64,${data.imageData}`).then(r => r.blob());
    contentUrl = await uploadToIPFS(blob, `bonzai-image-${Date.now()}.png`, 'image/png');
  } else if (type === 'game' && data.code) {
    contentUrl = await uploadToIPFS(data.code, `bonzai-game-${Date.now()}.js`, 'text/javascript');
  } else {
    contentUrl = await uploadToIPFS(JSON.stringify(data), `bonzai-${type}-${Date.now()}.json`);
  }

  const metadata = createMetadata(type, data, contentUrl);
  const metadataUrl = await uploadToIPFS(metadata, `bonzai-metadata-${Date.now()}.json`);

  const provider = new ethers.BrowserProvider(window.ethereum);
  const code = await provider.getCode(BONZAI_NFT_ADDRESS);
  if (code === '0x') {
    return { success: true, simulated: true, tokenId: Date.now(), metadataUrl, contentUrl, message: 'NFT minting simulated' };
  }

  const signer = await provider.getSigner();
  const contract = new ethers.Contract(BONZAI_NFT_ADDRESS, NFT_ABI, signer);
  const tx = await contract.mint(walletAddress, metadataUrl);
  const receipt = await tx.wait();
  const tokenId = receipt.logs[0]?.topics[3] ? parseInt(receipt.logs[0].topics[3], 16) : Date.now();

  return { success: true, tokenId, transactionHash: receipt.hash, contractAddress: BONZAI_NFT_ADDRESS,
    metadataUrl, contentUrl, explorerUrl: `https://arbiscan.io/tx/${receipt.hash}`, chainId: 42161 };
};

export const getNFT = async (tokenId) => {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const contract = new ethers.Contract(BONZAI_NFT_ADDRESS, NFT_ABI, provider);
  const [owner, tokenURI] = await Promise.all([contract.ownerOf(tokenId), contract.tokenURI(tokenId)]);
  const metadata = await (await fetch(tokenURI)).json();
  return { tokenId, owner, tokenURI, metadata };
};

export const nftMinter = { mint, getNFT, uploadToIPFS, createMetadata, BONZAI_NFT_ADDRESS };
export default nftMinter;
