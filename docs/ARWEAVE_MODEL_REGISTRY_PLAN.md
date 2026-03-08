# Arweave Model Registry — Implementation Plan

## Context

BonzAI currently downloads all ML models (21+ LLM GGUFs, 9 Flask pipeline repos) from HuggingFace. This plan replaces HuggingFace entirely with Arweave-based permanent storage, backed by an on-chain model registry on Base. Any user can upload/download models, gated by BONZAI token holdings (LVL system). Pipeline repos are stored as tar.gz archives. Hard switch — no HuggingFace fallback.

---

## Architecture

```
                          ON-CHAIN (Base 8453)
                          BonzaiModelRegistry.sol
                          modelKey => { arweaveTxId, contentHash, sizeBytes, ... }
                                 |
                    ┌────────────┴────────────┐
                    |                         |
          modelRegistry.service.js    ~/bonzai-models/registry.json
          (reads contract, syncs)     (Python reads this file)
                    |                         |
        ┌───────────┴─────┐                   |
        |                 |                   |
  main.js (Electron)  arweaveModel.service.js  diffuser.py
  downloadModel()     (chunked upload          _download_from_arweave()
  streams GGUF from   with progress)           streams tar.gz, extracts
  Arweave gateway                              to repos/
```

### Download Flow

1. Electron syncs on-chain registry → writes `~/bonzai-models/registry.json`
2. For LLM GGUFs: Electron streams from `gateway.irys.xyz/{txId}` via electron-dl (same mechanism as today, different URL source)
3. For pipeline repos: Frontend passes registry key to Flask → Flask reads registry.json → downloads tar.gz from Arweave → extracts to `repos/` directory
4. `from_pretrained(local_path)` loading is unchanged (already uses local paths)

### Upload Flow

1. User selects a GGUF file or model repo directory
2. For directories: tar.gz created locally
3. Content hash (keccak256) computed
4. BONZAI level checked (LVL4+ required to publish)
5. Irys balance checked, user funds if needed
6. File uploaded to Arweave via Irys chunked uploader
7. Model registered on-chain: `publishModel(key, txId, hash, size, type, minLevel)`

---

## Phase 1: Contract & Infrastructure

### 1a. `src/contracts/BonzaiModelRegistry.sol` (NEW)

