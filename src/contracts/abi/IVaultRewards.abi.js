export const IVaultRewardsABI = [
  {
    "inputs": [],
    "name": "depositNative",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "currency",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "depositToken",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "currency",
        "type": "address"
      }
    ],
    "name": "registerLiquidityCurrency",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];