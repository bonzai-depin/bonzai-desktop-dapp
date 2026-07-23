<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="rewards-modal-overlay" @click.self="$emit('close')">
        <div class="rewards-modal">
          <!-- Header -->
          <div class="rewards-modal-header">
            <div class="rewards-titleblock">
              <p class="bz-eyebrow">Rewards</p>
              <h2 class="bz-h2">
                <span class="material-symbols-outlined" aria-hidden="true">redeem</span>
                Epoch Vault
              </h2>
            </div>
            <BzCloseButton
              size="md"
              aria-label="Close rewards"
              @click="$emit('close')"
            />
          </div>

          <div class="rewards-modal-body">
            <!-- Loading State -->
            <div v-if="isLoading" class="rewards-loading">
              <span class="material-symbols-outlined rotating" aria-hidden="true">progress_activity</span>
              <p class="bz-meta">Loading pool data...</p>
            </div>

            <!-- Error State -->
            <div v-else-if="loadError" class="bz-notice bz-notice--danger bz-notice--stacked m-4">
              <span class="bz-notice__icon"><span class="material-symbols-outlined">error</span></span>
              <div class="bz-notice__body">
                <p class="bz-notice__title">{{ loadError }}</p>
              </div>
              <div class="bz-notice__cta">
                <button type="button" class="bz-btn bz-btn--primary bz-btn--sm" @click="loadData">
                  <span class="material-symbols-outlined">refresh</span>
                  Retry
                </button>
              </div>
            </div>

            <template v-else>
              <section class="rewards-hero">
                <div class="rewards-hero__main">
                  <span class="rewards-live-pill">
                    <span class="rewards-live-pill__dot"></span>
                    Epoch #{{ poolState.currentEpoch }}
                  </span>
                  <h3 class="rewards-hero__amount bz-shout">
                    {{ formatEth(totalPoolBalance) }} ETH
                  </h3>
                  <p class="rewards-hero__meta bz-meta">
                    {{ qualifiedPoolCount }} / {{ pools.length }} pools unlocked · {{ epochCountdown }} left
                  </p>
                </div>
                <div class="rewards-hero__action">
                  <button
                    v-if="!poolState.isRegisteredCurrentEpoch && hasQualifiedPool"
                    type="button"
                    class="bz-btn bz-btn--primary rewards-primary-cta"
                    @click="handleRegister"
                    :disabled="isRegistering"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">app_registration</span>
                    {{ isRegistering ? 'Registering…' : `Enter Epoch #${poolState.currentEpoch}` }}
                  </button>
                  <div v-else-if="poolState.isRegisteredCurrentEpoch" class="rewards-registered-card">
                    <span class="material-symbols-outlined" aria-hidden="true">verified</span>
                    <span class="bz-shout">Registered</span>
                  </div>
                  <div v-else class="rewards-locked-card">
                    <span class="material-symbols-outlined" aria-hidden="true">lock</span>
                    <span>{{ nextUnlockLabel }}</span>
                  </div>
                </div>
              </section>

              <section v-if="totalAvailableRewards > 0" class="rewards-claim-banner">
                <div>
                  <p class="bz-eyebrow">Ready</p>
                  <strong class="bz-shout">{{ formatEth(totalAvailableRewards) }} ETH claimable</strong>
                </div>
                <span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
              </section>

              <!-- Pool Cards -->
              <div class="pool-cards-section">
                <h3 class="bz-h2 rewards-section-title">
                  <span class="material-symbols-outlined" aria-hidden="true">layers</span>
                  Revenue Pools
                </h3>
                <div class="pool-grid">
                  <div
                    v-for="(pool, index) in pools"
                    :key="index"
                    class="pool-card"
                    :class="{ qualified: pool.qualified }"
                  >
                    <div class="pool-card-header">
                      <span class="material-symbols-outlined pool-icon" aria-hidden="true">
                        {{ pool.icon }}
                      </span>
                      <span class="pool-name bz-shout">{{ pool.label }}</span>
                      <span class="qualification-badge" :class="pool.qualified ? 'is-success' : 'is-danger'">
                        <span class="material-symbols-outlined" aria-hidden="true">
                          {{ pool.qualified ? 'check_circle' : 'lock' }}
                        </span>
                      </span>
                    </div>
                    <div class="pool-card-body">
                      <div class="pool-balance">
                        <span class="pool-balance-label">Balance</span>
                        <span class="pool-balance-value bz-mono">{{ formatEth(pool.balance) }} ETH</span>
                      </div>
                      <div class="pool-threshold">
                        <span class="pool-threshold-label">Threshold</span>
                        <span class="pool-threshold-value bz-mono">{{ i18n.number(pool.threshold) }} BONZAI</span>
                      </div>
                      <div class="pool-progress" :title="`${Math.round(pool.progress)}%`">
                        <span :style="{ width: `${Math.min(100, pool.progress)}%` }"></span>
                      </div>
                      <div class="pool-registration">
                        <span v-if="poolState.isRegisteredCurrentEpoch" class="rewards-state-pill rewards-state-pill--success">
                          <span class="material-symbols-outlined" aria-hidden="true">how_to_reg</span>
                          Registered
                        </span>
                        <span v-else-if="pool.qualified" class="rewards-state-pill rewards-state-pill--ready">
                          <span class="material-symbols-outlined" aria-hidden="true">bolt</span>
                          Ready
                        </span>
                        <span v-else class="rewards-state-pill">
                          {{ i18n.number(pool.missing) }} BONZAI away
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Claimable Section -->
              <div class="claimable-section" v-if="poolState.currentEpoch > 0">
                <h3 class="bz-h2 rewards-section-title">
                  <span class="material-symbols-outlined" aria-hidden="true">savings</span>
                  Claim Rewards
                </h3>

                <div v-if="!isConnected" class="bz-notice rewards-inline-notice">
                  <span class="bz-notice__icon"><span class="material-symbols-outlined">account_balance_wallet</span></span>
                  <div class="bz-notice__body">
                    <p class="bz-notice__text">Connect your wallet to view claimable rewards.</p>
                  </div>
                </div>

                <template v-else>
                  <!-- Previous Epoch Claims -->
                  <div v-if="claimableEpochs.length === 0" class="bz-notice rewards-inline-notice">
                    <span class="bz-notice__icon"><span class="material-symbols-outlined">inbox</span></span>
                    <div class="bz-notice__body">
                      <p class="bz-notice__text">No claimable epochs found. Register for the current epoch to earn rewards.</p>
                    </div>
                  </div>

                  <div
                    v-for="epoch in claimableEpochs"
                    :key="epoch.epochId"
                    class="claimable-epoch-card"
                  >
                    <div class="epoch-card-header">
                      <span class="fira-sans-condensed-black-italic">Epoch #{{ epoch.epochId }}</span>
                      <span class="epoch-total bz-shout">
                        {{ formatEth(epoch.totalClaimable) }} ETH
                      </span>
                    </div>
                    <div class="epoch-card-body">
                      <div
                        v-for="pool in epoch.pools"
                        :key="pool.index"
                        class="epoch-pool-row"
                      >
                        <span class="epoch-pool-label">{{ pool.label }}</span>
                        <span class="epoch-pool-amount">{{ formatEth(pool.amount) }} ETH</span>
                      </div>
                    </div>
                    <div class="epoch-card-actions">
                      <button
                        v-if="!epoch.confirmed"
                        type="button"
                        class="bz-btn bz-btn--primary bz-btn--sm"
                        @click="handleConfirmClaim(epoch.epochId)"
                        :disabled="isClaiming"
                      >
                        <span class="material-symbols-outlined">verified</span>
                        {{ isClaiming ? 'Confirming…' : 'Confirm Claim' }}
                      </button>
                      <button
                        v-else
                        type="button"
                        class="bz-btn bz-btn--success bz-btn--sm"
                        @click="handleBatchClaim(epoch.epochId, epoch.claimablePoolIndices)"
                        :disabled="isClaiming"
                      >
                        <span class="material-symbols-outlined">redeem</span>
                        {{ isClaiming ? 'Claiming…' : 'Claim' }}
                      </button>
                    </div>
                  </div>
                </template>
              </div>

              <!-- Skill Revenue Section -->
              <div class="skill-revenue-section" v-if="isConnected">
                <h3 class="bz-h2 rewards-section-title">
                  <span class="material-symbols-outlined" aria-hidden="true">monetization_on</span>
                  Skill Revenue
                </h3>

                <div v-if="isLoadingSkillRevenue" class="rewards-mini-loading">
                  <span class="material-symbols-outlined rotating">progress_activity</span>
                </div>

                <div v-else-if="parseFloat(unclaimedSkillRevenue) === 0" class="bz-notice rewards-inline-notice">
                  <span class="bz-notice__icon"><span class="material-symbols-outlined">monetization_on</span></span>
                  <div class="bz-notice__body">
                    <p class="bz-notice__text">No unclaimed skill revenue. Register companions as skill co-owners to earn.</p>
                  </div>
                </div>

                <div v-else class="skill-revenue-card">
                  <div class="skill-revenue-row">
                    <span class="skill-revenue-label">Unclaimed ETH</span>
                    <span class="skill-revenue-value bz-shout">
                      {{ formatEth(parseFloat(unclaimedSkillRevenue)) }} ETH
                    </span>
                  </div>
                  <button
                    type="button"
                    class="bz-btn bz-btn--primary rewards-full-btn"
                    @click="handleClaimSkillRevenue"
                    :disabled="isClaimingSkillRevenue"
                  >
                    <span class="material-symbols-outlined">redeem</span>
                    {{ isClaimingSkillRevenue ? 'Claiming…' : 'Claim All' }}
                  </button>
                </div>
              </div>

              <!-- Status Messages -->
              <div v-if="statusMessage" class="status-bar" :class="statusType">
                <span class="material-symbols-outlined" aria-hidden="true">
                  {{ statusType === 'is-success' ? 'check_circle' : statusType === 'is-danger' ? 'error' : 'info' }}
                </span>
                {{ statusMessage }}
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import BzCloseButton from './BzCloseButton.vue';
import { mintPoolService } from '../services/mintPool.service.js';
import { getUnclaimedRevenue, claimAllRevenue } from '../services/skillOwnership.service.js';
import { web3Service } from '../services/web3.service.js';
import { ethers } from 'ethers';
import { i18n } from '../i18n/index.js';

