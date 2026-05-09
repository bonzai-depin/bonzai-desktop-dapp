<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="mint-modal-overlay" @click.self="handleClose">
        <div class="mint-modal">
          <!-- Header -->
          <div class="mint-modal-header p-5">
            <h2
              class="fira-sans-condensed-black-italic is-size-3 has-text-white"
            >
              <span class="material-symbols-outlined mr-2 is-size-2">
                token
              </span>
              Mint Collectible
            </h2>
            <div class="header-right">
              <span class="network-pill" :class="networkClass">
                {{ networkConfig.label }} &middot; {{ networkConfig.standard }}
              </span>
              <BzCloseButton
                size="md"
                aria-label="Close mint dialog"
                @click="handleClose"
              />
            </div>
          </div>

          <div class="mint-modal-body p-5">
            <!-- Content Preview -->
            <div class="content-preview mb-5">
              <div
                v-if="contentType?.startsWith('image/')"
                class="preview-image"
              >
                <img :src="previewSrc" alt="Content preview" />
              </div>
              <div v-else-if="contentType?.startsWith('audio/')" class="preview-audio">
                <img :src="customBgSrc || audioBgSrc" class="audio-bg" :class="{ blurred: !customBgSrc }" alt="" />
                <div class="preview-shade"></div>
                <div class="audio-overlay">
                  <img v-if="!customBgSrc" :src="logoSrc" class="preview-logo" alt="BonzAI" />
                  <span class="preview-type">{{ generationType }}</span>
                  <audio controls preload="metadata" :src="audioPreviewSrc"></audio>
                </div>
                <button class="shuffle-bg-btn" @click="generateBackground" :disabled="isGeneratingBg" title="Shuffle Background">
                  <span v-if="isGeneratingBg" class="material-symbols-outlined rotating">progress_activity</span>
                  <span v-else class="material-symbols-outlined">auto_fix_high</span>
                </button>
              </div>
              <div v-else-if="contentType?.startsWith('video/')" class="preview-video">
                <img :src="customBgSrc || videoPosterSrc" class="video-bg" :class="{ blurred: !customBgSrc }" alt="" />
                <div class="preview-shade"></div>
                <div class="video-overlay">
                  <img v-if="!customBgSrc" :src="logoSrc" class="preview-logo" alt="BonzAI" />
                  <video
                    controls
                    preload="metadata"
                    :poster="customBgSrc || videoPosterSrc"
                    :src="videoPreviewSrc"
                  ></video>
                </div>
                <span class="preview-type">{{ generationType }}</span>
                <button class="shuffle-bg-btn" @click="generateBackground" :disabled="isGeneratingBg" title="Shuffle Background">
                  <span v-if="isGeneratingBg" class="material-symbols-outlined rotating">progress_activity</span>
                  <span v-else class="material-symbols-outlined">auto_fix_high</span>
                </button>
              </div>
              <div v-else-if="contentType?.startsWith('text/')" class="preview-text">
                <img :src="customBgSrc || textBgSrc" class="text-bg" :class="{ blurred: !customBgSrc }" alt="" />
                <div class="preview-shade"></div>
                <img v-if="!customBgSrc" :src="logoSrc" class="text-logo" alt="BonzAI" />
                <p class="text-snippet">{{ textSnippet }}</p>
                <span class="preview-type text-type-label">{{ generationType }}</span>
                <button class="shuffle-bg-btn" @click="generateBackground" :disabled="isGeneratingBg" title="Shuffle Background">
                  <span v-if="isGeneratingBg" class="material-symbols-outlined rotating">progress_activity</span>
                  <span v-else class="material-symbols-outlined">auto_fix_high</span>
                </button>
              </div>
              <div v-else-if="contentType?.startsWith('model/')" class="preview-3d">
                <iframe
                  v-if="threeDPreviewUrl"
                  :src="threeDPreviewUrl"
                  sandbox="allow-scripts allow-same-origin"
                  class="three-iframe"
                ></iframe>
                <span class="preview-type">{{ generationType }}</span>
              </div>
              <div v-else class="preview-icon">
                <span
                  class="material-symbols-outlined"
                  style="font-size: 48px; opacity: 0.5"
                >
                  {{ previewIcon }}
                </span>
                <span class="preview-type">{{ generationType }}</span>
              </div>
            </div>

            <!-- Editable Fields (before minting) -->
            <div v-if="stage === 'ready'" class="mint-fields">
              <!-- Wallet not connected -->
              <div v-if="!isWalletConnected" class="bz-notice bz-notice--danger mb-4">
                <span class="bz-notice__icon"><span class="material-symbols-outlined">account_balance_wallet</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">Wallet not connected</p>
                  <p class="bz-notice__text">Connect your wallet to mint your content as a collectible.</p>
                </div>
              </div>

              <!-- Checking levels -->
              <div v-else-if="isCheckingLevels" class="bz-notice mb-4">
                <span class="bz-notice__icon"><span class="material-symbols-outlined rotating">sync</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">Checking mint access&hellip;</p>
                </div>
              </div>

              <!-- Level gate banner -->
              <div v-else-if="!mintAccess.canMint" class="bz-notice bz-notice--warning mb-4">
                <span class="bz-notice__icon"><span class="material-symbols-outlined">lock</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">{{ mintAccess.levelRequired }} required</p>
                  <p class="bz-notice__text">{{ mintAccess.reason }}.</p>
                </div>
              </div>

              <div class="field mb-5">
                <label class="label fira-sans-condensed-black-italic">
                  Collectible Title
                </label>
                <input
                  v-model="mintTitle"
                  class="input"
                  type="text"
                  maxlength="80"
                />
              </div>
              <div class="field mb-5">
                <label class="label fira-sans-condensed-black-italic">Collectible Description</label>
                <textarea
                  v-model="mintDescription"
                  class="textarea"
                  rows="2"
                  maxlength="500"
                ></textarea>
              </div>
              <hr />
              <div class="has-text-centered">
                <button
                  type="button"
                  class="bz-btn bz-btn--primary bz-btn--lg mt-4 mb-5"
                  @click="startMint"
                  :disabled="isMinting || !mintAccess.canMint || isCheckingLevels || !isWalletConnected || !hasValidFields"
                >
                  <span class="material-symbols-outlined">token</span>
                  <template v-if="!isWalletConnected">Connect wallet to mint</template>
                  <template v-else-if="isCheckingLevels">Checking access&hellip;</template>
                  <template v-else-if="!hasValidFields">Enter a title</template>
                  <template v-else>Mint collectible &middot; {{ networkConfig.fee }} {{ networkConfig.currency }}</template>
                </button>
              </div>
            </div>

            <!-- Progress (during minting) -->
            <div v-else-if="stage === 'minting'" class="mint-progress">
              <div class="progress-stages">
                <div
                  v-for="(s, i) in stages"
                  :key="s.key"
                  class="progress-stage"
                  :class="{
                    active: currentStage === s.key,
                    done: stageIndex(currentStage) > i,
                  }"
                >
                  <span class="stage-icon material-symbols-outlined">
                    {{ stageIndex(currentStage) > i ? "check_circle" : s.icon }}
                  </span>
                  <span class="stage-label">{{ s.label }}</span>
                </div>
              </div>

              <progress
                class="progress is-warning"
                :value="progressPercent"
                max="100"
              >
                {{ progressPercent }}%
              </progress>
              <p class="progress-message">{{ progressMessage }}</p>
              <div class="has-text-centered mt-4">
                <button type="button" class="bz-btn bz-btn--destructive bz-btn--sm" @click="cancelMint">
                  <span class="material-symbols-outlined">close</span>
                  Cancel
                </button>
              </div>
            </div>

            <!-- Success Result -->
            <div v-else-if="stage === 'success'" class="mint-result">
              <div class="result-icon success">
                <span
                  class="material-symbols-outlined"
                  style="font-size: 48px; color: var(--bz-emerald-500)"
                >
                  check_circle
                </span>
              </div>
              <h3 class="bz-h2 has-text-centered mb-4 fira-sans-condensed-black-italic">
                Minted successfully
              </h3>

              <div class="result-details">
                <div class="detail-row" v-if="mintResult.tokenId">
                  <span class="label">Token ID</span>
                  <span class="value monospace">{{ mintResult.tokenId }}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Network</span>
                  <span class="value">
                    {{ networkConfig.label }} ({{ networkConfig.standard }})
                  </span>
                </div>
                <div class="detail-row" v-if="mintResult.explorerUrl">
                  <span class="label">Transaction</span>
                  <a
                    :href="mintResult.explorerUrl"
                    target="_blank"
                    class="value link"
                  >
                    View on Explorer
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 14px"
                    >
                      open_in_new
                    </span>
                  </a>
                </div>
                <div class="detail-row" v-if="mintResult.contentUrl">
                  <span class="label">Content</span>
                  <a
                    :href="mintResult.contentUrl"
                    target="_blank"
                    class="value link"
                  >
                    View on IPFS
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 14px"
                    >
                      open_in_new
                    </span>
                  </a>
                </div>
              </div>

              <button
                type="button"
                class="bz-btn bz-btn--success bz-btn--lg mt-4"
                style="width: 100%;"
                @click="handleClose"
              >
                Done
              </button>
            </div>

            <!-- Error -->
            <div v-else-if="stage === 'error'" class="mint-error">
              <div class="bz-notice bz-notice--danger bz-notice--stacked">
                <span class="bz-notice__icon"><span class="material-symbols-outlined">error</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">Mint failed</p>
                  <p class="bz-notice__text">There was an error during the minting of your collectible. Please retry.</p>
                </div>
              </div>
              <hr />
              <div class="error-actions">
                <button type="button" class="bz-btn bz-btn--primary mr-3" @click="startMint">
                  <span class="material-symbols-outlined">refresh</span>
                  Retry
                </button>
                <button type="button" class="bz-btn bz-btn--destructive" @click="handleClose">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Wallet signature overlay (shown above everything when awaiting wallet confirmation) -->
    <Transition name="fade">
      <div v-if="awaitingSignature" class="wallet-sign-overlay">
        <div class="wallet-sign-card">
          <span class="material-symbols-outlined wallet-sign-icon pulse">
            account_balance_wallet
          </span>
          <h3 class="bz-h2 fira-sans-condensed-black-italic mt-3 mb-2">
            Wallet confirmation required
          </h3>
          <p class="bz-body" style="color: var(--bz-fg-mid);">
            Confirm the transaction in your wallet (MetaMask / WalletConnect).
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import BzCloseButton from "./BzCloseButton.vue";
import { mintStore } from "../stores/mintStore.js";
import { mintContent, extractUserCode, buildInteractive3DViewer } from "../services/contentNFT.service.js";
import { canMintContentType, checkAllLevels } from "../services/level.service.js";
import { useWeb3Store } from "../stores/web3.store.js";
import { web3Service } from "../services/web3.service.js";
import audioBgSrc from "../assets/bonzai_music.webp";
import videoPosterSrc from "../assets/bonzai_video.webp";
import textBgSrc from "../assets/bonzai_chat.webp";
import logoSrc from "../assets/bonzai_logo-full.png";

