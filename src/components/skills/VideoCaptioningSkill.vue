<template>
  <div class="captioning-skill">
    <!-- Model Loading Status -->
    <div v-if="!isFullscreen && modelLoading" class="bz-notice bz-notice--info">
      <span class="bz-notice__icon"><span class="material-symbols-outlined">progress_activity</span></span>
      <div class="bz-notice__body">
        <div class="bz-notice__title">Loading vision model</div>
        <BonzaiPulse variant="strip" />
      </div>
    </div>

    <!-- Video Source Selector + Reset -->
    <section v-if="!isFullscreen && !videoLoaded" class="caption-source-lab skill-panel source-panel">
      <span class="category-selector">
        <template v-for="mode in captionModes" :key="mode.id">
          <input
            type="radio"
            name="caption_mode"
            :id="'caption_' + mode.id"
            :value="mode.id"
            :checked="selectedMode === mode.id"
            @change="selectedMode = mode.id"
          />
          <label :for="'caption_' + mode.id" class="radio category">
            <span
              class="material-symbols-outlined"
              style="font-size: 18px"
            >
              {{ mode.icon }}
            </span>
            {{ mode.name }}
          </label>
        </template>
      </span>

      <!-- File Select -->
      <div v-if="selectedMode === 'file'" class="skill-action-row">
        <button
          class="bz-btn bz-btn--success bz-btn--lg"
          @click="selectVideoFile"
        >
          <span class="material-symbols-outlined">folder_open</span>
          Select Video File
        </button>
      </div>

      <!-- URL Input -->
      <div v-else class="source-url-row">
        <div class="skill-field skill-field--grow">
          <label class="skill-label">Direct video URL</label>
          <input
            class="skill-input"
            type="text"
            v-model="videoUrl"
            placeholder="Paste direct video URL (.mp4, .webm)..."
            @keyup.enter="loadVideoFromUrl"
          />
        </div>
        <div class="skill-field skill-field--action">
          <button
            class="bz-btn bz-btn--success bz-btn--lg"
            @click="loadVideoFromUrl"
            :disabled="!videoUrl"
          >
            <span class="material-symbols-outlined">download</span>
            Load Video
          </button>
        </div>
      </div>
    </section>

    <div v-if="!isFullscreen" class="caption-telemetry">
      <div class="caption-telemetry-cell">
        <span>Source</span>
        <strong>{{ selectedMode === 'file' ? 'File' : 'URL' }}</strong>
      </div>
      <div class="caption-telemetry-cell">
        <span>Capture</span>
        <strong>{{ captureInterval }}s</strong>
      </div>
      <div class="caption-telemetry-cell">
        <span>Cues</span>
        <strong>{{ transcript.length }}</strong>
      </div>
      <div class="caption-telemetry-cell">
        <span>Status</span>
        <strong>{{ videoLoaded ? (isPlaying ? 'Live' : 'Ready') : 'Idle' }}</strong>
      </div>
    </div>

    <!-- Video Display Area -->
    <div
      ref="captionDisplay"
      class="caption-display-wrapper caption-stage"
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
          <p class="caption-status bz-h3">{{ generationStatus }}</p>
          <BonzaiPulse variant="bar" :percent="generationProgress" width="300px" />
        </div>

        <!-- Idle State -->
        <div class="caption-content" v-if="!videoLoaded && !isGenerating">
          <span
            class="material-symbols-outlined"
            style="font-size: 120px; opacity: 0.15"
          >
            videocam
          </span>
          <p class="caption-status bz-body">
            Load a video to begin captioning
          </p>
        </div>

        <!-- Fullscreen Toggle -->
        <button
          v-if="videoLoaded"
          class="fullscreen-toggle"
          :class="{ 'fullscreen-offset': isFullscreen }"
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
          <span class="caption-bar-text caption-bar-text--active">
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
          <span class="caption-bar-text caption-bar-text--muted">
            {{
              captioningActive
                ? "Waiting for next frame..."
                : "Captioning paused"
            }}
          </span>
        </div>
      </div>
    </div>

    <!-- Analyzing Notification (top-right toast — matches SmartAgent notification style) -->
    <Transition name="notification-slide">
      <div v-if="isAnalyzing" class="status-notification status-notification--info bz-shout">
        <span class="material-symbols-outlined rotating">
          progress_activity
        </span>
        Analyzing frame...
      </div>
    </Transition>

    <!-- Controls (visible only when video is loaded) -->
    <div class="controls-section caption-console" v-if="!isFullscreen && videoLoaded">
      <!-- Capture Interval + Progress -->
      <section class="skill-panel">
        <div class="skill-panel-head">
          <h3 class="bz-h2 skill-section-title">Capture</h3>
          <button
            class="bz-btn bz-btn--destructive"
            @click="resetAll"
            title="Reset"
          >
            <span class="material-symbols-outlined">restart_alt</span>
            Start Over
          </button>
        </div>
        <div class="volume-control skill-field">
          <span class="skill-label">Frame capture interval <span class="bz-mono">{{ captureInterval }}s</span></span>
          <input
            class="skill-range"
            type="range"
            min="1"
            max="10"
            step="1"
            v-model.number="captureInterval"
          />
        </div>

        <!-- Progress Bar -->
        <div class="skill-field" v-if="totalDuration > 0">
          <div
            style="
              display: flex;
              justify-content: space-between;
              margin-bottom: 4px;
            "
          >
            <span class="bz-meta bz-mono">
              {{ formatTime(currentTime) }}
            </span>
            <span class="bz-meta bz-mono">
              {{ formatTime(totalDuration) }}
            </span>
          </div>
          <BonzaiPulse variant="bar" :percent="playbackProgress" />
        </div>
      </section>
    </div>

    

    <!-- Transcript Panel -->
    <div
      class="transcript-panel caption-timeline skill-panel"
      v-if="transcript.length > 0 && !isFullscreen"
    >
      <h3 class="bz-h2 skill-section-title">
        <span class="material-symbols-outlined">description</span>
        Transcript <span class="bz-meta bz-mono">{{ transcript.length }} entries</span>
      </h3>
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
        class="bz-btn bz-btn--primary transcript-export"
        @click="exportTranscript"
      >
        <span class="material-symbols-outlined">download</span>
        Export SRT
      </button>
    </div>

    <!-- Session History -->
    <div
      class="session-history caption-session-strip skill-panel"
      v-if="sessionHistory.length > 0 && !isFullscreen"
    >
      <h4 class="bz-h2 skill-section-title">
        <span class="material-symbols-outlined">history</span>
        Recent Sessions
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
            class="bz-iconbtn bz-iconbtn--sm danger-icon"
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
import BonzaiPulse from "../BonzaiPulse.vue";
import { getAuthHeaders } from "../../services/auth.service.js";
import { hasPurchasedSkill, isDevMode } from "../../services/agent.service.js";