const emit = defineEmits(['close']);

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const isLoading = ref(false);
const loadError = ref(null);
const isRegistering = ref(false);
const isClaiming = ref(false);
const statusMessage = ref('');
const statusType = ref('is-info');

// Skill revenue
const isLoadingSkillRevenue = ref(false);
const isClaimingSkillRevenue = ref(false);
const unclaimedSkillRevenue = ref('0');

// Claimable epochs
const claimableEpochs = ref([]);

// Epoch countdown
const epochEndTime = ref(0);
const now = ref(Math.floor(Date.now() / 1000));
let countdownInterval = null;

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTED
// ═══════════════════════════════════════════════════════════════════════════

const poolState = computed(() => mintPoolService.state);
const isConnected = computed(() => web3Service.state.isConnected);
const walletAddress = computed(() => web3Service.state.walletAddress);

const POOL_ICONS = ['chat', 'headphones', 'image', 'movie', '3d_rotation', 'exercise'];
const POOL_THRESHOLDS = [1000, 5000, 10000, 25000, 33000, 50000];

const totalBonzaiBalance = computed(() => web3Service.state.balances?.total || 0);

const pools = computed(() => {
  // Total BONZAI balance across ALL chains (Ethereum + Arbitrum + Base)
  const totalBalance = totalBonzaiBalance.value;
  // Check if user has unlocked all levels via 1 ETH payment
  const allUnlocked = poolState.value.allUnlocked || false;

  return mintPoolService.POOL_LABELS.map((label, index) => {
    const threshold = poolState.value.poolThresholds[index]
      ? parseFloat(ethers.formatEther(
          ethers.parseEther(poolState.value.poolThresholds[index].toString())
        ))
      : POOL_THRESHOLDS[index];

    // Qualify if: unlocked OR multi-chain total balance >= threshold
    const qualified = allUnlocked || totalBalance >= threshold;
    const progress = allUnlocked ? 100 : threshold > 0 ? (totalBalance / threshold) * 100 : 0;
    const missing = Math.max(0, Math.ceil(threshold - totalBalance));

    return {
      label,
      icon: POOL_ICONS[index],
      balance: poolState.value.totalDeposited[index] || 0,
      threshold,
      qualified,
      progress,
      missing,
    };
  });
});

