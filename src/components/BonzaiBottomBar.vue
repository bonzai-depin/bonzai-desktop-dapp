<template>
  <div class="bonzai-bottom-bar" :class="{ connected: isConnected }">
    <div class="bar-content">
      <!-- Left group: Level progress and balances -->
      <div class="left-group">
        <!-- Level Progress -->
        <div class="level-section" v-if="isConnected">
          <div class="level-progress-container">
            <div class="level-track">
              <div
                v-for="level in allLevels"
                :key="level.key"
                class="level-node"
                :class="{
                  active: level.status.active,
                  partial: level.status.holdingMet,
                }"
                :title="getLevelTooltip(level)"
                @click="showLevelDetails(level)"
              >
                <span class="material-symbols-outlined">{{ level.icon }}</span>
                <span class="level-label">{{ level.key }}</span>
              </div>
              <div class="progress-line">
                <div
                  class="progress-fill"
                  :style="{ width: levelProgress + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </div>
        <!-- Balance display -->
        <div class="balance-section" v-if="isConnected">
          <div class="balance-info" @click="showBreakdown = !showBreakdown">
            <span class="material-symbols-outlined">token</span>
            <span class="amount">{{ formatBalance(totalBalance) }}</span>
            <span class="symbol">BONZAI</span>
          </div>
          <div class="balance-breakdown" v-if="showBreakdown">
            <span class="chain-balance">
              ETH: {{ formatBalance(balances.ethereum) }}
            </span>
            <span class="chain-balance">
              ARB: {{ formatBalance(balances.arbitrum) }}
            </span>
          </div>
          <button
            class="refresh-btn"
            :disabled="isRefreshing"
            @click="handleRefresh"
            title="Refresh balances"
          >
            <span
              class="material-symbols-outlined"
              :class="{ spinning: isRefreshing }"
            >
              refresh
            </span>
          </button>
          <button
            v-if="isConnected && !isOnArbitrum"
            class="switch-btn"
            @click="switchToArbitrum"
            title="Switch to Arbitrum"
          >
            <span class="material-symbols-outlined">swap_horiz</span>
          </button>
        </div>
      </div>

      <!-- Right group: wallet and actions -->
      <div class="right-group">
        <a
          :href="buyLink"
          target="_blank"
          class="buy-btn"
          title="Buy BONZAI on Uniswap"
        >
          <span class="material-symbols-outlined">shopping_cart</span>
          <span class="btn-text">Buy</span>
        </a>
        <button
          v-if="!isConnected"
          class="connect-btn"
          :disabled="isConnecting"
          @click="handleConnect"
        >
          <span class="material-symbols-outlined">wallet</span>
          <span class="btn-text">
            {{ isConnecting ? "Connecting..." : "Connect Wallet" }}
          </span>
        </button>
        <div v-else class="wallet-info">
          <div class="network-badge" :class="{ arbitrum: isOnArbitrum }">
            {{ isOnArbitrum ? "Arbitrum" : networkName }}
          </div>
          <span class="address" @click="copyAddress">
            {{ truncatedAddress }}
            <span class="material-symbols-outlined copy-icon">
              content_copy
            </span>
          </span>
          <button
            class="disconnect-btn"
            @click="handleDisconnect"
            title="Disconnect"
          >
            <span class="material-symbols-outlined">logout</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Level Details Modal -->
    <Teleport to="body">
      <div
        v-if="selectedLevel"
        class="level-modal-overlay"
        @click.self="selectedLevel = null"
      >
        <div class="level-modal">
          <div class="modal-header">
            <span class="material-symbols-outlined">
              {{ selectedLevel.icon }}
            </span>
            <h3>{{ selectedLevel.key }}: {{ selectedLevel.name }}</h3>
            <button class="close-btn" @click="selectedLevel = null">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div class="modal-body">
            <p class="description">{{ selectedLevel.description }}</p>

            <div class="requirements">
              <h4>Requirements</h4>
              <div
                class="req-item"
                :class="{ met: selectedLevel.status.holdingMet }"
              >
                <span class="material-symbols-outlined">
                  {{
                    selectedLevel.status.holdingMet
                      ? "check_circle"
                      : "radio_button_unchecked"
                  }}
                </span>
                <span>Hold {{ selectedLevel.holdingRequired }} BONZAI</span>
                <span class="current" v-if="!selectedLevel.status.holdingMet">
                  (You have {{ formatBalance(totalBalance) }})
                </span>
              </div>
              <div
                class="req-item"
                :class="{ met: selectedLevel.status.nftOwned }"
              >
                <span class="material-symbols-outlined">
                  {{
                    selectedLevel.status.nftOwned
                      ? "check_circle"
                      : "radio_button_unchecked"
                  }}
                </span>
                <span>Own {{ selectedLevel.name }} NFT</span>
              </div>
              <div
                class="req-item"
                :class="{ met: selectedLevel.status.nftStaked }"
              >
                <span class="material-symbols-outlined">
                  {{
                    selectedLevel.status.nftStaked
                      ? "check_circle"
                      : "radio_button_unchecked"
                  }}
                </span>
                <span>Stake {{ selectedLevel.name }} NFT</span>
              </div>
            </div>

            <div class="features">
              <h4>Unlocked Features</h4>
              <ul>
                <li v-for="feature in selectedLevel.features" :key="feature">
                  {{ formatFeature(feature) }}
                </li>
              </ul>
            </div>

            <div class="modal-actions">
              <a
                v-if="!selectedLevel.status.holdingMet"
                :href="buyLink"
                target="_blank"
                class="action-btn primary"
              >
                Buy BONZAI
              </a>
              <button
                v-if="
                  selectedLevel.status.nftOwned &&
                  !selectedLevel.status.nftStaked
                "
                class="action-btn primary"
                @click="stakeNft(selectedLevel.key)"
              >
                Stake NFT
              </button>
              <button
                v-if="selectedLevel.status.nftStaked"
                class="action-btn secondary"
                @click="unstakeNft(selectedLevel.key)"
              >
                Unstake NFT
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useWeb3Store } from "../stores/web3.store.js";
import { CONFIG } from "../config/web3.config.js";

