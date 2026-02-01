<template>
  <div class="bonzai-bottom-bar">
    <!-- Main Bar Content -->
    <div class="bar-content">
      <!-- Left: Wallet Section -->
      <div class="wallet-section">
        <!-- Show connect button when not connected OR still connecting (prevents flash) -->
        <Transition name="wallet-fade" mode="out-in">
          <div v-if="!isConnected || isConnecting" key="connect-btns" class="connect-buttons">
            <button
              class="button is-success is-medium"
              @click="connect"
              :disabled="isConnecting"
            >
              <span class="material-symbols-outlined mr-2">wallet</span>
              <span class="btn-text">
                {{ isConnecting ? "Connecting..." : "Connect Wallet" }}
              </span>
            </button>
            <!-- Cancel/Reset button when stuck connecting -->
            <button
              v-if="isConnecting"
              class="button is-danger is-medium ml-2"
              @click="cancelConnection"
              title="Cancel connection"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Only show wallet info when fully connected with a valid address -->
          <div v-else-if="isConnected && walletAddress" key="wallet-info" class="wallet-info">
          <div class="wallet-address p-3" @click="copyAddress">
            <span class="address-text">{{ truncatedAddress }}</span>
            <span class="network-badge" :class="{ arbitrum: isOnArbitrum }">
              {{ isOnArbitrum ? "ARB" : "ETH" }}
            </span>
            <span class="fira-sans-condensed-black-italic current-level-label">
              <span v-if="displayedHighestLevelKey">
                {{ displayedHighestLevelKey }}
              </span>
              <span v-else class="no-level">LVL 0</span>
            </span>
          </div>

          <button
            class="button is-danger"
            @click="disconnect"
            title="Disconnect"
          >
            <span class="material-symbols-outlined">logout</span>
          </button>
        </div>
        </Transition>
      </div>

      <!-- Center: Level Progress -->
      <div class="levels-section">
        <div class="level-track">
          <div
            v-for="lvl in 6"
            :key="lvl"
            class="level-node"
            :class="getLevelClass(lvl)"
            @click="openLevelModal(lvl)"
          >
            <div class="node-inner">
              <span class="material-symbols-outlined is-size-5">
                {{ getLevelIcon(lvl) }}
              </span>
              <span
                class="level-num fira-sans-condensed-black-italic is-size-5"
              >
                LVL{{ lvl }}
              </span>
            </div>
            <div class="level-connector" v-if="lvl < 6"></div>
          </div>
        </div>
      </div>

      <!-- Right: Balance & Actions -->
      <div class="balance-section fira-sans-condensed-black-italic">
        <div class="balance-display" v-if="isConnected">
          <div class="bonzai-balance">
            <span class="balance-amount is-size-1">
              {{ formatBalance(totalBalance) }}
            </span>
            <span class="balance-token is-size-4">BONZAI</span>
          </div>
        </div>

        <div class="action-buttons">
          <a
            :href="buyLink"
            target="_blank"
            class="button is-info is-outlined"
            title="Buy BONZAI"
          >
            <span class="material-symbols-outlined">shopping_cart</span>
          </a>
          <button class="button is-warning" @click="refresh" title="Refresh">
            <span
              class="material-symbols-outlined"
              :class="{ spinning: isRefreshing }"
            >
              sync
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Level Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="selectedLevel"
          class="level-modal-overlay"
          @click.self="closeModal"
        >
          <div class="level-modal">
            <div class="has-text-right">
              <button
                class="button is-danger"
                @click="closeModal"
                title="Close"
              >
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="modal-header">
              <span class="material-symbols-outlined is-size-1">
                {{ getLevelIcon(selectedLevel) }}
              </span>
              <span
                class="modal-level-badge fira-sans-condensed-black-italic is-size-1"
              >
                LVL{{ selectedLevel }}
              </span>
              <h2 class="fira-sans-condensed-black-italic is-size-3">
                {{ getLevelConfig(selectedLevel)?.name }}
              </h2>
            </div>

            <div class="modal-body">
              <div class="level-description models__activity--payouts" :class="{ ok: isLevelUnlockedOrHolding(selectedLevel) }">
                <div class="modal-status mb-5">
                  <span
                    class="status-pill fira-sans-condensed-black-italic is-size-4"
                    :class="{ ok: isLevelUnlockedOrHolding(selectedLevel) }"
                  >
                    {{
                      isLevelUnlockedOrHolding(selectedLevel)
                        ? "Unlocked"
                        : "Locked"
                    }}
                  </span>
                </div>
                <p>{{ getLevelConfig(selectedLevel)?.description }}</p>
              </div>

              <div class="features-list fira-sans-condensed-black-italic">
                <ul>
                  <li
                    v-for="feature in getLevelConfig(selectedLevel)?.features"
                    :key="feature"
                  >
                    <strong>{{ formatFeature(feature) }}</strong>
                  </li>
                </ul>
              </div>

              <!-- IMPORTANT: no confusion between unlock & use -->
              <div class="requirements-summary">
                <h3
                  class="requirements-title fira-sans-condensed-black-italic is-size-3"
                >
                  Unlock Options
                </h3>

                <div class="req-row">
                  <span class="material-symbols-outlined">wallet</span>
                  <span class="req-text">
                    Hold
                    <strong>
                      {{ getLevelConfig(selectedLevel)?.holdingRequired }}+
                    </strong>
                    BONZAI
                  </span>
                  <span
                    class="req-status"
                    :class="{
                      met: hasEnoughBonzai(
                        getLevelConfig(selectedLevel)?.holdingRequired || 0
                      ),
                    }"
                  >
                    {{
                      hasEnoughBonzai(
                        getLevelConfig(selectedLevel)?.holdingRequired || 0
                      )
                        ? "✓"
                        : "✗"
                    }}
                  </span>
                </div>
                <hr />
                <div class="fira-sans-condensed-black-italic has-text-centered">
                  OR
                </div>
                <hr />
                <div class="req-row">
                  <span class="material-symbols-outlined">lock_open</span>
                  <span class="req-text">
                    Spend
                    <strong>{{ unlockPrice }} ETH</strong>
                    to unlock
                    <strong>ALL 6 LVL</strong>
                    permanently
                  </span>
                  <span
                    class="req-status"
                    :class="{ met: allLevelsUnlocked }"
                  >
                    {{ allLevelsUnlocked ? "✓" : "✗" }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Unlock Status Notification -->
            <div v-if="unlockStatus" class="notification unlock-status-notification mt-5" :class="unlockStatusClass">
              <span class="material-symbols-outlined mr-2" style="vertical-align: middle;">{{ unlockStatusIcon }}</span>
              {{ unlockStatus }}
            </div>

            <div class="modal-footer has-text-centered">
              <a
                :href="buyLink"
                target="_blank"
                class="button is-info is-outlined mr-2 is-medium"
                title="Buy BONZAI"
              >
                Buy BONZAI
              </a>
              <button
                class="button is-success mr-2 is-medium"
                @click="unlockAllLevels"
                :disabled="isUnlocking || allLevelsUnlocked"
                title="Unlock All Levels"
              >
                <span
                  v-if="isUnlocking"
                  class="spinner"
                ></span>
                <span v-else>
                  <span class="material-symbols-outlined mr-1" style="vertical-align: middle; font-size: 18px">{{ allLevelsUnlocked ? 'check_circle' : 'lock_open' }}</span>
                  {{ allLevelsUnlocked ? 'All Unlocked' : 'Unlock All' }}
                </span>
                <div v-if="!allLevelsUnlocked" class="tags has-addons">
                  <span
                    class="tag is-warning partner fira-sans-condensed-black-italic is-small"
                  >
                    {{ unlockPrice }} ETH
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useBonzaiWeb3 } from "../composables/useBonzaiWeb3.js";
import { CONFIG } from "../config/web3.config.js";
import { levelService, checkAllLevels, canUnlockWithEth, unlockAllWithEth, clearOpenLevelModalRequest } from "../services/level.service.js";

