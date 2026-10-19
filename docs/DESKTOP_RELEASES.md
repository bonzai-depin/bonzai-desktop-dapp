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

CI pins llama.cpp with `LLAMA_CPP_REF`. Its renamed `ggml-rpc-server` target is
packaged as `rpc-server`, preserving the application's runtime paths. BonzAI
provides the user interface and HTTPS downloads, so the embedded llama.cpp web
UI and OpenSSL integration are disabled. macOS also avoids Homebrew libomp;
the shipped native runtime must not require a developer's Homebrew installation.
Windows and Linux GGUF inference use Vulkan for NVIDIA, AMD and Intel GPUs
(and retain CPU fallback); the Linux CUDA/ROCm installer variants select the
Python multimodal backend. Windows Python inference includes CUDA.
CI requires the Vulkan toolchain explicitly rather than silently emitting a
CPU-only GGUF runtime when a GPU compiler is missing. Local builds retain
automatic CUDA/HIP/Vulkan selection, overridable with `BONZAI_LLAMA_BACKEND`.
Windows CI installs the pinned official Vulkan SDK and builds dynamically loaded
GPU backends. All native DLLs are packaged alongside the executables; a missing
GPU driver does not prevent CPU startup. CI checks the requested CMake capabilities,
the DLL set, standalone startup with no SDK on PATH, and fallback with the GPU
plugin removed. It repeats those checks in the packaged app and after a silent
installation of the actual setup executable. The installed Python runtime is
also smoke-tested. The native build cache includes its CMake configuration, so
a cached CPU build cannot satisfy a GPU build request. Compatible vendor GPU
drivers are required on the test machine; the development SDK is not.

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
compression directly. After frozen-runtime validation, the Linux runner removes
its build-time Python packages and tests the standalone executable again. It
moves that complete runtime into the app rather than making another GPU-library
copy. The renderer build verifies every material map against the catalogue before
excluding duplicate source JPGs from installers; compiled textures and source
attribution remain included. Windows Inno Setup emits a single EXE with LZMA2 compression.
Linux CI is pinned to Ubuntu 24.04. It removes unrelated preinstalled runtimes
and download caches before freezing, then discards native compiler intermediates
before installer staging to stay within the hosted runner's disk capacity.
`scripts/prune-desktop-payload.py` removes package-root test fixtures, source maps,
and other platforms' FFmpeg executables from the staged app. Runtime code and
native GPU libraries are retained. `scripts/release-assets.py prepare` preserves
complete DMG / EXE / DEB installers and writes SHA-256 files. It rejects split
payloads: users must never reconstruct an installer.

Complete installers are hosted on Cloudflare R2, without GitHub's per-file limit.
Configure repository secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` and
variables `R2_ENDPOINT` (S3 HTTPS endpoint), `R2_BUCKET`, and `R2_PUBLIC_URL`
(public HTTPS bucket/custom domain). The existing `R2_ACCESS_KEY` secret is also accepted; endpoint, bucket and public URL may be stored as secrets instead of variables. Scope credentials to the release bucket.
Run **Verify release hosting** to test upload, public download, byte integrity and cleanup with a small temporary object.
The uploader verifies public file length, publishes checksums and download
manifests to GitHub, and adds direct installer links to the release notes.
Build-only runs require no R2 credentials and retain complete installers in
Actions artifacts. Download the artifact ZIP and extract the installer normally;
there are no `.part` files or installer sidecars.

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

## Restoring repository settings

| Purpose | Secrets | Needed for |
| --- | --- | --- |
| Model access | `HF_TOKEN` | Gated/private Hugging Face downloads, never embedded in installers |
| R2 storage | `R2_ACCESS_KEY_ID` (or `R2_ACCESS_KEY`), `R2_SECRET_ACCESS_KEY` | Uploading complete installers |
| Mac signing | `MAC_APP_CERT_BASE64`, `MAC_APP_CERT_PASSWORD`, `KEYCHAIN_PASSWORD` | Developer ID Application signing |
| Mac notarization | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Apple notarization on published builds |
| Release mirror | `RELEASES_PAT` | Optional cross-repository mirror |

GitHub provides `GITHUB_TOKEN` automatically. A Developer ID Installer certificate
is not needed for DMG releases. Windows signing is not configured in these workflows;
restoring Apple credentials does not sign Windows executables.

`PRIVY_APP_ID`, `ALCHEMY_API_KEY`, `ROBINHOOD_RPC_URL`, the `BONZAI_*` deployment
addresses/chain/skill map and `UNISWAP_V4_*` deployment addresses configure the
optional economy. Existing workflows read these from repository secrets for
compatibility; addresses and app IDs are public configuration, not private keys.
Never add a wallet private key, seed phrase or Privy app secret to the desktop build.
Use `BONZAI_VALIDATE_WEB3=true` only after the complete deployment is configured.
The shared `config/protocol.env` template and aggregate GitHub variable
`BONZAI_PROTOCOL_CONFIG_ENV` now provide the full configuration, including newer
agent contracts missing from legacy per-secret mappings. See
[Protocol configuration](PROTOCOL_CONFIGURATION.md); remove conflicting old values.

## Standalone model hosting

Standalone weights are served from the same public bucket under `models/`.
`src/server/r2_models.py` records lowercase names, exact sizes and SHA-256 hashes.
The regular download preflight includes the configured Wan/Klein adapters and H3
adapter; inactive archived adapters are not enabled. A `model:<filename>` download
plan downloads an individual catalog entry without activating it.

For local uploads, `Prepare local model upload` accepts a JSON manifest containing
names, sizes and SHA-256 hashes. It issues six-hour, object-scoped multipart links
in a private Actions artifact; bucket credentials remain in Actions. Existing
objects with different hashes are rejected. Download the artifact to an ignored
local directory and run `scripts/upload-local-models.py --directory <directory>
--model-dir <model-folder>` alongside its `inventory.json` (including the original
`source_name`). Transfers verify each part with Content-MD5 and the complete local
SHA-256 before completion, then verify public HEAD size. Delete the temporary
Actions artifact after use; never commit or share its signed links. Do not start
upload preparation until the local transfer is ready to run.

## Host validated test installers without rebuilding

The manual **Host validated installers** workflow accepts a successful desktop build run ID.
It checks the workflow outcome, rejects split payloads, verifies the build's saved SHA-256,
and uploads complete installers to `releases/test-builds/<source-sha>/`. It downloads each
public installer in full and verifies its checksum before publishing a per-run JSON manifest
and links in the Actions summary. Existing objects with different contents are rejected.
These are explicitly unsigned test builds (macOS is not notarized), not signed releases.
This path allows tested artifacts to be hosted without rerunning compilation or requiring
local copies of bucket credentials. Artifact retention still applies before promotion.
