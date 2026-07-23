/**
 * Register flagship skills on the configured BonzaiSkillRegistry deployment.
 *
 * This script registers every flagship workflow as companion-token gated.
 * Skills remain free to execute once access is established.
 *
 * Usage:
 *   BONZAI_SKILL_REGISTRY_ADDRESS=0x... \
 *   POLYMARKET_SKILL_CID=bafy... \
 *   npx hardhat run scripts/register-skills.js --network <network>
 *
 * After running, store the printed JSON in VITE_BONZAI_SKILL_ID_MAP_JSON.
 */

const { ethers } = require("hardhat");

// Skill definitions — must match flagship.js
const SKILLS_TO_REGISTER = [
  ["robinhood-portfolio-council-v1.0.0", "Robinhood Portfolio Council", "finance", "ROBINHOOD_PORTFOLIO_COUNCIL_SKILL_CID"],
  ["polymarket-top-performers-v1.0.0", "Polymarket Top Performers", "finance", "POLYMARKET_SKILL_CID"],
  ["prediction-market-maker-v1.0.0", "Prediction Market Maker", "finance", "PREDICTION_MARKET_MAKER_SKILL_CID"],
  ["roleplay-companion-v1.0.0", "Roleplay Companion", "social", "ROLEPLAY_COMPANION_SKILL_CID"],
  ["meditation-forge-v1.0.0", "Meditation Forge", "healthcare", "MEDITATION_FORGE_SKILL_CID"],
  ["video-captioning-v1.0.0", "Video Captioning", "education", "VIDEO_CAPTIONING_SKILL_CID"],
  ["tcg-analysis-v1.0.0", "Trading Card Game Analysis", "entertainment", "TCG_ANALYSIS_SKILL_CID"],
  ["live-streaming-v1.0.0", "Live Streaming Playground", "entertainment", "LIVE_STREAMING_SKILL_CID"],
  ["mass-chat-v1.0.0", "Mass Chat", "education", "MASS_CHAT_SKILL_CID"],
  ["chart-forecaster-v1.0.0", "Chart Forecaster", "finance", "CHART_FORECASTER_SKILL_CID"],
].map(([localId, name, category, cidEnv]) => ({
  localId,
  name,
  version: "1.0.0",
  category,
  ipfsHash: process.env[cidEnv],
  tokenGated: true,
}));

const REGISTRY_ABI = [
  "function registerSkill(string name, string version, string category, string ipfsHash, bool tokenGated) external returns (bytes32)",
  "function getSkill(bytes32 skillId) view returns (tuple(bytes32 id, address author, string name, string version, string category, string ipfsHash, bool tokenGated, bool isActive, bool isVerified, bool adminDeactivated, uint256 totalExecutions, uint256 createdAt, uint256 updatedAt))",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Registering skills with:", signer.address);

  const registryAddress = process.env.BONZAI_SKILL_REGISTRY_ADDRESS;
  if (!ethers.isAddress(registryAddress) || registryAddress === ethers.ZeroAddress) {
    throw new Error("BONZAI_SKILL_REGISTRY_ADDRESS must be a non-zero address");
  }
  const missingCids = SKILLS_TO_REGISTER.filter((skill) => !skill.ipfsHash).map((skill) => skill.localId);
  if (missingCids.length > 0) {
    throw new Error(`Missing production skill CIDs: ${missingCids.join(", ")}`);
  }
  const code = await ethers.provider.getCode(registryAddress);
  if (code === "0x") throw new Error(`No contract deployed at ${registryAddress}`);

  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

  const skillIdMap = {};

  for (const skill of SKILLS_TO_REGISTER) {
    console.log(`\nRegistering: ${skill.name} (${skill.localId})`);
    console.log("  Access: companion owner token");

    try {
      const tx = await registry.registerSkill(
        skill.name,
        skill.version,
        skill.category,
        skill.ipfsHash,
        skill.tokenGated
      );
      const receipt = await tx.wait();

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
        throw new Error(`Failed to register ${skill.localId}: ${err.message}`, { cause: err });
      }
    }
  }

  console.log("\nVITE_BONZAI_SKILL_ID_MAP_JSON=");
  console.log(JSON.stringify(skillIdMap));
  console.log(`\n// Author address: ${signer.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
