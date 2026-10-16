# Desktop release builds

The three workflows in `.github/workflows/` build macOS ARM64, Windows x64,
and Linux x64 (separate CUDA and ROCm installers). They all use `diffuser.spec`
to package an onedir Python runtime and run `--bonzai-runtime-check` against
that executable before assembling the desktop application. This checks imports,
CPU tensor and torchvision native operations, and bundled ffmpeg, without downloading model weights.
The same check runs from source before packaging to distinguish dependency failures
from missing frozen libraries. `scripts/pyinstaller-hooks/hook-torchvision.py`
collects the dynamically loaded operators, including nightly `_C_stable` libraries.
Native GPU generation still requires hardware validation.

## Validate without publishing

Dispatch each release workflow with `tag` set to an existing branch, full 40-character commit SHA or tag
and `publish` left false. Use `git rev-parse HEAD` for a commit: checkout treats
abbreviated hashes as branch/tag names and cannot fetch them. The checkout uses that exact ref; installer version is
read from `package.json`. Results are retained as Actions artifacts for seven days.
macOS validation builds are unsigned and are not notarized. Windows installers
are currently unsigned. Linux packages require an appropriate GPU driver for
acceleration; CPU fallback remains available.

Treat Actions as the final validation loop. Record the full commit and run IDs,
read each failed job's logs, correct the cause and dispatch the updated commit.
Continue until all four platform/backend jobs pass for that same commit, including
installer creation and artifact upload. Do not disable smoke tests to get a green
run. Report build validation separately from signing, notarization and publication.

## Publish

Create/publish a release whose tag (with an optional `v` prefix) matches
`package.json`, or dispatch with that tag and `publish: true`. Never move a tag
just to rebuild. The exact tag is preserved when uploading, including its prefix.
The macOS publication path requires the existing Apple application/installer
certificates, keychain password and notarization credentials. Publication fails
if deep signature verification or Apple acceptance fails.

`RELEASES_PAT` optionally mirrors assets to `bonzai-depin/bonzai-releases`.
Uploads preserve other platforms' assets; no workflow deletes a release.
Pinata credentials and the Privy application secret are not injected into
release bundles. Users configure private credentials locally.

The Linux privacy bridge check runs after Node dependencies are installed and uses
the Python interpreter selected by Actions. It exchanges a tensor over a local
Python/Node socket and fails if either process exits or the exchange times out.

## Asset size and integrity

GitHub limits each release asset to less than 2 GiB. Do not delete PyTorch,
CUDA, ROCm, licenses or locales to meet that limit. Linux installers use xz
compression when required. Windows Inno Setup uses 1.9 GB payload slices.
`scripts/release-assets.py prepare` splits any remaining oversized installer
into bounded parts, verifies that reassembly preserves its SHA-256, and writes
checksums plus reconstruction instructions. Download every part and verify the
reconstructed installer before installing. The split files are transport parts,
not independently installable packages. All checksums must travel with the files.

Commands:

```sh
python scripts/release-assets.py prepare out/make
python scripts/release-assets.py upload out/make --tag v4.0.0-rc.1 --repo OWNER/REPO
```

The uploader deliberately propagates upload failures. A successful source build
or workflow lint is not proof that native installers passed: inspect all four
jobs and their frozen-runtime checks before distributing a release.

Set repository variable `BONZAI_VALIDATE_WEB3=true` only for releases configured
with the complete deployed economy contracts. This enables the strict offline
Web3 preflight. Local inference builds do not require onchain addresses.