Follows `BonzaiSkillRegistry.sol` patterns (same OpenZeppelin imports, struct design, events).

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BonzaiModelRegistry is Ownable, ReentrancyGuard, Pausable {

    // ── STRUCTS ──────────────────────────────────────────────

    struct Model {
        bytes32 id;              // keccak256(modelKey, publisher)
        string modelKey;         // e.g. "llm_deepseek_r1_7b", "image_turbo"
        address publisher;       // Who uploaded and registered this model
        string arweaveTxId;      // Arweave transaction ID (43 chars)
        bytes32 contentHash;     // keccak256 of the file bytes (integrity check)
        uint256 sizeBytes;       // File size in bytes
        uint8 modelType;         // 0=gguf, 1=pipeline_archive
        uint8 minLevel;          // Minimum BONZAI level to download (1-6)
        bool isActive;           // Can be downloaded
        bool isVerified;         // Verified by BonzAI team (official models)
        uint256 createdAt;
        uint256 updatedAt;
    }

    // ── STATE ────────────────────────────────────────────────

    IERC20 public bonzaiToken;
    uint256 public publishMinLevel;           // Minimum BONZAI holding to publish (default: LVL4 = 25000e18)

    mapping(bytes32 => Model) public models;  // id => Model
    bytes32[] public allModelIds;             // For enumeration
    mapping(string => bytes32) public modelKeyToId;  // modelKey => id (latest)
    mapping(address => bytes32[]) public publisherModels;

    // ── EVENTS ───────────────────────────────────────────────

    event ModelPublished(
        bytes32 indexed id, string modelKey, address indexed publisher,
        string arweaveTxId, bytes32 contentHash, uint256 sizeBytes,
        uint8 modelType, uint8 minLevel, uint256 timestamp
    );
    event ModelUpdated(bytes32 indexed id, string arweaveTxId, bytes32 contentHash, uint256 timestamp);
    event ModelDeactivated(bytes32 indexed id, uint256 timestamp);
    event ModelVerified(bytes32 indexed id, bool verified, uint256 timestamp);

    // ── ERRORS ───────────────────────────────────────────────

    error InsufficientBonzaiHolding(uint256 balance, uint256 required);
    error ModelAlreadyExists(bytes32 id);
    error ModelNotFound(bytes32 id);
    error NotPublisher(address caller, address publisher);
    error InvalidArweaveTxId();

    // ── CONSTRUCTOR ──────────────────────────────────────────

    constructor(address _bonzaiToken, uint256 _publishMinLevel) Ownable(msg.sender) {
        bonzaiToken = IERC20(_bonzaiToken);
        publishMinLevel = _publishMinLevel;  // e.g. 25000e18 for LVL4
    }

    // ── PUBLISH (level-gated) ────────────────────────────────

    function publishModel(
        string calldata modelKey,
        string calldata arweaveTxId,
        bytes32 contentHash,
        uint256 sizeBytes,
        uint8 modelType,     // 0=gguf, 1=pipeline_archive
        uint8 minLevel       // 1-6
    ) external nonReentrant whenNotPaused returns (bytes32 id) {
        if (bonzaiToken.balanceOf(msg.sender) < publishMinLevel) {
            revert InsufficientBonzaiHolding(bonzaiToken.balanceOf(msg.sender), publishMinLevel);
        }
        if (bytes(arweaveTxId).length < 40) revert InvalidArweaveTxId();

        id = keccak256(abi.encodePacked(modelKey, msg.sender));
        if (models[id].publisher != address(0)) revert ModelAlreadyExists(id);

        models[id] = Model({
            id: id, modelKey: modelKey, publisher: msg.sender,
            arweaveTxId: arweaveTxId, contentHash: contentHash,
            sizeBytes: sizeBytes, modelType: modelType, minLevel: minLevel,
            isActive: true, isVerified: false,
            createdAt: block.timestamp, updatedAt: block.timestamp
        });

        allModelIds.push(id);
        modelKeyToId[modelKey] = id;
        publisherModels[msg.sender].push(id);

        emit ModelPublished(id, modelKey, msg.sender, arweaveTxId, contentHash,
                           sizeBytes, modelType, minLevel, block.timestamp);
    }

    // ── UPDATE (publisher only) ──────────────────────────────

    function updateModel(
        bytes32 id, string calldata arweaveTxId,
        bytes32 contentHash, uint256 sizeBytes
    ) external nonReentrant {
        Model storage m = models[id];
        if (m.publisher == address(0)) revert ModelNotFound(id);
        if (m.publisher != msg.sender) revert NotPublisher(msg.sender, m.publisher);
        if (bytes(arweaveTxId).length < 40) revert InvalidArweaveTxId();

        m.arweaveTxId = arweaveTxId;
        m.contentHash = contentHash;
        m.sizeBytes = sizeBytes;
        m.updatedAt = block.timestamp;

        emit ModelUpdated(id, arweaveTxId, contentHash, block.timestamp);
    }

    // ── ADMIN ────────────────────────────────────────────────

    function adminPublishModel(
        string calldata modelKey, string calldata arweaveTxId,
        bytes32 contentHash, uint256 sizeBytes,
        uint8 modelType, uint8 minLevel
    ) external onlyOwner returns (bytes32 id) {
        if (bytes(arweaveTxId).length < 40) revert InvalidArweaveTxId();

        id = keccak256(abi.encodePacked(modelKey, msg.sender));

        models[id] = Model({
            id: id, modelKey: modelKey, publisher: msg.sender,
            arweaveTxId: arweaveTxId, contentHash: contentHash,
            sizeBytes: sizeBytes, modelType: modelType, minLevel: minLevel,
            isActive: true, isVerified: true,   // Auto-verified for admin
            createdAt: block.timestamp, updatedAt: block.timestamp
        });

        allModelIds.push(id);
        modelKeyToId[modelKey] = id;
        publisherModels[msg.sender].push(id);

        emit ModelPublished(id, modelKey, msg.sender, arweaveTxId, contentHash,
                           sizeBytes, modelType, minLevel, block.timestamp);
    }

    function verifyModel(bytes32 id, bool verified) external onlyOwner {
        if (models[id].publisher == address(0)) revert ModelNotFound(id);
        models[id].isVerified = verified;
        models[id].updatedAt = block.timestamp;
        emit ModelVerified(id, verified, block.timestamp);
    }

    function deactivateModel(bytes32 id) external onlyOwner {
        if (models[id].publisher == address(0)) revert ModelNotFound(id);
        models[id].isActive = false;
        models[id].updatedAt = block.timestamp;
        emit ModelDeactivated(id, block.timestamp);
    }

    function setPublishMinLevel(uint256 _min) external onlyOwner {
        publishMinLevel = _min;
    }

    // ── VIEW ─────────────────────────────────────────────────

    function getModel(bytes32 id) external view returns (Model memory) {
        return models[id];
    }

    function getModelByKey(string calldata modelKey) external view returns (Model memory) {
        return models[modelKeyToId[modelKey]];
    }

    function getTotalModels() external view returns (uint256) {
        return allModelIds.length;
    }

    function getModelsPaginated(uint256 offset, uint256 limit)
        external view returns (bytes32[] memory)
    {
        uint256 total = allModelIds.length;
        if (offset >= total) return new bytes32[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        bytes32[] memory result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; ) {
            result[i - offset] = allModelIds[i];
            unchecked { i++; }
        }
        return result;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    receive() external payable { revert("Not payable"); }
    fallback() external payable { revert("Not payable"); }
}
```

### 1b. `src/services/modelRegistry.service.js` (NEW)

Follows `skillOwnership.service.js` pattern (ethers v6, human-readable ABI).

```javascript
import { ethers } from 'ethers';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

const MODEL_REGISTRY_ABI = [
  'function publishModel(string modelKey, string arweaveTxId, bytes32 contentHash, uint256 sizeBytes, uint8 modelType, uint8 minLevel) returns (bytes32)',
  'function updateModel(bytes32 id, string arweaveTxId, bytes32 contentHash, uint256 sizeBytes)',
  'function getModel(bytes32 id) view returns (tuple(bytes32 id, string modelKey, address publisher, string arweaveTxId, bytes32 contentHash, uint256 sizeBytes, uint8 modelType, uint8 minLevel, bool isActive, bool isVerified, uint256 createdAt, uint256 updatedAt))',
  'function getModelByKey(string modelKey) view returns (tuple(bytes32 id, string modelKey, address publisher, string arweaveTxId, bytes32 contentHash, uint256 sizeBytes, uint8 modelType, uint8 minLevel, bool isActive, bool isVerified, uint256 createdAt, uint256 updatedAt))',
  'function getTotalModels() view returns (uint256)',
  'function getModelsPaginated(uint256 offset, uint256 limit) view returns (bytes32[])',
  'function publishMinLevel() view returns (uint256)',
];

let _registryCache = null;

// Sync ALL models from chain to local cache (paginated, 50 per batch)
export async function syncRegistry() { ... }

// Persist to ~/bonzai-models/registry.json + electron-store
export async function persistRegistryToDisk(registryData) { ... }

// Resolve model key → { arweaveTxId, gatewayUrl, fallbackUrl, contentHash, sizeBytes }
export async function resolveModelUrl(modelKey) {
  if (_registryCache?.models?.[modelKey]) {
    const m = _registryCache.models[modelKey];
    return {
      ...m,
      gatewayUrl: `https://gateway.irys.xyz/${m.arweaveTxId}`,
      fallbackUrl: `https://arweave.net/${m.arweaveTxId}`,
    };
  }
  const model = await getModelInfo(modelKey);
  if (!model?.arweaveTxId) throw new Error(`Model not found: ${modelKey}`);
  return { ...model, gatewayUrl: `https://gateway.irys.xyz/${model.arweaveTxId}` };
}

// Publish model to on-chain registry (requires wallet + BONZAI holding)
export async function publishModel(modelKey, arweaveTxId, contentHash, sizeBytes, modelType, minLevel) { ... }
```

### 1c. `src/services/arweaveModel.service.js` (NEW)

Wraps `irys.service.js` with large file support.

```javascript
import { irysService } from './irys.service.js';
import { ethers } from 'ethers';

/**
 * Upload a large file to Arweave via Irys with chunked upload and progress.
 * Uses Irys chunked uploader for files > 100MB.
 */
export async function uploadModelFile(data, opts) {
  const irys = await irysService.getIrys();
  const contentHash = ethers.keccak256(data);

  const tags = [
    { name: 'Content-Type', value: opts.contentType || 'application/octet-stream' },
    { name: 'App-Name', value: 'BonzAI' },
    { name: 'Type', value: 'model' },
    { name: 'Model-Key', value: opts.modelKey },
    { name: 'Model-Type', value: String(opts.modelType) },
    { name: 'Content-Hash', value: contentHash },
  ];

  if (data.length > 100 * 1024 * 1024) {
    const uploader = irys.uploader.chunkedUploader;
    uploader.setBatchSize(5);           // 5 chunks in parallel
    uploader.setChunkSize(25_000_000);  // 25MB chunks

    uploader.on('chunkUpload', (info) => {
      if (opts.onProgress) {
        opts.onProgress(Math.min((info.totalUploaded / data.length) * 100, 99));
      }
    });

    const receipt = await uploader.uploadData(data, { tags });
    if (opts.onProgress) opts.onProgress(100);

    return {
      transactionId: receipt.data.id,
      contentHash,
      sizeBytes: data.length,
      gatewayUrl: `https://gateway.irys.xyz/${receipt.data.id}`,
    };
  }

  // Standard upload for smaller files
  const receipt = await irys.upload(data, { tags });
  if (opts.onProgress) opts.onProgress(100);
  return { transactionId: receipt.id, contentHash, sizeBytes: data.length };
}

export async function estimateUploadCost(sizeBytes) {
  return irysService.estimateCost(sizeBytes);
}

export async function fundForUpload(amountEth) {
  return irysService.fund(amountEth);
}
```

### 1d. `src/config/web3.config.js` — Add registry config

```javascript
modelRegistry: {
    contractAddress: null,  // Set after deployment
    chainId: 8453,          // Base
    publishMinLevel: 25000,
    gateways: ["https://gateway.irys.xyz/", "https://arweave.net/"],
    MODEL_TYPE_GGUF: 0,
    MODEL_TYPE_PIPELINE_ARCHIVE: 1,
}
```

### 1e. `scripts/compileContracts.js` — Add `BonzaiModelRegistry.sol`

---

## Phase 2: Migration Script

### `scripts/migrateModelsToArweave.js` (NEW)

One-time script run by BonzAI team to upload all existing models.

```javascript
import { ethers } from 'ethers';
import { NodeIrys } from '@irys/sdk';
import tar from 'tar';
import fs from 'fs';
import path from 'path';
import { MODEL_REQUIREMENTS } from '../src/skills/flagship.js';

const MODEL_DIR = path.join(os.homedir(), 'bonzai-models');
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const REGISTRY_ADDRESS = process.env.MODEL_REGISTRY_ADDRESS;

async function main() {
  const irys = new NodeIrys({ network: 'mainnet', token: 'ethereum', key: PRIVATE_KEY });
  await irys.ready();

  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(REGISTRY_ADDRESS, ABI, wallet);

  for (const [key, model] of Object.entries(MODEL_REQUIREMENTS)) {
    if (model.type === 'llm') {
      // Upload GGUF → Arweave → register on-chain
      const filePath = path.join(MODEL_DIR, model.filename);
      const data = fs.readFileSync(filePath);
      const contentHash = ethers.keccak256(data);
      const receipt = await irys.upload(data, { tags: [...] });
      const tx = await contract.adminPublishModel(key, receipt.id, contentHash, data.length, 0, 1);
      await tx.wait();
    } else if (model.repo) {
      // Tar.gz repo → upload → register
      const repoDir = path.join(MODEL_DIR, 'repos', model.repo.replace('/', '__'));
      const archivePath = `/tmp/${key}.tar.gz`;
      await tar.create({ gzip: true, file: archivePath, cwd: repoDir }, ['.']);
      const data = fs.readFileSync(archivePath);
      const contentHash = ethers.keccak256(data);
      const receipt = await irys.upload(data, { tags: [...] });
      const tx = await contract.adminPublishModel(`${key}_repo`, receipt.id, contentHash, data.length, 1, minLevel);
      await tx.wait();
    }
  }
}
```

**Registry key naming convention:**
- LLMs: same as MODEL_REQUIREMENTS key (e.g., `llm_deepseek_r1_7b`)
- Pipeline repos: `{pipeline}_repo` (e.g., `image_turbo_repo`)
- Pipeline GGUFs: `{pipeline}_gguf` (e.g., `video_fast_gguf`)
- Additional files: `{pipeline}_{name}` (e.g., `image_standard_lora`)

**Estimated cost:** ~$1000-1500 for 200-300GB total models at current Arweave/Irys pricing (~$5/GB).

---

## Phase 3: Download Path Replacement

### 3a. `src/skills/flagship.js` — Remove all HF URLs

For every model in MODEL_REQUIREMENTS (~33 entries):

| Before | After |
|--------|-------|
| `url: 'https://huggingface.co/...'` | REMOVED |
| (none) | `registryKey: 'llm_deepseek_r1_7b'` ADDED |

`filename`, `size`, `vram`, `description` etc. remain unchanged.

### 3b. `src/main.js` — Registry sync + Arweave downloads

**Add `syncModelRegistry()`** (called on app startup):
```javascript
async function syncModelRegistry() {
  const registryPath = path.join(MODEL_DIR, 'registry.json');
  try {
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const contract = new ethers.Contract(REGISTRY_ADDRESS, MODEL_REGISTRY_ABI, provider);
    const total = await contract.getTotalModels();
    const models = {};
    for (let offset = 0; offset < total; offset += 50) {
      const ids = await contract.getModelsPaginated(offset, 50);
      for (const id of ids) {
        const m = await contract.getModel(id);
        if (m.isActive) {
          models[m.modelKey] = {
            arweaveTxId: m.arweaveTxId, contentHash: m.contentHash,
            sizeBytes: Number(m.sizeBytes), modelType: m.modelType,
            minLevel: m.minLevel, isVerified: m.isVerified,
          };
        }
      }
    }
    fs.writeFileSync(registryPath, JSON.stringify({ models, lastSync: Date.now() }, null, 2));
    store.set('modelRegistry', { models, lastSync: Date.now() });
  } catch (err) {
    console.warn('[Registry] Sync failed, using cached:', err.message);
  }
}
```

**Modify `downloadModel()`** — signature changes from `(url, filename)` to `(modelKey, filename)`:
```javascript
async function downloadModel(_event, modelKeyOrUrl, filename) {
  let url;
  if (modelKeyOrUrl.startsWith('http')) {
    url = modelKeyOrUrl; // Legacy fallback
  } else {
    const registry = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'registry.json'), 'utf8'));
    const model = registry.models?.[modelKeyOrUrl];
    if (!model?.arweaveTxId) return { error: `Model ${modelKeyOrUrl} not found in registry` };
    url = `https://gateway.irys.xyz/${model.arweaveTxId}`;
  }
  // Rest: same electron-dl download with progress, gateway fallback to arweave.net
}
```

**Add `verifyFileHash()`** — streaming keccak256 verification after download.

**New IPC handlers:** `registry-sync`, `registry-get`, `write-registry-json`

**Set env vars** on Python server spawn: `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`

### 3c. `src/preload.js` — Update IPC bridge

```javascript
// CHANGE signature:
downloadModel: (modelKey, filename) => ipcRenderer.invoke("model-download", modelKey, filename),

