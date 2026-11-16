# Inference memory lifecycle

BonzAI uses request-local placement optimizations without changing checkpoint,
LoRA strength, scheduler, CFG, resolution, or frame count. The policy selects
placement without silently lowering output settings. Music additionally rejects
requests when the conservative host-memory budget cannot fit them.

## Shared behavior

`src/server/inference_memory.py` contains CPU/CUDA/MPS placement helpers.
Constrained devices use leaf offloading and bounded GGUF projection
reconstruction. Roomier devices retain the resident/native path where supported.
This is a placement heuristic, not a measurement or guarantee of peak memory.

Packed GGUF projections reconstruct 256 output rows at a time. Exact-name
checkpoint tensors can use H3's reusable disk staging reader after their full
packed contents have been compared against the converted weights. Renamed or
repacked tensors fall back to packed CPU storage. PEFT/LoKr wrappers remain
active; adapters are never fused into GGUF weights. CUDA native GGUF kernels
remain the path on devices classified as roomy.

Disk verification adds loading time and streaming adds I/O. These changes must
be benchmarked before claiming a speed improvement. All model files are read
only. The zero-stride packed placeholders are inference-only: do not serialize
or fuse a request-owned streamed model.

## Pipeline integration

- **Wan quality/test:** lightweight expert proxies preserve the upstream
  denoising loop. Load the high/low expert only when its timestep range begins;
  load just that expert's configured LoRAs, release the previous expert, and
  release the last one before VAE decoding. Release prompt/image encoders after
  their embeddings are produced. Keep the VAE on its execution device with
  spatial tiling to preserve temporal cache behavior.
- **Qwen Image 2.1 / Z-Image:** adaptive placement, bounded GGUF projections where
  applicable, release encoders when denoising starts and denoiser before decode.
  Safetensors Z-Image uses ordinary layer offloading, not GGUF conversion.
- **LTX-2:** leaf offloading compatible with bounded GGUF bases, release
  encoders at denoising, release transformer before video decoding, and release
  the video decoder before audio decoding.
- **SDXL:** encode prompts before loading the denoiser onto the accelerator;
  release the base before loading the refiner, retaining the shared VAE and
  second text encoder. Use tiled decode and leaf offloading on constrained GPUs.
- **ACE-Step:** constrained Apple Silicon devices keep BF16 safetensors weights
  file-backed on CPU and transfer denoiser leaves onto Metal as needed. Small
  encoders stay usable for direct buffer/embedding reads and are released when
  denoising starts; the denoiser is released before waveform decoding.
  Metal command queue is synchronized and its unused cache cleared at each
  denoiser block, so in-flight transfers cannot retain many blocks' weights.
  This trades some throughput for bounded residency. The checkpoint, sample
  rate, requested duration and sampling settings stay the same.
  Oobleck decoding uses overlapping 256-latent-frame tiles (64-frame overlap).
  Tiling can change numerical results at tile boundaries.
  Admission first clears idle allocations, then checks physical capacity for
  weights plus workspace. The streamed path requires available RAM for workspace
  (`2 + duration / 120` GiB with bounded attention and tiled decoding), 2 GiB staging and a 12% host reserve (3–8 GiB), rather
  than requiring the whole checkpoint to be free again. CPU/CUDA retain resident
  admission. These estimates are guards, not peak-memory guarantees. Checks at
  model, denoiser-block and decoder-tile boundaries retain the host reserve;
  macOS critical pressure also aborts. A transient macOS warning alone does not
  abort while the reserve is available. Music weights, tensors and hooks are
  released after success or failure.
- **MPS:** set allocator high/low watermarks to 1.0/0.8 before importing torch;
  video requests must never disable the high watermark. Before music weights
  load, an additional allocator ceiling uses available RAM minus the host reserve
  plus existing Metal allocations. Setting it after CPU mapping incorrectly
  double-counted the checkpoint. The ceiling is restored after each request.
  CPU offload still uses the same physical RAM on Apple Silicon.
- **Queue ownership:** creation views submit directly; they must not unload the
  LLM or clear caches before obtaining the shared device lease. Media requests
  report queued/running state over the generation socket. Standalone Python uses
  a FIFO device lock. Health and download status stay responsive while waiting.
- **TTS / vision / OCR:** the existing serialized request lock protects cache
  eviction. Preserve the requested family's cached model and small voice
  reference cache; release other idle model families before work begins.
  Vision still uses the shared llama.cpp pool, not a second Python model.
- **SeedVR2:** preserve frame batching, temporal overlap, and tiled VAE settings;
  explicitly offload caches to CPU between phases. CUDA retains block swapping;
  macOS does not enable unsupported block swapping. Validate/clamp output per
  frame without another full-video float allocation.
