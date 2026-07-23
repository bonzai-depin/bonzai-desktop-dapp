<template>
  <div class="bz-tab-shell bz-economy">
    <header class="bz-screen-header bz-economy__header">
      <div class="bz-screen-titleblock">
        <p class="bz-eyebrow">{{ $t('views.ownership.eyebrow') }}</p>
        <h1 class="bz-h1 fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined bz-title-icon" aria-hidden="true">account_tree</span>
          {{ $t('views.ownership.title') }}
        </h1>
        <p class="bz-screen-subtitle">Stake, publish, and track revenue.</p>
      </div>
      <button class="bz-btn bz-btn--ghost" type="button" @click="refreshDashboard">
        <span class="material-symbols-outlined">sync</span>
        {{ $t('common.refresh') }}
      </button>
    </header>

    <section class="bz-economy__identity">
      <article class="bz-economy__identity-card">
        <span class="material-symbols-outlined" aria-hidden="true">{{ walletAddress ? 'account_balance_wallet' : 'devices' }}</span>
        <div>
          <p class="bz-eyebrow">{{ identityLabel }}</p>
          <strong>{{ walletAddress ? shortWallet(walletAddress) : localIdentity }}</strong>
          <small>{{ walletAddress ? 'Web3 identity is wallet-scoped across BonzAI products.' : 'Local identity keeps the app useful without a wallet.' }}</small>
        </div>
      </article>
      <article class="bz-economy__identity-card">
        <span class="material-symbols-outlined" aria-hidden="true">psychology</span>
        <div>
          <p class="bz-eyebrow">Memory instance</p>
          <strong>{{ userMemory?.label || 'Loading memory' }}</strong>
          <small>{{ memorySummary }}</small>
        </div>
      </article>
    </section>

    <section class="bz-economy__staking">
      <div class="bz-economy__stake-hero">
        <div class="bz-economy__stake-titleblock">
          <p class="bz-eyebrow">$BONZAI Utility Stake</p>
          <h2 class="bz-economy__stake-title fira-sans-condensed-black-italic">Stake BONZAI</h2>
          <p>Unlock publishing rights and increase your protocol weight.</p>
        </div>
        <div class="bz-economy__stake-orb" :class="{ 'is-live': stakingConfigured && stakePosition.amount }">
          <span class="bz-economy__stake-orb-label">Utility tier</span>
          <strong class="fira-sans-condensed-black-italic">{{ formatNumber(stakePosition.weight) }}</strong>
          <small>{{ stakingConfigured ? stakePosition.tierLabel : 'Awaiting deployment' }}</small>
        </div>
      </div>

      <div class="bz-economy__stake-progress">
        <div>
          <span>{{ stakeProgressLabel }}</span>
          <strong>{{ stakeProgressPercent }}%</strong>
        </div>
        <span class="bz-economy__stake-track">
          <i :style="{ width: `${stakeProgressPercent}%` }"></i>
        </span>
      </div>

      <div class="bz-economy__stake-grid">
        <article class="bz-economy__stake-stat">
          <small>Staked</small>
          <strong>{{ formatNumber(stakePosition.amount) }} BONZAI</strong>
        </article>
        <article class="bz-economy__stake-stat">
          <small>Utility weight</small>
          <strong>{{ formatNumber(stakePosition.weight) }}</strong>
        </article>
        <article class="bz-economy__stake-stat">
          <small>Contribution score</small>
          <strong>{{ stakePosition.contributionScore }}/10000</strong>
        </article>
        <article class="bz-economy__stake-stat">
          <small>Lock</small>
          <strong>{{ stakeLockLabel }}</strong>
        </article>
      </div>
      <div class="bz-economy__stake-form">
        <input v-model="stakeForm.amount" class="bz-economy__input" type="number" min="0" step="100" placeholder="BONZAI amount" />
        <select v-model.number="stakeForm.lockSeconds" class="bz-economy__input">
          <option v-for="option in lockOptions" :key="option.seconds" :value="option.seconds">
            {{ option.label }}
          </option>
        </select>
        <button class="bz-btn bz-btn--primary" type="button" :disabled="!stakingConfigured || stakingState.isStaking" @click="stakeBonzai">
          {{ stakingState.isStaking ? 'Working...' : 'Stake BONZAI' }}
        </button>
        <button class="bz-btn bz-btn--ghost" type="button" :disabled="!stakingConfigured || stakingState.isStaking || !stakePosition.amount" @click="unstakeBonzai">
          Unstake
        </button>
        <button class="bz-btn bz-btn--ghost" type="button" :disabled="!stakingConfigured || stakingState.isStaking || !stakePosition.amount || !stakeForm.lockSeconds" @click="extendStakeLock">
          Extend lock
        </button>
      </div>
      <p v-if="stakingState.error" class="bz-economy__stake-error">{{ stakingState.error }}</p>
    </section>

    <section class="bz-economy__stats">
      <article v-for="stat in stats" :key="stat.label" class="bz-economy__stat">
        <span class="material-symbols-outlined" aria-hidden="true">{{ stat.icon }}</span>
        <strong class="bz-shout">{{ stat.value }}</strong>
        <small>{{ stat.label }}</small>
      </article>
    </section>

    <section class="bz-economy__grid">
      <article class="bz-economy__panel">
        <div class="bz-economy__panel-head">
          <div>
            <p class="bz-eyebrow">Dataset economy</p>
            <h2 class="bz-economy__title">Datasets</h2>
          </div>
          <span class="skill-chip skill-chip--brand">{{ contributionLedger.length }}</span>
        </div>
        <div v-if="!contributionLedger.length" class="bz-economy__empty">
          Import a BonzAI+ contribution pack in Tune to populate the local ledger.
        </div>
        <div v-else class="bz-economy__list">
          <article v-for="entry in contributionLedger.slice(0, 5)" :key="entry.id" class="bz-economy__row">
            <div>
              <strong>{{ entry.fileName || entry.packId || 'Contribution pack' }}</strong>
              <small>{{ entry.recordCount || 0 }} records · {{ entry.royaltyBearing || 0 }} royalty-bearing · {{ entry.dataOwnerCount || 0 }} data owners</small>
            </div>
            <span class="skill-chip" :class="entry.status === 'published' ? 'skill-chip--success' : 'skill-chip--muted'">
              {{ entry.status || 'imported' }}
            </span>
          </article>
        </div>
      </article>

      <article class="bz-economy__panel">
        <div class="bz-economy__panel-head">
          <div>
            <p class="bz-eyebrow">Revenue routing</p>
            <h2 class="bz-economy__title">Contributors</h2>
          </div>
          <span class="skill-chip skill-chip--success">{{ dataOwnerWallets.length }}</span>
        </div>
        <div v-if="!dataOwnerWallets.length" class="bz-economy__empty">
          Wallet-attributed dataset samples will appear here once imported.
        </div>
        <div v-else class="bz-economy__wallets">
          <span v-for="wallet in dataOwnerWallets.slice(0, 18)" :key="wallet" class="bz-economy__wallet bz-mono">
            {{ shortWallet(wallet) }}
          </span>
        </div>
      </article>
    </section>

    <section class="bz-economy__panel">
      <div class="bz-economy__panel-head">
        <div>
          <p class="bz-eyebrow">Model economy</p>
          <h2 class="bz-economy__title">Models</h2>
        </div>
        <span class="skill-chip skill-chip--brand">{{ trainedModels.length }}</span>
      </div>

      <div v-if="!trainedModels.length" class="bz-economy__empty">
        Fine-tuned models with provenance, NFT, token, or registry status will appear here after training.
      </div>
      <div v-else class="bz-economy__model-list">
        <article v-for="model in trainedModels.slice(0, 6)" :key="model.id" class="bz-economy__model">
          <div>
            <strong>{{ model.base_model || model.filename || model.id }}</strong>
            <small>
              {{ modelTypeLabel(model.type) }} · {{ model.origin_record_count || 0 }} origins · {{ (model.data_owner_wallets || []).length }} data owners
            </small>
          </div>
          <div class="bz-economy__mint-tags">
            <span class="skill-chip" :class="model.nft?.tokenId ? 'skill-chip--success' : 'skill-chip--muted'">
              {{ model.nft?.tokenId ? `NFT #${model.nft.tokenId}` : 'Not minted' }}
            </span>
            <span class="skill-chip" :class="model.fineTuneToken?.tokenAddress ? 'skill-chip--brand' : 'skill-chip--muted'">
              {{ model.fineTuneToken?.symbol ? `$${model.fineTuneToken.symbol}` : 'No token' }}
            </span>
            <span class="skill-chip" :class="model.modelRegistry?.modelId ? 'skill-chip--success' : 'skill-chip--muted'">
              {{ model.modelRegistry?.modelId ? 'Registry' : 'Local' }}
            </span>
            <span class="skill-chip" :class="model.revenueRoute?.assetId ? 'skill-chip--brand' : 'skill-chip--muted'">
              {{ model.revenueRoute?.assetId ? 'Revenue route' : 'No route' }}
            </span>
          </div>
        </article>
      </div>
    </section>

    <section class="bz-economy__panel">
      <div class="bz-economy__panel-head">
        <div>
          <p class="bz-eyebrow">Minted generations</p>
          <h2 class="bz-economy__title">Published work</h2>
        </div>
        <div class="bz-economy__filters">
          <button
            v-for="filter in filters"
            :key="filter.id"
            class="bz-btn bz-btn--ghost bz-btn--sm"
            :class="{ 'is-active': activeFilter === filter.id }"
            type="button"
            @click="activeFilter = filter.id"
          >
            {{ filter.label }}
          </button>
        </div>
      </div>

      <div v-if="!filteredMints.length" class="bz-economy__empty">
        Minted generations with marketplace or training metadata will appear here.
      </div>
      <div v-else class="bz-economy__mint-list">
        <article v-for="item in filteredMints" :key="item.id" class="bz-economy__mint">
          <div class="bz-economy__mint-main">
            <span class="material-symbols-outlined" aria-hidden="true">{{ iconForType(item.type) }}</span>
            <div>
              <strong>{{ item.question || item.prompt || item.type || 'Minted generation' }}</strong>
              <small>
                {{ item.type }} · Token #{{ item.nft?.tokenId || 'unknown' }} · {{ formatDate(item.nft?.mintedAt || item.timestamp) }}
              </small>
            </div>
          </div>
          <div class="bz-economy__mint-tags">
            <span class="skill-chip" :class="item.nft?.marketplace?.discoverable ? 'skill-chip--success' : 'skill-chip--muted'">
              {{ item.nft?.marketplace?.discoverable ? 'Discoverable' : 'Private' }}
            </span>
            <span class="skill-chip" :class="item.nft?.trainingMaterial?.eligible ? 'skill-chip--brand' : 'skill-chip--muted'">
              {{ item.nft?.trainingMaterial?.eligible ? 'Training material' : 'Not training material' }}
            </span>
            <span v-if="item.nft?.contentSafety?.nsfw" class="skill-chip skill-chip--danger">NSFW blocked</span>
          </div>
          <div class="bz-economy__mint-actions">
            <a v-if="item.nft?.marketplaceUrl" class="bz-btn bz-btn--ghost bz-btn--sm" :href="item.nft.marketplaceUrl" target="_blank" rel="noopener noreferrer">
              <span class="material-symbols-outlined">open_in_new</span>
              OpenSea
            </a>
            <button class="bz-btn bz-btn--ghost bz-btn--sm" type="button" @click="goToTraining">
              <span class="material-symbols-outlined">model_training</span>
              Use in Tune
            </button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import { allInferences, initializeStore } from '../stores/inferenceStore.js'
