# ACE-Step v1.5 + LTX-2 Music Video Pipeline

## Overview

Generate AI music videos by chaining ACE-Step v1.5 (music generation) with LTX-2 19B (audio-conditioned video generation). The user provides a text prompt + optional lyrics + a reference image, and gets back a video where visual motion is driven by the generated music's beats, rhythm, and intensity.

**Key insight**: BonzAI's `/video` endpoint already supports `audio_base64` input for audio-conditioned video generation via the LTX-2 Audio VAE + bidirectional cross-attention. The frontend simply doesn't use it yet. The main work is connecting ACE-Step output to the video endpoint and building a unified UI.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ GenerativeAudio.vue (or new MusicVideoForge UI)      │
│                                                      │
│  1. User enters: genre tags, lyrics, duration        │
│  2. User provides: reference image (character/scene) │
│  3. User provides: video prompt (camera/motion desc) │
│                                                      │
│  Step 1: POST /audio/music → ACE-Step v1.5           │
│  Step 2: Read audio from returned path               │
│  Step 3: POST /video with audio_base64 + image       │
│  Step 4: Display video result with synced audio       │
└──────────────┬───────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────┐
│ Flask Server (diffuser.py)                           │
│                                                      │
│  /audio/music                                        │
│  ├─ ACE-Step v1.5 DiT handler                        │
│  ├─ Returns: { audio_path: "/path/to/song.wav" }     │
│  │                                                   │
│  /video                                              │
│  ├─ audio_base64 → _encode_audio_to_latents()        │
│  │   ├─ Resample to 24kHz                            │
│  │   ├─ Mel spectrogram (128 mels, 1024 FFT)         │
│  │   ├─ AutoencoderKLLTX2Audio.encode()              │
│  │   └─ Audio latents → bidirectional cross-attention │
│  ├─ image_base64 → i2v pipeline                      │
│  ├─ LTX2ImageToVideoPipeline.__call__(               │
│  │     audio_latents=audio_latents)                  │
│  └─ Returns: { video_path: "/path/to/video.mp4" }    │
└──────────────────────────────────────────────────────┘
```

---

## What Already Exists

| Component | Status | Location |
|-----------|--------|----------|
| ACE-Step v1.5 `/audio/music` endpoint | Done | `diffuser.py` line ~4059 |
| LTX-2 `/video` endpoint with `audio_base64` support | Done | `diffuser.py` line ~4247 |
| `_encode_audio_to_latents()` helper | Done | `diffuser.py` line ~335 |
| Audio VAE loading (`AutoencoderKLLTX2Audio`) | Done | `diffuser.py` line ~412 |
| Audio → video latent conditioning via `audio_latents` kwarg | Done | `diffuser.py` line ~4473 |
| Custom audio muxing into final MP4 | Done | `diffuser.py` line ~4519 |
| Music mode in GenerativeAudio.vue | Done | template + script |
| Image picker in GenerativeVideo.vue | Done | `onImagePicked()` |
| `/media/stream` endpoint for serving local files | Done | `diffuser.py` |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/server/diffuser.py` | Add `/audio/music-video` orchestrator endpoint |
| `src/components/GenerativeAudio.vue` | Add "Music Video" button on generated audio results |
| `src/components/GenerativeVideo.vue` | Accept pending audio from sessionStorage, send `audio_base64` in payload |
| `src/skills/flagship.js` | Add `music_video` skill definition (optional) |

---

## Part 1: Server-Side Orchestrator Endpoint

### 1a. New `/audio/music-video` endpoint in `diffuser.py`

A single endpoint that chains both steps server-side, avoiding a large base64 round-trip through the renderer.

**Location**: After the existing `/audio/music` endpoint.