// ADD:
registrySync: () => ipcRenderer.invoke("registry-sync"),
registryGet: () => ipcRenderer.invoke("registry-get"),
```

### 3d. `src/server/diffuser.py` — Replace HF downloads

**Remove:**
- `from huggingface_hub import HfApi, hf_hub_url`
- `_hf_token()` function
- `_list_required_remote_files()` (HF API calls to list repo files)
- `_download_repo_files()` (HF file-by-file downloads)
- All HF URL constants (`FLUX_KREA_GGUF_URL`, `Z_GGUF_URL`, `LTX2_GGUF_URL`, etc.)

**Add:**
```python
# Force offline mode — all downloads go through Arweave
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# Registry reader (reads ~/bonzai-models/registry.json written by Electron)
_registry_cache = None
_registry_mtime = 0

def _load_registry() -> Dict[str, Any]:
    global _registry_cache, _registry_mtime
    registry_path = MODEL_DIR / "registry.json"
    if not registry_path.exists(): return {}
    mtime = registry_path.stat().st_mtime
    if _registry_cache is not None and mtime == _registry_mtime:
        return _registry_cache
    with open(registry_path, "r") as f:
        _registry_cache = json.load(f)
    _registry_mtime = mtime
    return _registry_cache

def _resolve_arweave_url(registry_key: str) -> Optional[str]:
    reg = _load_registry()
    model = (reg.get("models") or {}).get(registry_key)
    if not model or not model.get("arweaveTxId"): return None
    return f"https://gateway.irys.xyz/{model['arweaveTxId']}"
