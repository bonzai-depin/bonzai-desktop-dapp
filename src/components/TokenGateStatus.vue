<template>
  <div class="token-gate-status" :class="statusClass">
    <!-- Wallet Connection -->
    <div v-if="!walletConnected" class="connect-wallet">
      <div class="wallet-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/>
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
        </svg>
      </div>
      <div class="wallet-text">
        <span class="title">Connect Wallet</span>
        <span class="subtitle">Required to access BonzAI features</span>
      </div>
      <button @click="connect" :disabled="isConnecting" class="connect-btn">
        {{ isConnecting ? 'Connecting...' : 'Connect' }}
      </button>
    </div>

    <!-- Connected Status -->
    <div v-else class="status-content">
      <!-- Balance Display -->
      <div class="balance-section">
        <div class="balance-icon">
          <img src="/bonzai-token.png" alt="BONZAI" class="token-icon" @error="handleImageError" />
        </div>
        <div class="balance-info">
          <span class="balance-amount">{{ formattedBalance }}</span>
          <span class="balance-label">BONZAI</span>
        </div>
      </div>

      <!-- Tier Status -->
      <div class="tier-section">
        <div class="tier-badge" :class="tierClass">
          <span class="tier-icon">{{ tierIcon }}</span>
          <span class="tier-name">{{ tierName }}</span>
        </div>
      </div>

      <!-- Feature Access -->
      <div class="features-section" v-if="showFeatures">
        <div class="feature" :class="{ unlocked: canGenerate, locked: !canGenerate }">
          <span class="feature-icon">{{ canGenerate ? '✓' : '🔒' }}</span>
          <span class="feature-name">Generate</span>
          <span class="feature-req" v-if="!canGenerate">99 BONZAI</span>
        </div>
        <div class="feature" :class="{ unlocked: canMint, locked: !canMint }">
          <span class="feature-icon">{{ canMint ? '✓' : '🔒' }}</span>
          <span class="feature-name">Mint NFT</span>
          <span class="feature-req" v-if="!canMint">999 BONZAI</span>
        </div>
        <div class="feature" :class="{ unlocked: canUseMarketplace, locked: !canUseMarketplace }">
          <span class="feature-icon">{{ canUseMarketplace ? '✓' : '🔒' }}</span>
          <span class="feature-name">Agents</span>
          <span class="feature-req" v-if="!canUseMarketplace">9999 BONZAI</span>
        </div>
      </div>

      <!-- Buy More Button -->
      <a 
        v-if="showBuyButton && !hasFullAccess" 
        :href="buyUrl" 
        target="_blank" 
        class="buy-btn"
      >
        <span>Get BONZAI</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>

      <!-- Wallet Address -->
      <div class="wallet-address" v-if="showAddress">
        <span class="address">{{ truncatedAddress }}</span>
        <button @click="copyAddress" class="copy-btn" title="Copy address">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Access Denied Modal -->
    <Teleport to="body">
      <div v-if="showAccessDenied" class="access-denied-overlay" @click.self="closeAccessDenied">
        <div class="access-denied-modal">
          <div class="modal-icon">🔒</div>
          <h3>Access Required</h3>
          <p>{{ accessDeniedMessage }}</p>
          <div class="modal-balance">
            <span>Your balance: {{ formattedBalance }} BONZAI</span>
            <span>Required: {{ requiredAmount }} BONZAI</span>
          </div>
          <div class="modal-actions">
            <a :href="buyUrl" target="_blank" class="modal-btn primary">
              Get BONZAI
            </a>
            <button @click="closeAccessDenied" class="modal-btn secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { tokenGating } from '../services/tokenGating.js';