```python
@app.route("/audio/music-video", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["video"], allow_demo=True)
def audio_music_video():
    """
    Generate a music video: ACE-Step audio → LTX-2 audio-conditioned video.

    Parameters:
        # Music params (forwarded to ACE-Step)
        prompt (str): Genre/style caption
        lyrics (str, optional): Song lyrics with section markers
        duration (int): Song duration in seconds (10-600, default 30)
        steps (int): ACE-Step inference steps (default 8)
        guidance_scale (float): ACE-Step CFG (default 7.0)
        seed (int): Music seed (-1 for random)
        bpm (int, optional): Tempo 30-300
        keyscale (str, optional): Musical key
        instrumental (bool): No vocals (default false)
        vocal_language (str): Language code (default "en")

        # Video params
        video_prompt (str): Scene/motion description for the video
        image_base64 (str, optional): Reference image for i2v mode
        height (int): Video height (default 480)
        width (int): Video width (default 768)
        frames (int): Frame count, must be 8n+1 (default 97)
        frame_rate (float): FPS (default 24)
        video_steps (int): LTX-2 inference steps (default 10)
        video_guidance (float): LTX-2 CFG (default 1.0)
        video_seed (int): Video seed (-1 for random)

        auto_download (bool): Auto-download models (default false)
    """
```

**Flow**:
1. Parse and validate all params
2. Call ACE-Step generation (reuse `_load_ace_step()` and `generate_music()` logic)
3. Read the generated WAV file from disk
4. Trim/pad audio to match video duration: `frames / frame_rate` seconds
5. Encode audio bytes to base64
6. Call the LTX-2 video generation logic internally (not via HTTP — directly invoke the pipeline code)
7. Return `{ ok: true, video_path, audio_path, duration, mode: "music-video" }`

**Why server-side orchestration**: The generated audio file can be 5-50 MB. Reading it from disk and passing it directly to the video pipeline avoids a round-trip through IPC + renderer + HTTP.

**Alternative**: If the orchestrator is too complex, the frontend can do two sequential calls:
1. `POST /audio/music` → get `audio_path`
2. `GET /media/stream?path=<audio_path>` → fetch audio bytes
3. Base64 encode in renderer
4. `POST /video` with `audio_base64` + `image_base64`

This alternative is simpler but adds latency and memory pressure on the renderer.

---

## Part 2: Frontend — "Create Music Video" Flow

### 2a. Option A: Button on GenerativeAudio results

Add a "Music Video" action button to each audio inference result in GenerativeAudio.vue, next to the existing Download/Delete/Copy/Mint buttons.

**Template** (after the Download button in the results list):
```html
<button
  v-if="inference.isMusic"
  class="button is-medium is-info copy is-pulled-right ml-2 p-0 pl-1 pr-4"
  @click="sendToMusicVideo(inference)"
  title="Create a music video from this song"
>
  <span class="material-symbols-outlined is-size-2 mr-1">
    movie
  </span>
  Music Video
</button>
```

**Script**:
```javascript
const sendToMusicVideo = async (inference) => {
  const audioPath = inference?.answer?.data?.audio_path;
  if (!audioPath) return;

  // Store audio path for GenerativeVideo to pick up
  sessionStorage.setItem("pendingMusicVideoAudio", audioPath);
  sessionStorage.setItem("pendingMusicVideoPrompt", inference.question || "");

  // Navigate to video tab
  window.dispatchEvent(
    new CustomEvent("navigate-to-tab", { detail: { tab: "video" } })
  );
};
```

### 2b. GenerativeVideo.vue — Accept pending audio

On mount (alongside the existing `pendingI2VImage` check):

```javascript
// Check for pending music video audio from GenerativeAudio
const pendingAudioPath = sessionStorage.getItem("pendingMusicVideoAudio");
const pendingMusicPrompt = sessionStorage.getItem("pendingMusicVideoPrompt");
if (pendingAudioPath) {
  sessionStorage.removeItem("pendingMusicVideoAudio");
  sessionStorage.removeItem("pendingMusicVideoPrompt");

  // Fetch audio bytes and convert to base64
  const audioUrl = `${API_BASE}/media/stream?path=${encodeURIComponent(pendingAudioPath)}`;
  const resp = await fetch(audioUrl);
  const blob = await resp.blob();
  const reader = new FileReader();
  reader.onload = () => {
    pendingAudioBase64.value = reader.result.split(",")[1]; // strip data URL prefix
  };
  reader.readAsDataURL(blob);

  // Pre-fill video prompt from music caption
  if (pendingMusicPrompt) {
    form.prompt = `Music video: ${pendingMusicPrompt}`;
  }

  musicVideoMode.value = true;
}
```