- **Export:** Wan writes frame-by-frame. LTX allocates one uint8 output buffer
  and uses frame-sized conversion scratch rather than repeated full float-video
  copies.

The cache callback runs only after the existing Flask inference lock is held.
It cannot evict an active Flask generation. Forecast execution shares that lock.
It does not stop external llama.cpp requests or reload the running server.

## Validation status

### Generation timing

Serialized inference responses include `elapsed_ms` (request through response),
`queue_ms` (waiting for the device lock), and `execution_ms` (after acquiring it,
including preparation/cleanup). These use a monotonic clock and are also exposed
through `Server-Timing`; JSON errors retain timing. Generation progress events
and snapshots retain `elapsed_ms` on success and failure. Tracker timing starts
at job creation, so it excludes any earlier admission/download/queue work.

Renderer histories use `elapsedMs` for the full user operation; video
auto-enhancement is included in that total and its own duration is retained
separately. Manual enhancement retains the original generation time. Legacy
inference-store `elapsed` is in seconds. Clip `duration` is never interpreted as
generation time. The common inspector formats measured times using locale-aware
hours/minutes/seconds (milliseconds below one second), and does not invent times
for older records without measurements. 3D generation/refinement measures the
whole operation including planning and review, rather than only token generation.

H3 uses FP32 ConvRot activation rotation and token-bounded, max-scaled FP32
RMSNorm accumulation. Packed checkpoint storage is unchanged. Request-local
checks reject non-finite conditioning, transformer block outputs, predictions,
and scheduler outputs with the stage/step recorded (without logging prompts).
This addresses numerical risks; the reported non-finite-latent incident's
origin remains unconfirmed. Finite-value
checks synchronize the device and may add overhead. Invalid tensors are never
replaced with zeros to force export.

H3 numerical changes were tested on 2026-10-14 after explicit authorization:
four CPU regression tests passed, followed by a successful MPS image-to-video
request using `h3_hybrid.safetensors`, a local lantern reference, 512×288,
124 frames, 24 fps, 8 Euler/simple steps, CFG 1 and seed 12345. The request took
2396.44 seconds (prompt encoding 81.01 s, keyframe encoding 10.52 s,
transformer preparation/denoising 1940.41 s, decoding/export 364.18 s).
All conditioning, block, prediction, scheduler and final output checks passed.
The exported H.264/AAC video independently decoded to 124 frames; five sampled
frames showed the lantern scene rather than blank/corrupt output. Peak sampled
process RSS was 10.61 GiB, minimum available system memory 6.78 GiB, and swap
growth zero. RSS excludes some driver-owned memory and is not total GPU usage.
Local artifacts are in `.cache/h3-validation/i2v-512x288/`.

This used a separate process with the current source, without restarting the
app server. It did not use the original failing image/prompt/seed or an unchanged
baseline, so it validates this test case rather than establishing the original
failure's cause. Restart BonzAI after pending work ends to activate the changes.

ACE-Step music was validated on 2026-10-22 on a 32 GiB M1 Max using the local
XL Turbo BF16 checkpoint. The former admission check rejected a 60-second song
with about 12 GiB available because it demanded 17.16 GiB. The streamed policy
admits that request with the same checkpoint and sampling settings. A 10-second
smoke test passed, followed by a 60-second request with lyrics, eight steps,
CFG 1, shift 3 and seed 12345. The latter produced finite, non-silent stereo
48 kHz audio in 58.28 seconds. Minimum sampled available memory was 5.23 GiB;
peak sampled Metal allocation was 3.16 GiB and system-wide swap growth 0.69 GiB.
macOS reported normal/warning pressure, never critical. Those counters do not
represent total process/device residency, and swap includes other applications.
An earlier attempt was stopped by the smoke-test watchdog when swap grew over
1 GiB; block-level Metal synchronization was added before the successful run.

The test used the exact production loader in an isolated process holding the
running desktop's device lease, without restarting the user's app or starting
another media server. Outputs and measurements are under
`.cache/music-validation/60s-8steps/`. This validates the default one-minute
request, not every duration or a performance comparison against the old engine.
Restart BonzAI after pending work ends to activate backend changes.
Lightweight regressions: `python -m unittest discover -s test -p
test_inference_budget.py` and `python -m unittest discover -s test -p
test_music_memory.py`.