const qualifiedPoolCount = computed(() => pools.value.filter((pool) => pool.qualified).length);
const hasQualifiedPool = computed(() => qualifiedPoolCount.value > 0);
const nextUnlockLabel = computed(() => {
  const next = pools.value.find((pool) => !pool.qualified);
  if (!next) return 'Connect wallet to enter';
  return `${i18n.number(next.missing)} BONZAI to ${next.label}`;
});

const totalPoolBalance = computed(() => {
  return pools.value.reduce((sum, p) => sum + p.balance, 0);
});

const epochCountdown = computed(() => {
  if (!epochEndTime.value) return '--:--:--';
  const remaining = epochEndTime.value - now.value;
  if (remaining <= 0) return 'Finalizing...';

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
});

const totalAvailableRewards = computed(() => {
  const poolRewards = claimableEpochs.value.reduce((sum, e) => sum + e.totalClaimable, 0);
  return poolRewards + parseFloat(unclaimedSkillRevenue.value || '0');
});

/**
 * Whether there are any claimable rewards (used for badge indicator via expose)
 */
const hasClaimableRewards = computed(() => {
  return claimableEpochs.value.length > 0 || parseFloat(unclaimedSkillRevenue.value) > 0;
});

// ═══════════════════════════════════════════════════════════════════════════
// METHODS
// ═══════════════════════════════════════════════════════════════════════════