**New reactive state**:
```javascript
const pendingAudioBase64 = ref("");
const musicVideoMode = ref(false);
```

**Update `sendMessage()` payload**:
```javascript
// Add audio conditioning if available
if (pendingAudioBase64.value) {
  payload.audio_base64 = pendingAudioBase64.value;
}
```

**UI indicator**: Show a small notification when music video mode is active:
```html
<div v-if="musicVideoMode" class="notification is-info is-light mb-3">
  <span class="material-symbols-outlined mr-2">music_note</span>
  <strong>Music Video Mode</strong> — Video motion will sync to the generated song.
  <button class="delete" @click="musicVideoMode = false; pendingAudioBase64 = ''"></button>
</div>
```

### 2c. Option B: Dedicated Music Video tab/mode in GenerativeAudio

Instead of bouncing between tabs, add a "Music Video" sub-mode in GenerativeAudio.vue itself (alongside TTS / Clone / Music). This mode shows:
- All existing music inputs (prompt, lyrics, duration)
- PLUS an image picker (reference frame)
- PLUS a video prompt field
- PLUS video settings (resolution, fps)

On submit, it calls the server-side `/audio/music-video` orchestrator. The result is a video, displayed inline with the same `<video>` player used in GenerativeVideo.

This approach keeps the workflow in one place but adds significant UI complexity to GenerativeAudio.

**Recommendation**: Start with Option A (button + tab navigation). It reuses existing components and requires minimal new UI. Option B can be added later as a polished experience.

---

## Part 3: Server-Side Orchestrator Implementation Details

### `_chain_music_to_video()` helper

```python
def _chain_music_to_video(
    music_audio_path: str,
    video_prompt: str,
    image_b64: str = "",
    height: int = 480,
    width: int = 768,
    frames: int = 97,
    frame_rate: float = 24.0,
    video_steps: int = 10,
    video_guidance: float = 1.0,
    video_seed: int = -1,
):
    """
    Take a local audio file path (from ACE-Step) and generate
    an audio-conditioned video using the LTX-2 pipeline.
    """
    # 1. Read audio file
    audio_bytes = Path(music_audio_path).read_bytes()

    # 2. Calculate target video duration
    target_duration = frames / frame_rate

    # 3. Trim/pad audio to match video duration
    #    (reuse existing _encode_audio_to_latents which handles this)

    # 4. Load LTX-2 pipeline (same logic as /video endpoint)
    # 5. Encode audio to latents
    # 6. Run pipeline with audio_latents
    # 7. Mux original audio into output video
    # 8. Return output path
```

### Audio duration alignment

ACE-Step can generate up to 600s of audio. LTX-2 video is typically 3-10s (due to VRAM). The orchestrator should:
- Generate the full song with ACE-Step
- For the video, use only the first N seconds of audio (matching `frames / frame_rate`)
- Mux the FULL audio track into the final video, so the song plays in its entirety while the video portion loops or shows a still frame after the generated frames end
- OR: generate multiple video segments and concatenate (advanced, Phase 2)

**Simple approach** (Phase 1): Generate a short synced video clip (5-10s) with the song's intro/chorus, then mux the full audio. The video acts as a "music video teaser" — motion synced to the opening bars.

**Advanced approach** (Phase 2): Segment the audio into chunks, generate a video segment per chunk with different prompts/images, concatenate with ffmpeg. This produces a full-length music video with scene changes.

---

## Part 4: Video Duration vs Audio Duration Strategy

