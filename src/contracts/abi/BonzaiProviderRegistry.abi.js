export const BonzaiProviderRegistryABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_treasury",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "EmptyPeerId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "EnforcedPause",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ExpectedPause",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "feeBps",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxBps",
        "type": "uint256"
      }
    ],
    "name": "FeeTooHigh",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "category",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "max",
        "type": "uint8"
      }
    ],
    "name": "InvalidPipelineCategory",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoPipelines",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotRegistered",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyPaymentContract",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "peerId",
        "type": "string"
      }
    ],
    "name": "PeerIdTaken",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "provider",
        "type": "address"
      }
    ],
    "name": "ProviderNotRegistered",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroAddress",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "EarningsRecorded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Paused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "oldContract",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newContract",
        "type": "address"
      }
    ],
    "name": "PaymentContractUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      }
    ],
    "name": "ProviderActivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      }
    ],
    "name": "ProviderDeactivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "peerId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint8[]",
        "name": "pipelines",
        "type": "uint8[]"
      }
    ],
    "name": "ProviderRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "peerId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint8[]",
        "name": "pipelines",
        "type": "uint8[]"
      }
    ],
    "name": "ProviderUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "maxLayers",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "computeScore",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "memoryMB",
        "type": "uint32"
      }
    ],
    "name": "ShardCapabilitiesUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "oldTreasury",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newTreasury",
        "type": "address"
      }
    ],
    "name": "TreasuryUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Unpaused",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MAX_PIPELINE_CATEGORY",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "activate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "deactivate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getActiveProviderCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      }
    ],
    "name": "getProvider",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "wallet",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "peerId",
            "type": "string"
          },
          {
            "internalType": "string[]",
            "name": "multiaddrs",
            "type": "string[]"
          },
          {
            "internalType": "uint8[]",
            "name": "pipelines",
            "type": "uint8[]"
          },
          {
            "internalType": "uint256",
            "name": "totalEarnings",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "completedJobs",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "registeredAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastSeenAt",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "isRelay",
            "type": "bool"
          },
          {
            "internalType": "uint16",
            "name": "maxLayers",
            "type": "uint16"
          },
          {
            "internalType": "uint32",
            "name": "computeScore",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "memoryMB",
            "type": "uint32"
          }
        ],
        "internalType": "struct BonzaiProviderRegistry.Provider",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "peerId",
        "type": "string"
      }
    ],
    "name": "getProviderByPeerId",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "wallet",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "peerId",
            "type": "string"
          },
          {
            "internalType": "string[]",
            "name": "multiaddrs",
            "type": "string[]"
          },
          {
            "internalType": "uint8[]",
            "name": "pipelines",
            "type": "uint8[]"
          },
          {
            "internalType": "uint256",
            "name": "totalEarnings",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "completedJobs",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "registeredAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastSeenAt",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "isRelay",
            "type": "bool"
          },
          {
            "internalType": "uint16",
            "name": "maxLayers",
            "type": "uint16"
          },
          {
            "internalType": "uint32",
            "name": "computeScore",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "memoryMB",
            "type": "uint32"
          }
        ],
        "internalType": "struct BonzaiProviderRegistry.Provider",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getProviderCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "pipeline",
        "type": "uint8"
      }
    ],
    "name": "getProvidersForPipeline",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "wallet",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "peerId",
            "type": "string"
          },
          {
            "internalType": "string[]",
            "name": "multiaddrs",
            "type": "string[]"
          },
          {
            "internalType": "uint8[]",
            "name": "pipelines",
            "type": "uint8[]"
          },
          {
            "internalType": "uint256",
            "name": "totalEarnings",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "completedJobs",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "registeredAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastSeenAt",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "isRelay",
            "type": "bool"
          },
          {
            "internalType": "uint16",
            "name": "maxLayers",
            "type": "uint16"
          },
          {
            "internalType": "uint32",
            "name": "computeScore",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "memoryMB",
            "type": "uint32"
          }
        ],
        "internalType": "struct BonzaiProviderRegistry.Provider[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getRelayNodes",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "wallet",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "peerId",
            "type": "string"
          },
          {
            "internalType": "string[]",
            "name": "multiaddrs",
            "type": "string[]"
          },
          {
            "internalType": "uint8[]",
            "name": "pipelines",
            "type": "uint8[]"
          },
          {
            "internalType": "uint256",
            "name": "totalEarnings",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "completedJobs",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "registeredAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastSeenAt",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "isRelay",
            "type": "bool"
          },
          {
            "internalType": "uint16",
            "name": "maxLayers",
            "type": "uint16"
          },
          {
            "internalType": "uint32",
            "name": "computeScore",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "memoryMB",
            "type": "uint32"
          }
        ],
        "internalType": "struct BonzaiProviderRegistry.Provider[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "minLayers",
        "type": "uint16"
      },
      {
        "internalType": "uint32",
        "name": "minMemoryMB",
        "type": "uint32"
      }
    ],
    "name": "getShardProviders",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "wallet",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "peerId",
            "type": "string"
          },
          {
            "internalType": "string[]",
            "name": "multiaddrs",
            "type": "string[]"
          },
          {
            "internalType": "uint8[]",
            "name": "pipelines",
            "type": "uint8[]"
          },
          {
            "internalType": "uint256",
            "name": "totalEarnings",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "completedJobs",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "registeredAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastSeenAt",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "isRelay",
            "type": "bool"
          },
          {
            "internalType": "uint16",
            "name": "maxLayers",
            "type": "uint16"
          },
          {
            "internalType": "uint32",
            "name": "computeScore",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "memoryMB",
            "type": "uint32"
          }
        ],
        "internalType": "struct BonzaiProviderRegistry.Provider[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "heartbeat",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paymentContract",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "name": "peerIdToWallet",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "providerAddresses",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "providers",
    "outputs": [
      {
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "peerId",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "totalEarnings",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "completedJobs",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "registeredAt",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lastSeenAt",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isRelay",
        "type": "bool"
      },
      {
        "internalType": "uint16",
        "name": "maxLayers",
        "type": "uint16"
      },
      {
        "internalType": "uint32",
        "name": "computeScore",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "memoryMB",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "provider",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "recordEarnings",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "peerId",
        "type": "string"
      },
      {
        "internalType": "string[]",
        "name": "multiaddrs",
        "type": "string[]"
      },
      {
        "internalType": "uint8[]",
        "name": "pipelines",
        "type": "uint8[]"
      },
      {
        "internalType": "bool",
        "name": "isRelay",
        "type": "bool"
      }
    ],
    "name": "register",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_paymentContract",
        "type": "address"
      }
    ],
    "name": "setPaymentContract",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "_maxLayers",
        "type": "uint16"
      },
      {
        "internalType": "uint32",
        "name": "_computeScore",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "_memoryMB",
        "type": "uint32"
      }
    ],
    "name": "setShardCapabilities",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_treasury",
        "type": "address"
      }
    ],
    "name": "setTreasury",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "treasury",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "peerId",
        "type": "string"
      },
      {
        "internalType": "string[]",
        "name": "multiaddrs",
        "type": "string[]"
      },
      {
        "internalType": "uint8[]",
        "name": "pipelines",
        "type": "uint8[]"
      },
      {
        "internalType": "bool",
        "name": "isRelay",
        "type": "bool"
      }
    ],
    "name": "updateProvider",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];