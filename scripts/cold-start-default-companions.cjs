/**
 * Mint every default BonzAI companion with ERC-8004 identity, a named ERC-20,
 * and permanently locked Uniswap V4 liquidity.
 *
 * Dry-run is the default. Production execution requires EXECUTE=1.
 *
 * Required:
 *   BONZAI_COMPANIONS_ADDRESS
 *   BONZAI_COMPANION_TOKEN_FACTORY_ADDRESS
 *   DEFAULT_COMPANION_MNEMONIC        (EXECUTE only; use a dedicated secret)
 *   PINATA_JWT                        (EXECUTE only)
 *   BONZAI_SKILL_OWNERSHIP_ADDRESS    (EXECUTE only)
 *   ATTESTATION_SIGNER_PRIVATE_KEY    (EXECUTE only)
 *   VITE_BONZAI_SKILL_ID_MAP_JSON
 *     {"robinhood-portfolio-council-v1.0.0":"0x..."}
 *
 * Usage:
 *   npx hardhat run scripts/cold-start-default-companions.cjs --network robinhood
 *   EXECUTE=1 npx hardhat run scripts/cold-start-default-companions.cjs --network robinhood
 */

const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

const { ethers } = hre;
const EXECUTE = process.env.EXECUTE === "1";
const STATE_PATH = path.resolve(
  process.env.DEFAULT_COMPANION_STATE_FILE || "deployments/default-companions.json",
);
const ENV_OUTPUT_PATH = path.resolve(
  process.env.DEFAULT_COMPANION_ENV_FILE || "deployments/default-companions.env",
);
const CATEGORY_ORDER = [
  "education", "entertainment", "fashion", "finance", "food", "healthcare",
  "housing", "beauty", "reading", "social", "travel", "sports",
];

function requiredAddress(name) {
  const value = process.env[name];
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero contract address`);
  }
  return value;
}

function packProfile(habits) {
  return CATEGORY_ORDER.reduce((packed, category, index) => {
    const score = Number(habits[category]);
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      throw new Error(`Invalid ${category} spending score: ${score}`);
    }
    return packed | (BigInt(score) << BigInt(index * 4));
  }, 0n);
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { schemaVersion: 1, companions: {} };
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function pinFile(filePath, name, jwt) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  form.append("pinataMetadata", JSON.stringify({ name }));
  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Pinata file upload failed (${response.status}): ${await response.text()}`);
  const body = await response.json();
  const cid = body.IpfsHash;
  if (!cid) throw new Error("Pinata file upload returned no CID");
  return `ipfs://${cid}`;
}

async function pinIdentity(companion, agentWallet, jwt) {
  const imagePath = path.resolve("src/assets", companion.defaultImage);
  const image = await pinFile(imagePath, `${companion.id}-portrait`, jwt);
  const registration = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: companion.name,
    description: companion.description,
    image,
    services: [{ name: "BonzAI", endpoint: "https://bonzai.sh" }],
    x402Support: false,
    active: true,
    companion: {
      id: companion.id,
      age: companion.age,
      agentWallet,
      spendingProfile: companion.spendingHabits,
    },
  };
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataMetadata: { name: `${companion.id}-erc8004-identity` },
      pinataContent: registration,
    }),
  });
  if (!response.ok) throw new Error(`Pinata identity upload failed (${response.status}): ${await response.text()}`);
  const body = await response.json();
  return { agentURI: `ipfs://${body.IpfsHash}`, image };
}

function deriveWallet(mnemonic, account, branch) {
  return ethers.HDNodeWallet.fromPhrase(
    mnemonic,
    undefined,
    `m/44'/60'/${branch}'/0/${account}`,
  ).connect(ethers.provider);
}

