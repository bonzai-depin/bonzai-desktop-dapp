<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="mint-modal-overlay" @click.self="handleClose">
        <div ref="mintDialog" class="mint-modal" role="dialog" aria-modal="true" aria-labelledby="mint-modal-title">
          <div class="mint-modal-header">
            <h2 id="mint-modal-title" class="mint-modal-title">
              <span class="material-symbols-outlined" aria-hidden="true">token</span>
              Tokenize
            </h2>
            <div class="header-right">
              <span class="network-pill">
                {{ networkConfig.label }} &middot; {{ networkConfig.standard }}
              </span>
              <BzCloseButton
                :disabled="isMinting"
                size="md"
                aria-label="Close tokenization dialog"
                @click="handleClose"
              />
            </div>
          </div>

          <div class="mint-process"><TokenizationProgress :steps="tokenizationSteps" :current="tokenizationStep" :complete="stage === 'success'" :failed="stage === 'error' && !confirmationPending" /></div>
          <div class="mint-modal-body" :class="{'is-review':stage === 'ready'}">
            <aside class="mint-preview-column">
            <div class="nft-background-carousel" aria-label="NFT theme">
              <button type="button" class="bz-btn bz-btn--icon" aria-label="Previous theme" :disabled="stage !== 'ready'" @click="cycleTheme(-1)"><span class="material-symbols-outlined">chevron_left</span></button>
              <span class="nft-theme-swatch" :style="{background:selectedTheme.swatch?.[0] || 'var(--bz-canvas)',color:selectedTheme.swatch?.[1] || 'var(--bz-fg)'}" aria-hidden="true">Aa</span><span>{{ selectedTheme.name }}</span>
              <button type="button" class="bz-btn bz-btn--icon" aria-label="Next theme" :disabled="stage !== 'ready'" @click="cycleTheme(1)"><span class="material-symbols-outlined">chevron_right</span></button>
            </div>
            <div v-if="canChooseBackground" class="nft-background-carousel" aria-label="Artwork background">
              <button type="button" class="bz-btn bz-btn--icon" aria-label="Previous background" :disabled="stage !== 'ready'" @click="cycleBackground(-1)"><span class="material-symbols-outlined">chevron_left</span></button>
              <img :src="selectedBackground?.src" alt="" /><span>{{ selectedBackgroundName }}</span>
              <button type="button" class="bz-btn bz-btn--icon" aria-label="Next background" :disabled="stage !== 'ready'" @click="cycleBackground(1)"><span class="material-symbols-outlined">chevron_right</span></button>
            </div>
            <!-- Content Preview -->
            <div class="token-artwork-preview">
              <img v-if="contentType?.startsWith('image/') && !artworkTheme && previewSrc" :src="previewSrc" alt="Original NFT artwork" @load="previewReady = true" @error="previewError = 'The image could not be displayed.'" />
              <img v-else-if="coverSrc" :src="coverSrc" alt="Final NFT cover artwork" />
              <span v-else-if="!coverError && !previewError" role="status">Preparing artwork…</span><span v-else role="status">Artwork unavailable</span>
              <audio v-if="contentType?.startsWith('audio/') && audioPreviewSrc" ref="inlineMedia" preload="metadata" :src="audioPreviewSrc" @loadedmetadata="previewReady = true" @ended="stopPlayback" @error="previewError = 'The selected audio could not be played.'"></audio>
              <video v-if="contentType?.startsWith('video/') && videoPreviewSrc" ref="inlineMedia" class="inline-video" :class="{'is-playing': isPlaying}" playsinline preload="metadata" :src="videoPreviewSrc" @loadedmetadata="previewReady = true" @ended="stopPlayback" @error="previewError = 'The selected video could not be played.'"></video>
              <div v-if="inferenceType === 'object' && isPlaying" class="inline-scene"><Mint3DPreview :code="generation.threeCode || content" @ready="previewReady = true" @error="previewError = $event.message; stopPlayback()" /></div>
              <button v-if="inferenceType === 'object' || /^(audio|video)\//.test(contentType)" type="button" class="artwork-play bz-btn bz-btn--primary bz-btn--icon" :aria-label="isPlaying ? 'Stop preview' : 'Play preview'" @click="togglePlayback"><span class="material-symbols-outlined">{{ isPlaying ? 'stop' : 'play_arrow' }}</span></button>
            </div>
            <p v-if="coverError" class="bz-notice bz-notice--warning" role="status">{{ coverError }} <button type="button" class="bz-btn" @click="coverRetry++">Retry</button></p>


            <div v-if="previewError" class="bz-notice bz-notice--warning" role="status">{{ previewError }}</div>

            </aside>
            <!-- Editable Fields (before minting) -->
            <div v-if="stage === 'ready'" class="mint-fields">
              <!-- Wallet not connected -->
              <div v-if="!isWalletConnected" class="bz-notice">
                <span class="bz-notice__icon"><span class="material-symbols-outlined">account_balance_wallet</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">Wallet not connected</p>
                  <p class="bz-notice__text">{{ inferenceType === 'training' ? 'Connect your wallet to tokenize this model.' : 'Connect your wallet to tokenize your content.' }}</p><button class="bz-btn bz-btn--primary" @click="requestConnection">Connect Wallet</button>
                </div>
              </div>

              <div v-else-if="!hasRenderableContent" class="bz-notice bz-notice--danger">
                <span class="bz-notice__icon"><span class="material-symbols-outlined">broken_image</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">Generated file unavailable</p>
                  <p class="bz-notice__text">The original output could not be loaded. Regenerate it or restore the source file before minting.</p>
                </div>
              </div>

              <!-- Checking levels -->
              <div v-else-if="isCheckingLevels" class="bz-notice">
                <span class="bz-notice__icon"><span class="material-symbols-outlined rotating">sync</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">Checking tokenization access&hellip;</p>
                </div>
              </div>

              <!-- Level gate banner -->
              <div v-else-if="!mintAccess.canMint" class="bz-notice bz-notice--warning">
                <span class="bz-notice__icon"><span class="material-symbols-outlined">lock</span></span>
                <div class="bz-notice__body">
                  <p class="bz-notice__title">{{ mintAccess.levelRequired }} required</p>
                  <p class="bz-notice__text">{{ mintAccess.reason }}.</p><button class="bz-btn bz-btn--ghost" @click="openGuide('stake')">View Staking Steps</button>
                </div>
              </div>


              <p v-if="accessError" role="alert">{{ accessError }}</p>
              <div class="mint-policy">
                <label class="mint-policy__item" :class="{ 'is-disabled': isNsfwGeneration }">
                  <input
                    v-model="marketplaceDiscoverable"
                    type="checkbox"
                    :disabled="isNsfwGeneration"
                  />
                  <span>
                    <strong>Discoverable in marketplace metadata</strong>
                    <small v-if="isNsfwGeneration">Disabled for NSFW/adult generations.</small>

                  </span>
                </label>
                <label class="mint-policy__item">
                  <input v-model="trainingMaterial" type="checkbox" />
                  <span>
                    <strong>Allow as training material</strong>

                  </span>
                </label>
              </div>
              <div v-if="!['video','object'].includes(inferenceType)" class="mint-field">
                <label class="mint-label" for="mint-title">
                  {{ inferenceType === 'training' ? 'Model Name' : 'Collectible Title' }}
                </label>
                <input
                  id="mint-title" v-model="mintTitle"
                  class="mint-input"
                  type="text"
                  maxlength="80"
                />
              </div>
              <div v-if="!['video','object'].includes(inferenceType)" class="mint-field mint-description-field">
                <label class="mint-label" for="mint-description">{{ inferenceType === 'training' ? 'Model Description' : 'Collectible Description' }}</label>
                <textarea
                  id="mint-description" v-model="mintDescription"
                  class="mint-input mint-input--textarea"
                  rows="2"
                  maxlength="500"
                ></textarea>
              </div>


            </div>

            <!-- Progress (during minting) -->
            <div v-else-if="stage === 'minting'" class="mint-progress">
              <span class="material-symbols-outlined mint-stage-icon">{{ currentStage === 'mint' ? 'account_balance_wallet' : 'cloud_upload' }}</span>
              <h3>{{ currentStage === 'mint' ? 'Confirm Your Token' : 'Publishing Your Content' }}</h3>
              <div class="mint-progress-bar" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
                <span :style="{ width: `${progressPercent}%` }"></span>
              </div>
              <p class="progress-message">{{ progressMessage }}</p>
              <p>Keep this window open until confirmation.</p>
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
                Tokenized successfully
              </h3>

              <p v-if="mintResult.localRecordWarning" role="status">{{ mintResult.localRecordWarning }}</p>
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
                <div class="detail-row" v-if="mintResult.marketplaceUrl">
                  <span class="label">Marketplace</span>
                  <a
                    :href="mintResult.marketplaceUrl"
                    target="_blank"
                    class="value link"
                  >
                    View on OpenSea
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

              <div v-if="generation.assetKind === 'game'" class="game-token-issue">
                <TokenizationProgress :steps="[{title:'Review Game Token',detail:'Symbol and liquidity'},{title:'Wallet & Confirmation',detail:'Approve the token launch'},{title:'Token Ready',detail:'ERC-20 and locked pool'}]" :current="gameTokenResult ? 2 : issuingGameToken || gamePendingHash ? 1 : 0" :complete="!!gameTokenResult" :failed="!!gameTokenError && !gamePendingHash" />
                <div class="game-token-issue__head">
                  <strong>Game economy</strong>
                  <span>1 billion tokens: 96% locked liquidity, 4% to you. Trading fee: 1%, split 70% creator / 20% treasury / 10% rewards.</span>
                </div>
                <label v-if="!gameTokenResult">Permanently locked liquidity (ETH)
                  <input v-model="gameLiquidityEth" type="number" min="0.01" step="0.01" class="bz-field-input" />
                </label>
                <div v-if="!gameTokenResult" class="game-token-issue__form">
                  <input
                    v-model="gameTokenSymbol"
                    class="bz-field-input"
                    maxlength="12"
                    aria-label="Game token symbol"
                    placeholder="SYMBOL"
                  />
                  <button
                    type="button"
                    class="bz-btn bz-btn--primary"
                    :disabled="!gameConfigured || !!gamePendingHash || issuingGameToken || gameTokenSymbol.trim().length < 2 || Number(gameLiquidityEth) < 0.01"
                    @click="startGameTokenIssue"
                  >
                    <span class="material-symbols-outlined">token</span>
                    {{ issuingGameToken ? 'Issuing…' : 'Issue game token' }}
                  </button>
                </div>
                <p v-if="!gameConfigured">Game token contracts are not configured on this network.</p>
                <p v-if="gamePendingHash"><a :href="`${web3Explorer}/tx/${gamePendingHash}`" target="_blank" rel="noopener noreferrer">View Submitted Transaction ↗</a> <button class="bz-btn bz-btn--ghost" :disabled="issuingGameToken" @click="checkGameIssuance">Check Issuance</button></p>
                <p v-if="gameTokenError" class="game-token-issue__error">{{ gameTokenError }}</p>
                <div v-if="gameTokenResult" class="detail-row">
                  <span class="label">Game token</span>
                  <span class="value monospace">{{ gameTokenResult.tokenAddress }}</span>
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
                  <p class="bz-notice__title">Tokenization failed</p>
                  <p class="bz-notice__text">{{ errorMessage }}</p>
                </div>
              </div>
              <div class="error-actions">
                <button type="button" class="bz-btn bz-btn--primary" :disabled="confirmationPending" @click="startMint">
                  <span class="material-symbols-outlined">refresh</span>
                  Retry
                </button>
                <button type="button" class="bz-btn bz-btn--destructive" @click="handleClose">
                  Cancel
                </button>
              </div>
            </div>

              <div v-if="stage === 'ready'" class="mint-actions mint-actions--primary">
                <button
                  type="button"
                  class="bz-btn bz-btn--primary bz-btn--lg"
                  @click="startMint"
                  :disabled="!mintConfigured || !storageReady || isMinting || !mintAccess.canMint || isCheckingLevels || !isWalletConnected || !hasValidFields || !hasRenderableContent || !licenseStatus.allowed || !previewReady || !!previewError || !!coverError || (!coverSrc && (artworkTheme || !contentType?.startsWith('image/')))"
                >
                  <span class="material-symbols-outlined">token</span>
                  <template v-if="!isWalletConnected">Connect wallet to tokenize</template>
                  <template v-else-if="isCheckingLevels">Checking access&hellip;</template>
                  <template v-else-if="!hasValidFields">Enter a title</template>
                  <template v-else-if="!licenseLoaded">Checking license…</template>
                  <template v-else-if="!licenseStatus.allowed">Tokenization unavailable</template>
                  <template v-else-if="!previewReady">Loading preview…</template>
                  <template v-else>Tokenize &middot; {{ mintFee }} {{ networkConfig.currency }}</template>
                </button>
              </div>
            <p v-if="stage === 'ready' && licenseLoaded && !licenseStatus.allowed" class="mint-rights-note" role="status">{{ licenseStatus.reason }}</p>
            <details class="mint-source mint-source--full">
              <summary><span class="material-symbols-outlined">description</span>Source &amp; Generation Details<span class="material-symbols-outlined source-chevron">expand_more</span></summary>
              <div class="source-facts"><div><span>Model</span><strong>{{ generation.model || 'Not recorded' }}</strong></div><div><span>Format</span><strong>{{ contentType }}</strong></div><div><span>License</span><strong>{{ licenseStatus.licenses.join(', ') || 'Not verified' }}</strong></div></div>
              <div v-if="Object.keys(generation.parameters || {}).length" class="source-block"><h4>Parameters</h4><pre>{{ JSON.stringify(generation.parameters, null, 2) }}</pre></div>
              <div v-if="prompt" class="source-block"><h4>Prompt</h4><p>{{ prompt }}</p></div>
            </details>
            <button type="button" class="mint-guide-link" @click="openGuide('mint')">Tokenization Guide <span aria-hidden="true">↗</span></button>
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
import { visibleText } from "../shared/visibleText.js";
import { themeService } from '../services/theme.service.js';
import TokenizationProgress from './TokenizationProgress.vue';
import { renderNFTCover, extractVideoPoster } from '../services/nftArtwork.js';
import { ref, computed, watch, onBeforeUnmount, defineAsyncComponent, nextTick } from "vue";
import {useModalAccessibility} from "../composables/useModalAccessibility.js";
import BzCloseButton from "./BzCloseButton.vue";
import { requestConnection } from '../services/connectionDialog.service.js';
import { openProtocolGuide } from '../services/protocolNavigation.js';
import { storageStatus } from '../services/storage.service.js';
import { isAddress, ZeroAddress } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { mintStore } from "../stores/mintStore.js";
import { mintContent } from "../services/contentNFT.service.js";
import { canMintContentType, checkAllLevels } from "../services/level.service.js";
import { useWeb3Store } from "../stores/web3.store.js";
import { web3Service } from "../services/web3.service.js";
import { CONTENT_TYPE_MAP } from "../constants/index.js";
import { issueGameToken, recoverGameIssuance } from "../services/gameToken.service.js";