import { loadContributionLedger } from '../services/contribution.service.js'
import { memoryService } from '../services/memory.service.js'
import { bonzaiStakingService } from '../services/bonzaiStaking.service.js'
import { useBonzaiWeb3 } from '../composables/useBonzaiWeb3.js'
import { useI18n } from '../i18n/index.js'

const i18n = useI18n()

const API_BASE = import.meta.env.VITE_API_BASE
  || window.electronAPI?.env?.API_BASE
  || 'http://127.0.0.1:65000'
const { walletAddress } = useBonzaiWeb3()

const contributionLedger = ref([])
const userMemory = ref(null)
const activeFilter = ref('all')
const trainedModels = ref([])
const stakeForm = ref({
  amount: '',
  lockSeconds: 0,
})

const filters = [
  { id: 'all', label: 'All' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'training', label: 'Training' },
  { id: 'blocked', label: 'Blocked' },
]

const minted = computed(() => allInferences.value.filter(item => item.nft))
const marketplaceMints = computed(() => minted.value.filter(item => item.nft?.marketplace?.discoverable))
const trainingMints = computed(() => minted.value.filter(item => item.nft?.trainingMaterial?.eligible))
const blockedMints = computed(() => minted.value.filter(item => item.nft?.contentSafety?.nsfw || item.nft?.marketplace?.blockedReason))
const routedModels = computed(() => trainedModels.value.filter(model => model.revenueRoute?.assetId))

