<template>
  <div class="chart-forecaster-skill">
    <div class="forecast-tape">
      <div class="forecast-tape-cell">
        <span>Universe</span>
        <strong>{{ assetType === 'crypto' ? 'Crypto' : 'Stocks' }}</strong>
      </div>
      <div class="forecast-tape-cell">
        <span>Symbols</span>
        <strong>{{ selectedSymbols.join(' / ') }}</strong>
      </div>
      <div class="forecast-tape-cell">
        <span>Mode</span>
        <strong>{{ mode }}</strong>
      </div>
      <div class="forecast-tape-cell">
        <span>Horizon</span>
        <strong>{{ horizonDays }}d</strong>
      </div>
      <div class="forecast-tape-cell">
        <span>Output</span>
        <strong>{{ assetResults.length ? 'Ready' : 'Empty' }}</strong>
      </div>
    </div>

    <!-- Asset Selector —
         TimesFM readiness is handled by SmartAgent's standard
         "Download Required" banner (SKILL_MODEL_REQUIREMENTS maps the
         forecast_quality pipeline to this skill). No bespoke UI needed. -->
    <section class="forecast-asset-deck skill-panel">
      <div class="skill-panel-head">
        <h2 class="bz-h2">Assets <span class="bz-meta bz-mono">{{ selectedSymbols.length }}/3</span></h2>
        <div class="skill-panel-actions">
          <span class="category-selector asset-type-selector">
            <template v-for="t in ['crypto', 'stock']" :key="t">
              <input
                type="radio"
                name="cf_asset_type"
                :id="'cf_type_' + t"
                :value="t"
                :checked="assetType === t"
                @change="setAssetType(t)"
              />
              <label :for="'cf_type_' + t" class="radio category">
                {{ t === 'crypto' ? 'Crypto' : 'Stocks' }}
              </label>
            </template>
          </span>
        </div>
      </div>
      <!-- Checkbox semantics (not radio) so the user can deselect a ticker
           by clicking it again, and pick up to three at once. -->
      <div class="category-selector ticker-grid">
        <button
          v-for="a in activeAssetList"
          :key="a.symbol"
          type="button"
          class="radio category ticker-pill"
          :class="{ 'is-selected': selectedSymbols.includes(a.symbol) }"
          :disabled="!selectedSymbols.includes(a.symbol) && selectedSymbols.length >= 3"
          @click="toggleSymbol(a.symbol)"
        >
          <strong class="ticker-symbol">{{ a.symbol }}</strong>
          <span class="ticker-name bz-meta">{{ a.name }}</span>
        </button>
      </div>
    </section>

    <!-- Mode + Parameters -->
    <section class="forecast-parameter-deck skill-panel">
      <div class="forecast-grid">
        <div class="skill-field">
          <label class="skill-label">Lookback (days)</label>
          <input type="number" class="skill-input" v-model.number="lookbackDays" min="90" max="1825" />
        </div>
        <div class="skill-field">
          <label class="skill-label">Horizon (days)</label>
          <input type="number" class="skill-input" v-model.number="horizonDays" min="7" max="180" />
        </div>
        <div class="skill-field skill-field--wide">
          <label class="skill-label">
            Mode
            <span class="skill-label-hint">{{ modeHelp }}</span>
          </label>
          <span class="category-selector mode-selector">
            <template v-for="m in ['forecast', 'backtest']" :key="m">
              <input
                type="radio"
                name="cf_mode"
                :id="'cf_mode_' + m"
                :value="m"
                :checked="mode === m"
                @change="mode = m"
              />
              <label :for="'cf_mode_' + m" class="radio category">
                {{ m === 'forecast' ? 'Forecast' : 'Backtest' }}
              </label>
            </template>
          </span>
        </div>
        <div v-if="mode === 'backtest'" class="skill-field">
          <label class="skill-label">Backtest offset</label>
          <input type="number" class="skill-input" v-model.number="backtestOffsetDays" min="7" :max="180" />
        </div>
        <div class="skill-field skill-field--action">
          <button
            class="bz-btn bz-btn--agent-cta bz-btn--lg forecast-cta"
            :class="{ 'bz-btn--running': isForecasting }"
            :disabled="isForecasting || selectedSymbols.length === 0"
            @click="runForecast"
          >
            <span class="material-symbols-outlined">auto_graph</span>
            {{ mode === 'backtest' ? 'Run backtest' : 'Forecast' }}
            {{ selectedSymbols.join(', ') || '—' }}
            <span v-if="isForecasting" class="bz-btn__progress"></span>
          </button>
        </div>
      </div>
      <div v-if="error" class="bz-notice bz-notice--danger skill-notice">
        <span class="bz-notice__icon"><span class="material-symbols-outlined">error</span></span>
        <div class="bz-notice__body">
          <div class="bz-notice__title">Forecast couldn't complete</div>
          <p class="bz-notice__text">{{ error }}</p>
          <p class="bz-notice__text" v-if="errorHint">{{ errorHint }}</p>
        </div>
        <button class="bz-btn bz-btn--sm" @click="runForecast">
          <span class="material-symbols-outlined">refresh</span>
          Retry
        </button>
      </div>
    </section>

    <!-- Chart -->
    <section
      v-if="assetResults.length > 0"
      class="forecast-chart-stage skill-panel"
    >
      <h2 class="bz-h2 skill-section-title">
        {{ chartTitle }}
      </h2>

      <!-- Per-asset legend with start→end change (makes multi-asset intuitive) -->
      <div class="asset-legend">
        <div
          v-for="(r, idx) in assetResults"
          :key="r.symbol"
          class="asset-legend-row"
        >
          <span
            class="legend-swatch"
            :style="{ background: legendColor(idx) }"
          ></span>
          <strong class="legend-symbol">{{ r.symbol }}</strong>
          <span class="legend-price">{{ formatPrice(assetSummary(r).last) }}</span>
          <span v-if="mode !== 'backtest' && assetSummary(r).forecastEnd != null">
            →
            <span
              class="legend-change"
              :class="{
                'is-up': assetSummary(r).pctChange >= 0,
                'is-down': assetSummary(r).pctChange < 0,
              }"
            >
              {{ formatPrice(assetSummary(r).forecastEnd) }}
              ({{ assetSummary(r).pctChange >= 0 ? '+' : '' }}{{ assetSummary(r).pctChange.toFixed(1) }}%)
            </span>
          </span>
        </div>
      </div>

      <div ref="chartContainer" class="chart-container"></div>
      <div class="chart-helper bz-meta">
        <template v-if="selectedSymbols.length > 1">
          Multi-asset: values rebased so <em>day 0 = 100</em>, so lines show
          <strong>percentage change</strong> — not dollar price. A reading of
          110 means +10% since the window started.
        </template>
        <template v-else-if="mode === 'backtest'">
          <span style="color: var(--bz-warning)">Orange</span> = forecast from {{ backtestOffsetDays }} days ago ·
          <span style="color: var(--bz-emerald-500)">Green</span> = what actually happened ·
          MAPE: <strong>{{ backtestAccuracy.mape.toFixed(2) }}%</strong> over {{ backtestAccuracy.n }} days
        </template>
        <template v-else>
          Past: solid · forecast: dashed · shaded band = 80% confidence interval.
        </template>
      </div>
    </section>

    <!-- LLM Narrative -->
    <section
      v-if="narrative || isGeneratingNarrative"
      class="forecast-narrative-panel skill-panel"
    >
      <h2 class="bz-h2 skill-section-title">
        <span class="material-symbols-outlined">neurology</span>
        Analysis
      </h2>
      <BonzaiPulse
        v-if="isGeneratingNarrative"
        variant="dot"
        label="Generating narrative with Qwen3.5 4B MTP"
      />
      <div v-else class="narrative-body">{{ narrative }}</div>
    </section>
  </div>
