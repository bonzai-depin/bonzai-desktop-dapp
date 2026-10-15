/**
 * BonzAI MVP Deploy Script — Base Network
 *
 * Deploys the core protocol contracts on Base (chainId 8453):
 *   1. BonzaiMintPool       — Epoch-based revenue pools for LVL holders
 *   2. BonzaiCollectibles    — ERC-721 content NFT implementation (ERC-1167 clone pattern)
 *   2b. BonzaiCollectiblesFactory — Factory for per-user collection clones
 *   3. BonzaiRoyaltySplitter — Secondary royalty distribution
 *   4. BonzaiCompanions      — ERC-721 companion NFT with ERC-8004
 *   5. BonzaiUniswapHook     — V4 afterSwap hook (1% fee, 80/10/10 split)
 *   6. CompanionTokenFactory  — Atomic companion ERC-20 + Uniswap V4 LP
 *   7. FineTuneTokenFactory   — Atomic model ERC-20 + Uniswap V4 LP
 *   8. BonzaiUnlock           — ETH payment to unlock all levels
 *   9. BonzaiSkillRegistry    — Skill marketplace
 *  10. BonzaiSkillOwnership   — Companion co-ownership + revenue distribution
 *  11. BonzaiProviderRegistry — P2P inference provider registry
 *  12. BonzaiPayment          — P2P ETH/USDC payment processing
 *
 * Cross-contract wiring is performed after all deployments.
 *
 * Prerequisites:
 *   - npm install ethers solc
 *   - node scripts/compileContracts.js  (generates ABIs)
 *   - Set environment variables:
 *       DEPLOYER_PRIVATE_KEY   — deployer wallet private key
 *       BASE_RPC_URL           — Base RPC endpoint (default: https://mainnet.base.org)
 *
 * Usage:
 *   node scripts/deploy-base-mvp.js
 *
 * Dry-run (logs deployment plan without sending transactions):
 *   DRY_RUN=1 node scripts/deploy-base-mvp.js
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const contractsDir = path.resolve(projectRoot, 'src', 'contracts');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION — Edit these before deploying
// ═══════════════════════════════════════════════════════════════════════════

const DEPLOY_CONFIG = {
  // Treasury & wallets (from web3.config.js)
  treasury: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89',
  foundationWallet: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89',
  liquidityWallet: '0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93',

  // BONZAI token on Base
  bonzaiTokenBase: '0xc4d137def384ee0f8857887f5950669ba04984ec',

  // Uniswap V4 on Base
  poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
  positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  create2Deployer: '0x4e59b44847b379578588920cA78FbF26c0B4956C',

  // MintPool config
  epochDuration: 1209600, // 14 days (2 weeks) in seconds
  poolThresholds: [1000, 5000, 10000, 25000, 33000, 50000],

  // BonzaiUnlock price in wei (1 ETH)
  unlockPrice: ethers.parseEther('1.0'),

  // Hook permission flags: afterSwap (bit 6) + afterSwapReturnDelta (bit 2) = 0x0044
  hookFlags: 0x0044,
  hookFlagsMask: 0x3FFF, // last 14 bits

  // P2P Provider Registry config
  minStakeAmount: ethers.parseEther('0.01'), // 0.01 ETH minimum stake
  p2pPlatformFeeBps: 250, // 2.5% platform fee

  // USDC on Base (for BonzaiPayment)
  usdcBase: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPILER
// ═══════════════════════════════════════════════════════════════════════════

let currentFilePath = '';

function findImports(importPath) {
  // Try relative to current file
  const localPath = path.resolve(path.dirname(currentFilePath), importPath);
  if (fs.existsSync(localPath)) {
    return { contents: fs.readFileSync(localPath, 'utf8') };
  }
  // Try node_modules
  const nodeModulesPath = path.resolve(projectRoot, 'node_modules', importPath);
  if (fs.existsSync(nodeModulesPath)) {
    return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
  }
  return { error: `File not found: ${importPath}` };
}

function compileContract(fileName) {
  currentFilePath = path.resolve(contractsDir, fileName);
  const source = fs.readFileSync(currentFilePath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: { [fileName]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    for (const error of output.errors) {
      if (error.severity === 'error') {
        console.error(`\n❌ Compilation error in ${fileName}:`);
        console.error(error.formattedMessage);
        process.exit(1);
      }
    }
  }

  // Return all contracts from this file
  const contracts = {};
  for (const [name, data] of Object.entries(output.contracts[fileName])) {
    if (data.evm?.bytecode?.object) {
      contracts[name] = {
        abi: data.abi,
        bytecode: '0x' + data.evm.bytecode.object,
      };
    }
  }
  return contracts;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPLOY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const DRY_RUN = process.env.DRY_RUN === '1';
const deployedAddresses = {};
const STATE_FILE = path.resolve(projectRoot, '.deploy-state.json');

// Nonce tracker — fetched once, incremented after each confirmed tx
let currentNonce = null;

async function initNonce(signer) {
  const provider = signer.provider;
  const address = await signer.getAddress();
  const confirmed = await provider.getTransactionCount(address, 'latest');
  const pending = await provider.getTransactionCount(address, 'pending');
  if (pending > confirmed) {
    console.log(`  ⚠ ${pending - confirmed} pending tx(s) detected (nonce ${confirmed}→${pending})`);
    console.log(`    Waiting for pending transactions to clear...`);
    // Wait for pending txs to either confirm or drop
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      const now = await provider.getTransactionCount(address, 'pending');
      const nowConfirmed = await provider.getTransactionCount(address, 'latest');
      if (now === nowConfirmed) {
        console.log(`    ✓ Pending transactions cleared (nonce: ${nowConfirmed})`);
        currentNonce = nowConfirmed;
        return;
      }
    }
    throw new Error('Pending transactions did not clear after 2.5 minutes. Cancel them manually or wait.');
  }
  currentNonce = confirmed;
  console.log(`  Nonce: ${currentNonce}`);
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(deployedAddresses, null, 2));
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    Object.assign(deployedAddresses, saved);
    const names = Object.keys(saved);
    if (names.length > 0) {
      console.log(`\n  ⚡ Resuming from .deploy-state.json — ${names.length} contract(s) already deployed:`);
      for (const [name, addr] of Object.entries(saved)) {
        console.log(`     ${name}: ${addr}`);
      }
      console.log();
    }
    return names.length > 0;
  }
  return false;
}

async function deployContract(signer, name, { abi, bytecode }, constructorArgs, label) {
  const displayLabel = label || name;

  // Skip if already deployed (resume mode)
  if (deployedAddresses[name]) {
    console.log(`\n━━━ ${displayLabel} ━━━`);
    console.log(`  ✓ Already deployed at: ${deployedAddresses[name]} (skipped)`);
    return new ethers.Contract(deployedAddresses[name], abi, signer);
  }

  console.log(`\n━━━ Deploying ${displayLabel} ━━━`);
  console.log(`  Constructor args: ${JSON.stringify(constructorArgs, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);

  if (DRY_RUN) {
    const idx = (Object.keys(deployedAddresses).length + 1).toString(16);
    const placeholder = `0x${'0'.repeat(40 - idx.length)}${idx}`;
    console.log(`  [DRY RUN] Would deploy ${displayLabel} → ${placeholder}`);
    deployedAddresses[name] = placeholder;
    return { address: placeholder };
  }

  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(...constructorArgs, { nonce: currentNonce });
  currentNonce++;
  const receipt = await contract.deploymentTransaction().wait();

  const addr = await contract.getAddress();
  console.log(`  ✓ Deployed at: ${addr}`);
  console.log(`  ✓ Tx hash: ${receipt.hash}`);
  console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);

  deployedAddresses[name] = addr;
  saveState();
  return contract;
}

async function wireContract(signer, contractAddr, abi, functionName, args, label) {
  console.log(`  → ${label}`);

  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would call ${functionName}(${args.join(', ')})`);
    return;
  }

  const contract = new ethers.Contract(contractAddr, abi, signer);
  const tx = await contract[functionName](...args, { nonce: currentNonce });
  currentNonce++;
  const receipt = await tx.wait();
  console.log(`    ✓ Tx: ${receipt.hash} (gas: ${receipt.gasUsed.toString()})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE2 SALT MINING (for hook address with correct permission bits)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mine a CREATE2 salt that produces an address with the required hook flag bits.
 * Hook address must have bits matching DEPLOY_CONFIG.hookFlags in the last 14 bits.
 *
 * @param {string} deployerAddr - CREATE2 deployer address
 * @param {string} initCodeHash - keccak256 of init code (bytecode + constructor args)
 * @returns {string} Salt as bytes32 hex string
 */
