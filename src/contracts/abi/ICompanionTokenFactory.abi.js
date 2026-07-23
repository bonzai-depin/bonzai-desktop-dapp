export const ICompanionTokenFactoryABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "nftTokenId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "symbol",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "imageURI",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "agentWallet",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "companionOwner",
        "type": "address"
      }
    ],
    "name": "launchToken",
    "outputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "poolId",
        "type": "bytes32"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
];