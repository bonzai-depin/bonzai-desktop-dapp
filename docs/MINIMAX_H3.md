# MiniMax H3 video

BonzAI exposes MiniMax H3 at `POST /video/sota`. The endpoint generates video and synchronized stereo audio from a text prompt, with an optional first-frame image.

## GGUF fallback model files

| Component | Source | Format |
| --- | --- | --- |
| H3 FL2VA transformer | `unsloth/MiniMax-H3-GGUF` / `minimax_h3_fl2va_pruned-UD-Q2_K_XL.gguf` | GGUF UD-Q2_K_XL |
| Qwen3-VL conditioner | `unsloth/MiniMax-H3-GGUF` / `qwen3vl_32b_minimax_h3-Q2_K_M.gguf` | GGUF Q2_K_M |
| Video VAE | `unsloth/MiniMax-H3-GGUF` / `vae/minimax_h3_video_vae_fp16.safetensors` | Safetensors FP16 |
| Audio VAE | `unsloth/MiniMax-H3-GGUF` / `vae/minimax_h3_audio_vae_fp32.safetensors` | Safetensors FP32 |
| Required local motion LoRA | Local model directory / `h3_lora.safetensors` | Safetensors LoRA |
| Component configs, tokenizer, processor, schedulers | `MiniMaxAI/MiniMax-H3` | Official Diffusers metadata |

The downloader fetches the four Unsloth files and the small official Diffusers metadata. It does not fetch the official BF16 transformer, conditioner, or three-shard video VAE. Every downloaded file is resumable, checked against its Hub-reported size, and safetensors files are validated before the pipeline becomes ready.

The standalone VAEs are not in Diffusers state-dict form. BonzAI converts them while loading: the video loader renames the legacy encoder tree, splits fused QKV projections, and reorders the gated FFN; the audio loader reconstructs weight-normalization parameters from Unsloth's effective convolution weights. Loading is streamed from safetensors into a meta-initialized model so conversion does not allocate a second complete VAE.

The pruned Q2_K_XL transformer also uses the Comfy/Unsloth curve-form AdaLN layout rather than the full official timestep MLP: a shared `adaln_t_table` with 1,025 rows and rank 8 feeds the reduced per-block projections. BonzAI detects this layout, interpolates the curve for continuous timesteps, and bypasses the second SiLU used by the full Diffusers model.

`h3_lora.safetensors` is not part of the download plan while BonzAI does not host it. Place it directly in BonzAI's model directory. The GGUF preset requires and applies it at strength `0.5`; Turbo, HyperFlow, `h3_extra.safetensors`, and `h3_more.safetensors` are not loaded. There are no UI controls or API flags for this backend preset. The Diffusers loader accepts Diffusers and common Musubi/Kohya/Comfy H3 key layouts, attaches the low-rank branch without merging into read-only GGUF tensors, and rejects incomplete or unmatched adapters.

`scripts/install-python-deps.py` upgrades the matching PyTorch nightly trio with `--no-cache-dir --upgrade --pre`, then installs the reviewed H3 Diffusers revision with `--no-cache-dir --upgrade --no-deps`. macOS defaults to the nightly CPU/MPS index and Windows/Linux to CUDA 13.0; set `BONZAI_TORCH_INDEX_URL` for another nightly backend. Release jobs install their matrix-specific nightly first and invoke the script with `--skip-torch`.

## Local hybrid checkpoint on Apple Silicon

If `h3_hybrid.safetensors` exists in the configured model directory, `/video/sota`
uses it instead of downloading/loading the transformer GGUF. The conditioner,
VAEs and official metadata remain unchanged. Remove or rename the local override
while no generation is running to return to GGUF. Unsupported or corrupt hybrid
files fail explicitly; they never silently fall back to a different model.

The current inspected hybrid has 200 `int8_tensorwise` ConvRot layers.
The loader also supports the earlier mixed INT8/`asym_w4a8_int8` format
with W4 group sizes 4, 8 and 16. BonzAI reads scales, codebooks and rotations from
its metadata. It reconstructs W4 weights to INT8 in bounded output-row chunks.
On compatible MPS/PyTorch builds the linear operator uses
`aten::_weight_int8pack_mm`; other devices/shapes use chunked FP32 computation.
This is compressed storage with GPU computation, not a promise of integer
hardware acceleration. No ComfyUI, comfy-kitchen or MLX dependency is installed.

