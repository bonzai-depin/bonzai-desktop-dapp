<template>
  <div class="tcg-scanner-skill">
    <!-- Header -->
    <div class="models__activity--payouts mb-4 has-text-left">
      <h2 class="skill-name is-size-1 fira-sans-condensed-black-italic mb-2">
        <span class="material-symbols-outlined" style="font-size: 48px">
          qr_code_scanner
        </span>
        TCG Card Scanner
      </h2>
      <p class="skill-description is-size-5">
        {{
          skill?.description ||
          "Scan Trading Card Game cards using AI-powered OCR. Extract card names, stats, abilities, and more."
        }}
      </p>
    </div>

    <!-- Model Loading Status -->
    <div v-if="modelLoading" class="model-status-bar mb-4">
      <span
        class="material-symbols-outlined rotating mr-2"
        style="font-size: 20px"
      >
        progress_activity
      </span>
      <span>Loading OCR model...</span>
    </div>

    <!-- Image Source Selector -->
    <div v-if="!scannedCard" class="mb-4">
      <span class="category-selector mb-4">
        <template v-for="mode in inputModes" :key="mode.id">
          <input
            type="radio"
            name="input_mode"
            :id="'input_' + mode.id"
            :value="mode.id"
            :checked="selectedMode === mode.id"
            @change="selectedMode = mode.id"
          />
          <label :for="'input_' + mode.id" class="radio category pt-3 pb-3">
            <span
              class="material-symbols-outlined mr-1"
              style="font-size: 18px"
            >
              {{ mode.icon }}
            </span>
            {{ mode.label }}
          </label>
        </template>
      </span>
    </div>

    <!-- File Selector -->
    <div v-if="!scannedCard && selectedMode === 'file'" class="mb-4">
      <button class="button is-primary" @click="selectImageFile">
        <span class="material-symbols-outlined mr-2" style="font-size: 18px">
          photo_library
        </span>
        Select Card Image
      </button>
      <span v-if="imageFilename" class="ml-3" style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">
        {{ imageFilename }}
      </span>
    </div>

    <!-- Camera Capture -->
    <div v-if="!scannedCard && selectedMode === 'camera'" class="mb-4">
      <div v-if="!cameraActive" class="has-text-centered">
        <button class="button is-primary" @click="startCamera">
          <span class="material-symbols-outlined mr-2" style="font-size: 18px">
            photo_camera
          </span>
          Open Camera
        </button>
      </div>
      <div v-else class="camera-container">
        <video ref="cameraVideo" autoplay playsinline class="camera-preview"></video>
        <div class="camera-controls mt-3 has-text-centered">
          <button class="button is-primary mr-2" @click="captureFromCamera">
            <span class="material-symbols-outlined mr-1" style="font-size: 18px">
              camera
            </span>
            Capture
          </button>
          <button class="button is-dark" @click="stopCamera">
            <span class="material-symbols-outlined mr-1" style="font-size: 18px">
              close
            </span>
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Scanning Progress -->
    <div v-if="isScanning" class="scan-progress mb-4">
      <div class="notification-toast">
        <span
          class="material-symbols-outlined rotating mr-2"
          style="font-size: 18px"
        >
          document_scanner
        </span>
        <span>{{ scanStatus }}</span>
      </div>
    </div>

    <!-- Card Preview + Results -->
    <div v-if="imagePreview" class="columns is-variable is-4">
      <!-- Card Image -->
      <div class="column is-5">
        <div class="card-preview-container">
          <img :src="imagePreview" alt="Card preview" class="card-preview-image" />
          <div v-if="!scannedCard && !isScanning" class="card-overlay">
            <button class="button is-primary is-medium" @click="scanCard">
              <span class="material-symbols-outlined mr-2" style="font-size: 20px">
                document_scanner
              </span>
              Scan Card
            </button>
          </div>
        </div>
      </div>

      <!-- Scan Results -->
      <div class="column is-7" v-if="scannedCard">
        <div class="scan-results">
          <h3 class="is-size-3 has-text-brand fira-sans-condensed-black-italic mb-3">
            {{ scannedCard.name || 'Card Details' }}
          </h3>

          <!-- Raw OCR Text -->
          <div class="result-section mb-4">
            <h4 class="result-label">
              <span class="material-symbols-outlined mr-1" style="font-size: 16px">description</span>
              Extracted Text
            </h4>
            <div class="result-content ocr-text">{{ scannedCard.rawText }}</div>
          </div>

          <!-- Parsed Fields (from LLM analysis) -->
          <div v-if="scannedCard.analysis" class="result-section mb-4">
            <h4 class="result-label">
              <span class="material-symbols-outlined mr-1" style="font-size: 16px">analytics</span>
              Card Analysis
            </h4>
            <div class="result-content analysis-text" v-html="formattedAnalysis"></div>
          </div>

          <!-- Actions -->
          <div class="mt-4" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="button is-small is-primary is-outlined" @click="copyResults">
              <span class="material-symbols-outlined mr-1" style="font-size: 16px">content_copy</span>
              Copy
            </button>
            <button class="button is-small is-primary is-outlined" @click="rescan">
              <span class="material-symbols-outlined mr-1" style="font-size: 16px">refresh</span>
              Re-scan
            </button>
            <button class="button is-small is-dark" @click="reset">
              <span class="material-symbols-outlined mr-1" style="font-size: 16px">restart_alt</span>
              New Scan
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Scan History -->
    <div v-if="scanHistory.length > 0" class="mt-5">
      <hr class="gradient-hr" />
      <h3 class="is-size-3 has-text-brand fira-sans-condensed-black-italic mb-3">
        <span class="material-symbols-outlined mr-2" style="font-size: 28px">history</span>
        Scan History
      </h3>
      <div class="history-grid">
        <div
          v-for="(entry, idx) in scanHistory"
          :key="idx"
          class="history-card"
          @click="loadFromHistory(entry)"
        >
          <img :src="entry.thumbnail" alt="Card" class="history-thumb" />
          <div class="history-info">
            <span class="history-name">{{ entry.name || 'Unknown Card' }}</span>
            <span class="history-meta">{{ entry.date }}</span>
          </div>
          <button class="delete-entry" @click.stop="removeHistory(idx)">
            <span class="material-symbols-outlined" style="font-size: 16px">close</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Hidden canvas for image processing -->
    <canvas ref="processingCanvas" style="display: none;"></canvas>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { getAuthHeaders } from "../../services/auth.service.js";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