const filteredMints = computed(() => {
  if (activeFilter.value === 'marketplace') return marketplaceMints.value
  if (activeFilter.value === 'training') return trainingMints.value
  if (activeFilter.value === 'blocked') return blockedMints.value
  return minted.value
})

const dataOwnerWallets = computed(() => {
  const wallets = new Set()
  contributionLedger.value.forEach(entry => {
    ;(entry.dataOwnerWallets || []).forEach(wallet => wallets.add(String(wallet).toLowerCase()))
  })
  minted.value.forEach(item => {
    const owners = item.nft?.trainingMaterial?.downstreamRevenue?.dataOwners || []
    owners.forEach(owner => {
      if (owner?.wallet) wallets.add(String(owner.wallet).toLowerCase())
    })
  })
  trainedModels.value.forEach(model => {
    ;(model.data_owner_wallets || []).forEach(wallet => wallets.add(String(wallet).toLowerCase()))
    const owners = model.fineTuneToken?.contributionRouting?.revenuePlan?.participants || []
    owners.forEach(owner => {
      if (owner?.wallet) wallets.add(String(owner.wallet).toLowerCase())
    })
  })
  return [...wallets]
})

const identityLabel = computed(() => walletAddress.value ? 'Wallet identity' : 'Local identity')
const localIdentity = computed(() => userMemory.value?.id || 'local memory')
const stakingState = bonzaiStakingService.state
const stakingConfigured = computed(() => bonzaiStakingService.isConfigured.value)
const lockOptions = computed(() => bonzaiStakingService.lockOptions.value)
const stakePosition = computed(() => stakingState.position || {
  amount: 0,
  weight: 0,
  tier: 0,
  tierLabel: 'No stake',
  contributionScore: 0,
  lockedUntil: 0,
})
const stakeLockLabel = computed(() => {
  if (!stakePosition.value.lockedUntil) return 'Flexible'
  const now = Math.floor(Date.now() / 1000)
  if (stakePosition.value.lockedUntil <= now) return 'Unlocked'
  return formatDate(stakePosition.value.lockedUntil * 1000)
})
const stakeProgressPercent = computed(() => {
  const amount = Number(stakePosition.value.amount || 0)
  if (!amount) return 0
  const nextTarget = amount < 1000 ? 1000
    : amount < 5000 ? 5000
      : amount < 10000 ? 10000
        : amount < 25000 ? 25000
          : amount < 33000 ? 33000
            : amount < 50000 ? 50000
              : amount
  return Math.min(100, Math.round((amount / Math.max(1, nextTarget)) * 100))
})
const stakeProgressLabel = computed(() => {
  const amount = Number(stakePosition.value.amount || 0)
  if (!stakingConfigured.value) return 'Staking vault not configured'
  if (!amount) return 'Start staking to activate ownership utility'
  if (amount >= 50000) return 'Maximum utility tier active'
  const nextTarget = amount < 1000 ? '1,000'
    : amount < 5000 ? '5,000'
      : amount < 10000 ? '10,000'
        : amount < 25000 ? '25,000'
          : amount < 33000 ? '33,000'
            : '50,000'
  return `Progress toward ${nextTarget} BONZAI utility tier`
})
const memorySummary = computed(() => {
  if (!userMemory.value) return 'Loading local memory graph.'
  const notes = userMemory.value.atomicNotes?.length || 0
  const sources = userMemory.value.rawSources?.length || 0
  const parents = userMemory.value.contributionParents?.length || 0
  return `${sources} sources · ${notes} notes · ${parents} contribution links`
})

