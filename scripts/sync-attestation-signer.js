/**
 * Sync the local attestation signer address to BonzaiSkillOwnership.
 *
 * Run this once after deploying BonzaiSkillOwnership, and again any time the
 * local signer key rotates (e.g., after wallet reset). The script:
 *
 *   1. Loads or derives the local attestation signer (same logic as the
 *      renderer: OWS vault → legacy Electron store key → derive from
 *      agent wallet master secret).
 *   2. Reads the contract's current `attestationSigner()`.
 *   3. If they don't match, calls `setAttestationSigner(localAddress)`
 *      from the deployer/owner wallet.
 *
 * Usage:
 *   ATTESTATION_SIGNER_PK=0x...   (the key the renderer derives / stores)
 *   DEPLOYER_PRIVATE_KEY=0x...    (the contract owner's key)
 *   node scripts/sync-attestation-signer.js
 *
 * Idempotent — safe to run repeatedly.
 */

import { ethers } from "ethers";
import "dotenv/config";

const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const OWNERSHIP_ADDR = process.env.SKILL_OWNERSHIP_ADDRESS;

if (!OWNERSHIP_ADDR) {
  throw new Error("Set SKILL_OWNERSHIP_ADDRESS in env to the deployed BonzaiSkillOwnership address on Base");
}

const ABI = [
  "function attestationSigner() view returns (address)",
  "function setAttestationSigner(address signer) external",
  "function owner() view returns (address)",
];

async function resolveLocalAttestationSigner() {
  const directKey = process.env.ATTESTATION_SIGNER_PK;
  if (directKey) {
    return new ethers.Wallet(directKey);
  }
  throw new Error(
    "ATTESTATION_SIGNER_PK not set. Read it from the renderer:\n" +
    "  - OWS users: exported from the OWS vault wallet 'bonzai-attestation-signer'\n" +
    "  - Legacy: Electron store key 'bonzai-attestation-signer'\n" +
    "Run `node scripts/print-attestation-signer.js` first to see the expected address."
  );
}

async function main() {
  const ownerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!ownerKey) throw new Error("Set DEPLOYER_PRIVATE_KEY (contract owner)");

  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const ownerWallet = new ethers.Wallet(ownerKey, provider);

  const contract = new ethers.Contract(OWNERSHIP_ADDR, ABI, ownerWallet);

  const onChainOwner = await contract.owner();
  if (onChainOwner.toLowerCase() !== ownerWallet.address.toLowerCase()) {
    throw new Error(
      `Signer ${ownerWallet.address} is not the contract owner (${onChainOwner}). ` +
      `Use the deployer key that owns BonzaiSkillOwnership.`
    );
  }

  const localSigner = await resolveLocalAttestationSigner();
  const onChainSigner = await contract.attestationSigner();

  console.log("Local attestation signer :", localSigner.address);
  console.log("On-chain attestation     :", onChainSigner);

  if (onChainSigner.toLowerCase() === localSigner.address.toLowerCase()) {
    console.log("✔ Already in sync. Nothing to do.");
    return;
  }

  console.log("→ Updating on-chain signer...");
  const tx = await contract.setAttestationSigner(localSigner.address);
  console.log("  tx:", tx.hash);
  await tx.wait();
  console.log("✔ Done.");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
