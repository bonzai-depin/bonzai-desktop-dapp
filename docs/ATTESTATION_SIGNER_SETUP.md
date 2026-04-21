# Attestation Signer — Setup & Rotation

The BonzAI skill-ownership flow uses an **EIP-191 attestation signer** to
gate on-chain registrations. When a user clicks "Register for Skill" in
BrowseAgents, the renderer:

1. Signs a message locally with the attestation signer key.
2. Passes the signature to `BonzaiSkillOwnership.registerCompanion()`.
3. The contract verifies the signature matches its configured
   `attestationSigner` address; otherwise it reverts with `InvalidAttestation`.

If the contract's `attestationSigner` doesn't match the key the renderer
derives, **every registration fails** — this doc walks through first-time
setup, verification, and rotation.

## How the local signer is resolved (renderer side)

`src/services/skillOwnership.service.js:getAttestationSigner()` tries each
source in order:

1. **OWS vault** wallet named `bonzai-attestation-signer`, unlocked with the
   passphrase at Electron store key `ows-passphrase-attestation`.
2. **Legacy** private key at Electron store key `bonzai-attestation-signer`.
3. **Derived** from the agent wallet master secret:
   `keccak256(masterSecret || "attestation-signer")`.
   On first derivation, the key is auto-migrated into the OWS vault (with a
   random passphrase) so subsequent runs use path 1.

All three paths produce a deterministic address per install. **Reown
(MetaMask) and Privy users both go through the same resolver** — the
attestation signer is independent of the user's primary wallet and lives in
the Electron-managed OWS vault on that specific device.

### Implication for multi-device users

Because the signer lives on-device, a user who installs BonzAI on a second
machine will derive a **different** attestation signer. Since only one
signer address is configured on-chain, one of the installs won't be able to
register. Options:

- **Option A**: designate one device as the "registration device" — all
  registration transactions happen from there.
- **Option B**: export the `bonzai-attestation-signer` OWS wallet from
  device 1, import into device 2's OWS vault with the same name + passphrase.
- **Option C** (future): move the attestation signer to a shared
  Anthropic-managed HSM, and have the renderer request signatures over a
  signed RPC.

Today Option A is simplest and documented.

## First-time deploy — syncing the signer to the contract

Right after deploying `BonzaiSkillOwnership`:

```bash
# 1. Inside the running app, open the debug console and run:
window.skillOwnershipService.getAttestationSignerAddress()
  .then(addr => console.log("Attestation signer:", addr));

# 2. Export the private key from the OWS vault:
#    Settings → Advanced → Export 'bonzai-attestation-signer'
#    (or read Electron store directly if still on legacy path)

# 3. Run the sync script with both keys in env:
export ATTESTATION_SIGNER_PK=0x<from step 2>
export DEPLOYER_PRIVATE_KEY=0x<the wallet that owns the contract>
export SKILL_OWNERSHIP_ADDRESS=0x<deployed address on Base>
node scripts/sync-attestation-signer.js
```

The script verifies the deployer is the owner, compares addresses, and
calls `setAttestationSigner()` only if they differ (idempotent).

## Runtime verification (inside the app)

Expose a one-liner in the admin panel:

```js
import { checkAttestationSignerState } from "./services/skillOwnership.service.js";

const state = await checkAttestationSignerState();
// { local: '0x...', onChain: '0x...', matches: boolean, ready: boolean }
```

If `state.ready === false`, the BrowseAgents registration button should
show a **"Signer not configured"** warning and link to this doc.

## Rotating the signer

When the local signer key rotates (wallet reset, OWS vault recreation):

1. New key is auto-derived on first registration attempt.
2. The old registration attestations remain valid (signatures don't depend
   on current state), but **new registrations will fail** until the
   contract is updated.
3. Run `scripts/sync-attestation-signer.js` again with the new key.

`syncAttestationSignerToContract()` can also be called from the app by the
contract owner (owner-gated on-chain).

## Security posture

- The attestation signer **does not hold funds** and can't make
  transactions itself — it only signs the registration payload.
- Compromise of the signer key lets an attacker forge registrations for
  companions they don't own. Deregistration is still gated by
  `msg.sender == ownerAddress` so they can't steal existing revenue, but
  they can register bogus companions to dilute the distribution pool.
- Store the private key in the OWS vault, not in plain Electron store.
  Legacy path is for migration only.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `InvalidAttestation` on every register | signer mismatch | run `syncAttestationSignerToContract()` |
| `AttestationExpired` | deadline in the past | check system clock; attestation deadline is 5 min |
| `NotNFTOwner` | registrant isn't the companion NFT owner | reconnect the correct wallet |
| `InvalidProfileScore` | category score < 5 | companion doesn't qualify for this skill's category |
| Signer address changes between sessions | OWS vault not initialized — fell through to legacy derivation then migrated | expected once; subsequent runs should be stable |