async function main() {
  const companionsAddress = requiredAddress("BONZAI_COMPANIONS_ADDRESS");
  const factoryAddress = requiredAddress("BONZAI_COMPANION_TOKEN_FACTORY_ADDRESS");
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const { DEFAULT_COMPANIONS } = await import("../src/skills/flagship.js");
  const { flagshipSkills } = await import("../src/skills/flagship.js");
  const { buildColdStartAssignments, getCompanionCareer } = await import(
    "../src/skills/companionSkillRoadmap.js"
  );
  const state = loadState();

  const companions = await ethers.getContractAt("BonzaiCompanions", companionsAddress);
  const factory = await ethers.getContractAt("CompanionTokenFactory", factoryAddress);
  const configuredFactory = await companions.companionTokenFactory();
  if (configuredFactory.toLowerCase() !== factoryAddress.toLowerCase()) {
    throw new Error(`Companion factory mismatch: contract uses ${configuredFactory}`);
  }
  const factoryCompanion = await factory.companionContract();
  if (factoryCompanion.toLowerCase() !== companionsAddress.toLowerCase()) {
    throw new Error(`Factory companion contract mismatch: ${factoryCompanion}`);
  }
  for (const [label, address] of [
    ["PoolManager", await factory.poolManager()],
    ["PositionManager", await factory.positionManager()],
    ["Permit2", await factory.permit2()],
    ["fee hook", await factory.feeHook()],
  ]) {
    if ((await ethers.provider.getCode(address)) === "0x") {
      throw new Error(`${label} has no bytecode on chain ${network.chainId}: ${address}`);
    }
  }

  const mintPrice = await companions.mintPrice();
  const liquidity = await companions.tokenLiquidityAmount();
  const total = mintPrice * BigInt(DEFAULT_COMPANIONS.length);
  console.log(`Network: ${network.name} (${network.chainId})`);
  console.log(`Plan: ${DEFAULT_COMPANIONS.length} companions, ${ethers.formatEther(total)} native total`);
  console.log(`Each mint atomically reserves ${ethers.formatEther(liquidity)} native for permanent V4 liquidity`);

  if (!EXECUTE) {
    DEFAULT_COMPANIONS.forEach((c, i) => {
      console.log(`[dry-run] ${i + 1}. ${c.name} -> $${c.firstName.toUpperCase()}`);
    });
    console.log("Dry-run complete. Set EXECUTE=1 only after reviewing addresses and funding.");
    return;
  }

  const mnemonic = process.env.DEFAULT_COMPANION_MNEMONIC;
  const pinataJWT = process.env.PINATA_JWT || process.env.VITE_PINATA_JWT;
  const ownershipAddress = requiredAddress("BONZAI_SKILL_OWNERSHIP_ADDRESS");
  const attestationKey = process.env.ATTESTATION_SIGNER_PRIVATE_KEY;
  const skillIdMap = JSON.parse(process.env.VITE_BONZAI_SKILL_ID_MAP_JSON || "{}");
  const skillCategories = new Map(flagshipSkills.map((skill) => [skill.id, skill.category]));
  const assignments = buildColdStartAssignments(skillIdMap).map((assignment) => ({
    ...assignment,
    category: skillCategories.get(assignment.localSkillId),
  }));
  if (!mnemonic) throw new Error("DEFAULT_COMPANION_MNEMONIC is required for execution");
  if (!pinataJWT) throw new Error("PINATA_JWT is required for execution");
  if (!attestationKey) throw new Error("ATTESTATION_SIGNER_PRIVATE_KEY is required for execution");
  if (!assignments.length) throw new Error("VITE_BONZAI_SKILL_ID_MAP_JSON must map the registered flagship skills");
  const ownership = await ethers.getContractAt("BonzaiSkillOwnership", ownershipAddress);
  const configuredAccessFactory = await ownership.companionTokenFactory();
  if (configuredAccessFactory.toLowerCase() !== factoryAddress.toLowerCase()) {
    throw new Error(`Skill ownership access factory mismatch: ${configuredAccessFactory}`);
  }
  const attestationSigner = new ethers.Wallet(attestationKey);
  if ((await ownership.attestationSigner()).toLowerCase() !== attestationSigner.address.toLowerCase()) {
    throw new Error("ATTESTATION_SIGNER_PRIVATE_KEY does not match BonzaiSkillOwnership.attestationSigner");
  }

  for (let i = 0; i < DEFAULT_COMPANIONS.length; i++) {
    const companion = DEFAULT_COMPANIONS[i];
    const existing = state.companions[companion.id];
    if (existing?.tokenId) {
      const owner = await companions.ownerOf(existing.tokenId);
      const token = await factory.companionTokens(existing.tokenId);
      if (owner !== ethers.ZeroAddress && token !== ethers.ZeroAddress) {
        console.log(`[skip] ${companion.name}: NFT ${existing.tokenId}, token ${token}`);
        continue;
      }
      throw new Error(`State for ${companion.id} does not match on-chain ownership/token data`);
    }

    // The NFT contract caps ownership at four companions per wallet.
    const ownerWallet = deriveWallet(mnemonic, Math.floor(i / 4), 0);
    const agentWallet = deriveWallet(mnemonic, i, 1);
    const targetFunding = mintPrice + ethers.parseEther(process.env.DEFAULT_COMPANION_GAS_BUFFER || "0.003");
    const balance = await ethers.provider.getBalance(ownerWallet.address);
    if (balance < targetFunding) {
      const fundingTx = await deployer.sendTransaction({
        to: ownerWallet.address,
        value: targetFunding - balance,
      });
      await fundingTx.wait();
    }

    const identity = await pinIdentity(companion, agentWallet.address, pinataJWT);
    const personalityHash = ethers.keccak256(ethers.toUtf8Bytes(
      JSON.stringify({
        id: companion.id,
        personality: companion.personality,
        traits: companion.traits,
      }),
    ));
    const career = getCompanionCareer(companion.id);
    if (!career) throw new Error(`Missing career map for ${companion.id}`);
    const symbol = career.tokenSymbol;
    const tx = await companions.connect(ownerWallet).mintCompanionWithToken(
      identity.agentURI,
      personalityHash,
      packProfile(companion.spendingHabits),
      companion.gender === "female" ? 1 : companion.gender === "male" ? 2 : 0,
      agentWallet.address,
      career.firstName,
      symbol,
      { value: mintPrice },
    );
    const receipt = await tx.wait();

    let tokenId;
    let tokenAddress;
    let poolId;
    for (const log of receipt.logs) {
      try {
        const parsed = companions.interface.parseLog(log);
        if (parsed?.name === "CompanionMinted") tokenId = parsed.args.tokenId.toString();
        if (parsed?.name === "CompanionEconomyLaunched") {
          tokenAddress = parsed.args.token;
          poolId = parsed.args.poolId;
        }
      } catch {}
    }
    if (!tokenId || !tokenAddress || !poolId) {
      throw new Error(`Mint for ${companion.id} confirmed without complete economy events`);
    }
    state.companions[companion.id] = {
      name: companion.name,
      symbol,
      tokenId,
      tokenAddress,
      poolId,
      owner: ownerWallet.address,
      agentWallet: agentWallet.address,
      agentURI: identity.agentURI,
      image: identity.image,
      txHash: receipt.hash,
      chainId: network.chainId.toString(),
    };
    saveState(state);
    console.log(`[minted] ${companion.name}: NFT ${tokenId}, $${symbol} ${tokenAddress}, pool ${poolId}`);
  }

  for (const assignment of assignments) {
    const index = DEFAULT_COMPANIONS.findIndex((item) => item.id === assignment.companionId);
    const companion = DEFAULT_COMPANIONS[index];
    const minted = state.companions[assignment.companionId];
    if (!companion || !minted) throw new Error(`Unknown or unminted companion assignment: ${assignment.companionId}`);
    if (!ethers.isHexString(assignment.skillId, 32)) throw new Error(`Invalid skillId for ${assignment.companionId}`);
    if (!CATEGORY_ORDER.includes(assignment.category)) throw new Error(`Invalid category for ${assignment.companionId}`);
    const assignmentKey = `${assignment.companionId}:${assignment.skillId}`;
    state.assignments ||= {};
    if (state.assignments[assignmentKey]) continue;

    const tokenId = BigInt(minted.tokenId);
    if (await ownership.isCompanionRegistered(tokenId, assignment.skillId)) {
      state.assignments[assignmentKey] = { registered: true, recoveredOnChain: true };
      saveState(state);
      continue;
    }
    const profileScore = companion.spendingHabits[assignment.category];
    if (profileScore < 5) {
      throw new Error(
        `${companion.name} scores ${profileScore} in ${assignment.category}; skill ownership requires at least 5`,
      );
    }
    const ownerWallet = deriveWallet(mnemonic, Math.floor(index / 4), 0);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "uint256", "address", "address", "uint8", "uint256", "uint256", "address"],
      [
        assignment.skillId,
        tokenId,
        minted.agentWallet,
        ownerWallet.address,
        profileScore,
        deadline,
        network.chainId,
        ownershipAddress,
      ],
    );
    const attestation = await attestationSigner.signMessage(ethers.getBytes(messageHash));
    const tx = await ownership.connect(ownerWallet).registerCompanion(
      assignment.skillId,
      tokenId,
      minted.agentWallet,
      profileScore,
      deadline,
      attestation,
    );
    const receipt = await tx.wait();
    state.assignments[assignmentKey] = { registered: true, txHash: receipt.hash };
    saveState(state);
    console.log(`[owner] ${companion.name} registered for ${assignment.skillId}`);
  }

  const tokenConfig = Object.fromEntries(
    Object.entries(state.companions).map(([id, minted]) => [
      id,
      {
        address: minted.tokenAddress,
        symbol: minted.symbol,
        tokenId: minted.tokenId,
        name: getCompanionCareer(id)?.firstName || minted.name,
      },
    ]),
  );
  fs.mkdirSync(path.dirname(ENV_OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    ENV_OUTPUT_PATH,
    `VITE_DEFAULT_COMPANION_TOKENS_JSON='${JSON.stringify(tokenConfig)}'\n`,
    { mode: 0o600 },
  );
  console.log(`Token app config written to ${ENV_OUTPUT_PATH}`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
