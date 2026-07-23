# BonzAI Model Distribution Migration

Status: implementation plan  
Owner: Desktop and inference platform  
Decision: Public model artifacts are permanently published to decentralized storage. Arweave is the canonical byte store; IPFS plus renewable Filecoin replicas provide an independent recovery path. Cloudflare R2 is an optional cache and Hugging Face is provenance only.

## Non-Negotiable Property

No BonzAI employee, cloud provider, gateway operator, or upstream host must be able to make a published model disappear.

No external network can be guaranteed to exist literally forever. The enforceable engineering target is stronger than ordinary hosting: once an artifact is published, BonzAI has no deletion mechanism, its bytes remain independently verifiable, and retrieval survives the loss of BonzAI, Hugging Face, Cloudflare, any gateway, and individual storage providers.

This guarantee applies only to artifacts whose licenses permit permanent redistribution. Private or restricted models cannot honestly receive the same guarantee.

## Current Gap

- LLM and pipeline URLs are assembled from mutable or centrally controlled HTTP origins, mostly Hugging Face.
- The existing SDXL LoRA is served from a Cloudflare `r2.dev` URL.
- There is no canonical artifact manifest, mandatory checksum, decentralized resolver, or release-wide availability audit.
- Generated LoRAs are local artifacts with no explicit permanent-publication flow.
- The model registry can describe a model, but the current metadata shape does not require independently recoverable storage identities.

## Storage Architecture

### 1. Canonical permanence: Arweave

Every redistributable model file, adapter, license, model card, and release manifest is settled as an immutable Arweave transaction. Uploads may use an Arweave bundler such as Irys for operational convenience, but publication is not complete until the transaction is settled and independently retrievable from the Arweave network.

Arweave transaction IDs are permanent artifact locations. Released transactions are never replaced or hidden; a new release creates new transactions and a new manifest.

### 2. Independent replica: IPFS and Filecoin

The exact same bytes are encoded as deterministic UnixFS content and assigned an IPFS CID. BonzAI pins the CID on its own IPFS node and at least two independently operated nodes.

Each release is also stored with at least three independent Filecoin storage providers. Deals use automated replication, renewal, and repair. Filecoin is a second durability system, not the canonical permanence claim: deals expire unless renewed.

### 3. Replaceable delivery cache: R2

R2 may cache popular objects behind `models.bonzai.sh` for fast range downloads. It is populated from verified decentralized artifacts and may be deleted without affecting the catalog or recoverability.

R2 URLs are never stored as canonical identifiers in the registry. The application must work when every BonzAI-controlled HTTP origin is unavailable.

```text
                         Economy chain registry
                    sha256 + arweaveTxId + ipfsCid
                                  |
                   signed permanent release manifest
                                  |
             +--------------------+--------------------+
             |                    |                    |
       Arweave network       IPFS / Filecoin       Optional R2
       canonical bytes       independent copy      delivery cache
             |                    |                    |
             +--------------------+--------------------+
                                  |
                    checksum-verifying resolver
                                  |
                      ~/bonzai-models/<type>/
```

## Artifact Contract

The signed release manifest is itself published to Arweave and IPFS. The model registry on `VITE_BONZAI_ECONOMY_CHAIN_ID` stores its permanent identifiers and content hash. Ethereum remains the default economy chain.

```json
{
  "schema": "bonzai.model-artifact/v1",
  "id": "qwen3.5-4b-q4",
  "version": "2026.07.1",
  "kind": "llm",
  "filename": "qwen3.5-4b-ud-q4_k_xl.gguf",
  "bytes": 2700000000,
  "sha256": "...",
  "storage": {
    "arweaveTxId": "...",
    "ipfsCid": "bafy...",
    "filecoin": {
      "minimumReplicas": 3,
      "renewalPolicy": "continuous"
    },
    "cacheUrls": ["https://models.bonzai.sh/..."]
  },
  "license": {
    "id": "apache-2.0",
    "arweaveTxId": "...",
    "ipfsCid": "bafy..."
  },
  "upstream": {
    "provider": "huggingface",
    "repository": "unsloth/Qwen3.5-4B-MTP-GGUF",
    "revision": "immutable-commit-sha",
    "filename": "Qwen3.5-4B-UD-Q4_K_XL.gguf"
  }
}
```

The SHA-256 hash is the final authority. Arweave, IPFS, Filecoin, caches, and peers may supply bytes, but none are trusted without local verification.

## Resolver Rules

1. Load the bundled signed catalog, then discover newer catalog pointers from the economy-chain registry.
2. Reject invalid signatures, mutable artifact definitions, unknown licenses, and conflicting hashes.
3. Try a healthy R2 cache for speed, then independent Arweave gateways, native IPFS/Bitswap, public IPFS gateways, and Filecoin retrieval providers.
4. Use range requests and `.partial` files where the source supports them. Resume from another source when an origin fails.
5. Verify SHA-256 before atomic rename into the model directory.
6. Seed verified public artifacts from the local BonzAI IPFS node when the user enables contribution mode.
7. Let users add gateways and peers. No BonzAI gateway allowlist may become a retrieval gate.

The application ships a genesis catalog, public chain configuration, multiple independent Arweave/IPFS bootstrap endpoints, and native content identifiers. It must not require a BonzAI API to discover or install already-published releases.

## LoRA Policy

Generated adapters remain local by default:

```text
~/bonzai-models/loras/<base-model>/<lora-id>/
  adapter.safetensors
  adapter_config.json
  provenance.json
  LICENSE.txt
```