</template>

<script>
import { ref, computed, onBeforeUnmount, nextTick, watch } from 'vue';
import BonzaiPulse from '../BonzaiPulse.vue';
import { hasSkillTokenAccess, isDevMode } from '../../services/agent.service.js';
import { authFetch } from '../../services/auth.service.js';

const SKILL_ID = 'chart-forecaster-v1.0.0';

const API_BASE =
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  'http://127.0.0.1:65000';

// Full Qwen3.5 4B MTP spec — mirrors the entry in flagship.js so loadModel
// receives the context/filesize/params needed to size the KV cache
// correctly. Without these fields the loader defaults to n_ctx=4096
// which overflows on the narrative prompt.
const NARRATIVE_LLM_SPEC = {
  filename: 'qwen3.5-4b-ud-q4_k_xl.gguf',
  url: 'https://huggingface.co/unsloth/Qwen3.5-4B-MTP-GGUF/resolve/main/Qwen3.5-4B-UD-Q4_K_XL.gguf',
  filesizeBytes: 2.8e9,
  parameters: 4e9,
  context: 32768,
  specType: 'draft-mtp',
  specDraftNMax: 2,
  mtp: true,
};

const CRYPTO_ASSETS = [
  { symbol: 'BTC', coingeckoId: 'bitcoin', name: 'Bitcoin' },
  { symbol: 'ETH', coingeckoId: 'ethereum', name: 'Ethereum' },
  { symbol: 'SOL', coingeckoId: 'solana', name: 'Solana' },
  { symbol: 'BNB', coingeckoId: 'binancecoin', name: 'BNB' },
  { symbol: 'XRP', coingeckoId: 'ripple', name: 'XRP' },
  { symbol: 'DOGE', coingeckoId: 'dogecoin', name: 'Dogecoin' },
  { symbol: 'ADA', coingeckoId: 'cardano', name: 'Cardano' },
  { symbol: 'AVAX', coingeckoId: 'avalanche-2', name: 'Avalanche' },
  { symbol: 'LINK', coingeckoId: 'chainlink', name: 'Chainlink' },
  { symbol: 'DOT', coingeckoId: 'polkadot', name: 'Polkadot' },
];

