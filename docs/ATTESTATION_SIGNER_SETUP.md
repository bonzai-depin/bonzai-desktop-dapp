# Attestation Signer Operations

`BonzaiSkillOwnership` verifies EIP-191 attestations before registering a companion as a skill owner. The configured signer is protocol infrastructure: it must be controlled consistently and must match the address stored by the deployed contract.

## Cold-start execution

The default-companion cold-start script requires the signer private key only in execute mode:

```bash
export ATTESTATION_SIGNER_PRIVATE_KEY=0x...
npm run companions:cold-start -- --network <configured-network> --execute
```

The script checks that the private key resolves to `BonzaiSkillOwnership.attestationSigner()` before minting or registering anything. Keep this key out of `.env` files, shell history, logs, and source control; inject it through the deployment secret manager.

## Synchronizing an existing deployment

The owner can synchronize a signer address with the idempotent script:

```bash
export ATTESTATION_SIGNER_PK=0x...
export DEPLOYER_PRIVATE_KEY=0x...
export SKILL_OWNERSHIP_ADDRESS=0x...
export RPC_URL=https://...
node scripts/sync-attestation-signer.js
```

The script verifies contract ownership, compares the current address, and calls `setAttestationSigner` only when necessary. Confirm the target network and contract address before approving the transaction.

## Rotation

1. Generate the replacement key in the deployment secret manager.
2. Derive and independently verify its public address.
3. Run `scripts/sync-attestation-signer.js` as the contract owner.
4. Confirm `attestationSigner()` on the target chain.
5. Run a registration test with a short deadline.
6. Revoke access to the previous secret after verification.

Existing registrations remain recorded; new attestations must be signed by the newly configured key.

## Security properties

- The signer does not need transaction funds.
- A compromised signer can forge registration attestations and distort skill ownership or revenue allocation.
- The signer must not be derived independently on each end-user device for production protocol operations.
- Registration payloads must bind the companion, owner, spending profile, target contract, chain, and deadline as implemented by the contract.
- Monitor signer changes and failed attestation events as security-relevant activity.
