<template>
  <div class="smart-agent-runner">
    <!-- Agent Header -->
    <div class="agent-header">
      <div class="agent-icon">{{ agentIcon }}</div>
      <div class="agent-info">
        <h1>{{ agent.name }}</h1>
        <p class="agent-description">{{ agent.description }}</p>
        <div class="agent-meta">
          <span class="category-badge">{{ agent.category }}</span>
          <span class="version">v{{ agent.version }}</span>
        </div>
      </div>
    </div>

    <!-- Requirements Section -->
    <div class="requirements-section">
      <h2>Requirements</h2>

      <!-- Purchase Status -->
      <div class="requirement-card" :class="{ met: hasPurchased }">
        <div class="req-icon">{{ hasPurchased ? '✅' : '💰' }}</div>
        <div class="req-content">
          <span class="req-label">Purchase Agent (One-time)</span>
          <span class="req-value">{{ agent.requirements.purchasePrice.amount }} {{ agent.requirements.purchasePrice.token }}</span>
        </div>
        <button
          v-if="!hasPurchased && isConnected"
          class="action-btn purchase"
          :disabled="isPurchasing"
          @click="handlePurchase"
        >
          {{ isPurchasing ? 'Processing...' : 'Buy Now' }}
        </button>
        <span v-else-if="hasPurchased" class="status-badge owned">Owned</span>
      </div>

      <!-- Running Fee (per execution) -->
      <div class="requirement-card" :class="{ met: hasEnoughForFee }">
        <div class="req-icon">{{ hasEnoughForFee ? '✅' : '🪙' }}</div>
        <div class="req-content">
          <span class="req-label">Running Fee (Per Execution)</span>
          <span class="req-value">
            {{ agent.requirements.runningFee.amount }} BONZAI
          </span>
          <span class="req-note">
            Transferred to treasury each run
          </span>
        </div>
        <div class="balance-info" v-if="isConnected">
          <span :class="{ insufficient: !hasEnoughForFee }">
            Balance: {{ totalBalance.toFixed(0) }} BONZAI
          </span>
        </div>
        <a v-if="!hasEnoughForFee && isConnected" :href="buyBonzaiLink" target="_blank" class="action-btn get">
          Get BONZAI
        </a>
      </div>
    </div>

    <!-- Configuration Section -->
    <div v-if="hasPurchased" class="config-section">
      <h2>Configuration</h2>

      <div class="input-grid">
        <div v-for="(input, key) in agent.inputs" :key="key" class="input-group">
          <label :for="key">{{ input.label }}</label>

          <template v-if="input.type === 'number'">
            <input
              type="number"
              :id="key"
              v-model.number="config[key]"
              :min="input.min"
              :max="input.max"
              :step="input.step || 1"
            />
          </template>

          <template v-else-if="input.type === 'boolean'">
            <label class="toggle">
              <input type="checkbox" :id="key" v-model="config[key]" />
              <span class="toggle-slider"></span>
            </label>
          </template>

          <template v-else>
            <input type="text" :id="key" v-model="config[key]" />
          </template>

          <span class="input-description" v-if="input.description">
            {{ input.description }}
          </span>
        </div>
      </div>
    </div>

    <!-- Run Section -->
    <div class="run-section">
      <!-- Not Connected -->
      <button v-if="!isConnected" class="run-btn connect" @click="connect">
        <span class="btn-icon">🔗</span>
        Connect Wallet
      </button>

      <!-- Connected -->
      <button
        v-else
        class="run-btn"
        :class="{ disabled: !canRun }"
        :disabled="!canRun || isRunning"
        @click="handleRun"
      >
        <span v-if="isRunning" class="spinner"></span>
        <span v-else class="btn-icon">▶️</span>
        {{ runButtonText }}
      </button>

      <!-- Fee Warning -->
      <div v-if="hasPurchased && hasEnoughForFee" class="fee-warning">
        <span class="warning-icon">⚠️</span>
        Running will transfer {{ agent.requirements.runningFee.amount }} BONZAI from your wallet
      </div>
    </div>

    <!-- Status -->
    <div v-if="status" class="status-bar" :class="statusType">
      <span class="status-icon">{{ statusIcon }}</span>
      <span class="status-text">{{ status }}</span>
    </div>

    <!-- Error -->
    <div v-if="error" class="error-bar">
      <span class="error-icon">❌</span>
      <span class="error-text">{{ error }}</span>
      <button class="dismiss-btn" @click="error = null">×</button>
    </div>

    <!-- Results Section -->
    <div v-if="results" class="results-section">
      <h2>Results</h2>

      <!-- Summary -->
      <div v-if="results.summary" class="results-summary">
        <div class="summary-stat">
          <span class="stat-value">{{ results.summary.marketsAnalyzed || 0 }}</span>
          <span class="stat-label">Markets Analyzed</span>
        </div>
        <div class="summary-stat">
          <span class="stat-value">{{ results.summary.totalRecommendations || 0 }}</span>
          <span class="stat-label">Recommendations</span>
        </div>
        <div class="summary-stat">
          <span class="stat-value">${{ formatVolume(results.summary.totalVolume24h) }}</span>
          <span class="stat-label">24h Volume</span>
        </div>
      </div>

      <!-- Market Cards -->
      <div class="markets-list">
        <div v-for="market in results.markets" :key="market.conditionId" class="market-card">
          <h3>{{ market.question }}</h3>

          <div class="market-stats">
            <span class="stat">
              <span class="stat-icon">📊</span>
              24h Volume: ${{ formatVolume(market.volume24hr) }}
            </span>
            <span v-if="market.endDate" class="stat">
              <span class="stat-icon">📅</span>
              Ends: {{ formatDate(market.endDate) }}
            </span>
          </div>

          <!-- Recommendations -->
          <div class="recommendations" v-if="market.recommendations?.length">
            <h4>Copy Trade Recommendations</h4>
            <div
              v-for="rec in market.recommendations"
              :key="rec.outcomeIndex"
              class="recommendation-card"
            >
              <div class="rec-outcome">
                <span class="outcome-label">{{ rec.outcome }}</span>
              </div>
              <div class="rec-details">
                <div class="detail-row">
                  <span class="detail-label">Top Whale:</span>
                  <span class="detail-value whale">{{ rec.whaleTrader }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Whale Position:</span>
                  <span class="detail-value">${{ rec.whalePosition.toLocaleString() }}</span>
                </div>
                <div class="detail-row highlight">
                  <span class="detail-label">Suggested Position:</span>
                  <span class="detail-value suggested">${{ rec.suggestedPosition.toLocaleString() }}</span>
                  <span class="detail-note">({{ (rec.copyFraction * 100).toFixed(0) }}% of whale)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Top Whales -->
          <details class="whales-details">
            <summary>View Top 5 Whales</summary>
            <table class="whales-table">
              <thead>
                <tr>
                  <th>Trader</th>
                  <th>Position</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="whale in market.topWhales" :key="whale.name">
                  <td>{{ whale.name }}</td>
                  <td>${{ whale.position.toLocaleString() }}</td>
                  <td>{{ whale.outcome }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>

      <!-- Errors from execution -->
      <div v-if="results.errors?.length" class="execution-errors">
        <h4>⚠️ Warnings</h4>
        <ul>
          <li v-for="err in results.errors" :key="err.market || err.general">
            {{ err.market ? `${err.market}: ${err.error}` : err.general }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch } from 'vue';
import { useBonzaiWeb3 } from '../composables/useBonzaiWeb3.js';
import { agentService } from '../services/agent.service.js';

const props = defineProps({
  agent: {
    type: Object,
    required: true,
  },
});

const {
  isConnected,
  isConnecting,
  totalBalance,
  connect: doConnect,
  store,
  CONFIG,
} = useBonzaiWeb3();

// State
const hasPurchased = ref(false);
const isPurchasing = ref(false);
const isRunning = ref(false);
const status = ref(null);
const statusType = ref('info');
const error = ref(null);
const results = ref(null);

// Initialize config with defaults
const config = reactive({});

onMounted(() => {
  initializeConfig();
  checkPurchaseStatus();
});

watch(() => props.agent, () => {
  initializeConfig();
  checkPurchaseStatus();
});

const initializeConfig = () => {
  Object.entries(props.agent.inputs || {}).forEach(([key, input]) => {
    config[key] = input.default;
  });
};

// Computed
const agentIcon = computed(() => {
  const icons = {
    trading: '📈',
    analysis: '🔍',
    automation: '🤖',
    data: '📊',
  };
  return icons[props.agent.category] || '🤖';
});

const runningFee = computed(() => props.agent.requirements?.runningFee?.amount || 99);

const hasEnoughForFee = computed(() => {
  return totalBalance.value >= runningFee.value;
});

const canRun = computed(() => {
  return hasPurchased.value && hasEnoughForFee.value && !isRunning.value;
});

const runButtonText = computed(() => {
  if (isRunning.value) return 'Running...';
  if (!hasPurchased.value) return 'Purchase Required';
  if (!hasEnoughForFee.value) return `Need ${runningFee.value} BONZAI`;
  return `Run Agent (${runningFee.value} BONZAI)`;
});

const statusIcon = computed(() => {
  const icons = {
    info: '⏳',
    success: '✅',
    warning: '⚠️',
  };
  return icons[statusType.value] || '⏳';
});

const buyBonzaiLink = CONFIG.links?.buyBonzai || '#';

// Methods
const checkPurchaseStatus = () => {
  const agentId = props.agent.id || props.agent.name;
  hasPurchased.value = agentService.hasPurchasedAgent(agentId);
};

const connect = async () => {
  await doConnect();
};

const handlePurchase = async () => {
  isPurchasing.value = true;
  error.value = null;
  status.value = 'Processing purchase...';
  statusType.value = 'info';

  try {
    const agentId = props.agent.id || props.agent.name;
    const result = await agentService.purchaseAgent(agentId);

    if (result.success) {
      hasPurchased.value = true;
      status.value = 'Purchase complete!';
      statusType.value = 'success';
    } else {
      throw new Error(result.error);
    }
  } catch (e) {
    error.value = e.message;
    status.value = null;
  } finally {
    isPurchasing.value = false;
  }
};

const handleRun = async () => {
  isRunning.value = true;
  error.value = null;
  results.value = null;
  status.value = 'Initializing...';
  statusType.value = 'info';

  try {
    const context = {
      updateStatus: (msg) => {
        status.value = msg;
      },
      user: store.walletAddress,
    };

    // Use agentService which handles fee payment
    const result = await agentService.executeAgentWithFee(
      props.agent,
      { ...config },
      context
    );

    if (result.success) {
      results.value = result.results;
      status.value = 'Analysis complete!';
      statusType.value = 'success';
    } else {
      if (result.requiresPurchase) {
        hasPurchased.value = false;
      }
      throw new Error(result.error);
    }
  } catch (e) {
    error.value = e.message;
    status.value = null;
  } finally {
    isRunning.value = false;
  }
};

const formatVolume = (vol) => {
  if (!vol) return '0';
  if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
  if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
  return vol.toFixed(0);
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString();
};
</script>

<style scoped>
/* BonzAI Design System */
.smart-agent-runner {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
  color: #f0f0f5;
}

/* Agent Header */
.agent-header {
  display: flex;
  gap: 20px;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.agent-icon {
  font-size: 48px;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(16, 185, 129, 0.15);
  border-radius: 16px;
}

.agent-info h1 {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 700;
}

.agent-description {
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 12px 0;
}

.agent-meta {
  display: flex;
  gap: 12px;
}

.category-badge {
  padding: 4px 12px;
  background: rgba(139, 92, 246, 0.2);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #a78bfa;
  text-transform: capitalize;
}

.version {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
}

/* Requirements Section */
.requirements-section {
  margin-bottom: 32px;
}

.requirements-section h2 {
  font-size: 18px;
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.8);
}

.requirement-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.requirement-card.met {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.05);
}

.req-icon {
  font-size: 24px;
}

.req-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.req-label {
  font-weight: 600;
  color: #f0f0f5;
}

.req-value {
  color: #10b981;
  font-weight: 700;
}

.req-note {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.balance-info {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.balance-info .insufficient {
  color: #f59e0b;
}

.action-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.action-btn.purchase {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.action-btn.purchase:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
}

.action-btn.get {
  background: rgba(255, 255, 255, 0.1);
  color: #f0f0f5;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-badge {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.owned {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

/* Config Section */
.config-section {
  margin-bottom: 32px;
}

.config-section h2 {
  font-size: 18px;
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.8);
}

.input-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.input-group input[type="number"],
.input-group input[type="text"] {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #f0f0f5;
  font-size: 14px;
}

.input-group input:focus {
  outline: none;
  border-color: #10b981;
}

.input-description {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

/* Toggle */
.toggle {
  position: relative;
  width: 48px;
  height: 26px;
  cursor: pointer;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 26px;
  transition: 0.3s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle input:checked + .toggle-slider {
  background: #10b981;
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(22px);
}

/* Run Section */
.run-section {
  margin-bottom: 24px;
  text-align: center;
}

.run-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 16px 32px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.run-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(16, 185, 129, 0.4);
}

.run-btn.disabled,
.run-btn:disabled {
  background: rgba(255, 255, 255, 0.1);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.run-btn.connect {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
}

.btn-icon {
  font-size: 18px;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fee-warning {
  margin-top: 12px;
  padding: 10px 16px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: #f59e0b;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Status Bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 8px;
  margin-bottom: 24px;
  color: #93c5fd;
}

.status-bar.success {
  background: rgba(16, 185, 129, 0.1);
  color: #6ee7b7;
}

.status-bar.warning {
  background: rgba(245, 158, 11, 0.1);
  color: #fcd34d;
}

/* Error Bar */
.error-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  margin-bottom: 24px;
  color: #fca5a5;
}

.error-bar .error-text {
  flex: 1;
}

.dismiss-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 20px;
  cursor: pointer;
}

/* Results Section */
.results-section {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 24px;
}

.results-section h2 {
  font-size: 18px;
  margin-bottom: 20px;
}

.results-summary {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  padding: 20px;
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 12px;
}

.summary-stat {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: #10b981;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

/* Market Cards */
.markets-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.market-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 20px;
}

.market-card h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
}

.market-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Recommendations */
.recommendations h4 {
  font-size: 14px;
  margin: 0 0 12px 0;
  color: rgba(255, 255, 255, 0.7);
}

.recommendation-card {
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.rec-outcome {
  margin-bottom: 12px;
}

.outcome-label {
  padding: 4px 10px;
  background: rgba(16, 185, 129, 0.2);
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #10b981;
}

.rec-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.detail-row.highlight {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  margin-top: 4px;
}

.detail-label {
  color: rgba(255, 255, 255, 0.6);
}

.detail-value {
  font-weight: 600;
  color: #f0f0f5;
}

.detail-value.whale {
  color: #f59e0b;
}

.detail-value.suggested {
  color: #10b981;
  font-size: 15px;
}

.detail-note {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

/* Whales Details */
.whales-details {
  margin-top: 16px;
}

.whales-details summary {
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.whales-table {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  font-size: 13px;
}

.whales-table th,
.whales-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.whales-table th {
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}

/* Execution Errors */
.execution-errors {
  margin-top: 20px;
  padding: 16px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
}

.execution-errors h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
}

.execution-errors ul {
  margin: 0;
  padding-left: 20px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

/* Responsive */
@media (max-width: 600px) {
  .agent-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .results-summary {
    flex-direction: column;
    gap: 16px;
  }

  .requirement-card {
    flex-wrap: wrap;
  }
}
</style>
