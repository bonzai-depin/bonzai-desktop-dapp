<template>
  <div class="tcg-skill">
    <!-- Header -->
    <div class="models__activity--payouts mb-4 has-text-left">
      <h2 class="skill-name is-size-1 fira-sans-condensed-black-italic mb-2">
        <span class="material-symbols-outlined" style="font-size: 48px">style</span>
        Trading Card Game Analysis
      </h2>
      <p class="skill-description is-size-5">
        {{ skill?.description || "AI-powered card identification, TAG-compatible condition grading, and live market pricing." }}
      </p>
    </div>

    <!-- Model Loading Status -->
    <div v-if="modelLoading" class="model-status-bar mb-4">
      <span class="material-symbols-outlined rotating mr-2" style="font-size: 20px">progress_activity</span>
      <span>Loading OCR model...</span>
    </div>

    <!-- Image Source Selector (hidden after scan) -->
    <div v-if="!scannedCard" class="mb-4">
      <span class="category-selector mb-4">
        <template v-for="mode in inputModes" :key="mode.id">
          <input type="radio" name="input_mode" :id="'input_' + mode.id" :value="mode.id"
            :checked="selectedMode === mode.id" @change="selectedMode = mode.id" />
          <label :for="'input_' + mode.id" class="radio category pt-3 pb-3">
            <span class="material-symbols-outlined mr-1" style="font-size: 18px">{{ mode.icon }}</span>
            {{ mode.label }}
          </label>
        </template>
      </span>
    </div>

    <!-- File Selector -->
    <div v-if="!scannedCard && selectedMode === 'file'" class="mb-4">
      <button class="button is-primary" @click="selectImageFile">
        <span class="material-symbols-outlined mr-2" style="font-size: 18px">photo_library</span>
        Select Card Image
      </button>
      <span v-if="imageFilename" class="ml-3" style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">{{ imageFilename }}</span>
    </div>

    <!-- Camera -->
    <div v-if="!scannedCard && selectedMode === 'camera'" class="mb-4">
      <div v-if="!cameraActive" class="has-text-centered">
        <button class="button is-primary" @click="startCamera">
          <span class="material-symbols-outlined mr-2" style="font-size: 18px">photo_camera</span>
          Open Camera
        </button>
      </div>
      <div v-else class="camera-container">
        <video ref="cameraVideo" autoplay playsinline class="camera-preview"></video>
        <div class="camera-controls mt-3 has-text-centered">
          <button class="button is-primary mr-2" @click="captureFromCamera">
            <span class="material-symbols-outlined mr-1" style="font-size: 18px">camera</span>
            Capture
          </button>
          <button class="button is-dark" @click="stopCamera">
            <span class="material-symbols-outlined mr-1" style="font-size: 18px">close</span>
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Scanning Progress (top-right toast) -->
    <div v-if="isScanning" class="scan-toast">
      <span class="material-symbols-outlined rotating mr-2" style="font-size: 18px">document_scanner</span>
      <span>{{ scanStatus }}</span>
    </div>

    <!-- Card Preview + Analyze Overlay -->
    <div v-if="imagePreview && !scannedCard" class="card-preview-solo mb-4">
      <div class="card-preview-container">
        <img :src="imagePreview" alt="Card preview" class="card-preview-image" />
        <div v-if="!isScanning" class="card-overlay">
          <button class="button is-primary is-medium" @click="analyzeCard">
            <span class="material-symbols-outlined mr-2" style="font-size: 20px">document_scanner</span>
            Analyze Card
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ RESULTS ═══ -->
    <div v-if="scannedCard" class="results-layout">

      <!-- Top row: Card image + Identification -->
      <div class="columns is-variable is-4 mb-0">
        <div class="column is-4">
          <div class="card-preview-container">
            <img :src="imagePreview" alt="Card" class="card-preview-image" />
          </div>
        </div>
        <div class="column is-8">
          <!-- Card Title -->
          <h3 class="card-title fira-sans-condensed-black-italic mb-2">
            {{ scannedCard.name || 'Unknown Card' }}
          </h3>
          <div v-if="scannedCard.game" class="card-game-badge mb-3">
            <span class="material-symbols-outlined mr-1" style="font-size: 14px">playing_cards</span>
            {{ scannedCard.game }}
            <span v-if="scannedCard.set" class="ml-2" style="opacity: 0.6;">&middot; {{ scannedCard.set }}</span>
            <span v-if="scannedCard.rarity" class="ml-2" style="opacity: 0.6;">&middot; {{ scannedCard.rarity }}</span>
          </div>

          <!-- Analysis details -->
          <div v-if="scannedCard.analysis" class="analysis-panel">
            <div class="analysis-content" v-html="formattedAnalysis"></div>
          </div>
        </div>
      </div>

      <!-- Grading Panel -->
      <div v-if="scannedCard.grading" class="grading-panel mt-4">
        <div class="grading-header">
          <h4 class="is-size-4 has-text-brand fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined mr-2" style="font-size: 24px">verified</span>
            Condition Grading
          </h4>
          <div class="grade-overall">
            <div class="grade-circle" :class="gradeColorClass">
              <span class="grade-number">{{ scannedCard.grading.grade }}</span>
            </div>
            <div class="grade-meta">
              <span class="grade-label-text">{{ scannedCard.grading.label }}</span>
              <span class="grade-score">TAG Score: {{ scannedCard.grading.tagScore }}</span>
            </div>
          </div>
        </div>

        <div class="sub-grades">
          <div v-for="sub in scannedCard.grading.subGrades" :key="sub.name" class="sub-grade-row">
            <span class="sub-grade-name">{{ sub.name }}</span>
            <div class="sub-grade-bar-track">
              <div class="sub-grade-bar-fill" :style="{ width: (sub.score / 10) + '%' }" :class="subGradeColorClass(sub.score)"></div>
            </div>
            <span class="sub-grade-value" :class="subGradeColorClass(sub.score)">{{ sub.score }}</span>
          </div>
        </div>
      </div>

      <!-- Pricing Panel -->
      <div v-if="scannedCard.pricing" class="pricing-panel mt-4">
        <h4 class="is-size-4 has-text-brand fira-sans-condensed-black-italic mb-3">
          <span class="material-symbols-outlined mr-2" style="font-size: 24px">payments</span>
          Market Prices
        </h4>
        <div v-if="scannedCard.pricing.loading" class="price-loading">
          <span class="material-symbols-outlined rotating mr-2" style="font-size: 16px">progress_activity</span>
          Fetching prices...
        </div>
        <div v-else-if="scannedCard.pricing.error" class="price-error">
          {{ scannedCard.pricing.error }}
        </div>
        <div v-else class="price-grid">
          <div v-for="variant in scannedCard.pricing.variants" :key="variant.type" class="price-card">
            <span class="price-variant">{{ variant.type }}</span>
            <div class="price-values">
              <div class="price-main">${{ variant.market?.toFixed(2) || '—' }}</div>
              <div class="price-range">
                <span v-if="variant.low">Low ${{ variant.low.toFixed(2) }}</span>
                <span v-if="variant.high"> &middot; High ${{ variant.high.toFixed(2) }}</span>
              </div>
            </div>
          </div>
          <div v-if="scannedCard.pricing.url" class="price-source mt-2">
            <span style="opacity: 0.5; font-size: 0.75rem;">Source: pokemontcg.io / TCGPlayer</span>
          </div>
        </div>
      </div>

      <!-- OCR Raw Text (collapsible) -->
      <details class="ocr-details mt-4">
        <summary class="ocr-summary">
          <span class="material-symbols-outlined mr-1" style="font-size: 16px">description</span>
          Raw OCR Text
        </summary>
        <pre class="ocr-text">{{ scannedCard.rawText }}</pre>
      </details>

      <!-- Actions -->
      <div class="actions-bar mt-4">
        <button class="button is-small is-primary is-outlined" @click="copyResults">
          <span class="material-symbols-outlined mr-1" style="font-size: 16px">content_copy</span>
          Copy Report
        </button>
        <button class="button is-small is-primary is-outlined" @click="rescan">
          <span class="material-symbols-outlined mr-1" style="font-size: 16px">refresh</span>
          Re-analyze
        </button>
        <button class="button is-small is-dark" @click="reset">
          <span class="material-symbols-outlined mr-1" style="font-size: 16px">restart_alt</span>
          New Card
        </button>
      </div>
    </div>

    <!-- History -->
    <div v-if="scanHistory.length > 0" class="mt-5">
      <hr class="gradient-hr" />
      <h3 class="is-size-4 has-text-brand fira-sans-condensed-black-italic mb-3">
        <span class="material-symbols-outlined mr-2" style="font-size: 22px">history</span>
        Analysis History
      </h3>
      <div class="history-grid">
        <div v-for="(entry, idx) in scanHistory" :key="idx" class="history-card" @click="loadFromHistory(entry)">
          <img :src="entry.thumbnail" alt="Card" class="history-thumb" />
          <div class="history-info">
            <span class="history-name">{{ entry.name || 'Unknown Card' }}</span>
            <span class="history-meta">
              {{ entry.date }}
              <span v-if="entry.grade" class="ml-2 history-grade">{{ entry.grade }}</span>
            </span>
          </div>
          <button class="delete-entry" @click.stop="removeHistory(idx)">
            <span class="material-symbols-outlined" style="font-size: 16px">close</span>
          </button>
        </div>
      </div>
    </div>

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