import {musicNFTDescription} from '../services/nftCopy.js';
import {nftBackgrounds} from '../services/nftBackgrounds.js';
import {mintLicenseStatus,resolveMintMediaBytes} from '../services/mintValidation.js';
const Mint3DPreview=defineAsyncComponent(()=>import('./Mint3DPreview.vue'));
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
const mintDialog=ref(null);
useModalAccessibility(mintDialog,{onClose:()=>handleClose()});

const networkConfig = mintStore.activeMintNetwork;
const mintFee = computed(() => {
  const index = CONTENT_TYPE_MAP[props.inferenceType] ?? 0;
  return networkConfig.value.fees[index] || networkConfig.value.fees[0];
});

// Wallet connection state — use Pinia store (same source as bottom bar)
const web3Store = useWeb3Store();
const isWalletConnected = computed(() => web3Store.isConnected);
const isCheckingLevels = ref(false);
const storageReady = ref(false), accessError = ref('');
const mintConfigured = computed(() => isAddress(CONFIG.contentNFT?.economy?.factoryAddress || '') && CONFIG.contentNFT.economy.factoryAddress !== ZeroAddress);
function openGuide(activity) { handleClose(); openProtocolGuide(activity); }
async function refreshAccess() {
  isCheckingLevels.value = true; accessError.value = '';
  try { storageReady.value = (await storageStatus()).configured; if (isWalletConnected.value) await checkAllLevels(); }
  catch (error) { storageReady.value = false; accessError.value = error.message; }
  finally { isCheckingLevels.value = false; }
}
watch(isWalletConnected, () => { if (props.visible) refreshAccess().catch(() => { storageReady.value = false; }); });