const {
  isConnected,
  isConnecting,
  walletAddress,
  truncatedAddress,
  isOnArbitrum,
  totalBalance,
  balances,
  levels,
  highestLevel,
  connect: doConnect,
  disconnect: doDisconnect,
  cancelConnection: doCancelConnection,
  refresh: doRefresh,
  store,
} = useBonzaiWeb3();

// Cancel connection and reset state
const cancelConnection = async () => {
  console.log("[BonzaiBottomBar] Cancelling connection...");
  await doCancelConnection();
};

const isRefreshing = ref(false);
const isUnlocking = ref(false);
const selectedLevel = ref(null);
const unlockStatus = ref('');
const unlockStatusType = ref('info'); // 'info', 'warning', 'success', 'danger'

// Unlock status styling
const unlockStatusClass = computed(() => `is-${unlockStatusType.value}`);
const unlockStatusIcon = computed(() => {
  const icons = {
    info: 'hourglass_empty',
    warning: 'warning',
    success: 'check_circle',
    danger: 'error',
  };
  return icons[unlockStatusType.value] || 'info';
});

// ETH unlock state from levelService
const unlockPrice = computed(() => levelService.state.unlockPrice || 1.0);
const allLevelsUnlocked = computed(() => levelService.state.allLevelsUnlocked);

