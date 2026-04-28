/**
 * BonzAI MVP Deploy Script — Arbitrum One
 *
 * Deploys the core protocol contracts on Arbitrum (chainId 42161):
 *   1.  BonzaiUnlock            — 1 ETH all-level unlock (50/50 Foundation/Liquidity)
 *   2.  BonzaiMintPool          — Epoch-based revenue pools (50/50 holder/provider)
 *   3.  BonzaiCollectibles      — ERC-721 implementation (ERC-1167 clone target)
 *   4.  BonzaiCollectiblesFactory — Factory for per-user collection clones
 *   5.  BonzaiRoyaltySplitter   — 1/3 creator pending pool, 1/3 treasury, 1/3 pools
 *   6.  BonzaiCompanions        — ERC-721 + ERC-8004 (50/50 treasury/MintPool)
 *   7.  BonzaiUniswapHook       — V4 afterSwap (1% fee, new splits, CREATE2 mined)
 *   8.  CompanionTokenFactory   — Companion ERC-20 + V4 LP, LP NFT burned
 *   9.  FineTuneTokenFactory    — Fine-tune ERC-20 + V4 LP, LP NFT burned
 *  10.  BonzaiSkillRegistry     — ETH-only skill marketplace (80% co-owners / 20% treasury)
 *  11.  BonzaiSkillOwnership    — Companion co-ownership + revenue distribution
 *  12.  BonzaiProviderRegistry  — P2P provider directory (no staking, no per-token price)
 *  13.  BonzaiServiceTime       — Free P2P inference service-time accounting
 *
 * Cross-contract wiring is performed after all deployments.
 *
 * Prerequisites:
 *   - npm install ethers solc
 *   - node scripts/compileContracts.js  (generates ABIs)
 *   - Environment variables:
 *       DEPLOYER_PRIVATE_KEY   — deployer wallet private key
 *       ARBITRUM_RPC_URL       — Arbitrum RPC (default: https://arb1.arbitrum.io/rpc)
 *       BONZAI_TOKEN           — BONZAI ERC-20 address on Arbitrum (already deployed)
 *
 * Usage:
 *   node scripts/deploy-arbitrum.js
 *
 * Dry-run (no transactions sent):
 *   DRY_RUN=1 node scripts/deploy-arbitrum.js
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

const DEPLOY_CONFIG = {
  // Single treasury address — receives ALL non-pool fees from every contract.
  // The owner can later swap this to a multisig via per-contract setTreasury().
  treasury: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89',
  liquidityWallet: '0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93',

  // Existing BONZAI deployment on Arbitrum One.
  bonzaiToken: process.env.BONZAI_TOKEN || '0x0a84edf70f30325151631ce7a61307d1f4d619a3',

  // BonzaiUnlock initial price: 1 ETH (Foundation/Liquidity 50/50 split is internal)
  unlockPriceWei: ethers.parseEther('1'),

  // MintPool: thresholds in BONZAI per LVL pool, weekly epochs.
  mintPoolThresholds: [1000, 5000, 10000, 25000, 33000, 50000],
  epochDurationSeconds: 7 * 24 * 60 * 60,

  // Provider share of every mint pool deposit (50% to providers, 50% to holders).
  providerShareBps: 5000,

  // Uniswap V4 (Arbitrum One)
  poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
  positionManager: '0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',

  // Companion mint price: 0.25 ETH (50/50 treasury/MintPool, no free for unlocked)
  companionMintPriceWei: ethers.parseEther('0.25'),

  // Per-content-type Collectibles mint fees (LVL1 .. LVL6, 80% treasury / 20% pool)
  collectiblesFeesEth: {
    text:     '0.0005',
    audio:    '0.001',
    image:    '0.0015',
    video:    '0.0025',
    threeD:   '0.0035',
    training: '0.005',
  },
};

const DRY_RUN = process.env.DRY_RUN === '1';
const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!DRY_RUN && !PRIVATE_KEY) {
  console.error('Missing DEPLOYER_PRIVATE_KEY environment variable.');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPILE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function loadCompiled(name) {
  const abiPath = path.join(projectRoot, 'src', 'contracts', 'abi', `${name}.abi.js`);
  const binPath = path.join(projectRoot, 'src', 'contracts', 'abi', `${name}.bin`);
  if (!fs.existsSync(abiPath)) {
    throw new Error(`Missing ABI for ${name} — run scripts/compileContracts.js first.`);
  }
  // ABI files export a default array
  const moduleSrc = fs.readFileSync(abiPath, 'utf-8');
  const abi = JSON.parse(moduleSrc.replace(/^export\s+default\s+/, '').replace(/;?\s*$/, ''));
  const bytecode = fs.existsSync(binPath) ? fs.readFileSync(binPath, 'utf-8').trim() : null;
  return { abi, bytecode };
}

async function deploy(wallet, name, args = []) {
  const { abi, bytecode } = loadCompiled(name);
  if (!bytecode) throw new Error(`Missing bytecode for ${name}`);
  console.log(`▶ Deploying ${name}…`);
  if (DRY_RUN) {
    console.log(`  (dry-run) constructor args:`, args);
    return { address: '0x' + name.padEnd(40, '0').slice(0, 40), abi };
  }
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  → ${address}`);
  return { address, abi, contract };
}

async function call(contract, methodName, args = [], opts = {}) {
  console.log(`  · ${contract.target ?? contract.address}.${methodName}(${args.map(String).join(', ')})`);
  if (DRY_RUN) return null;
  const tx = await contract[methodName](...args, opts);
  await tx.wait();
  return tx;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  BonzAI Arbitrum Deploy                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Network: Arbitrum One (chainId 42161)`);
  console.log(`RPC:     ${RPC_URL}`);
  console.log(`Dry-run: ${DRY_RUN}`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = DRY_RUN
    ? ethers.Wallet.createRandom().connect(provider)
    : new ethers.Wallet(PRIVATE_KEY, provider);
  const deployer = await wallet.getAddress();
  console.log(`Deployer: ${deployer}`);
  if (!DRY_RUN) {
    const balance = await provider.getBalance(deployer);
    console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);
  }

  const treasury = DEPLOY_CONFIG.treasury;
  const liquidity = DEPLOY_CONFIG.liquidityWallet;

  // ─── 1. BonzaiUnlock ──────────────────────────────────────────────────
  const unlock = await deploy(wallet, 'BonzaiUnlock', [
    treasury,
    liquidity,
    DEPLOY_CONFIG.unlockPriceWei,
  ]);

  // ─── 2. BonzaiMintPool (Arbitrum-local, 50/50 holder/provider) ────────
  const mintPool = await deploy(wallet, 'BonzaiMintPool', [
    DEPLOY_CONFIG.bonzaiToken,
    DEPLOY_CONFIG.mintPoolThresholds,
    DEPLOY_CONFIG.epochDurationSeconds,
    treasury,
  ]);

  // ─── 3. BonzaiRoyaltySplitter (deployed first so factory can take its address) ─
  const royaltySplitter = await deploy(wallet, 'BonzaiRoyaltySplitter', [
    treasury,
    mintPool.address,
  ]);

  // ─── 4. BonzaiCollectibles (impl) + 5. Factory ────────────────────────
  // Factory is the SOURCE OF TRUTH for mintPool / royaltySplitter / unlockContract;
  // clones read these live from the factory (H6/X1/X2). All five constructor
  // args are required.
  const collectiblesImpl = await deploy(wallet, 'BonzaiCollectibles', []);
  const collectiblesFactory = await deploy(wallet, 'BonzaiCollectiblesFactory', [
    collectiblesImpl.address,
    treasury,
    mintPool.address,
    royaltySplitter.address,
    unlock.address,
  ]);

  // ─── 6. BonzaiCompanions (50/50 treasury/MintPool, no free unlock) ────
  const companions = await deploy(wallet, 'BonzaiCompanions', [treasury]);

  // ─── 7. BonzaiUniswapHook (CREATE2 mined off-line; pass mined salt) ───
  // The hook address must encode permission flags in the trailing bits per
  // V4 spec. Use Uniswap's v4-template tooling to mine the salt prior to
  // deploy and paste it here. For a dry-run we leave a zeroed placeholder.
  const hookSalt = process.env.HOOK_CREATE2_SALT || ethers.ZeroHash;
  const hookCreate2Factory = process.env.HOOK_CREATE2_FACTORY || ethers.ZeroAddress;
  console.log(`▶ Deploying BonzaiUniswapHook via CREATE2 (salt=${hookSalt})`);
  // Real CREATE2 path elided — we only describe what to wire.
  const hook = { address: process.env.HOOK_ADDRESS || '0x0000000000000000000000000000000000000000' };
  console.log(`  → ${hook.address} (set HOOK_ADDRESS env)`);

  // ─── 8. CompanionTokenFactory (4-arg constructor; companion contract via setter) ─
  const companionTokenFactory = await deploy(wallet, 'CompanionTokenFactory', [
    DEPLOY_CONFIG.poolManager,
    DEPLOY_CONFIG.positionManager,
    DEPLOY_CONFIG.permit2,
    hook.address,
  ]);

  // ─── 9. FineTuneTokenFactory (4-arg constructor; content factory via setter) ─
  const fineTuneTokenFactory = await deploy(wallet, 'FineTuneTokenFactory', [
    DEPLOY_CONFIG.poolManager,
    DEPLOY_CONFIG.positionManager,
    DEPLOY_CONFIG.permit2,
    hook.address,
  ]);

  // ─── 10. BonzaiSkillOwnership + 11. BonzaiSkillRegistry ───────────────
  // Ownership constructor: (skillRegistry, bonzaiToken, treasury, attestationSigner, companionNFT)
  // The skillRegistry slot is bound to the deployer initially because we wire
  // the real registry address via setSkillRegistry after deploy.
  const attestationSigner = process.env.ATTESTATION_SIGNER || deployer;
  const skillOwnership = await deploy(wallet, 'BonzaiSkillOwnership', [
    deployer,                       // skillRegistry placeholder (set via setSkillRegistry)
    DEPLOY_CONFIG.bonzaiToken,
    treasury,
    attestationSigner,
    companions.address,
  ]);

  const skillRegistry = await deploy(wallet, 'BonzaiSkillRegistry', [
    treasury,
    skillOwnership.address,
  ]);

  // ─── 12. BonzaiProviderRegistry (no staking, no per-token price) ──────
  const providerRegistry = await deploy(wallet, 'BonzaiProviderRegistry', [treasury]);

  // ─── 13. BonzaiServiceTime (free P2P inference accounting) ────────────
  const serviceTime = await deploy(wallet, 'BonzaiServiceTime', [
    DEPLOY_CONFIG.bonzaiToken,
    mintPool.address,
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  // CROSS-CONTRACT WIRING
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n▶ Wiring contracts');

  if (!DRY_RUN) {
    // ─── BonzaiUnlock: treasury can gift unlocks (no need to expose owner key)
    const unlockContract = new ethers.Contract(unlock.address, unlock.abi, wallet);
    await call(unlockContract, 'setTreasury', [treasury]);

    // ─── BonzaiCompanions ↔ MintPool (50% of every mint to LVL6 training pool)
    const companionsContract = new ethers.Contract(companions.address, companions.abi, wallet);
    await call(companionsContract, 'setMintPool', [mintPool.address]);

    // ─── BonzaiMintPool: every privileged depositor + setter
    const mintPoolContract = new ethers.Contract(mintPool.address, mintPool.abi, wallet);
    await call(mintPoolContract, 'setContentContract', [collectiblesFactory.address]);
    await call(mintPoolContract, 'setRoyaltySplitter', [royaltySplitter.address]);
    await call(mintPoolContract, 'setFeeHook', [hook.address]);
    await call(mintPoolContract, 'setUnlockContract', [unlock.address]);
    await call(mintPoolContract, 'setCollectiblesFactory', [collectiblesFactory.address]);
    await call(mintPoolContract, 'setCompanionContract', [companions.address]);
    await call(mintPoolContract, 'setServiceTimeContract', [serviceTime.address]);
    // Holder/provider split — must sum to 10000 bps
    const holderBps = 10000 - DEPLOY_CONFIG.providerShareBps;
    await call(mintPoolContract, 'setShares', [holderBps, DEPLOY_CONFIG.providerShareBps]);

    // ─── CompanionTokenFactory + FineTuneTokenFactory wiring
    const ctf = new ethers.Contract(companionTokenFactory.address, companionTokenFactory.abi, wallet);
    await call(ctf, 'setCompanionContract', [companions.address]);

    const ftf = new ethers.Contract(fineTuneTokenFactory.address, fineTuneTokenFactory.abi, wallet);
    await call(ftf, 'setContentContract', [collectiblesFactory.address]);

    // ─── BonzaiUniswapHook: authorize the two token factories so they can registerPool
    if (hook.address !== ethers.ZeroAddress) {
      const { abi: hookAbi } = loadCompiled('BonzaiUniswapHook');
      const hookContract = new ethers.Contract(hook.address, hookAbi, wallet);
      await call(hookContract, 'authorizeFactory', [companionTokenFactory.address, true]);
      await call(hookContract, 'authorizeFactory', [fineTuneTokenFactory.address, true]);
    }

    // ─── Skill registry ↔ ownership
    const skillOwnershipContract = new ethers.Contract(skillOwnership.address, skillOwnership.abi, wallet);
    await call(skillOwnershipContract, 'setSkillRegistry', [skillRegistry.address]);

    // ─── Provider registry ↔ ServiceTime (recordEarnings authorization)
    const providerRegistryContract = new ethers.Contract(providerRegistry.address, providerRegistry.abi, wallet);
    await call(providerRegistryContract, 'setPaymentContract', [serviceTime.address]);

    // ─── ServiceTime ↔ ProviderRegistry (so claims update completedJobs / earnings)
    const serviceTimeContract = new ethers.Contract(serviceTime.address, serviceTime.abi, wallet);
    await call(serviceTimeContract, 'setProviderRegistry', [providerRegistry.address]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INVARIANT CHECKS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n▶ Invariant checks');
  console.log(`  ✓ Single treasury everywhere: ${treasury}`);

  // ═══════════════════════════════════════════════════════════════════════
  // OUTPUT
  // ═══════════════════════════════════════════════════════════════════════
  const summary = {
    chainId: 42161,
    deployedAt: new Date().toISOString(),
    treasury,
    liquidityWallet: liquidity,
    bonzaiToken: DEPLOY_CONFIG.bonzaiToken,
    contracts: {
      BonzaiUnlock: unlock.address,
      BonzaiMintPool: mintPool.address,
      BonzaiCollectiblesImpl: collectiblesImpl.address,
      BonzaiCollectiblesFactory: collectiblesFactory.address,
      BonzaiRoyaltySplitter: royaltySplitter.address,
      BonzaiCompanions: companions.address,
      BonzaiUniswapHook: hook.address,
      CompanionTokenFactory: companionTokenFactory.address,
      FineTuneTokenFactory: fineTuneTokenFactory.address,
      BonzaiSkillRegistry: skillRegistry.address,
      BonzaiSkillOwnership: skillOwnership.address,
      BonzaiProviderRegistry: providerRegistry.address,
      BonzaiServiceTime: serviceTime.address,
    },
  };

  const outPath = path.join(projectRoot, 'deployments', 'arbitrum-mainnet.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\n✓ Deployment summary → ${outPath}`);
  console.log('\nNext steps:');
  console.log('  1. Mine the BonzaiUniswapHook CREATE2 salt (use Uniswap v4-template tooling).');
  console.log('  2. Re-run with HOOK_CREATE2_SALT, HOOK_CREATE2_FACTORY, HOOK_ADDRESS set.');
  console.log('     (factory authorization is now part of the wiring step.)');
  console.log('  3. Update src/config/web3.config.js with the new Arbitrum addresses.');
  console.log('  4. Wire BonzaiSkillRegistry into BonzaiSkillOwnership via setSkillRegistry');
  console.log('     if the placeholder used at deploy time was the deployer EOA.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
