require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // LUKSO Testnet
    luksoTestnet: {
      url: "https://rpc.testnet.lukso.gateway.fm",
      chainId: 4201,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
    // LUKSO Mainnet
    luksoMainnet: {
      url: "https://rpc.lukso.gateway.fm",
      chainId: 42,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
  etherscan: {
    apiKey: {
      luksoTestnet: "no-api-key-needed",
      luksoMainnet: "no-api-key-needed",
    },
    customChains: [
      {
        network: "luksoTestnet",
        chainId: 4201,
        urls: {
          apiURL: "https://api.explorer.execution.testnet.lukso.network/api",
          browserURL: "https://explorer.execution.testnet.lukso.network",
        },
      },
      {
        network: "luksoMainnet",
        chainId: 42,
        urls: {
          apiURL: "https://api.explorer.lukso.network/api",
          browserURL: "https://explorer.lukso.network",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