const POKEMON_TCG_API = "https://api.pokemontcg.io/v2";

// TAG grading scale: score → { grade, label }
const TAG_SCALE = [
  { min: 990, grade: "10", label: "Pristine" },
  { min: 950, grade: "10", label: "Gem Mint" },
  { min: 900, grade: "9", label: "Mint" },
  { min: 850, grade: "8.5", label: "NM MT+" },
  { min: 800, grade: "8", label: "NM MT" },
  { min: 750, grade: "7.5", label: "NM+" },
  { min: 700, grade: "7", label: "NM" },
  { min: 650, grade: "6.5", label: "EX MT+" },
  { min: 600, grade: "6", label: "EX MT" },
  { min: 550, grade: "5.5", label: "EX+" },
  { min: 500, grade: "5", label: "EX" },
  { min: 450, grade: "4.5", label: "VG EX+" },
  { min: 400, grade: "4", label: "VG EX" },
  { min: 350, grade: "3.5", label: "VG+" },
  { min: 300, grade: "3", label: "VG" },
  { min: 250, grade: "2.5", label: "Good+" },
  { min: 200, grade: "2", label: "Good" },
  { min: 150, grade: "1.5", label: "Fair" },
  { min: 100, grade: "1", label: "Poor" },
];

function tagScoreToGrade(score) {
  for (const entry of TAG_SCALE) {
    if (score >= entry.min) return { grade: entry.grade, label: entry.label };
  }
  return { grade: "1", label: "Poor" };
}

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

    const gradeColorClass = computed(() => {
      const g = parseFloat(scannedCard.value?.grading?.grade || "0");
      if (g >= 9) return "grade-pristine";
      if (g >= 7) return "grade-nm";
      if (g >= 5) return "grade-ex";
      return "grade-low";
    });

    function subGradeColorClass(score) {
      if (score >= 900) return "sg-pristine";
      if (score >= 700) return "sg-nm";
      if (score >= 500) return "sg-ex";
      return "sg-low";
    }

    // ─── Model Prefetch (same pattern as VideoCaptioning) ─────────────
    async function ensureModelLoaded() {
      if (modelReady.value || modelLoading.value) return;
      modelLoading.value = true;
      try {
        const res = await fetch(`${API_BASE}/pipelines/prefetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ pipeline: "ocr" }),
        });
        if (res.ok) modelReady.value = true;
      } catch (e) {
        console.warn("[TCGAnalysis] Model prefetch failed:", e);
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
          imagePreview.value = ev.target.result;
          imageBase64.value = ev.target.result;
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
        if (cameraVideo.value) cameraVideo.value.srcObject = cameraStream;
      } catch (e) {
        console.error("[TCGAnalysis] Camera error:", e);
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
      canvas.getContext("2d").drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      imagePreview.value = dataUrl;
      imageBase64.value = dataUrl;
      imageFilename.value = "camera_capture.jpg";
      scannedCard.value = null;
      stopCamera();
    }

    // ─── pokemontcg.io Pricing ────────────────────────────────────────
    async function fetchPricing(cardName, cardGame) {
      if (!cardName || cardGame?.toLowerCase()?.includes("pokemon") === false) {
        return null;
      }
      try {
        const q = encodeURIComponent(`name:"${cardName}"`);
        const url = `${POKEMON_TCG_API}/cards?q=${q}&select=id,name,rarity,tcgplayer,cardmarket,set&pageSize=5`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const card = data.data?.[0];
        if (!card?.tcgplayer?.prices) return null;

        const variants = Object.entries(card.tcgplayer.prices).map(([type, p]) => ({
          type: type.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
          low: p.low,
          mid: p.mid,
          high: p.high,
          market: p.market,
        }));

        return {
          variants,
          url: card.tcgplayer?.url || "",
          set: card.set?.name || "",
          rarity: card.rarity || "",
        };
      } catch (e) {
        console.warn("[TCGAnalysis] Pricing fetch failed:", e);
        return null;
      }
    }

    // ─── Grading (TAG-compatible) ─────────────────────────────────────
    function parseGrading(analysisText) {
      // Extract sub-scores from the LLM grading response
      const categories = [
        { name: "Front Centering", key: /front centering[:\s]*(\d+)/i },
        { name: "Back Centering", key: /back centering[:\s]*(\d+)/i },
        { name: "Front Corners", key: /front corners?[:\s]*(\d+)/i },
        { name: "Back Corners", key: /back corners?[:\s]*(\d+)/i },
        { name: "Front Surface", key: /front surface[:\s]*(\d+)/i },
        { name: "Back Surface", key: /back surface[:\s]*(\d+)/i },
        { name: "Front Edges", key: /front edges?[:\s]*(\d+)/i },
        { name: "Back Edges", key: /back edges?[:\s]*(\d+)/i },
      ];

      const subGrades = categories.map((cat) => {
        const match = analysisText.match(cat.key);
        const score = match ? Math.min(1000, Math.max(100, parseInt(match[1]))) : 750;
        return { name: cat.name, score };
      });

      const avgScore = Math.round(subGrades.reduce((s, g) => s + g.score, 0) / subGrades.length);
      const { grade, label } = tagScoreToGrade(avgScore);

      return { grade, label, tagScore: avgScore, subGrades };
    }

    // ─── Main Analysis Pipeline ───────────────────────────────────────
    async function analyzeCard() {
      if (!imageBase64.value || isScanning.value) return;

      isScanning.value = true;
      scanStatus.value = "Extracting text from card...";
      emit("status-update", "Analyzing card...");

      try {
        // Step 1: OCR
        const ocrRes = await fetch(`${API_BASE}/vision/ocr`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ image_base64: imageBase64.value, mode: "text", max_tokens: 4096, auto_download: true }),
        });
        if (!ocrRes.ok) throw new Error((await ocrRes.json().catch(() => ({}))).error || `OCR failed: ${ocrRes.status}`);
        const rawText = (await ocrRes.json()).text || "";

        // Step 2: Vision — card identification + analysis
        scanStatus.value = "Identifying card...";
        const identifyRes = await fetch(`${API_BASE}/vision/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            image_base64: imageBase64.value,
            prompt: `This is a Trading Card Game card. OCR text: "${rawText.substring(0, 800)}"

Identify and analyze:
1. **Card Game** (Pokemon, Magic: The Gathering, Yu-Gi-Oh!, etc.)
2. **Card Name** (exact name)
3. **Card Type** (creature, spell, trainer, etc.)
4. **Rarity** (common, uncommon, rare, ultra rare, etc.)
5. **Set/Edition** if visible
6. **Stats** (HP, attack power, defense, mana cost, etc.)
7. **Abilities/Effects**
8. **Flavor Text** if any

Be concise. Use **bold** for field names.`,
            max_tokens: 800,
            auto_download: true,
          }),
        });
        let analysis = "";
        if (identifyRes.ok) analysis = (await identifyRes.json()).response || "";

        // Extract structured info
        const nameMatch = analysis.match(/\*\*Card Name\*\*[:\s]*(.+?)(?:\n|$)/i) || analysis.match(/Card Name[:\s]*(.+?)(?:\n|$)/i);
        const cardName = nameMatch ? nameMatch[1].trim().replace(/\*+/g, "") : rawText.split("\n")[0]?.trim() || "Unknown Card";
        const gameMatch = analysis.match(/\*\*Card Game\*\*[:\s]*(.+?)(?:\n|$)/i) || analysis.match(/Card Game[:\s]*(.+?)(?:\n|$)/i);
        const cardGame = gameMatch ? gameMatch[1].trim().replace(/\*+/g, "") : "";
        const setMatch = analysis.match(/\*\*Set\/?Edition\*\*[:\s]*(.+?)(?:\n|$)/i);
        const cardSet = setMatch ? setMatch[1].trim().replace(/\*+/g, "") : "";
        const rarityMatch = analysis.match(/\*\*Rarity\*\*[:\s]*(.+?)(?:\n|$)/i);
        const cardRarity = rarityMatch ? rarityMatch[1].trim().replace(/\*+/g, "") : "";

        // Step 3: Condition grading
        scanStatus.value = "Grading condition...";
        const gradeRes = await fetch(`${API_BASE}/vision/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            image_base64: imageBase64.value,
            prompt: `Grade this trading card's physical condition using the TAG (Technical Authentication & Grading) 1000-point scale. Score each category from 100 (Poor) to 1000 (Pristine).

Evaluate and return ONLY these 8 scores, one per line:
Front Centering: [score]
Back Centering: [score]
Front Corners: [score]
Back Corners: [score]
Front Surface: [score]
Back Surface: [score]
Front Edges: [score]
Back Edges: [score]

Consider: centering alignment, corner sharpness/wear, surface scratches/print lines/gloss, edge chipping/fraying. Since you can only see the front, estimate back scores conservatively (slightly lower than front). A typical new card from a pack scores 850-950.`,
            max_tokens: 300,
            auto_download: true,
          }),
        });
        let grading = null;
        if (gradeRes.ok) {
          const gradeText = (await gradeRes.json()).response || "";
          grading = parseGrading(gradeText);
        }

        // Build result
        scannedCard.value = {
          name: cardName,
          game: cardGame,
          set: cardSet,
          rarity: cardRarity,
          rawText,
          analysis,
          grading,
          pricing: { loading: true },
        };

        // Step 4: Fetch pricing (async, non-blocking)
        scanStatus.value = "Fetching market prices...";
        const pricingData = await fetchPricing(cardName, cardGame);
        if (pricingData) {
          scannedCard.value = {
            ...scannedCard.value,
            set: scannedCard.value.set || pricingData.set,
            rarity: scannedCard.value.rarity || pricingData.rarity,
            pricing: pricingData,
          };
        } else {
          scannedCard.value = {
            ...scannedCard.value,
            pricing: cardGame?.toLowerCase()?.includes("pokemon")
              ? { error: "Card not found on pokemontcg.io" }
              : { error: "Pricing available for Pokemon TCG only" },
          };
        }

        // Save to history
        const thumbnail = createThumbnail();
        scanHistory.value.unshift({
          name: cardName,
          grade: grading ? `${grading.grade} ${grading.label}` : null,
          rawText,
          analysis,
          grading,
          pricing: scannedCard.value.pricing,
          game: cardGame,
          set: cardSet,
          rarity: cardRarity,
          thumbnail,
          fullImage: imagePreview.value,
          imageBase64: imageBase64.value,
          date: new Date().toLocaleDateString(),
        });
        if (scanHistory.value.length > 20) scanHistory.value.pop();
        saveHistory();

        emit("card-scanned", scannedCard.value);
      } catch (e) {
        console.error("[TCGAnalysis] Analysis failed:", e);
        scannedCard.value = { name: "Analysis Error", rawText: e.message, analysis: null, grading: null, pricing: null };
      } finally {
        isScanning.value = false;
        scanStatus.value = "";
        emit("status-update", "");
      }
    }

    function createThumbnail() {
      if (!processingCanvas.value || !imagePreview.value) return imagePreview.value;
      const canvas = processingCanvas.value;
      const img = new Image();
      img.src = imagePreview.value;
      const maxSize = 120;
      const w = img.naturalWidth || 120;
      const h = img.naturalHeight || 160;
      const ratio = Math.min(maxSize / w, maxSize / h);
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.6);
    }

    // ─── Actions ──────────────────────────────────────────────────────
    function rescan() { scannedCard.value = null; analyzeCard(); }
    function reset() { imagePreview.value = null; imageBase64.value = null; imageFilename.value = ""; scannedCard.value = null; stopCamera(); }

    function loadFromHistory(entry) {
      imagePreview.value = entry.fullImage || entry.thumbnail;
      imageBase64.value = entry.imageBase64 || entry.fullImage || entry.thumbnail;
      imageFilename.value = "";
      scannedCard.value = {
        name: entry.name, game: entry.game, set: entry.set, rarity: entry.rarity,
        rawText: entry.rawText, analysis: entry.analysis, grading: entry.grading, pricing: entry.pricing,
      };
    }

    function removeHistory(idx) { scanHistory.value.splice(idx, 1); saveHistory(); }

    async function copyResults() {
      if (!scannedCard.value) return;
      const c = scannedCard.value;
      const g = c.grading;
      const lines = [`Card: ${c.name}`, c.game ? `Game: ${c.game}` : "", c.set ? `Set: ${c.set}` : "", c.rarity ? `Rarity: ${c.rarity}` : ""];
      if (g) {
        lines.push("", `Grade: ${g.grade} ${g.label} (TAG Score: ${g.tagScore})`, "Sub-Grades:");
        g.subGrades.forEach((s) => lines.push(`  ${s.name}: ${s.score}`));
      }
      if (c.pricing?.variants) {
        lines.push("", "Market Prices:");
        c.pricing.variants.forEach((v) => lines.push(`  ${v.type}: $${v.market?.toFixed(2) || "—"}`));
      }
      if (c.analysis) lines.push("", "Analysis:", c.analysis);
      lines.push("", "OCR Text:", c.rawText);
      try { await navigator.clipboard.writeText(lines.filter((l) => l !== undefined).join("\n")); } catch (e) { /* */ }
    }

    // ─── Persistence ──────────────────────────────────────────────────
    const STORE_KEY = "tcg-analysis-history";
    async function loadHistory() {
      try {
        const stored = await window.electronAPI?.storeGet(STORE_KEY);
        if (Array.isArray(stored)) scanHistory.value = stored;
      } catch (e) { /* */ }
    }
    async function saveHistory() {
      try { await window.electronAPI?.storeSet(STORE_KEY, scanHistory.value); } catch (e) { /* */ }
    }

    onMounted(() => { ensureModelLoaded(); loadHistory(); });
    onUnmounted(() => { stopCamera(); });

    return {
      processingCanvas, cameraVideo, selectedMode, inputModes, imagePreview, imageFilename,
      isScanning, scanStatus, modelLoading, modelReady, cameraActive, scannedCard, scanHistory,
      formattedAnalysis, gradeColorClass, subGradeColorClass,
      selectImageFile, startCamera, stopCamera, captureFromCamera, analyzeCard, rescan, reset,
      loadFromHistory, removeHistory, copyResults,
    };
  },
};
</script>

<style scoped>
/* ─── Shared Skill Styles ─────────────────────────────────────────── */
.models__activity--payouts { padding: 2em; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(32px); }
.skill-name { background: linear-gradient(135deg, rgb(155,109,200), rgb(255,153,51)) text; -webkit-text-fill-color: transparent; }
.has-text-brand { background: linear-gradient(135deg, rgb(155,109,200), rgb(255,153,51)) text; -webkit-text-fill-color: transparent; }
.skill-description { color: rgba(255,255,255,0.8); text-align: left; }
.rotating { animation: rotate 1s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.gradient-hr { border: none; height: 1px; background: linear-gradient(90deg, transparent, rgba(155,109,200,0.4), rgba(255,153,51,0.3), transparent); margin: 1.5rem 0; }

/* ─── Model Status ────────────────────────────────────────────────── */
.model-status-bar { display: flex; align-items: center; padding: 0.75rem 1rem; background: rgba(155,109,200,0.08); border: 1px solid rgba(155,109,200,0.2); border-radius: 8px; color: rgba(255,255,255,0.8); font-size: 0.85rem; }

/* ─── Scanning Toast (top-right) ──────────────────────────────────── */
.scan-toast { position: fixed; top: 80px; right: 24px; z-index: 100; display: inline-flex; align-items: center; padding: 0.6rem 1.2rem; background: rgba(15,10,30,0.92); border: 1px solid rgba(155,109,200,0.4); border-radius: 10px; color: rgba(255,255,255,0.9); font-size: 0.85rem; backdrop-filter: blur(16px); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }

/* ─── Card Preview ────────────────────────────────────────────────── */
.card-preview-solo { max-width: 360px; }
.card-preview-container { position: relative; border-radius: 12px; overflow: hidden; border: 1px solid rgba(155,109,200,0.2); background: rgba(10,5,20,0.4); }
.card-preview-image { width: 100%; display: block; border-radius: 12px; }
.card-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.2s ease; }
.card-preview-container:hover .card-overlay { opacity: 1; }

/* ─── Card Title & Badge ──────────────────────────────────────────── */
.card-title { font-size: 2rem; background: linear-gradient(135deg, rgb(155,109,200), rgb(255,153,51)) text; -webkit-text-fill-color: transparent; }
.card-game-badge { display: inline-flex; align-items: center; padding: 0.3rem 0.8rem; background: rgba(155,109,200,0.1); border: 1px solid rgba(155,109,200,0.25); border-radius: 20px; font-size: 0.78rem; color: rgba(255,255,255,0.75); }

/* ─── Analysis Panel ──────────────────────────────────────────────── */
.analysis-panel { background: rgba(10,5,20,0.35); border: 1px solid rgba(155,109,200,0.12); border-radius: 10px; padding: 1rem 1.25rem; }
.analysis-content { color: rgba(255,255,255,0.85); font-size: 0.85rem; line-height: 1.7; max-height: 320px; overflow-y: auto; }
.analysis-content :deep(strong) { color: rgba(155,109,200,0.9); font-weight: 600; }

/* ─── Grading Panel ───────────────────────────────────────────────── */
.grading-panel { background: rgba(10,5,20,0.4); border: 1px solid rgba(155,109,200,0.15); border-radius: 12px; padding: 1.5rem; }
.grading-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
.grade-overall { display: flex; align-items: center; gap: 0.75rem; }
.grade-circle { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.4rem; }
.grade-circle.grade-pristine { background: linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05)); border: 2px solid rgba(34,197,94,0.6); color: rgb(34,197,94); }
.grade-circle.grade-nm { background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.05)); border: 2px solid rgba(59,130,246,0.6); color: rgb(59,130,246); }
.grade-circle.grade-ex { background: linear-gradient(135deg, rgba(234,179,8,0.2), rgba(234,179,8,0.05)); border: 2px solid rgba(234,179,8,0.6); color: rgb(234,179,8); }
.grade-circle.grade-low { background: linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05)); border: 2px solid rgba(239,68,68,0.6); color: rgb(239,68,68); }
.grade-meta { display: flex; flex-direction: column; }
.grade-label-text { font-size: 1rem; font-weight: 700; color: rgba(255,255,255,0.9); }
.grade-score { font-size: 0.78rem; color: rgba(255,255,255,0.5); margin-top: 2px; }
.grade-number { font-family: inherit; }

/* Sub-grades */
.sub-grades { display: flex; flex-direction: column; gap: 8px; }
.sub-grade-row { display: flex; align-items: center; gap: 0.75rem; }
.sub-grade-name { width: 120px; font-size: 0.78rem; color: rgba(255,255,255,0.6); flex-shrink: 0; }
.sub-grade-bar-track { flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.sub-grade-bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
.sub-grade-bar-fill.sg-pristine { background: linear-gradient(90deg, rgba(34,197,94,0.6), rgb(34,197,94)); }
.sub-grade-bar-fill.sg-nm { background: linear-gradient(90deg, rgba(59,130,246,0.6), rgb(59,130,246)); }
.sub-grade-bar-fill.sg-ex { background: linear-gradient(90deg, rgba(234,179,8,0.6), rgb(234,179,8)); }
.sub-grade-bar-fill.sg-low { background: linear-gradient(90deg, rgba(239,68,68,0.6), rgb(239,68,68)); }
.sub-grade-value { width: 36px; text-align: right; font-size: 0.78rem; font-weight: 600; flex-shrink: 0; }
.sub-grade-value.sg-pristine { color: rgb(34,197,94); }
.sub-grade-value.sg-nm { color: rgb(59,130,246); }
.sub-grade-value.sg-ex { color: rgb(234,179,8); }
.sub-grade-value.sg-low { color: rgb(239,68,68); }

/* ─── Pricing Panel ───────────────────────────────────────────────── */
.pricing-panel { background: rgba(10,5,20,0.4); border: 1px solid rgba(155,109,200,0.15); border-radius: 12px; padding: 1.5rem; }
.price-loading, .price-error { font-size: 0.85rem; color: rgba(255,255,255,0.5); display: flex; align-items: center; }
.price-error { color: rgba(255,200,150,0.6); }
.price-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.price-card { flex: 1; min-width: 160px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 0.75rem 1rem; }
.price-variant { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(155,109,200,0.7); }
.price-main { font-size: 1.4rem; font-weight: 800; color: rgba(34,197,94,0.9); margin: 0.25rem 0; }
.price-range { font-size: 0.72rem; color: rgba(255,255,255,0.4); }

/* ─── OCR Details ─────────────────────────────────────────────────── */
.ocr-details { background: rgba(10,5,20,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; }
.ocr-summary { padding: 0.75rem 1rem; cursor: pointer; font-size: 0.8rem; color: rgba(255,255,255,0.5); display: flex; align-items: center; list-style: none; }
.ocr-summary::-webkit-details-marker { display: none; }
.ocr-summary::before { content: "\25B6"; margin-right: 0.5rem; font-size: 0.6rem; transition: transform 0.2s; }
details[open] .ocr-summary::before { transform: rotate(90deg); }
.ocr-text { white-space: pre-wrap; font-family: monospace; font-size: 0.8rem; color: rgba(255,255,255,0.65); background: rgba(0,0,0,0.15); padding: 0.75rem 1rem; margin: 0; border-top: 1px solid rgba(255,255,255,0.04); max-height: 200px; overflow-y: auto; }

/* ─── Actions ─────────────────────────────────────────────────────── */
.actions-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; }

/* ─── Camera ──────────────────────────────────────────────────────── */
.camera-container { max-width: 640px; }
.camera-preview { width: 100%; border-radius: 12px; border: 1px solid rgba(155,109,200,0.2); background: #000; }

/* ─── History ─────────────────────────────────────────────────────── */
.history-grid { display: flex; flex-direction: column; gap: 6px; }
.history-card { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: all 0.2s ease; }
.history-card:hover { background: rgba(155,109,200,0.1); border-color: rgba(155,109,200,0.3); }
.history-card:hover .delete-entry { opacity: 1; }
.history-thumb { width: 48px; height: 64px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.history-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.history-name { font-size: 0.85rem; color: rgba(255,255,255,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.history-meta { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 2px; }
.history-grade { color: rgba(155,109,200,0.8); font-weight: 600; }
.delete-entry { opacity: 0; background: none; border: none; color: rgba(255,80,80,0.7); cursor: pointer; padding: 2px; border-radius: 4px; transition: all 0.15s ease; flex-shrink: 0; }
.delete-entry:hover { color: rgba(255,80,80,1); background: rgba(255,80,80,0.1); }
</style>