The local hybrid preset assumes a checkpoint with its desired adapters already
merged, so the legacy external `h3_lora.safetensors` is **not** added again.
The quantization header alone does not establish which adapters were merged. The hybrid default is **Euler / simple, 8 steps, guidance
1**; the GGUF preset retains Euler ancestral and its external LoRA at 0.5.
Both samplers accept 4–8 steps. ER-SDE/beta57, res_multistep and LCM have not been
implemented or validated and are rejected, not remapped to Euler. The renderer
lets the backend select the checkpoint-specific default. Saved results identify
the checkpoint, actual sampler and whether adapters are already merged.

Validation: `bonzai/bin/python test/test_h3_quantized.py -v` exercises CPU and MPS
math; `test/test_minimax_h3_gguf.py` covers existing mapping and LoRA behavior.
These are operator/loader checks, not an end-to-end video quality benchmark.

## Memory strategy

The endpoint does not materialize BF16 copies of the complete transformer or conditioner. GGUF tensors remain memory-mapped and packed on CPU until their active leaf executes. Vocabulary embeddings dequantize only the rows used by the prompt.

Generation runs as isolated phases:

1. Encode the prompt and optional keyframe with the truncated Qwen3-VL conditioner.
2. Release the conditioner.
3. Prepare the H3 layout, noise, and video/audio schedules.
4. Denoise with the UD-Q2_K_XL H3 transformer using leaf-level CPU offload.
5. Release the transformer.
6. Decode video and audio and mux them into MP4.

The conditioner GGUF intentionally contains the first 50 decoder layers consumed by H3. BonzAI bypasses the language-model head, the unused final decoder layers, and the final language-model norm to preserve the expected layer-50 pre-norm state.

MPS follows H3's official mixed-precision contract: the Qwen conditioner and transformer stack use BF16, while patch projections, curve-driven AdaLN controls, timestep data, and output heads remain FP32. CUDA uses its selected FP16/BF16 compute dtype with the same FP32 exceptions. The audio VAE stays FP32 as published by Unsloth, while the video VAE is promoted to FP32 for its CPU decode on MPS. A 16 GB accelerator is the current conservative minimum target for the smallest preset; the quantized weights also require substantial host RAM. CPU-only execution is structurally supported but is not expected to be practical for production video generation.

## Request

```json
{
  "prompt": "A paper lantern boat crosses a moonlit lake",
  "width": 960,
  "height": 544,
  "num_frames": 124,
  "num_inference_steps": 8,
  "sampler": "euler_ancestral",
  "guidance_scale": 1,
  "license_accepted": true,
  "auto_download": true
}
```

H3 runs at 24 fps. Dimensions are normalized to multiples of 32 and frame counts to `17n + 5`. Supported duration is 5 to 15 seconds. `image_base64` or `image_url` adds first-frame conditioning.

The GGUF preset uses 4–8 transformer evaluations and defaults to 8. It runs the rectified-flow Euler ancestral update over H3's simple shifted schedule, using video shift `12`, audio shift `3`, guidance scale `1`, and motion-LoRA strength `0.5`. H3 is guidance-distilled, so scale `1` means one conditional forward pass rather than a separate classifier-free guidance branch. The endpoint also supports deterministic Euler for the hybrid preset described above. Unsupported samplers, guidance values, and step counts outside 4–8 are rejected.

Decoded audio is checked for finite samples and receives transparent peak normalization only when it would otherwise clip during AAC conversion. The response reports the decoded peak and applied export gain for diagnostics; this does not denoise, enhance, or replace H3's native synchronized soundtrack.

## Terms

MiniMax H3 is governed by the [MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE). The desktop UI records explicit local acceptance before downloading or invoking the model, and the server rejects requests that do not carry that consent. BonzAI also lists the model in the in-app license view.

