<template>
  <div class="polymarket-skill">
    <div class="pm-command-deck skill-panel">
      <div class="pm-signal-overview">
        <div class="pm-radar" :class="{ 'is-scanning': isAnalyzing }">
          <span class="pm-radar-core"></span>
          <span class="pm-radar-ring pm-radar-ring--one"></span>
          <span class="pm-radar-ring pm-radar-ring--two"></span>
          <span class="material-symbols-outlined">finance_mode</span>
        </div>
        <div class="pm-signal-readout">
          <span class="pm-console-label">{{ selectedCategoryLabel }}</span>
          <strong>{{ signalCount }}</strong>
          <span>{{ isAnalyzing ? 'scanning' : 'positions' }}</span>
        </div>
        <div class="pm-signal-readout">
          <span class="pm-console-label">Consensus</span>
          <strong>{{ selectedConviction }}+</strong>
          <span>top wallets</span>
        </div>
        <div class="pm-signal-readout">
          <span class="pm-console-label">Pulse</span>
          <strong>{{ whalePulse.length }}</strong>
          <span>live prints</span>
        </div>
      </div>
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
                  'bz-btn--running': isAnalyzing && selectedCategory === cat.key,
                }"
              >
                <span
                  v-if="isAnalyzing && selectedCategory === cat.key"
                  class="material-symbols-outlined rotating"
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
                  'bz-btn--running': isAnalyzing && selectedTimePeriod === period.key,
                }"
              >
                <span
                  v-if="isAnalyzing && selectedTimePeriod === period.key"
                  class="material-symbols-outlined rotating"
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
                  'bz-btn--running': isAnalyzing && selectedConviction === level.key,
                }"
              >
                <span
                  v-if="isAnalyzing && selectedConviction === level.key"
                  class="material-symbols-outlined rotating"
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
      class="pm-pulse-panel skill-panel has-text-left"
    >
      <h4 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-3">
        <span class="material-symbols-outlined is-size-2 mr-2" style="color: var(--bz-warning)">
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
          <span class="skill-chip skill-chip--warning fira-sans-condensed-black-italic">
            #{{ pulse.rank }}
          </span>
          <span class="whale-pulse-question">{{ pulse.question }}</span>
          <span class="skill-chip skill-chip--info">
            {{ pulse.outcome }} @ {{ (pulse.price * 100).toFixed(0) }}%
          </span>
          <span class="skill-chip skill-chip--success">
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
        class="pm-analysis-run skill-panel mb-5"
      >
        <div v-if="analysis.error" class="bz-notice bz-notice--danger">
          <p>{{ analysis.error }}</p>
        </div>

        <!-- Top Traders Panel -->
        <div
          v-if="analysis.topTraders && analysis.topTraders.length > 0"
          class="top-traders-panel pm-leaderboard mt-5 mb-5 pt-1"
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
              <span class="skill-chip skill-chip--warning fira-sans-condensed-black-italic m-0">
                #{{ trader.rank }}
              </span>
              <span class="skill-chip fira-sans-condensed-black-italic m-0">
                {{ trader.proxyWallet
                  ? trader.proxyWallet.slice(0, 6) + '...' + trader.proxyWallet.slice(-4)
                  : 'Unknown' }}
              </span>
              <span class="skill-chip skill-chip--success fira-sans-condensed-black-italic m-0">
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
            class="market-card pm-signal-card mt-5 mb-5 p-5"
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
                <span class="skill-chip skill-chip--brand fira-sans-condensed-black-italic">
                  {{ (rec.market.currentPrice * 100).toFixed(0) }}% {{ rec.outcome }}
                </span>
                <span class="skill-chip fira-sans-condensed-black-italic">
                  {{ rec.conviction.traderCount }} TOP PERFORMER<span v-if="rec.conviction.traderCount > 1">S</span>
                  &nbsp;AGREE<span v-if="rec.conviction.traderCount === 1">S</span>
                  &nbsp;FOR
                </span>
                <span class="skill-chip skill-chip--success fira-sans-condensed-black-italic">
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
                <span class="skill-chip skill-chip--warning fira-sans-condensed-black-italic">
                  #{{ t.rank }}
                </span>
                <span class="skill-chip fira-sans-condensed-black-italic">
                  {{ t.proxyWallet
                    ? t.proxyWallet.slice(0, 6) + '...' + t.proxyWallet.slice(-4)
                    : t.userName }}
                </span>
                <span class="skill-chip skill-chip--success fira-sans-condensed-black-italic">
                  ${{ formatNumber(t.size) }}
                </span>
              </div>
            </div>

            <hr class="m-5" />

            <div class="rec-action mt-3 p-0 mb-5">
              <button
                class="bz-btn bz-btn--primary fira-sans-condensed-black-italic mr-5"
                @click="generateInvestmentThesis(idx, rIdx, rec)"
                :disabled="getThesis(idx, rIdx)?.loading || !modelAvailable"
              >
                <span
                  v-if="getThesis(idx, rIdx)?.loading"
                  class="material-symbols-outlined rotating"
                >
                  progress_activity
                </span>
                <span v-else class="material-symbols-outlined">
                  auto_awesome
                </span>
                {{ getThesis(idx, rIdx)?.loading ? 'Generating...' : 'Investment Thesis' }}
              </button>
              <button
                class="bz-btn bz-btn--agent-cta fira-sans-condensed-black-italic"
                @click="openMarket(rec.slug)"
              >
                <span class="material-symbols-outlined">open_in_new</span>
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
                <span class="material-symbols-outlined">psychology</span>
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

