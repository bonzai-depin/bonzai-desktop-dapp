/**
 * BonzaiLSP8Collection Deployment Script
 *
 * Usage:
 *   npx hardhat run scripts/deploy-lsp8.js --network luksoTestnet
 *   npx hardhat run scripts/deploy-lsp8.js --network luksoMainnet
 *
 * Environment variables:
 *   DEPLOYER_PRIVATE_KEY - Private key of the deploying account
 *   TREASURY_ADDRESS - Address to receive mint fees (optional, defaults to deployer)
 *   MINT_FEE - Mint fee in LYX (optional, defaults to 0.01)
 */

import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  BonzaiLSP8Collection Deployment");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "LYX");
  console.log("");

  // Configuration
  const name = "BonzAI Creations";
  const symbol = "BONZAI";
  const owner = deployer.address; // Can be changed to multisig
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const mintFeeEth = process.env.MINT_FEE || "0.01";
  const mintFee = ethers.parseEther(mintFeeEth);

  console.log("Configuration:");
  console.log("  Name:", name);
  console.log("  Symbol:", symbol);
  console.log("  Owner:", owner);
  console.log("  Treasury:", treasury);
  console.log("  Mint Fee:", mintFeeEth, "LYX");
  console.log("");

  // Deploy
  console.log("Deploying contract...");

  const BonzaiLSP8 = await ethers.getContractFactory("BonzaiLSP8Collection");
  const contract = await BonzaiLSP8.deploy(
    name,
    symbol,
    owner,
    treasury,
    mintFee
  );

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Deployment Successful!");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Contract Address:", contractAddress);
  console.log("");

  // Explorer link
  let explorerUrl;
  if (network.chainId === 4201n) {
    explorerUrl = `https://explorer.execution.testnet.lukso.network/address/${contractAddress}`;
  } else if (network.chainId === 42n) {
    explorerUrl = `https://explorer.lukso.network/address/${contractAddress}`;
  }

  if (explorerUrl) {
    console.log("Explorer:", explorerUrl);
    console.log("");
  }

  // Environment variable for frontend
  const envVar = network.chainId === 42n
    ? "VITE_LUKSO_LSP8_MAINNET"
    : "VITE_LUKSO_LSP8_TESTNET";

  console.log("Add to your .env file:");
  console.log(`  ${envVar}=${contractAddress}`);
  console.log("");

  // Verify contract
  console.log("To verify the contract, run:");
  console.log(`  npx hardhat verify --network ${network.name === "unknown" ? "luksoTestnet" : network.name} ${contractAddress} "${name}" "${symbol}" "${owner}" "${treasury}" "${mintFee}"`);
  console.log("");

  return contractAddress;
}

main()
  .then((address) => {
    console.log("Done! Contract deployed at:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
