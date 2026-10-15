// Legacy migration disabled for the v4 contract interfaces.
throw new Error('Legacy redeployment is disabled: global content identities and optional staking vaults are incompatible with v4. Use the canonical v4 deployment workflow for new contracts; existing funds require a separately reviewed migration.');

/**
 * Redeploy BonzaiContent as "BonzAI Collectibles" on Base.
 *
 * Deploys the new contract, wires it with existing MintPool, RoyaltySplitter,
 * and updates MintPool + FineTuneTokenFactory to point to the new address.
 *
 * Usage:
 *   npx hardhat run scripts/redeploy-content.js --network base
 *
 * Requires:
 *   DEPLOYER_PRIVATE_KEY in .env (must be owner of MintPool & FineTuneTokenFactory)
 *   ETHERSCAN_API_KEY in .env (for verification)
 */

const hre = require("hardhat");

// Existing contract addresses on Base
const TREASURY = "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89";
const MINT_POOL = "0xB9423Ef7cedAAC87419511Fa1E24DE65C19c7CD2";
const ROYALTY_SPLITTER = "0x5B63AD58034D7396e7024F4Bebf8E5D86D668399";
const FINE_TUNE_FACTORY = "0x54Ee513a7a6809c109408EA20dA9E7e424A6e36c";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  // ── 1. Deploy new BonzaiContent ───────────────────────────────────────
  console.log("\n[1/5] Deploying BonzaiContent (BonzAI Collectibles)...");
  const BonzaiContent = await hre.ethers.getContractFactory("BonzaiContent");
  const content = await BonzaiContent.deploy(TREASURY);
  await content.waitForDeployment();
  const contentAddress = await content.getAddress();
  console.log("  BonzaiContent deployed to:", contentAddress);

  // ── 2. Wire: Content → MintPool + RoyaltySplitter ─────────────────────
  console.log("\n[2/5] Wiring Content → MintPool & RoyaltySplitter...");
  let tx = await content.setMintPool(MINT_POOL);
  await tx.wait();
  console.log("  setMintPool done");

  tx = await content.setRoyaltySplitter(ROYALTY_SPLITTER);
  await tx.wait();
  console.log("  setRoyaltySplitter done");

  // ── 3. Wire: MintPool → new Content ───────────────────────────────────
  console.log("\n[3/5] Wiring MintPool → new Content...");
  const mintPool = await hre.ethers.getContractAt(
    ["function setContentContract(address) external"],
    MINT_POOL,
    deployer
  );
  tx = await mintPool.setContentContract(contentAddress);
  await tx.wait();
  console.log("  MintPool.setContentContract done");

  // ── 4. Wire: FineTuneTokenFactory → new Content ───────────────────────
  console.log("\n[4/5] Wiring FineTuneTokenFactory → new Content...");
  const ftFactory = await hre.ethers.getContractAt(
    ["function setContentContract(address) external"],
    FINE_TUNE_FACTORY,
    deployer
  );
  tx = await ftFactory.setContentContract(contentAddress);
  await tx.wait();
  console.log("  FineTuneTokenFactory.setContentContract done");

  // ── 5. Verify on BaseScan ─────────────────────────────────────────────
  console.log("\n[5/5] Verifying on BaseScan...");
  try {
    await hre.run("verify:verify", {
      address: contentAddress,
      constructorArguments: [TREASURY],
    });
    console.log("  Verification complete!");
  } catch (e) {
    if (e.message.includes("Already Verified")) {
      console.log("  Already verified");
    } else {
      console.error("  Verification failed:", e.message);
      console.log("  Manual verify: npx hardhat verify --network base", contentAddress, TREASURY);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("BonzaiContent (BonzAI Collectibles):", contentAddress);
  console.log("");
  console.log("Update web3.config.js:");
  console.log(`  contentNFT.economy.contractAddress: '${contentAddress}'`);
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