```

**Add `_download_and_extract_archive()`:**
```python
def _download_and_extract_archive(pl, tid, registry_key, extract_to):
    url = _resolve_arweave_url(registry_key)
    if not url: raise ValueError(f"No Arweave URL for: {registry_key}")

    archive_path = MODEL_DIR / f"{registry_key}.tar.gz"

    # Stream download with progress
    _stream_download_arweave(url, archive_path, update=..., is_cancelled=...)

    # Verify integrity
    expected_hash = _resolve_arweave_hash(registry_key)
    if expected_hash:
        import hashlib
        h = hashlib.sha256()
        with open(archive_path, "rb") as f:
            for chunk in iter(lambda: f.read(1024*1024), b""): h.update(chunk)
        if "0x" + h.hexdigest() != expected_hash:
            archive_path.unlink(missing_ok=True)
            raise ValueError(f"Hash mismatch for {registry_key}")

    # Extract
    extract_to.mkdir(parents=True, exist_ok=True)
    import tarfile
    with tarfile.open(archive_path, "r:gz") as tar:
        tar.extractall(path=extract_to)

    archive_path.unlink(missing_ok=True)
```

**Add `_stream_download_arweave()`:**
Same as existing `_stream_download()` but without HF auth headers, with gateway fallback (`gateway.irys.xyz` → `arweave.net`).

**Modify `_plan_for(pipeline)`:**
Returns `archives_to_fetch` (registry keys + extract paths) + `single_files` (registry keys) instead of HF repo IDs + URLs:
```python
def _plan_for(pipeline: str) -> Dict[str, Any]:
    if pipeline in ("image_turbo", "flux_klein"):
        return {
            "archives_to_fetch": [
                {"registry_key": "image_turbo_repo", "extract_to": repo_local_dir(FLUX_KLEIN_REPO)},
            ],
            "single_files": [],
        }
    # ... similar for all pipelines
