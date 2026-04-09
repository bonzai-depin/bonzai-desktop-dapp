#!/usr/bin/env node

/**
 * Redeploy BonzaiMintPool + BonzaiSkillRegistry with unlock contract support.
 * Updates web3.config.js and wires cross-contract references.
 *
 * Changes:
 *   - BonzaiMintPool: unlocked users bypass pool thresholds, need >0 BONZAI
 *   - BonzaiSkillRegistry: unlocked users get free skill purchase + execution
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const contractsDir = path.resolve(projectRoot, 'src', 'contracts');

// Existing deployed contracts (from v3 deployment)
const EXISTING = {
  bonzaiToken: '0xc4d137def384ee0f8857887f5950669ba04984ec',
  treasury: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89',
  unlock: '0x7A33a9843C1740Ea73594fA2468Fb210a7fd7968',
  companions: '0x0889B53F810aF1bFc83EFFD459E945a1a4D79c38',
  collectiblesFactory: '0xCF5d739674A9daf91Da83CF84eDE1456B7f17BC2',
  royaltySplitter: '0x798Bcae41E3A08B216D0Df6f03Be1e4eBEED9f24',
  hook: '0x0d4B1d95ec00A6BC794B4bE18D1dF4136D524090',
  skillOwnership: '0xa1f80ABCe763De90eB873990C5841F7B1770383C',
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

const EPOCH_DURATION = 1209600; // 2 weeks
const POOL_THRESHOLDS = [1000, 5000, 10000, 25000, 33000, 50000];

// ─── Compiler ────────────────────────────────────────────────────────────────

let currentFilePath = '';
function findImports(importPath) {
  const localPath = path.resolve(path.dirname(currentFilePath), importPath);
  if (fs.existsSync(localPath)) return { contents: fs.readFileSync(localPath, 'utf8') };
  const nodeModulesPath = path.resolve(projectRoot, 'node_modules', importPath);
  if (fs.existsSync(nodeModulesPath)) return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
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
    for (const e of output.errors) {
      if (e.severity === 'error') { console.error(`❌ ${fileName}:`, e.formattedMessage); process.exit(1); }
    }
  }
  const contracts = {};
  for (const [name, data] of Object.entries(output.contracts[fileName])) {
    if (data.evm?.bytecode?.object) {
      contracts[name] = { abi: data.abi, bytecode: '0x' + data.evm.bytecode.object };
    }
  }
  return contracts;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();

  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error('Set DEPLOYER_PRIVATE_KEY in .env');
    process.exit(1);
  }
  const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const deployer = await signer.getAddress();
  const balance = await provider.getBalance(deployer);

  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  Redeploy: BonzaiMintPool + BonzaiSkillRegistry          ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝`);
  console.log(`  Network:  Base (${network.chainId})`);
  console.log(`  Deployer: ${deployer}`);
  console.log(`  Balance:  ${ethers.formatEther(balance)} ETH`);
  console.log(`  Mode:     ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // ─── Compile ───────────────────────────────────────────────
  console.log('\n═══ Compiling ═══');
  const mintPoolCompiled = compileContract('BonzaiMintPool.sol');
  console.log('  ✓ BonzaiMintPool.sol');
  const skillRegistryCompiled = compileContract('BonzaiSkillRegistry.sol');
  console.log('  ✓ BonzaiSkillRegistry.sol');

  let nonce = await provider.getTransactionCount(deployer, 'latest');

  async function deploy(name, { abi, bytecode }, args, label) {
    console.log(`\n━━━ Deploying ${label} ━━━`);
    console.log(`  Args: ${JSON.stringify(args, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would deploy`);
      return { address: '0x' + '0'.repeat(39) + '1', abi };
    }
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy(...args, { nonce: nonce++ });
    const receipt = await contract.deploymentTransaction().wait();
    console.log(`  ✓ Deployed: ${contract.target}`);
    console.log(`  ✓ Tx: ${receipt.hash} (gas: ${receipt.gasUsed})`);
    return { address: contract.target, abi };
  }

  async function wire(contractAddr, abi, method, args, label) {
    console.log(`  → ${label}`);
    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would call ${method}(${args.join(', ')})`);
      return;
    }
    const contract = new ethers.Contract(contractAddr, abi, signer);
    const tx = await contract[method](...args, { nonce: nonce++ });
    const receipt = await tx.wait();
    console.log(`    ✓ Tx: ${receipt.hash} (gas: ${receipt.gasUsed})`);
  }

  // ─── Deploy ────────────────────────────────────────────────
  console.log('\n═══ Deploying ═══');

  const mintPool = await deploy('BonzaiMintPool', mintPoolCompiled.BonzaiMintPool, [
    EXISTING.bonzaiToken,
    POOL_THRESHOLDS,
    EPOCH_DURATION,
    EXISTING.treasury,
  ], 'BonzaiMintPool (with unlock support)');

  const skillRegistry = await deploy('BonzaiSkillRegistry', skillRegistryCompiled.BonzaiSkillRegistry, [
    EXISTING.bonzaiToken,
    EXISTING.treasury,
    ethers.ZeroAddress, // skillOwnership set in wiring
    EXISTING.usdc,
  ], 'BonzaiSkillRegistry (with unlock support)');

  // ─── Wire ──────────────────────────────────────────────────
  console.log('\n═══ Wiring ═══');

  // MintPool wiring
  await wire(mintPool.address, mintPool.abi,
    'setCollectiblesFactory', [EXISTING.collectiblesFactory],
    'MintPool.setCollectiblesFactory');
  await wire(mintPool.address, mintPool.abi,
    'setRoyaltySplitter', [EXISTING.royaltySplitter],
    'MintPool.setRoyaltySplitter');
  await wire(mintPool.address, mintPool.abi,
    'setFeeHook', [EXISTING.hook],
    'MintPool.setFeeHook');
  await wire(mintPool.address, mintPool.abi,
    'setCompanionNFT', [EXISTING.companions],
    'MintPool.setCompanionNFT');
  await wire(mintPool.address, mintPool.abi,
    'setUnlockContract', [EXISTING.unlock],
    'MintPool.setUnlockContract');

  // SkillRegistry wiring
  await wire(skillRegistry.address, skillRegistry.abi,
    'setSkillOwnershipContract', [EXISTING.skillOwnership],
    'SkillRegistry.setSkillOwnershipContract');
  await wire(skillRegistry.address, skillRegistry.abi,
    'setUnlockContract', [EXISTING.unlock],
    'SkillRegistry.setUnlockContract');

  // Update SkillOwnership to point to new SkillRegistry
  const skillOwnershipAbi = [
    'function setSkillRegistry(address) external',
    'function setUsdcToken(address) external',
  ];
  await wire(EXISTING.skillOwnership, skillOwnershipAbi,
    'setSkillRegistry', [skillRegistry.address],
    'SkillOwnership.setSkillRegistry(new registry)');

  // ─── Summary ───────────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  REDEPLOYMENT COMPLETE                                   ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║  BonzaiMintPool:      ${mintPool.address} ║`);
  console.log(`║  BonzaiSkillRegistry: ${skillRegistry.address} ║`);
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  Update web3.config.js:                                  ║');
  console.log(`║    mintPool.contractAddress = '${mintPool.address}'      ║`);
  console.log(`║    skillRegistry.contractAddress = '${skillRegistry.address}' ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