// Stage: 'ready' | 'minting' | 'success' | 'error'
const stage = ref("ready");
const isMinting = ref(false);
const progressPercent = ref(0);
const progressMessage = ref("");
const currentStage = ref("upload");
const mintResult = ref({});
const issuingGameToken = ref(false);
const gameTokenResult = ref(null), gamePendingHash = ref('');
const web3Explorer = CONFIG.networks[ECONOMY_NETWORK_KEY].explorer;
const gameConfigured = computed(() => [CONFIG.gameRegistry?.contractAddress, CONFIG.gameTokenFactory?.contractAddress].every(address => isAddress(address || '') && address !== ZeroAddress));
const gameTokenError = ref("");
const gameTokenSymbol = ref("");
const gameLiquidityEth = ref("0.01");
const errorMessage = ref("");
const confirmationPending = ref(false);

// Editable fields
const mintTitle = ref("");
const mintDescription = ref("");
const marketplaceDiscoverable = ref(true);
const trainingMaterial = ref(false);

const tokenizationSteps = [
  {title:'Review', detail:'Check content, rights and costs'},
  {title:'Publish Files', detail:'Upload public content to IPFS'},
  {title:'Wallet & Confirmation', detail:'Approve and confirm onchain'},
  {title:'Complete', detail:'Save the token record'},
];
const tokenizationStep = computed(() => {
  if (stage.value === 'ready') return 0;
  if (stage.value === 'success') return 3;
  return {upload:1, metadata:1, mint:2, finalize:3}[currentStage.value] ?? 1;
});

