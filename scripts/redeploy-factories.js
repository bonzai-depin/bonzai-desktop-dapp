/**
 * Redeploy CompanionTokenFactory + FineTuneTokenFactory using Hardhat artifacts.
 *
 * The original deploy script uses `solc` npm package directly, which produces
 * different bytecodes than Hardhat. This script uses Hardhat's compiled artifacts
 * so that `npx hardhat verify` works afterwards.
 *
 * Steps:
 *   1. Deploy new CompanionTokenFactory
 *   2. Deploy new FineTuneTokenFactory
 *   3. Deauthorize old factories on the hook
 *   4. Authorize new factories on the hook
 *   5. Wire: CompanionTokenFactory.setCompanionContract(companions)
 *   6. Wire: FineTuneTokenFactory.setContentContract(content)
 *   7. Update .deploy-state.json
 *
 * Usage:
 *   node scripts/redeploy-factories.js
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// ─── Config ────────────────────────────────────────────────────────────────

const POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Existing deployed contracts (not being redeployed)
const STATE_FILE = path.resolve(projectRoot, '.deploy-state.json');
const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

const HOOK_ADDR = state.BonzaiUniswapHook;
const COMPANIONS_ADDR = state.BonzaiCompanions;
const CONTENT_ADDR = state.BonzaiContent;
const OLD_COMPANION_FACTORY = state.CompanionTokenFactory;
const OLD_FINETUNE_FACTORY = state.FineTuneTokenFactory;

// ─── Load Hardhat artifacts ────────────────────────────────────────────────

function loadArtifact(contractName) {
  const artifactPath = path.resolve(
    projectRoot, 'artifacts', 'src', 'contracts',
    `${contractName}.sol`, `${contractName}.json`
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return { abi: artifact.abi, bytecode: artifact.bytecode };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL || 'https://base.llamarpc.com';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error('Set DEPLOYER_PRIVATE_KEY environment variable');
    process.exit(1);
  }

  const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const deployerAddr = await signer.getAddress();
  const balance = await provider.getBalance(deployerAddr);

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Redeploy Factories (Hardhat artifacts for verification)║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`  Deployer:  ${deployerAddr}`);
  console.log(`  Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log(`  Hook:      ${HOOK_ADDR}`);
  console.log(`  Old CompanionFactory: ${OLD_COMPANION_FACTORY}`);
  console.log(`  Old FineTuneFactory:  ${OLD_FINETUNE_FACTORY}`);

  // Init nonce
  let nonce = await provider.getTransactionCount(deployerAddr, 'latest');
  console.log(`  Nonce:     ${nonce}\n`);

  // Load artifacts
  const companionFactoryArtifact = loadArtifact('CompanionTokenFactory');
  const fineTuneFactoryArtifact = loadArtifact('FineTuneTokenFactory');
  const hookArtifact = loadArtifact('BonzaiUniswapHook');

  // ─── Deploy new CompanionTokenFactory ──────────────────────────────────
  console.log('━━━ Deploying new CompanionTokenFactory ━━━');
  const ctfFactory = new ethers.ContractFactory(
    companionFactoryArtifact.abi, companionFactoryArtifact.bytecode, signer
  );
  const newCTF = await ctfFactory.deploy(
    POOL_MANAGER, POSITION_MANAGER, PERMIT2, HOOK_ADDR,
    { nonce: nonce++ }
  );
  await newCTF.deploymentTransaction().wait();
  const newCTFAddr = await newCTF.getAddress();
  console.log(`  ✓ Deployed at: ${newCTFAddr}\n`);

  // ─── Deploy new FineTuneTokenFactory ───────────────────────────────────
  console.log('━━━ Deploying new FineTuneTokenFactory ━━━');
  const ftfFactory = new ethers.ContractFactory(
    fineTuneFactoryArtifact.abi, fineTuneFactoryArtifact.bytecode, signer
  );
  const newFTF = await ftfFactory.deploy(
    POOL_MANAGER, POSITION_MANAGER, PERMIT2, HOOK_ADDR,
    { nonce: nonce++ }
  );
  await newFTF.deploymentTransaction().wait();
  const newFTFAddr = await newFTF.getAddress();
  console.log(`  ✓ Deployed at: ${newFTFAddr}\n`);

  // ─── Rewire hook: deauth old, auth new ─────────────────────────────────
  console.log('━━━ Rewiring hook authorizations ━━━');
  const hook = new ethers.Contract(HOOK_ADDR, hookArtifact.abi, signer);

  console.log('  → Deauthorize old CompanionTokenFactory...');
  let tx = await hook.authorizeFactory(OLD_COMPANION_FACTORY, false, { nonce: nonce++ });
  await tx.wait();
  console.log('    ✓ Done');

  console.log('  → Deauthorize old FineTuneTokenFactory...');
  tx = await hook.authorizeFactory(OLD_FINETUNE_FACTORY, false, { nonce: nonce++ });
  await tx.wait();
  console.log('    ✓ Done');

  console.log('  → Authorize new CompanionTokenFactory...');
  tx = await hook.authorizeFactory(newCTFAddr, true, { nonce: nonce++ });
  await tx.wait();
  console.log('    ✓ Done');

  console.log('  → Authorize new FineTuneTokenFactory...');
  tx = await hook.authorizeFactory(newFTFAddr, true, { nonce: nonce++ });
  await tx.wait();
  console.log('    ✓ Done\n');

  // ─── Wire factories to NFT contracts ───────────────────────────────────
  console.log('━━━ Wiring factory contracts ━━━');

  console.log('  → CompanionTokenFactory.setCompanionContract(companions)...');
  const newCTFContract = new ethers.Contract(newCTFAddr, companionFactoryArtifact.abi, signer);
  tx = await newCTFContract.setCompanionContract(COMPANIONS_ADDR, { nonce: nonce++ });
  await tx.wait();
  console.log('    ✓ Done');

  console.log('  → FineTuneTokenFactory.setContentContract(content)...');
  const newFTFContract = new ethers.Contract(newFTFAddr, fineTuneFactoryArtifact.abi, signer);
  tx = await newFTFContract.setContentContract(CONTENT_ADDR, { nonce: nonce++ });
  await tx.wait();
  console.log('    ✓ Done\n');

  // ─── Update deploy state ──────────────────────────────────────────────
  state.CompanionTokenFactory = newCTFAddr;
  state.FineTuneTokenFactory = newFTFAddr;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log('━━━ Updated .deploy-state.json ━━━');

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                   REDEPLOYMENT COMPLETE                   ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║  CompanionTokenFactory: ${newCTFAddr} ║`);
  console.log(`║  FineTuneTokenFactory:  ${newFTFAddr} ║`);
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  Wiring:                                                  ║');
  console.log(`║    Hook: old factories deauthorized, new authorized       ║`);
  console.log(`║    CompanionFactory → Companions                          ║`);
  console.log(`║    FineTuneFactory  → Content                             ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\nNow verify with:');
  console.log(`  npx hardhat verify --network base ${newCTFAddr} "${POOL_MANAGER}" "${POSITION_MANAGER}" "${PERMIT2}" "${HOOK_ADDR}"`);
  console.log(`  npx hardhat verify --network base ${newFTFAddr} "${POOL_MANAGER}" "${POSITION_MANAGER}" "${PERMIT2}" "${HOOK_ADDR}"`);
}

main().catch((err) => {
  console.error('\n❌ Redeployment failed:', err);
  process.exit(1);
});