```

**Modify `_start_prefetch_pipeline()` worker:**
Loop over `archives_to_fetch` (download + extract each) then `single_files` (download each via registry key resolution).

---

## Phase 4: UI & Upload

### 4a. `src/components/skills/ModelPublisher.vue` (NEW)

Accessible from settings/bottom bar. Features:
- File picker for GGUF files or repo directories
- Tar.gz creation for directories (via IPC to main.js)
- Irys balance check + funding prompt
- BONZAI level verification (LVL4+ to publish)
- Upload progress bar (chunked uploader events)
- On-chain registration form (model key, min level, model type)

### 4b. `src/components/skills/SkillDownloader.vue` — Use registry keys

```javascript
// BEFORE:
await window.electronAPI.downloadModel(model.url, model.filename);
// AFTER:
await window.electronAPI.downloadModel(model.registryKey, model.filename);
```

### 4c. All components calling `downloadModel()` — Pass registryKey

Affected: `GenerativeText.vue`, `Generative3D.vue`, `RoleplayChat.vue`, `SkillDownloader.vue`

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/contracts/BonzaiModelRegistry.sol` | NEW | On-chain model registry (~280 lines) |
| `src/services/modelRegistry.service.js` | NEW | Chain sync, registry read/write (~150 lines) |
| `src/services/arweaveModel.service.js` | NEW | Chunked upload to Arweave (~100 lines) |
| `scripts/migrateModelsToArweave.js` | NEW | One-time migration script (~200 lines) |
| `src/components/skills/ModelPublisher.vue` | NEW | Upload UI component (~300 lines) |
| `src/skills/flagship.js` | MODIFY | Remove `url`, add `registryKey` for ~33 models |
| `src/main.js` | MODIFY | Add registry sync, modify downloadModel(), add IPC handlers |
| `src/preload.js` | MODIFY | Update downloadModel signature, add registry IPC channels |
| `src/server/diffuser.py` | MODIFY | Remove HF imports/downloads, add Arweave download + extraction |
| `src/config/web3.config.js` | MODIFY | Add modelRegistry config block |
| `scripts/compileContracts.js` | MODIFY | Add BonzaiModelRegistry.sol |
| `src/components/skills/SkillDownloader.vue` | MODIFY | Pass registryKey instead of URL |
| `src/components/GenerativeText.vue` | MODIFY | Pass registryKey |
| `src/components/Generative3D.vue` | MODIFY | Pass registryKey |
| `src/components/skills/RoleplayChat.vue` | MODIFY | Pass registryKey |

