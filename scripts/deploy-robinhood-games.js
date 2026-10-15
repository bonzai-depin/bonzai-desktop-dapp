import hre from "hardhat";

async function main() {
  const { ethers, network } = hre;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (![4663, 46630].includes(chainId)) {
    throw new Error(`Refusing game economy deployment on chain ${chainId}`);
  }
  if (chainId === 4663 && process.env.CONFIRM_ROBINHOOD_MAINNET !== "DEPLOY") {
    throw new Error(
      "Mainnet deployment requires CONFIRM_ROBINHOOD_MAINNET=DEPLOY after testnet verification",
    );
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  if (balance === 0n) throw new Error("Deployer has no ETH for gas");

  console.log(`Deploying BonzAI game economy to ${network.name} (${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const collectiblesFactory = process.env.BONZAI_COLLECTIBLES_FACTORY_ADDRESS;
  if (!ethers.isAddress(collectiblesFactory)) {
    throw new Error("BONZAI_COLLECTIBLES_FACTORY_ADDRESS is required");
  }
  if (await ethers.provider.getCode(collectiblesFactory) === '0x') throw new Error('Collectibles factory has no bytecode on the selected chain');
  const Registry = await ethers.getContractFactory("BonzaiGameRegistry");
  const registry = await Registry.deploy(collectiblesFactory);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();

  const Factory = await ethers.getContractFactory("GameTokenFactory");
  const factory = await Factory.deploy(collectiblesFactory, registryAddress);
  await factory.waitForDeployment();
  const address = await factory.getAddress();
  const deployment = await factory.deploymentTransaction().wait();

  console.log(`GameTokenFactory: ${address}`);
  console.log(`BonzaiGameRegistry: ${registryAddress}`);
  console.log(`Transaction: ${deployment.hash}`);
  console.log(`VITE_BONZAI_GAME_TOKEN_FACTORY_${chainId === 4663 ? "ROBINHOOD" : "ROBINHOODTESTNET"}_ADDRESS=${address}`);
  console.log(`VITE_BONZAI_GAME_REGISTRY_${chainId === 4663 ? "ROBINHOOD" : "ROBINHOODTESTNET"}_ADDRESS=${registryAddress}`);
  console.log("Liquidity was not created. Configure and verify a Robinhood-native venue separately.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
