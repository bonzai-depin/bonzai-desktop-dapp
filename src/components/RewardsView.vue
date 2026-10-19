<template>
  <div class="rewards-view" :aria-label="i18n.t('nav.rewards')">
    <div class="rewards-content bz-page-content">
      <header class="rewards-topline bz-page-header">
        <div><p class="bz-eyebrow">BonzAI membership</p><h1 class="bz-h1"><span class="material-symbols-outlined bz-title-icon" aria-hidden="true">workspace_premium</span> {{ i18n.t('nav.rewards') }}</h1></div>
        <span class="rewards-network"><span class="material-symbols-outlined" aria-hidden="true">language</span>{{ network.name }}</span>
      </header>

      <section class="rewards-hero" aria-labelledby="rewards-title">
        <div class="rewards-story">
          <div class="rewards-emblem" aria-hidden="true"><img src="../assets/logo.png" alt="" /><span>Powered by $BONZAI</span></div>
          <h2 id="rewards-title">An AI economy.<br /><span>A share for you.</span></h2>
          <p class="rewards-lead">Smart agents at work. Ideas becoming assets. Stake BONZAI to share in the protocol fees this economy generates.</p>
          <div class="rewards-promise">
            <div><span class="material-symbols-outlined" aria-hidden="true">layers</span><strong>One membership</strong><span>Six cumulative levels</span></div>
            <div><span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span><strong>A basket of rewards</strong><span>USDC, social tokens &amp; more</span></div>
          </div>
          <a class="rewards-text-link" href="#reward-levels" @click.prevent="scrollTo('reward-levels')">Explore your membership <span class="material-symbols-outlined" aria-hidden="true">south</span></a>
          <p class="rewards-fineprint">Rewards come from collected fees. Their amount depends on activity and eligible stake.</p>
        </div>

        <section id="reward-stake" class="membership-panel" aria-labelledby="membership-title" :aria-busy="staking.isLoading || staking.isStaking">
          <div class="membership-heading"><h2 id="membership-title">Your membership</h2><span class="membership-status" :class="{ 'is-earning': wallet && staking.rewardActive }">{{ membershipStatus }}</span></div>
          <div class="membership-identity">
            <div><span class="rewards-caption">{{ wallet ? 'Current level' : 'Your starting point' }}</span><strong class="membership-level bz-metric">LVL<span>{{ wallet ? (staking.isLoading || staking.error ? '—' : position?.tier || 0) : 1 }}</span></strong></div>
            <svg class="membership-mark" viewBox="0 0 120 120" aria-hidden="true">
              <path v-for="(offset, index) in [0, 13, 26, 39, 52, 65]" :key="offset" :class="{ 'is-active': index < (wallet ? position?.tier || 0 : 1) }" :d="`M 15 ${28 + offset} L 60 ${8 + offset} L 105 ${28 + offset} L 60 ${48 + offset} Z`" />
            </svg>
          </div>
          <div class="membership-position"><span>{{ wallet ? 'BONZAI staked' : 'BONZAI for LVL1' }}</span><strong class="bz-metric">{{ wallet ? stakeDisplay : formatNumber(tiers[0]?.amount || 0) }}</strong></div>
          <div class="membership-entry">
            <label for="rewards-stake-amount">{{ position?.amount ? 'Add to your stake' : 'Choose your stake' }}</label>
            <div class="stake-input"><input id="rewards-stake-amount" v-model="amount" type="text" inputmode="decimal" autocomplete="off" placeholder="1,000" :disabled="busy || !!review" aria-describedby="stake-preview" /><span>BONZAI</span></div>
            <p id="stake-preview" class="stake-preview" aria-live="polite">
              <template v-if="preview?.tier">After staking <strong class="bz-metric">LVL{{ preview.tier }}</strong><span> · {{ preview.tier }} cumulative {{ preview.tier === 1 ? 'allocation' : 'allocations' }}</span></template>
              <template v-else-if="amount">{{ preview ? `Reach ${formatNumber(tiers[0]?.amount || 0)} BONZAI in total to activate rewards.` : 'Enter a positive amount with up to 18 decimal places.' }}</template>
              <template v-else>Choose a level below to fill in your stake.</template>
            </p>
            <button v-if="!wallet" class="bz-btn bz-btn--primary stake-primary" @click="requestConnection">Connect to get started <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
            <button v-else class="bz-btn bz-btn--primary stake-primary" :disabled="!canStake" @click="prepare('stake')">{{ staking.isStaking ? 'Waiting for confirmation…' : 'Review stake' }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
            <p class="rewards-fineprint">{{ exitDays }}-day withdrawal notice. Requesting withdrawal stops future rewards; accrued rewards remain claimable.</p>
            <p v-if="!configured || !stakingConfigured" class="rewards-availability" role="status"><span class="material-symbols-outlined" aria-hidden="true">info</span>Reward staking is not configured on {{ network.name }} yet.</p>
          </div>
          <div v-if="review" class="stake-review" role="region" aria-label="Review membership action" aria-live="polite">
            <strong>{{ reviewTitle }}</strong>
            <p>{{ reviewDescription }}</p>
            <span class="rewards-fineprint">{{ network.name }} · {{ shortAddress(review.wallet) }}</span>
            <div><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="review = null">{{ i18n.t('common.cancel') }}</button><button class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy" @click="confirmAction">{{ busy ? 'Confirming…' : 'Confirm in wallet' }}</button></div>
          </div>
          <p v-if="actionError || (wallet && staking.error)" class="basket-error" role="alert">{{ actionError || staking.error }} <button v-if="!busy" class="rewards-text-link" @click="refreshPosition">Retry</button></p>
          <p v-if="success" class="rewards-success" role="status">{{ success }}</p>
          <details v-if="wallet && position?.amount" class="membership-manage">
            <summary>Manage membership <span class="material-symbols-outlined" aria-hidden="true">expand_more</span></summary>
            <p v-if="staking.rewardExitAt">{{ i18n.t('basket.exitAt', { date: withdrawalDate }) }}</p>
            <button v-if="!staking.rewardActive && position.tier" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="!configured || busy || !!review" @click="prepare('activate')">{{ i18n.t('basket.enable') }}</button>
            <button v-if="staking.rewardActive" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy || !!review" @click="prepare('exit')">{{ i18n.t('basket.requestExit') }}</button>
            <button v-else class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="!canWithdraw || busy || !!review" @click="prepare('withdraw')">Withdraw stake</button>
          </details>
        </section>
      </section>

      <section class="rewards-flow" aria-label="Where rewards come from">
        <div class="rewards-flow-title"><p class="bz-eyebrow">The value comes full circle</p><h2>Built by creators.<br />Shared with members.</h2></div>
        <article><span class="material-symbols-outlined" aria-hidden="true">automation</span><h3>Smart agents</h3><p>Protocol fees from settled jobs, collected in the smart agent’s social token.</p></article>
        <article><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span><h3>Digital creations</h3><p>Routed fees from publishing and monetizing eligible AI assets.</p></article>
        <article><span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span><h3>Your reward basket</h3><p>The member allocation reaches stakers in its original currency.</p></article>
      </section>

      <section id="reward-levels" class="rewards-levels" aria-labelledby="levels-title">
        <div class="rewards-section-heading"><div><p class="bz-eyebrow">Grow your membership</p><h2 id="levels-title">Every level builds on the last.</h2></div><p>Higher levels unlock more allocations.<br />More eligible BONZAI adds weight within each one.</p></div>
        <div class="level-grid" role="group" aria-label="Explore staking levels">
          <button v-for="(tier, index) in tiers" :key="tier.tier" class="level-option" :class="{ 'is-selected': selectedLevel === tier.tier }" :aria-pressed="selectedLevel === tier.tier" :disabled="busy || !!review" @click="chooseLevel(tier)">
            <div class="level-option-top"><span class="bz-metric">LVL{{ tier.tier }}</span><span class="material-symbols-outlined" aria-hidden="true">{{ position?.tier === tier.tier && wallet ? 'verified' : levelIcons[index] }}</span></div>
            <strong class="level-threshold bz-metric">{{ formatNumber(tier.amount) }}</strong><span class="level-unit">BONZAI staked</span>
            <div class="level-allocation" aria-hidden="true"><span v-for="n in 6" :key="n" :class="{ 'is-filled': n <= tier.tier }"></span></div>
            <span class="level-right">{{ levelRights[index] }}</span>
            <small>{{ tier.tier }} reward {{ tier.tier === 1 ? 'allocation' : 'allocations' }} <span v-if="wallet && position?.tier === tier.tier">· Your level</span></small>
          </button>
        </div>
        <div class="level-explanation"><span class="material-symbols-outlined" aria-hidden="true">layers</span><p><strong>LVL{{ selectedLevel }} includes {{ selectedLevel === 1 ? 'the LVL1 allocation' : `allocations LVL1–LVL${selectedLevel}` }}.</strong> Each fee deposit is split across six allocations. Your share of each eligible allocation reflects your BONZAI stake and the time it participated during the period.</p><a class="bz-btn bz-btn--ghost bz-btn--sm" href="#reward-stake" @click.prevent="scrollTo('reward-stake')">View stake<span class="material-symbols-outlined" aria-hidden="true">north_east</span></a></div>
        <p class="rewards-fineprint">Publishing rights expand with your level. Local AI creation remains free.</p>
      </section>

      <section id="reward-basket" class="rewards-basket" aria-labelledby="basket-title" :aria-busy="loading">
        <div class="rewards-section-heading"><div><p class="bz-eyebrow">Your share of the activity</p><h2 id="basket-title">One stake. Many rewards.</h2></div><button v-if="wallet && configured" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="loading || busy" @click="refresh"><span class="material-symbols-outlined" aria-hidden="true">refresh</span>{{ i18n.t('common.refresh') }}</button></div>
        <p class="rewards-basket-intro">Collect USDC, eligible smart-agent tokens and native-currency rewards when those fees reach the basket. Each currency stays yours to claim.</p>
        <div v-if="!wallet" class="basket-welcome"><span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span><div><h3>Your basket starts here.</h3><p>Connect to see your membership and rewards. No wallet is needed to explore.</p></div><button class="bz-btn bz-btn--ghost" @click="requestConnection">{{ i18n.t('common.connect') }}</button></div>
        <div v-else-if="!configured" class="basket-welcome" role="status"><span class="material-symbols-outlined" aria-hidden="true">hourglass_empty</span><div><h3>A place for your future rewards.</h3><p>Reward claims will appear here when the basket is configured on {{ network.name }}.</p></div></div>
        <template v-else>
          <div class="basket-period"><span>{{ data?.end ? i18n.t('basket.periods', { start: data.start, end: data.end - 1 }) : 'Closed reward periods' }}</span><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="loading || busy || !data?.start" @click="load(data.start)">{{ i18n.t('basket.earlier') }}</button><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="loading || busy || !data || data.end >= data.currentEpoch" @click="load(Math.min(data.currentEpoch, data.end + 8))">{{ i18n.t('basket.newer') }}</button></div>
          <p v-if="basketError" class="basket-error" role="alert">{{ basketError }}</p>
          <p v-if="loading" class="basket-empty" role="status">{{ i18n.t('common.loading') }}</p>
          <div v-else-if="data?.rows.length" class="basket-currencies">
            <article v-for="row in data.rows" :key="row.address" class="basket-currency">
              <span class="currency-icon material-symbols-outlined" aria-hidden="true">{{ row.address === zeroAddress ? 'language' : 'token' }}</span>
              <div class="currency-identity"><strong>{{ row.symbol }}</strong><small class="bz-mono" :title="row.address">{{ row.address === zeroAddress ? network.name : shortAddress(row.address) }}</small></div>
              <div class="currency-value"><span v-if="!row.error" class="basket-amount bz-metric">{{ row.amount }}</span><span v-else class="basket-error" role="status">{{ row.error }}</span><small v-if="!row.error">Available to claim</small></div>
              <button class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy || !!row.error || !row.claimEpochs.length" @click="claim(row)">{{ claiming === row.address ? 'Confirming…' : i18n.t('basket.claim', { symbol: row.symbol }) }}</button>
            </article>
          </div>
          <div v-else-if="!basketError" class="basket-welcome"><span class="material-symbols-outlined" aria-hidden="true">savings</span><div><h3>{{ data?.currentEpoch === 0 ? 'The first period is underway.' : 'Your next chapter is still being written.' }}</h3><p>{{ data?.currentEpoch === 0 ? 'Rewards become claimable after this period closes.' : 'No reward currencies are available for these periods. Claims appear as fees are collected and periods close.' }}</p></div></div>
          <div v-if="data && data.currencyCount > 8" class="basket-pagination"><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="loading || busy || !currencyOffset" @click="changeCurrencies(-8)">{{ i18n.t('common.back') }}</button><span class="bz-metric">{{ currencyOffset + 1 }}–{{ Math.min(currencyOffset + 8, data.currencyCount) }} / {{ data.currencyCount }}</span><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="loading || busy || currencyOffset + 8 >= data.currencyCount" @click="changeCurrencies(8)">{{ i18n.t('common.next') }}</button></div>
        </template>
        <div class="basket-footnotes"><p><span class="material-symbols-outlined" aria-hidden="true">schedule</span>{{ i18n.t('basket.periodNotice') }}</p><p><span class="material-symbols-outlined" aria-hidden="true">verified_user</span>Claim each currency directly to your wallet. Accrued rewards remain claimable after you leave.</p></div>
      </section>
      <details v-if="CONFIG.mintPool?.contractAddress && wallet" class="rewards-legacy" @toggle="legacy = $event.target.open"><summary>{{ i18n.t('basket.legacy') }}</summary><LegacyRewardsModal v-if="legacy" embedded /></details>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from '../services/web3.service.js';
import { bonzaiStakingService } from '../services/bonzaiStaking.service.js';
import { basketRewardsConfigured, fetchRewardBasket, claimBasketCurrency } from '../services/basketRewards.service.js';
import { rewardStakePreview, amountToReachLevel, rewardWithdrawalReady } from '../services/rewardMembership.js';
import { requestConnection } from '../services/connectionDialog.service.js';
import { useI18n } from '../i18n/index.js';
import { withTimeout } from '../utils/withTimeout.js';
import LegacyRewardsModal from './LegacyRewardsModal.vue';

const i18n = useI18n();
const configured = computed(basketRewardsConfigured);
const stakingConfigured = bonzaiStakingService.isConfigured;
const wallet = computed(() => web3Service.state.walletAddress);
const staking = bonzaiStakingService.state;
const position = computed(() => staking.position);
const tiers = bonzaiStakingService.tiers;
const network = CONFIG.networks[ECONOMY_NETWORK_KEY];
const zeroAddress = ethers.ZeroAddress;
const levelIcons = ['article', 'graphic_eq', 'image', 'movie', 'deployed_code', 'model_training'];
const levelRights = ['Publish text', 'Publish audio', 'Publish images', 'Publish video', 'Publish 3D', 'Publish training assets'];
const amount = ref(String(tiers.value[0]?.amount || ''));
const selectedLevel = ref(1), review = ref(null), actionError = ref(''), success = ref('');
const data = ref(null), basketError = ref(''), loading = ref(false), claiming = ref(''), legacy = ref(false), currencyOffset = ref(0);
const now = ref(Date.now() / 1000);
let requestId = 0, clock;
const busy = computed(() => staking.isStaking || !!claiming.value);
const currentAmount = computed(() => position.value?.amountExact || String(position.value?.amount || 0));
const preview = computed(() => rewardStakePreview(amount.value, currentAmount.value, tiers.value));
const canStake = computed(() => wallet.value && configured.value && stakingConfigured.value && !busy.value && !staking.isLoading && !staking.error && !review.value && preview.value?.tier > 0);
const canWithdraw = computed(() => !staking.isLoading && !staking.error && rewardWithdrawalReady(staking, now.value));
const exitDays = computed(() => Math.ceil(staking.rewardExitDelay / 86400));
const stakeDisplay = computed(() => staking.isLoading ? '…' : staking.error ? '—' : formatNumber(position.value?.amount || 0));
const membershipStatus = computed(() => !wallet.value ? 'Open to you' : staking.isLoading ? 'Loading' : staking.error ? 'Unavailable' : staking.rewardActive ? 'Earning rewards' : staking.rewardExitAt ? 'Withdrawal requested' : 'Not earning yet');
const withdrawalDate = computed(() => new Date(Math.max(staking.rewardExitAt, position.value?.lockedUntil || 0) * 1000).toLocaleDateString(i18n.locale.value));
const reviewTitle = computed(() => ({ stake: `Stake ${review.value?.amount} BONZAI`, activate: 'Enable basket rewards', exit: 'Request withdrawal', withdraw: `Withdraw ${review.value?.amount} BONZAI` })[review.value?.type]);
const reviewDescription = computed(() => ({ stake: `Your stake will total ${review.value?.total} BONZAI. Rewards require a ${exitDays.value}-day withdrawal notice. A pending withdrawal will be cancelled when rewards reactivate.`, activate: `Your existing stake will earn rewards. Any pending withdrawal will be cancelled; a new ${exitDays.value}-day notice is required to withdraw.`, exit: `Future rewards stop immediately. Withdrawal becomes available after ${exitDays.value} days or your existing lock, whichever is later. Accrued rewards stay claimable.`, withdraw: 'Your full available stake will return to your connected wallet. Accrued rewards stay claimable.' })[review.value?.type]);

function formatNumber(value) { return i18n.number(value, { maximumFractionDigits: 4 }); }
const shortAddress = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
function scrollTo(id) { document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
function chooseLevel(tier) { selectedLevel.value = tier.tier; amount.value = amountToReachLevel(currentAmount.value, tier.amount); }
function prepare(type) {
  if (busy.value || !wallet.value || (type === 'stake' && !canStake.value) || (type === 'withdraw' && !canWithdraw.value)) return;
  actionError.value = ''; success.value = '';
  review.value = { type, wallet: wallet.value, amount: type === 'withdraw' ? currentAmount.value : preview.value?.amount, total: preview.value?.total };
}
async function confirmAction() {
  const intent = review.value;
  if (!intent || busy.value) return;
  if (intent.wallet !== wallet.value) { review.value = null; return; }
  actionError.value = ''; success.value = '';
  try {
    const result = await ({ stake: () => bonzaiStakingService.stakeForRewards(intent.amount), activate: () => bonzaiStakingService.activateRewards(), exit: () => bonzaiStakingService.requestRewardExit(), withdraw: () => bonzaiStakingService.unstake(intent.amount) })[intent.type]();
    if (intent.wallet !== wallet.value) return;
    if (!result.success) { actionError.value = result.error; return; }
    success.value = ({ stake: 'Stake confirmed. Your membership is ready.', activate: 'Basket rewards enabled.', exit: 'Withdrawal notice confirmed.', withdraw: 'Stake withdrawn.' })[intent.type];
    if (intent.type === 'stake') amount.value = '';
    review.value = null;
    await load();
  } catch (error) { if (intent.wallet === wallet.value) actionError.value = error.shortMessage || error.message; }
}
async function refreshPosition() { await bonzaiStakingService.fetchPosition(wallet.value); }
async function load(beforeEpoch) {
  const request = ++requestId;
  const address = wallet.value;
  basketError.value = '';
  if (!address || !configured.value) { data.value = null; loading.value = false; return; }
  loading.value = true;
  try {
    const next = await withTimeout(fetchRewardBasket(address, { beforeEpoch, currencyOffset: currencyOffset.value }), 15000, i18n.t('rcWorkflows.timeout'));
    if (request === requestId) data.value = next;
  } catch (error) { if (request === requestId) { basketError.value = error.shortMessage || error.message; data.value = null; } }
  finally { if (request === requestId) loading.value = false; }
}
async function refresh() { await Promise.all([load(data.value?.end), refreshPosition()]); }
async function claim(row) {
  if (busy.value) return;
  const address = wallet.value;
  claiming.value = row.address; basketError.value = ''; success.value = '';
  try { await claimBasketCurrency(row, address); if (address === wallet.value) { success.value = `${row.symbol} rewards claimed.`; await load(data.value?.end); } }
  catch (error) { if (address === wallet.value) basketError.value = error.shortMessage || error.message; }
  finally { claiming.value = ''; }
}
function changeCurrencies(delta) { currencyOffset.value = Math.max(0, currencyOffset.value + delta); load(data.value?.end); }
watch(wallet, () => { data.value = null; currencyOffset.value = 0; review.value = null; actionError.value = ''; success.value = ''; load(); refreshPosition(); }, { immediate: true });
onMounted(() => { clock = setInterval(() => { now.value = Date.now() / 1000; }, 1000); });
onBeforeUnmount(() => { requestId++; clearInterval(clock); });
</script>

<style scoped>
.rewards-view, .rewards-view * { box-sizing: border-box; }
.rewards-view { height: 100%; overflow-y: auto; overflow-x: hidden; color: var(--bz-fg); background: var(--bz-canvas); scroll-behavior: smooth; }
.rewards-content { max-width: 1500px; margin: 0 auto; padding: clamp(20px, 3.5vw, 56px); }
.rewards-view h1, .rewards-view h2, .rewards-view h3, .rewards-view p { margin: 0; color: inherit; }
.rewards-topline, .rewards-network, .membership-heading, .membership-position, .rewards-section-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-4); }
.rewards-topline { padding-bottom: var(--bz-space-6); border-bottom: 1px solid var(--bz-border); }
.rewards-topline .bz-eyebrow { color: var(--bz-fg-mid); }
.rewards-topline .bz-eyebrow span { padding: 0 10px; color: var(--bz-fg-low); }
.rewards-network { justify-content: flex-end; font-size: var(--bz-size-caption); color: var(--bz-fg-mid); gap: 8px; }
.rewards-network .material-symbols-outlined { font-size: 18px; }
.rewards-hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(330px, .8fr); gap: clamp(24px, 5vw, 80px); padding: var(--bz-space-8) 0; align-items: center; }
.rewards-emblem { display: flex; align-items: center; gap: 10px; color: var(--bz-fg-mid); font-size: var(--bz-size-caption); margin-bottom: var(--bz-space-6); }
.rewards-emblem img { width: 32px; height: 32px; object-fit: contain; }
.rewards-story h2 { font: 900 italic clamp(36px, 4vw, 54px)/1.06 var(--bz-font-metric); letter-spacing: -.025em; }
.rewards-story h2 > span { color: var(--bz-purple-100); }
.rewards-story .rewards-lead { color: var(--bz-fg-mid); font-size: clamp(16px, 1.6vw, 19px); line-height: 1.65; max-width: 520px; margin-top: var(--bz-space-5); }
.rewards-promise { display: flex; flex-wrap: wrap; gap: var(--bz-space-6); margin: var(--bz-space-7) 0; }
.rewards-promise > div { display: grid; grid-template-columns: 24px 1fr; gap: 5px 10px; }
.rewards-promise .material-symbols-outlined { grid-row: span 2; color: var(--bz-purple-100); }
.rewards-promise strong { font-size: 15px; font-weight: 500; }
.rewards-promise div > span:last-child { color: var(--bz-fg-mid); font-size: var(--bz-size-caption); }
.rewards-text-link { display: inline-flex; align-items: center; gap: 10px; color: var(--bz-purple-100); font-size: var(--bz-size-caption); font-weight: 500; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: none; }
.rewards-text-link:hover { text-decoration: underline; color: var(--bz-fg); }
.rewards-text-link .material-symbols-outlined { font-size: 18px; }
.rewards-view .rewards-fineprint { font-size: var(--bz-size-caption); line-height: 1.6; color: var(--bz-fg-low); }
.rewards-story > .rewards-fineprint { max-width: 420px; margin-top: var(--bz-space-5); }
.membership-panel { min-width: 0; padding: clamp(20px, 2.5vw, 32px); border: 1px solid var(--bz-border-strong); border-top: 3px solid var(--bz-purple-300); border-radius: var(--bz-r-lg); background: var(--bz-panel); }
.membership-heading h2 { font-size: var(--bz-size-body); font-weight: 500; }
.membership-status { font-size: 11px; color: var(--bz-fg-mid); padding: 5px 8px; border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-pill); text-align: center; }
.membership-status.is-earning { background: var(--bz-success-soft); color: var(--bz-fg); border-color: var(--bz-success); }
.membership-identity { display: flex; justify-content: space-between; align-items: center; padding: var(--bz-space-6) 0; }
.rewards-caption { display: block; color: var(--bz-fg-mid); font-size: var(--bz-size-caption); }
.membership-level { display: block; font-size: 28px; line-height: 1; padding-top: 8px; }
.membership-level > span { font-size: 76px; margin-left: 6px; }
.membership-mark { width: 100px; height: 100px; overflow: visible; }
.membership-mark path { fill: var(--bz-panel); stroke: var(--bz-border-strong); stroke-width: 1.3; }
.membership-mark path.is-active { fill: var(--bz-purple-soft); stroke: var(--bz-purple-100); }
.membership-position { padding-bottom: var(--bz-space-5); border-bottom: 1px solid var(--bz-border); color: var(--bz-fg-mid); font-size: var(--bz-size-caption); }
.membership-position strong { font-size: 24px; color: var(--bz-fg); overflow-wrap: anywhere; text-align: right; }
.membership-entry { padding-top: var(--bz-space-5); }
.membership-entry label { display: block; font-size: var(--bz-size-caption); margin-bottom: 10px; color: var(--bz-fg-mid); }
.stake-input { display: flex; align-items: center; padding: 0 14px; background: var(--bz-canvas); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r); min-width: 0; }
.stake-input:focus-within { outline: 2px solid var(--bz-purple-300); outline-offset: 2px; }
.stake-input input { width: 100%; min-width: 0; height: 52px; border: 0; outline: 0; background: none; color: var(--bz-fg); font: inherit; font-size: 20px; }
.stake-input > span { color: var(--bz-fg-mid); font-size: 12px; }
.stake-preview { min-height: 44px; padding: 10px 0; color: var(--bz-fg-mid) !important; font-size: 12px; line-height: 1.6; }
.stake-preview strong { margin-left: 6px; color: var(--bz-fg); font-size: 17px; }
.stake-primary { width: 100%; justify-content: space-between; min-height: 44px; }
.membership-entry > .rewards-fineprint { margin-top: var(--bz-space-3); }
.rewards-availability { display: flex; gap: 8px; align-items: flex-start; padding-top: 12px; font-size: 12px; color: var(--bz-fg-mid) !important; line-height: 1.5; }
.rewards-availability .material-symbols-outlined { font-size: 18px; flex-shrink: 0; }
.stake-review { display: grid; gap: 10px; border-block: 1px solid var(--bz-border-strong); margin-top: 16px; padding: 16px 0; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.stake-review > div { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.membership-manage { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--bz-border); }
.membership-manage summary { display: flex; justify-content: space-between; cursor: pointer; font-size: 13px; }
.membership-manage p { margin-block: 12px; font-size: 12px; color: var(--bz-fg-mid); }
.membership-manage button { margin-top: 12px; margin-right: 8px; }
.rewards-flow { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; gap: var(--bz-space-5); padding: var(--bz-space-7) 0; border-block: 1px solid var(--bz-border-strong); }
.rewards-flow-title .bz-eyebrow { margin-bottom: 12px; color: var(--bz-fg-low); }
.rewards-flow h2 { font: 900 italic 25px/1.15 var(--bz-font-metric); }
.rewards-flow article { border-left: 1px solid var(--bz-border); padding-left: var(--bz-space-5); }
.rewards-flow article > .material-symbols-outlined { color: var(--bz-purple-100); font-size: 24px; margin-bottom: 12px; }
.rewards-flow h3 { font-size: 15px; font-weight: 500; margin-bottom: 8px; }
.rewards-flow article p { font-size: 13px; color: var(--bz-fg-mid); line-height: 1.65; }
.rewards-levels, .rewards-basket { padding: var(--bz-space-8) 0; scroll-margin-top: 20px; }
.rewards-section-heading { align-items: flex-end; margin-bottom: var(--bz-space-5); }
.rewards-section-heading .bz-eyebrow { color: var(--bz-fg-low); margin-bottom: 10px; }
.rewards-section-heading h2 { font: 900 italic clamp(24px, 2.5vw, 32px)/1.2 var(--bz-font-metric); }
.rewards-section-heading > p { font-size: 13px; color: var(--bz-fg-mid); line-height: 1.65; }
.level-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.level-option { display: flex; flex-direction: column; min-width: 0; padding: 18px 14px; text-align: left; background: var(--bz-panel); color: var(--bz-fg); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r); cursor: pointer; }
.level-option:hover { background: var(--bz-raised); }
.level-option.is-selected { border-color: var(--bz-control-selected-border); box-shadow: inset 0 0 0 1px var(--bz-control-selected-border); background: var(--bz-purple-soft); }
.level-option:disabled { cursor: default; }
.level-option-top { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 25px; }
.level-option-top .bz-metric { font-size: 21px; }
.level-option-top .material-symbols-outlined { font-size: 20px; color: var(--bz-fg-mid); }
.level-threshold { font-size: clamp(23px, 2.3vw, 32px); line-height: 1.1; }
.level-unit, .level-option small { font-size: 11px; color: var(--bz-fg-mid); margin-top: 5px; }
.level-allocation { display: flex; gap: 4px; margin: 20px 0 16px; }
.level-allocation span { height: 4px; flex: 1; background: var(--bz-border-strong); border-radius: 2px; }
.level-allocation span.is-filled { background: var(--bz-purple-100); }
.level-right { font-size: 12px; }
.level-explanation { display: flex; gap: 12px; align-items: flex-start; margin: 22px 0 10px; }
.level-explanation > span { color: var(--bz-purple-100); }
.level-explanation p { color: var(--bz-fg-mid); font-size: 13px; line-height: 1.7; }
.level-explanation strong { color: var(--bz-fg); font-weight: 500; }
.level-explanation > a { flex-shrink: 0; }
.rewards-basket { border-top: 1px solid var(--bz-border-strong); }
.rewards-basket-intro { color: var(--bz-fg-mid) !important; font-size: 14px; line-height: 1.7; max-width: 680px; margin-bottom: 24px !important; }
.basket-welcome { display: flex; gap: 20px; align-items: center; padding: 28px; border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-lg); background: var(--bz-panel); }
.basket-welcome > .material-symbols-outlined { font-size: 34px; color: var(--bz-purple-100); }
.basket-welcome > div { flex: 1; }
.basket-welcome h3 { font-size: 17px; font-weight: 500; margin-bottom: 6px; }
.basket-welcome p { font-size: 13px; color: var(--bz-fg-mid); line-height: 1.6; }
.basket-period, .basket-pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; color: var(--bz-fg-mid); font-size: 12px; padding-bottom: 12px; }
.basket-period > span { flex: 1; }
.basket-currency { display: grid; grid-template-columns: 40px minmax(100px, 1fr) minmax(0, 2fr) auto; gap: 16px; align-items: center; padding: 22px 0; border-top: 1px solid var(--bz-border); }
.currency-icon { display: grid; place-items: center; width: 40px; height: 40px; background: var(--bz-raised); border: 1px solid var(--bz-border); border-radius: 50%; color: var(--bz-purple-100); }
.currency-identity strong { font-size: 15px; overflow-wrap: anywhere; }
.currency-identity small, .currency-value small { display: block; color: var(--bz-fg-mid); font-size: 11px; margin-top: 5px; }
.currency-value { min-width: 0; text-align: right; }
.basket-amount { overflow-wrap: anywhere; font-size: 25px; line-height: 1.2; }
.basket-error { color: var(--bz-danger) !important; overflow-wrap: anywhere; font-size: 13px; line-height: 1.6; margin-top: 12px !important; }
.rewards-success { color: var(--bz-fg) !important; border-left: 3px solid var(--bz-success); padding-left: 10px; margin-top: 12px !important; font-size: 13px; }
.basket-empty { padding: 30px 0; color: var(--bz-fg-mid) !important; }
.basket-pagination { justify-content: flex-end; padding-top: 16px; }
.basket-footnotes { display: grid; gap: 10px; margin-top: 22px; }
.basket-footnotes p { display: flex; gap: 9px; font-size: 12px; color: var(--bz-fg-low); line-height: 1.6; }
.basket-footnotes .material-symbols-outlined { font-size: 17px; flex-shrink: 0; }
.rewards-legacy { padding-top: 20px; border-top: 1px solid var(--bz-border); }
.rewards-legacy > summary { cursor: pointer; color: var(--bz-fg-mid); margin-bottom: 16px; font-size: 13px; }
.rewards-view button:focus-visible, .rewards-view a:focus-visible, .rewards-view summary:focus-visible { outline: 2px solid var(--bz-purple-100); outline-offset: 4px; }
@media (max-width: 1150px) { .level-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .rewards-flow { grid-template-columns: repeat(3, minmax(0, 1fr)); } .rewards-flow-title { grid-column: 1/-1; } .rewards-flow article:first-of-type { padding-left: 0; border-left: 0; } }
@media (max-width: 850px) { .rewards-hero { grid-template-columns: 1fr; gap: 28px; } .membership-panel { width: 100%; } .rewards-section-heading { flex-wrap: wrap; align-items: center; } .rewards-promise { margin: 24px 0; } .rewards-story h2 { font-size: 40px; } }
@media (max-width: 550px) { .rewards-content { padding: 20px 16px; } .rewards-topline { align-items: flex-start; flex-direction: column; gap: 10px; } .rewards-hero { padding-top: 28px; } .rewards-story h2 { font-size: 36px; } .level-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .rewards-flow { grid-template-columns: 1fr; gap: 20px; } .rewards-flow article { border-left: 0; border-top: 1px solid var(--bz-border); padding: 18px 0 0; } .basket-currency { grid-template-columns: 32px minmax(0, 1fr); gap: 12px; } .currency-icon { width: 32px; height: 32px; font-size: 19px; } .currency-value, .basket-currency > button { grid-column: 2; text-align: left; justify-self: start; max-width: 100%; } .basket-amount { font-size: 23px; } .basket-welcome { flex-wrap: wrap; padding: 20px; gap: 12px; } .basket-welcome > div { flex-basis: calc(100% - 50px); } .basket-welcome > button { margin-left: 46px; } .membership-heading { gap: 8px; } .membership-heading h2 { font-size: 15px; } }
@media (prefers-reduced-motion: reduce) { .rewards-view { scroll-behavior: auto; } }
@media (max-width: 700px) { .level-explanation { flex-wrap: wrap; } .level-explanation p { flex: 1; min-width: 180px; } .level-explanation > a { margin-left: 36px; } }

.rewards-content { max-width: none; padding: clamp(20px, 2.5vw, 36px); }
.rewards-hero { padding: 36px 0; gap: clamp(24px, 4vw, 56px); align-items: start; }
.rewards-story { padding-top: 16px; }
.rewards-story h2 { font-size: clamp(34px, 3.4vw, 48px); line-height: 1.12; letter-spacing: normal; }
.membership-panel { padding: 28px; }
@media(max-width:550px) { .membership-panel { padding:20px; } .rewards-content { padding:20px 16px; } }
</style>