const stats = computed(() => [
  { label: 'Minted assets', value: minted.value.length, icon: 'token' },
  { label: 'Discoverable', value: marketplaceMints.value.length, icon: 'storefront' },
  { label: 'Training-ready', value: trainingMints.value.length, icon: 'model_training' },
  { label: 'Trained models', value: trainedModels.value.length, icon: 'neurology' },
  { label: 'Revenue routes', value: routedModels.value.length, icon: 'account_balance' },
  { label: 'Contribution packs', value: contributionLedger.value.length, icon: 'dataset' },
  { label: 'Data owners', value: dataOwnerWallets.value.length, icon: 'groups' },
])

async function refreshDashboard() {
  await initializeStore()
  contributionLedger.value = loadContributionLedger()
  userMemory.value = await memoryService.getUserMemory()
  await bonzaiStakingService.fetchPosition()
  try {
    const resp = await axios.get(`${API_BASE}/training/models`)
    trainedModels.value = (resp.data?.models || []).map(model => ({
      ...model,
      ...(model.economy || {}),
    }))
  } catch {
    trainedModels.value = []
  }
}

async function stakeBonzai() {
  const result = await bonzaiStakingService.stake(stakeForm.value.amount, stakeForm.value.lockSeconds)
  if (result.success) {
    stakeForm.value.amount = ''
  }
}

