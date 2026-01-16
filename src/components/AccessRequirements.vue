<template>
  <!-- Inline access requirements - shown next to prompt area -->
  <div
    v-if="!hasAccess"
    class="access-requirements notification is-info pr-5"
    :class="{ 'is-success': hasAccess }"
  >
    <!-- Requirements panel when no access -->
    <div class="requirements-panel p-5">
      <div class="requirements-header">
        <div class="header-text fira-sans-condensed-black-italic is-size-4">
          <span class="requirement-text">
            <template v-if="!isConnected">
              Connect your Wallet to unlock this module.
            </template>
            <template v-else-if="allLevelsUnlocked">
              All levels unlocked!
            </template>
            <template v-else>
              Hold {{ holdingRequired.toLocaleString() }}+ BONZAI
              <span class="is-size-5">or</span>
              pay {{ unlockPrice }} ETH to unlock all levels
            </template>
          </span>
        </div>
      </div>

      <div class="requirements-actions">
        <!-- Connect Wallet -->
        <button
          v-if="!isConnected"
          class="button is-success connect mr-5"
          :disabled="isConnecting"
          @click="connect"
        >
          <span class="material-symbols-outlined mr-2">
            {{ isConnecting ? "hourglass_empty" : "wallet" }}
          </span>
          {{ isConnecting ? "Connecting..." : "Connect Wallet" }}
        </button>

        <!-- Buy BONZAI -->
        <a
          v-if="isConnected && !holdingMet && !allLevelsUnlocked"
          class="button is-success buy mr-5"
          :href="buyLink"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="material-symbols-outlined mr-2">shopping_cart</span>
          Buy BONZAI
        </a>

        <!-- Unlock All Levels with ETH -->
        <button
          v-if="isConnected && !allLevelsUnlocked && canUnlock"
          class="button is-warning unlock mr-5"
          :disabled="isUnlocking"
          @click="unlockAllLevels"
          :title="`Pay ${unlockPrice} ETH to unlock all 6 levels permanently`"
        >
          <span class="material-symbols-outlined mr-2">
            {{ isUnlocking ? "hourglass_empty" : "lock_open" }}
          </span>
          {{ isUnlocking ? "Unlocking..." : `Unlock Everything` }}
        </button>

        <!-- Generate Demo - directly triggers generation -->
        <button
          v-if="demoPrompt"
          class="button is-warning demo"
          @click="generateDemo"
          :disabled="isGenerating"
          :title="`Generate demo: ${demoPromptShort}`"
        >
          <span class="material-symbols-outlined mr-1">experiment</span>
          {{ isGenerating ? "Generating..." : "Run Demo" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useBonzaiWeb3 } from "../composables/useBonzaiWeb3.js";
import { CONFIG } from "../config/web3.config.js";
import {
  levelService,
  checkAllLevels,
  canUnlockWithEth,
  unlockAllWithEth,
} from "../services/level.service.js";

const props = defineProps({
  level: {
    type: String,
    required: true,
    validator: (v) =>
      ["LVL1", "LVL2", "LVL3", "LVL4", "LVL5", "LVL6"].includes(v),
  },
  demoPrompt: {
    type: String,
    default: "",
  },
  isGenerating: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["access-changed", "demo-generate"]);

const {
  hasAccess: hasTokenAccess,
  isConnected,
  isConnecting,
  connect: doConnect,
  totalBalance,
  levelConfig,
  levels,
} = useBonzaiWeb3({
  requiredLevel: props.level,
});

// Level info
const levelName = computed(() => levelConfig.value?.name || props.level);
const holdingRequired = computed(() => levelConfig.value?.holdingRequired || 0);
const levelStatus = computed(() => levels.value[props.level] || {});
const holdingMet = computed(() => levelStatus.value.holdingMet);

// ETH unlock state
const isUnlocking = ref(false);
const unlockPrice = computed(() => levelService.state.unlockPrice || 1.0);
const allLevelsUnlocked = computed(() => levelService.state.allLevelsUnlocked);
const canUnlock = computed(() => {
  const { canUnlock } = canUnlockWithEth();
  return canUnlock;
});

// Access is from token holdings OR ETH unlock
const hasAccess = computed(
  () => hasTokenAccess.value || allLevelsUnlocked.value
);

// Truncated demo prompt for display
const demoPromptShort = computed(() => {
  if (!props.demoPrompt) return "";
  return props.demoPrompt.length > 40
    ? props.demoPrompt.slice(0, 40) + "..."
    : props.demoPrompt;
});

// Links
const buyLink = CONFIG.links.buyBonzai;

// Actions
const connect = async () => {
  await doConnect();
};

const generateDemo = () => {
  if (props.demoPrompt && !props.isGenerating) {
    emit("demo-generate", props.demoPrompt);
  }
};

// Unlock all levels with ETH payment
const unlockAllLevels = async () => {
  if (isUnlocking.value) return;

  isUnlocking.value = true;
  try {
    const result = await unlockAllWithEth();
    if (result.success) {
      console.log("[AccessRequirements] All levels unlocked!", result.txHash);
      // Refresh level status
      await checkAllLevels();
    } else {
      console.error("[AccessRequirements] Unlock failed:", result.error);
      alert(`Unlock failed: ${result.error}`);
    }
  } catch (e) {
    console.error("[AccessRequirements] Unlock error:", e);
    alert(`Unlock error: ${e.message}`);
  } finally {
    isUnlocking.value = false;
  }
};

// Watch access changes and emit
watch(
  hasAccess,
  (newVal) => {
    emit("access-changed", newVal);
  },
  { immediate: true }
);

// Check levels on mount
onMounted(async () => {
  if (isConnected.value) {
    await checkAllLevels();
  }
});

// Re-check levels when wallet connects
watch(isConnected, async (connected) => {
  if (connected) {
    await checkAllLevels();
  }
});

// Expose for parent components
defineExpose({
  hasAccess,
  demoPrompt: computed(() => props.demoPrompt),
});
</script>

<style scoped>
/* Requirements panel */

/* .button.demo {
  border: 1px solid rgba(255, 255, 255, 0.15);
} */

.requirements-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.requirements-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 200px;
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Balance info */
.balance-info {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: auto;
}

.balance-info .current {
  color: #10b981;
  font-weight: 600;
}

.balance-info .separator {
  margin: 0 4px;
}

.balance-info .required {
  color: rgba(255, 255, 255, 0.6);
}

/* Responsive */
@media (max-width: 600px) {
  .requirements-panel {
    flex-direction: column;
    align-items: flex-start;
  }

  .requirements-actions {
    width: 100%;
  }

  .balance-info {
    margin-left: 0;
    width: 100%;
    text-align: center;
  }
}
</style>
