<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="mint-modal-overlay" @click.self="handleClose">
        <div class="mint-modal" role="dialog" aria-modal="true" aria-labelledby="mint-modal-title">
          <div class="mint-modal-header">
            <h2 id="mint-modal-title" class="mint-modal-title">
              <span class="material-symbols-outlined" aria-hidden="true">token</span>
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

          <div class="mint-modal-body">
            <!-- Content Preview -->
            <div class="content-preview" :class="{ 'content-preview--text': contentType?.startsWith('text/') }">
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
                <div class="preview-text__head">
                  <span class="material-symbols-outlined" aria-hidden="true">article</span>
                  <span>{{ generationType }}</span>
                </div>
                <p class="text-snippet">{{ textSnippet }}</p>
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
                <span class="material-symbols-outlined">
                  {{ previewIcon }}
                </span>
                <span class="preview-type">{{ generationType }}</span>
              </div>
            </div>

            <!-- Editable Fields (before minting) -->
            <div v-if="stage === 'ready'" class="mint-fields">
              <!-- Wallet not connected -->
              <div v-if="!isWalletConnected" class="bz-notice bz-notice--danger">
                <span class="bz-notice__icon"><span class="material-symbols-outlined">account_balance_wallet</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">Wallet not connected</p>
                  <p class="bz-notice__text">Connect your wallet to mint your content as a collectible.</p>
                </div>
              </div>

              <!-- Checking levels -->
              <div v-else-if="isCheckingLevels" class="bz-notice">
                <span class="bz-notice__icon"><span class="material-symbols-outlined rotating">sync</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">Checking mint access&hellip;</p>
                </div>
              </div>

              <!-- Level gate banner -->
              <div v-else-if="!mintAccess.canMint" class="bz-notice bz-notice--warning">
                <span class="bz-notice__icon"><span class="material-symbols-outlined">lock</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">{{ mintAccess.levelRequired }} required</p>
                  <p class="bz-notice__text">{{ mintAccess.reason }}.</p>
                </div>
              </div>

              <div class="mint-field">
                <label class="mint-label">
                  Collectible Title
                </label>
                <input
                  v-model="mintTitle"
                  class="mint-input"
                  type="text"
                  maxlength="80"
                />
              </div>
              <div class="mint-field">
                <label class="mint-label">Collectible Description</label>
                <textarea
                  v-model="mintDescription"
                  class="mint-input mint-input--textarea"
                  rows="2"
                  maxlength="500"
                ></textarea>
              </div>
              <div class="mint-actions">
                <button
                  type="button"
                  class="bz-btn bz-btn--primary bz-btn--lg"
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

              <div class="mint-progress-bar" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
                <span :style="{ width: `${progressPercent}%` }"></span>
              </div>
              <p class="progress-message">{{ progressMessage }}</p>
              <div class="mint-actions">
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
                  class="material-symbols-outlined result-icon__glyph"
                >
                  check_circle
                </span>
              </div>
              <h3 class="mint-result-title">
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
                    <span class="material-symbols-outlined">
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
                    <span class="material-symbols-outlined">
                      open_in_new
                    </span>
                  </a>
                </div>
              </div>

              <button
                type="button"
                class="bz-btn bz-btn--success bz-btn--lg mint-result-done"
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
              <div class="error-actions">
                <button type="button" class="bz-btn bz-btn--primary" @click="startMint">
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
          <h3 class="wallet-sign-title">
            Wallet confirmation required
          </h3>
          <p class="wallet-sign-text">
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

function stripThinkTags(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/<\/think>/gi, "")
    .trim();
}