| Strategy | Description | Complexity |
|----------|-------------|------------|
| **Teaser clip** | 5-10s video synced to audio intro, full audio muxed | Low |
| **Loop** | Short video loops while full audio plays | Low |
| **Multi-segment** | Split audio into N chunks, generate N video clips, concatenate | High |
| **Keyframe slideshow** | Generate multiple images, crossfade between them synced to beats | Medium |

**Recommended for Phase 1**: Teaser clip. The user gets a short video with motion synced to the music, and the full song plays as the audio track. This matches what most AI music video tools produce today.

---

## Part 5: Optional Enhancements

### 5a. Beat detection for prompt variation (Phase 2)

Use `librosa.beat.beat_track()` on the ACE-Step output to detect beat positions. Generate different video prompts per musical section:
- Intro: slow camera movement, establishing shot
- Verse: medium pace, character focus
- Chorus: fast cuts, dynamic motion, wide shots
- Drop/Bridge: dramatic lighting changes

### 5b. MelBandRoformer source separation (Phase 2)

Pre-process ACE-Step audio through MelBandRoformer to separate vocals from instruments. Use the vocal track for lip-sync conditioning and the instrumental track for motion conditioning. This could improve how well visual motion matches the music's energy.

**Model**: `MelBandRoformer_fp16.safetensors` (~456 MB) from [Kijai/MelBandRoFormer_comfy](https://huggingface.co/Kijai/MelBandRoFormer_comfy)

### 5c. Lip-sync post-processing (Phase 3)

After generating the base music video, apply a lightweight lip-sync model:
- **Wav2Lip** (~1 GB VRAM, Mac support) for basic lip replacement
- **LatentSync** (6.5 GB VRAM) for higher quality

This would add actual mouth movement synced to vocals on top of the rhythm-synced base video.

### 5d. Spatial/temporal upscaling (Phase 2)

LTX-2 provides upscaler LoRAs:
- `ltx-2-spatial-upscaler-x2-1.0.safetensors` (996 MB) — 2x resolution
- `ltx-2-temporal-upscaler-x2-1.0.safetensors` (262 MB) — 2x frame rate

Apply these to the base video for higher quality output.

---

## Dependencies

### Already installed
- `diffusers` (with `LTX2Pipeline`, `LTX2ImageToVideoPipeline`, `AutoencoderKLLTX2Audio`)
- `ace-step` 1.5.0 (from git)
- `torch`, `torchaudio`, `soundfile`
- LTX-2 GGUF model weights

### No new dependencies needed for Phase 1

The audio encoding path (`_encode_audio_to_latents`) and the LTX-2 pipeline already handle everything. The only new code is the orchestration logic and frontend wiring.

### Phase 2 dependencies (optional)
- `librosa` — beat detection (already in ace-step deps)
- `mel_band_roformer` — source separation (~456 MB model)
- `ffmpeg-python` — video concatenation for multi-segment

---

## Verification

### Phase 1 (Music Video Teaser):
1. Open GenerativeAudio, select Music mode
2. Generate a song (e.g. "pop rock, energetic, electric guitar, 120bpm")
3. After audio appears in results, click "Music Video" button
4. App navigates to GenerativeVideo tab with audio pre-loaded
5. Upload or pick a reference image (character)
6. Enter a video prompt ("A singer performing on stage, dynamic camera, concert lighting")
7. Click generate
8. Verify the output video has motion synced to the music's rhythm
9. Verify audio plays in the video

### Server-side orchestrator (if implemented):
1. `POST /audio/music-video` with music params + video params + image
2. Verify both ACE-Step and LTX-2 run sequentially
3. Verify output MP4 has synced audio-video
4. Verify generation bus shows progress for both stages

---

## Summary

The hardest part — audio-conditioned video generation via LTX-2's dual-stream architecture — is already implemented in the backend. The remaining work is frontend wiring (passing audio from GenerativeAudio to GenerativeVideo) and optionally a server-side orchestrator endpoint for a seamless single-request workflow. No new model downloads are required beyond what's already configured for ACE-Step v1.5 and LTX-2 GGUF.