const STOCK_ASSETS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'AVGO', name: 'Broadcom' },
];

const SERIES_COLORS = ['#1890ff', '#52c41a', '#faad14'];
const FORECAST_COLORS = ['#91caff', '#95de64', '#ffd666'];

// Route both crypto + stocks through the Flask /forecast/history proxy.
// Yahoo Finance returns 401 to renderer-side `fetch` because of CORS; the
// proxy sidesteps that (and also normalizes the response shape so the
// component only parses one payload format).
async function fetchHistoryViaProxy(symbol, assetType, days) {
  const r = await authFetch(`${API_BASE}/forecast/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, assetType, days }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(body.error || `history fetch ${r.status}`);
  }
  return body.series || [];
}

export default {
  name: 'ChartForecasterSkill',
  components: { BonzaiPulse },
  props: {
    skill: { type: Object, default: null },
  },
  setup(props, { emit }) {
    const assetType = ref('crypto');
    const selectedSymbols = ref(['BTC']);
    const lookbackDays = ref(365);
    const horizonDays = ref(30);
    const mode = ref('forecast');
    const backtestOffsetDays = ref(30);
    const isForecasting = ref(false);
    const error = ref(null);
    const errorHint = ref(null);

    const assetResults = ref([]);
    const narrative = ref('');
    const isGeneratingNarrative = ref(false);

    const chartContainer = ref(null);
    // Chart instance is destroyed + recreated on every render to avoid the
    // series-accumulation bug that corrupted the chart on the second run.
    let chart = null;

    const activeAssetList = computed(() =>
      assetType.value === 'crypto' ? CRYPTO_ASSETS : STOCK_ASSETS
    );

    const modeHelp = 'forecast: predict next N days · backtest: rewind N days, re-forecast, overlay actual';

    const chartTitle = computed(() => {
      if (mode.value === 'backtest') {
        return `${selectedSymbols.value.join(', ')} — backtest from ${backtestOffsetDays.value}d ago`;
      }
      if (selectedSymbols.value.length > 1) {
        return `${selectedSymbols.value.join(' vs ')} — ${horizonDays.value}d forecast`;
      }
      return `${selectedSymbols.value[0]} — ${horizonDays.value}-day forecast`;
    });

    const backtestAccuracy = computed(() => {
      if (mode.value !== 'backtest' || assetResults.value.length === 0) {
        return { mape: 0, n: 0 };
      }
      const r = assetResults.value[0];
      if (!r?.actualOverlay || !r?.forecast) return { mape: 0, n: 0 };
      const n = Math.min(r.actualOverlay.length, r.forecast.length);
      if (n === 0) return { mape: 0, n: 0 };
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const actual = r.actualOverlay[i];
        const pred = r.forecast[i];
        if (actual != null && actual !== 0) sum += Math.abs((actual - pred) / actual);
      }
      return { mape: (sum / n) * 100, n };
    });

    // ─── Symbol selection ───────────────────────────────────────────────
    const toggleSymbol = (symbol) => {
      const idx = selectedSymbols.value.indexOf(symbol);
      if (idx >= 0) selectedSymbols.value.splice(idx, 1);
      else if (selectedSymbols.value.length < 3) selectedSymbols.value.push(symbol);
    };

    const setAssetType = (t) => {
      assetType.value = t;
      selectedSymbols.value = t === 'crypto' ? ['BTC'] : ['AAPL'];
      assetResults.value = [];
      narrative.value = '';
    };

    const fetchHistory = async (symbol, days) => {
      return fetchHistoryViaProxy(symbol, assetType.value, days);
    };

    // ─── Presentation helpers ────────────────────────────────────────────
    const legendColor = (idx) => SERIES_COLORS[idx % SERIES_COLORS.length];

    const formatPrice = (v) => {
      if (v == null || !isFinite(v)) return '—';
      if (Math.abs(v) >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
      if (Math.abs(v) >= 1) return '$' + v.toFixed(2);
      return '$' + v.toFixed(4);
    };

    const assetSummary = (r) => {
      const last = r.history?.[r.history.length - 1]?.v ?? null;
      const forecastEnd = r.forecast?.[r.forecast.length - 1] ?? null;
      const pctChange = (last && forecastEnd) ? ((forecastEnd - last) / last) * 100 : 0;
      return { last, forecastEnd, pctChange };
    };

    const callForecast = async (series, horizon) => {
      const r = await authFetch(`${API_BASE}/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          series: series.map((p) => p.v),
          horizon,
          freq: 1,
        }),
      });
      if (!r.ok) throw new Error(`Forecast failed: ${r.status}`);
      return r.json();
    };

    // ─── Chart rendering: destroy + recreate on every render. ────────────
    // The "clear series" approach leaked series between runs on the
    // lightweight-charts v4 API; full reset is cheap and correct.
    const destroyChart = () => {
      if (!chart) return;
      try { chart.remove(); } catch {}
      chart = null;
    };

    const renderChart = async () => {
      await nextTick();
      if (!chartContainer.value) return;
      destroyChart();

      const { createChart, LineStyle } = await import('lightweight-charts');
      chart = createChart(chartContainer.value, {
        autoSize: true,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#cfd2d6' },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' },
        },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
        timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true },
      });

      const isMulti = selectedSymbols.value.length > 1;
      const isBacktest = mode.value === 'backtest';
      const dashed = LineStyle?.Dashed ?? 2;

      assetResults.value.forEach((r, idx) => {
        const color = SERIES_COLORS[idx % SERIES_COLORS.length];
        const forecastColor = FORECAST_COLORS[idx % FORECAST_COLORS.length];
        const base = isMulti ? (r.history[0]?.v || 1) : 1;
        const norm = (v) => isMulti ? (v / base) * 100 : v;

        const historicalData = r.history.map((p) => ({ time: p.t, value: norm(p.v) }));
        const hist = chart.addLineSeries({ color, lineWidth: 2, title: r.symbol });
        hist.setData(historicalData);

        if (r.forecast?.length > 0) {
          const dayStep = 86400;
          const startT = historicalData[historicalData.length - 1]?.time || Math.floor(Date.now() / 1000);
          const fc = r.forecast.map((v, i) => ({ time: startT + (i + 1) * dayStep, value: norm(v) }));
          const fcSeries = chart.addLineSeries({
            color: forecastColor,
            lineWidth: 2,
            lineStyle: dashed,
            title: `${r.symbol} forecast`,
          });
          fcSeries.setData(fc);

          if (!isMulti && r.upper80?.length && r.lower80?.length) {
            const up = r.upper80.map((v, i) => ({ time: startT + (i + 1) * dayStep, value: v }));
            const upSeries = chart.addAreaSeries({
              topColor: 'rgba(250, 173, 20, 0.2)',
              bottomColor: 'rgba(250, 173, 20, 0.02)',
              lineColor: 'rgba(250, 173, 20, 0)',
            });
            upSeries.setData(up);
          }

          if (isBacktest && r.actualOverlay?.length > 0) {
            const actual = r.actualOverlay.map((v, i) => ({ time: startT + (i + 1) * dayStep, value: norm(v) }));
            const actSeries = chart.addLineSeries({
              color: '#52c41a',
              lineWidth: 2,
              title: `${r.symbol} actual`,
            });
            actSeries.setData(actual);
          }
        }
      });

      chart.timeScale().fitContent();
    };

    watch(assetResults, () => { renderChart(); }, { deep: true });

    // ─── LLM Narrative ──────────────────────────────────────────────────
    const generateNarrative = async () => {
      if (assetResults.value.length === 0) return;
      isGeneratingNarrative.value = true;
      narrative.value = '';
      try {
        const summaries = assetResults.value.map((r) => {
          const lastPrice = r.history[r.history.length - 1]?.v;
          const forecastEnd = r.forecast?.[r.forecast.length - 1];
          const pctChange = lastPrice && forecastEnd
            ? ((forecastEnd - lastPrice) / lastPrice) * 100
            : 0;
          const bandEnd = (r.upper80?.[r.upper80.length - 1] ?? 0) - (r.lower80?.[r.lower80.length - 1] ?? 0);
          const bandPct = lastPrice ? (bandEnd / lastPrice) * 100 : 0;
          return `${r.symbol}: last=$${lastPrice?.toFixed(2)}, ${horizonDays.value}d forecast=$${forecastEnd?.toFixed(2)} (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%), 80% CI width=${bandPct.toFixed(1)}%`;
        }).join('\n');

        const backtestPart = mode.value === 'backtest'
          ? `\n\nBacktest MAPE: ${backtestAccuracy.value.mape.toFixed(2)}% over ${backtestAccuracy.value.n} days.`
          : '';

        const llmPrompt = `You are a concise financial analyst. Given this TimesFM forecast summary, write a 3-5 sentence analysis for a retail trader. Explain what the forecast is saying, flag any unusual patterns (wide confidence band = high uncertainty), and note the key risk. Be honest — if boring, say so. No disclaimers.\n\n${summaries}${backtestPart}`;

        // Load with a plain object that carries the full spec — without
        // context/filesizeBytes the loader sizes n_ctx too small and chat()
        // errors with "The context size is too small to generate a response".
        await window.electronAPI.loadModel({ ...NARRATIVE_LLM_SPEC });
        await window.electronAPI.resetChat?.();
        const reply = await window.electronAPI.chat(llmPrompt, {
          temperature: 0.5,
          maxTokens: 400,
        });
        narrative.value = typeof reply === 'string' ? reply : (reply?.text || '');
      } catch (e) {
        console.warn('[ChartForecaster] Narrative generation failed:', e?.message);
        narrative.value = `(Narrative unavailable: ${e?.message || 'unknown error'})`;
      } finally {
        isGeneratingNarrative.value = false;
      }
    };

    // ─── Main action ────────────────────────────────────────────────────
    const hintForError = (msg) => {
      const s = (msg || '').toLowerCase();
      if (s.includes('not enough historical')) return 'Try a shorter lookback or a different symbol.';
      if (s.includes('coingecko') || s.includes('yahoo')) return 'Data source rejected the request — wait a minute and retry, or pick a different symbol.';
      if (s.includes('forecast')) return 'TimesFM may still be loading. Retry in a moment.';
      if (s.includes('timesfm') || s.includes('timesfm')) return 'Open the download module and ensure TimesFM finished fetching.';
      return null;
    };

    const runForecast = async () => {
      if (!isDevMode() && !(await hasSkillTokenAccess(SKILL_ID))) {
        error.value = 'Skill not purchased.';
        errorHint.value = 'Purchase this skill from the marketplace to run forecasts.';
        return;
      }
      isForecasting.value = true;
      error.value = null;
      errorHint.value = null;
      assetResults.value = [];
      narrative.value = '';

      try {
        const results = [];
        for (const symbol of selectedSymbols.value) {
          emit('status-update', `Fetching ${symbol} history…`);
          const fullHistory = await fetchHistory(symbol, lookbackDays.value);
          if (fullHistory.length < 30) throw new Error(`${symbol}: not enough historical data`);

          let contextHistory = fullHistory;
          let actualOverlay = null;
          if (mode.value === 'backtest') {
            const cutoff = fullHistory.length - backtestOffsetDays.value;
            if (cutoff < 30) throw new Error('Lookback too small for this backtest offset');
            contextHistory = fullHistory.slice(0, cutoff);
            actualOverlay = fullHistory.slice(cutoff).map((p) => p.v);
          }

          emit('status-update', `Forecasting ${symbol} with TimesFM…`);
          const forecastHorizon = mode.value === 'backtest' ? backtestOffsetDays.value : horizonDays.value;
          const body = await callForecast(contextHistory, forecastHorizon);

          results.push({
            symbol,
            history: contextHistory,
            forecast: body.forecast || [],
            lower80: body.lower80 || [],
            upper80: body.upper80 || [],
            lower95: body.lower95 || [],
            upper95: body.upper95 || [],
            actualOverlay,
          });
        }
        assetResults.value = results;
        generateNarrative();
        emit('status-update', 'Forecast complete.');
      } catch (e) {
        console.error('[ChartForecaster]', e);
        error.value = e?.message || String(e);
        errorHint.value = hintForError(error.value);
      } finally {
        isForecasting.value = false;
      }
    };

    onBeforeUnmount(() => { destroyChart(); });

    return {
      assetType,
      selectedSymbols,
      lookbackDays,
      horizonDays,
      mode,
      backtestOffsetDays,
      modeHelp,
      isForecasting,
      error,
      errorHint,
      assetResults,
      narrative,
      isGeneratingNarrative,
      chartContainer,
      activeAssetList,
      chartTitle,
      backtestAccuracy,
      toggleSymbol,
      setAssetType,
      runForecast,
      legendColor,
      formatPrice,
      assetSummary,
    };
  },
};
</script>