function formatEth(value) {
  const n = Number(value || 0);
  if (n === 0) return '0';
  if (n < 0.000001) return '<0.000001';
  return n.toFixed(6).replace(/\.?0+$/, '');
}

function setStatus(message, type = 'is-info') {
  statusMessage.value = message;
  statusType.value = type;
  setTimeout(() => {
    statusMessage.value = '';
  }, 5000);
}

async function loadData() {
  isLoading.value = true;
  loadError.value = null;

  try {
    await mintPoolService.fetchPoolStats();

    // Calculate epoch end time: genesis + (currentEpoch + 1) * epochDuration
    if (poolState.value.epochDuration > 0 && poolState.value.genesisTime > 0) {
      epochEndTime.value = poolState.value.genesisTime +
        (poolState.value.currentEpoch + 1) * poolState.value.epochDuration;
    }

    // Load claimable epochs (check previous epochs)
    if (isConnected.value && walletAddress.value) {
      await loadClaimableEpochs();
      await loadSkillRevenue();
    }
  } catch (e) {
    console.error('[RewardsModal] loadData failed:', e);
    loadError.value = e.message || 'Failed to load pool data';
  } finally {
    isLoading.value = false;
  }
}

async function loadClaimableEpochs() {
  const epochs = [];
  const currentEpoch = poolState.value.currentEpoch;
  const address = walletAddress.value;

  // Check up to 4 previous epochs for claimable rewards
  const checkCount = Math.min(currentEpoch, 4);
  for (let i = 1; i <= checkCount; i++) {
    const epochId = currentEpoch - i;
    try {
      const wasRegistered = await mintPoolService.isRegisteredForEpoch(epochId);
      if (!wasRegistered) continue;

      // Check each pool for claimable amounts
      const poolResults = [];
      let totalClaimable = 0;
      const claimablePoolIndices = [];

      for (let p = 0; p < 6; p++) {
        const hasClaimed = await mintPoolService.hasClaimedEpoch(epochId, p);
        if (!hasClaimed) {
          const amount = await mintPoolService.previewClaim(epochId, p);
          const amountEth = Number(ethers.formatEther(amount));
          poolResults.push({
            index: p,
            label: mintPoolService.POOL_LABELS[p],
            amount: amountEth,
            claimed: false,
          });
          totalClaimable += amountEth;
          claimablePoolIndices.push(p);
        }
      }

      if (claimablePoolIndices.length > 0) {
        epochs.push({
          epochId,
          pools: poolResults,
          totalClaimable,
          claimablePoolIndices,
          confirmed: false, // Will be checked if needed
        });
      }
    } catch (e) {
      console.warn(`[RewardsModal] Failed to check epoch ${epochId}:`, e.message);
    }
  }

  claimableEpochs.value = epochs;
}

