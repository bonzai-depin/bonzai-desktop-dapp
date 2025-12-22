// scripts/deploy-infinity-registry.js
// Hardhat deploy script for BonzAIInfinityRegistry

const hre = require("hardhat");

async function main() {
  const treasury = "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89";
  const priceWei = hre.ethers.parseEther("1.0"); // default 1 ETH; admin can change later via setPriceWei()

  const Factory = await hre.ethers.getContractFactory("BonzAIInfinityRegistry");
  const contract = await Factory.deploy(treasury, priceWei);

  await contract.waitForDeployment();

  console.log(
    "BonzAIInfinityRegistry deployed to:",
    await contract.getAddress()
  );
  console.log("Treasury:", treasury);
  console.log("Price (wei):", priceWei.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
