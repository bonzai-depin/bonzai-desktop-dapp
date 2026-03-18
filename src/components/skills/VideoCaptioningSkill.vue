<template>
  <div class="captioning-skill">
    <!-- Header -->
    <div
      v-if="!isFullscreen"
      class="models__activity--payouts mb-4 has-text-left"
    >
      <h2 class="skill-name is-size-1 fira-sans-condensed-black-italic mb-2">
        <span class="material-symbols-outlined" style="font-size: 48px">
          closed_caption
        </span>
        Video Captioning
      </h2>
      <p class="skill-description is-size-5">
        {{
          skill?.description ||
          "Generate real-time captions and transcripts from any video using AI vision analysis."
        }}
      </p>
    </div>

    <!-- Model Loading Status -->
    <div v-if="!isFullscreen && modelLoading" class="model-status-bar mb-4">
      <span
        class="material-symbols-outlined rotating mr-2"
        style="font-size: 20px"
      >
        progress_activity
      </span>
      <span>Loading vision model...</span>
    </div>

    <!-- Video Source Selector + Reset -->
    <div v-if="!isFullscreen && !videoLoaded" class="mb-4">
      <span class="category-selector mb-4">
        <template v-for="mode in captionModes" :key="mode.id">
          <input
            type="radio"
            name="caption_mode"
            :id="'caption_' + mode.id"
            :value="mode.id"
            :checked="selectedMode === mode.id"
            @change="selectedMode = mode.id"
          />
          <label :for="'caption_' + mode.id" class="radio category pt-3 pb-3">
            <span
              class="material-symbols-outlined mr-1"
              style="font-size: 18px"
            >
              {{ mode.icon }}
            </span>
            {{ mode.name }}
          </label>
        </template>
      </span>

      <!-- File Select -->
      <div v-if="selectedMode === 'file'" class="has-text-left mt-5 mb-5">
        <button
          class="button is-success is-large mt-1 mb-1"
          @click="selectVideoFile"
        >
          <span class="material-symbols-outlined mr-2">folder_open</span>
          Select Video File
        </button>
      </div>

      <!-- URL Input -->
      <div v-else class="columns is-vcentered mt-4 mb-3">
        <div class="column is-8">
          <div class="field">
            <div class="control has-icons-left">
              <input
                class="input is-large"
                type="text"
                v-model="videoUrl"
                placeholder="Paste direct video URL (.mp4, .webm)..."
                @keyup.enter="loadVideoFromUrl"
                style="
                  background: rgba(255, 255, 255, 0.05);
                  border-color: rgba(255, 255, 255, 0.1);
                  color: white;
                "
              />
              <span class="icon is-left">
                <span class="material-symbols-outlined">link</span>
              </span>
            </div>
          </div>
        </div>
        <div class="column is-4">
          <button
            class="button is-success is-large is-fullwidth"
            @click="loadVideoFromUrl"
            :disabled="!videoUrl"
          >
            <span class="material-symbols-outlined mr-2">download</span>
            Load Video
          </button>
        </div>
      </div>
    </div>

    <!-- Video Display Area -->
    <div
      ref="captionDisplay"
      class="caption-display-wrapper"
      :class="{ 'is-fullscreen': isFullscreen }"
    >
      <div class="caption-display" :class="{ 'is-active': videoLoaded }">
        <!-- Video Element -->
        <video
          v-if="videoSrc"
          ref="videoPlayer"
          class="caption-video"
          :src="videoSrc"
          loop
          @loadedmetadata="onVideoLoaded"
          @timeupdate="onTimeUpdate"
          @ended="onVideoEnded"
          @play="onVideoPlay"
          @pause="onVideoPause"
          crossorigin="anonymous"
        ></video>

        <!-- Play/Pause Overlay -->
        <div
          v-if="videoLoaded"
          class="video-overlay"
          :class="{ 'show-icon-persistent': !hasEverPlayed || !isPlaying }"
          @click="togglePlayPause"
        >
          <transition name="overlay-fade">
            <span
              v-if="showOverlayIcon || !hasEverPlayed || !isPlaying"
              class="material-symbols-outlined overlay-icon"
            >
              {{ isPlaying ? "pause" : "play_arrow" }}
            </span>
          </transition>
        </div>

        <!-- Hidden Canvas for Frame Extraction -->
        <canvas ref="captureCanvas" class="is-hidden"></canvas>

        <!-- Loading State -->
        <div class="caption-content" v-if="isGenerating && !videoLoaded">
          <span
            class="material-symbols-outlined rotating"
            style="font-size: 64px; opacity: 0.8"
          >
            progress_activity
          </span>
          <p class="is-size-5 mt-3 has-text-white">{{ generationStatus }}</p>
          <progress
            class="progress is-small mt-3"
            :value="generationProgress"
            max="100"
            style="max-width: 300px; margin: 0 auto"
          ></progress>
        </div>

        <!-- Idle State -->
        <div class="caption-content" v-if="!videoLoaded && !isGenerating">
          <span
            class="material-symbols-outlined"
            style="font-size: 120px; opacity: 0.15"
          >
            videocam
          </span>
          <p class="is-size-5 mt-3 has-text-grey-light">
            Load a video to begin captioning
          </p>
        </div>

        <!-- Fullscreen Toggle -->
        <button
          v-if="videoLoaded"
          class="fullscreen-toggle"
          :class="{ 'm-5': isFullscreen }"
          @click="toggleFullscreen"
          :title="isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen'"
        >
          <span class="material-symbols-outlined">
            {{ isFullscreen ? "fullscreen_exit" : "fullscreen" }}
          </span>
        </button>
      </div>

      <!-- Caption Bar — below the video, always visible -->
      <div class="caption-bar" v-if="videoLoaded">
        <div class="caption-bar-inner" v-if="currentCaption">
          <span class="caption-bar-text has-text-brand">
            {{ currentCaption }}
          </span>
        </div>
        <div class="caption-bar-inner caption-bar-idle" v-else>
          <span
            class="material-symbols-outlined"
            style="font-size: 18px; opacity: 0.4"
          >
            closed_caption
          </span>
          <span class="caption-bar-text has-text-grey-light">
            {{
              captioningActive
                ? "Waiting for next frame..."
                : "Captioning paused"
            }}
          </span>
        </div>
      </div>
    </div>

    <!-- Analyzing Notification (top-right toast) -->
    <transition name="toast-slide">
      <div v-if="isAnalyzing" class="analyzing-toast">
        <span class="material-symbols-outlined rotating toast-spinner">
          progress_activity
        </span>
        <span class="toast-text">Analyzing frame...</span>
      </div>
    </transition>

    <!-- Controls (visible only when video is loaded) -->
    <div class="controls-section mt-4" v-if="!isFullscreen && videoLoaded">
      <!-- Reset button row -->
      <div class="is-flex is-justify-content-flex-end mb-3"></div>

      <!-- Capture Interval + Progress -->
      <div class="models__activity--payouts">
                  <button
            class="button is-danger is-medium is-pulled-right"
            @click="resetAll"
            title="Reset"
          >
            <span class="material-symbols-outlined mr-2 is-size-3">
              restart_alt
            </span>
            Start Over
          </button>
        <div class="volume-control mb-3 has-text-left">
          <span
            class="has-text-brand fira-sans-condensed-black-italic is-size-3"
          >
            Frame capture interval ({{ captureInterval }}s)
          </span>
          <input
          class="mt-5 mb-5"
            type="range"
            min="1"
            max="10"
            step="1"
            v-model.number="captureInterval"
          />
        </div>

        <!-- Progress Bar -->
        <div class="field mb-5" v-if="totalDuration > 0">
          <div
            style="
              display: flex;
              justify-content: space-between;
              margin-bottom: 4px;
            "
          >
            <span class="is-size-7 has-text-grey-light">
              {{ formatTime(currentTime) }}
            </span>
            <span class="is-size-7 has-text-grey-light">
              {{ formatTime(totalDuration) }}
            </span>
          </div>
          <progress
            class="progress is-medium"
            :value="currentTime"
            :max="totalDuration"
          ></progress>
        </div>
      </div>
    </div>

    <hr v-if="transcript.length > 0" />

    <!-- Transcript Panel -->
    <div
      class="transcript-panel mt-4 has-text-left"
      v-if="transcript.length > 0 && !isFullscreen"
    >
      <h3 class="fira-sans-condensed-black-italic is-size-3 mb-5">
        <span class="has-text-brand">
          <span class="material-symbols-outlined mr-2 is-size-3">
            description
          </span>
          Transcript ({{ transcript.length }} entries)
        </span>
      </h3>
      <hr />
      <div class="transcript-entries" ref="transcriptContainer">
        <div
          v-for="(entry, index) in transcript"
          :key="index"
          class="transcript-entry"
          :class="{ 'is-current': activeCueIndex === index }"
          @click="seekToEntry(entry)"
        >
          <span class="timestamp fira-sans-condensed-black-italic">
            {{ formatTime(entry.timestamp) }}
          </span>
          <span class="entry-text">{{ entry.text }}</span>
          <button
            class="delete-entry"
            @click.stop="deleteEntry(index)"
            title="Delete entry"
          >
            <span class="material-symbols-outlined" style="font-size: 16px">
              close
            </span>
          </button>
        </div>
      </div>

      <!-- Export SRT (below transcript) -->
      <button
        class="button is-info is-large mt-5 mb-5"
        @click="exportTranscript"
      >
        <span class="material-symbols-outlined mr-2">download</span>
        Export SRT
      </button>
    </div>

    <!-- Session History -->
    <div
      class="session-history mt-5"
      v-if="sessionHistory.length > 0 && !isFullscreen"
    >
      <h4 class="is-size-6 fira-sans-condensed-black-italic mb-3 has-text-left">
        <span class="has-text-brand fira-sans-condensed-black-italic is-size-3">
          <span class="material-symbols-outlined mr-1 is-size-3">history</span>
          Recent Sessions
        </span>
      </h4>
      <div class="session-list">
        <div
          v-for="(session, index) in sessionHistory.slice(0, 5)"
          :key="index"
          class="session-card"
          @click="loadSession(session)"
        >
          <div class="session-card-icon">
            <span class="material-symbols-outlined">closed_caption</span>
          </div>
          <div class="session-card-info">
            <p class="session-card-title fira-sans-condensed-black-italic">
              {{ session.filename || "Video Session" }}
            </p>
            <p class="session-card-meta">
              {{ session.entryCount }} captions ·
              {{ formatDuration(session.duration) }} ·
              {{ formatDate(session.createdAt) }}
            </p>
          </div>
          <button
            class="button is-small is-danger"
            @click.stop="deleteSession(index)"
            title="Delete session"
          >
            <span class="material-symbols-outlined" style="font-size: 18px">
              delete
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { getAuthHeaders } from "../../services/auth.service.js";