<style scoped>
.chart-forecaster-skill {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
  color: var(--bz-fg);
}
.skill-panel {
  padding: var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}
.skill-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-4);
  margin-bottom: var(--bz-space-4);
}
.skill-panel-actions {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
}
.skill-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-4);
}
.skill-title-icon {
  color: var(--bz-purple-300);
  font-size: 42px !important;
  line-height: 1;
}
.skill-section-title {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0 0 var(--bz-space-4);
  color: var(--bz-fg);
}
.forecast-grid {
  display: grid;
  grid-template-columns: minmax(120px, 0.65fr) minmax(120px, 0.65fr) minmax(260px, 1.2fr) minmax(180px, 0.8fr) minmax(240px, 1.4fr);
  gap: var(--bz-space-4);
  align-items: end;
}
.skill-field {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  min-width: 0;
}
.skill-field--wide { min-width: 240px; }
.skill-field--action { justify-content: flex-end; }
.skill-label {
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1.35;
}
.skill-label-hint {
  display: block;
  margin-top: var(--bz-space-1);
  color: var(--bz-fg-low);
}
.skill-input {
  width: 100%;
  height: 44px;
  padding: 0 var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-input:focus {
  outline: none;
  border-color: var(--bz-border-brand);
}
.skill-notice { margin-top: var(--bz-space-4); }
.chart-helper {
  margin-top: var(--bz-space-3);
  color: var(--bz-fg-mid);
}

.chart-container {
  height: 420px;
  width: 100%;
}
.narrative-body {
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-wrap;
  color: rgba(255, 255, 255, 0.92);
  background: var(--bz-scrim);
  border-left: 3px solid var(--bz-purple-500);
  padding: 16px 20px;
  border-radius: 4px;
}

/* Ticker grid — button-based toggle so clicks deselect correctly. */
.ticker-grid {
  grid-template-columns: repeat(5, 1fr) !important;
}
.ticker-pill {
  background: var(--bz-scrim-soft);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  padding: 10px 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
}
.ticker-pill:not(:disabled):hover {
  border-color: rgba(255, 255, 255, 0.6);
  background: var(--bz-purple-soft);
}
.ticker-pill:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.ticker-pill.is-selected {
  border: 1px solid var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
  color: var(--bz-control-selected-fg);
}
.ticker-pill.is-selected .ticker-symbol,
.ticker-pill.is-selected .ticker-name {
  background: none;
  color: var(--bz-control-selected-fg);
  -webkit-text-fill-color: currentColor;
}
/* Brand-gradient ticker labels — match the skill title color treatment. */
.ticker-symbol {
  font-family: 'Fira Sans Condensed', sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 18px;
  letter-spacing: 0.5px;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.ticker-name {
  color: var(--bz-fg-mid);
}

/* Forecast CTA — green (success), full brand treatment. */
.forecast-cta {
  box-shadow: 0 0 0 1px rgba(82, 196, 26, 0.4), 0 4px 16px rgba(82, 196, 26, 0.2);
}

/* Beautiful error card. */
.error-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(209, 83, 76, 0.18), rgba(209, 83, 76, 0.08));
  border: 1px solid rgba(209, 83, 76, 0.4);
  border-radius: 6px;
  color: var(--bz-fg);
}
.error-card-icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(209, 83, 76, 0.3);
}
.error-card-icon .material-symbols-outlined {
  font-size: 24px;
  color: #ff8a7d;
}
.error-card-body {
  flex: 1;
}
.error-card-title {
  font-family: 'Fira Sans Condensed', sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 18px;
  margin-bottom: 2px;
}
.error-card-message {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}
.error-card-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 4px;
  font-style: italic;
}

