<template>
  <div class="models__activity--payouts">
    <div class="panel">
      <!-- Network Mode Selector -->
      <div class="network-mode-section">
        <h2 class="section-title fira-sans-condensed-black-italic">
          Network Mode
        </h2>

        <div class="control mb-5 has-text-left mode-selector">
          <input
            v-model="networkMode"
            value="local"
            id="mode_local"
            type="radio"
            name="networkMode"
          />
          <label for="mode_local" class="radio mr-3">
            <span class="material-symbols-outlined" style="font-size: 32px !important">
              wifi_off
            </span>
            Local Only
          </label>

          <input
            v-model="networkMode"
            value="consumer"
            id="mode_consumer"
            type="radio"
            name="networkMode"
          />
          <label for="mode_consumer" class="radio mr-3">
            <span class="material-symbols-outlined" style="font-size: 32px !important">
              cloud_download
            </span>
            Consumer
          </label>

          <input
            v-model="networkMode"
            value="provider"
            id="mode_provider"
            type="radio"
            name="networkMode"
          />
          <label for="mode_provider" class="radio mr-3">
            <span class="material-symbols-outlined" style="font-size: 32px !important">
              cloud_upload
            </span>
            Provider
          </label>
        </div>
      </div>

      <hr />

      <!-- P2P Status Panel -->
      <div class="status-section mt-5" v-if="networkMode !== 'local'">
        <h2 class="section-title fira-sans-condensed-black-italic">
          Node Status
        </h2>

        <div class="status-panel mt-5 mb-5" :class="{ online: p2pStatus.started, offline: !p2pStatus.started }">
          <div class="status-row">
            <span class="status-label">Status</span>
            <span class="status-value">
              <span class="status-indicator" :class="{ online: p2pStatus.started }"></span>
              {{ p2pStatus.started ? 'Online' : 'Offline' }}
            </span>
          </div>
          <hr />
          <template v-if="p2pStatus.started">
            <div class="status-row">
              <span class="status-label">Peer ID</span>
              <span class="status-value peer-id" @click="copyPeerId">
                {{ truncatedPeerId }}
                <span class="material-symbols-outlined copy-icon">content_copy</span>
              </span>
            </div>
<hr />
            <div class="status-row">
              <span class="status-label">Connected Peers</span>
              <span class="status-value">{{ p2pStatus.connectedPeers || 0 }}</span>
            </div>
<hr />
            <div class="status-row">
              <span class="status-label">NAT Status</span>
              <span class="status-value" :class="natStatusClass">
                <span class="material-symbols-outlined mr-1">
                  {{ p2pStatus.natStatus === 'public' ? 'public' : p2pStatus.natStatus === 'relayed' ? 'sync_alt' : 'help' }}
                </span>
                {{ formatNatStatus(p2pStatus.natStatus) }}
              </span>
            </div>