const web3Store = useWeb3Store();

// Local state
const isRefreshing = ref(false);
const showBreakdown = ref(false);
const selectedLevel = ref(null);

// Computed from store
const isConnected = computed(() => web3Store.isConnected);
const isConnecting = computed(() => web3Store.isConnecting);
const walletAddress = computed(() => web3Store.walletAddress);
const truncatedAddress = computed(() => web3Store.truncatedAddress);
const isOnArbitrum = computed(() => web3Store.isOnArbitrum);
const networkName = computed(() => web3Store.networkName);
const totalBalance = computed(() => web3Store.totalBalance);
const balances = computed(() => web3Store.balances);
const levelProgress = computed(() => web3Store.levelProgress);

// Get all levels with their config and status
const allLevels = computed(() => {
  return Object.entries(CONFIG.levels).map(([key, config]) => ({
    key,
    ...config,
    status: web3Store.levels[key] || {
      holdingMet: false,
      nftOwned: false,
      nftStaked: false,
      active: false,
    },
  }));
});

const buyLink = CONFIG.links.buyBonzai;

// Handlers
const handleConnect = async () => {
  await web3Store.connect();
};

const handleDisconnect = () => {
  web3Store.disconnect();
};

const handleRefresh = async () => {
  isRefreshing.value = true;
  await web3Store.refreshAll();
  isRefreshing.value = false;
};

const switchToArbitrum = async () => {
  await web3Store.switchToArbitrum();
};

const copyAddress = async () => {
  if (walletAddress.value) {
    await navigator.clipboard.writeText(walletAddress.value);
    // Could add a toast notification here
  }
};

const showLevelDetails = (level) => {
  selectedLevel.value = level;
};

const stakeNft = async (levelKey) => {
  await web3Store.stakeNft(levelKey);
  selectedLevel.value = null;
};

const unstakeNft = async (levelKey) => {
  await web3Store.unstakeNft(levelKey);
  selectedLevel.value = null;
};

// Formatters
const formatBalance = (balance) => {
  if (balance >= 1000000) return (balance / 1000000).toFixed(2) + "M";
  if (balance >= 1000) return (balance / 1000).toFixed(2) + "K";
  return balance.toFixed(0);
};

