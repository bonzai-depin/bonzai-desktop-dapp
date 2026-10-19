import { confirmedReceipt } from './transactionReceipt.js';
import { ethers } from "ethers";
import { CONFIG, ECONOMY_NETWORK_KEY } from "../config/web3.config.js";
import { getSigner, getProvider, switchNetwork } from "./web3.service.js";

const ABI = [
  "function minEthLiquidity() view returns(uint256)",
  "function liquidityVault() view returns(address)",
  "function issue(address collectible,uint256 collectibleTokenId,string name,string symbol,string metadataURI) payable returns (address)",
  "function tokenForCollectible(bytes32) view returns (address)",
  "function getAllTokens() view returns (address[])",
  "event GameTokenIssued(address indexed token,address indexed creator,address indexed collectible,uint256 collectibleTokenId,string name,string symbol,string metadataURI)",
];
const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function creator() view returns (address)",
  "function collectible() view returns (address)",
  "function collectibleTokenId() view returns (uint256)",
  "function metadataURI() view returns (string)",
  "function totalSupply() view returns (uint256)",
];
const REGISTRY_ABI = [
  "function register(address collectible,uint256 tokenId,bytes32 manifestHash,string metadataURI)",
  "function isRegisteredGame(address collectible,uint256 tokenId) view returns (bool)",
];

function requireFactory() {
  const address = CONFIG.gameTokenFactory.contractAddress;
  if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
    throw new Error("Game token issuance is not deployed on the active economy chain");
  }
  return address;
}

export async function issueGameToken({
  collectible,
  collectibleTokenId,
  name,
  symbol,
  metadataURI,
  projectManifest,
  liquidityEth,
}) {
  if (!ethers.isAddress(collectible)) throw new Error("Invalid game collectible address");
  if (projectManifest?.schema !== "bonzai.game-project" || projectManifest?.kind !== "game") {
    throw new Error("A valid BonzAI game manifest is required");
  }
  const liquidity = ethers.parseEther(String(liquidityEth || "0"));
  if (liquidity <= 0n) throw new Error("Review and enter the ETH amount for permanently locked game liquidity.");
  await switchNetwork(ECONOMY_NETWORK_KEY);
  const signer = await getSigner();
  const reviewedWallet = await signer.getAddress();
  const registryAddress = CONFIG.gameRegistry.contractAddress;
  if (!ethers.isAddress(registryAddress)) {
    throw new Error("Game registry is not deployed on the active economy chain");
  }
  const factory = new ethers.Contract(requireFactory(), ABI, signer);
  if (await factory.liquidityVault() === ethers.ZeroAddress) throw new Error("Game liquidity vault is not configured");
  const minimum = await factory.minEthLiquidity();
  if (liquidity < minimum) throw new Error(`Minimum game liquidity is ${ethers.formatEther(minimum)} ETH`);
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);
  const registered = await registry.isRegisteredGame(collectible, collectibleTokenId);
  if (!registered) {
    const manifestHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(projectManifest || {})),
    );
    const registration = await registry.register(
      collectible,
      collectibleTokenId,
      manifestHash,
      metadataURI,
    );
    await confirmedReceipt(registration);
  }
  if ((await (await getSigner()).getAddress()).toLowerCase() !== reviewedWallet.toLowerCase()) throw new Error('Wallet changed. Review game issuance again.');
  const transaction = await factory.issue(
    collectible,
    collectibleTokenId,
    String(name || "").trim(),
    String(symbol || "").trim().toUpperCase(),
    metadataURI,
    { value: liquidity },
  );
  const receipt = await confirmedReceipt(transaction);
  const event = receipt.logs
    .filter(log => log.address?.toLowerCase() === requireFactory().toLowerCase())
    .map((log) => {
      try { return factory.interface.parseLog(log); } catch { return null; }
    })
    .find((entry) => entry?.name === "GameTokenIssued");
  if (!event) throw Object.assign(new Error('Issuance confirmed but its token could not be read. Check this transaction before retrying.'), { transactionHash: receipt.hash, confirmationPending: true });
  return {
    tokenAddress: event.args.token,
    transactionHash: receipt.hash,
    chainId: CONFIG.gameTokenFactory.chainId,
  };
}

export async function getAllGameTokenAddresses() {
  const address = requireFactory();
  const provider = await getProvider(ECONOMY_NETWORK_KEY);
  return new ethers.Contract(address, ABI, provider).getAllTokens();
}

export async function getGameTokenInfo(address) {
  if (!ethers.isAddress(address)) return null;
  const provider = await getProvider(ECONOMY_NETWORK_KEY);
  const token = new ethers.Contract(address, TOKEN_ABI, provider);
  const [name, symbol, creator, collectible, collectibleTokenId, metadataURI, totalSupply] =
    await Promise.all([
      token.name(),
      token.symbol(),
      token.creator(),
      token.collectible(),
      token.collectibleTokenId(),
      token.metadataURI(),
      token.totalSupply(),
    ]);
  return {
    address,
    name,
    symbol,
    creator,
    collectible,
    collectibleTokenId: collectibleTokenId.toString(),
    metadataURI,
    totalSupply: totalSupply.toString(),
    kind: "game",
  };
}

export async function recoverGameIssuance(collectible, collectibleTokenId, transactionHash) {
  if (!ethers.isAddress(collectible)) throw new Error('Invalid game collectible address');
  const provider = await getProvider(ECONOMY_NETWORK_KEY);
  const receipt = await provider.getTransactionReceipt(transactionHash);
  if (!receipt) return { pending: true };
  if (Number(receipt.status) === 0) return { reverted: true };
  const factory = new ethers.Contract(requireFactory(), ABI, provider);
  const key = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [collectible, collectibleTokenId]));
  const tokenAddress = await factory.tokenForCollectible(key);
  if (tokenAddress === ethers.ZeroAddress) return { registeredOnly: true };
  return { tokenAddress, transactionHash: receipt.hash, chainId: CONFIG.gameTokenFactory.chainId };
}