On 2026-10-23, a monitored 180-second, eight-step vocal generation completed
in 114.8 seconds on the same 32 GiB M1 Max. The streamed Metal path now tiles
ACE-Step attention queries (256 at a time), retaining all keys and original
masks. Numerical regression coverage compares tiled and original grouped
attention with a sliding mask. Peak Metal allocation was 3.19 GiB; minimum
host available memory was 5.12 GiB. System swap grew by 1.73 GiB; pressure
was normal/warning, never critical. This is one hardware validation, not a
promise of zero swap or admission under arbitrary competing app loads.
Artifacts: `.cache/music-validation/180s-8steps/`. Restart the Python backend
to apply placement changes. Existing admission and critical-pressure guards
remain enabled.

Other non-H3/non-music placement optimizations remain implementation-only:
inference and cross-platform builds have not validated those changes yet.

### H3 adapter selection

The hybrid H3 checkpoint runs without external adapters. The GGUF fallback uses only the legacy `h3_lora.safetensors` preset at strength 0.5. The experimental `h3_extra.safetensors` adapter is no longer loaded, even if present locally. Response `loras` metadata records external adapters actually applied.

H3 currently exposes 5, 10 and 15 second presets, rounded to its frame grid (the backend caps at 345 frames / 14.375 seconds). Its official output range is 4–15 seconds; 2/3/30/60 second presets are available only in other video modes. Longer H3 films require a separate multi-clip assembly workflow.

## Desktop device coordination

Electron's `localInferenceCoordinator.js` owns the shared device queue. Chat,
streaming/proxied replies, workflow model loading and workflow completions use
that queue. Python media and background training acquire an authenticated
loopback socket lease before taking Flask's local inference mutex. Standalone
Python retains its local serialization when no desktop broker is configured.

Queued interactive requests precede queued workflow/background requests; aging
prevents indefinite background starvation. An active request finishes before
handoff. Workflow model switches evict the old instance, and cross-family
handoffs unload idle native models or clear Python caches. Chat launch settings
survive temporary suspension. Switching families therefore incurs reload cost.

The lease lasts until Python closes its socket, including process exit. It has
no expiry that could allow a second model to start during a slow generation.
Benchmark media probes return busy rather than queue behind user work. Failed
handoff preparation prevents the next inference from starting. This coordinates
BonzAI workloads; it does not bound one model's peak allocation or other apps.

Lightweight validation: `node --test test/local-inference-coordinator.test.mjs`
and `python -m unittest discover -s test -p test_inference_serialization.py`.
These tests use no inference models. Full roleplay memory profiling remains a
separate hardware validation step.

## Qwen Image 2.1 Standard, Turbo and editing

`/image/standard` (also `/image/qwen-2.1`) and `/image/image/standard` use
the Qwen Image 2.1 Q4_K_M transformer.
The official `Qwen/Qwen-Image-2.1` processor, Qwen3-VL text encoder, VAE,
scheduler and transformer configuration are required; the unquantized
transformer weights are excluded from downloads. Local GGUF filenames stay
lowercase; Hugging Face's remote filename uses `Q4_K_M`.

The Standard preset is 25 steps, true CFG 4, ER-SDE with a beta sigma schedule, and
`qwen-image-2.1-lora.safetensors` at strength 1. The adapter is published under
`models/` in the configured R2 bucket; `r2_models.py` records its size and SHA-256.
Packed BF16 normalization weights are decoded before Qwen reads them directly;
quantized linear weights remain packed. On supported Apple Silicon systems,
native BF16 avoids a full FP16 encoder copy. On constrained accelerators the
encoder uses sequential offloading that retains its original CPU weights; on
Metal, block boundaries drain outstanding transfers. This avoids allocating a
new CPU copy of each encoder layer when offloading after reference encoding.
Reference conditioning uses the
requested image area up to the upstream 1024-side default, rather than
upscaling small edit inputs to that default.

Fused gate/up adapter tensors are split into Diffusers projections without
changing their matrix update. Adapters are applied without fusing quantized
base weights. Both generation and editing use the same preset and record the
actual sampling settings in generation metadata.

The checkpoint declares `qwen-research`; do not substitute Apache/MIT metadata
or infer commercial publishing permission. Existing Klein generation records
retain their original license identity.

Regression checks: `python -m unittest discover -s test -p 'test_qwen_image*.py'`
and `node --test test/roleplay-media-pipelines.test.mjs test/mint-validation.test.mjs`.
Real generation/editing and packaged CUDA/ROCm builds require separate hardware
validation; the unit tests do not establish image quality or peak memory.

M1 Max / 32 GB smoke validation: 256×256 text-to-image and reference editing
both completed with 25 steps, CFG 4, ER-SDE/beta and LoRA strength 1. Visual
inspection confirmed a red teapot and an edit to cobalt blue preserving the
table and framing. Generation measured 807 s inference / 66 s loading; editing
802 s / 66 s. These are individual smoke runs, not throughput benchmarks.
Editing was validated after replacing encoder group offloading with sequential
offloading; the earlier placement hit the validation watchdog's memory floor.
Larger image sizes and CUDA/ROCm execution have not been hardware-validated by
these runs. The preset is substantially slower than a distilled low-step mode
on this hardware; do not promise interactive generation latency.

