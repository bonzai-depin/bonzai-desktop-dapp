# Protocol configuration and release verification

`config/protocol.env` is the public protocol configuration template. Its contract
addresses are intentionally blank. Never place signing keys, wallet mnemonics,
Hugging Face tokens, storage credentials or authenticated RPC URLs in this file.
Values starting with `VITE_` are included in the distributed desktop application.

## Local configuration

1. Copy `config/protocol.env` to the ignored `config/protocol.local.env`.
2. Populate addresses from the verified deployment manifest for the selected
   chain. Keep the stablecoin address explicit; do not substitute a token with a
   different symbol or decimals. The preflight expects USDC with six decimals.
3. Supply the registered skill IDs as a JSON object. Empty `{}` is a placeholder,
   not a valid production registration map.
4. Set the treasury, governance and service-time attestor addresses. These are
   public identities, not private keys. Merely setting these variables does not
   grant permissions or wire contracts; execute and verify the deployment's
   governance transactions separately.
5. Set `VITE_UNISWAP_V4_ROUTER_ABI_VERSION` to the verified deployed router encoding (`v1` or `v2`). `v2` adds per-hop `minHopPriceX36` to exact-output parameters; do not select it from a repository version guess.
6. Run `npm run web3:verify:offline`, then `npm run web3:verify`. The latter reads
   chain ID, deployed bytecode and cross-contract wiring; it does not deploy.
7. Build the application again after changing public protocol settings.

Vite, Hardhat and the verifier load the same file. Selected-chain addresses also
provide the `BONZAI_*_ADDRESS` inputs used by the deployment script. Conflicting
legacy environment values fail explicitly rather than silently choosing an
address. Remove obsolete values from `.env` or the calling environment.

For another supported chain, change the chain ID, RPC variable and every
chain-qualified address suffix together. Never reuse an address from another
network without checking bytecode and ownership on the target network.

## GitHub Actions

Use one repository **Actions variable**, `BONZAI_PROTOCOL_CONFIG_ENV`, containing
the complete filled dotenv file. macOS, Windows and Linux release workflows pass
it to the same build loader. The contents are public; this variable is not a
place for credentials.

With GitHub CLI authenticated to the correct repository:

```bash
gh variable set BONZAI_PROTOCOL_CONFIG_ENV --repo bonzai-depin/bonzai-desktop-dapp --body-file config/protocol.local.env
```

Alternatively, use Settings → Secrets and variables → Actions → Variables.
Remove conflicting old per-address repository secrets used by the release YAML,
including stale chain IDs and RPC overrides. Blank legacy values are ignored;
nonempty conflicting values deliberately stop the build. The aggregate variable
replaces local protocol files in CI, so the release never borrows addresses from
a developer's local deployment.

Rebuild all installers from the same commit and configuration. Updating the
GitHub variable alone does not update installers already distributed. Start with
build-only dispatches; publishing installers and deploying contracts are separate
actions.

## Private credentials: keep separate

Set credentials only for the jobs/services that need them:

- `DEPLOYER_PRIVATE_KEY`: deployment runner only, preferably a protected GitHub
  environment with required reviewers. Never provide it to renderer builds.
- `ETHERSCAN_API_KEY`: source verification where the selected explorer requires it.
- Skill-registration signer: follow `ATTESTATION_SIGNER_SETUP.md`. This signer is distinct from `BonzaiServiceTime.serviceTimeAttestor`. The latter requires an independently operated inference-verification service, not a client-supplied elapsed-time claim. Do not unpause provider rewards just because an address is filled.
- Public user storage: each user configures Pinata in Ownership → Web3 Guide → Decentralized Storage. Do not add Pinata JWTs or API secrets to GitHub renderer variables. Desktop encrypts these locally; Web uses tab memory.
- Model downloads: `HF_TOKEN`, where repository access requires it.
- Release storage: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; public release
  settings remain `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_URL`.
- Platform signing/notarization: retain the existing names documented in
  `DESKTOP_RELEASES.md`. These do not belong in protocol configuration.

Remove old `VITE_PINATA_*` entries from environment files and GitHub build settings; builds reject them. Operational companion provisioning scripts use private `PINATA_JWT` only. Rotate an old key if it was included in a distributed build.

Do not put credentials in `VITE_*` variables. An authenticated RPC URL bundled
into an application exposes its embedded API credentials to every recipient.

## Verification boundaries

The configuration template and passing contract unit tests do not certify a
production launch. Keep provider claims paused until independent receipt
verification is operational. Stablecoin workflow checkout now quotes an exact output, caps USDC spend, uses bounded Permit2 allowances and funds escrow separately after the swap. It still requires a funded acceptance run against the actual configured router, USDC and agent pool. If escrow funding fails, purchased agent tokens remain in the customer wallet.

Recovery views support onchain route/job discovery, alternate payout wallets, expired jobs, mutual settlement and appointed arbitration. Verify these on every packaged wallet implementation. Unsupported training modalities remain separate implementation gates; address configuration alone does not implement them.

The ordinary `npm test` command runs only contract suites; Node service tests
remain separate (`npm run test:web3`). Run with a Hardhat-supported Node version
(Node 22 LTS is recommended). Before deployment, check deployed runtime bytecode
sizes under the target chain's actual limits; unlimited-size local test networks
are not evidence of deployability.
