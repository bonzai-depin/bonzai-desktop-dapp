<template>
  <div class="nft-mint-container">
    <!-- Mint Button -->
    <button 
      @click="handleMint" 
      class="mint-btn"
      :class="{ minted: isMinted, disabled: !canMint || isMinting }"
      :disabled="!canMint || isMinting || isMinted"
    >
      <span class="btn-icon">
        <svg v-if="isMinted" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <svg v-else-if="isMinting" class="spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3v18"/>
          <path d="m16 7-4-4-4 4"/>
          <rect x="4" y="14" width="16" height="6" rx="2"/>
        </svg>
      </span>
      <span class="btn-text">{{ buttonText }}</span>
    </button>

    <!-- Access Required Notice -->
    <div v-if="!canMint && !isMinted" class="access-notice">
      <span class="notice-icon">🔒</span>
      <span class="notice-text">999 BONZAI required to mint NFTs</span>
      <a :href="buyUrl" target="_blank" class="get-tokens-link">Get BONZAI</a>
    </div>

    <!-- Minted Info -->
    <div v-if="isMinted && mintedData" class="minted-info">
      <div class="info-row">
        <span class="info-label">Token ID</span>
        <span class="info-value">#{{ mintedData.tokenId }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Transaction</span>
        <a :href="explorerUrl" target="_blank" class="info-link">
          {{ truncateHash(mintedData.transactionHash) }}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>
      <a v-if="openSeaUrl" :href="openSeaUrl" target="_blank" class="opensea-link">
        <img src="/opensea-logo.svg" alt="OpenSea" class="opensea-icon" @error="handleImageError" />
        View on OpenSea
      </a>
    </div>

    <!-- Mint Modal -->
    <Teleport to="body">
      <div v-if="showMintModal" class="modal-overlay" @click.self="closeMintModal">
        <div class="modal mint-modal">
          <h3>Mint as NFT</h3>
          
          <!-- Preview -->
          <div class="preview-section">
            <div class="preview-container" :class="contentType">
              <img v-if="contentType === 'image'" :src="previewSrc" alt="Preview" />
              <video v-else-if="contentType === 'video'" :src="previewSrc" controls />
              <div v-else-if="contentType === 'audio'" class="audio-preview">
                <span class="audio-icon">🎵</span>
                <audio :src="previewSrc" controls />
              </div>
              <div v-else-if="contentType === 'game'" class="code-preview">
                <span class="code-icon">🎮</span>
                <span class="code-label">Game Code</span>
              </div>
              <div v-else-if="contentType === 'text'" class="text-preview">
                <span class="text-icon">📝</span>
                <span class="text-label">Text Content</span>
              </div>
            </div>
          </div>

          <!-- Metadata Form -->
          <div class="form-section">
            <div class="form-group">
              <label>Name</label>
              <input 
                type="text" 
                v-model="nftMetadata.name" 
                placeholder="My AI Creation"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea 
                v-model="nftMetadata.description" 
                placeholder="Describe your creation..."
                class="form-textarea"
                rows="3"
              />
            </div>
          </div>

          <!-- Cost Info -->
          <div class="cost-section">
            <div class="cost-row">
              <span class="cost-label">Gas Fee (estimated)</span>
              <span class="cost-value">~$0.10</span>
            </div>
            <div class="cost-row">
              <span class="cost-label">IPFS Storage</span>
              <span class="cost-value">Free</span>
            </div>
          </div>

          <!-- Error Message -->
          <div v-if="mintError" class="error-message">
            <span class="error-icon">⚠️</span>
            {{ mintError }}
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            <button @click="closeMintModal" class="btn secondary">Cancel</button>
            <button @click="confirmMint" class="btn primary" :disabled="isMinting || !nftMetadata.name">
              {{ isMinting ? 'Minting...' : 'Mint NFT' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted } from 'vue';
import { tokenGating } from '../services/tokenGating.js';
import { nftMinter } from '../services/nftMinter.js';

const props = defineProps({
  content: {
    type: [String, Object],
    required: true,
  },
  contentType: {
    type: String,
    required: true,
    validator: (val) => ['image', 'video', 'audio', 'game', 'text'].includes(val),
  },
  prompt: {
    type: String,
    default: '',
  },
  inferenceId: {
    type: String,
    default: null,
  },
  defaultName: {
    type: String,
    default: '',
  },
  defaultDescription: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['minted', 'error']);

// State
const canMint = ref(false);
const isMinting = ref(false);
const isMinted = ref(false);
const mintedData = ref(null);
const showMintModal = ref(false);
const mintError = ref(null);

const nftMetadata = reactive({
  name: '',
  description: '',
});

// Computed
const buttonText = computed(() => {
  if (isMinted.value) return 'Minted';
  if (isMinting.value) return 'Minting...';
  if (!canMint.value) return 'Mint NFT';
  return 'Mint NFT';
});

const previewSrc = computed(() => {
  if (typeof props.content === 'string') {
    return props.content;
  }
  if (props.content?.path) {
    return props.content.path;
  }
  if (props.content?.data) {
    return props.content.data;
  }
  return '';
});

const explorerUrl = computed(() => {
  if (!mintedData.value?.transactionHash) return '';
  return `https://arbiscan.io/tx/${mintedData.value.transactionHash}`;
});

const openSeaUrl = computed(() => {
  if (!mintedData.value?.tokenId) return '';
  // OpenSea URL would depend on the contract address
  return mintedData.value.openSeaUrl || null;
});

const buyUrl = computed(() => {
  return 'https://app.uniswap.org/swap?outputCurrency=0x0a84edf70f30325151631ce7a61307d1f4d619a3&chain=arbitrum';
});

// Methods
const checkMintAccess = async () => {
  try {
    const result = await tokenGating.verifyAccess(999);
    canMint.value = result.allowed;
  } catch (error) {
    console.error('Access check failed:', error);
    canMint.value = false;
  }
};

const handleMint = () => {
  if (!canMint.value || isMinting.value || isMinted.value) return;
  
  // Set defaults
  nftMetadata.name = props.defaultName || `BonzAI ${props.contentType} #${Date.now().toString().slice(-6)}`;
  nftMetadata.description = props.defaultDescription || `AI-generated ${props.contentType} created with BonzAI`;
  
  showMintModal.value = true;
  mintError.value = null;
};

const closeMintModal = () => {
  if (isMinting.value) return;
  showMintModal.value = false;
};

const confirmMint = async () => {
  if (!nftMetadata.name || isMinting.value) return;
  
  isMinting.value = true;
  mintError.value = null;
  
  try {
    const result = await nftMinter.mint(props.content, props.contentType, {
      name: nftMetadata.name,
      description: nftMetadata.description,
      prompt: props.prompt,
    });
    
    if (result.success) {
      isMinted.value = true;
      mintedData.value = {
        tokenId: result.tokenId,
        transactionHash: result.transactionHash,
        metadataUrl: result.metadataUrl,
        contentUrl: result.contentUrl,
        openSeaUrl: result.openSeaUrl,
      };
      
      emit('minted', {
        inferenceId: props.inferenceId,
        ...mintedData.value,
      });
      
      showMintModal.value = false;
    } else {
      mintError.value = result.error || 'Minting failed';
    }
  } catch (error) {
    console.error('Minting failed:', error);
    mintError.value = error.message || 'Minting failed';
    emit('error', error);
  } finally {
    isMinting.value = false;
  }
};

const truncateHash = (hash) => {
  if (!hash) return '';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
};

const handleImageError = (e) => {
  e.target.style.display = 'none';
};

// Watch for content changes
watch(() => props.content, () => {
  // Reset minted state when content changes
  if (isMinted.value) {
    isMinted.value = false;
    mintedData.value = null;
  }
});

// Lifecycle
onMounted(() => {
  checkMintAccess();
});

// Expose for parent components
defineExpose({
  isMinted,
  mintedData,
  mint: handleMint,
});
</script>

<style scoped>
.nft-mint-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Mint Button */
.mint-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;
}

.mint-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
}

