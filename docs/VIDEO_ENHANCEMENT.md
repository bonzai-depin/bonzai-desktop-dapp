# Video enhancement

`POST /video/enhance` restores video with **SeedVR2 3B FP16** by default. It is
used by the video history Enhance action and roleplay's existing enhancement
step. Real-ESRGAN remains available through `backend: "realesrgan"`.
Previously enhanced history entries can be restored with SeedVR2 too; their
saved original source is preferred over the legacy upscaled result.

Restart the Python service after upgrading. For a development checkout, use
the BonzAI environment and install the updated requirements. The only additional
runtime dependency for an otherwise current environment is
`python -m pip install --no-deps rotary-embedding-torch==0.8.9`.

## Request

```json
{
  "video_path": "/absolute/path/to/source.mp4",
  "backend": "seedvr2",
  "resolution": 720,
  "max_resolution": 1280,
  "batch_size": 5,
  "interp_factor": 1,
  "auto_download": true
}
```

Use the server's existing local API authentication headers. Supply exactly one
of `video_path` or raw `video_base64` (without a data-URL prefix).

| Option | Behavior |
| --- | --- |
| `backend` | `seedvr2` (default) or `realesrgan`; no silent backend substitution |
| `resolution` | Target short edge, 128–2160 pixels; default 720 |
| `max_resolution` | Long-edge cap, 128–3840; default 1280 |
| `batch_size` | 1, 5, 9, 13 or 17; default 5; lower values reduce memory use |
| `seed` | Integer 0–4294967295; default 42 |
| `interp_factor` | 1 (default), 2, 4 or 8; optional FFmpeg motion interpolation |
| `upscale` | Default true; false runs only encoding/optional interpolation |
| `variant` | `default`; `anime` requires the Real-ESRGAN backend |
| `auto_download` | Default false; true downloads missing assets through BonzAI |

Without explicit resolution controls, existing HD inputs retain at least their
input dimensions. SeedVR2 maintains aspect ratio, subject to its spatial alignment.
Response dimensions are measured from the encoded output. Resolution controls
apply to SeedVR2; Real-ESRGAN retains its fixed 4× spatial scaling.

This changes the old default of 4× frame interpolation to **original frame rate**.
Clients that need the previous temporal multiplier must explicitly request
`interp_factor: 4`. Current product callers preserve timing and do not claim 4×
spatial scaling. Upscaling can reconstruct or invent detail; it cannot guarantee
identity or factual fidelity.

## Assets and runtime

The preflight pipeline `video_enhance` (alias `video_enhance_seedvr2`) downloads:

- `seedvr2_ema_3b_fp16.safetensors` — 6,783,018,808 bytes.
- `ema_vae_fp16.safetensors` — 501,324,814 bytes.
- The standalone runtime archive — about 4.9 MB.

The manifest in `src/server/video_enhance.py` pins checkpoint and runtime
revisions, exact sizes and SHA-256 checksums. Code is checksum-verified before
extraction. Runtime code and its license come from
[numz/ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler);
checkpoints come from [numz/SeedVR2_comfyUI](https://huggingface.co/numz/SeedVR2_comfyUI).
Neither the ComfyUI application nor a remote inference service is required.

Missing assets return 412 without download permission, or 202 with a download
pipeline ID. Product callers poll the download to completion (up to two hours),
then submit inference once more. Failed/cancelled downloads surface an error.
The explicit legacy preflight is `video_enhance_realesrgan`.

Inference is offline. A separate worker process uses bounded video chunks,
temporal context, tiled VAE encoding/decoding and SDPA attention. CUDA/ROCm uses
CPU offload and block swapping; MPS uses unified memory with a bounded Metal
allocator; CPU uses float32 compute. No FlashAttention, Triton, CUDA-only wheel
or Torch compilation is required. Runtime exit releases its models. Flask's
existing device lock serializes enhancement with other multimodal inference.

The output is H.264/yuv420p MP4 with fast-start metadata. Source audio is
retained as AAC. Source files are unchanged. Temporary inputs/intermediates and
failed output files are removed. Frame counts are decoded and checked before
reporting success; non-finite model outputs fail instead of saving corrupt frames.
Roleplay retains the original clip and records a failed enhancement if restoration fails.

## Validation

```sh
bonzai/bin/python test/test_video_enhance.py
bonzai/bin/python test/test_single_file_download.py
bonzai/bin/python test/test_inference_serialization.py
node --test test/video-enhance.test.mjs test/roleplay-media-pipelines.test.mjs
```

Run a real model test with synthetic video, using already downloaded assets:

```sh
BONZAI_SEEDVR2_TEST_MODELS=/absolute/model/directory \
  bonzai/bin/python test/test_video_enhance.py \
  VideoEnhanceTest.test_real_seedvr2_endpoint_with_two_batches_audio_and_spatial_upscale
```

Validated on M1 Max/MPS: 10 synthetic frames, 192×128 → 384×256, 5 fps,
two processing chunks, audio retained, approximately 52 seconds including model
loading and output validation. This is an integration smoke test, **not a 720p
quality or speed benchmark**. CUDA/ROCm, CPU inference and packaged executables
have not been hardware-validated by this test.
