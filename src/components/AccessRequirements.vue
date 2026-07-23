<template>
  <!-- Inline access gate — sits next to a prompt area or above a CTA.
       Calm, branded, no notification chrome. -->
  <div v-if="!hasAccess" class="bz-access" role="status">
    <div class="bz-access__icon" aria-hidden="true">
      <span class="material-symbols-outlined">{{ iconName }}</span>
    </div>

    <div class="bz-access__body">
      <span class="bz-access__eyebrow bz-eyebrow">Access required</span>
      <p class="bz-access__title fira-sans-condensed-black-italic">
        <template v-if="!isConnected">
          Connect your wallet to unlock this module.
        </template>
        <template v-else-if="isConnecting || isCheckingLevels">
          Checking access&hellip;
        </template>
        <template v-else-if="allLevelsUnlocked">
          All levels unlocked.
        </template>
        <template v-else>
          Stake {{ $n(holdingRequired) }}+ BONZAI to unlock this minting level.
        </template>
      </p>
    </div>

    <div class="bz-access__actions">
      <!-- Connect Wallet -->
      <button
        v-if="!isConnected"
        type="button"
        class="bz-btn bz-btn--primary bz-access__cta"
        :disabled="isConnecting"
        @click="connect"
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          {{ isConnecting ? "hourglass_empty" : "wallet" }}
        </span>
        {{ isConnecting ? "Connecting…" : "Connect Wallet" }}
      </button>

      <!-- Loading while checking -->
      <span v-else-if="isCheckingLevels" class="bz-access__pending bz-meta">
        <span class="material-symbols-outlined rotating" aria-hidden="true">progress_activity</span>
        Checking&hellip;
      </span>

      <button
        v-else-if="!holdingMet && !allLevelsUnlocked"
        class="bz-btn bz-btn--ghost bz-access__cta"
        type="button"
        @click="openStaking"
      >
        <span class="material-symbols-outlined" aria-hidden="true">savings</span>
        Stake BONZAI
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useBonzaiWeb3 } from "../composables/useBonzaiWeb3.js";
import { levelService, checkAllLevels } from "../services/level.service.js";

const props = defineProps({
  level: {
    type: String,
    required: true,
    validator: (v) =>
      ["LVL1", "LVL2", "LVL3", "LVL4", "LVL5", "LVL6"].includes(v),
  },
});

const emit = defineEmits(["access-changed"]);

const {
  hasAccess: hasTokenAccess,
  isConnected,
  isConnecting,
  connect: doConnect,
  levelConfig,
  levels,
} = useBonzaiWeb3({
  requiredLevel: props.level,
});

// Level info
const holdingRequired = computed(() => levelConfig.value?.holdingRequired || 0);
const levelStatus = computed(() => levels.value[props.level] || {});
const holdingMet = computed(() => levelStatus.value.holdingMet);

// ETH unlock state
const isCheckingLevels = ref(false);
const allLevelsUnlocked = computed(() => levelService.state.allLevelsUnlocked);

// Access is from token holdings OR ETH unlock
const hasAccess = computed(
  () => hasTokenAccess.value || allLevelsUnlocked.value
);

// Icon — wallet glyph if disconnected, lock once we're past that
const iconName = computed(() => {
  if (!isConnected.value) return "account_balance_wallet";
  if (isCheckingLevels.value) return "progress_activity";
  return "lock";
});

// Links
// Actions
const connect = async () => {
  await doConnect();
};

const openStaking = () => window.dispatchEvent(new CustomEvent("bonzai:set-mode", { detail: "economy" }));

watch(
  hasAccess,
  (newVal) => {
    emit("access-changed", newVal);
  },
  { immediate: true }
);

onMounted(async () => {
  if (isConnected.value) {
    isCheckingLevels.value = true;
    try {
      await checkAllLevels();
    } finally {
      isCheckingLevels.value = false;
    }
  }
});

watch(isConnected, async (connected) => {
  if (connected) {
    isCheckingLevels.value = true;
    try {
      await checkAllLevels();
    } finally {
      isCheckingLevels.value = false;
    }
  }
});

defineExpose({
  hasAccess,
});
</script>

<style scoped>
/* Inline access gate.
   Calm card-shaped surface with a brand left bar — reads like a polite
   waypoint, not a red error. Three columns on desktop (icon · message ·
   actions), single column on narrow viewports. */

.bz-access {
  display: flex;
  align-items: center;
  gap: var(--bz-space-4);
  padding: var(--bz-space-4) var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-left: 3px solid var(--bz-purple-500);
  border-radius: var(--bz-r-lg);
  position: relative;
  overflow: hidden;
}
.bz-access::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--bz-purple-soft);
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
}
.bz-access > * { position: relative; z-index: 1; }

.bz-access__icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bz-purple-soft);
  border: 1px solid var(--bz-border-brand);
  border-radius: var(--bz-r);
  color: var(--bz-purple-100);
  flex-shrink: 0;
}
.bz-access__icon .material-symbols-outlined {
  font-size: 22px !important;
  font-variation-settings: "FILL" 1;
}

.bz-access__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bz-access__eyebrow {
  color: var(--bz-purple-100);
}
.bz-access__title {
  margin: 0;
  font-size: var(--bz-size-h3);
  line-height: 1.3;
  color: var(--bz-fg);
}
.bz-access__or {
  color: var(--bz-fg-low);
  font-style: normal;
  font-weight: 400;
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  margin: 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.bz-access__actions {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  flex-shrink: 0;
}
.bz-access__cta {
  white-space: nowrap;
}
.bz-access__cta .material-symbols-outlined {
  font-size: 18px !important;
  margin-right: var(--bz-space-2);
  vertical-align: middle;
}

.bz-access__pending {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg-mid);
  white-space: nowrap;
}
.bz-access__pending .material-symbols-outlined {
  font-size: 16px !important;
}

/* Reduced motion respects user preference; the rotating spinner is
   already gated by the global @media (prefers-reduced-motion) rule
   in themes.css. */
.rotating {
  animation: bz-spin 1s linear infinite;
}

/* Stack on narrow viewports — title reads first, actions sit beneath. */
@media (max-width: 720px) {
  .bz-access {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--bz-space-3);
  }
  .bz-access__actions {
    width: 100%;
    flex-wrap: wrap;
  }
  .bz-access__cta {
    flex: 1;
    justify-content: center;
  }
}
</style>
