# Media Mint pipeline

The generation history record is the source of the file, model and parameters. Never substitute the active model or viewer scene when minting an older record.

- `recordedMintGeneration` retains recorded parameters (including a zero seed), provenance, licenses, dependencies and media-specific details.
- `MintModal` decodes the selected bytes for preview, reports loading failures, and uses the production ThreeViewer for 3D. Training assets are labelled as manifests, not model-weight uploads.
- `mintLicenseStatus` is shared by the dialog and upload service. Non-commercial flags/licenses block publication. Unverified model rights and unverified LoRA/source rights also block rather than silently granting permission. The model catalog resolves supported legacy identifiers; unknown historical records require provenance restoration or regeneration. This is a conservative product gate, not a legal certification of an asset's rights.
- `mintContent` validates before storage and wallet operations. Text is always UTF-8, never guessed to be base64. Metadata attaches the original MIME type and immutable file URI. 3D export rebuilds the selected source, uploads GLB and source, and provides a GLB-based public viewer. Runtime JavaScript, physics and postprocessing require BonzAI; they are not promised as GLB features.
- Public uploads include generation metadata and prompt. Training reuse is opt-in. Discoverability metadata does not itself create a marketplace sale listing.
- Wallet confirmation uses the contract fee. If a submitted transaction cannot be confirmed, the dialog blocks blind retry and directs the user to the wallet/explorer. A failure to update local history after confirmation is a warning, not a failed mint. The receipt remains visible until Done.
- Smart-agent portrait generation records provenance, which is checked before personalizing a minted slot. Legacy portraits without verified provenance must be regenerated before publishing.

## Verification

`node --test test/mint-validation.test.mjs test/glb-mint.test.mjs`

With a local renderer on `BONZAI_UI_URL`: `node --test test/mint-dialog.browser.test.mjs test/glb-export.browser.test.mjs`.

Fixtures cover license rejection before uploads, all six media payload types, retained metadata, image/audio/video/text/3D previews, and GLB export. These checks do not submit real transactions, validate live IPFS availability or establish third-party marketplace indexing. Those require a configured deployment, storage credentials and an explicitly approved transaction.
