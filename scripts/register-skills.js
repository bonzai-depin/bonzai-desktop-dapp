/**
 * Register flagship skills on BonzaiSkillRegistry (Base)
 *
 * This script registers all paid flagship skills on-chain so users can purchase them.
 * Skills are registered by the treasury wallet (deployer).
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/register-skills.js --network base
 *
 * After running, update web3.config.js with the printed skillIdMap.
 */

const { ethers } = require("hardhat");

// Skill definitions — must match flagship.js
const SKILLS_TO_REGISTER = [
  {
    localId: "polymarket-top-performers-v1.0.0",
    name: "Polymarket Top Performers",
    version: "1.0.0",
    category: "finance",
    ipfsHash: "bafkreigxyz_polymarket_placeholder", // Replace with real IPFS CID
    purchasePrice: 9_990_000n, // 9.99 USDC (6 decimals)
    runningFee: 0n,
  },
  {
    localId: "prediction-market-maker-v1.0.0",
    name: "Prediction Market Maker",
    version: "1.0.0",
    category: "finance",
    ipfsHash: "bafkreigxyz_dsla_placeholder",
    purchasePrice: 9_990_000n,
    runningFee: 0n,
  },
  {
    localId: "meditation-forge-v1.0.0",
    name: "Meditation Forge",
    version: "1.0.0",
    category: "healthcare",
    ipfsHash: "bafkreigxyz_meditation_placeholder",
    purchasePrice: 9_990_000n,
    runningFee: 0n,
  },
  {
    localId: "tcg-analysis-v1.0.0",
    name: "Trading Card Game Analysis",
    version: "1.0.0",
    category: "entertainment",
    ipfsHash: "bafkreigxyz_tcg_placeholder",
    purchasePrice: 9_990_000n,
    runningFee: 0n,
  },
  {
    localId: "live-streaming-v1.0.0",
    name: "Live Streaming Playground",
    version: "1.0.0",
    category: "entertainment",
    ipfsHash: "bafkreigxyz_livestreamer_placeholder",
    purchasePrice: 19_990_000n, // 19.99 USDC
    runningFee: 0n,
  },
];

const REGISTRY_ABI = [
  "function registerSkill(string name, string version, string category, string ipfsHash, uint256 purchasePrice, uint256 runningFee) external returns (bytes32)",
  "function getSkill(bytes32 skillId) view returns (tuple(bytes32 id, address author, string name, string version, string category, string ipfsHash, uint256 purchasePrice, uint256 runningFee, bool isActive, bool isVerified, bool adminDeactivated, uint256 totalPurchases, uint256 totalExecutions, uint256 totalRevenue, uint256 createdAt, uint256 updatedAt))",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Registering skills with:", signer.address);

  const registryAddress = "0xeeB6B8A73B13141013416D74A327180905AFdF3F";
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

  const skillIdMap = {};

  for (const skill of SKILLS_TO_REGISTER) {
    console.log(`\nRegistering: ${skill.name} (${skill.localId})`);
    console.log(`  Price: ${Number(skill.purchasePrice) / 1_000_000} USDC`);

    try {
      const tx = await registry.registerSkill(
        skill.name,
        skill.version,
        skill.category,
        skill.ipfsHash,
        skill.purchasePrice,
        skill.runningFee
      );
      const receipt = await tx.wait();

      // Extract skillId from event logs
      const event = receipt.logs.find(
        (log) => log.topics.length > 0
      );
      // The skillId is the first indexed topic after the event signature
      const skillIdBytes = event?.topics?.[1] || "unknown";

      // Also compute it deterministically
      const computedId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["string", "string", "address"],
          [skill.name, skill.version, signer.address]
        )
      );

      skillIdMap[skill.localId] = computedId;
      console.log(`  ✓ Registered: ${computedId}`);
      console.log(`  TX: ${receipt.hash}`);
    } catch (err) {
      if (err.message?.includes("SkillAlreadyExists")) {
        // Compute the ID anyway
        const computedId = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "address"],
            [skill.name, skill.version, signer.address]
          )
        );
        skillIdMap[skill.localId] = computedId;
        console.log(`  ⚠ Already registered: ${computedId}`);
      } else {
        console.error(`  ✗ Failed:`, err.message);
      }
    }
  }

  // Print the mapping for web3.config.js
  console.log("\n\n═══ Add to web3.config.js (skillRegistry section) ═══\n");
  console.log("skillIdMap: {");
  for (const [localId, onChainId] of Object.entries(skillIdMap)) {
    console.log(`  '${localId}': '${onChainId}',`);
  }
  console.log("},");
  console.log(`\n// Author address: ${signer.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