/* Asset legend above chart — one row per selected asset. */
.asset-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.asset-legend-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}
.legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}
.legend-symbol {
  font-family: 'Fira Sans Condensed', sans-serif;
  font-weight: 900;
  font-style: italic;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.legend-price {
  font-family: monospace;
  color: rgba(255, 255, 255, 0.85);
}
.legend-change.is-up {
  color: #52c41a;
  font-weight: 600;
}
.legend-change.is-down {
  color: #d1534c;
  font-weight: 600;
}

/* Asset-type toggle — narrow version of category-selector. */
.asset-type-selector {
  grid-template-columns: repeat(2, 1fr) !important;
  gap: 0.4em !important;
  min-width: 180px;
}
.mode-selector {
  grid-template-columns: repeat(2, 1fr) !important;
  gap: 0.4em !important;
}

/* ===== Shared skill styles (mirrors DSLASkill / PolymarketSkill) ===== */

.category-selector {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5em;
}
.category-selector input[type='radio'] {
  display: none;
}
.category-selector input[type='radio'] + label.radio.category {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  font-family: 'Fira Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  background: transparent;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  color: var(--bz-fg-faint);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.category-selector input[type='radio'] + label.radio.category:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg-mid);
}
.category-selector input[type='radio']:checked + label.radio.category {
  color: var(--bz-control-selected-fg);
  border: 1px solid var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}
.category-selector input[type='radio']:disabled + label.radio.category {
  opacity: 0.35;
  cursor: not-allowed;
}

.input {
  background: var(--bz-scrim);
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--bz-fg);
}
.input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}
.label { font-weight: normal; }