const generationType = computed(() => {
  return props.generation?.type || props.inferenceType || "Content";
});

async function checkGameIssuance() {
  if (issuingGameToken.value) return;
  issuingGameToken.value = true; gameTokenError.value = '';
  try {
    const result = await recoverGameIssuance(mintResult.value.contractAddress, mintResult.value.tokenId, gamePendingHash.value);
    if (result.pending) { gameTokenError.value = 'Awaiting confirmation. Do not issue again.'; return; }
    if (result.reverted || result.registeredOnly) { gamePendingHash.value = ''; gameTokenError.value = result.reverted ? 'Transaction reverted. Review before trying again.' : 'Registration confirmed. Review the token issuance to continue.'; return; }
    gameTokenResult.value = result; gamePendingHash.value = '';
  } catch (error) { gameTokenError.value = error.message; }
  finally { issuingGameToken.value = false; }
}
async function startGameTokenIssue() {
  if (issuingGameToken.value || gamePendingHash.value || !gameConfigured.value) return;
  issuingGameToken.value = true;
  gameTokenError.value = "";
  try {
    gameTokenResult.value = await issueGameToken({
      collectible: mintResult.value.contractAddress,
      collectibleTokenId: mintResult.value.tokenId,
      name: `${mintTitle.value.trim()} Token`,
      symbol: gameTokenSymbol.value,
      metadataURI: mintResult.value.metadataUrl,
      projectManifest: props.generation?.projectManifest,
      liquidityEth: gameLiquidityEth.value,
    });
  } catch (error) {
    gameTokenError.value = error.message;
    if (error.confirmationPending && error.transactionHash) gamePendingHash.value = error.transactionHash;
  } finally {
    issuingGameToken.value = false;
  }
}