const props = defineProps({
  visible: { type: Boolean, default: false },
  inferenceType: { type: String, default: "" },
  inferenceId: { type: String, default: "" },
  content: { type: [String, Object, null], default: null },
  contentType: { type: String, default: "" },
  prompt: { type: String, default: "" },
  generation: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["close", "minted"]);

const networkConfig = mintStore.activeMintNetwork;

const networkClass = computed(() => mintStore.state.network);

// Wallet connection state — use Pinia store (same source as bottom bar)
const web3Store = useWeb3Store();
const isWalletConnected = computed(() => web3Store.isConnected);
const isCheckingLevels = ref(false);

// Stage: 'ready' | 'minting' | 'success' | 'error'
const stage = ref("ready");
const isMinting = ref(false);
const progressPercent = ref(0);
const progressMessage = ref("");
const currentStage = ref("upload");
const mintResult = ref({});
const errorMessage = ref("");

// Editable fields
const mintTitle = ref("");
const mintDescription = ref("");

const stages = [
  { key: "upload", label: "Upload", icon: "cloud_upload" },
  { key: "metadata", label: "Metadata", icon: "description" },
  { key: "mint", label: "Mint", icon: "token" },
  { key: "finalize", label: "Done", icon: "check" },
];

const stageIndex = (key) => stages.findIndex((s) => s.key === key);

const previewIcon = computed(() => {
  if (props.contentType?.startsWith("audio/")) return "graphic_eq";
  if (props.contentType?.startsWith("video/")) return "play_circle";
  if (props.contentType?.startsWith("text/")) return "code";
  if (props.contentType?.startsWith("model/")) return "3d_rotation";
  return "token";
});

const generationType = computed(() => {
  return props.generation?.type || props.inferenceType || "Content";
});

// Level gate check for minting
const mintAccess = computed(() => canMintContentType(props.inferenceType));

// Form validation — title is required
const hasValidFields = computed(() => mintTitle.value.trim().length > 0);

// Show wallet signature overlay when wallet confirmation is needed
const awaitingSignature = computed(() =>
  isMinting.value &&
    currentStage.value === 'mint' && progressMessage.value.includes('Confirm'),
);

const previewSrc = computed(() => {
  if (!props.content) return "";
  if (typeof props.content === "string") {
    if (props.content.startsWith("data:")) return props.content;
    // Assume base64 image
    return `data:${props.contentType || "image/webp"};base64,${props.content}`;
  }
  return "";
});

const audioPreviewSrc = computed(() => {
  if (!props.content || !props.contentType?.startsWith("audio/")) return "";
  if (typeof props.content === "string") {
    if (props.content.startsWith("data:")) return props.content;
    return `data:${props.contentType};base64,${props.content}`;
  }
  return "";
});

const textSnippet = computed(() => {
  if (!props.content || !props.contentType?.startsWith("text/")) return "";
  const raw = typeof props.content === "string" ? props.content : "";
  const clean = raw.replace(/[#*_`~\[\]]/g, "").trim();
  if (clean.length <= 100) return clean;
  return clean.substring(0, 100) + "...";
});

const videoPreviewSrc = computed(() => {
  if (!props.content || !props.contentType?.startsWith("video/")) return "";
  if (typeof props.content === "string") {
    if (props.content.startsWith("data:")) return props.content;
    return `data:${props.contentType};base64,${props.content}`;
  }
  return "";
});

// 3D interactive preview via iframe blob URL
let currentBlobUrl = null;
const threeDPreviewUrl = computed(() => {
  if (!props.content || !props.contentType?.startsWith("model/")) return null;
  // Revoke old blob URL
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  try {
    const code = typeof props.content === "string" ? props.content : "";
    const userCode = extractUserCode(code);
    const html = buildInteractive3DViewer(userCode);
    currentBlobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    return currentBlobUrl;
  } catch (e) {
    console.warn("[MintModal] 3D preview failed:", e);
    return null;
  }
});

onBeforeUnmount(() => {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
});

// Background generation for audio/video minting
const isGeneratingBg = ref(false);
const customBgSrc = ref(null);

async function generateBackground() {
  if (isGeneratingBg.value) return;
  isGeneratingBg.value = true;
  try {
    const bgPrompt = `artistic abstract background for ${generationType.value}, ${props.prompt || 'digital art'}, vibrant colors, cinematic lighting, no text, no people`;
    const port = window.BONZAI_SERVER_PORT || 65000;
    const res = await fetch(`http://localhost:${port}/image/turbo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: bgPrompt,
        negative_prompt: "text, watermark, low quality, blurry, people, person, face, letters, words",
        width: 512,
        height: 512,
        steps: 4,
      }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.image) {
      customBgSrc.value = `data:image/webp;base64,${data.image}`;
    }
  } catch (e) {
    console.warn("[MintModal] Background generation failed:", e.message);
  } finally {
    isGeneratingBg.value = false;
  }
}

// Reset state when modal opens
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      stage.value = "ready";
      isMinting.value = false;
      progressPercent.value = 0;
      progressMessage.value = "";
      currentStage.value = "upload";
      mintResult.value = {};
      errorMessage.value = "";
      customBgSrc.value = null;
      isGeneratingBg.value = false;

      // Refresh balances + level status (await to ensure mint button reflects reality)
      if (isWalletConnected.value) {
        isCheckingLevels.value = true;
        try {
          await web3Service.fetchAllBalances();
          await checkAllLevels();
        } catch (e) {
          console.warn('[MintModal] Level check failed:', e.message);
        } finally {
          isCheckingLevels.value = false;
        }
      }

      // Auto-generate title from prompt
      mintTitle.value =
        (props.prompt || "").substring(0, 50) ||
        `BonzAI ${generationType.value}`;
      mintDescription.value = `AI-generated ${generationType.value} by BonzAI.`;
    }
  },
);

async function startMint() {
  isMinting.value = true;
  stage.value = "minting";
  progressPercent.value = 5;
  progressMessage.value = "Starting...";

  const result = await mintContent({
    content: props.content,
    contentType: props.contentType,
    prompt: props.prompt,
    generation: props.generation,
    title: mintTitle.value,
    description: mintDescription.value,
    inferenceType: props.inferenceType,
    inferenceId: props.inferenceId,
    customThumbnail: customBgSrc.value || undefined,
    onProgress: (stageKey, message, percent) => {
      currentStage.value = stageKey;
      progressMessage.value = message;
      progressPercent.value = percent;
    },
  });

  isMinting.value = false;

  if (result.success) {
    stage.value = "success";
    mintResult.value = result;
    emit("minted", result);
  } else {
    stage.value = "error";
    errorMessage.value = result.error || "Minting failed. Please try again.";
  }
}

function cancelMint() {
  isMinting.value = false;
  stage.value = "ready";
  progressPercent.value = 0;
  progressMessage.value = "";
  currentStage.value = "upload";
}

function handleClose() {
  if (isMinting.value) {
    cancelMint();
    return;
  }
  emit("close");
}
</script>

<style scoped>
.mint-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10003;
}

.mint-modal {
  width: 90%;
  max-width: 640px;
  max-height: 90vh;
  border: 1px solid var(--bz-border);
  border-radius: 16px;
  overflow-y: auto;
  overflow-x: hidden;
}

.mint-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--bz-scrim);
  border-bottom: 1px solid var(--bz-border);
}

.mint-modal-header h2 {
  display: flex;
  align-items: center;
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.network-pill {
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
}

.network-pill.base {
  background: rgba(0, 82, 255, 0.2);
  color: #5b8eff;
  border: 1px solid rgba(0, 82, 255, 0.4);
}

.mint-modal-body {
  padding: 20px;
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

/* Content Preview */
.content-preview {
  margin-bottom: 16px;
  max-width: 50%;
  margin-left: auto;
  margin-right: auto;
  border-radius: 4px !important;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--bz-canvas);
}

.preview-image {
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 200px;
  overflow: hidden;
}

.preview-image img {
  max-width: 100%;
  object-fit: contain;
}

.preview-shade {
  position: absolute;
  inset: 0;
  background: var(--bz-scrim-deep);
  z-index: 1;
  pointer-events: none;
}

.preview-audio {
  position: relative;
  width: 100%;
  padding-top: 100%;
  overflow: hidden;
  border-radius: 4px;
}

.preview-audio .audio-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-audio .audio-bg.blurred {
  filter: blur(12px);
  transform: scale(1.08);
}

.preview-audio .audio-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 24px;
  z-index: 2;
}

.preview-audio audio {
  width: 90%;
  max-width: 360px;
  margin-bottom: 8px;
}

.preview-audio .preview-type {
  color: var(--bz-fg);
  font-size: 13px;
  text-transform: uppercase;
  margin-bottom: 12px;
  opacity: 0.8;
}

.preview-video {
  position: relative;
  width: 100%;
  padding-top: 75%;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}

.preview-video .video-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-video .video-bg.blurred {
  filter: blur(12px);
  transform: scale(1.08);
}

.preview-video .video-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 24px;
  z-index: 2;
}

.preview-video video {
  width: 90%;
  max-height: 200px;
  border-radius: 4px;
}

.preview-video .preview-type {
  position: absolute;
  top: 8px;
  right: 10px;
  color: var(--bz-fg);
  font-size: 11px;
  text-transform: uppercase;
  opacity: 0.7;
  background: var(--bz-scrim-strong);
  padding: 2px 8px;
  border-radius: 3px;
}

.preview-3d {
  position: relative;
  width: 100%;
  padding-top: 100%;
  border-radius: 4px;
  overflow: hidden;
  background: #1a1a2e;
}

.preview-3d .three-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.preview-3d .preview-type {
  position: absolute;
  top: 8px;
  right: 10px;
  color: var(--bz-fg);
  font-size: 11px;
  text-transform: uppercase;
  opacity: 0.7;
  background: var(--bz-scrim-strong);
  padding: 2px 8px;
  border-radius: 3px;
  z-index: 1;
}

.preview-logo {
  max-height: 50%;
  width: auto;
  object-fit: contain;
  margin-bottom: auto;
  margin-top: 0;
  padding-top: 5%;
  filter: drop-shadow(0 2px 8px var(--bz-scrim-strong));
}

.preview-text {
  position: relative;
  width: 100%;
  padding-top: 100%;
  overflow: hidden;
  border-radius: 4px;
}

.preview-text .text-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-text .text-bg.blurred {
  filter: blur(12px);
  transform: scale(1.08);
}

.preview-text .text-logo {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -100%);
  max-height: 45%;
  width: auto;
  z-index: 2;
  filter: drop-shadow(0 2px 8px var(--bz-scrim-strong));
}

.preview-text .text-snippet {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, 0);
  width: 80%;
  color: var(--bz-fg);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  word-break: break-word;
  padding-top: 8px;
  z-index: 2;
}

.preview-text .text-type-label {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--bz-fg);
  font-size: 13px;
  text-transform: uppercase;
  opacity: 0.8;
  z-index: 2;
}

.shuffle-bg-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(138, 43, 226, 0.9);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--bz-fg);
  z-index: 3;
  transition: opacity 0.2s, transform 0.2s;
}

.shuffle-bg-btn .material-symbols-outlined {
  font-size: 16px;
}

.shuffle-bg-btn:hover:not(:disabled) {
  background: rgba(138, 43, 226, 1);
  transform: scale(1.1);
}

.shuffle-bg-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.rotating {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.preview-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--bz-fg-low);
}

.preview-type {
  font-size: 12px;
  text-transform: uppercase;
  margin-top: 8px;
  opacity: 0.6;
}

/* Fields */
.mint-fields .field {
  margin-bottom: 12px;
}

.mint-fields .label {
  color: rgba(255, 255, 255, 1);
  font-size: 12px;
  margin-bottom: 10px;
}

.mint-fields .input,
.mint-fields .textarea {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border-strong);
  color: var(--bz-fg);
  border-radius: 4px;
  resize: none;
}

.mint-fields .input:focus,
.mint-fields .textarea:focus {
  border-color: var(--bz-fg-faint);
  box-shadow: none;
}

/* Fee */
.fee-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bz-canvas);
  border-radius: 8px;
  border: 1px solid var(--bz-card);
}

.fee-label {
  color: var(--bz-fg-mid);
  font-size: 13px;
}

.fee-amount {
  color: var(--bz-warning);
  font-size: 16px;
}

/* Progress */
.mint-progress {
  text-align: center;
}

.progress-stages {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.progress-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0.4;
  transition: opacity 0.3s;
}

.progress-stage.active {
  opacity: 1;
}

.progress-stage.done {
  opacity: 0.8;
}

.progress-stage.done .stage-icon {
  color: var(--bz-emerald-500);
}

.stage-icon {
  font-size: 24px;
  color: var(--bz-fg-mid);
}

.progress-stage.active .stage-icon {
  color: var(--bz-warning);
  animation: pulse-icon 1.5s ease-in-out infinite;
}

@keyframes pulse-icon {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.stage-label {
  font-size: 11px;
  color: var(--bz-fg-mid);
}

.progress {
  margin-bottom: 12px;
  height: 6px;
  border-radius: 3px;
}

.progress-message {
  color: var(--bz-fg-mid);
  font-size: 13px;
}

/* Result */
.mint-result,
.mint-error {
  text-align: center;
}

.result-icon {
  margin-bottom: 12px;
}

.result-details {
  text-align: left;
  margin-top: 16px;
}

.result-details .detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--bz-card);
}

.result-details .detail-row:last-child {
  border-bottom: none;
}

.result-details .label {
  color: var(--bz-fg-low);
  font-size: 12px;
}

.result-details .value {
  color: var(--bz-fg);
  font-size: 13px;
  font-weight: 600;
}

.result-details .value.monospace {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
}

.result-details .value.link {
  color: #5b8eff;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.result-details .value.link:hover {
  text-decoration: underline;
}

/* Error */
.error-message {
  color: var(--bz-danger);
  margin: 12px 0;
  font-size: 14px;
}

.error-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 16px;
}

/* Wallet Signature Overlay — z-index above everything */
.wallet-sign-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
}

.wallet-sign-card {
  text-align: center;
  padding: 40px 48px;
  background: var(--bz-canvas);
  border: 1px solid rgba(255, 224, 138, 0.25);
  border-radius: 20px;
  max-width: 400px;
}

.wallet-sign-icon {
  font-size: 56px;
  color: var(--bz-warning);
}

.wallet-sign-icon.pulse {
  animation: wallet-pulse 1.8s ease-in-out infinite;
}

@keyframes wallet-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.92); }
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