.mint-btn.minted {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  cursor: default;
}

.mint-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mint-btn:disabled {
  transform: none;
  box-shadow: none;
}

.btn-icon {
  display: flex;
  align-items: center;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Access Notice */
.access-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 8px;
  font-size: 12px;
}

.notice-icon {
  font-size: 14px;
}

.notice-text {
  flex: 1;
  color: rgba(255, 255, 255, 0.7);
}

.get-tokens-link {
  color: #fbbf24;
  text-decoration: none;
  font-weight: 600;
}

.get-tokens-link:hover {
  text-decoration: underline;
}

/* Minted Info */
.minted-info {
  padding: 12px;
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.2);
  border-radius: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.info-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.info-value {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.info-link {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #4ade80;
  text-decoration: none;
  font-size: 12px;
  font-family: monospace;
}

.info-link:hover {
  text-decoration: underline;
}

.opensea-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  color: #60a5fa;
  text-decoration: none;
  font-size: 12px;
  font-weight: 600;
  transition: background 0.2s;
}

.opensea-link:hover {
  background: rgba(255, 255, 255, 0.1);
}

.opensea-icon {
  width: 16px;
  height: 16px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.modal {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal h3 {
  margin: 0 0 20px;
  color: #fff;
  font-size: 20px;
  text-align: center;
}

/* Preview Section */
.preview-section {
  margin-bottom: 20px;
}

.preview-container {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 150px;
}

.preview-container img,
.preview-container video {
  max-width: 100%;
  max-height: 200px;
  object-fit: contain;
}

.audio-preview,
.code-preview,
.text-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 30px;
  color: rgba(255, 255, 255, 0.7);
}

.audio-icon,
.code-icon,
.text-icon {
  font-size: 40px;
}

.audio-preview audio {
  width: 100%;
  max-width: 300px;
}

/* Form Section */
.form-section {
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #f59e0b;
}

/* Cost Section */
.cost-section {
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  margin-bottom: 16px;
}

.cost-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.cost-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.cost-value {
  font-size: 13px;
  color: #fff;
}

/* Error Message */
.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  color: #f87171;
  font-size: 13px;
  margin-bottom: 16px;
}

/* Modal Actions */
.modal-actions {
  display: flex;
  gap: 12px;
}

.btn {
  flex: 1;
  padding: 12px 20px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
  border: none;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
</style>
