<template>
  <div class="access-gate" v-if="!hasAccess">
    <div class="gate-content">
      <!-- Not Connected State -->
      <div v-if="!isConnected" class="state-not-connected">
        <div class="gate-icon">
          <span class="material-symbols-outlined">wallet</span>
        </div>
        <h2>Connect Your Wallet</h2>
        <p>Connect your wallet to access {{ levelName }}</p>
        <button class="connect-btn" :disabled="isConnecting" @click="connect">
          <span class="material-symbols-outlined">
            {{ isConnecting ? "hourglass_empty" : "account_balance_wallet" }}
          </span>
          {{ isConnecting ? "Connecting..." : "Connect Wallet" }}
        </button>
      </div>

      <!-- Connected But No Access -->
      <div v-else class="state-no-access">
        <div class="gate-icon">
          <span class="material-symbols-outlined">lock</span>
        </div>
        <h2>Access Restricted</h2>
        <p class="level-info">
          <span class="level-name">{{ levelName }}</span>
          <span class="level-desc">{{ levelDescription }}</span>
        </p>

        <div class="requirements">
          <h3>Requirements</h3>

          <div class="req-item" :class="{ met: holdingMet }">
            <span class="material-symbols-outlined">
              {{ holdingMet ? "check_circle" : "radio_button_unchecked" }}
            </span>
            <span class="req-text">
              Hold {{ holdingRequired.toLocaleString() }} BONZAI
            </span>
            <span class="req-status" v-if="!holdingMet">
              (You have {{ currentBalance.toLocaleString() }})
            </span>
          </div>

          <div class="req-item" :class="{ met: nftOwned }">
            <span class="material-symbols-outlined">
              {{ nftOwned ? "check_circle" : "radio_button_unchecked" }}
            </span>
            <span class="req-text">Own the BONZAI Access NFT</span>
          </div>

          <div class="req-item" :class="{ met: nftStaked }">
            <span class="material-symbols-outlined">
              {{ nftStaked ? "check_circle" : "radio_button_unchecked" }}
            </span>
            <span class="req-text">Stake your BONZAI Access NFT</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="actions">
          <!-- Buy BONZAI -->
          <a
            v-if="!holdingMet"
            class="action-btn primary"
            :href="buyLink"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="material-symbols-outlined">shopping_cart</span>
            Buy BONZAI (Need {{ requiredMore.toLocaleString() }} more)
          </a>

          <!-- Stake NFT -->
          <button
            v-if="holdingMet && nftOwned && !nftStaked"
            class="action-btn primary"
            @click="handleStakeNft"
          >
            <span class="material-symbols-outlined">lock_open</span>
            Stake Access NFT
          </button>

          <!-- Get NFT -->
          <button
            v-if="holdingMet && !nftOwned"
            class="action-btn secondary"
            disabled
          >
            <span class="material-symbols-outlined">info</span>
            Access NFT required (minting soon)
          </button>

          <!-- Refresh -->
          <button class="action-btn secondary" @click="refreshAccess">
            <span class="material-symbols-outlined">refresh</span>
            Refresh
          </button>
        </div>

        <!-- Wallet Info -->
        <div class="wallet-info">
          <div class="balance-display">
            <span class="label">Your BONZAI Balance</span>
            <span class="value">{{ totalBalance.toLocaleString() }}</span>
          </div>
          <div class="network-display">
            <span class="label">Networks</span>
            <span class="value">Ethereum + Arbitrum</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Slot content when access granted -->
  <slot v-else />
</template>

<script setup>
import { computed } from "vue";
import { useBonzaiWeb3 } from "../composables/useBonzaiWeb3.js";
import { CONFIG } from "../../config/web3.config.js";

// Holder-based tiering (derived from current BONZAI holder distribution)
// LVL1 ≥ 100   | LVL2 ≥ 500   | LVL3 ≥ 2,000   | LVL4 ≥ 10,000   | LVL5 ≥ 50,000   | LVL6 ≥ 200,000
const HOLDER_BASED_HOLDING_REQUIREMENTS = Object.freeze({
  LVL1: 100,
  LVL2: 500,
  LVL3: 2000,
  LVL4: 10000,
  LVL5: 50000,
  LVL6: 200000,
});

