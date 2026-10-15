import hre from "hardhat";
import fs from "node:fs";
import path from "node:path";

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

  const expectedChain = Number(process.env.VITE_BONZAI_ECONOMY_CHAIN_ID || 4663);
  if (chainId !== expectedChain) throw new Error(`Deployment chain ${chainId} differs from selected economy ${expectedChain}`);
  const rpcChain = Number(await ethers.provider.send('eth_chainId', []));
  if (rpcChain !== chainId) throw new Error(`RPC chain ${rpcChain} differs from deployment chain ${chainId}`);

  const bonzaiToken = required("BONZAI_TOKEN_ADDRESS");
  const usdc = required("BONZAI_USDC_ADDRESS");
  const treasury = required("BONZAI_TREASURY_ADDRESS");
  const companions = required("BONZAI_COMPANIONS_ADDRESS");
  const companionFactory = required("BONZAI_COMPANION_TOKEN_FACTORY_ADDRESS");
  const smartAgents = required("BONZAI_SMART_AGENTS_ADDRESS");
  const workerFactory = required("BONZAI_AGENT_TOKEN_FACTORY_ADDRESS");
  const fineTuneFactory = required("BONZAI_FINE_TUNE_TOKEN_FACTORY_ADDRESS");
  const feeHook = required("BONZAI_UNISWAP_HOOK_ADDRESS");
  const collectiblesFactory = required("BONZAI_COLLECTIBLES_FACTORY_ADDRESS");
  const mintPool = required("BONZAI_MINT_POOL_ADDRESS");
  const serviceTime = required("BONZAI_SERVICE_TIME_ADDRESS");
  const providerRegistry = required("BONZAI_PROVIDER_REGISTRY_ADDRESS");
  for (const [name, address] of Object.entries({ bonzaiToken, usdc, companions, companionFactory, smartAgents, workerFactory, fineTuneFactory, feeHook, collectiblesFactory, mintPool, serviceTime, providerRegistry })) {
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) throw new Error(`Invalid ${name} address`);
    if (await ethers.provider.getCode(address) === '0x') throw new Error(`${name} has no deployed bytecode on chain ${chainId}`);
  }
  if (!ethers.isAddress(treasury) || treasury === ethers.ZeroAddress) throw new Error('Invalid treasury');
  if ((BigInt(feeHook) & 0x3fffn) !== 0x44n) throw new Error('Hook address must encode v4 afterSwap and afterSwapReturnDelta (0x0044)');
  const decimals = await new ethers.Contract(bonzaiToken, ['function decimals() view returns(uint8)'], ethers.provider).decimals();
  if (decimals !== 18n) throw new Error('BONZAI token must have 18 decimals');
  if (await new ethers.Contract(usdc, ['function decimals() view returns(uint8)'], ethers.provider).decimals() !== 6n) throw new Error('Verified USDC token must have 6 decimals');
  const collections = new ethers.Contract(collectiblesFactory, ['function isCollection(address) view returns(bool)'], ethers.provider);
  if (await collections.isCollection(ethers.ZeroAddress)) throw new Error('Invalid collection factory membership registry');
  const modelFactory = new ethers.Contract(fineTuneFactory, ['function getToken(address,uint256) view returns(address)'], ethers.provider);
  await modelFactory.getToken(ethers.ZeroAddress, 0n); // Require the collection-aware factory before any deployment writes.
  const existingPool = new ethers.Contract(mintPool, [
    'function stakingVaultFrozen() view returns(bool)',
    'function bonzaiToken() view returns(address)',
    'function basketRewards() view returns(address)',
  ], ethers.provider);
  if (await existingPool.stakingVaultFrozen()) {
    throw new Error('MintPool has registered locked stake and its vault is frozen. This script deploys a new vault; reuse the existing canonical deployment or prepare an explicit pool migration before sending transactions.');
  }
  if (ethers.getAddress(await existingPool.bonzaiToken()) !== ethers.getAddress(bonzaiToken)) {
    throw new Error('MintPool uses a different BONZAI token; its new staking vault would be rejected');
  }
  if (await existingPool.basketRewards() !== ethers.ZeroAddress) throw new Error('MintPool already has a basket; use its existing canonical deployment');
  const socialFactory = new ethers.Contract(companionFactory, ['function getToken(uint256) view returns(address)', 'function companionContract() view returns(address)'], ethers.provider);
  await socialFactory.getToken(0n);
  if (ethers.getAddress(await socialFactory.companionContract()) !== ethers.getAddress(companions)) throw new Error('Social token factory uses a different smart-agent registry');
  const workerRegistry = new ethers.Contract(workerFactory, ['function companionContract() view returns(address)'], ethers.provider);
  if (ethers.getAddress(await workerRegistry.companionContract()) !== ethers.getAddress(smartAgents)) throw new Error('Worker token factory uses a different smart-agent collection');
  const workerCollection = new ethers.Contract(smartAgents, ['function launcher() view returns(address)'], ethers.provider);
  if (ethers.getAddress(await workerCollection.launcher()) !== ethers.getAddress(workerFactory)) throw new Error('Smart-agent collection launcher does not match the worker factory');
  // Check every privileged wiring call before paying to deploy new contracts.
  for (const [name, address] of Object.entries({ feeHook, collectiblesFactory, mintPool, serviceTime, providerRegistry, companions, companionFactory, fineTuneFactory })) {
    const owner = await new ethers.Contract(address, ['function owner() view returns(address)'], ethers.provider).owner();
    if (ethers.getAddress(owner) !== ethers.getAddress(deployer.address)) throw new Error(`Deployer does not own ${name}; prepare its authorized governance wiring before deployment`);
  }
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
  const basketRewards = await deploy("BonzaiBasketRewards", [await stakingVault.getAddress(), workerFactory, 7 * 86400]);
  const revenueRouter = await deploy("BonzaiRevenueRouter", [await stakingVault.getAddress(), treasury]);
  const scoreOracle = await deploy("BonzaiContributionScoreOracle", [await stakingVault.getAddress()]);
  const contributionRegistry = await deploy("BonzaiContributionRegistry");
  const datasetRegistry = await deploy("BonzaiDatasetRegistry");
  const evaluationRegistry = await deploy("BonzaiEvaluationRegistry");
  const modelRegistry = await deploy("BonzaiModelRegistry");
  const jobEscrow = await deploy("BonzaiJobEscrow", [treasury, await revenueRouter.getAddress()]);

  await (await basketRewards.setRewardCurrency(usdc, true)).wait();
  await (await revenueRouter.setBasketRewards(await basketRewards.getAddress())).wait();
  await (await jobEscrow.configureSmartAgentEconomy(workerFactory, await basketRewards.getAddress())).wait();
  await (await stakingVault.setScoreAttestor(await scoreOracle.getAddress(), true)).wait();
  await call(feeHook, ["function setRevenueRouter(address)"], "setRevenueRouter", [await revenueRouter.getAddress()]);
  await call(collectiblesFactory, ["function setStakingVault(address)"], "setStakingVault", [await stakingVault.getAddress()]);
  await call(mintPool, ["function setStakingVault(address)"], "setStakingVault", [await stakingVault.getAddress()]);
  await call(mintPool, ["function setBasketRewards(address)"], "setBasketRewards", [await basketRewards.getAddress()]);
  await call(mintPool, ["function setServiceTimeContract(address)"], "setServiceTimeContract", [serviceTime]);
  await call(serviceTime, ["function setProviderRegistry(address)"], "setProviderRegistry", [providerRegistry]);
  await call(providerRegistry, ["function setPaymentContract(address)"], "setPaymentContract", [serviceTime]);
  await call(companions, ["function setCompanionTokenFactory(address)"], "setCompanionTokenFactory", [companionFactory]);
  await call(companionFactory, ["function setCompanionContract(address)"], "setCompanionContract", [companions]);
  await call(fineTuneFactory, ["function setContentContract(address)"], "setContentContract", [collectiblesFactory]);
  const legacyEnabled = await new ethers.Contract(fineTuneFactory, ["function legacyLaunchEnabled() view returns(bool)"], deployer).legacyLaunchEnabled();
  if (legacyEnabled) await call(fineTuneFactory, ["function disableLegacyLaunch()"], "disableLegacyLaunch");

  const addresses = {
    chainId,
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    bonzaiToken,
    usdc,
    treasury,
    companions,
    companionTokenFactory: companionFactory,
    smartAgents,
    agentTokenFactory: workerFactory,
    fineTuneTokenFactory: fineTuneFactory,
    uniswapHook: feeHook,
    collectiblesFactory,
    mintPool,
    serviceTime,
    providerRegistry,
    stakingVault: await stakingVault.getAddress(),
    basketRewards: await basketRewards.getAddress(),
    revenueRouter: await revenueRouter.getAddress(),
    contributionScoreOracle: await scoreOracle.getAddress(),
    contributionRegistry: await contributionRegistry.getAddress(),
    datasetRegistry: await datasetRegistry.getAddress(),
    evaluationRegistry: await evaluationRegistry.getAddress(),
    modelRegistry: await modelRegistry.getAddress(),
    jobEscrow: await jobEscrow.getAddress(),
  };

  const outDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `v4-${chainId}.json`), JSON.stringify(addresses, null, 2));
  const env = Object.entries({
    VITE_BONZAI_ECONOMY_CHAIN_ID: chainId,
    VITE_BONZAI_TOKEN_ADDRESS: addresses.bonzaiToken,
    VITE_BONZAI_USDC_ADDRESS: addresses.usdc,
    VITE_BONZAI_SMART_AGENTS_ADDRESS: addresses.smartAgents,
    VITE_BONZAI_AGENT_TOKEN_FACTORY_ADDRESS: addresses.agentTokenFactory,
    VITE_BONZAI_COMPANIONS_ADDRESS: addresses.companions,
    VITE_BONZAI_COMPANION_TOKEN_FACTORY_ADDRESS: addresses.companionTokenFactory,
    VITE_BONZAI_FINE_TUNE_TOKEN_FACTORY_ADDRESS: addresses.fineTuneTokenFactory,
    VITE_BONZAI_UNISWAP_HOOK_ADDRESS: addresses.uniswapHook,
    VITE_BONZAI_COLLECTIBLES_FACTORY_ADDRESS: addresses.collectiblesFactory,
    VITE_BONZAI_MINT_POOL_ADDRESS: addresses.mintPool,
    VITE_BONZAI_SERVICE_TIME_ADDRESS: addresses.serviceTime,
    VITE_BONZAI_PROVIDER_REGISTRY_ADDRESS: addresses.providerRegistry,
    VITE_BONZAI_STAKING_VAULT_ADDRESS: addresses.stakingVault,
    VITE_BONZAI_BASKET_REWARDS_ADDRESS: addresses.basketRewards,
    VITE_BONZAI_REVENUE_ROUTER_ADDRESS: addresses.revenueRouter,
    VITE_BONZAI_CONTRIBUTION_SCORE_ORACLE_ADDRESS: addresses.contributionScoreOracle,
    VITE_BONZAI_CONTRIBUTION_REGISTRY_ADDRESS: addresses.contributionRegistry,
    VITE_BONZAI_DATASET_REGISTRY_ADDRESS: addresses.datasetRegistry,
    VITE_BONZAI_EVALUATION_REGISTRY_ADDRESS: addresses.evaluationRegistry,
    VITE_BONZAI_MODEL_REGISTRY_ADDRESS: addresses.modelRegistry,
    VITE_BONZAI_JOB_ESCROW_ADDRESS: addresses.jobEscrow,
  }).map(([key, value]) => `${key}=${value}`).join("\n");
  fs.writeFileSync(path.join(outDir, `v4-${chainId}.env`), `${env}\n`);
  console.log(`Deployment manifest written to deployments/v4-${chainId}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