const buyLink = CONFIG.links.buyBonzai;

// Helpers
const getLevelConfig = (lvl) => CONFIG.levels[`LVL${lvl}`];

const hasEnoughBonzai = (required) => totalBalance.value >= required;

// Manual unlock flag (ETH unlock for all levels)
const isLevelManuallyUnlocked = (levelId) => {
  // Check if user paid 1 ETH to unlock all levels
  if (allLevelsUnlocked.value) return true;
  // Check from levels state (ethUnlocked flag)
  const levelKey = `LVL${levelId}`;
  if (levels.value[levelKey]?.ethUnlocked) return true;
  return false;
};

// New rule: unlocking is either holdings OR ETH unlock (1 ETH for all levels).
// Once unlocked => user can use the tier.
const isLevelUnlockedOrHolding = (levelId) => {
  // If all levels unlocked via ETH, this level is unlocked
  if (allLevelsUnlocked.value) return true;

  const cfg = getLevelConfig(levelId);
  const required = cfg?.holdingRequired || 0;
  // Check if level is active via the levels state
  const levelKey = `LVL${levelId}`;
  if (levels.value[levelKey]?.active) return true;
  return isLevelManuallyUnlocked(levelId) || hasEnoughBonzai(required);
};

// Displayed highest level: include ETH unlocks (not only holding-based "highestLevel")
const displayedHighestLevelKey = computed(() => {
  // LVL∞ takes precedence if present in highestLevel
  if ((highestLevel.value || "").toString().trim() === "LVL∞") return "LVL∞";

  for (let i = 6; i >= 1; i--) {
    if (isLevelUnlockedOrHolding(i)) return `LVL${i}`;
  }
  return highestLevel.value || "";
});

const getLevelClass = (lvl) => {
  const key = `LVL${lvl}`;
  const unlocked = isLevelUnlockedOrHolding(lvl);
  // If you want "active" driven by your levels service, keep it OR it with unlocked
  const serviceActive = levels.value[key]?.active ?? false;
  const active = unlocked || serviceActive;

  return {
    unlocked,
    active,
    locked: !unlocked,
  };
};

const getLevelIcon = (lvl) => {
  const icons = [
    "chat",
    "headphones",
    "image",
    "movie",
    "3d_rotation",
    "exercise",
  ];
  return icons[lvl - 1] || "⭐";
};

const formatBalance = (val) => {
  const n = Number(val || 0);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toFixed(0);
};

const formatFeature = (feature) =>
  feature
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

// Actions
const connect = async () => {
  await doConnect();
};

const disconnect = async () => {
  await doDisconnect();
};

const refresh = async () => {
  isRefreshing.value = true;
  await doRefresh();
  await checkAllLevels();
  setTimeout(() => (isRefreshing.value = false), 500);
};

const copyAddress = () => {
  if (!walletAddress.value) return;
  navigator.clipboard.writeText(walletAddress.value);
};

const openLevelModal = (lvl) => {
  selectedLevel.value = lvl;
};

// Helper to set unlock status
const setUnlockStatus = (message, type = 'info') => {
  unlockStatus.value = message;
  unlockStatusType.value = type;
};

const clearUnlockStatus = () => {
  unlockStatus.value = '';
  unlockStatusType.value = 'info';
};

// Close modal and clear notification status
const closeModal = () => {
  selectedLevel.value = null;
  clearUnlockStatus();
};