const STORAGE_KEY = "video-captioning-sessions";
const SKILL_ID = "video-captioning-v1.0.0";
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
  components: { BonzaiPulse },

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
    const playbackProgress = computed(() => {
      if (!totalDuration.value) return 0;
      return (currentTime.value / totalDuration.value) * 100;
    });

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
      if (!isDevMode() && !(await hasPurchasedSkill(SKILL_ID))) {
        console.warn("[VideoCaptioning] Skill not purchased — execution blocked.");
        return null;
      }
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
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
  color: var(--bz-fg);
}
.skill-panel {
  padding: var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}
.skill-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-4);
}
.skill-title-icon {
  color: var(--bz-purple-300);
  font-size: 42px !important;
  line-height: 1;
}
.skill-section-title {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0 0 var(--bz-space-4);
  color: var(--bz-fg);
}
.skill-panel-head,
.source-url-row,
.skill-action-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--bz-space-4);
  flex-wrap: wrap;
}
.source-panel,
.controls-section {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
}
.skill-field {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  min-width: 0;
}
.skill-field--grow { flex: 1 1 320px; }
.skill-field--action { flex: 0 0 auto; }
.skill-label {
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}
.skill-input {
  width: 100%;
  height: 44px;
  padding: 0 var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-input:focus {
  outline: none;
  border-color: var(--bz-border-brand);
}
.skill-range {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-border-strong);
  outline: none;
}
.skill-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-purple-300);
  border: 2px solid var(--bz-fg);
  cursor: pointer;
}
.caption-status {
  margin-top: var(--bz-space-3);
  color: var(--bz-fg-mid);
}
.caption-bar-text--active { color: var(--bz-fg); }
.caption-bar-text--muted { color: var(--bz-fg-low); }
.transcript-export { margin-top: var(--bz-space-4); }
.danger-icon { color: var(--bz-danger); }


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
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  color: var(--bz-fg-faint);
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.category-selector input[type="radio"] + label.radio.category:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg-mid);
}

.category-selector input[type="radio"]:checked + label.radio.category {
  color: var(--bz-control-selected-fg);
  border: 1px solid var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}