function hasNsfwSignal(value) {
  return /\b(nsfw|adult|explicit|porn|erotic|nude|nudity|sex|sexual|gore)\b/i.test(String(value || ""));
}

const isNsfwGeneration = computed(() => {
  const generation = props.generation || {};
  const tags = Array.isArray(generation.tags) ? generation.tags.join(" ") : generation.tags || "";
  return generation.nsfw === true ||
    generation.isNsfw === true ||
    generation.contentLevel === "adult" ||
    generation.safety?.nsfw === true ||
    hasNsfwSignal(tags) ||
    hasNsfwSignal(props.prompt) ||
    hasNsfwSignal(mintTitle.value) ||
    hasNsfwSignal(mintDescription.value);
});

// Level gate check for minting
const mintAccess = computed(() => canMintContentType(props.inferenceType));

// Form validation — title is required
const hasValidFields = computed(() => mintTitle.value.trim().length > 0);
const hasRenderableContent = computed(() => {
  if (typeof props.content !== "string") return props.content instanceof Uint8Array;
  return props.content.trim().length > 0;
});

// Show wallet signature overlay when wallet confirmation is needed
const awaitingSignature = computed(() =>
  isMinting.value &&
    currentStage.value === 'mint' && progressMessage.value.includes('Confirm'),
);

const previewReady=ref(false);
const previewError=ref('');
const licenseCatalog=ref({});
const licenseLoaded=ref(false);
const licenseStatus=computed(()=>mintLicenseStatus(props.generation,licenseCatalog.value));
let mediaBlobUrl=null;
let mediaPreviewRun=0;
const resolvedMedia=ref(null);
const previewSrc=ref('');
const audioPreviewSrc=previewSrc;
const videoPreviewSrc=previewSrc;
watch(()=>[props.visible,props.content,props.contentType,props.inferenceId],async()=>{
 const run=++mediaPreviewRun; resolvedMedia.value=null;
 if(mediaBlobUrl)URL.revokeObjectURL(mediaBlobUrl);
 mediaBlobUrl=null;previewSrc.value='';previewError.value='';previewReady.value=false;
 if(!props.visible)return;
 try {
  const bytes=await resolveMintMediaBytes(props.content,props.contentType);
  if (run !== mediaPreviewRun || !props.visible) return;
  resolvedMedia.value=bytes;
  if(/^(image|audio|video)\//.test(props.contentType)) {
   mediaBlobUrl=URL.createObjectURL(new Blob([bytes],{type:props.contentType}));previewSrc.value=mediaBlobUrl;
  }else if(props.inferenceType!=='object')previewReady.value=true;
 }catch(error){if(run===mediaPreviewRun)previewError.value=error.message;}
 const {MODEL_REQUIREMENTS}=await import('../skills/flagship.js');licenseCatalog.value=MODEL_REQUIREMENTS;licenseLoaded.value=true;
},{immediate:true});
onBeforeUnmount(()=>{if(mediaBlobUrl)URL.revokeObjectURL(mediaBlobUrl);});

function stripThinkTags(text) { return visibleText(text); }