// Unlock all levels with 1 ETH payment
const unlockAllLevels = async () => {
  if (isUnlocking.value) return;

  isUnlocking.value = true;
  clearUnlockStatus();

  try {
    // Step 1: Check if connected, if not connect first
    if (!isConnected.value) {
      setUnlockStatus('Connecting wallet...', 'info');
      await doConnect();

      // Wait for connection to complete
      if (!isConnected.value) {
        setUnlockStatus('Wallet connection failed or cancelled', 'danger');
        return;
      }
    }

    // Step 2: Show awaiting signature notification
    setUnlockStatus('Awaiting signature...', 'warning');

    // Step 3: Call unlock - this will trigger the signature request
    // The unlockAllWithEth function handles the transaction
    const result = await unlockAllWithEth((status) => {
      // Callback for status updates from the service
      if (status === 'awaiting_payment') {
        setUnlockStatus('Awaiting payment approval (1 ETH)...', 'warning');
      }
    });

    if (result.success) {
      console.log('[BonzaiBottomBar] All levels unlocked!', result.txHash);
      setUnlockStatus('All levels unlocked successfully!', 'success');
      await checkAllLevels();
      // Clear status after a delay and close modal
      setTimeout(() => {
        clearUnlockStatus();
        selectedLevel.value = null;
      }, 2000);
    } else {
      console.error('[BonzaiBottomBar] Unlock failed:', result.error);
      setUnlockStatus(`Unlock failed: ${result.error}`, 'danger');
    }
  } catch (e) {
    console.error('[BonzaiBottomBar] Unlock error:', e);
    setUnlockStatus(`Unlock error: ${e.message || e}`, 'danger');
  } finally {
    isUnlocking.value = false;
  }
};

// Check levels on mount and when wallet connects
onMounted(async () => {
  if (isConnected.value) {
    await checkAllLevels();
  }
});

watch(isConnected, async (connected) => {
  if (connected) {
    await checkAllLevels();
  }
});

// Watch for cross-component level modal requests (from SmartAgent, etc.)
watch(
  () => levelService.state.openLevelModalFor,
  (levelNum) => {
    if (levelNum !== null && levelNum >= 1 && levelNum <= 6) {
      openLevelModal(levelNum);
      clearOpenLevelModalRequest();
    }
  }
);
</script>

<style scoped>
/* BonzAI Design System */
:root {
  --bonzai-bg-dark: #0a0a0f;
  --bonzai-bg-card: rgba(20, 20, 30, 0.92);
  --bonzai-green: #10b981;
  --bonzai-green-glow: rgba(16, 185, 129, 0.3);
  --bonzai-purple: #8b5cf6;
  --bonzai-text: #f0f0f5;
  --bonzai-text-muted: rgba(240, 240, 245, 0.7);
  --bonzai-border: rgba(255, 255, 255, 0.1);
  --bonzai-radius: 12px;
}

.bonzai-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  height: 7.66vh;
  color: #fff;
  background: #61378e;
  backdrop-filter: blur(20px);
  box-shadow: 10px 0 25px #000;
  transition: all 0.3s ease;
}

/* Main Bar Content */
.bar-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  gap: 24px;
}

/* Wallet Section */
.wallet-section {
  flex: 0 0 auto;
  min-width: 180px;
}

.connect-buttons {
  display: flex;
  align-items: center;
}

.wallet-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wallet-address {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  cursor: pointer;
}

.address-text {
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  color: #fff;
}

.network-badge {
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.9);
}

