<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="rewards-modal-overlay" @click.self="$emit('close')">
        <div class="rewards-modal">
          <!-- Header -->
          <div class="rewards-modal-header">
            <h2
              class="fira-sans-condensed-black-italic is-size-3 has-text-white"
            >
              <span class="material-symbols-outlined mr-2 is-size-2">
                redeem
              </span>
              Rewards
            </h2>
            <button
              class="button is-danger is-small"
              @click="$emit('close')"
              title="Close"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div class="rewards-modal-body">
            <!-- Loading State -->
            <div v-if="isLoading" class="has-text-centered p-6">
              <span class="material-symbols-outlined rotating is-size-1 has-text-warning">
                progress_activity
              </span>
              <p class="has-text-grey-light mt-3">Loading pool data...</p>
            </div>

            <!-- Error State -->
            <div v-else-if="loadError" class="notification is-danger m-4" style="background: rgba(241, 70, 104, 0.12); border: 1px solid rgba(241, 70, 104, 0.3);">
              <p class="has-text-danger has-text-weight-bold">
                <span class="material-symbols-outlined mr-1" style="font-size: 18px; vertical-align: middle;">error</span>
                {{ loadError }}
              </p>
              <button class="button is-small is-warning mt-3" @click="loadData">
                Retry
              </button>
            </div>

            <template v-else>
              <!-- Epoch Info Section -->
              <div class="epoch-info-section p-4">
                <div class="columns is-mobile is-multiline">
                  <div class="column is-4-desktop is-6-mobile">
                    <div class="epoch-stat">
                      <span class="stat-label">Current Epoch</span>
                      <span class="stat-value fira-sans-condensed-black-italic">
                        #{{ poolState.currentEpoch }}
                      </span>
                    </div>
                  </div>
                  <div class="column is-4-desktop is-6-mobile">
                    <div class="epoch-stat">
                      <span class="stat-label">Time Remaining</span>
                      <span class="stat-value fira-sans-condensed-black-italic">
                        {{ epochCountdown }}
                      </span>
                    </div>
                  </div>
                  <div class="column is-4-desktop is-12-mobile">
                    <div class="epoch-stat">
                      <span class="stat-label">Total Pool Balance</span>
                      <span class="stat-value fira-sans-condensed-black-italic has-text-warning">
                        {{ formatEth(totalPoolBalance) }} ETH
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Pool Cards -->
              <div class="pool-cards-section p-4">
                <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">
                  <span class="material-symbols-outlined mr-1" style="font-size: 20px; vertical-align: middle;">
                    layers
                  </span>
                  Revenue Pools
                </h3>
                <div class="columns is-multiline">
                  <div
                    v-for="(pool, index) in pools"
                    :key="index"
                    class="column is-4-desktop is-6-tablet is-12-mobile"
                  >
                    <div class="pool-card" :class="{ qualified: pool.qualified }">
                      <div class="pool-card-header">
                        <span class="material-symbols-outlined pool-icon">
                          {{ pool.icon }}
                        </span>
                        <span class="pool-name fira-sans-condensed-black-italic">
                          {{ pool.label }}
                        </span>
                        <span
                          class="qualification-badge"
                          :class="pool.qualified ? 'is-success' : 'is-danger'"
                          :title="pool.qualified ? 'Qualified' : `Need ${pool.threshold.toLocaleString()} BONZAI`"
                        >
                          <span class="material-symbols-outlined" style="font-size: 16px;">
                            {{ pool.qualified ? 'check_circle' : 'cancel' }}
                          </span>
                        </span>
                      </div>
                      <div class="pool-card-body">
                        <div class="pool-balance">
                          <span class="pool-balance-label">Pool Balance</span>
                          <span class="pool-balance-value">{{ formatEth(pool.balance) }} ETH</span>
                        </div>
                        <div class="pool-threshold">
                          <span class="pool-threshold-label">Threshold</span>
                          <span class="pool-threshold-value">{{ pool.threshold.toLocaleString() }} BONZAI</span>
                        </div>
                        <div class="pool-registration">
                          <span v-if="poolState.isRegisteredCurrentEpoch" class="tag is-success is-light">
                            <span class="material-symbols-outlined mr-1" style="font-size: 14px;">how_to_reg</span>
                            Registered
                          </span>
                          <span v-else-if="!pool.qualified" class="tag is-dark">
                            Not Eligible
                          </span>
                          <button
                            v-else
                            class="button is-success is-small is-fullwidth"
                            @click="handleRegister"
                            :disabled="isRegistering"
                            :class="{ 'is-loading': isRegistering }"
                          >
                            <span class="material-symbols-outlined mr-1" style="font-size: 16px;">app_registration</span>
                            Register
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Claimable Section -->
              <div class="claimable-section p-4" v-if="poolState.currentEpoch > 0">
                <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">
                  <span class="material-symbols-outlined mr-1" style="font-size: 20px; vertical-align: middle;">
                    savings
                  </span>
                  Claim Rewards
                </h3>

                <!-- Total Available Rewards -->
                <div v-if="totalAvailableRewards > 0" class="notification mb-3" style="background: rgba(72, 199, 142, 0.08); border: 1px solid rgba(72, 199, 142, 0.25); border-radius: 10px;">
                  <p class="has-text-success-light" style="font-size: 14px;">
                    <span class="material-symbols-outlined mr-1" style="font-size: 18px; vertical-align: middle;">savings</span>
                    <strong class="fira-sans-condensed-black-italic">{{ formatEth(totalAvailableRewards) }} ETH</strong> available to claim
                  </p>
                </div>

                <div v-if="!isConnected" class="notification is-dark mb-3" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);">
                  <p class="has-text-grey-light">Connect your wallet to view claimable rewards.</p>
                </div>

                <template v-else>
                  <!-- Previous Epoch Claims -->
                  <div v-if="claimableEpochs.length === 0" class="notification is-dark mb-3" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);">
                    <p class="has-text-grey-light">No claimable epochs found. Register for the current epoch to earn rewards.</p>
                  </div>

                  <div
                    v-for="epoch in claimableEpochs"
                    :key="epoch.epochId"
                    class="claimable-epoch-card mb-3"
                  >
                    <div class="epoch-card-header">
                      <span class="fira-sans-condensed-black-italic">Epoch #{{ epoch.epochId }}</span>
                      <span class="epoch-total has-text-warning fira-sans-condensed-black-italic">
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
                        class="button is-warning is-small"
                        @click="handleConfirmClaim(epoch.epochId)"
                        :disabled="isClaiming"
                        :class="{ 'is-loading': isClaiming }"
                      >
                        <span class="material-symbols-outlined mr-1" style="font-size: 16px;">verified</span>
                        Confirm Claim
                      </button>
                      <button
                        v-else
                        class="button is-success is-small"
                        @click="handleBatchClaim(epoch.epochId, epoch.claimablePoolIndices)"
                        :disabled="isClaiming"
                        :class="{ 'is-loading': isClaiming }"
                      >
                        <span class="material-symbols-outlined mr-1" style="font-size: 16px;">redeem</span>
                        Claim
                      </button>
                    </div>
                  </div>
                </template>
              </div>

              <!-- Skill Revenue Section -->
              <div class="skill-revenue-section p-4" v-if="isConnected">
                <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">
                  <span class="material-symbols-outlined mr-1" style="font-size: 20px; vertical-align: middle;">
                    monetization_on
                  </span>
                  Skill Revenue
                </h3>

                <div v-if="isLoadingSkillRevenue" class="has-text-centered p-3">
                  <span class="material-symbols-outlined rotating has-text-grey-light" style="font-size: 24px;">progress_activity</span>
                </div>

                <div v-else-if="parseFloat(unclaimedSkillRevenue) === 0" class="notification is-dark mb-3" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);">
                  <p class="has-text-grey-light">No unclaimed skill revenue. Register companions as skill co-owners to earn.</p>
                </div>

                <div v-else class="skill-revenue-card">
                  <div class="skill-revenue-row">
                    <span class="skill-revenue-label">Unclaimed ETH</span>
                    <span class="skill-revenue-value has-text-warning fira-sans-condensed-black-italic">
                      {{ formatEth(parseFloat(unclaimedSkillRevenue)) }} ETH
                    </span>
                  </div>
                  <button
                    class="button is-warning is-fullwidth mt-3"
                    @click="handleClaimSkillRevenue"
                    :disabled="isClaimingSkillRevenue"
                    :class="{ 'is-loading': isClaimingSkillRevenue }"
                  >
                    <span class="material-symbols-outlined mr-2">redeem</span>
                    Claim All
                  </button>
                </div>
              </div>

              <!-- Status Messages -->
              <div v-if="statusMessage" class="status-bar p-3" :class="statusType">
                <span class="material-symbols-outlined mr-1" style="font-size: 16px; vertical-align: middle;">
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { mintPoolService } from '../services/mintPool.service.js';
import { getUnclaimedRevenue, claimAllRevenue } from '../services/skillOwnership.service.js';
import { web3Service } from '../services/web3.service.js';
import { ethers } from 'ethers';

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