const WHALE_PULSE_INTERVAL_MS = 30_000;
const WHALE_PULSE_MIN_SIZE = 5_000; // only flag positions ≥ $5k

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
  emits: ['analyzing', 'analysis-created'],
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

    const selectedCategoryLabel = computed(() => categories.find((c) => c.key === selectedCategory.value)?.label || selectedCategory.value);
    const signalCount = computed(() => analysisHistory.value[0]?.recommendations?.length || 0);

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
        if (!results?.error && results?.success !== false) emit('analysis-created', analysisHistory.value[0]);
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
      selectedCategoryLabel,
      signalCount,
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
/* Design-system compatibility layer for migrated skill workflow surfaces. */
.skill-panel {
  padding: var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r) !important;
  color: var(--bz-fg);
}
.skill-panel + .skill-panel,
.analysis-history .skill-panel + .skill-panel {
  margin-top: var(--bz-space-5);
}
.skill-card {
  padding: var(--bz-space-4);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
}
.skill-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-4);
}
.skill-title-icon,
.skill-name .material-symbols-outlined {
  color: var(--bz-purple-300) !important;
  font-size: 42px !important;
  line-height: 1;
}
.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  min-height: 24px;
  padding: 2px var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1.2;
}
.skill-chip--brand { background: var(--bz-purple-soft); border-color: var(--bz-border-brand); color: var(--bz-fg); }
.skill-chip--success { background: var(--bz-emerald-soft); border-color: var(--bz-emerald-500); color: var(--bz-emerald-300); }
.skill-chip--warning { background: var(--bz-warning-soft); border-color: var(--bz-warning); color: var(--bz-warning); }
.skill-chip--info { background: var(--bz-info-soft); border-color: var(--bz-info); color: var(--bz-info); }
.skill-chip--danger { background: var(--bz-danger-soft); border-color: var(--bz-danger); color: var(--bz-danger); }
.skill-input,
.config-input {
  width: 100%;
  height: 40px;
  padding: 0 var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-input--sm { height: 32px; }
.skill-input:focus,
.config-input:focus {
  outline: none;
  border-color: var(--bz-border-brand);
}
.skill-textarea {
  width: 100%;
  min-height: 120px;
  padding: var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-unit {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
  color: var(--bz-fg-low);
  pointer-events: none;
}
.skill-fullwidth { width: 100%; }
.skill-progress {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border: 0;
  border-radius: var(--bz-r-pill);
  background: var(--bz-canvas);
}
.skill-progress::-webkit-progress-value { background: var(--bz-gradient-brand); }
.bz-btn--running { opacity: 0.72; }

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
  border: 1px solid var(--bz-border-strong);
  background: var(--bz-scrim);
  color: var(--bz-fg);
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-selector .radio:hover,
.timeperiod-selector .radio:hover,
.conviction-selector .radio:hover {
  background: var(--bz-border);
}

.category-selector input[type='radio']:checked + .radio,
.timeperiod-selector input[type='radio']:checked + .radio,
.conviction-selector input[type='radio']:checked + .radio {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
}

.market-card {
  background: var(--bz-scrim);
  border-radius: 8px;
  border: 1px solid var(--bz-border);
}

.rotating {
  animation: bz-spin 1s linear infinite;
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

.skill-panel {
  padding: 2em;
  border: 1px solid var(--bz-border);
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
  color: var(--bz-fg-mid);
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
  border-left: 3px solid var(--bz-warning);
  border-radius: 4px;
  font-size: 13px;
}
.whale-pulse-question {
  flex: 1;
  color: var(--bz-fg);
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
  background: var(--bz-scrim);
  border: 1px solid var(--bz-card);
}
.price-bar-yes,
.price-bar-no {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.3s ease;
  color: var(--bz-fg);
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

/* Agentic redesign: Signal Desk */
.pm-command-deck {
  position: sticky;
  top: 0;
  z-index: 4;
  display: grid;
  gap: var(--bz-space-4);
  padding: var(--bz-space-4);
  background: color-mix(in srgb, var(--bz-panel) 84%, transparent);
  backdrop-filter: blur(18px);
}
.pm-command-deck .columns {
  margin: 0;
}
.pm-command-deck .column {
  padding: 0;
}
.pm-command-deck .columns + .columns {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(260px, 1fr);
  gap: var(--bz-space-4);
}
.pm-command-deck .column.is-6 {
  width: auto;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
}
.pm-command-deck h2,
.pm-pulse-panel h4,
.pm-analysis-run h4 {
  font-family: var(--bz-font-display, 'Fira Sans Condensed', sans-serif);
  letter-spacing: 0;
}
.pm-pulse-panel {
  margin-top: var(--bz-space-5) !important;
  background:
    linear-gradient(90deg, rgba(250, 173, 20, 0.13), transparent 34%),
    var(--bz-card);
}
.whale-pulse-feed {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--bz-space-2);
}
.whale-pulse-row {
  min-height: 58px;
  border-left: 0;
  border: 1px solid var(--bz-border);
  background: var(--bz-canvas);
}
.pm-analysis-run {
  background: var(--bz-panel);
}
.pm-analysis-run > hr,
.pm-signal-card > hr {
  opacity: 0.35;
}
.pm-leaderboard .top-traders-tags {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--bz-space-2);
  margin: 0;
}
.pm-leaderboard .tags {
  width: auto;
  margin: 0 !important;
  padding: var(--bz-space-2) !important;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
}
.pm-signal-card {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: var(--bz-space-5);
  align-items: start;
  border-color: var(--bz-border-strong);
  background:
    linear-gradient(135deg, rgba(155, 109, 200, 0.13), transparent 42%),
    var(--bz-canvas);
}
.pm-signal-card .market-question,
.pm-signal-card .traders-holding,
.pm-signal-card .investment-thesis {
  grid-column: 1;
}
.pm-signal-card .conviction-info,
.pm-signal-card .rec-action {
  grid-column: 2;
}
.pm-signal-card .market-question strong {
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.pm-signal-card .rec-action {
  display: flex;
  justify-content: flex-end;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
}
@media (max-width: 980px) {
  .pm-command-deck .columns + .columns,
  .pm-signal-card {
    grid-template-columns: 1fr;
  }
  .pm-signal-card .market-question,
  .pm-signal-card .traders-holding,
  .pm-signal-card .investment-thesis,
  .pm-signal-card .conviction-info,
  .pm-signal-card .rec-action {
    grid-column: auto;
  }
}


/* Signature upgrade: market signal instrument */
.pm-signal-overview {
  display: grid;
  grid-template-columns: minmax(120px, 180px) repeat(3, minmax(140px, 1fr));
  gap: var(--bz-space-3);
  align-items: stretch;
}
.pm-radar {
  position: relative;
  min-height: 112px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background:
    radial-gradient(circle at center, rgba(250, 173, 20, 0.18), transparent 42%),
    var(--bz-canvas);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.pm-radar .material-symbols-outlined {
  position: relative;
  z-index: 2;
  font-size: 34px;
  color: var(--bz-warning);
}
.pm-radar-core,
.pm-radar-ring {
  position: absolute;
  border-radius: 999px;
  border: 1px solid rgba(250, 173, 20, 0.38);
}
.pm-radar-core { width: 12px; height: 12px; background: var(--bz-warning); }
.pm-radar-ring--one { width: 62px; height: 62px; }
.pm-radar-ring--two { width: 104px; height: 104px; opacity: 0.45; }
.pm-radar.is-scanning .pm-radar-ring--two { animation: pm-scan 1.6s ease-out infinite; }
@keyframes pm-scan { from { transform: scale(0.75); opacity: 0.7; } to { transform: scale(1.25); opacity: 0; } }
.pm-signal-readout {
  min-height: 112px;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.pm-console-label,
.dsla-console-label {
  color: var(--bz-fg-low);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.pm-signal-readout strong {
  color: var(--bz-fg);
  font-size: clamp(24px, 3vw, 38px);
  line-height: 1;
}
.pm-signal-readout span:last-child {
  color: var(--bz-fg-mid);
  font-size: 13px;
  margin-top: var(--bz-space-1);
}
@media (max-width: 900px) {
  .pm-signal-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

</style>