const textSnippet = computed(() => {
  if (!props.content || !props.contentType?.startsWith("text/")) return "";
  const raw = typeof props.content === "string" ? props.content : "";
  const clean = stripThinkTags(raw).replace(/[#*_`~\[\]]/g, "").trim();
  if (clean.length <= 1400) return clean;
  return clean.substring(0, 1400) + "...";
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
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--bz-space-4);
  background: var(--bz-overlay);
}

.mint-modal {
  width: min(680px, 100%);
  max-height: min(90vh, 820px);
  overflow: auto;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  box-shadow: 0 24px 80px var(--bz-scrim-strong);
}

.mint-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4);
  background: var(--bz-card);
  border-bottom: 1px solid var(--bz-border);
}

.mint-modal-title {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0;
  color: var(--bz-fg);
  font-family: "Fira Sans Condensed", sans-serif;
  font-size: 28px;
  font-style: italic;
  font-weight: 900;
  line-height: 1;
}

.mint-modal-title .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 24px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
}

.network-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-low);
  font-family: var(--bz-font-mono);
  font-size: var(--bz-size-micro);
  font-weight: 700;
  text-transform: uppercase;
}

.network-pill.base {
  background: rgba(0, 82, 255, 0.12);
  border-color: rgba(0, 82, 255, 0.35);
  color: var(--bz-info);
}

.mint-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
  padding: var(--bz-space-4);
}

.content-preview {
  width: min(360px, 100%);
  margin: 0 auto;
  overflow: hidden;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}

.content-preview--text {
  width: 100%;
}

.preview-image {
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 300px;
  background: var(--bz-canvas);
}

.preview-image img {
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
}

.preview-shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: var(--bz-scrim-deep);
}

.preview-audio,
.preview-video,
.preview-3d {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--bz-canvas);
}

.preview-audio,
.preview-3d {
  aspect-ratio: 1;
}

.preview-video {
  aspect-ratio: 4 / 3;
}

.preview-audio .audio-bg,
.preview-video .video-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-audio .audio-bg.blurred,
.preview-video .video-bg.blurred {
  filter: blur(12px);
}

.preview-audio .audio-overlay,
.preview-video .video-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: var(--bz-space-2);
  padding: var(--bz-space-4);
}

.preview-audio audio {
  width: min(360px, 92%);
}

.preview-video video {
  width: min(380px, 92%);
  max-height: 220px;
  border-radius: var(--bz-r-sm);
}

.preview-logo {
  width: min(180px, 70%);
  height: auto;
  margin-bottom: auto;
  filter: drop-shadow(0 2px 8px var(--bz-scrim-strong));
}

.preview-type {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 var(--bz-space-2);
  background: var(--bz-scrim-strong);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-low);
  font-family: var(--bz-font-mono);
  font-size: var(--bz-size-micro);
  font-weight: 700;
  text-transform: uppercase;
}

.preview-video .preview-type,
.preview-3d .preview-type {
  position: absolute;
  top: var(--bz-space-2);
  right: var(--bz-space-2);
  z-index: 3;
}

.preview-3d .three-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.preview-text {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  max-height: min(46vh, 380px);
  padding: var(--bz-space-4);
  overflow: auto;
  background: var(--bz-canvas);
}

.preview-text__head {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-purple-300);
  font-family: var(--bz-font-mono);
  font-size: var(--bz-size-micro);
  font-weight: 700;
  text-transform: uppercase;
}

.preview-text__head .material-symbols-outlined {
  font-size: 16px;
}

.text-snippet {
  margin: 0;
  color: var(--bz-fg);
  font-size: var(--bz-size-body);
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.shuffle-bg-btn {
  position: absolute;
  right: var(--bz-space-2);
  bottom: var(--bz-space-2);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--bz-fg);
  background: var(--bz-purple-soft);
  border: 1px solid var(--bz-purple-300);
  border-radius: var(--bz-r-sm);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}

.shuffle-bg-btn:hover:not(:disabled) {
  background: var(--bz-raised);
  border-color: var(--bz-fg-faint);
}

.shuffle-bg-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.shuffle-bg-btn .material-symbols-outlined {
  font-size: 16px;
}

.rotating {
  animation: bz-spin 1s linear infinite;
}

.preview-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  gap: var(--bz-space-2);
  color: var(--bz-fg-low);
}

