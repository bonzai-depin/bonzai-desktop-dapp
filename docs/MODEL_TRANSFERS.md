# Model transfers

Large single-file downloads use four concurrent 32 MiB HTTP ranges when the server advertises byte ranges, a known length and a strong ETag. Completed chunks are retained beside the destination in `.parts` and reused only when URL, ETag, size and chunk size match. Each chunk retries up to three times, range boundaries and lengths are checked, and the final filename is published only after assembly. Unsupported hosts use the existing Electron downloader. Multipart GGUF downloads retain their existing pipeline. This is transfer concurrency, not a measured bandwidth guarantee or a cryptographic authenticity check.

Tune and Uncensor model rows expose **Hugging Face**. The preview allows only model weights, tokenizer and model configuration files; metadata, datasets, checkpoints, logs and symbolic links are excluded. Metadata-only training records cannot publish. LoRA and tokenizer subdirectories are mapped to the repository root, with conflicting names rejected.

Uploading requires a new `owner/repository`, a write token, reviewed file manifest and explicit confirmation. Repositories default to private. Existing repositories are never overwritten or changed to another visibility. Tokens are not persisted. The background worker uses `huggingface_hub`, reports completion only after a commit, and returns the commit link. Closing the view does not cancel the upload; reopening in the same renderer session resumes status polling. Restarting the Python server loses job status. Failed uploads may leave a newly created repository; inspect it before retrying under a new name.

Validation: `node --test test/parallel-download.test.mjs test/download-cancellation.test.mjs`, `python3 test/test_hub_publish.py`, and `BONZAI_UI_URL=<local-preview> node --test test/hub-publish.browser.test.mjs`. Fixtures use local HTTP and a mocked Hub API; they do not publish artifacts or establish production transfer throughput.

## Turbo: Klein 9B Q4_K_M

After restarting the Python service, Turbo uses the Unsloth
`flux-2-klein-9b-Q4_K_M.gguf` transformer. The saved filename is lowercase.
`POST /image/turbo` generates images; `POST /image/image/turbo` edits a reference
provided as `image_base64` or `image_url`. The experimental route
`POST /image/experimental/klein-9b` remains an alias for text-to-image testing.

The equivalent `image_turbo`, `flux_klein`, and `flux_klein_9b_gguf` download plans fetches the GGUF plus the original 9B
repository's text encoder, tokenizer, VAE, scheduler and configuration files.
It excludes original transformer weights. The text encoder is **not quantized**
in this implementation. Access to the supporting repository may require accepting
its terms and configuring the existing local Hugging Face token.

```sh
curl -sS http://127.0.0.1:65000/pipelines/plan \
  -H 'Content-Type: application/json' \
  -d '{"pipeline":"flux_klein_9b_gguf","deep_validate":true}'

curl -sS http://127.0.0.1:65000/image/experimental/klein-9b \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A ceramic teapot on a wooden table, soft window light","width":768,"height":768,"steps":4,"seed":42,"auto_download":true}' \
  -o /tmp/bonzai-klein-9b-result.json
```

If assets are missing, the second call starts downloads and returns HTTP 202;
it does not queue generation. Monitor the returned pipeline ID using
`GET /downloads/status/<pipeline_id>`, then repeat the generation request after
completion. With `auto_download` omitted/false, missing assets return HTTP 412.
Existing download cancellation/retry endpoints work with this pipeline.

Success returns HTTP 201 with `image_path`, inline image data, `seed`, `device`,
`load_seconds`, and `inference_seconds`. Images are saved under the existing
model directory's `files` folder. Resolution must be a multiple of 16 from 256
to 4096; steps 1–20. Defaults are 768×768, 4 steps and seed 0.

MPS and CUDA (including ROCm through the PyTorch CUDA API) use explicit
device-targeted model CPU offload, VAE tiling and slicing. CPU uses float32;
MPS uses float16; CUDA uses bfloat16 when supported and float16 otherwise. The endpoint serializes its own requests (409 while busy),
but does not unload unrelated chat/media models. Close other heavy inference
jobs before measuring on a 32 GB Mac. Tests cover
validation, download gating, device selection, local-only loading editing and failure
cleanup; actual 9B generation speed/quality must be measured with the weights
installed. No new dependencies were added.

Tests: `python3 test/test_klein_9b_endpoint.py` and
`python3 test/test_image_requirements.py`.

### Local Turbo LoRA

Place `flux-2-klein-9b-lora.safetensors` and/or
`flux-2-klein-9b-lora-extra.safetensors` directly in `BONZAI_MODEL_DIR`
(default `~/bonzai-models`). Turbo generation, Turbo editing, and the experimental
alias automatically apply a single adapter at strength 1, or both adapters at 0.5 each. The extra adapter
works independently or alongside the original. No adapter download is
started, and a missing adapter does not block base-model generation.

API requests accept `use_lora: false` to bypass it and `lora_scale: 0.7` to adjust
a single adapter’s strength (finite values 0–2; zero disables it). When both files are used, each strength is fixed at 0.5. The adapter is loaded locally
through the FLUX.2 LoRA loader before device offload, using `set_adapters` without
fusing the GGUF weights. Full-factor LoKr adapters use shape-validated forward hooks in `klein_adapters.py`, following the [LyCORIS Kronecker formulation](https://github.com/KohakuBlueleaf/LyCORIS/blob/main/lycoris/functional/lokr.py); no new dependency or dense weight expansion is needed. Decomposed/Tucker/DoRA LoKr formats are explicitly rejected. Compatible Kohya-format adapters are handled by the
Diffusers loader. An invalid or incompatible installed adapter fails the request
rather than silently producing an unadapted image. Responses include the first applied `lora`, the complete `loras` list and
`lora_scale` so callers can see what was applied.

Both installed files were validated against the installed loader and Klein 9B architecture (144 LoKr hooks and 288 converted LoRA tensors). Numerical tests compare hooks to exact Kronecker multiplication, including Q/K/V splitting and cleanup. Endpoint tests cover generation/editing,
optional/disabled adapters, strengths and failure cleanup. Actual LoRA inference
on the quantized model remains hardware-unverified.

### Image negative conditioning

`IMAGE_NEGATIVE_PROMPT` in the Python image service defines the shared default
exclusions. SDXL and Z-Image requests merge caller-specific `negative_prompt`
terms with that list, deduplicating case-insensitively. Video defaults are unchanged.
SDXL supplies the result through its negative text embeddings. Z-Image currently
uses guidance 0, so its negative prompt is not active. Distilled Klein Turbo does
not apply negative conditioning; its response records the requested defaults but
returns `negative_prompt_applied: false`, as does Z-Image. These exclusions are
prompt preferences, not guaranteed output filters. They are never appended to the
positive prompt. Tests: `python3 test/test_image_negative_prompt.py`.

### Local Wan adapter stack

Wan image-to-video loads three optional high/low pairs from the model directory,
all at fixed strength **0.25**: `wan-lora-high.safetensors`,
`wan-lora-low.safetensors`, `wan-lora-animation-high-safetensors`,
`wan-lora-animation-low.safetensors`, `wan-lora-extra-high.safetensors`,
`wan-lora-extra-low.safetensors`. The animation-high filename is intentional.
Files are read explicitly as safetensors regardless of suffix. High adapters
apply to `transformer`; low adapters apply to `transformer_2`, before offloading,
without fusing GGUF weights. Missing files are logged and skipped; incompatible
present files fail the request. `use_general`, `use_animation`, and `use_extra`
may individually disable a pair with JSON `false`. The previous Physics adapters
and legacy strength overrides are no longer used. The response records applied
filenames, target transformers and strengths under `loras`.
