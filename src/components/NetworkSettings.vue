<template>
  <div class="network-settings">
    <div class="panel">
      <div class="panel-header">
        <p class="subtitle">
          Join the BonzAI P2P network as a provider to earn USDC, or as a consumer to use remote inference.
        </p>
      </div>

      <!-- Network Mode Selector -->
      <div class="network-mode-section">
        <h2 class="section-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">settings</span>
          Network Mode
        </h2>

        <div class="mode-options">
          <label class="mode-option" :class="{ active: networkMode === 'local' }">
            <input type="radio" v-model="networkMode" value="local" />
            <div class="mode-content">
              <span class="material-symbols-outlined mode-icon">wifi_off</span>
              <div class="mode-text">
                <strong>Local Only</strong>
                <span class="mode-desc">Offline mode, no network features</span>
              </div>
            </div>
          </label>

          <label class="mode-option" :class="{ active: networkMode === 'consumer' }">
            <input type="radio" v-model="networkMode" value="consumer" />
            <div class="mode-content">
              <span class="material-symbols-outlined mode-icon">cloud_download</span>
              <div class="mode-text">
                <strong>Consumer</strong>
                <span class="mode-desc">Use remote providers when local unavailable</span>
              </div>
            </div>
          </label>

          <label class="mode-option" :class="{ active: networkMode === 'provider' }">
            <input type="radio" v-model="networkMode" value="provider" />
            <div class="mode-content">
              <span class="material-symbols-outlined mode-icon">cloud_upload</span>
              <div class="mode-text">
                <strong>Provider</strong>
                <span class="mode-desc">Earn USDC by serving inference</span>
              </div>
            </div>
          </label>
        </div>
      </div>

      <!-- P2P Status Panel -->
      <div class="status-section" v-if="networkMode !== 'local'">
        <h2 class="section-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">monitoring</span>
          P2P Node Status
        </h2>

        <div class="status-panel" :class="{ online: p2pStatus.started, offline: !p2pStatus.started }">
          <div class="status-row">
            <span class="status-label">Status</span>
            <span class="status-value">
              <span class="status-indicator" :class="{ online: p2pStatus.started }"></span>
              {{ p2pStatus.started ? 'Online' : 'Offline' }}
            </span>
          </div>

          <template v-if="p2pStatus.started">
            <div class="status-row">
              <span class="status-label">Peer ID</span>
              <span class="status-value peer-id" @click="copyPeerId">
                {{ truncatedPeerId }}
                <span class="material-symbols-outlined copy-icon">content_copy</span>
              </span>
            </div>

            <div class="status-row">
              <span class="status-label">Connected Peers</span>
              <span class="status-value">{{ p2pStatus.connectedPeers || 0 }}</span>
            </div>

            <div class="status-row">
              <span class="status-label">NAT Status</span>
              <span class="status-value" :class="natStatusClass">
                <span class="material-symbols-outlined mr-1">
                  {{ p2pStatus.natStatus === 'public' ? 'public' : p2pStatus.natStatus === 'relayed' ? 'sync_alt' : 'help' }}
                </span>
                {{ formatNatStatus(p2pStatus.natStatus) }}
              </span>
            </div>

            <div class="status-row" v-if="p2pStatus.isUsingRelay">
              <span class="status-label">Relay Connections</span>
              <span class="status-value">{{ p2pStatus.relayConnections || 0 }}</span>
            </div>

            <div class="multiaddrs" v-if="p2pStatus.multiaddrs?.length">
              <span class="status-label">Listening Addresses</span>
              <div class="addr-list">
                <code v-for="addr in p2pStatus.multiaddrs.slice(0, 3)" :key="addr" class="addr">
                  {{ addr }}
                </code>
                <span v-if="p2pStatus.multiaddrs.length > 3" class="more-addrs">
                  +{{ p2pStatus.multiaddrs.length - 3 }} more
                </span>
              </div>
            </div>
          </template>
        </div>

        <!-- Start/Stop Button -->
        <div class="control-buttons">
          <button
            v-if="!p2pStatus.started"
            class="button is-success is-medium"
            @click="startP2P"
            :disabled="isStarting"
          >
            <span v-if="isStarting" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">play_arrow</span>
            {{ isStarting ? 'Starting...' : 'Start P2P Node' }}
          </button>

          <button
            v-else
            class="button is-danger is-medium"
            @click="stopP2P"
            :disabled="isStopping"
          >
            <span v-if="isStopping" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">stop</span>
            {{ isStopping ? 'Stopping...' : 'Stop P2P Node' }}
          </button>

          <button
            class="button is-info is-medium ml-2"
            @click="refreshStatus"
            :disabled="isRefreshing"
          >
            <span class="material-symbols-outlined" :class="{ spinning: isRefreshing }">refresh</span>
          </button>
        </div>
      </div>

      <!-- Provider Settings (when in provider mode) -->
      <div class="provider-section" v-if="networkMode === 'provider' && p2pStatus.started">
        <h2 class="section-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">tune</span>
          Provider Settings
        </h2>

        <div class="setting-group">
          <label class="setting-label">
            <span class="material-symbols-outlined">payments</span>
            Price per 1K tokens (USDC)
          </label>
          <input
            type="number"
            class="input"
            v-model.number="pricePerToken"
            step="0.0001"
            min="0"
            placeholder="0.0001"
          />
        </div>

        <div class="setting-group">
          <label class="setting-label">
            <span class="material-symbols-outlined">router</span>
            Act as Relay
          </label>
          <div class="relay-toggle">
            <label class="toggle">
              <input type="checkbox" v-model="enableRelay" :disabled="p2pStatus.natStatus !== 'public'" />
              <span class="toggle-slider"></span>
            </label>
            <span class="toggle-label">
              {{ enableRelay ? 'Enabled' : 'Disabled' }}
              <span v-if="p2pStatus.natStatus !== 'public'" class="toggle-note">
                (Requires public IP)
              </span>
            </span>
          </div>
        </div>

        <div class="setting-group" v-if="enableRelay">
          <label class="setting-label">
            <span class="material-symbols-outlined">percent</span>
            Relay Fee (%)
          </label>
          <input
            type="number"
            class="input"
            v-model.number="relayFee"
            step="1"
            min="1"
            max="10"
            placeholder="5"
          />
          <span class="setting-hint">Earn {{ relayFee }}% of relayed inference fees</span>
        </div>
      </div>

      <!-- Self-Test (Local Inference Routing) -->
      <div class="test-section">
        <h2 class="section-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">verified</span>
          Self-Test
        </h2>

        <div class="test-panel">
          <p class="test-description">
            Verify your local inference servers are running and can be reached by the P2P network.
          </p>

          <button
            class="button is-success is-medium"
            @click="runSelfTest"
            :disabled="isSelfTesting"
          >
            <span v-if="isSelfTesting" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">play_circle</span>
            {{ isSelfTesting ? 'Testing...' : 'Run Self-Test' }}
          </button>

          <div v-if="selfTestResults" class="self-test-results mt-4">
            <!-- Flask Server (Diffusion) -->
            <div class="test-result-row" :class="{ success: selfTestResults.flask?.ok, error: !selfTestResults.flask?.ok }">
              <span class="material-symbols-outlined mr-2">
                {{ selfTestResults.flask?.ok ? 'check_circle' : 'error' }}
              </span>
              <div class="test-result-content">
                <strong>Flask Server (Port 65000)</strong>
                <span class="test-result-detail">
                  {{ selfTestResults.flask?.ok ? `Image, Video, Audio, 3D pipelines` : (selfTestResults.flask?.error || 'Not responding') }}
                </span>
                <div v-if="selfTestResults.flask?.pipelines?.length" class="pipeline-tags">
                  <span v-for="p in selfTestResults.flask.pipelines" :key="p" class="pipeline-tag">{{ p }}</span>
                </div>
              </div>
            </div>

            <!-- OpenClaw Server (LLM) -->
            <div class="test-result-row" :class="{ success: selfTestResults.openclaw?.ok, error: !selfTestResults.openclaw?.ok }">
              <span class="material-symbols-outlined mr-2">
                {{ selfTestResults.openclaw?.ok ? 'check_circle' : 'error' }}
              </span>
              <div class="test-result-content">
                <strong>OpenClaw Server (Port 3002)</strong>
                <span class="test-result-detail">
                  {{ selfTestResults.openclaw?.ok ? `LLM chat inference` : (selfTestResults.openclaw?.error || 'Not responding') }}
                </span>
              </div>
            </div>

            <!-- P2P Node -->
            <div class="test-result-row" :class="{ success: selfTestResults.p2p?.ok, error: !selfTestResults.p2p?.ok }">
              <span class="material-symbols-outlined mr-2">
                {{ selfTestResults.p2p?.ok ? 'check_circle' : 'error' }}
              </span>
              <div class="test-result-content">
                <strong>P2P Node</strong>
                <span class="test-result-detail">
                  {{ selfTestResults.p2p?.ok ? `Peer ID: ${truncatedPeerId}` : (selfTestResults.p2p?.error || 'Not started') }}
                </span>
              </div>
            </div>

            <!-- Overall Status -->
            <div class="overall-status mt-3" :class="{ ready: selfTestResults.ready, 'not-ready': !selfTestResults.ready }">
              <span class="material-symbols-outlined mr-2">
                {{ selfTestResults.ready ? 'rocket_launch' : 'warning' }}
              </span>
              <span v-if="selfTestResults.ready">
                Ready to serve as a provider!
              </span>
              <span v-else>
                {{ selfTestResults.readyMessage || 'Some services need attention' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Connection Test -->
      <div class="test-section" v-if="p2pStatus.started">
        <h2 class="section-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">science</span>
          Peer Connection Test
        </h2>

        <div class="test-panel">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input
                type="text"
                class="input"
                v-model="testPeerId"
                placeholder="Enter peer ID to test connection (12D3KooW...)"
              />
            </div>
            <div class="control">
              <button
                class="button is-info"
                @click="testConnection"
                :disabled="!testPeerId || isTesting"
              >
                <span v-if="isTesting" class="loader mr-2"></span>
                <span class="material-symbols-outlined">{{ isTesting ? 'hourglass_empty' : 'cable' }}</span>
              </button>
            </div>
          </div>

          <div v-if="testResult" class="test-result" :class="{ success: testResult.ok, error: !testResult.ok }">
            <span class="material-symbols-outlined mr-2">
              {{ testResult.ok ? 'check_circle' : 'error' }}
            </span>
            <span v-if="testResult.ok">
              Connected! Peer supports {{ testResult.pipelines?.length || 0 }} pipelines
            </span>
            <span v-else>
              {{ testResult.error || 'Connection failed' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Info Section -->
      <div class="info-section">
        <h2 class="section-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">info</span>
          How It Works
        </h2>

        <div class="info-cards">
          <div class="info-card">
            <span class="material-symbols-outlined info-icon">dns</span>
            <h3>Decentralized</h3>
            <p>No central servers. Providers connect directly via libp2p DHT.</p>
          </div>

          <div class="info-card">
            <span class="material-symbols-outlined info-icon">lock</span>
            <h3>Zero-Knowledge</h3>
            <p>Remote providers never store your prompts or generated content.</p>
          </div>

          <div class="info-card">
            <span class="material-symbols-outlined info-icon">attach_money</span>
            <h3>Earn USDC</h3>
            <p>Providers earn USDC via x402 payments on Arbitrum.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

// State
const networkMode = ref('local');
const p2pStatus = ref({
  started: false,
  peerId: null,
  multiaddrs: [],
  connectedPeers: 0,
  relayConnections: 0,
  natStatus: 'unknown',
  isUsingRelay: false,
});

const isStarting = ref(false);
const isStopping = ref(false);
const isRefreshing = ref(false);
const isTesting = ref(false);
const isSelfTesting = ref(false);

const pricePerToken = ref(0.0001);
const selfTestResults = ref(null);
const enableRelay = ref(false);
const relayFee = ref(5);

const testPeerId = ref('');
const testResult = ref(null);

let statusInterval = null;

// Computed
const truncatedPeerId = computed(() => {
  const id = p2pStatus.value.peerId;
  if (!id) return '';
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
});

const natStatusClass = computed(() => ({
  'nat-public': p2pStatus.value.natStatus === 'public',
  'nat-relayed': p2pStatus.value.natStatus === 'relayed',
  'nat-unknown': p2pStatus.value.natStatus === 'unknown',
}));

// Methods
const formatNatStatus = (status) => {
  const labels = {
    public: 'Public IP',
    relayed: 'Using Relay',
    unknown: 'Unknown',
  };
  return labels[status] || status;
};

const copyPeerId = () => {
  if (p2pStatus.value.peerId) {
    navigator.clipboard.writeText(p2pStatus.value.peerId);
  }
};

const refreshStatus = async () => {
  isRefreshing.value = true;
  try {
    const status = await window.electronAPI.p2pStatus();
    if (status.ok) {
      p2pStatus.value = { ...status, started: status.started };
    }
  } catch (err) {
    console.error('[NetworkSettings] Failed to get status:', err);
  } finally {
    isRefreshing.value = false;
  }
};

const startP2P = async () => {
  isStarting.value = true;
  testResult.value = null;

  try {
    const result = await window.electronAPI.p2pStart({
      listenPort: 4002,
      enableRelay: enableRelay.value,
      bootstrapNodes: [], // Will come from contract in Phase 2
    });

    if (result.ok) {
      console.log('[NetworkSettings] P2P node started:', result.peerId);
      await refreshStatus();

      // Save settings
      await window.electronAPI.store.set('p2p.pricePerToken', pricePerToken.value.toString());
      await window.electronAPI.store.set('p2p.enableRelay', enableRelay.value);
      await window.electronAPI.store.set('p2p.relayFee', relayFee.value);
    } else {
      console.error('[NetworkSettings] Failed to start P2P:', result.error);
    }
  } catch (err) {
    console.error('[NetworkSettings] Error starting P2P:', err);
  } finally {
    isStarting.value = false;
  }
};

const stopP2P = async () => {
  isStopping.value = true;

  try {
    await window.electronAPI.p2pStop();
    console.log('[NetworkSettings] P2P node stopped');
    p2pStatus.value = {
      started: false,
      peerId: null,
      multiaddrs: [],
      connectedPeers: 0,
      relayConnections: 0,
      natStatus: 'unknown',
      isUsingRelay: false,
    };
  } catch (err) {
    console.error('[NetworkSettings] Error stopping P2P:', err);
  } finally {
    isStopping.value = false;
  }
};

const testConnection = async () => {
  if (!testPeerId.value) return;

  isTesting.value = true;
  testResult.value = null;

  try {
    const result = await window.electronAPI.p2pHealth(testPeerId.value);
    testResult.value = result;
  } catch (err) {
    testResult.value = { ok: false, error: err.message };
  } finally {
    isTesting.value = false;
  }
};

const runSelfTest = async () => {
  isSelfTesting.value = true;
  selfTestResults.value = null;

  const results = {
    flask: { ok: false, error: null, pipelines: [] },
    openclaw: { ok: false, error: null },
    p2p: { ok: false, error: null },
    ready: false,
    readyMessage: '',
  };

  // Test 1: Flask Server (port 65000)
  try {
    const flaskResponse = await fetch('http://127.0.0.1:65000/audio/info', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (flaskResponse.ok) {
      const data = await flaskResponse.json();
      results.flask.ok = true;
      results.flask.pipelines = Object.keys(data.pipelines || {});
    } else {
      results.flask.error = `HTTP ${flaskResponse.status}`;
    }
  } catch (err) {
    results.flask.error = err.message?.includes('fetch') ? 'Server not running' : err.message;
  }

  // Test 2: OpenClaw Server (port 3002) - check if enabled first
  try {
    const openclawEnabled = await window.electronAPI.openclawGetEnabled();
    if (openclawEnabled) {
      const openclawResponse = await fetch('http://127.0.0.1:3002/health', {
        method: 'GET',
      });
      if (openclawResponse.ok) {
        results.openclaw.ok = true;
      } else {
        results.openclaw.error = `HTTP ${openclawResponse.status}`;
      }
    } else {
      results.openclaw.error = 'OpenClaw not enabled';
    }
  } catch (err) {
    results.openclaw.error = err.message?.includes('fetch') ? 'Server not running' : err.message;
  }

  // Test 3: P2P Node
  try {
    const status = await window.electronAPI.p2pStatus();
    if (status.ok && status.started) {
      results.p2p.ok = true;
    } else {
      results.p2p.error = 'P2P node not started';
    }
  } catch (err) {
    results.p2p.error = err.message;
  }

  // Determine overall readiness
  const issues = [];
  if (!results.flask.ok) issues.push('Flask server');
  if (!results.p2p.ok) issues.push('P2P node');
  // OpenClaw is optional for provider mode

  if (issues.length === 0) {
    results.ready = true;
  } else {
    results.readyMessage = `Start: ${issues.join(', ')}`;
  }

  selfTestResults.value = results;
  isSelfTesting.value = false;
};

// Load saved settings
const loadSettings = async () => {
  try {
    const savedMode = await window.electronAPI.store.get('p2p.networkMode', 'local');
    const savedPrice = await window.electronAPI.store.get('p2p.pricePerToken', '0.0001');
    const savedRelay = await window.electronAPI.store.get('p2p.enableRelay', false);
    const savedRelayFee = await window.electronAPI.store.get('p2p.relayFee', 5);

    networkMode.value = savedMode;
    pricePerToken.value = parseFloat(savedPrice);
    enableRelay.value = savedRelay;
    relayFee.value = savedRelayFee;
  } catch (err) {
    console.error('[NetworkSettings] Failed to load settings:', err);
  }
};

// Save network mode when changed
watch(networkMode, async (newMode) => {
  await window.electronAPI.store.set('p2p.networkMode', newMode);

  // Auto-stop when switching to local mode
  if (newMode === 'local' && p2pStatus.value.started) {
    await stopP2P();
  }
});

// Lifecycle
onMounted(async () => {
  await loadSettings();
  await refreshStatus();

  // Poll status every 10 seconds when online
  statusInterval = setInterval(() => {
    if (p2pStatus.value.started) {
      refreshStatus();
    }
  }, 10000);
});

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval);
  }
});
</script>

<style scoped>
.network-settings {
  padding: 24px;
  overflow-y: auto;
  background: transparent;
}

.panel {
  max-width: 800px;
  margin: 0 auto;
}

.panel-header {
  margin-bottom: 24px;
}

.panel-header .subtitle {
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.25rem;
  color: #fff;
  margin-bottom: 16px;
}

/* Network Mode Selector */
.network-mode-section {
  margin-bottom: 32px;
}

.mode-options {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.mode-option {
  flex: 1;
  min-width: 200px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-option:hover {
  border-color: rgba(16, 185, 129, 0.5);
}

.mode-option.active {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.mode-option input {
  display: none;
}

.mode-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-icon {
  font-size: 32px;
  color: #10b981;
}

.mode-text {
  display: flex;
  flex-direction: column;
}

.mode-text strong {
  color: #fff;
  font-size: 1.1rem;
}

.mode-desc {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

/* Status Panel */
.status-section {
  margin-bottom: 32px;
}

.status-panel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
}

.status-panel.online {
  border-color: rgba(16, 185, 129, 0.3);
}

.status-panel.offline {
  border-color: rgba(239, 68, 68, 0.3);
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.status-row:last-child {
  border-bottom: none;
}

.status-label {
  color: rgba(255, 255, 255, 0.7);
}

.status-value {
  color: #fff;
  font-weight: 500;
  display: flex;
  align-items: center;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  margin-right: 8px;
}

.status-indicator.online {
  background: #10b981;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.peer-id {
  cursor: pointer;
  font-family: monospace;
  font-size: 0.9rem;
}

.peer-id:hover .copy-icon {
  opacity: 1;
}

.copy-icon {
  font-size: 16px;
  margin-left: 8px;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.nat-public { color: #10b981; }
.nat-relayed { color: #f59e0b; }
.nat-unknown { color: rgba(255, 255, 255, 0.5); }

.multiaddrs {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.addr-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.addr {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.2);
  padding: 4px 8px;
  border-radius: 4px;
  word-break: break-all;
}

.more-addrs {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.8rem;
}

/* Control Buttons */
.control-buttons {
  margin-top: 20px;
  display: flex;
  gap: 12px;
}

.loader {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 1s linear infinite;
}

/* Provider Settings */
.provider-section {
  margin-bottom: 32px;
}

.setting-group {
  margin-bottom: 20px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 8px;
}

.setting-hint {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.85rem;
  margin-top: 4px;
}

.relay-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle {
  position: relative;
  width: 48px;
  height: 26px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 26px;
  transition: 0.3s;
}

.toggle-slider:before {
  content: '';
  position: absolute;
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle input:checked + .toggle-slider {
  background: #10b981;
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(22px);
}

.toggle input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-label {
  color: #fff;
}

.toggle-note {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.85rem;
}

/* Test Section */
.test-section {
  margin-bottom: 32px;
}

.test-panel {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
}

.test-result {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding: 12px;
  border-radius: 8px;
}

.test-result.success {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.test-result.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.test-description {
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 16px;
  font-size: 0.95rem;
}

.self-test-results {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 16px;
}

.test-result-row {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 8px;
}

.test-result-row.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.test-result-row.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.test-result-row .material-symbols-outlined {
  flex-shrink: 0;
  margin-top: 2px;
}

.test-result-row.success .material-symbols-outlined {
  color: #10b981;
}

.test-result-row.error .material-symbols-outlined {
  color: #ef4444;
}

.test-result-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.test-result-content strong {
  color: #fff;
}

.test-result-detail {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

.pipeline-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.pipeline-tag {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
}

.overall-status {
  display: flex;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  font-weight: 500;
}

.overall-status.ready {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.overall-status.not-ready {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #f59e0b;
}

/* Info Section */
.info-section {
  margin-bottom: 32px;
}

.info-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.info-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}

.info-icon {
  font-size: 40px;
  color: #10b981;
  margin-bottom: 12px;
}

.info-card h3 {
  color: #fff;
  margin-bottom: 8px;
}

.info-card p {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
}
</style>