<hr />
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
        <div class="control-buttons mb-5">
          <button
            v-if="!p2pStatus.started"
            class="button is-success is-medium"
            @click="startP2P"
            :disabled="isStarting"
          >
            <span v-if="isStarting" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">play_arrow</span>
            {{ isStarting ? 'Starting...' : 'Start Node' }}
          </button>

          <button
            v-else
            class="button is-danger is-medium"
            @click="stopP2P"
            :disabled="isStopping"
          >
            <span v-if="isStopping" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">stop</span>
            {{ isStopping ? 'Stopping...' : 'Stop Node' }}
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

      <hr />

      <!-- Provider Settings (when in provider mode) -->
      <div class="provider-section mt-5" v-if="networkMode === 'provider' && p2pStatus.started">
        <h2 class="section-title fira-sans-condensed-black-italic">
          Pipeline Pricing (USDC)
        </h2>

        <div class="pricing-grid">
          <!-- LLM -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">chat</span>
              <span class="pricing-name">LLM</span>
            </div>
            <div class="pricing-input">
              <input
                type="number"
                class="input"
                v-model.number="pipelinePricing.llm"
                step="0.0001"
                min="0"
                placeholder="0.0001"
              />
              <span class="pricing-unit">/ 1K tokens</span>
            </div>
          </div>

          <!-- Image -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">image</span>
              <span class="pricing-name">Image</span>
            </div>
            <div class="pricing-input">
              <input
                type="number"
                class="input"
                v-model.number="pipelinePricing.image"
                step="0.001"
                min="0"
                placeholder="0.01"
              />
              <span class="pricing-unit">/ image</span>
            </div>
          </div>

          <!-- Audio (TTS) -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">record_voice_over</span>
              <span class="pricing-name">Audio</span>
            </div>
            <div class="pricing-input">
              <input
                type="number"
                class="input"
                v-model.number="pipelinePricing.audio"
                step="0.0001"
                min="0"
                placeholder="0.001"
              />
              <span class="pricing-unit">/ second</span>
            </div>
          </div>

          <!-- Music -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">music_note</span>
              <span class="pricing-name">Music</span>
            </div>
            <div class="pricing-input">
              <input
                type="number"
                class="input"
                v-model.number="pipelinePricing.music"
                step="0.01"
                min="0"
                placeholder="0.05"
              />
              <span class="pricing-unit">/ second</span>
            </div>
          </div>

          <!-- Video -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">movie</span>
              <span class="pricing-name">Video</span>
            </div>
            <div class="pricing-input">
              <input
                type="number"
                class="input"
                v-model.number="pipelinePricing.video"
                step="0.01"
                min="0"
                placeholder="0.10"
              />
              <span class="pricing-unit">/ second</span>
            </div>
          </div>

          <!-- Vision -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">visibility</span>
              <span class="pricing-name">Vision</span>
            </div>
            <div class="pricing-input">
              <input
                type="number"
                class="input"
                v-model.number="pipelinePricing.vision"
                step="0.001"
                min="0"
                placeholder="0.005"
              />
              <span class="pricing-unit">/ image</span>
            </div>
          </div>

          <!-- Companions -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">self_improvement</span>
              <span class="pricing-name">Companions</span>
            </div>
            <div class="pricing-input">
              <input
                type="number"
                class="input"
                v-model.number="pipelinePricing.companions"
                step="0.001"
                min="0"
                placeholder="0.02"
              />
              <span class="pricing-unit">/ message</span>
            </div>
            <span class="pricing-note">Includes LLM + optional audio/image</span>
          </div>
        </div>

        <hr class="mt-5 mb-5" />

        <h2 class="section-title fira-sans-condensed-black-italic">
          Relay Settings
        </h2>

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

      <hr />

      <!-- Self-Test (Local Inference Routing) -->
      <div class="test-section mt-5">
        <h2 class="section-title fira-sans-condensed-black-italic">
          Network Test
        </h2>

        <div class="test-panel">
          
          <button
            class="button is-success is-medium"
            @click="runSelfTest"
            :disabled="isSelfTesting"
          >
            <span v-if="isSelfTesting" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">monitor_heart</span>
            {{ isSelfTesting ? 'Testing...' : 'Run' }}
          </button>

          <div v-if="selfTestResults" class="self-test-results mt-4">
            <!-- Flask Server (Diffusion) -->
            <div class="test-result-row" :class="{ success: selfTestResults.flask?.ok, error: !selfTestResults.flask?.ok }">
              <span
                class="material-symbols-outlined mr-2 test-icon"
                :class="selfTestResults.flask?.ok ? 'icon-success' : 'icon-error'"
              >
                {{ selfTestResults.flask?.ok ? 'check_circle' : 'error' }}
              </span>
              <div class="test-result-content">
                <strong>Flask Server (Port 65000)</strong>
                <span class="test-result-detail">
                  {{ selfTestResults.flask?.ok ? `Image, Audio, Video & Companion Pipelines` : (selfTestResults.flask?.error || 'Not responding') }}
                </span>
                <div v-if="selfTestResults.flask?.pipelines?.length" class="pipeline-tags">
                  <span v-for="p in selfTestResults.flask.pipelines" :key="p" class="pipeline-tag">{{ p }}</span>
                </div>
              </div>
            </div>

            <!-- OpenClaw Server (LLM) -->
            <div class="test-result-row" :class="{ success: selfTestResults.openclaw?.ok, error: !selfTestResults.openclaw?.ok, warning: selfTestResults.openclaw?.error === 'OpenClaw not enabled' }">
              <span
                class="material-symbols-outlined mr-2 test-icon"
                :class="selfTestResults.openclaw?.ok ? 'icon-success' : (selfTestResults.openclaw?.error === 'OpenClaw not enabled' ? 'icon-warning' : 'icon-error')"
              >
                {{ selfTestResults.openclaw?.ok ? 'check_circle' : (selfTestResults.openclaw?.error === 'OpenClaw not enabled' ? 'info' : 'error') }}
              </span>
              <div class="test-result-content">
                <strong>OpenClaw Server (Port 3002)</strong>
                <span class="test-result-detail">
                  {{ selfTestResults.openclaw?.ok ? `Text Generation & Chat` : (selfTestResults.openclaw?.error || 'Not responding') }}
                </span>
              </div>
            </div>

            <!-- P2P Node -->
            <div class="test-result-row" :class="{ success: selfTestResults.p2p?.ok, error: !selfTestResults.p2p?.ok }">
              <span
                class="material-symbols-outlined mr-2 test-icon"
                :class="selfTestResults.p2p?.ok ? 'icon-success' : 'icon-error'"
              >
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
              <span
                class="material-symbols-outlined mr-2 test-icon"
                :class="selfTestResults.ready ? 'icon-success' : 'icon-warning'"
              >
                {{ selfTestResults.ready ? 'rocket_launch' : 'warning' }}
              </span>
              <span class="has-text-white" v-if="selfTestResults.ready">
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
        <hr />
        <h2 class="section-title fira-sans-condensed-black-italic mt-5">
          Peer Connection Test
        </h2>

        <div class="test-panel">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input
                type="text"
                class="input is-large"
                v-model="testPeerId"
                placeholder="Enter peer ID to test connection (12D3KooW...)"
              />
            </div>
            <div class="control">
              <button
                class="button is-success is-large"
                @click="testConnection"
                :disabled="!testPeerId || isTesting"
                style="box-shadow: none;"
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