const applyHolderBasedLevelOverrides = () => {
  if (!CONFIG || !CONFIG.levels) return;
  for (const [levelKey, holdingRequired] of Object.entries(
    HOLDER_BASED_HOLDING_REQUIREMENTS
  )) {
    if (CONFIG.levels[levelKey]) {
      CONFIG.levels[levelKey].holdingRequired = holdingRequired;
    }
  }
};

// Apply once at module init so store + UI stay consistent.
applyHolderBasedLevelOverrides();

const props = defineProps({
  level: {
    type: String,
    required: true,
    validator: (v) =>
      ["LVL1", "LVL2", "LVL3", "LVL4", "LVL5", "LVL6"].includes(v),
  },
});

const {
  hasAccess,
  isConnected,
  isConnecting,
  connect: doConnect,
  totalBalance,
  levels,
  levelConfig,
  stakeNft,
} = useBonzaiWeb3({
  requiredLevel: props.level,
});

// Level info
const levelKey = computed(() => props.level);
const levelName = computed(() => levelConfig.value?.name || "");
const levelDescription = computed(() => levelConfig.value?.description || "");
const holdingRequired = computed(() => levelConfig.value?.holdingRequired || 0);

// Status
const levelStatus = computed(() => levels.value[props.level] || {});
const holdingMet = computed(() => levelStatus.value.holdingMet);
const nftOwned = computed(() => levelStatus.value.nftOwned);
const nftStaked = computed(() => levelStatus.value.nftStaked);

// Balance info
const currentBalance = computed(() => totalBalance.value || 0);
const requiredMore = computed(() =>
  Math.max(0, holdingRequired.value - currentBalance.value)
);

// Links
const buyLink = CONFIG.links.buyBonzai;

// Actions
const connect = async () => {
  await doConnect();
};

const handleStakeNft = async () => {
  await stakeNft(props.level);
};

const refreshAccess = async () => {
  // Force a refresh by reconnecting
  await doConnect(true);
};
</script>

<style scoped>
.access-gate {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.gate-content {
  background: linear-gradient(135deg, rgba(17, 24, 39, 0.95) 0%, rgba(31, 41, 55, 0.95) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 40px;
  max-width: 500px;
  width: 100%;
  text-align: center;
  color: white;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.gate-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 20px;
  background: rgba(16, 185, 129, 0.1);
  border: 2px solid rgba(16, 185, 129, 0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gate-icon .material-symbols-outlined {
  font-size: 40px;
  color: #10b981;
}

h2 {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 12px;
}

p {
  margin: 0 0 24px;
  opacity: 0.8;
  line-height: 1.5;
}

.connect-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 12px;
  padding: 14px 24px;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  transition: all 0.2s ease;
}

.connect-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.level-info {
  margin-bottom: 30px;
}

.level-name {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #10b981;
  margin-bottom: 6px;
}

.level-desc {
  display: block;
  font-size: 14px;
  opacity: 0.8;
}

.requirements {
  text-align: left;
  margin-bottom: 30px;
  padding: 20px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
}

.requirements h3 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
}

.req-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  font-size: 14px;
}

.req-item:last-child {
  margin-bottom: 0;
}

.req-item .material-symbols-outlined {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.req-item.met .material-symbols-outlined {
  color: #10b981;
}

.req-text {
  flex: 1;
  opacity: 0.8;
}

.req-item.met .req-text {
  opacity: 1;
}

.req-status {
  font-size: 12px;
  opacity: 0.6;
  margin-left: auto;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.action-btn {
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-decoration: none;
  transition: all 0.2s ease;
}

.action-btn.primary {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.action-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
}

.action-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.action-btn.secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wallet-info {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.balance-display,
.network-display {
  text-align: left;
}

.label {
  display: block;
  font-size: 12px;
  opacity: 0.6;
  margin-bottom: 4px;
}

.value {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #10b981;
}

@media (max-width: 480px) {
  .gate-content {
    padding: 30px 20px;
  }

  .wallet-info {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
