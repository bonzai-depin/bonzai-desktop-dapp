import hre from "hardhat";
const { ethers } = hre;
import { economyChainId, economyAddress, ECONOMY_NETWORK_KEYS } from '../src/config/economy.config.js';
import { CONFIG } from '../src/config/web3.config.js';

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number(await ethers.provider.send('eth_chainId', []));
  if (chainId !== economyChainId(process.env)) throw new Error(`Deployment chain ${chainId} differs from the configured economy chain`);
  const chainKey = ECONOMY_NETWORK_KEYS[chainId];
  const bonzaiToken = process.env.BONZAI_TOKEN_ADDRESS
    || economyAddress(process.env, 'TOKEN', chainId)
    || CONFIG.tokens.BONZAI[chainKey];
  if (!ethers.isAddress(bonzaiToken) || bonzaiToken === ethers.ZeroAddress) throw new Error('Canonical BONZAI token address required for this chain');
  if (await ethers.provider.getCode(bonzaiToken) === '0x') throw new Error('BONZAI token has no deployed bytecode on selected chain');
  if (await new ethers.Contract(bonzaiToken, ['function decimals() view returns(uint8)'], ethers.provider).decimals() !== 18n) throw new Error('BONZAI must have 18 decimals');
  const companionFactory = process.env.BONZAI_COMPANION_TOKEN_FACTORY_ADDRESS || economyAddress(process.env, 'COMPANION_TOKEN_FACTORY', chainId);
  const usdc = process.env.BONZAI_USDC_ADDRESS || economyAddress(process.env, 'USDC', chainId);
  for (const [name, address] of Object.entries({ companionFactory, usdc })) {
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress || await ethers.provider.getCode(address) === '0x') throw new Error(`Verified ${name} contract required on the selected chain`);
  }
  if (await new ethers.Contract(usdc, ['function decimals() view returns(uint8)'], ethers.provider).decimals() !== 6n) throw new Error('USDC must have 6 decimals');
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

  const BasketRewards = await ethers.getContractFactory("BonzaiBasketRewards");
  const basketRewards = await BasketRewards.deploy(await stakingVault.getAddress(), companionFactory, 7 * 86400);
  await basketRewards.waitForDeployment();
  await (await basketRewards.setRewardCurrency(usdc, true)).wait();

  const RevenueRouter = await ethers.getContractFactory("BonzaiRevenueRouter");
  const revenueRouter = await RevenueRouter.deploy(await stakingVault.getAddress(), treasury);
  await revenueRouter.waitForDeployment();
  await (await revenueRouter.setBasketRewards(await basketRewards.getAddress())).wait();

  console.log("");
  console.log("BonzAI staking economy deployed:");
  console.log(`VITE_BONZAI_STAKING_VAULT_${chainKey.toUpperCase()}_ADDRESS=${await stakingVault.getAddress()}`);
  console.log(`VITE_BONZAI_BASKET_REWARDS_${chainKey.toUpperCase()}_ADDRESS=${await basketRewards.getAddress()}`);
  console.log(`VITE_BONZAI_USDC_${chainKey.toUpperCase()}_ADDRESS=${usdc}`);
  console.log(`VITE_BONZAI_REVENUE_ROUTER_${chainKey.toUpperCase()}_ADDRESS=${await revenueRouter.getAddress()}`);
  console.log("");
  console.log("Next: set these env vars, redeploy/rebuild the app, then use the Ownership Dashboard.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
