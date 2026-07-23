<template>
  <div class="bz-tab-shell harness-view">
    <header class="harness-hero">
      <div>
        <p class="bz-eyebrow">External access</p>
        <h1 class="bz-h1">Harness</h1>
        <p class="harness-hero__copy">Manage messaging gateways and command access.</p>
      </div>
      <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="refreshAll">
        <span class="material-symbols-outlined" :class="{ spinning: refreshing }">sync</span>
        Refresh
      </button>
    </header>

    <section class="harness-status-grid" aria-label="Gateway status">
      <article v-for="gateway in gateways" :key="gateway.id" class="harness-gateway">
        <div class="harness-gateway__head">
          <div>
            <p class="bz-eyebrow">{{ gateway.id }}</p>
            <h2 class="bz-h2 fira-sans-condensed-black-italic">{{ gateway.name }}</h2>
            <p>{{ gateway.desc }}</p>
          </div>
          <span class="harness-status" :class="gateway.enabled ? 'is-on' : gateway.installed ? 'is-muted' : 'is-off'">
            {{ gateway.installed ? (gateway.enabled ? "Enabled" : "Installed") : "Not installed" }}
          </span>
        </div>
        <div class="harness-gateway__meta">
          <span class="bz-mono">{{ gateway.port }}</span>
          <span>{{ gateway.protocol }}</span>
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

    <section class="harness-runtime">
      <div class="runtime-item">
        <span>OpenAI-compatible API</span>
        <strong class="bz-mono">localhost:3002</strong>
      </div>
      <div class="runtime-item">
        <span>Loaded LLM</span>
        <strong>{{ llama.running ? llama.modelName || "Running" : "Not loaded" }}</strong>
      </div>
      <div class="runtime-item">
        <span>P2P node</span>
        <strong>{{ p2p.started ? `${p2p.connectedPeers || 0} peers` : "Private / offline" }}</strong>
      </div>
    </section>

    <section class="harness-panel">
      <div class="harness-section-head">
        <div>
          <p class="bz-eyebrow">Command surface</p>
          <h2 class="bz-h2 fira-sans-condensed-black-italic">Commands</h2>
        </div>
        <p>Use <code>!bonzai</code> in OpenClaw channels or <code>/bonzai</code> in Hermes.</p>
      </div>

      <div class="command-groups">
        <article v-for="group in commandGroups" :key="group.title" class="command-group">
          <h3 class="bz-h2 fira-sans-condensed-black-italic">{{ group.title }}</h3>
          <div class="command-list">
            <div v-for="cmd in group.items" :key="cmd.name" class="command-row">
              <code>{{ cmd.name }}</code>
              <span>{{ cmd.desc }}</span>
            </div>
          </div>
        </article>
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
  { id: "openclaw", name: "OpenClaw", port: "18789", protocol: "Messaging webhook", desc: "WhatsApp, Telegram, Discord, and Mattermost gateway.", ...openclaw },
  { id: "hermes", name: "Hermes", port: "/bonzai", protocol: "Structured command bridge", desc: "Agent command surface and local BonzAI skill bridge.", ...hermes },
]);