## Verification

```bash
python test/test_minimax_h3_gguf.py
npm run build:renderer
```

The loader tests cover packed GGUF linear execution, selective Q2_K embedding rows, H3 projection mapping, and the SOTA artifact contract. A full inference smoke test additionally requires roughly 27 GB of model downloads and suitable accelerator memory.

## MPS memory containment

A full hybrid generation caused a macOS watchdog panic with exhausted swap and
saturated compressor segments. Small operator tests do not validate full-pipeline
memory safety. The H3 route now limits its MPS allocator to 70% of Metal's
recommended working-set size. Hybrid admission additionally requires available
system memory of twice the checkpoint file size plus 8 GiB (about 47.1 GiB for
the current 20.97 GB file). This conservative loader/copy allowance is not a measured
peak: larger canvases and longer clips can still run out of memory. It rejects
the current hybrid checkpoint on 32 GiB machines before loading models. Further
loader and activation-memory optimization and controlled peak-memory testing
are required before advertising this configuration as supported on those machines.
No automatic fallback or generation retry is performed by this admission check.

### INT8 checkpoint measurements (2026-10-14)

The replacement `h3_hybrid.safetensors` is 20,970,414,464 bytes with 200
`int8_tensorwise` layers, plus BF16/FP32 supporting tensors. Header-only
quantization metadata is accepted; conflicting redundant metadata is rejected.
Contiguous Q/K/V splits retain mmap storage. MPS hybrid inference excludes
quantized linears from whole-layer group offloading, transferring slices inside
the forward instead. Token and output-row chunks are both 256, with MPS
synchronization between tiles to bound queued temporaries. This prioritizes
memory headroom; full-video throughput has not been measured.

A CPU loader probe completed in 7.33 s, with 1.70 GiB peak process RSS and
300 installed quantized projections (Q/K/V split), with no meta parameters
remaining. A separate MPS probe of the largest projection,
`transformer_blocks.0.ff.net.0.proj`, processed `[256, 5376]` to `[256, 28672]`
in 0.346 s with finite output and the native INT8 kernel. Its peak process
RSS was 1.83 GiB; reported MPS driver allocation after the operation was
0.071 GiB (not an accelerator peak measurement). Both probes were isolated,
monitored with a 4 GiB RSS stop threshold, a 6 GiB available-memory floor,
and a 90 s timeout. These are sampled stop thresholds, not hard OS quotas.

The old admission guard is intentionally still in place pending complete
attention/denoising/decode validation. For the new file it requests 47.1 GiB
available memory; the loader measurement shows this is not an actual loading
requirement. Do not interpret these partial tests as a full-generation success
or remove the guard merely to force a run.

### Conditioner and decoder memory work

The MPS conditioner keeps both GGUF linears and the vocabulary embedding
file-backed on CPU. Linears dequantize 256 output rows at a time; embedding
lookup dequantizes only requested vocabulary rows. BF16 GGUF bytes are viewed
as BF16 directly on little-endian platforms, avoiding a whole-tensor FP32
intermediate. On MPS, Qwen and hybrid-transformer block boundaries release
unused allocator cache when available system RAM drops below 8 GiB.

The CPU video decoder retains half-precision affine/conv storage, computes
using temporary FP32 weights, and converts linear weights in 512-row tiles.
Tiny norm/modulation parameters stay FP32. This preserves FP32 arithmetic
without promoting the complete 4.5 GiB decoder to 9 GiB. The tile-boundary
input cast follows compute dtype rather than storage dtype.

Measured bounded probes on 2026-10-14:

- Before conditioner changes: stopped at 21.6 s during prompt encoding when
  system swap grew by 1.02 GiB; peak process RSS was 6.02 GiB.
- With GGUF streaming and direct BF16 views: prompt encoding completed in
  approximately 58 s and denoising reached block 10. Peak process RSS was
  1.77 GiB; sampled MPS driver allocation during denoising was about 1.05 GiB.
  The monitor stopped at 106.3 s when available system RAM fell below 5 GiB,
  with no additional swap. This is partial execution, not a completed video.