async function loadSkillRevenue() {
  if (!walletAddress.value) return;
  isLoadingSkillRevenue.value = true;
  try {
    unclaimedSkillRevenue.value = await getUnclaimedRevenue(walletAddress.value);
  } catch (e) {
    console.warn('[RewardsModal] Failed to load skill revenue:', e.message);
    unclaimedSkillRevenue.value = '0';
  } finally {
    isLoadingSkillRevenue.value = false;
  }
}

async function handleRegister() {
  isRegistering.value = true;
  try {
    const result = await mintPoolService.registerForEpoch();
    if (result.success) {
      setStatus(`Registered for epoch #${result.epochId} with ${i18n.number(result.balance || 0)} BONZAI`, 'is-success');
    } else {
      setStatus(result.error || 'Registration failed', 'is-danger');
    }
  } catch (e) {
    setStatus(e.message || 'Registration failed', 'is-danger');
  } finally {
    isRegistering.value = false;
  }
}

async function handleConfirmClaim(epochId) {
  isClaiming.value = true;
  try {
    const result = await mintPoolService.confirmClaim(epochId);
    if (result.success) {
      // Mark as confirmed
      const epoch = claimableEpochs.value.find(e => e.epochId === epochId);
      if (epoch) epoch.confirmed = true;
      setStatus(`Claim confirmed for epoch #${epochId}. Wait 256 blocks, then click Claim.`, 'is-success');
    } else {
      setStatus(result.error || 'Confirm failed', 'is-danger');
    }
  } catch (e) {
    setStatus(e.message || 'Confirm failed', 'is-danger');
  } finally {
    isClaiming.value = false;
  }
}

async function handleBatchClaim(epochId, poolIndices) {
  isClaiming.value = true;
  try {
    const result = await mintPoolService.claimEpochBatch(epochId, poolIndices);
    if (result.success) {
      setStatus(`Claimed rewards from epoch #${epochId}!`, 'is-success');
      // Remove from claimable list
      claimableEpochs.value = claimableEpochs.value.filter(e => e.epochId !== epochId);
    } else {
      setStatus(result.error || 'Claim failed', 'is-danger');
    }
  } catch (e) {
    setStatus(e.message || 'Claim failed', 'is-danger');
  } finally {
    isClaiming.value = false;
  }
}

async function handleClaimSkillRevenue() {
  isClaimingSkillRevenue.value = true;
  try {
    await claimAllRevenue();
    setStatus('Skill revenue claimed!', 'is-success');
    unclaimedSkillRevenue.value = '0';
  } catch (e) {
    setStatus(e.message || 'Skill revenue claim failed', 'is-danger');
  } finally {
    isClaimingSkillRevenue.value = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

onMounted(() => {
  loadData();
  countdownInterval = setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, 1000);
});

// Re-fetch when wallet connects or balances change
watch([isConnected, walletAddress], ([connected, addr]) => {
  if (connected && addr) loadData();
});

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
});