function mineCREATE2Salt(deployerAddr, initCodeHash) {
  console.log('  Mining CREATE2 salt for hook address flags 0x0044...');
  const flags = BigInt(DEPLOY_CONFIG.hookFlags);
  const mask = BigInt(DEPLOY_CONFIG.hookFlagsMask);

  for (let i = 0n; i < 10_000_000n; i++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(i), 32);
    const addr = ethers.getCreate2Address(deployerAddr, salt, initCodeHash);
    const addrBigInt = BigInt(addr);

    if ((addrBigInt & mask) === flags) {
      console.log(`  ✓ Found salt after ${i + 1n} iterations`);
      console.log(`  ✓ Hook address: ${addr}`);
      console.log(`  ✓ Salt: ${salt}`);
      return salt;
    }
  }

  throw new Error('Failed to find CREATE2 salt within 10M iterations');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DEPLOYMENT
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  if (!DRY_RUN) throw new Error('Legacy Base MVP deployment is disabled: its payment and staking wiring does not implement the v4 RC. Use the reviewed single-chain deployment workflow and production preflight.');
  // Setup provider and signer
  const rpcUrl = process.env.BASE_RPC_URL || 'https://base.llamarpc.com';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== 8453) {
    console.error(`Wrong network: expected Base (8453), got ${network.chainId}`);
    process.exit(1);
  }

  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error('Set DEPLOYER_PRIVATE_KEY environment variable');
    process.exit(1);
  }

  const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const deployerAddr = await signer.getAddress();
  const balance = await provider.getBalance(deployerAddr);

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     BonzAI MVP Deploy — Base Network (Uniswap V4)       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`  Network:   Base (${network.chainId})`);
  console.log(`  Deployer:  ${deployerAddr}`);
  console.log(`  Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log(`  Mode:      ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Treasury:  ${DEPLOY_CONFIG.treasury}`);
  console.log(`  BONZAI:    ${DEPLOY_CONFIG.bonzaiTokenBase}`);
  console.log(`  PoolMgr:   ${DEPLOY_CONFIG.poolManager}`);
  console.log(`  PosMgr:    ${DEPLOY_CONFIG.positionManager}`);

  // Load resume state and init nonce
  loadState();
  if (!DRY_RUN) {
    await initNonce(signer);
  }

  // ─── Step 1: Compile all contracts ──────────────────────────────────
  console.log('\n═══ Step 1: Compiling contracts ═══');

  const mintPoolCompiled = compileContract('BonzaiMintPool.sol');
  console.log('  ✓ BonzaiMintPool.sol');

  const collectiblesCompiled = compileContract('BonzaiCollectibles.sol');
  console.log('  ✓ BonzaiCollectibles.sol');

  const collectiblesFactoryCompiled = compileContract('BonzaiCollectiblesFactory.sol');
  console.log('  ✓ BonzaiCollectiblesFactory.sol');

  const splitterCompiled = compileContract('BonzaiRoyaltySplitter.sol');
  console.log('  ✓ BonzaiRoyaltySplitter.sol');

  const companionsCompiled = compileContract('BonzaiCompanions.sol');
  console.log('  ✓ BonzaiCompanions.sol');

  const hookCompiled = compileContract('BonzaiUniswapHook.sol');
  console.log('  ✓ BonzaiUniswapHook.sol');

  const companionFactoryCompiled = compileContract('CompanionTokenFactory.sol');
  console.log('  ✓ CompanionTokenFactory.sol (includes CompanionToken)');

  const fineTuneFactoryCompiled = compileContract('FineTuneTokenFactory.sol');
  console.log('  ✓ FineTuneTokenFactory.sol (includes FineTuneToken)');

  const unlockCompiled = compileContract('BonzaiUnlock.sol');
  console.log('  ✓ BonzaiUnlock.sol');

  const skillRegistryCompiled = compileContract('BonzaiSkillRegistry.sol');
  console.log('  ✓ BonzaiSkillRegistry.sol');

  const skillOwnershipCompiled = compileContract('BonzaiSkillOwnership.sol');
  console.log('  ✓ BonzaiSkillOwnership.sol');

  const providerRegistryCompiled = compileContract('BonzaiProviderRegistry.sol');
  console.log('  ✓ BonzaiProviderRegistry.sol');

  const paymentCompiled = compileContract('BonzaiPayment.sol');
  console.log('  ✓ BonzaiPayment.sol');

  const pipelinePaymentCompiled = compileContract('BonzaiPipelinePayment.sol');
  console.log('  ✓ BonzaiPipelinePayment.sol');

  // ─── Step 2: Deploy contracts (dependency order) ────────────────────
  console.log('\n═══ Step 2: Deploying contracts ═══');

  // 2a. BonzaiMintPool
  const mintPool = await deployContract(
    signer, 'BonzaiMintPool',
    mintPoolCompiled.BonzaiMintPool,
    [
      DEPLOY_CONFIG.bonzaiTokenBase,
      DEPLOY_CONFIG.poolThresholds,
      DEPLOY_CONFIG.epochDuration,
      DEPLOY_CONFIG.treasury,
    ],
    'BonzaiMintPool (epoch-based revenue pools)',
  );

  // 2b. BonzaiCollectibles (implementation contract)
  const collectiblesImpl = await deployContract(
    signer, 'BonzaiCollectibles',
    collectiblesCompiled.BonzaiCollectibles,
    [],
    'BonzaiCollectibles (ERC-721 implementation)',
  );

  // 2b2. BonzaiCollectiblesFactory
  const collectiblesFactory = await deployContract(
    signer, 'BonzaiCollectiblesFactory',
    collectiblesFactoryCompiled.BonzaiCollectiblesFactory,
    [
      deployedAddresses.BonzaiCollectibles,
      DEPLOY_CONFIG.treasury,
      deployedAddresses.BonzaiMintPool,
      ethers.ZeroAddress, // royaltySplitter — set after splitter is deployed
    ],
    'BonzaiCollectiblesFactory (ERC-1167 clone factory)',
  );

  // 2c. BonzaiRoyaltySplitter
  const splitter = await deployContract(
    signer, 'BonzaiRoyaltySplitter',
    splitterCompiled.BonzaiRoyaltySplitter,
    [DEPLOY_CONFIG.treasury, deployedAddresses.BonzaiMintPool],
    'BonzaiRoyaltySplitter (secondary royalties)',
  );

  // 2d. BonzaiCompanions
  const companions = await deployContract(
    signer, 'BonzaiCompanions',
    companionsCompiled.BonzaiCompanions,
    [DEPLOY_CONFIG.treasury],
    'BonzaiCompanions (ERC-721 + ERC-8004)',
  );

  // 2e. BonzaiUniswapHook — deploy via CREATE2 for correct address bits
  const hookAbi = hookCompiled.BonzaiUniswapHook.abi;
  const hookBytecode = hookCompiled.BonzaiUniswapHook.bytecode;

  if (deployedAddresses.BonzaiUniswapHook) {
    console.log('\n━━━ BonzaiUniswapHook via CREATE2 ━━━');
    console.log(`  ✓ Already deployed at: ${deployedAddresses.BonzaiUniswapHook} (skipped)`);
  } else {
    console.log('\n━━━ Deploying BonzaiUniswapHook via CREATE2 ━━━');

    // Encode constructor args (includes initialOwner for CREATE2 compatibility)
    const hookConstructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'address', 'address'],
      [DEPLOY_CONFIG.poolManager, DEPLOY_CONFIG.treasury, deployedAddresses.BonzaiMintPool, deployerAddr],
    );
    const hookInitCode = hookBytecode + hookConstructorArgs.slice(2);
    const hookInitCodeHash = ethers.keccak256(hookInitCode);

    if (DRY_RUN) {
      console.log('  [DRY RUN] Would mine CREATE2 salt and deploy hook');
      const placeholder = `0x${'0'.repeat(36)}0090`;
      deployedAddresses.BonzaiUniswapHook = placeholder;
      console.log(`  [DRY RUN] Hook address: ${placeholder}`);
    } else {
      // Mine salt for correct permission bits
      const salt = mineCREATE2Salt(DEPLOY_CONFIG.create2Deployer, hookInitCodeHash);

      // Deploy via CREATE2 deployer
      const create2Tx = await signer.sendTransaction({
        to: DEPLOY_CONFIG.create2Deployer,
        data: salt + hookInitCode.slice(2),
        nonce: currentNonce,
      });
      currentNonce++;
      const create2Receipt = await create2Tx.wait();

      const hookAddr = ethers.getCreate2Address(
        DEPLOY_CONFIG.create2Deployer,
        salt,
        hookInitCodeHash,
      );

      // Verify address has correct flags
      const addrBigInt = BigInt(hookAddr);
      const actualFlags = Number(addrBigInt & BigInt(DEPLOY_CONFIG.hookFlagsMask));
      if (actualFlags !== DEPLOY_CONFIG.hookFlags) {
        throw new Error(`Hook address flags mismatch: expected 0x${DEPLOY_CONFIG.hookFlags.toString(16)}, got 0x${actualFlags.toString(16)}`);
      }

      console.log(`  ✓ Hook deployed at: ${hookAddr}`);
      console.log(`  ✓ Flags verified: 0x${actualFlags.toString(16)}`);
      console.log(`  ✓ Tx hash: ${create2Receipt.hash}`);
      console.log(`  ✓ Gas used: ${create2Receipt.gasUsed.toString()}`);

      deployedAddresses.BonzaiUniswapHook = hookAddr;
      saveState();
    }
  }

  // 2f. CompanionTokenFactory — needs V4 infrastructure + hook
  const companionFactory = await deployContract(
    signer, 'CompanionTokenFactory',
    companionFactoryCompiled.CompanionTokenFactory,
    [
      DEPLOY_CONFIG.poolManager,
      DEPLOY_CONFIG.positionManager,
      DEPLOY_CONFIG.permit2,
      deployedAddresses.BonzaiUniswapHook,
    ],
    'CompanionTokenFactory (ERC-20 + V4 LP)',
  );

  // 2g. FineTuneTokenFactory — needs V4 infrastructure + hook
  const fineTuneFactory = await deployContract(
    signer, 'FineTuneTokenFactory',
    fineTuneFactoryCompiled.FineTuneTokenFactory,
    [
      DEPLOY_CONFIG.poolManager,
      DEPLOY_CONFIG.positionManager,
      DEPLOY_CONFIG.permit2,
      deployedAddresses.BonzaiUniswapHook,
    ],
    'FineTuneTokenFactory (ERC-20 + V4 LP)',
  );

  // 2h. BonzaiUnlock
  const unlock = await deployContract(
    signer, 'BonzaiUnlock',
    unlockCompiled.BonzaiUnlock,
    [
      DEPLOY_CONFIG.foundationWallet,
      DEPLOY_CONFIG.liquidityWallet,
      DEPLOY_CONFIG.unlockPrice,
    ],
    'BonzaiUnlock (1 ETH all-level unlock)',
  );

  // 2i. BonzaiSkillRegistry — Skill marketplace
  const skillRegistry = await deployContract(
    signer, 'BonzaiSkillRegistry',
    skillRegistryCompiled.BonzaiSkillRegistry,
    [ethers.ZeroAddress], // skillOwnership set after deployment
    'BonzaiSkillRegistry (token-gated skill access)',
  );

  // 2j. BonzaiSkillOwnership — Companion co-ownership + revenue distribution
  const skillOwnership = await deployContract(
    signer, 'BonzaiSkillOwnership',
    skillOwnershipCompiled.BonzaiSkillOwnership,
    [
      deployedAddresses.BonzaiSkillRegistry,
      DEPLOY_CONFIG.bonzaiTokenBase,
      DEPLOY_CONFIG.treasury,
      deployerAddr, // attestation signer (deployer initially)
      deployedAddresses.BonzaiCompanions,
    ],
    'BonzaiSkillOwnership (companion co-ownership)',
  );

  // 2l. BonzaiProviderRegistry — P2P provider registration
  const providerRegistry = await deployContract(
    signer, 'BonzaiProviderRegistry',
    providerRegistryCompiled.BonzaiProviderRegistry,
    [
      DEPLOY_CONFIG.treasury,
      DEPLOY_CONFIG.minStakeAmount,
      DEPLOY_CONFIG.p2pPlatformFeeBps,
    ],
    'BonzaiProviderRegistry (P2P provider registry)',
  );

  // 2m. BonzaiPayment — P2P ETH/USDC payment processing
  const payment = await deployContract(
    signer, 'BonzaiPayment',
    paymentCompiled.BonzaiPayment,
    [
      DEPLOY_CONFIG.usdcBase,
      DEPLOY_CONFIG.treasury,
      DEPLOY_CONFIG.p2pPlatformFeeBps,
    ],
    'BonzaiPayment (P2P ETH/USDC payments)',
  );

  // 2n. BonzaiPipelinePayment — Multi-payee pipeline payment for private inference
  const pipelinePayment = await deployContract(
    signer, 'BonzaiPipelinePayment',
    pipelinePaymentCompiled.BonzaiPipelinePayment,
    [
      DEPLOY_CONFIG.usdcBase,
      DEPLOY_CONFIG.treasury,
      DEPLOY_CONFIG.p2pPlatformFeeBps,
    ],
    'BonzaiPipelinePayment (multi-payee pipeline payments)',
  );

  // ─── Step 3: Cross-contract wiring ──────────────────────────────────
  console.log('\n═══ Step 3: Cross-contract wiring ═══');

  // Wire BonzaiCollectiblesFactory → RoyaltySplitter (update factory defaults for new clones)
  const factoryAbi = collectiblesFactoryCompiled.BonzaiCollectiblesFactory.abi;
  await wireContract(
    signer, deployedAddresses.BonzaiCollectiblesFactory, factoryAbi,
    'setRoyaltySplitter', [deployedAddresses.BonzaiRoyaltySplitter],
    'BonzaiCollectiblesFactory.setRoyaltySplitter(splitter)',
  );

  // Wire BonzaiMintPool → CollectiblesFactory + RoyaltySplitter + FeeHook
  const mintPoolAbi = mintPoolCompiled.BonzaiMintPool.abi;
  await wireContract(
    signer, deployedAddresses.BonzaiMintPool, mintPoolAbi,
    'setCollectiblesFactory', [deployedAddresses.BonzaiCollectiblesFactory],
    'BonzaiMintPool.setCollectiblesFactory(factory)',
  );
  await wireContract(
    signer, deployedAddresses.BonzaiMintPool, mintPoolAbi,
    'setRoyaltySplitter', [deployedAddresses.BonzaiRoyaltySplitter],
    'BonzaiMintPool.setRoyaltySplitter(splitter)',
  );
  await wireContract(
    signer, deployedAddresses.BonzaiMintPool, mintPoolAbi,
    'setFeeHook', [deployedAddresses.BonzaiUniswapHook],
    'BonzaiMintPool.setFeeHook(hook)',
  );
  await wireContract(
    signer, deployedAddresses.BonzaiMintPool, mintPoolAbi,
    'setCompanionNFT', [deployedAddresses.BonzaiCompanions],
    'BonzaiMintPool.setCompanionNFT(companions)',
  );
  await wireContract(
    signer, deployedAddresses.BonzaiMintPool, mintPoolAbi,
    'setUnlockContract', [deployedAddresses.BonzaiUnlock],
    'BonzaiMintPool.setUnlockContract(unlock)',
  );

  // Wire BonzaiUniswapHook → authorize both factories
  await wireContract(
    signer, deployedAddresses.BonzaiUniswapHook, hookAbi,
    'authorizeFactory', [deployedAddresses.CompanionTokenFactory, true],
    'BonzaiUniswapHook.authorizeFactory(companionFactory)',
  );
  await wireContract(
    signer, deployedAddresses.BonzaiUniswapHook, hookAbi,
    'authorizeFactory', [deployedAddresses.FineTuneTokenFactory, true],
    'BonzaiUniswapHook.authorizeFactory(fineTuneFactory)',
  );

  // Wire CompanionTokenFactory → BonzaiCompanions (NFT ownership check)
  const companionFactoryAbi = companionFactoryCompiled.CompanionTokenFactory.abi;
  await wireContract(
    signer, deployedAddresses.CompanionTokenFactory, companionFactoryAbi,
    'setCompanionContract', [deployedAddresses.BonzaiCompanions],
    'CompanionTokenFactory.setCompanionContract(companions)',
  );
  const companionsAbiForFactory = companionsCompiled.BonzaiCompanions.abi;
  await wireContract(
    signer, deployedAddresses.BonzaiCompanions, companionsAbiForFactory,
    'setCompanionTokenFactory', [deployedAddresses.CompanionTokenFactory],
    'BonzaiCompanions.setCompanionTokenFactory(companionFactory)',
  );

  // Verify membership in the canonical factory, then ownership in the model's collection.
  const fineTuneFactoryAbi = fineTuneFactoryCompiled.FineTuneTokenFactory.abi;
  await wireContract(
    signer, deployedAddresses.FineTuneTokenFactory, fineTuneFactoryAbi,
    'setContentContract', [deployedAddresses.BonzaiCollectiblesFactory],
    'FineTuneTokenFactory.setContentContract(collectiblesFactory)',
  );
  await wireContract(
    signer, deployedAddresses.FineTuneTokenFactory, fineTuneFactoryAbi,
    'disableLegacyLaunch', [],
    'FineTuneTokenFactory.disableLegacyLaunch()',
  );

  // Wire BonzaiSkillRegistry ↔ BonzaiSkillOwnership (bidirectional)
  const skillRegistryAbi = skillRegistryCompiled.BonzaiSkillRegistry.abi;
  const skillOwnershipAbi = skillOwnershipCompiled.BonzaiSkillOwnership.abi;
  await wireContract(
    signer, deployedAddresses.BonzaiSkillRegistry, skillRegistryAbi,
    'setSkillOwnershipContract', [deployedAddresses.BonzaiSkillOwnership],
    'BonzaiSkillRegistry.setSkillOwnershipContract(skillOwnership)',
  );
  await wireContract(
    signer, deployedAddresses.BonzaiSkillOwnership, skillOwnershipAbi,
    'setSkillRegistry', [deployedAddresses.BonzaiSkillRegistry],
    'BonzaiSkillOwnership.setSkillRegistry(registry)',
  );

  await wireContract(
    signer, deployedAddresses.BonzaiSkillOwnership, skillOwnershipAbi,
    'setCompanionTokenFactory', [deployedAddresses.CompanionTokenFactory],
    'BonzaiSkillOwnership.setCompanionTokenFactory(companionFactory)',
  );

  // Set USDC token on SkillOwnership for USDC revenue distribution
  await wireContract(
    signer, deployedAddresses.BonzaiSkillOwnership, skillOwnershipAbi,
    'setUsdcToken', [DEPLOY_CONFIG.usdcBase],
    'BonzaiSkillOwnership.setUsdcToken(usdc)',
  );

  // Level gating removed — BONZAI holdings span 3 networks and can't be aggregated on-chain.
  // Level checks are enforced off-chain in the application layer.

  // Wire BonzaiPayment ↔ BonzaiProviderRegistry
  const paymentAbi = paymentCompiled.BonzaiPayment.abi;
  const providerRegistryAbi = providerRegistryCompiled.BonzaiProviderRegistry.abi;

  await wireContract(
    signer, deployedAddresses.BonzaiPayment, paymentAbi,
    'setProviderRegistry', [deployedAddresses.BonzaiProviderRegistry],
    'BonzaiPayment.setProviderRegistry(providerRegistry)',
  );
  await wireContract(
    signer, deployedAddresses.BonzaiProviderRegistry, providerRegistryAbi,
    'setPaymentContract', [deployedAddresses.BonzaiPayment],
    'BonzaiProviderRegistry.setPaymentContract(payment)',
  );

  // Wire BonzaiPipelinePayment → BonzaiProviderRegistry
  const pipelinePaymentAbi = pipelinePaymentCompiled.BonzaiPipelinePayment.abi;
  await wireContract(
    signer, deployedAddresses.BonzaiPipelinePayment, pipelinePaymentAbi,
    'setProviderRegistry', [deployedAddresses.BonzaiProviderRegistry],
    'BonzaiPipelinePayment.setProviderRegistry(providerRegistry)',
  );

  // ─── Step 4: Summary ───────────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                DEPLOYMENT SUMMARY                        ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');

  for (const [name, addr] of Object.entries(deployedAddresses)) {
    console.log(`║  ${name.padEnd(28)} ${addr} ║`);
  }

  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  Cross-contract wiring:                                  ║');
  console.log('║    CollectiblesFactory → RoyaltySplitter                  ║');
  console.log('║    MintPool → Factory, RoyaltySplitter, FeeHook          ║');
  console.log('║    Hook     → CompanionFactory, FineTuneFactory          ║');
  console.log('║    CompanionFactory → Companions                         ║');
  console.log('║    FineTuneFactory  → CollectiblesImpl                   ║');
  console.log('║    SkillRegistry ↔ SkillOwnership (bidirectional)        ║');
  console.log('║    SkillOwnership → USDC token                           ║');
  console.log('║    Payment ↔ ProviderRegistry                            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  // Output config snippet for web3.config.js
  console.log('\n═══ web3.config.js update snippet ═══');
  console.log(`
  // Paste into web3.config.js after deployment:
  contentNFT: { base: { contractAddress: '${deployedAddresses.BonzaiCollectibles}', factoryAddress: '${deployedAddresses.BonzaiCollectiblesFactory}', chainId: 8453 } },
  companionNFT_BASE: { contractAddress: '${deployedAddresses.BonzaiCompanions}', chainId: 8453 },
  mintPool: { contractAddress: '${deployedAddresses.BonzaiMintPool}', chainId: 8453 },
  royaltySplitter: { contractAddress: '${deployedAddresses.BonzaiRoyaltySplitter}', chainId: 8453 },
  companionTokenFactory: { contractAddress: '${deployedAddresses.CompanionTokenFactory}', chainId: 8453 },
  fineTuneTokenFactory: { contractAddress: '${deployedAddresses.FineTuneTokenFactory}', chainId: 8453 },
  levelUnlock: { registryAddress: '${deployedAddresses.BonzaiUnlock}', chainId: 8453 },
  uniswap: { base: { feeHook: '${deployedAddresses.BonzaiUniswapHook}' } },
  skillRegistry: {
    contractAddress: '${deployedAddresses.BonzaiSkillRegistry}',
    ownershipContractAddress: '${deployedAddresses.BonzaiSkillOwnership}',
  },
  p2pNetwork: {
    providerRegistryAddress: '${deployedAddresses.BonzaiProviderRegistry}',
    paymentContractAddress: '${deployedAddresses.BonzaiPayment}',
    pipelinePaymentAddress: '${deployedAddresses.BonzaiPipelinePayment}',
  },
  `);

  // ─── Step 5: Post-deploy checklist ──────────────────────────────────
  console.log('═══ Post-deploy checklist ═══');
  console.log('  [ ] Verify all contracts on BaseScan (npx hardhat verify or manual)');
  console.log('  [ ] Update web3.config.js with deployed addresses');
  console.log('  [ ] Verify hook address has correct permission bits (0x0044)');
  console.log('  [ ] Set Transfer Validator on BonzaiCollectibles clones for ERC721-C (Limit Break)');
  console.log('  [ ] Set contractURI on BonzaiCompanions for OpenSea collection metadata');
  console.log('  [ ] Test: mint content NFT, verify fee split 80/20');
  console.log('  [ ] Test: mint companion, verify treasury receives mint price');
  console.log('  [ ] Test: register for epoch, wait, confirm + claim');
  console.log('  [ ] Test: unlock via BonzaiUnlock, verify 50/50 split');
  console.log('  [ ] Test: launch companion token, verify V4 pool created + LP locked');
  console.log('  [ ] Test: swap on companion token, verify hook captures 1% fee');
  console.log('  [ ] Test: claim beneficiary fees from hook');
  console.log('  [ ] Test: claim treasury + pool fees from hook');
  console.log('  [ ] Test: launch fine-tune token, verify same flow');
  console.log('  [ ] Test: register P2P provider with stake, verify activation');
  console.log('  [ ] Test: deposit ETH/USDC into BonzaiPayment, process payment');
  console.log('  [ ] Test: provider withdraw earnings (ETH + USDC)');
  console.log('  [ ] Test: EIP-712 signed payment flow (x402)');
  console.log('  [ ] Transfer ownership of all contracts to multisig (gnosis safe)');
  console.log(`  [ ] Delete .deploy-state.json after verifying everything`);
}

main().catch((err) => {
  console.error('\n❌ Deployment failed:', err);
  process.exit(1);
});
