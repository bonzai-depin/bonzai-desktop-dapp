# OpenRouter consumer inference

Open Network Settings, select Consumer Mode, then OpenRouter. Connect an API key created at <https://openrouter.ai/settings/keys> with a credit limit, select a language model and output-token limit, and confirm remote processing. Save with **Use OpenRouter**. No wallet is required.

The language choice applies to chat, roleplay, workflow LLM calls and Three.js scene/game code, including automated calls. Separate selectors opt images, speech, video and image analysis into OpenRouter. Unselected media categories remain explicitly local. Select BonzAI Network to offload supported pipelines to peers. Standardized hardware benchmarks continue calling local engines directly. A selected OpenRouter model replaces built-in local LLM selections; local model settings remain saved for switching back.

## Credentials, privacy and charges

- Main-process `safeStorage` encrypts the API key. There is no plaintext fallback, including Linux `basic_text`. Generic store IPC cannot read or overwrite the credential/configuration namespace.
- The renderer receives connection state, catalogue and account allowance, never the saved key. Requests use the fixed HTTPS OpenRouter origin and reject redirects.
- The consent covers submitted conversations and workflow inputs. Chat does not automatically add personal memory recall to remote requests, and local chat history is not automatically copied into the remote conversation.
- The API key's upstream credit limit controls spend across concurrent requests and devices. The local output-token ceiling limits each completion. OpenRouter bills the user; this is not BonzAI provider service time, token savings, protocol revenue or rewards.
- Upstream failures are shown without silently falling back to another inference source. Disconnect removes the saved key and selects BonzAI Network; switching to Private Mode restores local routing.

## Implementation and attribution

`src/main/openrouter.js` owns transport, SSE parsing, model discovery and credentials. `model-chat`, `model-chat-stream` and `zhc-chat-stream` share it. Local download prerequisites are bypassed only for selected remote categories, including their auxiliary files. `openrouterMedia.js` adapts dedicated image, TTS and video APIs to the existing media result contracts. Company creation actions, flagship skills and generation views share routing. Errors never silently trigger local generation.

Each API call includes `HTTP-Referer: https://bonzai.sh`, `X-OpenRouter-Title: BonzAI` and the roleplay, creative-writing and personal-agent categories. Genuine usage can contribute to OpenRouter app attribution; no synthetic ranking traffic is generated.

Completed calls append model, timing, token counts and reported cost to the local `openrouter.usage` ledger (latest 1,000 records), without prompts or keys. Account spend remains authoritative, including interrupted calls whose final usage was not returned. Chat metadata also preserves reported usage and the actual model.

## Validation

- `node --test test/openrouter.test.mjs test/wallet-credentials.test.mjs`
- `BONZAI_UI_URL=http://127.0.0.1:5179 node --test test/openrouter.browser.test.mjs` with a renderer-only test server.
- Renderer, main and preload builds; use temporary output directories when the application is running.

Tests mock OpenRouter and never spend credits. A live request with a user's capped key is still required to verify their account, balance and chosen provider. Main/preload changes require restarting the rebuilt desktop application.

## Media behavior and current boundaries

- Images: `/images/models` discovery and `/images` generation, including PNG/JPEG/WebP references. Raster outputs preserve MIME type and measured dimensions. Unsupported vector output is rejected.
- Speech: `/models?output_modalities=speech` discovery and `/audio/speech` generation. Set a provider voice ID; audio references use the provider's supported cloning route instead. Output is saved as MP3 in the local blob store; FFmpeg measures duration for production assembly. Unsupported provider cloning requests fail without substitution.
- Vision: only language models accepting image inputs appear in the image-analysis selector. Chat can attach images when its selected language model supports them.
- Video: `/videos/models` supplies supported duration, ratio and resolution controls. `/videos` creates a job; only fixed-origin authenticated polling/content endpoints are used. Job IDs survive restarts. **Network Settings → OpenRouter → Video jobs → Recover video** resumes downloading without submitting another paid job, and adds the result to Video history. Polling stops after 30 minutes; the job remains recoverable. Stopping polling or leaving Consumer Mode does not cancel an upstream job or guarantee a refund.
- Media files remain on this device. Binary downloads have bounded memory limits (64 MiB audio, 256 MiB video). No API key is forwarded to returned third-party URLs. No local paths are read implicitly from renderer media requests.
- Music: remains on the existing music engine. The documented speech and conversational-audio APIs are not treated as full-song synthesis. Seed Audio documents sound/ambience prompts, but this is not validated as a replacement for BonzAI's lyrics, duration and music controls.
- 3D: the selected language model generates Three.js code; BonzAI renders/executes it locally. This is not a native mesh-generation API. Training and uncensoring remain local.
- Media costs are recorded when returned by the provider. Binary speech responses do not report a final price, so their cost is unknown rather than zero. Account usage is authoritative.

References: [image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation), [speech API](https://openrouter.ai/docs/guides/overview/multimodal/tts), [video API](https://openrouter.ai/docs/guides/overview/multimodal/video-generation).

Additional deterministic checks: `node --test test/openrouter-media.test.mjs`. Provider-account validation remains necessary before calling any media route production-verified.
