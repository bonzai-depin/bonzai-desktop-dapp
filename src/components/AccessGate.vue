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

      <!-- Connected but No Access State -->
      <div v-else class="state-no-access">
        <div class="gate-icon locked">
          <span class="material-symbols-outlined">lock</span>
        </div>
        <h2>{{ levelKey }}: {{ levelName }}</h2>
        <p class="description">{{ levelDescription }}</p>

        <!-- Requirements Checklist -->
        <div class="requirements">
          <div class="requirement" :class="{ met: holdingMet }">
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

          <div class="requirement" :class="{ met: nftOwned }">
            <span class="material-symbols-outlined">
              {{ nftOwned ? "check_circle" : "radio_button_unchecked" }}
            </span>
            <span class="req-text">Own {{ levelName }} NFT</span>
          </div>

          <div class="requirement" :class="{ met: nftStaked }">
            <span class="material-symbols-outlined">
              {{ nftStaked ? "check_circle" : "radio_button_unchecked" }}
            </span>
            <span class="req-text">Stake {{ levelName }} NFT</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="gate-actions">
          <a
            v-if="!holdingMet"
            :href="buyLink"
            target="_blank"
            class="action-btn primary"
          >
            <span class="material-symbols-outlined">shopping_cart</span>
            Get {{ amountNeeded.toLocaleString() }} more BONZAI
          </a>

          <button
            v-if="holdingMet && nftOwned && !nftStaked"
            class="action-btn primary"
            @click="handleStakeNft"
          >
            <span class="material-symbols-outlined">lock</span>
            Stake NFT to Activate
          </button>

          <a
            v-if="holdingMet && !nftOwned"
            href="#marketplace"
            class="action-btn secondary"
          >
            <span class="material-symbols-outlined">storefront</span>
            Get NFT in Marketplace
          </a>
        </div>

        <!-- Helpful Info -->
        <div class="help-info">
          <span class="material-symbols-outlined">info</span>
          <span>
            Your BONZAI balance is aggregated across Ethereum and Arbitrum
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Slot for actual content when access is granted -->
  <slot v-else></slot>
</template>

<script setup>
import { computed } from "vue";
import { useBonzaiWeb3 } from "../composables/useBonzaiWeb3.js";
import { CONFIG } from "../../config/web3.config.js";

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
const currentBalance = computed(() => totalBalance.value);
const amountNeeded = computed(() =>
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
</script>

<style scoped>
.access-gate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 40px 20px;
}

.gate-content {
  max-width: 480px;
  width: 100%;
  text-align: center;
}

.gate-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  background: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.2) 0%,
    rgba(5, 150, 105, 0.2) 100%
  );
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gate-icon .material-symbols-outlined {
  font-size: 40px;
  color: #10b981;
}

.gate-icon.locked {
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.2) 0%,
    rgba(245, 158, 11, 0.2) 100%
  );
}

.gate-icon.locked .material-symbols-outlined {
  color: #fbbf24;
}

h2 {
  font-size: 24px;
  font-weight: 700;
  color: white;
  margin: 0 0 12px 0;
}

p {
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 24px 0;
  line-height: 1.5;
}

.description {
  font-size: 15px;
}

/* Connect Button */
.connect-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 28px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 12px;
  color: white;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.connect-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
}

.connect-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.connect-btn .material-symbols-outlined {
  font-size: 22px;
}

/* Requirements */
.requirements {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
  text-align: left;
}

.requirement {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.5);
}

.requirement:last-child {
  border-bottom: none;
}

.requirement .material-symbols-outlined {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.3);
}

.requirement.met {
  color: rgba(255, 255, 255, 0.9);
}

.requirement.met .material-symbols-outlined {
  color: #10b981;
}

.req-text {
  flex: 1;
}

.req-status {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

/* Gate Actions */
.gate-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 24px;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
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
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.action-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

.action-btn .material-symbols-outlined {
  font-size: 20px;
}

/* Help Info */
.help-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: rgba(147, 197, 253, 0.9);
}

.help-info .material-symbols-outlined {
  font-size: 18px;
}

/* Responsive */
@media (max-width: 480px) {
  .gate-content {
    padding: 0 16px;
  }

  h2 {
    font-size: 20px;
  }

  .requirement {
    flex-wrap: wrap;
  }

  .req-status {
    width: 100%;
    margin-left: 34px;
    margin-top: 4px;
  }
}
</style>