export default {
  name: "TCGScannerSkill",

  props: {
    skill: { type: Object, default: null },
    modelAvailable: { type: [Function, Boolean], default: true },
  },

  emits: ["card-scanned", "status-update"],

  setup(props, { emit }) {
    const processingCanvas = ref(null);
    const cameraVideo = ref(null);

    const selectedMode = ref("file");
    const imagePreview = ref(null);
    const imageBase64 = ref(null);
    const imageFilename = ref("");
    const isScanning = ref(false);
    const scanStatus = ref("");
    const modelLoading = ref(false);
    const modelReady = ref(false);
    const cameraActive = ref(false);
    const scannedCard = ref(null);
    const scanHistory = ref([]);

    let cameraStream = null;

    const inputModes = [
      { id: "file", label: "File", icon: "photo_library" },
      { id: "camera", label: "Camera", icon: "photo_camera" },
    ];

    const formattedAnalysis = computed(() => {
      if (!scannedCard.value?.analysis) return "";
      return scannedCard.value.analysis
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br/>");
    });

    // ─── Model Prefetch ───────────────────────────────────────────────
    async function prefetchModel() {
      try {
        modelLoading.value = true;
        const res = await fetch(`${API_BASE}/pipelines/prefetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ pipeline: "ocr" }),
        });
        if (res.ok) {
          modelReady.value = true;
        }
      } catch (e) {
        console.warn("[TCGScanner] Prefetch failed:", e);
      } finally {
        modelLoading.value = false;
      }
    }

    // ─── File Selection ───────────────────────────────────────────────
    function selectImageFile() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        imageFilename.value = file.name;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          imagePreview.value = dataUrl;
          imageBase64.value = dataUrl;
          scannedCard.value = null;
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }

    // ─── Camera ───────────────────────────────────────────────────────
    async function startCamera() {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        cameraActive.value = true;
        await new Promise((r) => setTimeout(r, 50));
        if (cameraVideo.value) {
          cameraVideo.value.srcObject = cameraStream;
        }
      } catch (e) {
        console.error("[TCGScanner] Camera error:", e);
      }
    }

    function stopCamera() {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        cameraStream = null;
      }
      cameraActive.value = false;
    }

    function captureFromCamera() {
      if (!cameraVideo.value || !processingCanvas.value) return;
      const video = cameraVideo.value;
      const canvas = processingCanvas.value;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      imagePreview.value = dataUrl;
      imageBase64.value = dataUrl;
      imageFilename.value = "camera_capture.jpg";
      scannedCard.value = null;
      stopCamera();
    }

    // ─── OCR Scan ─────────────────────────────────────────────────────
    async function scanCard() {
      if (!imageBase64.value || isScanning.value) return;

      isScanning.value = true;
      scanStatus.value = "Extracting text from card...";
      emit("status-update", "Scanning card...");

      try {
        // Step 1: OCR — extract raw text
        const ocrRes = await fetch(`${API_BASE}/vision/ocr`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            image_base64: imageBase64.value,
            mode: "text",
            max_tokens: 4096,
            auto_download: true,
          }),
        });

        if (!ocrRes.ok) {
          const err = await ocrRes.json().catch(() => ({}));
          throw new Error(err.error || `OCR failed: ${ocrRes.status}`);
        }

        const ocrData = await ocrRes.json();
        const rawText = ocrData.text || "";

        scanStatus.value = "Analyzing card details...";

        // Step 2: Vision analyze — identify card game, parse fields
        const analyzeRes = await fetch(`${API_BASE}/vision/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            image_base64: imageBase64.value,
            prompt: `This is a Trading Card Game (TCG) card photo. The OCR extracted this text: "${rawText.substring(0, 1000)}"\n\nAnalyze the card and provide:\n1. **Card Game** (Pokemon, Magic: The Gathering, Yu-Gi-Oh!, etc.)\n2. **Card Name**\n3. **Card Type** (creature, spell, trainer, etc.)\n4. **Rarity** (common, uncommon, rare, etc.)\n5. **Set/Edition** if visible\n6. **Stats** (HP, attack, defense, mana cost, etc.)\n7. **Abilities/Effects** (describe each)\n8. **Flavor Text** if present\n9. **Condition Assessment** (mint, near-mint, played, etc. based on visible wear)\n10. **Estimated Value Range** (rough USD estimate if you can identify the card)\n\nBe concise but thorough.`,
            max_tokens: 1024,
            auto_download: true,
          }),
        });

        let analysis = "";
        if (analyzeRes.ok) {
          const analyzeData = await analyzeRes.json();
          analysis = analyzeData.response || "";
        }

        // Extract card name from analysis (best effort)
        const nameMatch = analysis.match(/\*\*Card Name\*\*[:\s]*(.+?)(?:\n|$)/i)
          || analysis.match(/Card Name[:\s]*(.+?)(?:\n|$)/i);
        const cardName = nameMatch ? nameMatch[1].trim().replace(/\*+/g, '') : "Unknown Card";

        scannedCard.value = {
          name: cardName,
          rawText: rawText,
          analysis: analysis,
        };

        // Add to history
        const thumbnail = createThumbnail(imagePreview.value);
        scanHistory.value.unshift({
          name: cardName,
          rawText,
          analysis,
          thumbnail,
          fullImage: imagePreview.value,
          imageBase64: imageBase64.value,
          date: new Date().toLocaleDateString(),
        });
        if (scanHistory.value.length > 20) scanHistory.value.pop();
        saveHistory();

        emit("card-scanned", scannedCard.value);
      } catch (e) {
        console.error("[TCGScanner] Scan failed:", e);
        scannedCard.value = {
          name: "Scan Error",
          rawText: e.message,
          analysis: null,
        };
      } finally {
        isScanning.value = false;
        scanStatus.value = "";
        emit("status-update", "");
      }
    }

    function createThumbnail(dataUrl) {
      if (!processingCanvas.value) return dataUrl;
      const canvas = processingCanvas.value;
      const img = new Image();
      img.src = dataUrl;
      const maxSize = 120;
      const ratio = Math.min(maxSize / (img.naturalWidth || 120), maxSize / (img.naturalHeight || 160));
      canvas.width = (img.naturalWidth || 120) * ratio;
      canvas.height = (img.naturalHeight || 160) * ratio;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.6);
    }

    // ─── Actions ──────────────────────────────────────────────────────
    function rescan() {
      scannedCard.value = null;
      scanCard();
    }

    function reset() {
      imagePreview.value = null;
      imageBase64.value = null;
      imageFilename.value = "";
      scannedCard.value = null;
      stopCamera();
    }

    function loadFromHistory(entry) {
      imagePreview.value = entry.fullImage || entry.thumbnail;
      imageBase64.value = entry.imageBase64 || entry.fullImage || entry.thumbnail;
      imageFilename.value = "";
      scannedCard.value = {
        name: entry.name,
        rawText: entry.rawText,
        analysis: entry.analysis,
      };
    }

    function removeHistory(idx) {
      scanHistory.value.splice(idx, 1);
      saveHistory();
    }

    async function copyResults() {
      if (!scannedCard.value) return;
      const text = [
        `Card: ${scannedCard.value.name}`,
        `\nOCR Text:\n${scannedCard.value.rawText}`,
        scannedCard.value.analysis ? `\nAnalysis:\n${scannedCard.value.analysis}` : "",
      ].filter(Boolean).join("\n");
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        console.warn("[TCGScanner] Clipboard write failed:", e);
      }
    }

    // ─── Persistence ──────────────────────────────────────────────────
    const STORE_KEY = "tcg-scanner-history";

    async function loadHistory() {
      try {
        const stored = await window.electronAPI?.storeGet(STORE_KEY);
        if (Array.isArray(stored)) {
          scanHistory.value = stored;
        }
      } catch (e) {
        console.warn("[TCGScanner] Failed to load history:", e);
      }
    }

    async function saveHistory() {
      try {
        await window.electronAPI?.storeSet(STORE_KEY, scanHistory.value);
      } catch (e) {
        console.warn("[TCGScanner] Failed to save history:", e);
      }
    }

    // ─── Lifecycle ────────────────────────────────────────────────────
    onMounted(() => {
      prefetchModel();
      loadHistory();
    });

    onUnmounted(() => {
      stopCamera();
    });

    return {
      processingCanvas,
      cameraVideo,
      selectedMode,
      inputModes,
      imagePreview,
      imageFilename,
      isScanning,
      scanStatus,
      modelLoading,
      modelReady,
      cameraActive,
      scannedCard,
      scanHistory,
      formattedAnalysis,
      selectImageFile,
      startCamera,
      stopCamera,
      captureFromCamera,
      scanCard,
      rescan,
      reset,
      loadFromHistory,
      removeHistory,
      copyResults,
    };
  },
};
</script>