.models__activity--payouts {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px !important;
}

.skill-name {
  font-size: 1.5rem;
  margin: 0;
  font-family: 'Fira Sans Condensed', sans-serif;
  font-style: italic;
  font-weight: 900;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.skill-description {
  color: var(--bz-fg-mid);
  margin-bottom: 0.5em;
  text-align: left;
}

.rotating {
  animation: bz-spin 1s linear infinite;
  display: inline-block;
}
@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Agentic redesign: Forecast Terminal */
.forecast-asset-deck,
.forecast-parameter-deck,
.forecast-chart-stage,
.forecast-narrative-panel {
  background: var(--bz-panel);
}
.forecast-asset-deck {
  background:
    linear-gradient(135deg, rgba(24, 144, 255, 0.12), transparent 42%),
    var(--bz-panel);
}
.forecast-asset-deck .skill-panel-head {
  align-items: center;
}
.forecast-asset-deck .ticker-grid {
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)) !important;
}
.forecast-parameter-deck .forecast-grid {
  grid-template-columns: minmax(120px, 0.6fr) minmax(120px, 0.6fr) minmax(260px, 1.1fr) minmax(170px, 0.7fr) minmax(260px, 1.2fr);
  align-items: stretch;
}
.forecast-parameter-deck .skill-field {
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
}
.forecast-parameter-deck .skill-field--action {
  display: flex;
  justify-content: flex-end;
}
.forecast-chart-stage .asset-legend {
  margin-bottom: var(--bz-space-3);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
}
.forecast-chart-stage .chart-container {
  min-height: clamp(420px, 56vh, 680px);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
}
.forecast-narrative-panel .narrative-body {
  border-left-color: var(--bz-info);
}
@media (max-width: 1120px) {
  .forecast-parameter-deck .forecast-grid {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
  .forecast-parameter-deck .skill-field--wide,
  .forecast-parameter-deck .skill-field--action {
    grid-column: 1 / -1;
  }
}


/* Signature upgrade: forecast tape */
.forecast-tape {
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr));
  gap: var(--bz-space-3);
}
.forecast-tape-cell {
  min-height: 88px;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background:
    linear-gradient(135deg, rgba(24, 144, 255, 0.1), transparent 52%),
    var(--bz-panel);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.forecast-tape-cell span {
  color: var(--bz-fg-low);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.forecast-tape-cell strong {
  color: var(--bz-fg);
  font-size: 18px;
  line-height: 1.15;
  overflow-wrap: anywhere;
  text-transform: capitalize;
}
.forecast-asset-deck,
.forecast-parameter-deck {
  border-color: var(--bz-border-strong);
}
@media (max-width: 980px) {
  .forecast-tape { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

</style>