async function unstakeBonzai() {
  const result = await bonzaiStakingService.unstake(stakeForm.value.amount || stakePosition.value.amount)
  if (result.success) {
    stakeForm.value.amount = ''
  }
}

async function extendStakeLock() {
  await bonzaiStakingService.extendLock(stakeForm.value.lockSeconds)
}

function shortWallet(wallet) {
  const value = String(wallet || '')
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function formatDate(value) {
  if (!value) return 'unknown'
  return i18n.date(value, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatNumber(value) {
  const number = Number(value || 0)
  return i18n.number(number, { maximumFractionDigits: number >= 100 ? 0 : 2 })
}

function iconForType(type) {
  if (type === 'image') return 'image'
  if (type === 'video') return 'movie'
  if (type === 'audio') return 'headphones'
  if (type === 'object') return 'deployed_code'
  return 'article'
}

function modelTypeLabel(type) {
  if (type?.includes('llm')) return 'Text'
  if (type?.includes('sdxl') || type?.includes('image')) return 'Image'
  if (type?.includes('audio')) return 'Audio'
  if (type?.includes('video')) return 'Video'
  if (type?.includes('ablit')) return 'Ablit'
  return type || 'Model'
}

function goToTraining() {
  window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'tune' }))
}

onMounted(refreshDashboard)
watch(walletAddress, () => { void refreshDashboard() })
</script>

<style scoped>
.bz-economy {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: var(--bz-space-6);
  background: var(--bz-canvas);
}

.bz-economy__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-4);
  flex: 0 0 auto;
  margin: 0;
}

.bz-economy__identity,
.bz-economy__stats,
.bz-economy__grid {
  display: grid;
  gap: var(--bz-space-3);
}

.bz-economy__identity {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.bz-economy__identity-card,
.bz-economy__stat,
.bz-economy__panel,
.bz-economy__mint {
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md);
  background: var(--bz-card);
}

.bz-economy__identity-card {
  display: flex;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4);
}

.bz-economy__identity-card > .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 28px;
}

.bz-economy__identity-card strong,
.bz-economy__row strong,
.bz-economy__mint strong {
  display: block;
  color: var(--bz-fg);
}

.bz-economy__identity-card small,
.bz-economy__row small,
.bz-economy__mint small {
  display: block;
  margin-top: 4px;
  color: var(--bz-fg-low);
}

.bz-economy__stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.bz-economy__stat {
  min-height: 96px;
  display: grid;
  align-content: center;
  gap: 6px;
  padding: var(--bz-space-3);
}

.bz-economy__stat .material-symbols-outlined {
  color: var(--bz-fg-low);
}

.bz-economy__stat small {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-caption);
}

.bz-economy__stat .bz-shout {
  font-size: 30px;
  line-height: 0.95;
}

.bz-economy__grid {
  grid-template-columns: 1.2fr 0.8fr;
}

.bz-economy__panel {
  padding: var(--bz-space-4);
}

.bz-economy__staking {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
  padding: var(--bz-space-5);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
}

.bz-economy__stake-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  align-items: center;
  gap: var(--bz-space-5);
}

.bz-economy__stake-titleblock {
  max-width: 760px;
}

.bz-economy__stake-title {
  max-width: 760px;
  margin: 0;
  color: var(--bz-fg);
  font-size: var(--bz-size-h1);
  line-height: var(--bz-line-tight);
}

.bz-economy__stake-titleblock p:not(.bz-eyebrow) {
  margin: var(--bz-space-3) 0 0;
  max-width: 68ch;
  color: var(--bz-fg-muted);
  font-size: var(--bz-size-body);
  line-height: var(--bz-line-body);
}

.bz-economy__stake-orb {
  aspect-ratio: 1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
  border: 1px solid color-mix(in srgb, var(--bz-purple-300) 44%, var(--bz-border));
  border-radius: var(--bz-r);
  background: var(--bz-panel);
}

.bz-economy__stake-orb.is-live {
  border-color: var(--bz-border-brand);
}

.bz-economy__stake-orb-label,
.bz-economy__stake-orb small {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  font-weight: 800;
  text-transform: uppercase;
}