defineExpose({ hasClaimableRewards });
</script>

<style scoped>
.rewards-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bz-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.rewards-modal {
  width: min(960px, calc(100vw - 32px));
  max-height: min(900px, 90vh);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--bz-shadow-lg);
}

.rewards-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
  padding: var(--bz-space-5);
  background: var(--bz-panel);
  border-bottom: 1px solid var(--bz-border);
}

.rewards-titleblock {
  display: grid;
  gap: var(--bz-space-1);
}

.rewards-titleblock .bz-eyebrow,
.rewards-titleblock h2 {
  margin: 0;
}

.rewards-titleblock h2 {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg);
}

.rewards-titleblock .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 24px !important;
}

.rewards-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--bz-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
}

.rewards-loading {
  min-height: 340px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: var(--bz-space-3);
  color: var(--bz-fg-mid);
}

.rewards-loading .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 42px !important;
}

.rewards-mini-loading {
  min-height: 72px;
  display: grid;
  place-items: center;
  color: var(--bz-fg-low);
}

.rewards-mini-loading .material-symbols-outlined {
  font-size: 24px !important;
}

.rewards-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--bz-space-5);
  align-items: stretch;
  padding: var(--bz-space-5);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
}

.rewards-hero__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}

.rewards-live-pill,
.rewards-state-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  width: fit-content;
  min-height: 28px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-micro);
  text-transform: uppercase;
  letter-spacing: var(--bz-track-eyebrow);
}

.rewards-live-pill {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-100);
}

.rewards-live-pill__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-purple-300);
  box-shadow: 0 0 14px var(--bz-purple-300);
}

.rewards-hero__amount {
  margin: 0;
  color: var(--bz-fg);
  font-size: clamp(32px, 6vw, 56px);
  line-height: 1;
}

.rewards-hero__meta {
  margin: 0;
}

.rewards-hero__action {
  min-width: min(260px, 34vw);
  display: flex;
}

.rewards-primary-cta,
.rewards-registered-card,
.rewards-locked-card {
  width: 100%;
  min-height: 100%;
  justify-content: center;
}

.rewards-registered-card,
.rewards-locked-card {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-4);
  border-radius: var(--bz-r);
  border: 1px solid var(--bz-border);
  background: var(--bz-panel);
  color: var(--bz-fg-mid);
}

.rewards-registered-card {
  border-color: var(--bz-emerald-soft);
  background: var(--bz-emerald-soft);
  color: var(--bz-emerald-300);
}

.rewards-claim-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
  padding: var(--bz-space-4) var(--bz-space-5);
  border: 1px solid var(--bz-emerald-soft);
  border-radius: var(--bz-r);
  background: var(--bz-emerald-soft);
  color: var(--bz-fg);
}

.rewards-claim-banner .bz-eyebrow,
.rewards-claim-banner strong {
  margin: 0;
}

.rewards-claim-banner .material-symbols-outlined {
  color: var(--bz-emerald-300);
}

.pool-cards-section,
.claimable-section,
.skill-revenue-section {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

.rewards-section-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg);
}

.rewards-section-title .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 22px !important;
}

.pool-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bz-space-3);
}

.pool-card,
.claimable-epoch-card,
.skill-revenue-card {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  overflow: hidden;
}

