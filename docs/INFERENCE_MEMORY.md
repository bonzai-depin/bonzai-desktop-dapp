# Inference memory lifecycle

BonzAI uses request-local placement optimizations without changing checkpoint,
LoRA strength, scheduler, CFG, resolution, or frame count. The policy selects
placement; it does not reject a job based on available memory.

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
- **Klein / Z-Image:** adaptive placement, bounded GGUF projections where
  applicable, release encoders when denoising starts and denoiser before decode.
  Safetensors Z-Image uses ordinary layer offloading, not GGUF conversion.
- **LTX-2:** leaf offloading compatible with bounded GGUF bases, release
  encoders at denoising, release transformer before video decoding, and release
  the video decoder before audio decoding.
- **SDXL:** encode prompts before loading the denoiser onto the accelerator;
  release the base before loading the refiner, retaining the shared VAE and
  second text encoder. Use tiled decode and leaf offloading on constrained GPUs.
- **ACE-Step:** adaptive CPU offloading by default; an explicit API `offload`
  boolean still overrides it. Keep the same-family cache for repeated requests.
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

The broader non-H3 placement optimizations remain implementation-only: no
inference, benchmarks or builds have validated those changes yet.

### H3 adapter selection

The hybrid H3 checkpoint runs without external adapters. The GGUF fallback uses only the legacy `h3_lora.safetensors` preset at strength 0.5. The experimental `h3_extra.safetensors` adapter is no longer loaded, even if present locally. Response `loras` metadata records external adapters actually applied.

H3 currently exposes 5, 10 and 15 second presets, rounded to its frame grid (the backend caps at 345 frames / 14.375 seconds). Its official output range is 4–15 seconds; 2/3/30/60 second presets are available only in other video modes. Longer H3 films require a separate multi-clip assembly workflow.