- Standalone streamed CPU decoder, synthetic latent `[1,24,4,4,4]`: output
  `[1,3,16,64,64]` was finite. Loading took 5.16 s, decoding 1.76 s, and
  peak process RSS including mapped file pages was 8.214 GiB. The test kept
  a 6 GiB system-headroom floor and a 1 GiB swap-growth limit. This verifies
  the decoder path on a small input, not final-generation visual quality.

Do not conflate process RSS, GPU driver allocation, and system memory pressure.
The probes monitor system headroom and swap as well as process memory.

The pressure-reclaim probe reached transformer block 25 of its first
denoising step before the unchanged system-headroom monitor stopped it at
142.1 s (4.93 GiB available). Peak process RSS was 1.84 GiB, sampled MPS
driver allocation was about 1.04 GiB during denoising, and swap growth
remained zero. No full video was produced. A bounded CPU staging-copy
experiment increased process RSS and was reverted. These runs do not prove
full inference fits a 32 GiB machine; production admission remains unchanged.

### Bounded file reads on MPS

`h3_weight_stream.py` reads packed rows into a reusable per-thread staging
buffer. On macOS the read descriptor uses `F_NOCACHE`; it does not change global
cache settings or modify model files. MPS GGUF projections, vocabulary lookups,
and contiguous hybrid INT8/W4 projections use this path. CPU/CUDA retain their
existing tensor paths. QKV offsets and reordered embedding rows are preserved.
Transfers are synchronous before the staging buffer can be reused.

Hybrid projection traversal now quantizes activations once into INT8 storage
and visits output rows before token chunks. Each weight tile is read once per
projection, instead of once per token chunk; FP32 activation arithmetic remains
bounded. The tests compare streamed and resident MPS results and check read
counts, byte preservation, truncated files, and row bounds.

The initial file-streaming probe completed prompt encoding with roughly 13 GiB
available, but still hit the 1 GiB swap-growth stop during denoising at 98.7 s.
This run preceded the weight-major traversal change. Subsequent full validation
was blocked by the execution approval reviewer because swap pressure had
accumulated; a host restart was requested. No complete hybrid video or 32 GiB
production support had been validated at that point. The conservative admission guard remains.

### Completed post-reboot smoke test (2026-10-14)

The optimized INT8 pipeline completed one full text-to-video request on the
32 GiB Apple Silicon host: 256 × 256, 124 frames at 24 fps, Euler/simple,
four steps, guidance 1, seed 12345. Prompt: a red paper lantern beside a
Japanese garden pond. The isolated test replaced only the unmeasured admission
estimate; production admission was not disabled. The supervisor required
10 GiB available to start and stopped on less than 5 GiB available, more than
1 GiB added swap, more than 10 GiB process RSS, or a 30-minute timeout.

- Endpoint completed in 735.05 s (12 min 15 s).
- Peak sampled process RSS: 9.80 GiB, during CPU decoding.
- Minimum sampled system memory available: 6.57 GiB; additional swap: zero.
- Export: H.264, 256 × 256, 124 frames, 24 fps; AAC stereo at 32 kHz.
- FFmpeg decoded the entire MP4 without errors. Frames 12, 60 and 110 showed
  a recognizable red lantern and garden, with no black/gray-frame failure.

Local evidence and the video are in `.cache/h3-validation/2026-10-14/` (ignored
artifacts). This validates one small T2V case, not the standard 960 × 544 UI
preset, image conditioning, eight steps, or repeated requests. Do not present
this smoke test as general 32 GiB production qualification. Other presets remain unvalidated.

### In-app generation

SOTA offers **256x256**. Text to video at 5 seconds uses four steps and
124 frames, matching the completed smoke test. The H3-specific available-memory
admission gate, swap-pressure abort hooks, and custom MPS allocator cap have been
removed. Other presets and image conditioning can now run without this gate;
this does not extend the validation results above to those configurations.
Packed weight streaming and staged model cleanup remain in place.

Image-conditioned generation orients the selected canvas to match the source
image, as Wan does. Both uploaded images and image URLs are handled by the
backend. Restart the Python backend to load these changes.
