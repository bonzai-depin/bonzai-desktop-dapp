export const IBonzaiMintPoolSplitterABI = [
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "poolIndex",
        "type": "uint8"
      }
    ],
    "name": "depositForPool",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllTotalDeposited",
    "outputs": [
      {
        "internalType": "uint256[6]",
        "name": "",
        "type": "uint256[6]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];