// Per-pipeline pricing (USDC)
const pipelinePricing = ref({
  llm: 0.0001,        // per 1K tokens
  image: 0.01,        // per image
  audio: 0.001,       // per second
  music: 0.05,        // per second
  video: 0.10,        // per second
  vision: 0.005,      // per image
  companions: 0.02,   // per message (includes LLM + optional media)
});

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

      // Save pipeline pricing
      await window.electronAPI.store.set('p2p.pipelinePricing', JSON.stringify(pipelinePricing.value));
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
    const savedPricing = await window.electronAPI.store.get('p2p.pipelinePricing', null);
    const savedRelay = await window.electronAPI.store.get('p2p.enableRelay', false);
    const savedRelayFee = await window.electronAPI.store.get('p2p.relayFee', 5);

    networkMode.value = savedMode;

    // Load pipeline pricing (merge with defaults to handle new pipelines)
    if (savedPricing) {
      try {
        const parsed = JSON.parse(savedPricing);
        pipelinePricing.value = { ...pipelinePricing.value, ...parsed };
      } catch (e) {
        console.warn('[NetworkSettings] Failed to parse saved pricing:', e);
      }
    }

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
/* BonzAI Design System - Matches Access Level Modal */
:root {
  --bonzai-bg-dark: #0a0a0f;
  --bonzai-bg-card: rgba(20, 20, 30, 0.92);
  --bonzai-green: #10b981;
  --bonzai-green-glow: rgba(16, 185, 129, 0.3);
  --bonzai-purple: #8b5cf6;
  --bonzai-text: #f0f0f5;
  --bonzai-text-muted: rgba(240, 240, 245, 0.7);
  --bonzai-border: rgba(255, 255, 255, 0.1);
  --bonzai-radius: 12px;
}

hr {
  margin: 12px 0;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 1),
    transparent
  );
}

.network-settings {
  padding: 24px;
  overflow-y: auto;
  background: transparent;
  color: #fff;
}

.panel {
  max-width: 800px;
  margin: 0 auto;
}

.panel-header {
  margin-bottom: 24px;
  text-align: center;
}

.panel-header .subtitle {
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
  line-height: 1.5;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.25rem;
  color: #fff;
  margin-bottom: 16px;
}

.section-title .material-symbols-outlined {
  color: var(--bonzai-green);
}

/* Network Mode Selector - Generative Style */
.network-mode-section {
  margin-bottom: 32px;
}

.mode-selector input[type="radio"] {
  display: none;
}

.mode-selector input[type="radio"] + label {
  padding: 8px 16px 12px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.mode-selector input[type="radio"] + label:hover {
  color: rgba(255, 255, 255, 0.6) !important;
  border-color: rgba(255, 255, 255, 0.5);
}

.mode-selector input[type="radio"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
}

.mode-selector input[type="radio"] + label .material-symbols-outlined {
  color: inherit;
}

/* Status Panel */
.status-section {
  margin-bottom: 32px;
}

.status-panel {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--bonzai-border);
  border-radius: 10px;
  padding: 20px;
}