Turbo uses `unsloth/Qwen-Image-2.1-Turbo-GGUF` Q4_K_M at 8 steps / CFG 1,
with the official Euler scheduler and eight `sample_sigmas` from the Turbo
model index, passed explicitly at call time for the pinned Diffusers version.
Do not replace that distilled schedule with Standard’s ER-SDE/beta.
Routes `/image/turbo`, `/image/image/turbo`, and the legacy Klein route/manifest
aliases use Turbo. Negative prompting is inactive at CFG 1. Each variant
downloads its own official processor, encoder and VAE, excluding full-precision
transformer weights. Turbo components are repackaged differently; they are not
assumed interchangeable with Standard. The old SDXL endpoint is `/image/sdxl`.

LoRA compatibility: all 448 tensors after fused gate/up conversion resolve to
Turbo modules with matching dimensions. Architecture parameters match Standard
(the config’s Diffusers version differs). The adapter metadata says
`qwen_image_2`, not Turbo-specific training; structural compatibility does not
certify visual quality or preservation of Turbo distillation. Strength remains 1;
`use_lora: false` supports comparison without the adapter.

Upstream reference: https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo

Turbo M1 Max / 32 GB smoke validation (256×256, seed 42, adapter strength 1):
text-to-image completed in 156.829 s inference / 10.778 s loading; reference
editing completed in 151.822 s inference / 8.068 s loading. Both used eight
steps, CFG 1, the official Euler/sigma schedule, and the device coordinator
lease with a low-memory watchdog. The generated red teapot was successfully
edited to blue while retaining its composition. This establishes loading and
basic generation/edit compatibility, not adapter quality across all prompts,
larger-resolution memory safety, or CUDA/ROCm validation.

### Queued text requests and activity

The desktop coordinator publishes request IDs, monotonically increasing revisions,
queued/running/terminal states and a snapshot through `inference-queue-changed`
and `inference-queue-snapshot`. The activity store subscribes before retrieving
its snapshot and ignores older revisions. Python media retains its existing
queue/progress events; coordinator media records are excluded to avoid duplicates.
No prompts or model credentials are included in activity events.

`runLLMRequest` holds one lease across model selection/loading, completion and
history updates. Lyrics and shared roleplay helpers submit their model with the
completion instead of issuing separate load and chat calls. The selected model
is copied before waiting. Isolated requests preserve the interactive chat history.
An arriving media request waits until the whole text request completes; it cannot
suspend the model between loading and completion. Interactive requests retain
FIFO order at equal priority; existing background aging remains in effect.

Regression checks: `node --test test/local-inference-coordinator.test.mjs
test/llm-request-lease.test.mjs test/activity-operations.test.mjs` and
`BONZAI_UI_URL=http://localhost:5173 node --test test/application-activity.browser.test.mjs`.

Training and uncensoring workers publish queue records before acquiring the same
lease; their running records survive a queue snapshot/reconnect. Their failures
must propagate as a false worker result or an exception, never a successful
Activity completion. Finger-frame analysis and composition also use the device
queue. User-submitted training uses interactive priority; autonomous workflow
inference retains background priority.

Local streaming requests register cancellation before waiting. Registering another
request never aborts an existing one, and completion removes only its own
controller. Remote chat bypasses the device lease and can run concurrently with
local work. A queued local request retains its local routing even if the user
changes inference source while it waits.

After changing Electron main/preload, run `npm run build:main` and
`npm run build:preload` before restarting Electron. Restarting `electron .`
without rebuilding continues to load the old `.vite/build` code.

Music admission validation (32 GiB M1 Max, 290 seconds, 8 steps): the previous
streamed estimate required 12.67 GiB available and rejected a 10.77 GiB snapshot
before loading. The tiled/streamed estimate requires 10.26 GiB instead. A monitored
full-length run produced 290 seconds of finite, non-silent stereo audio at 48 kHz
in 179.4 seconds; peak Metal allocation was 3.22 GiB, minimum available memory
5.19 GiB, and maximum observed swap growth 0.64 GiB. An earlier test stopped at
its 2 GiB swap-growth watchdog during loading; the successful repeat retained
that same watchdog. This validates this duration/settings with the smoke-test
lyrics, not every lyric length, background workload, or device. Resident-mode
admission, the host reserve, and critical-pressure guards remain unchanged.
