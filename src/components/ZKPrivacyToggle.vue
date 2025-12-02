<template>
  <div class="zk-privacy" :class="{ enabled: isEnabled, available: isAvailable }">
    <div class="zk-header" @click="toggleEnabled" :class="{ disabled: !isAvailable }">
      <div class="zk-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path v-if="isEnabled" d="M9 12l2 2 4-4"/>
        </svg>
      </div>
      <div class="zk-info">
        <span class="zk-title">ZK Privacy</span>
        <span class="zk-status">{{ statusText }}</span>
      </div>
      <label class="toggle-switch" @click.stop>
        <input 
          type="checkbox" 
          v-model="isEnabled" 
          :disabled="!isAvailable"
        />
        <span class="slider"></span>
      </label>
    </div>

    <!-- Details (shown when enabled) -->
    <div v-if="isEnabled && isAvailable" class="zk-details">
      <div class="detail-item">
        <span class="detail-label">Prover</span>
        <span class="detail-value" :class="proverType">{{ proverName }}</span>
      </div>
      <div class="detail-item" v-if="lastProof">
        <span class="detail-label">Last Proof</span>
        <span class="detail-value hash">{{ truncateHash(lastProof.proofHash) }}</span>
      </div>
      <p class="zk-description">
        Your prompts and results are cryptographically protected. 
        Only you can prove ownership without revealing content.
      </p>
    </div>

    <!-- Setup Required -->
    <div v-if="!isAvailable && showSetup" class="zk-setup">
      <p class="setup-text">
        ZK Privacy requires the SP1 prover. 
        <a href="https://docs.succinct.xyz" target="_blank">Learn more</a>
      </p>
      <button @click="checkProver" class="check-btn" :disabled="isChecking">
        {{ isChecking ? 'Checking...' : 'Check Prover' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { zkPrivacy } from '../services/zkPrivacy.js';

const props = defineProps({
  showSetup: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['change', 'proofGenerated']);

// State
const isEnabled = ref(false);
const isAvailable = ref(false);
const isChecking = ref(false);
const proverType = ref('none');
const lastProof = ref(null);

// Computed
const statusText = computed(() => {
  if (!isAvailable.value) return 'Not available';
  if (isEnabled.value) return 'Protected';
  return 'Disabled';
});

const proverName = computed(() => {
  switch (proverType.value) {
    case 'sp1': return 'SP1 (Local)';
    case 'sp1-hosted': return 'SP1 (Hosted)';
    case 'simulated': return 'Simulated';
    default: return 'None';
  }
});

// Methods
const toggleEnabled = () => {
  if (isAvailable.value) {
    isEnabled.value = !isEnabled.value;
  }
};

const checkProver = async () => {
  isChecking.value = true;
  try {
    const result = await zkPrivacy.initialize();
    isAvailable.value = result.success;
    proverType.value = result.proverType || 'none';
  } catch (error) {
    console.error('Prover check failed:', error);
    isAvailable.value = false;
  } finally {
    isChecking.value = false;
  }
};

const truncateHash = (hash) => {
  if (!hash) return '';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
};

// Generate proof wrapper for parent components
const generateProof = async (prompt, result, modelId) => {
  if (!isEnabled.value || !isAvailable.value) return null;
  
  try {
    const proof = await zkPrivacy.generateProof(prompt, result, modelId);
    lastProof.value = proof;
    emit('proofGenerated', proof);
    return proof;
  } catch (error) {
    console.error('Proof generation failed:', error);
    return null;
  }
};

// Watchers
watch(isEnabled, (newVal) => {
  emit('change', newVal);
});

// Lifecycle
onMounted(async () => {
  // Check if prover is available
  await checkProver();
});

// Expose for parent components
defineExpose({
  isEnabled,
  isAvailable,
  generateProof,
  lastProof,
});
</script>

<style scoped>
.zk-privacy {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.3s;
}

.zk-privacy.enabled {
  border-color: rgba(139, 92, 246, 0.5);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.1);
}

.zk-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.zk-header:not(.disabled):hover {
  background: rgba(139, 92, 246, 0.1);
}

.zk-header.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.zk-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(139, 92, 246, 0.2);
  border-radius: 8px;
  color: #a78bfa;
  transition: background 0.3s, color 0.3s;
}

.enabled .zk-icon {
  background: #8b5cf6;
  color: #fff;
}

.zk-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.zk-title {
  font-weight: 600;
  color: #fff;
  font-size: 14px;
}

.zk-status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.enabled .zk-status {
  color: #a78bfa;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  transition: 0.3s;
}

.slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.3s;
}

input:checked + .slider {
  background: #8b5cf6;
}

input:checked + .slider::before {
  transform: translateX(20px);
}

input:disabled + .slider {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Details */
.zk-details {
  padding: 0 14px 14px;
  border-top: 1px solid rgba(139, 92, 246, 0.1);
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.detail-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.detail-value {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.detail-value.sp1,
.detail-value.sp1-hosted {
  color: #4ade80;
}

.detail-value.simulated {
  color: #fbbf24;
}

.detail-value.hash {
  font-family: monospace;
  color: rgba(255, 255, 255, 0.7);
}

.zk-description {
  margin: 8px 0 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.5;
}

/* Setup */
.zk-setup {
  padding: 12px 14px;
  border-top: 1px solid rgba(139, 92, 246, 0.1);
  text-align: center;
}

.setup-text {
  margin: 0 0 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.setup-text a {
  color: #a78bfa;
  text-decoration: none;
}

.setup-text a:hover {
  text-decoration: underline;
}

.check-btn {
  padding: 6px 14px;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 6px;
  color: #a78bfa;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.check-btn:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.3);
}

.check-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