.status-panel.online {
  border-color: rgba(16, 185, 129, 0.25);
  animation: pulseGreen 2s infinite;
}

.status-panel.offline {
  border-color: rgba(241, 70, 104, 0.25);
  animation: pulseRed 2s infinite;
}

@keyframes pulseGreen {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.1); }
  50% { box-shadow: 0 0 0 64px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

@keyframes pulseRed {
  0% { box-shadow: 0 0 0 0 rgba(241, 70, 104, 0.1); }
  50% { box-shadow: 0 0 0 8px rgba(241, 70, 104, 0); }
  100% { box-shadow: 0 0 0 0 rgba(241, 70, 104, 0); }
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  color: #fff !important;
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
  background: var(--bonzai-green);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.peer-id {
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
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

.nat-public { color: var(--bonzai-green); }
.nat-relayed { color: #f59e0b; }
.nat-unknown { color: rgba(255, 255, 255, 0.5); }

.multiaddrs {
  margin-top: 12px;
  padding-top: 12px;
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
  background: rgba(0, 0, 0, 0.3);
  padding: 6px 10px;
  border-radius: 6px;
  word-break: break-all;
  font-family: 'JetBrains Mono', monospace;
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

/* Pipeline Pricing Grid */
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.pricing-item {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--bonzai-border);
  border-radius: 10px;
  padding: 16px;
  transition: all 0.2s;
}

.pricing-item:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.pricing-item.featured {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.05);
}

.pricing-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.pricing-header .material-symbols-outlined {
  color: rgba(255, 255, 255, 0.7);
  font-size: 24px;
}

.pricing-item.featured .pricing-header .material-symbols-outlined {
  color: var(--bonzai-green);
}

.pricing-name {
  color: #fff;
  font-weight: 600;
  font-size: 1rem;
}

.pricing-badge {
  background: var(--bonzai-green);
  color: #000;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  text-transform: uppercase;
  margin-left: auto;
}

.pricing-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pricing-input .input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  font-size: 0.95rem;
}

.pricing-unit {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8rem;
  white-space: nowrap;
}

.pricing-note {
  display: block;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.75rem;
  margin-top: 8px;
}

.setting-group {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--bonzai-border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 12px;
  font-weight: 500;
}

.setting-label .material-symbols-outlined {
  color: var(--bonzai-green);
}

.setting-hint {
  color: var(--bonzai-green);
  font-size: 0.85rem;
  margin-top: 8px;
  font-weight: 500;
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
  background: var(--bonzai-green);
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

.test-result {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 8px;
}

.test-result.success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: var(--bonzai-green);
}

.test-result.error {
  background: rgba(170, 170, 170, 0.12);
  border: 1px solid rgba(241, 70, 104, 0.25);
  color: #f14668;
}

.test-description {
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 16px;
  font-size: 0.95rem;
  line-height: 1.5;
}

.self-test-results {
  padding-top: 16px;
}

.test-result-row {
  display: flex;
  align-items: flex-start;
  padding: 14px;
  border-radius: 10px;
  margin-bottom: 10px;
}

.test-result-row.success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.test-result-row.error {
  background: rgba(241, 70, 104, 0.12);
  border: 1px solid rgba(241, 70, 104, 0.25);
}

.test-result-row .material-symbols-outlined {
  flex-shrink: 0;
  margin-top: 2px;
}

/* Test Icon Colors */
.test-icon.icon-success {
  color: #10b981 !important;
}

.test-icon.icon-error {
  color: #f14668 !important;
}

.test-icon.icon-warning {
  color: #f59e0b !important;
}

.test-result-row.warning {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
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
  margin-top: 8px;
}

.pipeline-tag {
  background: rgba(16, 185, 129, 0.2);
  color: var(--bonzai-green);
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 999px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}

.overall-status {
  display: flex;
  align-items: center;
  padding: 16px;
  border-radius: 10px;
  font-weight: 600;
}

.overall-status.ready {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: var(--bonzai-green);
  animation: pulseGreen 2s infinite;
}

.overall-status.not-ready {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #f59e0b;
}

/* Input styling to match modal */
.input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--bonzai-border);
  border-radius: 8px;
  color: #fff;
  padding: 10px 14px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: var(--bonzai-green);
}

.input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

/* Field addons */
.field.has-addons {
  display: flex;
}

.field.has-addons input {
  height: 58px;
}

.field.has-addons .control.is-expanded {
  flex: 1;
}

.field.has-addons .control.is-expanded .input {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.field.has-addons .control:last-child .button {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
</style>
