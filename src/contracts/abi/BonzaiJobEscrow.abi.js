export const BonzaiJobEscrowABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_treasury",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_revenueRouter",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
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
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "SafeERC20FailedOperation",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "currency",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "BasketFeeRoutingFailed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "currency",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "BasketFeesRouted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "ContributionFallbackPaid",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "routeAssetId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "fallbackAt",
        "type": "uint256"
      }
    ],
    "name": "ContributionQueued",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "ContributionRouted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "ContributionRoutingFailed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "deliverBy",
        "type": "uint256"
      }
    ],
    "name": "DeliveryDeadlineSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "JobAccepted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "JobCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "workerAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "contributionAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "platformAmount",
        "type": "uint256"
      }
    ],
    "name": "JobCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "currency",
        "type": "address"
      }
    ],
    "name": "JobCurrencySelected",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "party",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "reasonHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "resolveBy",
        "type": "uint256"
      }
    ],
    "name": "JobDisputed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "employer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "worker",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "companionTokenId",
        "type": "uint256"
      }
    ],
    "name": "JobFunded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "workerBps",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "employerRefund",
        "type": "uint256"
      }
    ],
    "name": "JobSettled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "acceptBy",
        "type": "uint256"
      }
    ],
    "name": "JobTermsPublished",
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
        "indexed": true,
        "internalType": "address",
        "name": "payee",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "PaymentWithdrawn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "reviewBy",
        "type": "uint256"
      }
    ],
    "name": "ReviewDeadlineSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "proposer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "workerBps",
        "type": "uint16"
      }
    ],
    "name": "SettlementProposed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "factory",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "agents",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "rewards",
        "type": "address"
      }
    ],
    "name": "SmartAgentEconomyConfigured",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "currency",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "payee",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "TokenPaymentWithdrawn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "evidenceHash",
        "type": "bytes32"
      }
    ],
    "name": "WorkSubmitted",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "ACCEPT_WINDOW",
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
    "inputs": [],
    "name": "BASKET_GAS_LIMIT",
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
    "inputs": [],
    "name": "BPS",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DELIVERY_WINDOW",
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
    "inputs": [],
    "name": "DISPUTE_WINDOW",
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
    "inputs": [],
    "name": "MAX_ROUTE_RECIPIENTS",
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
    "inputs": [],
    "name": "REVIEW_WINDOW",
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
    "inputs": [],
    "name": "ROUTING_GAS_LIMIT",
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
    "inputs": [],
    "name": "ROUTING_RETRY_WINDOW",
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
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "acceptJob",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "internalType": "uint16",
        "name": "expectedWorkerBps",
        "type": "uint16"
      }
    ],
    "name": "acceptSettlement",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "approveWork",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "basketRewards",
    "outputs": [
      {
        "internalType": "contract IJobBasketRewards",
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
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "cancelJob",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "factory",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "rewards",
        "type": "address"
      }
    ],
    "name": "configureSmartAgentEconomy",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "contributionBps",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "contributionFallbackAt",
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
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "distributeContributionFallback",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "expireJob",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "worker",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "companionTokenId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "termsHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "routeAssetId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "expectedArbitrator",
        "type": "address"
      }
    ],
    "name": "fundJob",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "worker",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "companionTokenId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "termsHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "routeAssetId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "expectedArbitrator",
        "type": "address"
      }
    ],
    "name": "fundTokenJob",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "getFallbackRecipients",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "wallet",
            "type": "address"
          },
          {
            "internalType": "uint16",
            "name": "baseBps",
            "type": "uint16"
          }
        ],
        "internalType": "struct BonzaiJobEscrow.FallbackRecipient[]",
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
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "offset",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "limit",
        "type": "uint256"
      }
    ],
    "name": "getPaymentCurrencies",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "result",
        "type": "address[]"
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
      },
      {
        "internalType": "uint256",
        "name": "offset",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "limit",
        "type": "uint256"
      }
    ],
    "name": "getWalletJobs",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "result",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "holderBps",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "jobCurrency",
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
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "jobTerms",
    "outputs": [
      {
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "acceptBy",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "deliverBy",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "reviewBy",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "resolveBy",
        "type": "uint64"
      },
      {
        "internalType": "enum BonzaiJobEscrow.Status",
        "name": "disputedFrom",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "jobs",
    "outputs": [
      {
        "internalType": "address",
        "name": "employer",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "worker",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "companionTokenId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "termsHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "routeAssetId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "evidenceHash",
        "type": "bytes32"
      },
      {
        "internalType": "enum BonzaiJobEscrow.Status",
        "name": "status",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
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
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "pendingBasketFees",
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
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "pendingContributions",
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
    "inputs": [],
    "name": "platformBps",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "internalType": "uint16",
        "name": "workerShareBps",
        "type": "uint16"
      }
    ],
    "name": "proposeSettlement",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "reasonHash",
        "type": "bytes32"
      }
    ],
    "name": "raiseDispute",
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
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "internalType": "uint16",
        "name": "workerShareBps",
        "type": "uint16"
      }
    ],
    "name": "resolveDispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "revenueRouter",
    "outputs": [
      {
        "internalType": "contract IJobRevenueRouter",
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
        "name": "currency",
        "type": "address"
      }
    ],
    "name": "routeBasketFees",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      }
    ],
    "name": "routeContribution",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "settlementProposals",
    "outputs": [
      {
        "internalType": "address",
        "name": "proposer",
        "type": "address"
      },
      {
        "internalType": "uint16",
        "name": "workerBps",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "smartAgents",
    "outputs": [
      {
        "internalType": "contract IJobSmartAgents",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "socialTokenFactory",
    "outputs": [
      {
        "internalType": "contract IJobSocialTokenFactory",
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
        "internalType": "bytes32",
        "name": "jobId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "evidenceHash",
        "type": "bytes32"
      }
    ],
    "name": "submitWork",
    "outputs": [],
    "stateMutability": "nonpayable",
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
    "name": "tokenEscrowed",
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
        "name": "",
        "type": "address"
      }
    ],
    "name": "tokenPendingContributions",
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
        "name": "",
        "type": "address"
      }
    ],
    "name": "tokenTotalWithdrawable",
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
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "tokenWithdrawable",
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
    "inputs": [],
    "name": "totalEscrowed",
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
    "inputs": [],
    "name": "totalPendingContributions",
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
    "inputs": [],
    "name": "totalWithdrawable",
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
    "name": "treasuryBps",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address payable",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "withdrawPayments",
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
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "withdrawTokenPayments",
    "outputs": [],
    "stateMutability": "nonpayable",
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
    "name": "withdrawable",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];