const textSnippet = computed(() => {
  if (!props.content || !props.contentType?.startsWith("text/")) return "";
  const raw = typeof props.content === "string" ? props.content : "";
  const clean = stripThinkTags(raw).replace(/[#*_`~\[\]]/g, "").trim();
  if (clean.length <= 1400) return clean;
  return clean.substring(0, 1400) + "...";
});

const artworkThemes = computed(() => [{id:'',name:props.contentType?.startsWith('image/')?'Original Artwork':'BonzAI Collection'},...themeService.list()]);
const selectedTheme = computed(() => artworkThemes.value.find(item=>item.id===artworkTheme.value) || artworkThemes.value[0]);
function cycleTheme(delta) {const index=artworkThemes.value.findIndex(item=>item.id===artworkTheme.value);artworkTheme.value=artworkThemes.value[(index+delta+artworkThemes.value.length)%artworkThemes.value.length].id;}
const defaultBackground = () => ({training:'intelligence',text:'create',audio:'music',object:'three-d'})[props.inferenceType] || 'create';
const artworkBackground = ref(defaultBackground());
const selectedBackground = computed(() => nftBackgrounds.find(item => item.id === artworkBackground.value));
function cycleBackground(delta) { const index=nftBackgrounds.findIndex(item=>item.id===artworkBackground.value); artworkBackground.value=nftBackgrounds[(index+delta+nftBackgrounds.length)%nftBackgrounds.length].id; }
const inlineMedia=ref(null), isPlaying=ref(false);
function stopPlayback() { isPlaying.value=false; if(inlineMedia.value){inlineMedia.value.pause();inlineMedia.value.currentTime=0;} }
async function togglePlayback() {
 if(isPlaying.value){stopPlayback();return;}
 if(props.inferenceType !== 'object' && !inlineMedia.value){previewError.value='The video is still loading. Please try again.';return;}
 previewError.value=''; isPlaying.value=true;
 await nextTick();
 try { if(inlineMedia.value)await inlineMedia.value.play(); }
 catch { stopPlayback(); previewError.value='Playback could not start. Check that the original media plays in generation history, then retry.'; }
}

watch(()=>[props.visible,props.content],stopPlayback);
onBeforeUnmount(stopPlayback);
const canChooseBackground = computed(() => !/^(image|video)\//.test(props.contentType) && !props.generation.thumbnail && !props.generation.screenshots?.[0]?.dataUrl);
const selectedBackgroundName = computed(() => nftBackgrounds.find(item => item.id === artworkBackground.value)?.name || 'Automatic');
const artworkGeneration = computed(() => ({...props.generation, nftArtwork: {version:1, themeId:artworkTheme.value || null, backgroundId:canChooseBackground.value ? artworkBackground.value || null : null}}));
const artworkTheme = ref('');
const coverRetry = ref(0);
const isGeneratingBg = ref(false);
const customBgSrc = ref(null);
const coverSrc = ref(''), coverError = ref('');
let coverRevision = 0;
watch(() => [props.visible, props.inferenceType, JSON.stringify(props.generation), props.content, mintTitle.value, customBgSrc.value, artworkTheme.value, artworkBackground.value, previewSrc.value, coverRetry.value], async () => {
  const revision = ++coverRevision;
  if (coverSrc.value) URL.revokeObjectURL(coverSrc.value);
  coverSrc.value = ''; coverError.value = '';
  if (!props.visible || (props.contentType?.startsWith('image/') && !artworkTheme.value)) return;
  try {
    const bytes = await renderNFTCover({ inferenceType: props.inferenceType, generation: artworkGeneration.value, title: mintTitle.value,
      textContent: props.inferenceType === 'text' ? props.content : '', customThumbnail: props.contentType?.startsWith('image/') ? previewSrc.value : customBgSrc.value, themeId: artworkTheme.value });
    if (revision === coverRevision) coverSrc.value = URL.createObjectURL(new Blob([bytes], {type:'image/png'}));
  } catch (error) { if (revision === coverRevision) coverError.value = error.message; }
}, {immediate:true});
watch(() => [props.visible, videoPreviewSrc.value], async (_, __, onCleanup) => {
  let cancelled = false; onCleanup(() => { cancelled = true; });
  if (!props.visible || !props.contentType?.startsWith('video/') || !videoPreviewSrc.value) return;
  try { const poster = await extractVideoPoster(videoPreviewSrc.value); if (!cancelled) customBgSrc.value = poster; }
  catch { /* The collection cover remains available when the video decoder cannot extract a frame. */ }
});
onBeforeUnmount(() => { coverRevision++; if (coverSrc.value) URL.revokeObjectURL(coverSrc.value); });


// Reset state when modal opens
watch(
  () => [props.visible, props.inferenceId],
  async ([v]) => {
    if (v) {
      storageReady.value = false;
      storageStatus().then(status => { storageReady.value = status.configured; }).catch(() => {});
      stage.value = "ready";
      isMinting.value = false;
      progressPercent.value = 0;
      progressMessage.value = "";
      currentStage.value = "upload";
      mintResult.value = {};
      errorMessage.value = "";
      confirmationPending.value = false;
      artworkTheme.value = props.generation?.nftArtwork?.themeId || '';
      customBgSrc.value = null;
      artworkBackground.value = props.generation.nftArtwork?.backgroundId || defaultBackground();
      isGeneratingBg.value = false;
      marketplaceDiscoverable.value = true;
      trainingMaterial.value = false;

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
        (props.generation?.songName || props.generation?.metadata?.title || props.prompt || "").substring(0, 80) ||
        `BonzAI ${generationType.value}`;
      gameTokenResult.value = null; gamePendingHash.value = '';
      gameTokenError.value = "";
      gameTokenSymbol.value = mintTitle.value
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 8)
        .toUpperCase();
      mintDescription.value = (props.generation.type === 'music' ? musicNFTDescription(props.generation) : '') || props.generation?.metadata?.description || `AI-generated ${generationType.value} by BonzAI.`;
      if (isNsfwGeneration.value) marketplaceDiscoverable.value = false;
    }
  },
  { immediate: true },
);

watch(isNsfwGeneration, (blocked) => {
  if (blocked) marketplaceDiscoverable.value = false;
});

async function startMint() {
  if(!mintConfigured.value || !storageReady.value || isMinting.value || !hasValidFields.value || !hasRenderableContent.value || !licenseStatus.value.allowed || !previewReady.value || previewError.value || coverError.value || (!coverSrc.value && (artworkTheme.value || !props.contentType?.startsWith('image/'))))return;
  isMinting.value = true;
  stage.value = "minting";
  currentStage.value = "upload";
  progressPercent.value = 5;
  progressMessage.value = "Starting...";

  const result = await mintContent({
    content: /^(image|audio|video)\//.test(props.contentType) ? (resolvedMedia.value || props.content) : props.content,
    contentType: props.contentType,
    prompt: props.prompt,
    generation: artworkGeneration.value,
    title: mintTitle.value,
    description: mintDescription.value,
    inferenceType: props.inferenceType,
    inferenceId: props.inferenceId,
    customThumbnail: props.contentType?.startsWith('image/') && artworkTheme.value ? previewSrc.value : customBgSrc.value || undefined,
    marketplacePolicy: {
      discoverable: marketplaceDiscoverable.value,
      trainingMaterial: trainingMaterial.value,
      requestedAt: new Date().toISOString(),
    },
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

  } else {
    stage.value = "error";
    confirmationPending.value = result.confirmationPending === true;
    errorMessage.value = result.error || "Minting failed. Please try again.";
  }
}


function handleClose() {
  if (isMinting.value) {
    return;
  }
  if(stage.value === "success") emit("minted", mintResult.value);
  emit("close");
}
</script>

<style scoped>
.mint-source dl {display:grid;grid-template-columns:80px minmax(0,1fr);gap:8px}.mint-source dd{margin:0;overflow-wrap:anywhere}.mint-source pre{white-space:pre-wrap}.mint-explanation{line-height:1.6;color:var(--bz-fg-mid)}
.mint-modal-overlay {
backdrop-filter:blur(10px);
  position: fixed;
  inset: 0;
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--bz-space-4);
  background: var(--bz-overlay);
}

.mint-modal, .mint-modal * {box-sizing:border-box;}
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
  min-width:0;overflow-wrap:anywhere;
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
  min-height:220px;  display: flex;
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
  min-width:0;
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

.mint-policy {
  display: grid;
  gap: var(--bz-space-2);
}

.mint-policy__item {
  display: grid;
  grid-template-columns: 36px minmax(0,1fr);
  gap: var(--bz-space-2);
  align-items: start;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  color: var(--bz-fg);
}

.mint-policy__item input {
  appearance:none;position:relative;width:36px;height:20px;border:1px solid var(--bz-border);border-radius:20px;background:var(--bz-panel);cursor:pointer;
  margin: 2px 0 0;
  accent-color: var(--bz-purple-400);
}

.mint-policy__item input::before {content:'';position:absolute;width:14px;height:14px;left:2px;top:2px;border-radius:50%;background:var(--bz-fg-mid);}
.mint-policy__item input:checked {background:var(--bz-accent);}
.mint-policy__item input:checked::before {left:18px;background:var(--bz-canvas);}
.mint-policy__item input:focus-visible {outline:2px solid var(--bz-accent);outline-offset:2px;}
.mint-policy__item strong,
.mint-policy__item small {
  overflow-wrap:anywhere;  display: block;
}

.mint-policy__item strong {
  font-size: var(--bz-size-sm);
}

.mint-policy__item small {
  margin-top: 3px;
  color: var(--bz-fg-low);
  line-height: 1.35;
}

.mint-policy__item.is-disabled {
  opacity: 0.72;
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

.game-token-issue {
  display: grid;
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-4);
  padding: var(--bz-space-4) 0;
  text-align: left;
  border-top: 1px solid var(--bz-border);
  border-bottom: 1px solid var(--bz-border);
}

.game-token-issue__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bz-space-3);
}