.bz-economy__stake-orb strong {
  color: var(--bz-fg);
  font-family: var(--bz-font-mono);
  font-size: 30px;
  font-style: normal;
  line-height: 0.9;
}

.bz-economy__stake-progress {
  display: grid;
  gap: var(--bz-space-2);
}

.bz-economy__stake-progress div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  color: var(--bz-fg-muted);
  font-size: var(--bz-size-caption);
}

.bz-economy__stake-progress strong {
  color: var(--bz-fg);
}

.bz-economy__stake-track {
  height: 9px;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-pill);
  background: var(--bz-canvas);
}

.bz-economy__stake-track i {
  display: block;
  height: 100%;
  min-width: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--bz-purple-300), color-mix(in srgb, var(--bz-purple-300) 58%, var(--bz-fg)));
  transition: width 260ms var(--bz-ease-out);
}

.bz-economy__stake-grid,
.bz-economy__stake-form {
  display: grid;
  gap: var(--bz-space-2);
}

.bz-economy__stake-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.bz-economy__stake-stat {
  min-height: 84px;
  display: grid;
  align-content: center;
  gap: 4px;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md);
  background: color-mix(in srgb, var(--bz-panel) 82%, transparent);
}

.bz-economy__stake-stat small,
.bz-economy__stake-copy {
  color: var(--bz-fg-low);
}

.bz-economy__stake-stat strong {
  color: var(--bz-fg);
  font-family: "Fira Sans Condensed", sans-serif;
  font-size: 22px;
  font-style: italic;
  font-weight: 900;
}

.bz-economy__stake-form {
  grid-template-columns: minmax(0, 1fr) minmax(150px, 0.5fr) auto auto;
  align-items: center;
  padding-top: var(--bz-space-1);
}

.bz-economy__input {
  width: 100%;
  min-height: 40px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md);
  color: var(--bz-fg);
  background: var(--bz-canvas);
}

.bz-economy__stake-error {
  margin: 0;
  color: var(--bz-danger);
  font-size: var(--bz-size-small);
}

.bz-economy__stake-copy {
  margin: 0;
  font-size: var(--bz-size-small);
}

.bz-economy__panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-3);
}

.bz-economy__title {
  margin: 0;
  color: var(--bz-fg);
  font-family: "Fira Sans Condensed", sans-serif;
  font-size: 26px;
  font-style: italic;
  font-weight: 900;
  line-height: 1;
}

.bz-economy__empty {
  padding: var(--bz-space-4);
  border: 1px dashed var(--bz-border);
  border-radius: var(--bz-radius-md);
  color: var(--bz-fg-low);
  background: var(--bz-canvas);
}

.bz-economy__list,
.bz-economy__model-list,
.bz-economy__mint-list,
.bz-economy__wallets {
  display: grid;
  gap: var(--bz-space-2);
}

.bz-economy__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md);
  background: var(--bz-canvas);
}

.bz-economy__model {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md);
  background: var(--bz-canvas);
}

.bz-economy__model strong {
  display: block;
  overflow: hidden;
  color: var(--bz-fg);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bz-economy__model small {
  display: block;
  margin-top: 4px;
  color: var(--bz-fg-low);
}

.bz-economy__wallets {
  grid-template-columns: repeat(auto-fit, minmax(122px, 1fr));
}

.bz-economy__wallet {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: 999px;
  color: var(--bz-fg);
  background: var(--bz-canvas);
  font-size: var(--bz-size-micro);
}

.bz-economy__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  justify-content: flex-end;
}

.bz-economy__filters .is-active {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
}

.bz-economy__mint {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
}

.bz-economy__mint-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
}

.bz-economy__mint-main .material-symbols-outlined {
  color: var(--bz-purple-300);
}

.bz-economy__mint-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bz-economy__mint-tags,
.bz-economy__mint-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bz-space-2);
}

@media (max-width: 1100px) {
  .bz-economy__identity,
  .bz-economy__grid,
  .bz-economy__stake-hero {
    grid-template-columns: 1fr;
  }

  .bz-economy__stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .bz-economy__stake-grid,
  .bz-economy__stake-form {
    grid-template-columns: 1fr;
  }

  .bz-economy__stake-orb {
    width: 180px;
  }

  .bz-economy__mint {
    grid-template-columns: 1fr;
  }

  .bz-economy__model {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .bz-economy {
    padding: var(--bz-space-4);
  }

  .bz-economy__header {
    flex-direction: column;
  }

  .bz-economy__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
