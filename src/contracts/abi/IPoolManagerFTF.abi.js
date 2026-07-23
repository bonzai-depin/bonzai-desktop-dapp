export const IPoolManagerFTFABI = [
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "currency0",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "currency1",
            "type": "address"
          },
          {
            "internalType": "uint24",
            "name": "fee",
            "type": "uint24"
          },
          {
            "internalType": "int24",
            "name": "tickSpacing",
            "type": "int24"
          },
          {
            "internalType": "address",
            "name": "hooks",
            "type": "address"
          }
        ],
        "internalType": "struct IPoolManagerFTF.PoolKey",
        "name": "key",
        "type": "tuple"
      },
      {
        "internalType": "uint160",
        "name": "sqrtPriceX96",
        "type": "uint160"
      }
    ],
    "name": "initialize",
    "outputs": [
      {
        "internalType": "int24",
        "name": "tick",
        "type": "int24"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];