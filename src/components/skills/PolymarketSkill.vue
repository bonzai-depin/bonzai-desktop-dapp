<template>
  <div class="polymarket-skill">
    <!-- Skill Header -->
    <div class="models__activity--payouts mb-4 has-text-left">
      <div class="columns is-vcentered">
        <div class="column">
          <h3 class="skill-name is-size-1 fira-sans-condensed-black-italic">
            <span
              class="material-symbols-outlined mr-2"
              style="font-size: 48px; color: var(--bulma-primary)"
            >
              finance_mode
            </span>
            {{ skill?.name || 'Polymarket Top Performers' }}
          </h3>
          <p class="skill-description is-size-5 mt-3">
            {{ skill?.description || 'Analyze top PnL traders and find positions where multiple winners agree.' }}
          </p>
        </div>
      </div>
    </div>

    <div
      class="models__activity--payouts pt-5 pb-5"
      style="position: relative; bottom: -40px; z-index: 11"
    >
      <!-- Category Selector -->
      <div class="columns">
        <div class="column is-12">
          <div class="control category-selector polymarket-category">
            <template v-for="cat in categories" :key="cat.key">
              <input
                type="radio"
                name="polymarket_category_selector"
                :id="'pmcat_' + cat.key"
                :value="cat.key"
                :checked="selectedCategory === cat.key"
                :disabled="isAnalyzing"
                @change="selectCategoryAndAnalyze(cat.key)"
              />
              <label
                :for="'pmcat_' + cat.key"
                class="radio"
                :class="{
                  'is-loading': isAnalyzing && selectedCategory === cat.key,
                }"
              >
                <span
                  v-if="isAnalyzing && selectedCategory === cat.key"
                  class="material-symbols-outlined rotating mr-1"
                  style="font-size: 18px !important"
                >
                  progress_activity
                </span>
                {{ cat.label }}
              </label>
            </template>
          </div>
        </div>
      </div>

      <!-- Time Period Selector -->
      <div class="columns">
        <div class="column is-6">
          <h2 class="fira-sans-condensed-black-italic is-size-5 has-text-white has-text-left mb-4">
            Timeframe
          </h2>
          <div class="control timeperiod-selector">
            <template v-for="period in periods" :key="period.key">
              <input
                type="radio"
                name="timeperiod_selector"
                :id="'timeperiod_' + period.key"
                :value="period.key"
                :checked="selectedTimePeriod === period.key"
                :disabled="isAnalyzing"
                @change="selectTimePeriodAndAnalyze(period.key)"
              />
              <label
                :for="'timeperiod_' + period.key"
                class="radio"
                :class="{
                  'is-loading': isAnalyzing && selectedTimePeriod === period.key,
                }"
              >
                <span
                  v-if="isAnalyzing && selectedTimePeriod === period.key"
                  class="material-symbols-outlined rotating mr-1"
                  style="font-size: 18px !important"
                >
                  progress_activity
                </span>
                {{ period.label }}
              </label>
            </template>
          </div>
        </div>
        <div class="column is-6">
          <!-- Min Conviction Selector -->
          <h2 class="fira-sans-condensed-black-italic is-size-5 has-text-white has-text-left mb-4">
            Consensus
          </h2>
          <div class="control conviction-selector">
            <template v-for="level in convictionLevels" :key="level.key">
              <input
                type="radio"
                name="conviction_selector"
                :id="'conviction_' + level.key"
                :value="level.key"
                :checked="selectedConviction === level.key"
                :disabled="isAnalyzing"
                @change="selectConvictionAndAnalyze(level.key)"
              />
              <label
                :for="'conviction_' + level.key"
                class="radio"
                :class="{
                  'is-loading': isAnalyzing && selectedConviction === level.key,
                }"
              >
                <span
                  v-if="isAnalyzing && selectedConviction === level.key"
                  class="material-symbols-outlined rotating mr-1"
                  style="font-size: 18px !important"
                >
                  progress_activity
                </span>
                {{ level.label }}
              </label>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Whale Pulse — live feed of recent large positions from top traders.
         Auto-refreshes every 30s while visible. Click any row to jump to
         that market card below. -->
    <div
      v-if="whalePulse.length > 0 || isLoadingPulse"
      class="models__activity--payouts mt-5 mb-4 has-text-left"
    >
      <h4 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-3">
        <span class="material-symbols-outlined is-size-2 mr-2" style="color: var(--bulma-warning)">
          water_drop
        </span>
        Whale Pulse
        <span class="is-size-7 has-text-grey-light ml-2">
          <span
            class="material-symbols-outlined"
            :class="{ rotating: isLoadingPulse }"
            style="font-size: 14px; vertical-align: middle"
          >autorenew</span>
          auto-refreshes every 30s
        </span>
      </h4>
      <div v-if="whalePulse.length === 0 && isLoadingPulse" class="has-text-grey-light is-size-7">
        Scanning top traders for new positions…
      </div>
      <div v-else class="whale-pulse-feed">
        <div
          v-for="(pulse, pIdx) in whalePulse.slice(0, 8)"
          :key="pIdx"
          class="whale-pulse-row"
        >
          <span class="tag is-warning fira-sans-condensed-black-italic">
            #{{ pulse.rank }}
          </span>
          <span class="whale-pulse-question">{{ pulse.question }}</span>
          <span class="tag is-info">
            {{ pulse.outcome }} @ {{ (pulse.price * 100).toFixed(0) }}%
          </span>
          <span class="tag is-success">
            ${{ formatNumber(pulse.size) }}
          </span>
          <span class="is-size-7 has-text-grey-light ml-2">
            {{ formatRelativeTime(pulse.seenAt) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Analysis Results -->
    <div v-if="analysisHistory.length > 0" class="analysis-history">
      <div
        v-for="(analysis, idx) in analysisHistory"
        :key="idx"
        class="models__activity--payouts mb-5"
      >
        <div v-if="analysis.error" class="notification is-danger">
          <p>{{ analysis.error }}</p>
        </div>

        <!-- Top Traders Panel -->
        <div
          v-if="analysis.topTraders && analysis.topTraders.length > 0"
          class="top-traders-panel mt-5 mb-5 pt-1"
        >
          <h4 class="fira-sans-condensed-black-italic is-size-2 has-text-white mb-3 has-text-left mt-5">
            <span class="material-symbols-outlined is-size-1 mr-2">
              leaderboard
            </span>
            Leaderboard
          </h4>
          <div class="top-traders-tags columns is-multiline">
            <div
              v-for="(trader, tIdx) in analysis.topTraders.slice(0, 10)"
              :key="tIdx"
              class="tags has-addons mt-5 mb-5 column is-6 has-text-left"
            >
              <span class="tag is-warning is-large fira-sans-condensed-black-italic m-0">
                #{{ trader.rank }}
              </span>
              <span class="tag is-dark is-large fira-sans-condensed-black-italic m-0">
                {{ trader.proxyWallet
                  ? trader.proxyWallet.slice(0, 6) + '...' + trader.proxyWallet.slice(-4)
                  : 'Unknown' }}
              </span>
              <span class="tag is-success is-large fira-sans-condensed-black-italic m-0">
                ${{ formatNumber(trader.pnl) }}
              </span>
            </div>
          </div>
        </div>

        <hr />

        <!-- Conviction Recommendations -->
        <div
          v-if="analysis.recommendations && analysis.recommendations.length > 0"
          class="has-text-left pt-3"
        >
          <h4 class="fira-sans-condensed-black-italic is-size-2 has-text-brand mt-5 mb-5">
            <span class="material-symbols-outlined is-size-1 mr-1">
              diamond
            </span>
            High Conviction Positions
          </h4>

          <div
            v-for="(rec, rIdx) in analysis.recommendations"
            :key="rIdx"
            class="market-card mt-5 mb-5 p-5"
          >
            <div class="market-question">
              <span class="material-symbols-outlined is-size-4 mr-2 has-text-white">
                help_outline
              </span>
              <strong class="has-text-white is-size-4">
                {{ rec.question }}
              </strong>
            </div>

            <hr class="m-5" />

            <div class="conviction-info mt-5 mb-5">
              <div class="tags has-addons">
                <span class="tag is-brand is-large fira-sans-condensed-black-italic">
                  {{ (rec.market.currentPrice * 100).toFixed(0) }}% {{ rec.outcome }}
                </span>
                <span class="tag is-light is-large fira-sans-condensed-black-italic">
                  {{ rec.conviction.traderCount }} TOP PERFORMER<span v-if="rec.conviction.traderCount > 1">S</span>
                  &nbsp;AGREE<span v-if="rec.conviction.traderCount === 1">S</span>
                  &nbsp;FOR
                </span>
                <span class="tag is-success is-large fira-sans-condensed-black-italic">
                  ${{ formatNumber(rec.conviction.totalSize) }}
                </span>
              </div>
              <!-- YES/NO price bar — visualizes market conviction at a glance. -->
              <div class="price-bar mt-3">
                <div
                  class="price-bar-yes"
                  :style="{ width: (rec.market.currentPrice * 100).toFixed(1) + '%' }"
                >
                  <span class="price-bar-label">
                    {{ rec.outcome }} {{ (rec.market.currentPrice * 100).toFixed(0) }}¢
                  </span>
                </div>
                <div
                  class="price-bar-no"
                  :style="{ width: ((1 - rec.market.currentPrice) * 100).toFixed(1) + '%' }"
                >
                  <span class="price-bar-label">
                    {{ rec.outcome === 'YES' ? 'NO' : 'YES' }} {{ ((1 - rec.market.currentPrice) * 100).toFixed(0) }}¢
                  </span>
                </div>
              </div>
              <div class="is-size-7 has-text-grey-light mt-2">
                Suggested copy: <strong>${{ formatNumber(rec.conviction.totalSize * 0.1 / rec.conviction.traderCount) }}</strong>
                (10% of avg whale size)
              </div>
            </div>

            <!-- Traders holding this position -->
            <div
              v-if="rec.traders && rec.traders.length > 0"
              class="traders-holding mt-5 pt-5"
            >
              <div
                v-for="(t, tIdx) in rec.traders"
                :key="tIdx"
                class="tags has-addons mr-2"
                style="display: inline-flex"
              >
                <span class="tag is-warning fira-sans-condensed-black-italic">
                  #{{ t.rank }}
                </span>
                <span class="tag is-dark fira-sans-condensed-black-italic">
                  {{ t.proxyWallet
                    ? t.proxyWallet.slice(0, 6) + '...' + t.proxyWallet.slice(-4)
                    : t.userName }}
                </span>
                <span class="tag is-success fira-sans-condensed-black-italic">
                  ${{ formatNumber(t.size) }}
                </span>
              </div>
            </div>

            <hr class="m-5" />

            <div class="rec-action mt-3 p-0 mb-5">
              <button
                class="button is-info is-medium fira-sans-condensed-black-italic mr-5"
                @click="generateInvestmentThesis(idx, rIdx, rec)"
                :disabled="getThesis(idx, rIdx)?.loading || !modelAvailable"
              >
                <span
                  v-if="getThesis(idx, rIdx)?.loading"
                  class="material-symbols-outlined rotating mr-1"
                >
                  progress_activity
                </span>
                <span v-else class="material-symbols-outlined mr-1">
                  auto_awesome
                </span>
                {{ getThesis(idx, rIdx)?.loading ? 'Generating...' : 'Investment Thesis' }}
              </button>
              <button
                class="button is-warning is-medium fira-sans-condensed-black-italic"
                @click="openMarket(rec.slug)"
              >
                <span class="material-symbols-outlined mr-1">open_in_new</span>
                Open Market
              </button>
            </div>

            <!-- Investment Thesis -->
            <div
              v-if="getThesis(idx, rIdx)?.content"
              class="investment-thesis mt-4 p-4"
              style="background: rgba(0, 0, 0, 0.3); border-radius: 8px;"
            >
              <h5 class="fira-sans-condensed-black-italic has-text-white mb-3">
                <span class="material-symbols-outlined mr-1">psychology</span>
                AI Investment Thesis
              </h5>
              <VueMarkdown
                :source="getThesis(idx, rIdx).content"
                class="thesis-content has-text-white"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import VueMarkdown from 'vue-markdown-render';
import polymarketAgent from '../polymarketAgent.js';
import { hasPurchasedSkill, isDevMode } from '../../services/agent.service.js';

const SKILL_ID = 'polymarket-top-performers-v1.0.0';
const WHALE_PULSE_INTERVAL_MS = 30_000;
const WHALE_PULSE_MIN_SIZE = 5_000;  // only flag positions ≥ $5k

export default {
  name: 'PolymarketSkill',
  components: { VueMarkdown },
  props: {
    skill: {
      type: Object,
      default: null,
    },
    modelAvailable: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['analyzing'],
  setup(props, { emit }) {
    // State
    const isAnalyzing = ref(false);
    const selectedCategory = ref('OVERALL');
    const selectedTimePeriod = ref('WEEK');
    const selectedConviction = ref(2);
    const analysisHistory = ref([]);
    const investmentTheses = reactive({});

    // Whale pulse — recent large positions from top traders.
    const whalePulse = ref([]);
    const isLoadingPulse = ref(false);
    const seenPositions = new Set();
    let pulseTimer = null;

    // Configuration
    const categories = polymarketAgent.categories;
    const periods = [
      { key: 'DAY', label: '24H' },
      { key: 'WEEK', label: '7D' },
      { key: 'MONTH', label: '30D' },
    ];
    const convictionLevels = [
      { key: 2, label: '2+' },
      { key: 3, label: '3+' },
      { key: 5, label: '5+' },
      { key: 7, label: '7+' },
      { key: 10, label: '10+' },
    ];

    // Methods
    const formatNumber = (num) => {
      if (num === null || num === undefined) return '0';
      if (Math.abs(num) >= 1_000_000) {
        return (num / 1_000_000).toFixed(1) + 'M';
      }
      if (Math.abs(num) >= 1_000) {
        return (num / 1_000).toFixed(1) + 'K';
      }
      return num.toFixed(2);
    };

    const selectCategoryAndAnalyze = (category) => {
      selectedCategory.value = category;
      runAnalysis();
    };

    const selectTimePeriodAndAnalyze = (period) => {
      selectedTimePeriod.value = period;
      runAnalysis();
    };

    const selectConvictionAndAnalyze = (level) => {
      selectedConviction.value = level;
      runAnalysis();
    };

    const runAnalysis = async () => {
      // Purchase gate: SmartAgent also shows a preview screen, but this
      // guards programmatic calls (console, extensions) that bypass the UI.
      if (!isDevMode() && !(await hasPurchasedSkill(SKILL_ID))) {
        console.warn('[Polymarket] Skill not purchased — execution blocked.');
        return;
      }
      isAnalyzing.value = true;
      emit('analyzing', true);
      Object.keys(investmentTheses).forEach((k) => delete investmentTheses[k]);

      const selectedCat = categories.find((c) => c.key === selectedCategory.value);

      try {
        const results = await polymarketAgent.execute(
          {
            numTraders: 10,
            timePeriod: selectedTimePeriod.value,
            category: selectedCategory.value,
            minConviction: selectedConviction.value,
            copyFraction: 0.1,
          },
          {}
        );

        analysisHistory.value = [
          {
            ...results,
            meta: {
              ...results.meta,
              categoryLabel: selectedCat?.label || selectedCategory.value,
              timePeriod: selectedTimePeriod.value,
              category: selectedCategory.value,
              minConviction: selectedConviction.value,
            },
          },
        ];
      } catch (e) {
        console.error('[PolymarketSkill] Analysis error:', e);
        analysisHistory.value = [{ error: e.message }];
      } finally {
        isAnalyzing.value = false;
        emit('analyzing', false);
      }
    };

    const generateInvestmentThesis = async (analysisIdx, recIdx, rec) => {
      const key = `${analysisIdx}-${recIdx}`;
      investmentTheses[key] = {
        loading: true,
        content: null,
      };

      const prompt = `You are a sophisticated financial analyst. Generate a concise investment thesis for this prediction market position:

Question: ${rec.question}
Position: ${rec.outcome}
Current Price: ${(rec.market.currentPrice * 100).toFixed(0)}%
Conviction: ${rec.conviction.traderCount} top traders agree, total size $${formatNumber(rec.conviction.totalSize)}

Provide a brief (2-3 paragraphs) thesis covering:
1. Why this position might be undervalued or well-positioned
2. Key risks to consider
3. A clear recommendation

Be direct and analytical.`;

      try {
        if (window.electronAPI?.chat) {
          const response = await window.electronAPI.chat(prompt);
          investmentTheses[key] = {
            loading: false,
            content: response,
          };
        } else {
          throw new Error('LLM not available');
        }
      } catch (e) {
        investmentTheses[key] = {
          loading: false,
          content: `Error generating thesis: ${e.message}`,
        };
      }
    };

    const getThesis = (analysisIdx, recIdx) => {
      return investmentTheses[`${analysisIdx}-${recIdx}`];
    };

    const openMarket = (slug) => {
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(`https://polymarket.com/event/${slug}`);
      }
    };

    // ─── Whale Pulse polling ─────────────────────────────────────────────
    // Re-uses the polymarket fetchTool pipeline via the agent's execute()
    // layer. Pulls top-10 traders for the current timeframe + fetches their
    // recent positions; anything new (unseen in this session) that's > size
    // threshold becomes a "pulse" entry.
    // Uses the same Electron-side polymarket proxy the main agent already uses.
    // Keeps params tight so we don't hammer the API from this skill alone.
    const fetchViaProxy = async (endpoint, params = {}) => {
      if (!window.polymarketProxy?.fetch) return null;
      return window.polymarketProxy.fetch(endpoint, params);
    };

    const pollWhalePulse = async () => {
      if (isLoadingPulse.value) return;
      if (!isDevMode() && !(await hasPurchasedSkill(SKILL_ID))) return;
      isLoadingPulse.value = true;
      try {
        const leaderboard = await fetchViaProxy('leaderboard', {
          category: 'OVERALL', timePeriod: 'DAY', orderBy: 'PNL', limit: 10,
        });
        if (!Array.isArray(leaderboard) || leaderboard.length === 0) return;

        const newPulses = [];
        for (const trader of leaderboard.slice(0, 5)) {
          if (!trader?.proxyWallet) continue;
          try {
            const positions = await fetchViaProxy('positions', {
              user: trader.proxyWallet,
              sizeThreshold: WHALE_PULSE_MIN_SIZE,
              limit: 10,
              sortBy: 'CURRENT',
            });
            for (const pos of positions || []) {
              const sig = `${trader.proxyWallet}:${pos.conditionId || pos.title}:${pos.outcome}:${pos.size}`;
              if (seenPositions.has(sig)) continue;
              seenPositions.add(sig);
              newPulses.push({
                rank: trader.rank,
                wallet: trader.proxyWallet,
                question: pos.title || '(unknown market)',
                outcome: pos.outcome,
                size: pos.size,
                price: pos.price || pos.currentPrice || 0.5,
                seenAt: Date.now(),
                slug: pos.slug || null,
              });
            }
          } catch { /* per-trader failure is fine */ }
        }
        whalePulse.value = [...newPulses, ...whalePulse.value].slice(0, 40);
      } catch (e) {
        console.warn('[Polymarket] Whale pulse poll failed:', e?.message);
      } finally {
        isLoadingPulse.value = false;
      }
    };

    const formatRelativeTime = (ts) => {
      const delta = (Date.now() - ts) / 1000;
      if (delta < 60) return 'just now';
      if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
      return `${Math.floor(delta / 3600)}h ago`;
    };

    onMounted(() => {
      runAnalysis();
      // First pulse shortly after mount to populate the feed; then interval.
      setTimeout(pollWhalePulse, 3000);
      pulseTimer = setInterval(pollWhalePulse, WHALE_PULSE_INTERVAL_MS);
    });

    onBeforeUnmount(() => {
      if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
    });

    return {
      isAnalyzing,
      selectedCategory,
      selectedTimePeriod,
      selectedConviction,
      analysisHistory,
      categories,
      periods,
      convictionLevels,
      whalePulse,
      isLoadingPulse,
      formatNumber,
      formatRelativeTime,
      selectCategoryAndAnalyze,
      selectTimePeriodAndAnalyze,
      selectConvictionAndAnalyze,
      generateInvestmentThesis,
      getThesis,
      openMarket,
    };
  },
};
</script>

<style scoped>
.polymarket-skill {
  width: 100%;
}

.polymarket-category {
  font-size: 12px;
  display: flex;
  flex-wrap: nowrap;
}

.polymarket-category .radio {
  flex: 1;
  text-align: center;
  justify-content: center;
}

.timeperiod-selector,
.conviction-selector {
  font-size: 12px;
  display: flex;
  flex-wrap: nowrap;
}

.timeperiod-selector .radio,
.conviction-selector .radio {
  flex: 1;
  text-align: center;
  justify-content: center;
}

.category-selector input[type='radio'],
.timeperiod-selector input[type='radio'],
.conviction-selector input[type='radio'] {
  display: none;
}

.category-selector .radio,
.timeperiod-selector .radio,
.conviction-selector .radio {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.3);
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-selector .radio:hover,
.timeperiod-selector .radio:hover,
.conviction-selector .radio:hover {
  background: rgba(255, 255, 255, 0.1);
}

.category-selector input[type='radio']:checked + .radio,
.timeperiod-selector input[type='radio']:checked + .radio,
.conviction-selector input[type='radio']:checked + .radio {
  background: var(--bulma-primary);
  border-color: var(--bulma-primary);
}

.market-card {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.thesis-content :deep(p) {
  margin-bottom: 1rem;
}

.thesis-content :deep(ul),
.thesis-content :deep(ol) {
  margin-left: 1.5rem;
  margin-bottom: 1rem;
}

.thesis-content :deep(li) {
  margin-bottom: 0.5rem;
}

.models__activity--payouts {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}

.skill-name {
  font-size: 1.5rem;
  margin: 0;
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

.has-text-brand {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

.skill-description {
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 0.5em;
  text-align: left;
}

/* Whale pulse feed — compact live rows of recent large positions. */
.whale-pulse-feed {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.whale-pulse-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid var(--bulma-warning);
  border-radius: 4px;
  font-size: 13px;
}
.whale-pulse-question {
  flex: 1;
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* YES/NO price bar — horizontal split that visualizes market conviction. */
.price-bar {
  display: flex;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.price-bar-yes,
.price-bar-no {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.3s ease;
  color: white;
  font-weight: 700;
  font-size: 12px;
}
.price-bar-yes {
  background: linear-gradient(90deg, #2cbb5d, #54d17b);
}
.price-bar-no {
  background: linear-gradient(90deg, #d1534c, #e67a73);
}
.price-bar-label {
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
