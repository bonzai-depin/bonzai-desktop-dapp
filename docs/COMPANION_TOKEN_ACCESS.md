# Companion-token marketplace access

Marketplace skills are not purchased. Access is granted when the connected
wallet holds at least one whole token issued for any companion registered as a
co-owner of that skill.

The enforcement path is:

1. `BonzaiSkillOwnership` resolves every registered companion NFT through
   `CompanionTokenFactory.companionTokens(tokenId)`.
2. `hasTokenAccess(user, skillId)` checks those ERC-20 balances.
3. `BonzaiSkillRegistry.userHasAccess` exposes the result to clients.
4. `recordExecution` enforces the same rule on-chain.

The skill registry has no purchase ledger or purchase function. Skill execution
is free after access is established.

The default threshold is `1e18` units (one token) and can be changed by the
`BonzaiSkillOwnership` owner.

## Cold start

The bootstrap script mints each default companion, pins its portrait and
ERC-8004 registration to IPFS, derives a separate agent wallet, issues a named
companion token, creates its Uniswap V4 pool, and permanently locks the LP NFT.

It is dry-run by default:

```bash
BONZAI_COMPANIONS_ADDRESS=0x... \
BONZAI_COMPANION_TOKEN_FACTORY_ADDRESS=0x... \
npm run companions:cold-start -- --network robinhood
```

Execution is irreversible and requires a dedicated mnemonic plus Pinata:

```bash
EXECUTE=1 \
DEFAULT_COMPANION_MNEMONIC="..." \
PINATA_JWT="..." \
ATTESTATION_SIGNER_PRIVATE_KEY="..." \
BONZAI_COMPANIONS_ADDRESS=0x... \
BONZAI_COMPANION_TOKEN_FACTORY_ADDRESS=0x... \
BONZAI_SKILL_OWNERSHIP_ADDRESS=0x... \
VITE_BONZAI_SKILL_ID_MAP_JSON='{"robinhood-portfolio-council-v1.0.0":"0x..."}' \
npm run companions:cold-start -- --network robinhood
```

The script uses three derived NFT-owner wallets because the companion contract
caps ownership at four NFTs per wallet. Agent wallets use a separate HD branch.
Progress is written after every confirmed mint to
`deployments/default-companions.json`; reruns verify and skip completed entries.
The shared companion career roadmap determines which companion economies grant
access to each skill. The script refuses category assignments with a spending
profile score below five and writes the resulting token-address app config to
`deployments/default-companions.env`.
Never commit the mnemonic or generated deployment state if operational wallet
addresses are intended to remain private.