---

## Error Handling & Edge Cases

1. **Offline mode:** If chain sync fails, app uses last cached `registry.json`. Already-downloaded models work fine.
2. **Resumable downloads:** `_stream_download_arweave()` uses HTTP Range headers (`.part` file resume).
3. **Gateway failover:** Try `gateway.irys.xyz` first, fall back to `arweave.net`.
4. **Integrity verification:** keccak256 stored on-chain, verified post-download. Failed = delete + error.
5. **`from_pretrained` compatibility:** Already loads from local paths. `HF_HUB_OFFLINE=1` blocks any network calls.
6. **Multi-repo pipelines:** Each repo gets its own archive + registry entry. `archives_to_fetch` array handles this.

## Verification Checklist

- [ ] Deploy contract to Base testnet, register a test model, verify read/write
- [ ] `npm run start` → check `~/bonzai-models/registry.json` is populated
- [ ] Download any LLM model → streams from Arweave gateway
- [ ] Trigger pipeline prefetch → Flask downloads tar.gz → extracts → pipeline loads
- [ ] Disconnect network → cached registry works → downloaded models load
- [ ] Upload a test file via ModelPublisher → verify on-chain registration
- [ ] Download a model → verify keccak256 matches on-chain contentHash
- [ ] Confirm `HF_HUB_OFFLINE=1` prevents any HuggingFace network calls
