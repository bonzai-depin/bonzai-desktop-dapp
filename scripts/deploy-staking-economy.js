const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const bonzaiToken = process.env.BONZAI_TOKEN_ADDRESS
    || process.env.VITE_BONZAI_TOKEN_ETHEREUM_ADDRESS
    || "0xDdA9Ff241C7160be8295EF9Eca2e782361467666";
  const treasury = process.env.BONZAI_TREASURY_ADDRESS
    || "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89";
  const thresholds = [1000, 5000, 10000, 25000, 33000, 50000]
    .map(value => ethers.parseEther(String(value)));

  console.log("Deploying BonzAI staking economy with:", {
    deployer: deployer.address,
    bonzaiToken,
    treasury,
  });

  const StakingVault = await ethers.getContractFactory("BonzaiStakingVault");
  const stakingVault = await StakingVault.deploy(bonzaiToken, thresholds);
  await stakingVault.waitForDeployment();

  const RevenueRouter = await ethers.getContractFactory("BonzaiRevenueRouter");
  const revenueRouter = await RevenueRouter.deploy(await stakingVault.getAddress(), treasury);
  await revenueRouter.waitForDeployment();

  console.log("");
  console.log("BonzAI staking economy deployed:");
  console.log(`VITE_BONZAI_STAKING_VAULT_ETHEREUM_ADDRESS=${await stakingVault.getAddress()}`);
  console.log(`VITE_BONZAI_REVENUE_ROUTER_ETHEREUM_ADDRESS=${await revenueRouter.getAddress()}`);
  console.log("");
  console.log("Next: set these env vars, redeploy/rebuild the app, then use the Ownership Dashboard.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