/* ─── Model Status Bar ────────────────────────────────────────────── */
.model-status-bar {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(155, 109, 200, 0.1);
  border: 1px solid rgba(155, 109, 200, 0.3);
  border-radius: 8px;
  color: var(--bz-fg-mid);
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
  background: linear-gradient(135deg, var(--bz-card) 0%, #16213e 50%, #0f3460 100%);
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
  color: var(--bz-fg);
  background: var(--bz-scrim);
  border-radius: 50%;
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
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
    var(--bz-fg),
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

/* ─── Status Notification (matches SmartAgent notification style) ── */
.status-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  padding: 1em 1.5em;
  border-radius: 8px;
  display: flex;
  align-items: center;
  color: var(--bz-fg);
  box-shadow: 0 4px 20px var(--bz-scrim);
}
.status-notification--info { background: rgba(62, 142, 208, 0.95); }
.status-notification--success { background: rgba(57, 213, 130, 0.95); }
.status-notification--danger { background: rgba(255, 56, 96, 0.95); }

.notification-slide-enter-active { animation: notification-fade-slide-in 0.4s ease-out; }
.notification-slide-leave-active { animation: notification-fade-slide-out 0.4s ease-in; }
@keyframes notification-fade-slide-in { 0% { opacity: 0; transform: translateX(100px); } 100% { opacity: 1; transform: translateX(0); } }
@keyframes notification-fade-slide-out { 0% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateX(100px); } }

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
  background: var(--bz-scrim-strong);
  border: 1px solid var(--bz-fg-faint);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--bz-fg);
}

.fullscreen-toggle:hover {
  background: var(--bz-border-brand);
  border-color: var(--bz-fg-mid);
}

.fullscreen-toggle.fullscreen-offset {
  bottom: 1.25rem;
  right: 1.25rem;
}

/* ─── Range Slider (MeditationForge pattern) ──────────────────────── */
.volume-control input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--bz-border-strong);
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
  color: var(--bz-fg);
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
  border: 1px solid var(--bz-canvas);
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
  color: var(--bz-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-card-meta {
  font-size: 0.75rem;
  color: var(--bz-fg-low);
  margin-top: 2px;
}

/* ─── Shared Styles (MeditationForge) ─────────────────────────────── */
.models__activity--payouts {
  padding: 2em;
  border: 1px solid var(--bz-border);
  border-radius: 12px;
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
  color: var(--bz-fg-mid);
  text-align: left;
}

.rotating {
  animation: bz-spin 1s linear infinite;
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

/* Agentic redesign: Caption Lab */
.caption-source-lab {
  display: grid;
  gap: var(--bz-space-4);
  background:
    linear-gradient(135deg, rgba(24, 144, 255, 0.12), transparent 44%),
    var(--bz-panel);
}
.caption-source-lab .category-selector {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.caption-stage {
  border: 1px solid var(--bz-border-strong);
  background: #050507;
}
.caption-stage .caption-display {
  min-height: clamp(380px, 52vh, 700px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.caption-stage .caption-video {
  max-height: 70vh;
  object-fit: contain;
}
.caption-console .skill-panel {
  background: var(--bz-panel);
}
.caption-console .skill-panel-head {
  margin-bottom: var(--bz-space-3);
}
.caption-timeline {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--bz-space-4);
  align-items: start;
}
.caption-timeline .skill-section-title,
.caption-timeline .transcript-entries {
  grid-column: 1;
}
.caption-timeline .transcript-export {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: end;
}
.caption-timeline .transcript-entry {
  min-height: 42px;
  border-left: 2px solid transparent;
}
.caption-timeline .transcript-entry.is-current {
  border-left-color: var(--bz-info);
}
.caption-session-strip .session-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}
@media (max-width: 780px) {
  .caption-timeline {
    grid-template-columns: 1fr;
  }
  .caption-timeline .transcript-export {
    grid-column: 1;
    grid-row: auto;
  }
}


/* Signature upgrade: caption lab telemetry */
.caption-telemetry {
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
  gap: var(--bz-space-3);
}
.caption-telemetry-cell {
  min-height: 82px;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.caption-telemetry-cell span {
  color: var(--bz-fg-low);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.caption-telemetry-cell strong {
  color: var(--bz-fg);
  font-size: 20px;
  line-height: 1.1;
}
.caption-source-lab {
  grid-template-columns: minmax(0, 0.8fr) minmax(280px, 1fr);
  align-items: end;
}
.caption-source-lab > .category-selector { align-self: stretch; }
.caption-source-lab > .skill-action-row,
.caption-source-lab > .source-url-row { min-width: 0; }
@media (max-width: 900px) {
  .caption-telemetry,
  .caption-source-lab { grid-template-columns: 1fr; }
}

</style>