const pools = computed(() => {
  return mintPoolService.POOL_LABELS.map((label, index) => ({
    label,
    icon: POOL_ICONS[index],
    balance: poolState.value.totalDeposited[index] || 0,
    threshold: poolState.value.poolThresholds[index]
      ? parseFloat(ethers.formatEther(
          ethers.parseEther(poolState.value.poolThresholds[index].toString())
        ))
      : POOL_THRESHOLDS[index],
    qualified: poolState.value.userQualifies[index] || false,
  }));
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
      setStatus(`Registered for epoch #${result.epochId} with ${result.balance?.toLocaleString() || 0} BONZAI`, 'is-success');
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

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
});

defineExpose({ hasClaimableRewards });
</script>

<style scoped>
/* Overlay */
.rewards-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.rewards-modal {
  width: 95%;
  max-width: 800px;
  max-height: 90vh;
  background: #0a0a0f;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Header */
.rewards-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.rewards-modal-header h2 {
  display: flex;
  align-items: center;
  margin: 0;
}

/* Body */
.rewards-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

/* Epoch Info */
.epoch-info-section {
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.epoch-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: rgba(240, 240, 245, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 1.25rem;
  color: #f0f0f5;
}

/* Pool Cards */
.pool-cards-section {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.pool-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
  transition: border-color 0.2s;
}

.pool-card.qualified {
  border-color: rgba(72, 199, 142, 0.3);
}

.pool-card:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.pool-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.pool-icon {
  font-size: 24px;
  color: #ffe08a;
}

.pool-name {
  flex: 1;
  font-size: 1rem;
  color: #f0f0f5;
}

.qualification-badge {
  display: flex;
  align-items: center;
}

.qualification-badge.is-success {
  color: #48c78e;
}

.qualification-badge.is-danger {
  color: #f14668;
}

.pool-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pool-balance,
.pool-threshold {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pool-balance-label,
.pool-threshold-label {
  font-size: 12px;
  color: rgba(240, 240, 245, 0.5);
}

.pool-balance-value {
  font-size: 14px;
  color: #ffe08a;
  font-weight: 600;
}

.pool-threshold-value {
  font-size: 13px;
  color: rgba(240, 240, 245, 0.7);
}

.pool-registration {
  margin-top: 8px;
}

/* Claimable Section */
.claimable-section {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.claimable-epoch-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
}

.epoch-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.epoch-card-header span:first-child {
  color: #f0f0f5;
}

.epoch-total {
  font-size: 1rem;
}

.epoch-card-body {
  padding: 12px 16px;
}

.epoch-pool-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.epoch-pool-label {
  font-size: 13px;
  color: rgba(240, 240, 245, 0.7);
}

.epoch-pool-amount {
  font-size: 13px;
  color: #ffe08a;
}

.epoch-card-actions {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  justify-content: flex-end;
}

/* Skill Revenue */
.skill-revenue-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
}

.skill-revenue-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.skill-revenue-label {
  font-size: 14px;
  color: rgba(240, 240, 245, 0.7);
}

.skill-revenue-value {
  font-size: 1.25rem;
}

/* Status Bar */
.status-bar {
  margin: 0;
  font-size: 13px;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.status-bar.is-success {
  background: rgba(72, 199, 142, 0.1);
  color: #48c78e;
}

.status-bar.is-danger {
  background: rgba(241, 70, 104, 0.1);
  color: #f14668;
}

.status-bar.is-info {
  background: rgba(62, 142, 208, 0.1);
  color: #3e8ed0;
}

/* Animations */
.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Scrollbar */
.rewards-modal-body::-webkit-scrollbar {
  width: 6px;
}

.rewards-modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.rewards-modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.rewards-modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
</style>