.preview-icon .material-symbols-outlined {
  font-size: 48px;
  opacity: 0.5;
}

.mint-fields {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

.mint-field {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}

.mint-label {
  color: var(--bz-fg-low);
  font-family: var(--bz-font-mono);
  font-size: var(--bz-size-micro);
  font-weight: 700;
  text-transform: uppercase;
}

.mint-input {
  width: 100%;
  min-height: 40px;
  padding: var(--bz-space-2) var(--bz-space-3);
  resize: none;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg);
  font: inherit;
}

.mint-input--textarea {
  min-height: 76px;
}

.mint-input:focus {
  border-color: var(--bz-purple-300);
  outline: none;
}

.mint-actions {
  display: flex;
  justify-content: center;
  margin-top: var(--bz-space-1);
}

.mint-progress {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

.progress-stages {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bz-space-2);
}

.progress-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bz-space-1);
  padding: var(--bz-space-2);
  color: var(--bz-fg-low);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}

.progress-stage.active {
  color: var(--bz-warning);
  border-color: var(--bz-warning);
}

.progress-stage.done {
  color: var(--bz-emerald-500);
}

.stage-icon {
  font-size: 22px;
}

.stage-label {
  font-size: var(--bz-size-micro);
  text-transform: uppercase;
}

.mint-progress-bar {
  height: 6px;
  overflow: hidden;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: 999px;
}

.mint-progress-bar span {
  display: block;
  height: 100%;
  background: var(--bz-purple-300);
  transition: width var(--bz-dur-base) var(--bz-ease-out);
}

.progress-message {
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  text-align: center;
}

.mint-result,
.mint-error {
  text-align: center;
}

.result-icon {
  margin-bottom: var(--bz-space-2);
}

.result-icon__glyph {
  color: var(--bz-emerald-500);
  font-size: 48px;
}

.mint-result-title,
.wallet-sign-title {
  margin: 0 0 var(--bz-space-3);
  color: var(--bz-fg);
  font-family: "Fira Sans Condensed", sans-serif;
  font-size: 24px;
  font-style: italic;
  font-weight: 900;
}

.result-details {
  margin-top: var(--bz-space-3);
  text-align: left;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
}

.detail-row:last-child {
  border-bottom: 0;
}

.detail-row .label {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}

.detail-row .value {
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
  font-weight: 600;
  text-align: right;
}

.detail-row .value.monospace {
  font-family: var(--bz-font-mono);
  font-size: 12px;
}

.detail-row .value.link {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  color: var(--bz-info);
  text-decoration: none;
}

.detail-row .value.link:hover {
  text-decoration: underline;
}

.detail-row .value.link .material-symbols-outlined {
  font-size: 14px;
}

.mint-result-done {
  width: 100%;
  margin-top: var(--bz-space-4);
}

.error-actions {
  display: flex;
  justify-content: center;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-4);
}

.wallet-sign-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--bz-space-4);
  background: rgba(0, 0, 0, 0.88);
}

.wallet-sign-card {
  width: min(400px, 100%);
  padding: var(--bz-space-5);
  text-align: center;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-warning);
  border-radius: var(--bz-r);
}

.wallet-sign-icon {
  color: var(--bz-warning);
  font-size: 56px;
}

.wallet-sign-icon.pulse {
  animation: wallet-pulse 1.8s ease-in-out infinite;
}

.wallet-sign-text {
  margin: 0;
  color: var(--bz-fg-mid);
}

@keyframes wallet-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--bz-dur-fast) var(--bz-ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .mint-modal-overlay {
    align-items: stretch;
    padding: var(--bz-space-2);
  }

  .mint-modal {
    max-height: 100%;
  }

  .mint-modal-header,
  .mint-modal-body {
    padding: var(--bz-space-3);
  }

  .mint-modal-title {
    font-size: 22px;
  }

  .network-pill {
    display: none;
  }

  .progress-stages {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
