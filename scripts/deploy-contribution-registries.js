const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying BonzAI contribution registries with:", deployer.address);

  const ContributionRegistry = await hre.ethers.getContractFactory("BonzaiContributionRegistry");
  const contributionRegistry = await ContributionRegistry.deploy();
  await contributionRegistry.waitForDeployment();

  const DatasetRegistry = await hre.ethers.getContractFactory("BonzaiDatasetRegistry");
  const datasetRegistry = await DatasetRegistry.deploy();
  await datasetRegistry.waitForDeployment();

  const EvaluationRegistry = await hre.ethers.getContractFactory("BonzaiEvaluationRegistry");
  const evaluationRegistry = await EvaluationRegistry.deploy();
  await evaluationRegistry.waitForDeployment();

  const ModelRegistry = await hre.ethers.getContractFactory("BonzaiModelRegistry");
  const modelRegistry = await ModelRegistry.deploy();
  await modelRegistry.waitForDeployment();

  const addresses = {
    contributionRegistry: await contributionRegistry.getAddress(),
    datasetRegistry: await datasetRegistry.getAddress(),
    evaluationRegistry: await evaluationRegistry.getAddress(),
    modelRegistry: await modelRegistry.getAddress(),
  };

  console.log("Contribution economy registries deployed:");
  console.log(JSON.stringify(addresses, null, 2));
  console.log("\nEnvironment variables:");
  console.log(`VITE_BONZAI_CONTRIBUTION_REGISTRY_ETHEREUM_ADDRESS=${addresses.contributionRegistry}`);
  console.log(`VITE_BONZAI_DATASET_REGISTRY_ETHEREUM_ADDRESS=${addresses.datasetRegistry}`);
  console.log(`VITE_BONZAI_EVALUATION_REGISTRY_ETHEREUM_ADDRESS=${addresses.evaluationRegistry}`);
  console.log(`VITE_BONZAI_MODEL_REGISTRY_ETHEREUM_ADDRESS=${addresses.modelRegistry}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
