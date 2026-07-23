const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

const { ethers, network } = hre;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the single-chain v4 deployment`);
  return value;
}

async function call(address, abi, method, args = []) {
  const [signer] = await ethers.getSigners();
  const contract = new ethers.Contract(address, abi, signer);
  const tx = await contract[method](...args);
  return tx.wait();
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chain = await ethers.provider.getNetwork();
  const chainId = Number(chain.chainId);
  if (![1, 42161, 8453, 4663, 46630].includes(chainId)) {
    throw new Error(`Unsupported economy chain ${chainId}; use Robinhood Chain, Ethereum, Arbitrum, or Base`);
  }
  if ((chainId === 4663 || chainId === 46630) && !process.env.BONZAI_TOKEN_ADDRESS) {
    throw new Error("BONZAI_TOKEN_ADDRESS must be the verified canonical bridged token on Robinhood Chain");
  }

  const bonzaiToken = required("BONZAI_TOKEN_ADDRESS");
  const treasury = required("BONZAI_TREASURY_ADDRESS");
  const companions = required("BONZAI_COMPANIONS_ADDRESS");
  const companionFactory = required("BONZAI_COMPANION_TOKEN_FACTORY_ADDRESS");
  const fineTuneFactory = required("BONZAI_FINE_TUNE_TOKEN_FACTORY_ADDRESS");
  const feeHook = required("BONZAI_UNISWAP_HOOK_ADDRESS");
  const collectiblesFactory = required("BONZAI_COLLECTIBLES_FACTORY_ADDRESS");
  const mintPool = required("BONZAI_MINT_POOL_ADDRESS");
  const serviceTime = required("BONZAI_SERVICE_TIME_ADDRESS");
  const providerRegistry = required("BONZAI_PROVIDER_REGISTRY_ADDRESS");
  const thresholds = [1000, 5000, 10000, 25000, 33000, 50000].map((value) => ethers.parseEther(String(value)));

  console.log(`Deploying BonzAI v4 on ${network.name} (${chainId}) from ${deployer.address}`);
  const deploy = async (name, args = []) => {
    const Factory = await ethers.getContractFactory(name);
    const contract = await Factory.deploy(...args);
    await contract.waitForDeployment();
    console.log(`${name}: ${await contract.getAddress()}`);
    return contract;
  };

  const stakingVault = await deploy("BonzaiStakingVault", [bonzaiToken, thresholds]);
  const revenueRouter = await deploy("BonzaiRevenueRouter", [await stakingVault.getAddress(), treasury]);
  const scoreOracle = await deploy("BonzaiContributionScoreOracle", [await stakingVault.getAddress()]);
  const contributionRegistry = await deploy("BonzaiContributionRegistry");
  const datasetRegistry = await deploy("BonzaiDatasetRegistry");
  const evaluationRegistry = await deploy("BonzaiEvaluationRegistry");
  const modelRegistry = await deploy("BonzaiModelRegistry");

  await (await stakingVault.setScoreAttestor(await scoreOracle.getAddress(), true)).wait();
  await call(feeHook, ["function setRevenueRouter(address)"], "setRevenueRouter", [await revenueRouter.getAddress()]);
  await call(collectiblesFactory, ["function setStakingVault(address)"], "setStakingVault", [await stakingVault.getAddress()]);
  await call(mintPool, ["function setStakingVault(address)"], "setStakingVault", [await stakingVault.getAddress()]);
  await call(mintPool, ["function setServiceTimeContract(address)"], "setServiceTimeContract", [serviceTime]);
  await call(serviceTime, ["function setProviderRegistry(address)"], "setProviderRegistry", [providerRegistry]);
  await call(providerRegistry, ["function setPaymentContract(address)"], "setPaymentContract", [serviceTime]);
  await call(companions, ["function setCompanionTokenFactory(address)"], "setCompanionTokenFactory", [companionFactory]);
  await call(companionFactory, ["function setCompanionContract(address)"], "setCompanionContract", [companions]);
  const legacyEnabled = await new ethers.Contract(fineTuneFactory, ["function legacyLaunchEnabled() view returns(bool)"], deployer).legacyLaunchEnabled();
  if (legacyEnabled) await call(fineTuneFactory, ["function disableLegacyLaunch()"], "disableLegacyLaunch");

  const addresses = {
    chainId,
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    bonzaiToken,
    treasury,
    companions,
    companionTokenFactory: companionFactory,
    fineTuneTokenFactory: fineTuneFactory,
    uniswapHook: feeHook,
    stakingVault: await stakingVault.getAddress(),
    revenueRouter: await revenueRouter.getAddress(),
    contributionScoreOracle: await scoreOracle.getAddress(),
    contributionRegistry: await contributionRegistry.getAddress(),
    datasetRegistry: await datasetRegistry.getAddress(),
    evaluationRegistry: await evaluationRegistry.getAddress(),
    modelRegistry: await modelRegistry.getAddress(),
  };

  const outDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `v4-${chainId}.json`), JSON.stringify(addresses, null, 2));
  const env = Object.entries({
    VITE_BONZAI_ECONOMY_CHAIN_ID: chainId,
    VITE_BONZAI_STAKING_VAULT_ADDRESS: addresses.stakingVault,
    VITE_BONZAI_REVENUE_ROUTER_ADDRESS: addresses.revenueRouter,
    VITE_BONZAI_CONTRIBUTION_SCORE_ORACLE_ADDRESS: addresses.contributionScoreOracle,
    VITE_BONZAI_CONTRIBUTION_REGISTRY_ADDRESS: addresses.contributionRegistry,
    VITE_BONZAI_DATASET_REGISTRY_ADDRESS: addresses.datasetRegistry,
    VITE_BONZAI_EVALUATION_REGISTRY_ADDRESS: addresses.evaluationRegistry,
    VITE_BONZAI_MODEL_REGISTRY_ADDRESS: addresses.modelRegistry,
  }).map(([key, value]) => `${key}=${value}`).join("\n");
  fs.writeFileSync(path.join(outDir, `v4-${chainId}.env`), `${env}\n`);
  console.log(`Deployment manifest written to deployments/v4-${chainId}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
