<template>
  <div class="bz-tab-shell harness-view">
    <header class="harness-hero">
      <div>
        <p class="bz-eyebrow">Harness</p>
        <h1 class="bz-h1 fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined bz-title-icon" aria-hidden="true">device_hub</span>
          Gateway Control
        </h1>
      </div>
      <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="refreshAll">
        <span class="material-symbols-outlined" :class="{ spinning: refreshing }">sync</span>
        Refresh
      </button>
    </header>

    <section class="harness-grid">
      <article v-for="gateway in gateways" :key="gateway.id" class="harness-card">
        <div class="harness-card__head">
          <span class="material-symbols-outlined">{{ gateway.icon }}</span>
          <div>
            <h2 class="bz-h3">{{ gateway.name }}</h2>
            <p>{{ gateway.desc }}</p>
          </div>
          <span class="harness-status" :class="gateway.enabled ? 'is-on' : gateway.installed ? 'is-muted' : 'is-off'">
            {{ gateway.installed ? (gateway.enabled ? "Enabled" : "Installed") : "Not installed" }}
          </span>
        </div>
        <button
          class="bz-btn bz-btn--sm fira-sans-condensed-black-italic"
          :class="gateway.enabled ? 'bz-btn--destructive' : 'bz-btn--success'"
          :disabled="gateway.busy || !gateway.installed"
          @click="toggleGateway(gateway.id)"
        >
          <span class="material-symbols-outlined">{{ gateway.enabled ? "power_settings_new" : "bolt" }}</span>
          {{ gateway.enabled ? "Disable" : "Enable" }}
        </button>
      </article>
    </section>

    <section class="harness-panel">
      <div class="section-head">
        <h2 class="panel-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">terminal</span>
          Commands
        </h2>
        <p class="section-head__hint">Commands are available from OpenClaw and Hermes messaging sessions once the integration is enabled.</p>
      </div>
      <div class="command-grid">
        <div v-for="cmd in commands" :key="cmd.name" class="command-row">
          <code>{{ cmd.name }}</code>
          <span>{{ cmd.desc }}</span>
        </div>
      </div>
    </section>

    <section class="harness-panel">
      <div class="section-head">
        <h2 class="panel-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">route</span>
          Runtime
        </h2>
      </div>
      <div class="runtime-grid">
        <div class="runtime-item">
          <span>OpenAI-compatible API</span>
          <strong>localhost:3002</strong>
        </div>
        <div class="runtime-item">
          <span>Loaded LLM</span>
          <strong>{{ llama.running ? llama.modelName || "Running" : "Not loaded" }}</strong>
        </div>
        <div class="runtime-item">
          <span>P2P node</span>
          <strong>{{ p2p.started ? `${p2p.connectedPeers || 0} peers` : "Private / offline" }}</strong>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

const refreshing = ref(false);
const openclaw = reactive({ installed: false, enabled: false, busy: false });
const hermes = reactive({ installed: false, enabled: false, busy: false });
const llama = reactive({ running: false, modelName: "", port: null });
const p2p = reactive({ started: false, connectedPeers: 0 });

const gateways = computed(() => [
  { id: "openclaw", name: "OpenClaw", icon: "forum", desc: "WhatsApp, Telegram, Discord, and Mattermost gateway.", ...openclaw },
  { id: "hermes", name: "Hermes", icon: "psychology", desc: "Agent command surface and local BonzAI skill bridge.", ...hermes },
]);

const commands = [
  { name: "!status", desc: "Show the current session, loaded model, and gateway state." },
  { name: "!help", desc: "List available BonzAI commands inside the messaging client." },
  { name: "!network status", desc: "Inspect P2P mode, node status, and provider routing." },
  { name: "!mint status", desc: "Check collectible minting status for the current session." },
  { name: "/v1/chat/completions", desc: "OpenAI-compatible LLM endpoint for external tools." },
  { name: "/webhook", desc: "OpenClaw/Hermes webhook entry for multimodal companion requests." },
];

async function refreshAll() {
  refreshing.value = true;
  try {
    openclaw.installed = !!(await window.electronAPI?.openclawIsInstalled?.());
    hermes.installed = !!(await window.electronAPI?.hermesIsInstalled?.());
    openclaw.enabled = openclaw.installed && !!(await window.electronAPI?.openclawGetEnabled?.());
    hermes.enabled = hermes.installed && !!(await window.electronAPI?.hermesGetEnabled?.());
    Object.assign(llama, await window.electronAPI?.llamaRuntimeStatus?.() || {});
    const p2pStatus = await window.electronAPI?.p2pStatus?.();
    if (p2pStatus?.ok) Object.assign(p2p, p2pStatus);
  } finally {
    refreshing.value = false;
  }
}

async function toggleGateway(id) {
  const target = id === "openclaw" ? openclaw : hermes;
  target.busy = true;
  try {
    const next = !target.enabled;
    const res = id === "openclaw"
      ? await window.electronAPI.openclawSetEnabled(next)
      : await window.electronAPI.hermesSetEnabled(next);
    if (res?.success !== false) target.enabled = next;
  } finally {
    target.busy = false;
  }
}

onMounted(refreshAll);
</script>

<style scoped>
.harness-view {
  overflow-y: auto;
  padding: var(--bz-space-6);
  gap: var(--bz-space-5);
}
.harness-hero,
.harness-card,
.harness-panel {
  border: 1px solid var(--bz-border);
  background: var(--bz-panel);
}
.harness-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--bz-space-6);
}
.harness-grid,
.runtime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--bz-space-4);
}
.harness-card,
.harness-panel {
  padding: var(--bz-space-5);
}
.harness-card__head {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: var(--bz-space-3);
  align-items: start;
  margin-bottom: var(--bz-space-4);
}
.harness-card__head p,
.section-head__hint,
.runtime-item span {
  color: var(--bz-fg-low);
  margin: 0;
}
.harness-status {
  font-size: var(--bz-size-micro);
  color: var(--bz-fg-low);
  border: 1px solid var(--bz-border);
  padding: 4px 8px;
}
.harness-status.is-on {
  color: var(--bz-emerald-500);
  border-color: var(--bz-emerald-500);
}
.harness-status.is-off {
  color: var(--bz-warning);
}
.command-grid {
  display: grid;
  gap: var(--bz-space-2);
}
.command-row,
.runtime-item {
  display: flex;
  justify-content: space-between;
  gap: var(--bz-space-4);
  padding: var(--bz-space-3);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
}
.command-row span {
  color: var(--bz-fg-mid);
  text-align: right;
}
code {
  color: var(--bz-purple-300);
}
</style>
