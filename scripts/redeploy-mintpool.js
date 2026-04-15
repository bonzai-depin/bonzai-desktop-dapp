/**
 * BonzAI MintPool Redeployment Script — Base Network
 *
 * Redeploys BonzaiMintPool with Chainlink CRE oracle verification.
 * After deployment, re-wires cross-contract references.
 *
 * Prerequisites:
 *   - npx hardhat compile (ensures artifacts are up to date)
 *   - Set environment variables:
 *       DEPLOYER_PRIVATE_KEY   — deployer wallet private key
 *       BASE_RPC_URL           — Base RPC endpoint (default: https://mainnet.base.org)
 *
 * Usage:
 *   node scripts/redeploy-mintpool.js
 *
 * Dry-run (logs deployment plan without sending transactions):
 *   DRY_RUN=1 node scripts/redeploy-mintpool.js
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
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Treasury
  treasury: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89',

  // BONZAI token on Base
  bonzaiTokenBase: '0xc4d137def384ee0f8857887f5950669ba04984ec',

  // MintPool config
  epochDuration: 604800, // 1 week in seconds (production)
  poolThresholds: [1000, 5000, 10000, 25000, 33000, 50000],

  // Chainlink CRE Forwarder on Base mainnet
  // Get the address from: https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts
  forwarder: '', // FILL with Chainlink CRE Forwarder address on Base

  // Existing contract addresses to re-wire (fill these from web3.config.js)
  contentContract: '', // BonzaiCollectiblesFactory address
  royaltySplitter: '', // BonzaiRoyaltySplitter address
  feeHook: '',         // BonzaiUniswapHook address
  unlockContract: '',  // BonzaiUnlock address
  collectiblesFactory: '', // BonzaiCollectiblesFactory address
};

const DRY_RUN = process.env.DRY_RUN === '1';

// ═══════════════════════════════════════════════════════════════════════════
// COMPILER
// ═══════════════════════════════════════════════════════════════════════════

let currentFilePath = '';

function findImports(importPath) {
  const localPath = path.resolve(path.dirname(currentFilePath), importPath);
  if (fs.existsSync(localPath)) {
    return { contents: fs.readFileSync(localPath, 'utf8') };
  }
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
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      console.error('Compilation errors:');
      errors.forEach(e => console.error(e.formattedMessage));
      process.exit(1);
    }
  }

  const contractName = 'BonzaiMintPool';
  const compiled = output.contracts[fileName][contractName];
  return {
    abi: compiled.abi,
    bytecode: '0x' + compiled.evm.bytecode.object,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPLOY
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('ERROR: DEPLOYER_PRIVATE_KEY not set');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(privateKey, provider);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('BonzAI MintPool Redeployment');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Network:      Base (chainId 8453)`);
  console.log(`Deployer:     ${deployer.address}`);
  console.log(`Epoch:        ${CONFIG.epochDuration}s (${CONFIG.epochDuration / 86400} days)`);
  console.log(`Thresholds:   [${CONFIG.poolThresholds.join(', ')}]`);
  console.log(`Dry run:      ${DRY_RUN}`);
  console.log('');

  const balance = await provider.getBalance(deployer.address);
  console.log(`Deployer ETH: ${ethers.formatEther(balance)}`);
  console.log('');

  // Compile
  console.log('Compiling BonzaiMintPool.sol...');
  const { abi, bytecode } = compileContract('BonzaiMintPool.sol');
  console.log(`  ABI entries: ${abi.length}`);
  console.log(`  Bytecode size: ${(bytecode.length - 2) / 2} bytes`);
  console.log('');

  if (!CONFIG.forwarder) {
    console.error('ERROR: forwarder address not set. Get it from the CRE Forwarder Directory.');
    if (!DRY_RUN) process.exit(1);
  }

  if (DRY_RUN) {
    console.log('[DRY RUN] Would deploy BonzaiMintPool with:');
    console.log(`  bonzaiToken: ${CONFIG.bonzaiTokenBase}`);
    console.log(`  thresholds:  [${CONFIG.poolThresholds.join(', ')}]`);
    console.log(`  epochDuration: ${CONFIG.epochDuration}`);
    console.log(`  treasury: ${CONFIG.treasury}`);
    console.log(`  forwarder: ${CONFIG.forwarder}`);
    console.log('');
    console.log('[DRY RUN] Would wire:');
    if (CONFIG.contentContract) console.log(`  setContentContract(${CONFIG.contentContract})`);
    if (CONFIG.royaltySplitter) console.log(`  setRoyaltySplitter(${CONFIG.royaltySplitter})`);
    if (CONFIG.feeHook) console.log(`  setFeeHook(${CONFIG.feeHook})`);
    if (CONFIG.unlockContract) console.log(`  setUnlockContract(${CONFIG.unlockContract})`);
    if (CONFIG.collectiblesFactory) console.log(`  setCollectiblesFactory(${CONFIG.collectiblesFactory})`);
    console.log('');
    console.log('[DRY RUN] Complete. Run without DRY_RUN=1 to deploy.');
    return;
  }

  // Deploy
  console.log('Deploying BonzaiMintPool...');
  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  const mintPool = await factory.deploy(
    CONFIG.bonzaiTokenBase,
    CONFIG.poolThresholds,
    CONFIG.epochDuration,
    CONFIG.treasury,
    CONFIG.forwarder,
  );

  await mintPool.waitForDeployment();
  const mintPoolAddress = await mintPool.getAddress();
  console.log(`  ✓ BonzaiMintPool deployed: ${mintPoolAddress}`);
  console.log('');

  // Wire cross-contract references
  console.log('Wiring cross-contract references...');

  if (CONFIG.contentContract) {
    await (await mintPool.setContentContract(CONFIG.contentContract)).wait();
    console.log(`  ✓ Content contract: ${CONFIG.contentContract}`);
  }

  if (CONFIG.royaltySplitter) {
    await (await mintPool.setRoyaltySplitter(CONFIG.royaltySplitter)).wait();
    console.log(`  ✓ Royalty splitter: ${CONFIG.royaltySplitter}`);
  }

  if (CONFIG.feeHook) {
    await (await mintPool.setFeeHook(CONFIG.feeHook)).wait();
    console.log(`  ✓ Fee hook: ${CONFIG.feeHook}`);
  }

  if (CONFIG.unlockContract) {
    await (await mintPool.setUnlockContract(CONFIG.unlockContract)).wait();
    console.log(`  ✓ Unlock contract: ${CONFIG.unlockContract}`);
  }

  if (CONFIG.collectiblesFactory) {
    await (await mintPool.setCollectiblesFactory(CONFIG.collectiblesFactory)).wait();
    console.log(`  ✓ Collectibles factory: ${CONFIG.collectiblesFactory}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('DEPLOYMENT COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`BonzaiMintPool: ${mintPoolAddress}`);
  console.log('');
  console.log('IMPORTANT: Complete these after deployment:');
  console.log('  1. src/config/web3.config.js → mintPool.contractAddress');
  console.log('  2. Deploy and register the CRE workflow that watches for');
  console.log('     RegistrationRequested / ConfirmClaimRequested events');
  console.log('  3. Update contracts referencing the old MintPool address:');
  console.log('     - BonzaiCollectibles clones (via factory)');
  console.log('     - BonzaiRoyaltySplitter');
  console.log('     - BonzaiUniswapHook');
  console.log('');
  console.log('Genesis time:', (await mintPool.genesisTime()).toString());
  console.log('Current epoch:', (await mintPool.currentEpoch()).toString());
}

main().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