.game-token-issue__head span {
  color: var(--bz-fg-mid);
  font-size: 12px;
}

.game-token-issue__form {
  display: grid;
  grid-template-columns: minmax(100px, 0.45fr) 1fr;
  gap: var(--bz-space-2);
}

.game-token-issue__error {
  margin: 0;
  color: var(--bz-danger);
  font-size: 12px;
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

@media (min-width: 850px) {
 .mint-modal {width:min(980px,100%)}
 .mint-modal-body {display:grid;grid-template-columns:minmax(240px,340px) minmax(0,1fr);align-items:start;gap:20px 28px;}
 .mint-preview-column { display:flex; flex-direction:column; gap:20px; min-width:0; }
 .mint-preview-column p { margin:0; line-height:1.6; }
 .mint-modal-body.is-review > .mint-fields {grid-column:2;grid-row:1;}
 .mint-modal-body.is-review .content-preview {width:100%;}
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

.mint-modal-header { position: sticky; top: 0; z-index: 5; background: var(--bz-surface); flex-shrink: 0; }
.mint-fields { min-width: 0; gap: 20px; }
.mint-fields .bz-notice__body > .bz-btn { margin-top: 12px; margin-right: 8px; }
.mint-source pre, .preview-text--code pre { background: var(--bz-canvas); color: var(--bz-fg); padding: 16px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); overflow:auto; max-height:180px; }
.mint-source summary { cursor:pointer; padding:12px 0; }
.model-registration-preview { display:flex; flex-direction:column; align-items:flex-start; gap:16px; padding:28px; }
.model-registration-preview > .material-symbols-outlined { font-size:36px; color:var(--bz-accent); }
.model-registration-preview h3 { margin:0; overflow-wrap:anywhere; font-family:var(--bz-font-metric); font-size:26px; }
.model-registration-preview__format { color:var(--bz-fg-mid); font-size:13px; }
@media(max-width:700px) { .mint-modal-body { grid-template-columns:minmax(0,1fr); } .mint-modal-body.is-review > .mint-fields { grid-column:1; grid-row:auto; } .network-pill { display:none; } }
 .mint-process { padding:0 24px; }
</style>

<style scoped>
.token-artwork-preview { width:100%; aspect-ratio:1; overflow:hidden; border-radius:var(--bz-r-sm); background:var(--bz-canvas); display:grid; place-items:center; }
.token-artwork-preview img { width:100%; height:100%; object-fit:contain; display:block; }
.token-media-preview { width:100%; max-height:300px; object-fit:contain; border-radius:var(--bz-r-sm); }
</style>

<style scoped>
.mint-source--full { grid-column:1 / -1; border:1px solid var(--bz-border); border-radius:12px; background:var(--bz-canvas); padding:0 20px; min-width:0; }
.mint-source--full summary { display:flex; align-items:center; gap:10px; padding:18px 0; font-weight:600; list-style:none; }
.mint-source--full summary::-webkit-details-marker { display:none; }
.source-chevron { margin-left:auto; }
.mint-source--full[open] .source-chevron { transform:rotate(180deg); }
.source-facts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; padding:16px 0 24px; border-top:1px solid var(--bz-border); }
.source-facts div { display:flex; flex-direction:column; gap:8px; overflow-wrap:anywhere; }
.source-facts span,.source-block h4 { color:var(--bz-fg-mid); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
.source-block { padding-bottom:20px; }.source-block p { line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; max-height:220px; overflow:auto; }.source-block h4 { margin:0 0 12px; }
.mint-guide-link { grid-column:1 / -1; justify-self:end; background:none; border:0; color:var(--bz-fg-mid); cursor:pointer; padding:8px; }
.mint-fields { gap:20px; }.mint-preview-column { gap:16px; }
@media(max-width:600px){.source-facts{grid-template-columns:1fr;gap:16px}}
</style>

<style scoped>
.mint-progress { align-self:center; padding:32px; border:1px solid var(--bz-border); border-radius:12px; background:var(--bz-surface); display:flex; flex-direction:column; gap:20px; text-align:center; }
.mint-progress h3 { font-family:var(--bz-font-display); font-size:26px; margin:0; }.mint-progress p { margin:0; }.mint-stage-icon { font-size:36px; color:var(--bz-accent); }.mint-progress-bar { width:100%; }
</style>



<style scoped>
.nft-background-carousel { display:flex; align-items:center; gap:10px; padding:8px; border:1px solid var(--bz-border); border-radius:8px; }.nft-background-carousel img{width:42px;height:42px;object-fit:cover;border-radius:4px}.nft-background-carousel>span{flex:1;font-size:14px}
.token-artwork-preview{position:relative}.artwork-play{position:absolute;right:14px;bottom:14px;z-index:3}.inline-video,.inline-scene{position:absolute;inset:0;width:100%;height:100%;background:var(--bz-canvas)}.inline-video{object-fit:cover;object-position:center;opacity:0;pointer-events:none}.inline-video.is-playing{opacity:1;pointer-events:auto}.inline-scene :deep(.three-container){height:100%;min-height:0}.inline-scene :deep(.perf-stats){display:none}
</style>

<style scoped>.nft-theme-swatch{display:grid;place-items:center;width:42px;height:42px;flex:none!important;border:1px solid var(--bz-border);border-radius:4px;font-family:var(--bz-font-display)}</style>

<style scoped>
.mint-actions--primary { display:flex; justify-content:center; grid-column:1 / -1; padding:24px 0; border-top:1px solid var(--bz-border); margin:0; }
.mint-actions--primary > .bz-btn { min-height:56px; width:min(100%,420px); font-size:18px; font-weight:700; justify-content:center; border-radius:12px; }
@media(min-width:850px) {
 .mint-modal-body { align-items:stretch; }
 .mint-preview-column, .mint-fields, .mint-progress, .mint-result, .mint-error { align-self:stretch; min-height:0; }
 .mint-preview-column { grid-column:1;grid-row:1; }
 .mint-fields, .mint-progress, .mint-result, .mint-error { grid-column:2;grid-row:1; }
 .mint-preview-column > .bz-notice:last-child { margin-top:auto; }
 .mint-fields .mint-policy { margin-top:0; }
 .mint-progress { justify-content:center; }
}
@media(max-width:849px) { .mint-actions--primary { padding:20px 0; } }
</style>

<style scoped>
.mint-policy--full { grid-column:1 / -1; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.mint-rights-note { grid-column:1 / -1; text-align:center; color:var(--bz-fg-mid); line-height:1.5; margin:-12px auto 0; max-width:680px; }
@media(min-width:850px) {
 .mint-description-field { flex:1; min-height:0; }
 .mint-description-field textarea { flex:1; min-height:120px; resize:none; }
}
@media(max-width:849px) { .mint-policy--full { grid-template-columns:1fr; } }
</style>

<style scoped>
.mint-rights-note { font-size:11px; line-height:1.4; white-space:nowrap; max-width:100%; overflow-x:auto; padding:2px 0; }
@media(min-width:850px){ .mint-fields{gap:14px}.mint-fields .mint-policy{gap:8px}.mint-description-field textarea{min-height:64px} }
</style>
