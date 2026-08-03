import { ethers } from "ethers";
import { CONFIG, ECONOMY_NETWORK_KEY } from "../config/web3.config.js";
import { getSigner, switchNetwork } from "./web3.service.js";

const ABI = [
  "function issue(address collectible,uint256 collectibleTokenId,string name,string symbol,string metadataURI) returns (address)",
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
  if (!ethers.isAddress(address)) {
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
}) {
  if (!ethers.isAddress(collectible)) throw new Error("Invalid game collectible address");
  if (projectManifest?.schema !== "bonzai.game-project" || projectManifest?.kind !== "game") {
    throw new Error("A valid BonzAI game manifest is required");
  }
  await switchNetwork(ECONOMY_NETWORK_KEY);
  const signer = await getSigner();
  const registryAddress = CONFIG.gameRegistry.contractAddress;
  if (!ethers.isAddress(registryAddress)) {
    throw new Error("Game registry is not deployed on the active economy chain");
  }
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
    await registration.wait();
  }
  const factory = new ethers.Contract(requireFactory(), ABI, signer);
  const transaction = await factory.issue(
    collectible,
    collectibleTokenId,
    String(name || "").trim(),
    String(symbol || "").trim().toUpperCase(),
    metadataURI,
  );
  const receipt = await transaction.wait();
  const event = receipt.logs
    .map((log) => {
      try { return factory.interface.parseLog(log); } catch { return null; }
    })
    .find((entry) => entry?.name === "GameTokenIssued");
  if (!event) throw new Error("Game token issuance event was not emitted");
  return {
    tokenAddress: event.args.token,
    transactionHash: receipt.hash,
    chainId: CONFIG.gameTokenFactory.chainId,
  };
}

export async function getAllGameTokenAddresses() {
  const address = requireFactory();
  const provider = new ethers.JsonRpcProvider(CONFIG.networks[ECONOMY_NETWORK_KEY].rpc);
  return new ethers.Contract(address, ABI, provider).getAllTokens();
}

export async function getGameTokenInfo(address) {
  if (!ethers.isAddress(address)) return null;
  const provider = new ethers.JsonRpcProvider(CONFIG.networks[ECONOMY_NETWORK_KEY].rpc);
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