.pool-card {
  padding: var(--bz-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

.pool-card.qualified {
  border-color: var(--bz-border-brand);
  background: linear-gradient(180deg, var(--bz-purple-soft), var(--bz-canvas));
}

.pool-card:hover {
  border-color: var(--bz-border-strong);
}

.pool-card-header {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
}

.pool-icon {
  font-size: 22px !important;
  color: var(--bz-purple-300);
}

.pool-name {
  flex: 1;
  min-width: 0;
  color: var(--bz-fg);
  font-size: var(--bz-size-h3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qualification-badge {
  display: inline-flex;
  align-items: center;
  color: var(--bz-fg-low);
}

.qualification-badge.is-success {
  color: var(--bz-emerald-500);
}

.qualification-badge.is-danger {
  color: var(--bz-fg-low);
}

.pool-card-body {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}

.pool-balance,
.pool-threshold,
.skill-revenue-row,
.epoch-pool-row,
.epoch-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--bz-space-3);
}

.pool-balance-label,
.pool-threshold-label,
.skill-revenue-label,
.epoch-pool-label {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-low);
}

.pool-balance-value,
.pool-threshold-value,
.epoch-pool-amount,
.epoch-total,
.skill-revenue-value {
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
}

.pool-progress {
  height: 6px;
  overflow: hidden;
  border-radius: var(--bz-r-pill);
  background: var(--bz-panel);
}

.pool-progress span {
  display: block;
  height: 100%;
  min-width: 4px;
  border-radius: inherit;
  background: var(--bz-gradient-brand);
}

.pool-registration {
  margin-top: var(--bz-space-1);
}

.rewards-state-pill--success {
  border-color: var(--bz-emerald-soft);
  background: var(--bz-emerald-soft);
  color: var(--bz-emerald-300);
}

.rewards-state-pill--ready {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-100);
}

.claimable-epoch-card {
  display: flex;
  flex-direction: column;
}

.claimable-epoch-card + .claimable-epoch-card {
  margin-top: var(--bz-space-3);
}

.rewards-inline-notice {
  margin: 0;
}

.epoch-card-header {
  padding: var(--bz-space-3) var(--bz-space-4);
  background: var(--bz-panel);
  border-bottom: 1px solid var(--bz-border);
  color: var(--bz-fg);
}

.epoch-total,
.skill-revenue-value {
  color: var(--bz-emerald-300);
}

.epoch-card-body {
  padding: var(--bz-space-3) var(--bz-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}

.epoch-card-actions {
  padding: var(--bz-space-3) var(--bz-space-4);
  border-top: 1px solid var(--bz-border);
  display: flex;
  justify-content: flex-end;
}

.skill-revenue-card {
  padding: var(--bz-space-4);
}

.rewards-full-btn {
  width: 100%;
  margin-top: var(--bz-space-3);
}

.status-bar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bz-space-2);
  margin: 0 calc(var(--bz-space-5) * -1) calc(var(--bz-space-5) * -1);
  padding: var(--bz-space-3) var(--bz-space-5);
  font-size: var(--bz-size-meta);
  text-align: center;
  border-top: 1px solid var(--bz-border);
}

.status-bar .material-symbols-outlined {
  font-size: 16px !important;
}

.status-bar.is-success {
  background: var(--bz-emerald-soft);
  color: var(--bz-emerald-300);
}

.status-bar.is-danger {
  background: var(--bz-danger-soft);
  color: var(--bz-danger);
}

.status-bar.is-info {
  background: var(--bz-info-soft);
  color: var(--bz-info);
}

.rotating {
  animation: bz-spin 1s linear infinite;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--bz-dur-base) var(--bz-ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.rewards-modal-body::-webkit-scrollbar {
  width: 6px;
}

.rewards-modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.rewards-modal-body::-webkit-scrollbar-thumb {
  background: var(--bz-border-strong);
  border-radius: var(--bz-r-pill);
}

@media (max-width: 860px) {
  .rewards-modal {
    width: min(100vw - 16px, 640px);
  }

  .rewards-hero {
    grid-template-columns: 1fr;
  }

  .rewards-hero__action {
    min-width: 0;
  }

  .pool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .rewards-modal-body,
  .rewards-modal-header {
    padding: var(--bz-space-4);
  }

  .pool-grid {
    grid-template-columns: 1fr;
  }
}
</style>
