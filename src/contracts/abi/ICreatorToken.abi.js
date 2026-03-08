export const ICreatorTokenABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "oldValidator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "newValidator",
        "type": "address"
      }
    ],
    "name": "TransferValidatorUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "getTransferValidator",
    "outputs": [
      {
        "internalType": "address",
        "name": "validator",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];