The app provides two distinct actions:

- **Export** copies the local package and remains reversible.
- **Publish permanently** uploads the package to Arweave and IPFS/Filecoin, then registers its manifest on-chain.

Permanent publication requires an explicit license, proof that the publisher has redistribution rights, a review of included personal data, an irreversible-storage warning, and a wallet signature over the final manifest hash. There is no delete button after settlement. Deprecation can update discovery metadata but cannot remove the bytes.

Restricted and private LoRAs must never be sent to permanent public storage. If encrypted archival is added later, key destruction is not represented as deletion because encrypted bytes remain public forever.

## Migration

### Phase 1: Inventory and legal gate

1. Export every GGUF, projector, pipeline weight, helper model, and LoRA reference.
2. Pin each upstream file to an immutable revision and calculate byte count and SHA-256.
3. Archive the exact license text with each artifact.
4. Classify each asset as `permanent-public`, `user-fetch-required`, or `blocked`.
5. Do not mirror models whose licenses prohibit permanent redistribution.

Exit gate: every artifact has an immutable upstream reference, checksum, archived license, owner, and redistribution decision.

### Phase 2: Deterministic packaging

1. Define canonical filenames and deterministic archives for multi-file pipelines.
2. Generate the Arweave transaction payload, UnixFS CID, and signed artifact manifest from the same bytes.
3. For artifacts too large for one operational upload path, publish ordered immutable chunks plus a reconstruction manifest. The reconstructed file hash must equal the catalog SHA-256.
4. Make packaging reproducible in CI on a clean machine.

Exit gate: repeated packaging produces identical hashes, CIDs, and manifests.

### Phase 3: Permanent publication

1. Fund an Arweave publication wallet controlled by the BonzAI treasury multisig.
2. Upload through a production Arweave bundler and wait for settlement.
3. Verify retrieval through at least three independently operated Arweave gateways or peers.
4. Pin the matching IPFS CID on BonzAI infrastructure and two independent operators.
5. Create Filecoin deals with at least three distinct providers and enable renewal and repair monitoring.
6. Publish the release manifest to both storage systems and anchor it in the model registry.

Exit gate: deleting the staging server and disabling R2 does not prevent a clean machine from reconstructing and verifying every release artifact.

### Phase 4: Desktop resolver

1. Add `modelCatalog.service.js` with bundled-catalog and on-chain discovery.
2. Replace URL construction with artifact IDs and decentralized storage descriptors.
3. Add multi-origin range resume, source rotation, SHA-256 verification, and atomic installation.
4. Display content hash, permanent storage status, license, and verification state before installation.
5. Keep Hugging Face as a disabled-by-default emergency source for one release only.

Exit gate: normal production operation contains no Hugging Face or BonzAI API dependency.

### Phase 5: LoRA publication

1. Standardize local LoRA packages and provenance.
2. Add Export and Publish permanently as visibly different actions.
3. Run license, personal-data, and irreversible-consent gates before upload.
4. Publish bytes and metadata to Arweave and IPFS/Filecoin.
5. Register the immutable manifest and revenue recipient on-chain.

Exit gate: a published adapter can be installed on a clean machine after BonzAI-controlled storage and APIs are disabled.

### Phase 6: Remove centralized authority

1. Remove dynamic Hugging Face URL construction and production fallback.
2. Make R2 cache generation reproducible from the permanent catalog.
3. Publish resolver specifications, manifest schemas, and verification tooling publicly.
4. Add community mirrors and peer seeding without requiring BonzAI approval.

Exit gate: an independent third party can implement a compatible downloader from the on-chain pointer and public specifications alone.

## Continuous Proof

- Hourly probes retrieve ranges from multiple independent Arweave and IPFS sources.
- Daily jobs reconstruct one artifact from each media family without using R2.
- Weekly jobs verify Filecoin replica count, deal health, renewal horizon, and provider diversity.
- Monthly disaster recovery disables all BonzAI HTTP origins and installs a representative model set.
- CI fails on missing hashes, non-permanent canonical URLs, mutable manifest entries, unavailable license text, or signature mismatch.
- Public dashboards expose settlement confirmation, Arweave retrieval, IPFS provider count, Filecoin replicas, and last successful decentralized install.

An `active` or `deprecated` registry flag affects recommendation only. It must never be interpreted by the resolver as permission to retrieve immutable bytes.

## Immediate Actions

1. Replace the R2-first decision with this Arweave-first architecture.
2. Produce the complete model and license inventory.
3. Build deterministic packaging and signed manifest tooling.
4. Run a proof of permanence with one small GGUF and the existing SDXL LoRA.
5. Test installation with Hugging Face, R2, and every BonzAI API blocked.
6. Measure full-catalog Arweave publication cost before treasury approval.
7. Extend the model registry metadata schema to require `sha256`, `arweaveTxId`, and `ipfsCid`.

## References

- [Arweave protocol and storage endowment](https://docs.arweave.org/developers/development/protocol)
- [Arweave HTTP API and chunk retrieval](https://docs.arweave.org/developers/arweave-node-server/http-api)
- [IPFS persistence, permanence, and pinning](https://docs.ipfs.tech/concepts/persistence/)
- [IPFS data lifecycle and trustless retrieval](https://docs.ipfs.tech/concepts/lifecycle/)
- [Filecoin replication, renewal, and repair](https://docs.filecoin.io/smart-contracts/programmatic-storage/raas)
- [Filecoin storage proofs](https://docs.filecoin.io/storage-providers/filecoin-economics/storage-proving)