const commandGroups = [
  {
    title: "Session",
    items: [
      { name: "!bonzai status", desc: "Show companion, scenario, content level, model, media toggles, and network mode." },
      { name: "!bonzai help", desc: "List the full command menu in the current messaging client." },
      { name: "!bonzai reset", desc: "Clear conversation history and restore the pre-roleplay model." },
      { name: "!bonzai models", desc: "List available LLM models." },
    ],
  },
  {
    title: "Model",
    items: [
      { name: "!bonzai model <name>", desc: "Load a specific local LLM." },
      { name: "!bonzai model restore", desc: "Restore the model that was loaded before companion chat." },
      { name: "/v1/chat/completions", desc: "OpenAI-compatible endpoint for external tools." },
      { name: "/webhook", desc: "Webhook entry for OpenClaw and Hermes requests." },
    ],
  },
  {
    title: "Roleplay",
    items: [
      { name: "!bonzai companion list", desc: "List available companions." },
      { name: "!bonzai companion select <name>", desc: "Bind a companion to the current channel." },
      { name: "!bonzai scenario list", desc: "List available scenarios." },
      { name: "!bonzai scenario select <name>", desc: "Set the current scene." },
      { name: "!bonzai settings <audio|images|video|music> <on|off>", desc: "Toggle multimodal generation per channel." },
      { name: "!bonzai settings level <pg|pg13|mature|adult>", desc: "Set the content level." },
    ],
  },
  {
    title: "Generation",
    items: [
      { name: "!bonzai generate image <prompt>", desc: "Fast image generation with FLUX Klein." },
      { name: "!bonzai generate image_quality <prompt>", desc: "Quality image generation with Z-Image Turbo." },
      { name: "!bonzai generate image_standard <prompt>", desc: "Standard SDXL image generation." },
      { name: "!bonzai generate video <prompt>", desc: "Video generation with LTX-2." },
      { name: "!bonzai generate audio <text>", desc: "Fast TTS." },
      { name: "!bonzai generate audio_quality <text>", desc: "Quality Qwen TTS." },
      { name: "!bonzai generate music <prompt>", desc: "Music generation with ACE-Step." },
      { name: "!bonzai generate vision", desc: "Analyze the attached image with Qwen3-VL." },
    ],
  },
  {
    title: "Ownership and skills",
    items: [
      { name: "!bonzai mint bare [gender]", desc: "Mint a bare companion NFT." },
      { name: "!bonzai mint companion <name>", desc: "Mint a complete companion." },
      { name: "!bonzai mint status", desc: "Check minting status and owned companions." },
      { name: "!bonzai mint finalize <tokenId>", desc: "Finalize a bare companion." },
      { name: "!bonzai skill list [category]", desc: "List BonzAI skills." },
      { name: "!bonzai skill info <id>", desc: "Show skill details." },
      { name: "!bonzai skill run <id> [inputs]", desc: "Execute a skill." },
    ],
  },
  {
    title: "Autonomy and network",
    items: [
      { name: "!bonzai autonomous on|off", desc: "Toggle autonomous mode." },
      { name: "!bonzai autonomous status", desc: "Show current autonomous configuration." },
      { name: "!bonzai autonomous config <setting> <value>", desc: "Configure idle, interval, or max behavior." },
      { name: "!bonzai network", desc: "Show mode, providers, pipelines, and peer routing." },
      { name: "!bonzai mode", desc: "Alias for network status." },
    ],
  },
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
.harness-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--bz-space-6);
  padding-bottom: var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
}
.harness-hero__copy {
  max-width: 72ch;
  margin: var(--bz-space-2) 0 0;
  color: var(--bz-fg-mid);
  line-height: 1.55;
}
.harness-status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-4);
}
.harness-gateway,
.harness-panel,
.harness-runtime {
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
}
.harness-gateway {
  display: grid;
  gap: var(--bz-space-3);
}
.harness-gateway__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--bz-space-3);
  align-items: start;
}
.harness-gateway__head h2 {
  margin: var(--bz-space-1) 0;
}
.harness-gateway__head p,
.harness-section-head p,
.runtime-item span {
  color: var(--bz-fg-low);
  margin: 0;
}
.harness-gateway__meta {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}
.harness-status {
  font-size: var(--bz-size-micro);
  color: var(--bz-fg-low);
  border: 1px solid var(--bz-border);
  padding: 4px 8px;
  border-radius: var(--bz-r-sm);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.harness-status.is-on {
  color: var(--bz-emerald-500);
  border-color: var(--bz-emerald-500);
  background: var(--bz-emerald-soft);
}
.harness-status.is-off {
  color: var(--bz-warning);
  border-color: var(--bz-warning);
  background: var(--bz-warning-soft);
}
.harness-runtime {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
}
.runtime-item {
  min-width: 0;
  display: grid;
  gap: var(--bz-space-1);
  padding: var(--bz-space-3);
  background: transparent;
  border-right: 1px solid var(--bz-border);
}
.runtime-item:last-child { border-right: 0; }
.runtime-item strong {
  color: var(--bz-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.harness-section-head {
  display: flex;
  justify-content: space-between;
  gap: var(--bz-space-5);
  align-items: end;
  padding-bottom: var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
}
.harness-section-head h2 {
  margin: var(--bz-space-1) 0 0;
}
.command-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-4);
  margin-top: var(--bz-space-4);
}
.command-group {
  min-width: 0;
  padding: var(--bz-space-4);
  border-top: 1px solid var(--bz-border);
}
.command-group h3 {
  margin: 0 0 var(--bz-space-3);
}
.command-list {
  display: grid;
  gap: var(--bz-space-2);
}
.command-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(0, 1fr);
  gap: var(--bz-space-3);
  align-items: start;
  padding: var(--bz-space-3);
  background: transparent;
  border-top: 1px solid var(--bz-border);
}
.command-row:first-child { border-top: 0; }
.command-row span {
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1.4;
}
code {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
  color: var(--bz-fg);
  font-family: var(--bz-font-mono);
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
  user-select: text;
}
@media (max-width: 980px) {
  .harness-status-grid,
  .harness-runtime,
  .command-groups {
    grid-template-columns: 1fr;
  }
  .harness-hero,
  .harness-section-head {
    flex-direction: column;
    align-items: stretch;
  }
}
@media (max-width: 640px) {
  .harness-view {
    padding: var(--bz-space-4);
  }
  .command-row {
    grid-template-columns: 1fr;
  }
}
</style>