const props = defineProps({
  showFeatures: {
    type: Boolean,
    default: true,
  },
  showBuyButton: {
    type: Boolean,
    default: true,
  },
  showAddress: {
    type: Boolean,
    default: false,
  },
  requiredTier: {
    type: Number,
    default: null, // null = just display, number = enforce
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['connected', 'accessGranted', 'accessDenied']);

// State
const isConnecting = ref(false);
const walletConnected = ref(false);
const walletAddress = ref(null);
const balance = ref(0);
const showAccessDenied = ref(false);
const accessDeniedMessage = ref('');
const requiredAmount = ref(0);

// Tier thresholds
const TIERS = {
  NONE: { min: 0, name: 'None', icon: '○', class: 'tier-none' },
  GENERATE: { min: 99, name: 'Creator', icon: '◐', class: 'tier-generate' },
  MINT: { min: 999, name: 'Collector', icon: '◑', class: 'tier-mint' },
  MARKETPLACE: { min: 9999, name: 'Master', icon: '●', class: 'tier-marketplace' },
};

// Computed
const formattedBalance = computed(() => {
  return balance.value.toLocaleString(undefined, { 
    minimumFractionDigits: 0,
    maximumFractionDigits: 2 
  });
});

const currentTier = computed(() => {
  if (balance.value >= TIERS.MARKETPLACE.min) return TIERS.MARKETPLACE;
  if (balance.value >= TIERS.MINT.min) return TIERS.MINT;
  if (balance.value >= TIERS.GENERATE.min) return TIERS.GENERATE;
  return TIERS.NONE;
});

const tierName = computed(() => currentTier.value.name);
const tierIcon = computed(() => currentTier.value.icon);
const tierClass = computed(() => currentTier.value.class);

const canGenerate = computed(() => balance.value >= TIERS.GENERATE.min);
const canMint = computed(() => balance.value >= TIERS.MINT.min);
const canUseMarketplace = computed(() => balance.value >= TIERS.MARKETPLACE.min);
const hasFullAccess = computed(() => balance.value >= TIERS.MARKETPLACE.min);

const truncatedAddress = computed(() => {
  if (!walletAddress.value) return '';
  return `${walletAddress.value.slice(0, 6)}...${walletAddress.value.slice(-4)}`;
});

const statusClass = computed(() => ({
  compact: props.compact,
  connected: walletConnected.value,
  'has-access': checkRequiredTier(),
}));

const buyUrl = computed(() => {
  return 'https://app.uniswap.org/swap?outputCurrency=0x0a84edf70f30325151631ce7a61307d1f4d619a3&chain=arbitrum';
});

// Methods
const connect = async () => {
  isConnecting.value = true;
  try {
    const result = await tokenGating.connectWallet();
    if (result.success) {
      walletConnected.value = true;
      walletAddress.value = result.address;
      await refreshBalance();
      emit('connected', { address: result.address, balance: balance.value });
      
      // Check required tier
      if (props.requiredTier !== null) {
        checkAndEmitAccess();
      }
    }
  } catch (error) {
    console.error('Wallet connection failed:', error);
  } finally {
    isConnecting.value = false;
  }
};

const refreshBalance = async () => {
  try {
    const result = await tokenGating.checkBalance();
    if (result.success) {
      balance.value = result.balance;
    }
  } catch (error) {
    console.error('Balance check failed:', error);
  }
};

const checkRequiredTier = () => {
  if (props.requiredTier === null) return true;
  return balance.value >= props.requiredTier;
};

const checkAndEmitAccess = () => {
  if (checkRequiredTier()) {
    emit('accessGranted', { tier: currentTier.value, balance: balance.value });
  } else {
    const tierNeeded = Object.values(TIERS).find(t => t.min === props.requiredTier);
    accessDeniedMessage.value = `This feature requires ${tierNeeded?.name || props.requiredTier} tier access.`;
    requiredAmount.value = props.requiredTier;
    showAccessDenied.value = true;
    emit('accessDenied', { required: props.requiredTier, current: balance.value });
  }
};

const closeAccessDenied = () => {
  showAccessDenied.value = false;
};

const copyAddress = async () => {
  if (walletAddress.value) {
    await navigator.clipboard.writeText(walletAddress.value);
  }
};

const handleImageError = (e) => {
  // Fallback if token image doesn't load
  e.target.style.display = 'none';
};

// Watch for external wallet changes
onMounted(async () => {
  // Check if already connected
  if (window.ethereum?.selectedAddress) {
    walletConnected.value = true;
    walletAddress.value = window.ethereum.selectedAddress;
    await refreshBalance();
  }

  // Listen for account changes
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length > 0) {
        walletAddress.value = accounts[0];
        await refreshBalance();
      } else {
        walletConnected.value = false;
        walletAddress.value = null;
        balance.value = 0;
      }
    });
  }
});

// Expose methods for parent components
defineExpose({
  connect,
  refreshBalance,
  checkRequiredTier,
  balance,
  canGenerate,
  canMint,
  canUseMarketplace,
});
</script>

<style scoped>
.token-gate-status {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Connect Wallet */
.connect-wallet {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.wallet-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  color: #4ade80;
}

.wallet-text {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.wallet-text .title {
  font-weight: 600;
  color: #fff;
}

.wallet-text .subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.connect-btn {
  padding: 8px 20px;
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  border: none;
  border-radius: 8px;
  color: #000;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.connect-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3);
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Status Content */
.status-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

/* Balance Section */
.balance-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.balance-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.token-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.balance-info {
  display: flex;
  flex-direction: column;
}

.balance-amount {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.balance-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Tier Section */
.tier-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
}

.tier-none {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

.tier-generate {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.tier-mint {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.tier-marketplace {
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(251, 146, 60, 0.2) 100%);
  color: #fbbf24;
  border: 1px solid rgba(234, 179, 8, 0.3);
}

/* Features Section */
.features-section {
  display: flex;
  gap: 8px;
}

.feature {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.feature.unlocked {
  background: rgba(74, 222, 128, 0.1);
  color: #4ade80;
}

.feature.locked {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.4);
}

.feature-icon {
  font-size: 10px;
}

.feature-req {
  font-size: 10px;
  opacity: 0.7;
  margin-left: 4px;
}

/* Buy Button */
.buy-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  border-radius: 8px;
  color: #000;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: transform 0.2s, box-shadow 0.2s;
}

.buy-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3);
}

/* Wallet Address */
.wallet-address {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.address {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-family: monospace;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* Compact Mode */
.compact .status-content {
  padding: 8px 12px;
}

.compact .balance-amount {
  font-size: 14px;
}

.compact .features-section {
  display: none;
}

/* Access Denied Modal */
.access-denied-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.access-denied-modal {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 32px;
  max-width: 400px;
  text-align: center;
}

.modal-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.access-denied-modal h3 {
  margin: 0 0 8px;
  color: #fff;
  font-size: 20px;
}

.access-denied-modal p {
  margin: 0 0 20px;
  color: rgba(255, 255, 255, 0.7);
}

.modal-balance {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.modal-btn {
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
  text-decoration: none;
  border: none;
}

.modal-btn:hover {
  transform: translateY(-1px);
}

.modal-btn.primary {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  color: #000;
}

.modal-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
</style>