<style scoped>
/* ─── Shared Styles (matches VideoCaptioningSkill) ────────────────── */
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
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.gradient-hr {
  border: none;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(155, 109, 200, 0.4),
    rgba(255, 153, 51, 0.3),
    transparent
  );
  margin: 1.5rem 0;
}

/* ─── Model Status ────────────────────────────────────────────────── */
.model-status-bar {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(155, 109, 200, 0.08);
  border: 1px solid rgba(155, 109, 200, 0.2);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.85rem;
}

/* ─── Scanning Toast ──────────────────────────────────────────────── */
.notification-toast {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1rem;
  background: rgba(155, 109, 200, 0.15);
  border: 1px solid rgba(155, 109, 200, 0.3);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
}

/* ─── Card Preview ────────────────────────────────────────────────── */
.card-preview-container {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(155, 109, 200, 0.2);
  background: rgba(10, 5, 20, 0.4);
}

.card-preview-image {
  width: 100%;
  display: block;
  border-radius: 12px;
}

.card-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.card-preview-container:hover .card-overlay {
  opacity: 1;
}

/* ─── Scan Results ────────────────────────────────────────────────── */
.scan-results {
  padding: 1.5rem;
  background: rgba(10, 5, 20, 0.4);
  border: 1px solid rgba(155, 109, 200, 0.15);
  border-radius: 12px;
}

.result-section {
  border-left: 3px solid rgba(155, 109, 200, 0.4);
  padding-left: 1rem;
}

.result-label {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(155, 109, 200, 0.8);
  margin-bottom: 0.5rem;
}

.result-content {
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.85rem;
  line-height: 1.6;
}

.ocr-text {
  white-space: pre-wrap;
  font-family: monospace;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.75rem;
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.analysis-text {
  max-height: 400px;
  overflow-y: auto;
}

/* ─── Camera ──────────────────────────────────────────────────────── */
.camera-container {
  max-width: 640px;
}

.camera-preview {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(155, 109, 200, 0.2);
  background: #000;
}

/* ─── History Grid ────────────────────────────────────────────────── */
.history-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.2s ease;
}

.history-card:hover {
  background: rgba(155, 109, 200, 0.1);
  border-color: rgba(155, 109, 200, 0.3);
}

.history-card:hover .delete-entry {
  opacity: 1;
}

.history-thumb {
  width: 48px;
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.history-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.history-name {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-meta {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
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
</style>