const formatFeature = (feature) => {
  return feature
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const getLevelTooltip = (level) => {
  if (level.status.active) return `${level.name} - Active`;
  if (level.status.holdingMet) return `${level.name} - Need NFT staked`;
  return `${level.name} - Need ${level.holdingRequired} BONZAI`;
};

// Initialize on mount
onMounted(async () => {
  await web3Store.initialize();
});
</script>

<style scoped>
.bonzai-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: rgba(15, 15, 20, 0.9);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 9999;
  display: flex;
  align-items: center;
  font-family:
    "Inter",
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
}

.bonzai-bottom-bar.connected {
  border-top-color: rgba(16, 185, 129, 0.3);
}

.bar-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 16px;
  padding: 0 16px;
}

/* Group containers */
.left-group,
.right-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

.left-group {
  flex: 1;
}

.right-group {
  margin-left: auto;
}

/* Balance section inside left group */
.balance-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.balance-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.connect-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.connect-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wallet-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.network-badge {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
}

.network-badge.arbitrum {
  background: rgba(40, 160, 240, 0.2);
  color: #28a0f0;
}

.address {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: background 0.2s ease;
}

.address:hover {
  background: rgba(255, 255, 255, 0.1);
}

.copy-icon {
  font-size: 14px;
  opacity: 0.5;
}

.disconnect-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #ef4444;
  cursor: pointer;
  transition: all 0.2s ease;
}

.disconnect-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* Level Section */
.level-section {
  flex: 1;
  display: flex;
  justify-content: center;
  max-width: 600px;
}

.level-progress-container {
  width: 100%;
}

.level-track {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
}

.level-node {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.level-node:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.level-node.partial {
  border-color: rgba(251, 191, 36, 0.5);
  background: rgba(251, 191, 36, 0.1);
}

.level-node.active {
  border-color: rgba(16, 185, 129, 0.5);
  background: rgba(16, 185, 129, 0.15);
}

.level-node .material-symbols-outlined {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.5);
}

.level-node.partial .material-symbols-outlined {
  color: #fbbf24;
}

.level-node.active .material-symbols-outlined {
  color: #10b981;
}

.level-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
}

.level-node.active .level-label {
  color: #10b981;
}

.progress-line {
  position: absolute;
  left: 30px;
  right: 30px;
  top: 50%;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  z-index: 1;
  transform: translateY(-50%);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  border-radius: 2px;
  transition: width 0.5s ease;
}

/* Balance Section */
.balance-section {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: auto;
  justify-content: flex-start;
}

.balance-display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.balance-amount {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: white;
}

.balance-amount .material-symbols-outlined {
  font-size: 18px;
  color: #fbbf24;
}

.balance-amount .amount {
  font-family: "JetBrains Mono", monospace;
}

.balance-amount .symbol {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.balance-breakdown {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.buy-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  border: none;
  border-radius: 8px;
  color: #1a1a1a;
  font-weight: 600;
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.buy-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4);
}

.switch-btn,
.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s ease;
}

.switch-btn:hover,
.refresh-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Level Modal */
.level-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.level-modal {
  background: linear-gradient(180deg, #1a1a24 0%, #12121a 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header .material-symbols-outlined {
  font-size: 28px;
  color: #10b981;
}

.modal-header h3 {
  flex: 1;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.modal-body {
  padding: 20px;
}

.description {
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 20px;
  line-height: 1.5;
}

.requirements h4,
.features h4 {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  margin-bottom: 12px;
}

.req-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.6);
}

.req-item .material-symbols-outlined {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.3);
}

.req-item.met {
  background: rgba(16, 185, 129, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.req-item.met .material-symbols-outlined {
  color: #10b981;
}

.req-item .current {
  margin-left: auto;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.features {
  margin-top: 20px;
}

.features ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.features li {
  padding: 8px 0;
  color: rgba(255, 255, 255, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.features li:last-child {
  border-bottom: none;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.action-btn {
  flex: 1;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  text-align: center;
}

.action-btn.primary {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.action-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.action-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.action-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Responsive */
@media (max-width: 768px) {
  .bonzai-bottom-bar {
    height: auto;
    padding: 12px 16px;
  }

  .bar-content {
    flex-wrap: wrap;
    gap: 12px;
  }

  .right-group {
    order: 1;
    width: 100%;
    justify-content: flex-end;
  }

  .balance-section {
    order: 2;
    width: 100%;
  }

  .level-section {
    order: 3;
    width: 100%;
    max-width: none;
  }

  .btn-text {
    display: none;
  }

  .level-label {
    display: none;
  }
}
</style>