const STORAGE_KEY = "video-captioning-sessions";
const MAX_FRAME_WIDTH = 960;
const JPEG_QUALITY = 0.88;
const SIMILARITY_THRESHOLD = 0.7;

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

/**
 * Simple word-overlap similarity (Jaccard) to detect near-duplicate captions.
 */
function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(
    a
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/),
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/),
  );
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

export default {
  name: "VideoCaptioningSkill",

  props: {
    skill: { type: Object, default: null },
    modelAvailable: { type: [Function, Boolean], default: true },
  },

  emits: ["caption-created", "status-update"],

  setup(props, { emit }) {
    // ─── Refs ────────────────────────────────────────────────────────
    const videoPlayer = ref(null);
    const captureCanvas = ref(null);
    const captionDisplay = ref(null);
    const transcriptContainer = ref(null);
    const activeCueEl = ref(null);

    // ─── State ───────────────────────────────────────────────────────
    const selectedMode = ref("file");
    const videoSrc = ref("");
    const videoUrl = ref("");
    const videoFilename = ref("");
    const videoLoaded = ref(false);
    const isPlaying = ref(false);
    const isFullscreen = ref(false);
    const videoEnded = ref(false);
    const isGenerating = ref(false);
    const isAnalyzing = ref(false);
    const generationStatus = ref("");
    const generationProgress = ref(0);
    const showOverlayIcon = ref(false);
    const hasEverPlayed = ref(false);
    const modelLoading = ref(false);
    const modelReady = ref(false);

    const captioningActive = ref(true);
    const captureInterval = ref(3);
    const currentTime = ref(0);
    const totalDuration = ref(0);
    const currentCaption = ref("");
    const transcript = ref([]);
    const sessionHistory = ref([]);

    let captureTimer = null;
    let captureInFlight = false;
    let overlayTimeout = null;

    // ─── Active Cue Tracking ─────────────────────────────────────────
    const activeCueIndex = computed(() => {
      const t = currentTime.value;
      const entries = transcript.value;
      if (entries.length === 0) return -1;
      let best = -1;
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].timestamp <= t) best = i;
        else break;
      }
      return best;
    });

    // Scroll transcript to bottom when new entries are added (not on cue change)
    watch(
      () => transcript.value.length,
      () => {
        nextTick(() => {
          if (transcriptContainer.value) {
            transcriptContainer.value.scrollTop =
              transcriptContainer.value.scrollHeight;
          }
        });
      },
    );

    // ─── Caption Modes ───────────────────────────────────────────────
    const captionModes = [
      {
        id: "file",
        name: "Local File",
        icon: "folder_open",
        description: "Select from disk",
      },
      {
        id: "url",
        name: "Direct Video URL",
        icon: "link",
        description: ".mp4 / .webm links",
      },
    ];

    // ─── Computed ────────────────────────────────────────────────────
    const backgroundStyle = computed(() => ({}));

    // ─── Model Auto-Loading ──────────────────────────────────────────
    const ensureModelLoaded = async () => {
      if (modelReady.value || modelLoading.value) return;
      modelLoading.value = true;
      try {
        // Trigger prefetch which downloads the model if needed
        const res = await fetch(`${API_BASE}/pipelines/prefetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ pipeline: "vision_mlx" }),
        });
        if (res.ok) {
          modelReady.value = true;
        }
      } catch (e) {
        console.warn("[VideoCaptioning] Model prefetch failed:", e);
      } finally {
        modelLoading.value = false;
      }
    };

    // ─── Video Loading ───────────────────────────────────────────────
    const selectVideoFile = async () => {
      try {
        const filePath = await window.electronAPI?.selectVideoFile?.();
        if (filePath) {
          videoFilename.value = filePath.split("/").pop() || "video";
          videoSrc.value = `local-video://${filePath}`;
          return;
        }
      } catch (e) {
        console.warn(
          "[VideoCaptioning] IPC file select unavailable, using fallback:",
          e,
        );
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
          videoFilename.value = file.name;
          videoSrc.value = URL.createObjectURL(file);
        }
      };
      input.click();
    };

    const loadVideoFromUrl = async () => {
      if (!videoUrl.value) return;
      const url = videoUrl.value.trim();

      let urlPath;
      try {
        urlPath = new URL(url).pathname.toLowerCase();
      } catch {
        generationStatus.value = "Invalid URL.";
        isGenerating.value = true;
        setTimeout(() => {
          isGenerating.value = false;
          generationStatus.value = "";
        }, 3000);
        return;
      }

      const directExts = [
        ".mp4",
        ".webm",
        ".mov",
        ".avi",
        ".mkv",
        ".ogv",
        ".m4v",
      ];
      const isDirect = directExts.some((ext) => urlPath.endsWith(ext));

      if (!isDirect) {
        generationStatus.value =
          "Only direct video URLs (.mp4, .webm, etc.) are supported. YouTube and streaming pages are not supported.";
        isGenerating.value = true;
        setTimeout(() => {
          isGenerating.value = false;
          generationStatus.value = "";
        }, 4000);
        return;
      }

      videoFilename.value = url.split("/").pop()?.split("?")[0] || "video";
      isGenerating.value = true;
      generationStatus.value = "Downloading video...";
      generationProgress.value = 20;

      try {
        const tempPath = await window.electronAPI?.downloadVideoToTemp?.(url);
        if (tempPath) {
          videoSrc.value = `local-video://${tempPath}`;
          generationProgress.value = 100;
        } else {
          throw new Error("Download returned no path");
        }
      } catch (e) {
        console.error("[VideoCaptioning] Failed to download video:", e);
        generationStatus.value = `Download failed: ${e.message}`;
        setTimeout(() => {
          isGenerating.value = false;
          generationStatus.value = "";
        }, 3000);
      }
    };

    // ─── Frame Extraction ────────────────────────────────────────────
    const captureFrame = () => {
      const video = videoPlayer.value;
      const canvas = captureCanvas.value;
      if (!video || !canvas) return null;

      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    };

    // ─── Vision Analysis ─────────────────────────────────────────────
    const analyzeFrame = async (imageDataUrl, frameTime) => {
      if (isAnalyzing.value || !captioningActive.value) return null;
      isAnalyzing.value = true;

      try {
        const base64Data = imageDataUrl.includes(",")
          ? imageDataUrl.split(",")[1]
          : imageDataUrl;

        const prompt = `Describe this video frame at ${frameTime.toFixed(1)}s. Focus on visible action, people, objects, text on screen, and scene composition. Keep it concise and factual in 1-2 sentences.`;

        const response = await fetch(`${API_BASE}/vision/caption`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            image_base64: base64Data,
            prompt,
            max_tokens: 200,
            auto_download: true,
          }),
        });

        if (!response.ok) {
          console.warn("[VideoCaptioning] Vision API error:", response.status);
          return null;
        }

        const data = await response.json();
        if (!data.success || !data.response) return null;
        const text = data.response.trim();

        // Client-side deduplication: skip if too similar to last caption
        const lastText = transcript.value.length
          ? transcript.value[transcript.value.length - 1].text
          : null;
        if (
          lastText &&
          textSimilarity(text, lastText) >= SIMILARITY_THRESHOLD
        ) {
          return null;
        }

        return text;
      } catch (e) {
        console.error("[VideoCaptioning] Frame analysis error:", e);
        return null;
      } finally {
        isAnalyzing.value = false;
      }
    };

    // ─── Caption Loop ────────────────────────────────────────────────
    const startCaptionLoop = () => {
      stopCaptionLoop();
      captureTimer = setInterval(async () => {
        if (captureInFlight || !isPlaying.value || !captioningActive.value)
          return;
        captureInFlight = true;

        try {
          const frame = captureFrame();
          if (!frame) return;

          const frameTime = videoPlayer.value?.currentTime || 0;
          const caption = await analyzeFrame(frame, frameTime);

          if (caption) {
            currentCaption.value = caption;
            transcript.value.push({
              timestamp: frameTime,
              text: caption,
            });
          }
        } finally {
          captureInFlight = false;
        }
      }, captureInterval.value * 1000);
    };

    const stopCaptionLoop = () => {
      if (captureTimer) {
        clearInterval(captureTimer);
        captureTimer = null;
      }
      captureInFlight = false;
    };

    // ─── Playback Controls ───────────────────────────────────────────
    const playVideo = () => {
      const video = videoPlayer.value;
      if (!video || !videoLoaded.value) return;
      if (videoEnded.value) {
        video.currentTime = 0;
        videoEnded.value = false;
      }
      video.play();
    };

    const pauseVideo = () => {
      videoPlayer.value?.pause();
    };

    const togglePlayPause = () => {
      if (!videoLoaded.value) return;
      if (isPlaying.value) {
        pauseVideo();
      } else {
        playVideo();
      }
      // Flash overlay icon briefly
      showOverlayIcon.value = true;
      clearTimeout(overlayTimeout);
      overlayTimeout = setTimeout(() => {
        showOverlayIcon.value = false;
      }, 800);
    };

    const toggleCaptioning = () => {
      captioningActive.value = !captioningActive.value;
      if (captioningActive.value && isPlaying.value) {
        startCaptionLoop();
      } else {
        stopCaptionLoop();
      }
    };

    const seekToEntry = (entry) => {
      const video = videoPlayer.value;
      if (!video) return;
      video.currentTime = entry.timestamp;
      currentCaption.value = entry.text;
    };

    const deleteEntry = (index) => {
      transcript.value.splice(index, 1);
      if (transcript.value.length === 0) {
        currentCaption.value = "";
      }
    };

    // ─── Video Events ────────────────────────────────────────────────
    const onVideoLoaded = () => {
      const video = videoPlayer.value;
      if (!video) return;
      videoLoaded.value = true;
      totalDuration.value = video.duration;
      isGenerating.value = false;
      hasEverPlayed.value = false;
    };

    const onTimeUpdate = () => {
      currentTime.value = videoPlayer.value?.currentTime || 0;
      // Only sync caption from cue index when NOT actively captioning
      // (i.e. during scrubbing/seeking through existing transcript).
      // While captioning is live, the caption loop sets currentCaption directly.
      if (!captioningActive.value || !isPlaying.value) {
        const idx = activeCueIndex.value;
        if (idx >= 0 && transcript.value[idx]) {
          currentCaption.value = transcript.value[idx].text;
        }
      }
    };

    const onVideoEnded = () => {
      isPlaying.value = false;
      videoEnded.value = true;
      stopCaptionLoop();
      saveSession();
    };

    const onVideoPlay = () => {
      isPlaying.value = true;
      hasEverPlayed.value = true;
      videoEnded.value = false;
      if (captioningActive.value) startCaptionLoop();
    };

    const onVideoPause = () => {
      isPlaying.value = false;
      stopCaptionLoop();
    };

    // ─── Fullscreen ──────────────────────────────────────────────────
    const toggleFullscreen = () => {
      if (isFullscreen.value) exitFullscreen();
      else enterFullscreen();
    };

    const enterFullscreen = () => {
      const el = captionDisplay.value;
      if (!el) return;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      isFullscreen.value = true;
    };

    const exitFullscreen = () => {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      isFullscreen.value = false;
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        isFullscreen.value = false;
      }
    };

    const handleKeydown = (e) => {
      if (e.key === "Escape" && isFullscreen.value) exitFullscreen();
      if (e.key === " " && videoLoaded.value && e.target.tagName !== "INPUT") {
        e.preventDefault();
        togglePlayPause();
      }
    };

    // ─── Transcript Export ───────────────────────────────────────────
    const exportTranscript = () => {
      if (transcript.value.length === 0) return;

      let srt = "";
      transcript.value.forEach((entry, i) => {
        const startTime = formatSRT(entry.timestamp);
        const endSec =
          transcript.value[i + 1]?.timestamp ||
          entry.timestamp + captureInterval.value;
        const endTime = formatSRT(endSec);
        srt += `${i + 1}\n${startTime} --> ${endTime}\n${entry.text}\n\n`;
      });

      const blob = new Blob([srt], { type: "text/srt" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${videoFilename.value || "video"}_captions.srt`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const formatSRT = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.round((seconds % 1) * 1000);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
    };

    const formatTime = (seconds) => {
      if (!seconds || isNaN(seconds)) return "0:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    };

    const formatDuration = (seconds) => {
      if (!seconds || isNaN(seconds)) return "";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      if (m > 0) return `${m}m${s}s`;
      return `${s}s`;
    };

    const formatDate = (iso) => {
      try {
        return new Date(iso).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return iso;
      }
    };

    // ─── Session Persistence ─────────────────────────────────────────
    const saveSession = () => {
      if (transcript.value.length === 0) return;

      const session = {
        filename: videoFilename.value,
        entryCount: transcript.value.length,
        duration: totalDuration.value,
        transcript: transcript.value.map((e) => ({
          timestamp: e.timestamp,
          text: e.text,
        })),
        createdAt: new Date().toISOString(),
      };

      sessionHistory.value.unshift(session);
      if (sessionHistory.value.length > 10) {
        sessionHistory.value = sessionHistory.value.slice(0, 10);
      }

      emit("caption-created", session);
    };

    const loadSession = (session) => {
      transcript.value = (session.transcript || []).map((e) => ({
        timestamp: e.timestamp,
        text: e.text,
      }));
      videoFilename.value = session.filename || "video";
      currentCaption.value =
        transcript.value.length > 0
          ? transcript.value[transcript.value.length - 1].text
          : "";
    };

    const deleteSession = (index) => {
      sessionHistory.value.splice(index, 1);
    };

    const saveSessionHistory = async () => {
      try {
        const store = window.electronAPI?.store;
        if (store?.set) {
          const plain = sessionHistory.value.map((s) => ({
            filename: String(s.filename || ""),
            entryCount: Number(s.entryCount || 0),
            duration: Number(s.duration || 0),
            createdAt: String(s.createdAt || ""),
            transcript: (s.transcript || []).slice(0, 50).map((e) => ({
              timestamp: Number(e.timestamp || 0),
              text: String(e.text || ""),
            })),
          }));
          await store.set(STORAGE_KEY, structuredClone(plain));
        }
      } catch (e) {
        console.error("[VideoCaptioning] Failed to save session history:", e);
      }
    };

    const loadSessionHistory = async () => {
      try {
        const store = window.electronAPI?.store;
        if (store?.get) {
          const data = await store.get(STORAGE_KEY, []);
          if (Array.isArray(data)) {
            sessionHistory.value = data;
          }
        }
      } catch (e) {
        console.warn("[VideoCaptioning] Failed to load session history:", e);
      }
    };

    // ─── Reset ───────────────────────────────────────────────────────
    const resetAll = () => {
      stopCaptionLoop();
      if (videoPlayer.value) {
        videoPlayer.value.pause();
        videoPlayer.value.currentTime = 0;
      }
      if (isFullscreen.value) exitFullscreen();

      if (transcript.value.length > 0) saveSession();

      videoSrc.value = "";
      videoLoaded.value = false;
      isPlaying.value = false;
      videoEnded.value = false;
      hasEverPlayed.value = false;
      currentCaption.value = "";
      transcript.value = [];
      currentTime.value = 0;
      totalDuration.value = 0;
    };

    // ─── Watchers ────────────────────────────────────────────────────
    watch(sessionHistory, saveSessionHistory, { deep: true });

    watch(captureInterval, () => {
      if (isPlaying.value && captioningActive.value) startCaptionLoop();
    });

    // ─── Lifecycle ───────────────────────────────────────────────────
    onMounted(() => {
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
      document.addEventListener("keydown", handleKeydown);
      loadSessionHistory();
      // Auto-load vision model on mount
      ensureModelLoaded();
    });

    onUnmounted(() => {
      stopCaptionLoop();
      clearTimeout(overlayTimeout);
      if (videoPlayer.value) videoPlayer.value.pause();
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener("keydown", handleKeydown);
      if (videoSrc.value?.startsWith("blob:"))
        URL.revokeObjectURL(videoSrc.value);
    });

    return {
      videoPlayer,
      captureCanvas,
      captionDisplay,
      transcriptContainer,
      activeCueEl,
      selectedMode,
      captionModes,
      videoSrc,
      videoUrl,
      videoFilename,
      videoLoaded,
      isPlaying,
      isFullscreen,
      videoEnded,
      isGenerating,
      isAnalyzing,
      generationStatus,
      generationProgress,
      showOverlayIcon,
      hasEverPlayed,
      modelLoading,
      modelReady,
      captioningActive,
      captureInterval,
      currentTime,
      totalDuration,
      currentCaption,
      transcript,
      activeCueIndex,
      sessionHistory,
      backgroundStyle,
      selectVideoFile,
      loadVideoFromUrl,
      playVideo,
      pauseVideo,
      togglePlayPause,
      toggleCaptioning,
      toggleFullscreen,
      seekToEntry,
      deleteEntry,
      exportTranscript,
      resetAll,
      loadSession,
      deleteSession,
      formatTime,
      formatDuration,
      formatDate,
      onVideoLoaded,
      onTimeUpdate,
      onVideoEnded,
      onVideoPlay,
      onVideoPause,
    };
  },
};
</script>

<style scoped>
.captioning-skill {
  width: 100%;
  position: relative;
}

/* ─── Category Selector (MeditationForge pattern) ────────────────── */
.category-selector {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5em;
}

@media (max-width: 768px) {
  .category-selector {
    grid-template-columns: repeat(2, 1fr);
  }
}

.category-selector input[type="radio"] {
  display: none;
}

.category-selector input[type="radio"] + label.radio.category {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 14px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  backdrop-filter: blur(32px);
}

.category-selector input[type="radio"] + label.radio.category:hover {
  background: rgba(97, 55, 142, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.8);
}

.category-selector input[type="radio"]:checked + label.radio.category {
  color: rgba(255, 255, 255, 1);
  border: 1px solid rgba(255, 255, 255, 1);
  background: rgba(97, 55, 142, 0.33);
  backdrop-filter: blur(64px);
}

/* ─── Model Status Bar ────────────────────────────────────────────── */
.model-status-bar {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(155, 109, 200, 0.1);
  border: 1px solid rgba(155, 109, 200, 0.3);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
}

/* ─── Video Display Wrapper ───────────────────────────────────────── */
.caption-display-wrapper {
  border-radius: 12px;
  overflow: hidden;
}

.caption-display-wrapper.is-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  background: #000;
}

/* ─── Caption Display ─────────────────────────────────────────────── */
.caption-display {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  transition: all 0.3s ease;
}

.caption-display-wrapper.is-fullscreen .caption-display {
  flex: 1;
  min-height: 0;
  border-radius: 0;
}

.caption-display.is-active {
  box-shadow: 0 0 60px rgba(155, 109, 200, 0.15);
}

.caption-video {
  display: block;
  width: 100%;
  height: auto;
}

.caption-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2rem;
  z-index: 10;
  position: relative;
}

/* ─── Play/Pause Overlay ─────────────────────────────────────────── */
.video-overlay {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.video-overlay .overlay-icon {
  opacity: 0;
  transition: opacity 0.2s ease;
}

/* Show icon on hover when playing */
.video-overlay:hover .overlay-icon {
  opacity: 1;
}

/* Always show icon when paused or never played */
.video-overlay.show-icon-persistent .overlay-icon {
  opacity: 1;
}

.overlay-icon {
  font-size: 72px;
  color: white;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 50%;
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.overlay-fade-enter-active {
  transition: opacity 0.15s ease;
}
.overlay-fade-leave-active {
  transition: opacity 0.4s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

hr {
  margin: 12px 0;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 1),
    transparent
  );
}

/* ─── Caption Bar (below video) ───────────────────────────────────── */
.caption-bar {
  background: rgba(0, 0, 0, 0.9);
  border-top: 2px solid rgba(155, 109, 200, 0.3);
  padding: 0.75rem 1.25rem;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.caption-bar-inner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 90%;
}

.caption-bar-idle {
  opacity: 0.5;
}

.caption-bar-text {
  color: rgba(255, 255, 255, 0.95);
  font-size: 1rem;
  line-height: 1.4;
  text-align: center;
}

/* ─── Analyzing Toast (top-right notification) ───────────────────── */
.analyzing-toast {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: rgba(20, 10, 35, 0.92);
  border: 1px solid rgba(155, 109, 200, 0.5);
  border-radius: 10px;
  backdrop-filter: blur(24px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}

.toast-spinner {
  font-size: 18px;
  color: rgba(155, 109, 200, 0.9);
}

.toast-text {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

.toast-slide-enter-active {
  transition: all 0.25s ease-out;
}
.toast-slide-leave-active {
  transition: all 0.2s ease-in;
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* ─── Buttons Row ────────────────────────────────────────────────── */
.buttons-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

/* ─── Fullscreen Toggle (MeditationForge pattern) ─────────────────── */
.fullscreen-toggle {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  z-index: 20;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
}

.fullscreen-toggle:hover {
  background: rgba(97, 55, 142, 0.6);
  border-color: rgba(255, 255, 255, 0.6);
}

.fullscreen-toggle.m-5 {
  bottom: 1.25rem;
  right: 1.25rem;
}

/* ─── Range Slider (MeditationForge pattern) ──────────────────────── */
.volume-control input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
  outline: none;
}

.volume-control input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bulma-primary, rgb(155, 109, 200));
  cursor: pointer;
}

/* ─── Transcript Panel ────────────────────────────────────────────── */
.transcript-panel {
  background: rgba(10, 5, 20, 0.4);
  border: 1px solid rgba(155, 109, 200, 0.15);
  border-radius: 12px;
  padding: 1.25rem;
}

.transcript-entries {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 300px;
  overflow-y: auto;
}

.transcript-entry {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.transcript-entry:hover {
  background: rgba(155, 109, 200, 0.08);
  border-color: rgba(155, 109, 200, 0.25);
}

.transcript-entry:hover .delete-entry {
  opacity: 1;
}

.transcript-entry.is-current {
  background: rgba(155, 109, 200, 0.15);
  border-color: rgba(155, 109, 200, 0.5);
}

.transcript-entry .timestamp {
  color: rgba(155, 109, 200, 0.9);
  white-space: nowrap;
  font-size: 0.8rem;
  min-width: 3.5em;
  padding-top: 1px;
}

.transcript-entry .entry-text {
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.85rem;
  line-height: 1.4;
  flex: 1;
}

.delete-entry {
  opacity: 0;
  background: none;
  border: none;
  color: rgba(255, 80, 80, 0.7);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.delete-entry:hover {
  color: rgba(255, 80, 80, 1);
  background: rgba(255, 80, 80, 0.1);
}

/* ─── Session List ────────────────────────────────────────────────── */
.session-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.session-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.2s ease;
}

.session-card:hover {
  background: rgba(155, 109, 200, 0.1);
  border-color: rgba(155, 109, 200, 0.3);
}

.session-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(155, 109, 200, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.session-card-icon .material-symbols-outlined {
  font-size: 20px;
  color: rgba(155, 109, 200, 0.7);
}

.session-card-info {
  flex: 1;
  min-width: 0;
}

.session-card-title {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-card-meta {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}

/* ─── Shared Styles (MeditationForge) ─────────────────────────────── */
.models__activity--payouts {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  backdrop-filter: blur(32px);
}

.skill-name {
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
  -webkit-text-fill-color: transparent;
}

.has-text-brand {
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
  -webkit-text-fill-color: transparent;
}

.skill-description {
  color: rgba(255, 255, 255, 0.8);
  text-align: left;
}

.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.progress::-webkit-progress-value {
  background: linear-gradient(90deg, rgb(155, 109, 200), rgb(255, 153, 51));
  transition: width 0.3s ease;
}
</style>