.network-badge.arbitrum {
  background: linear-gradient(135deg, #28a0f0 0%, #1a73e8 100%);
  color: white;
}

.current-level-label {
  font-size: 14px;
  color: #fff;
}

.current-level-label .no-level {
  font-style: italic;
  opacity: 0.85;
}

.disconnect-btn {
  padding: 8px;
  background: transparent;
  border: 1px solid var(--bonzai-border);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
}

.disconnect-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.tag {
  position: absolute;
  top: -12px;
  right: -18px;
  text-shadow: none !important;
}

/* Levels Section */
.levels-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.level-track {
  display: flex;
  align-items: center;
  gap: 0;
}

.level-node {
  position: relative;
  display: flex;
  align-items: center;
}

.node-inner {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid var(--bonzai-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.level-node.unlocked .node-inner {
  border-color: var(--bonzai-purple);
  background: rgba(139, 92, 246, 0.1);
}

.level-node.active .node-inner {
  border-color: var(--bonzai-green);
  background: rgba(16, 185, 129, 1);
  box-shadow: 0 0 20px var(--bonzai-green-glow);
  will-change: transform, box-shadow;
  animation: pulse 1.6s ease-in-out infinite;
}

.level-node:hover .node-inner {
  transform: scale(1.08);
  border-color: var(--bonzai-green);
}

.level-num {
  font-size: 10px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
}

.level-connector {
  width: 20px;
  height: 2px;
  background: rgba(255, 255, 255, 0.18);
}

.level-node.active .level-connector,
.level-node.unlocked .level-connector {
  background: linear-gradient(
    90deg,
    var(--bonzai-green) 0%,
    rgba(255, 255, 255, 0.18) 100%
  );
}

/* Balance Section */
.balance-section {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.balance-display {
  text-align: right;
}

.bonzai-balance {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.balance-amount {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
}

.balance-token {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}

.chain-breakdown {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.chain-balance {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--bonzai-border);
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  text-decoration: none;
}

.action-btn:hover {
  border-color: var(--bonzai-green);
  color: var(--bonzai-green);
}

.action-btn.buy-btn:hover {
  background: var(--bonzai-green);
  color: white;
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

@keyframes pulseRed {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(241, 70, 104, 0.1);
  }
  50% {
    transform: scale(1);
    box-shadow: 0 0 0 64px rgba(241, 70, 104, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(241, 70, 104, 0);
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.1);
  }
  50% {
    transform: scale(1);
    box-shadow: 0 0 0 64px rgba(16, 185, 129, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

/* Modal */
.level-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.level-modal {
  width: 92%;
  max-width: 460px;
  background: var(--bonzai-bg-dark);
  border: 1px solid var(--bonzai-border);
  border-radius: 16px;
  padding: 24px;
  position: relative;
  color: #fff; /* ensure white text */
}

.close-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
}

.models__activity--payouts {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 2em;
  border: 1px solid rgba(241, 70, 104, 0.25); /* #f14668 */
  animation: 2s pulseRed infinite;
}

.models__activity--payouts.ok {
  background: rgba(16, 185, 129, 0.04);
  border-radius: 10px;
  padding: 2em;
  border: 1px solid rgba(16, 185, 129, 0.25); /* #f14668 */
  animation: 2s pulse infinite;
}

.modal-header {
  text-align: center;
  margin-bottom: 18px;
}

.modal-level-badge {
  display: inline-block;
  padding: 6px 16px;
  background: var(--bonzai-green);
  border-radius: 20px;
  font-weight: 900;
  color: #fff;
  margin-bottom: 10px;
}

.modal-header h2 {
  margin: 0;
  color: #fff;
}

.modal-status {
  margin-top: 10px;
}

strong {
  color: rgba(16, 185, 129, 1);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 3px solid rgba(241, 70, 104, 0.9);
  color: rgba(241, 70, 104, 0.9);
  font-size: 12px;
  font-weight: 100;
  background: rgba(255, 255, 255, 0.06);
}

.status-pill.ok {
  color: rgba(16, 185, 129, 1);
  border-color: rgba(16, 185, 129, 0.55);
  background: rgba(16, 185, 129, 0.12);
}

.level-description {
  color: rgba(255, 255, 255, 0.92);
  text-align: center;
  margin-bottom: 16px;
  line-height: 1.35;
}

.features-list h3,
.requirements-title {
  color: rgba(255, 255, 255, 0.95);
  margin: 0 0 8px 0;
  font-weight: 900;
  letter-spacing: 0.2px;
}

.features-list ul {
  list-style: none;
  padding: 0 0 0 14px;
  margin: 0 0 16px 0;
}

.features-list li {
  padding: 8px 0;
  color: rgba(255, 255, 255, 0.92);
  list-style-type: circle;
}

.requirements-summary {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.req-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}

hr {
  margin: 12px 0;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.015);
}

.req-icon {
  width: 20px;
  text-align: center;
  opacity: 0.95;
}

.req-text {
  flex: 1;
}

.req-status {
  font-size: 14px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.75);
}

.req-status.met {
  color: var(--bonzai-green);
}

.req-note {
  margin-top: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
}

.modal-footer {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  padding-top: 16px;
  align-items: center;
}

.modal-footer .button {
  flex: 1;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
}

.primary-btn {
  background: linear-gradient(135deg, var(--bonzai-green) 0%, #059669 100%);
  border: none;
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: rgba(255, 255, 255, 0.95);
  animation: spin 0.9s linear infinite;
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

/* Wallet state transition - prevents jarring flash */
.wallet-fade-enter-active,
.wallet-fade-leave-active {
  transition: opacity 0.15s ease-out;
}
.wallet-fade-enter-from,
.wallet-fade-leave-to {
  opacity: 0;
}

/* Unlock Status Notification */
.unlock-status-notification {
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

/* Responsive */
@media (max-width: 768px) {
  .bar-content {
    flex-wrap: wrap;
    padding: 12px 16px;
  }
  .levels-section {
    order: -1;
    width: 100%;
    margin-bottom: 12px;
  }
  .node-inner {
    width: 40px;
    height: 40px;
  }
  .level-connector {
    width: 12px;
  }
}
</style>
