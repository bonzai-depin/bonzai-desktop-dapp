<template>
  <div class="bz-tab-shell harness-view bz-page-content">
    <header class="harness-hero bz-page-header">
      <div>
        <p class="bz-eyebrow">{{ t("harness.eyebrow") }}</p>
        <h1 class="bz-h1"><span class="material-symbols-outlined bz-title-icon" aria-hidden="true">terminal</span> {{ t("harness.title") }}</h1>
      </div>
      <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" :disabled="refreshing || !desktopAvailable" @click="refreshAll">
        <span class="material-symbols-outlined" :class="{ spinning: refreshing }">sync</span>
        {{ t("common.refresh") }}
      </button>
    </header>

    <p v-if="!desktopAvailable" class="harness-setup-copy" role="status">{{ t("rcWorkflows.desktopRequired") }}</p>
    <p v-if="errorMessage" class="harness-error" role="alert">{{ errorMessage }}</p>

    <section class="harness-local" aria-live="polite">
      <div>
        <p class="bz-eyebrow">{{ t("harness.localGateway") }}</p>
        <div class="harness-copy-row"><strong class="bz-mono">{{ gateway.baseUrl }}</strong><button type="button" class="bz-btn bz-btn--sm bz-btn--ghost" @click="copyText(gateway.baseUrl)">{{ t("rcWorkflows.copy") }}</button></div>
        <p>{{ t("harness.loopbackCopy") }}</p>
      </div>
      <span class="harness-status" :class="gateway.listening ? 'is-on' : 'is-off'">
        {{ !statusChecked ? t("rcLicenses.unknown") : gateway.listening ? t("harness.online") : t("harness.offline") }}
      </span>
    </section>

    <p v-if="copyMessage" role="status" class="harness-copy-status">{{ copyMessage }}</p>

    <section class="harness-status-grid" :aria-label="t('rcWorkflows.integrationStatus')">
      <article v-for="gateway in gateways" :key="gateway.id" class="harness-gateway">
        <div class="harness-gateway__head">
          <div>
            <p class="bz-eyebrow">{{ gateway.id }}</p>
            <h2 class="bz-h2 fira-sans-condensed-black-italic">{{ gateway.name }}</h2>
            <p>{{ gateway.desc }}</p>
          </div>
          <span class="harness-status" :class="gateway.enabled ? 'is-on' : gateway.installed ? 'is-muted' : 'is-off'">
            {{ integrationStatusLabel(gateway) }}
          </span>
        </div>
        <div class="harness-gateway__meta">
          <span class="bz-mono">{{ gateway.port }}</span>
          <span>{{ gateway.protocol }}</span>
        </div>
        <ol class="harness-setup">
          <li :class="{ 'is-complete': gateway.installed }">{{ t("rcWorkflows.installStep") }}</li>
          <li :class="{ 'is-complete': gateway.configured }">{{ t("rcWorkflows.configureStep") }}</li>
          <li :class="{ 'is-complete': testPassed }">{{ t("rcWorkflows.testStep") }}</li>
        </ol>
        <p class="harness-setup-copy">{{ t(gateway.installed ? "rcWorkflows.configureHint" : "rcWorkflows.installHint", { path: gateway.configPath }) }}</p>
        <div class="harness-actions">
          <button v-if="!gateway.installed" type="button" class="bz-btn bz-btn--sm bz-btn--primary" @click="openSetupGuide(gateway.installUrl)">{{ t("rcWorkflows.installGuide") }} ↗</button>
          <button type="button" class="bz-btn bz-btn--sm bz-btn--ghost" :disabled="refreshing || !desktopAvailable" @click="refreshAll">{{ t("rcWorkflows.verify") }}</button>
          <button
            class="bz-btn bz-btn--sm fira-sans-condensed-black-italic"
            :class="gateway.enabled ? 'bz-btn--destructive' : 'bz-btn--success'"
            v-if="gateway.installed"
            :disabled="gateway.busy || !desktopAvailable"
            @click="toggleGateway(gateway.id)"
          >
            <span class="material-symbols-outlined">{{ gateway.enabled ? "power_settings_new" : "bolt" }}</span>
            {{ gateway.enabled ? t("harness.disable") : t("harness.enable") }}
          </button>
          <button
            class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
            v-if="gateway.enabled"
            :disabled="gateway.busy || !desktopAvailable"
            @click="syncGateway(gateway.id)"
          >
            <span class="material-symbols-outlined">sync</span>
            {{ t("harness.sync") }}
          </button>
        </div>
        <details class="harness-diagnostics">
          <summary>{{ t("rcWorkflows.diagnostics") }}</summary>
          <p>{{ t("rcWorkflows.diagnosticsHint") }}</p>
          <div class="harness-copy-row"><code>{{ gateway.id }} doctor</code><button type="button" class="bz-btn bz-btn--sm bz-btn--ghost" @click="copyText(`${gateway.id} doctor`)">{{ t("rcWorkflows.copy") }}</button></div>
          <code>{{ gateway.configPath }}</code>
        </details>
      </article>
    </section>

    <section class="harness-test">
      <div><strong>{{ t("rcWorkflows.testGateway") }}</strong><p>{{ t("rcWorkflows.testHint") }}</p></div>
      <button type="button" class="bz-btn bz-btn--ghost" :disabled="testing || !desktopAvailable" @click="testGateway">{{ t(testing ? "rcWorkflows.testing" : "rcWorkflows.test") }}</button>
      <p v-if="testMessage" role="status">{{ testMessage }}</p>
    </section>

    <section class="harness-runtime">
      <div class="runtime-item">
        <span>{{ t("harness.apiLabel") }}</span>
        <strong class="bz-mono">{{ gateway.baseUrl }}</strong>
      </div>
      <div class="runtime-item">
        <span>{{ t("harness.loadedModel") }}</span>
        <strong>{{ llama.running ? llama.modelName || t("harness.online") : t("network.noModel") }}</strong>
      </div>
      <div class="runtime-item">
        <span>{{ t("harness.p2pNode") }}</span>
        <strong>{{ p2p.started ? `${p2p.connectedPeers || 0} peers` : t("harness.privateOffline") }}</strong>
      </div>
    </section>

    <details class="harness-panel">
      <summary class="harness-section-head">
        <div>
          <p class="bz-eyebrow">{{ t("harness.commandSurface") }}</p>
          <h2 class="bz-h2 fira-sans-condensed-black-italic">{{ t("harness.commands") }}</h2>
        </div>
        <p>{{ t("harness.commandHint") }}</p>
      </summary>
      <label class="harness-command-search" for="harness-command-search">{{ t("rcWorkflows.searchCommands") }}
        <input id="harness-command-search" v-model="commandQuery" type="search" class="input" :placeholder="t('rcWorkflows.searchCommands')" />
      </label>
      <p v-if="!filteredCommandGroups.length" role="status">{{ t("rcWorkflows.noCommands") }}</p>
      <div class="command-groups">
        <article v-for="group in filteredCommandGroups" :key="group.title" class="command-group">
          <h3 class="bz-h2 fira-sans-condensed-black-italic">{{ group.title }}</h3>
          <div class="command-list">
            <div v-for="cmd in group.items" :key="cmd.name" class="command-row">
              <code>{{ cmd.name }}</code>
              <span>{{ cmd.desc }}</span>
              <button type="button" class="bz-btn bz-btn--sm bz-btn--ghost" :aria-label="`${t('rcWorkflows.copy')} ${cmd.name}`" @click="copyText(cmd.name)">{{ t("rcWorkflows.copy") }}</button>
            </div>
          </div>
        </article>
      </div>
    </details>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "../i18n/index.js";
import { withTimeout } from "../utils/withTimeout.js";

const { t } = useI18n();
const refreshing = ref(false);
const statusChecked = ref(false);
const desktopAvailable = Boolean(window.electronAPI?.harnessGetStatus);
const commandQuery = ref("");
const copyMessage = ref("");
const testing = ref(false);
const testMessage = ref("");
const testPassed = ref(false);
const errorMessage = ref("");
const gateway = reactive({ listening: false, baseUrl: "http://127.0.0.1:3002/v1", webhookUrl: "", exposure: "loopback" });
const openclaw = reactive({ installed: false, enabled: false, configured: false, busy: false });
const hermes = reactive({ installed: false, enabled: false, configured: false, busy: false });
const llama = reactive({ running: false, modelName: "", port: null });
const p2p = reactive({ started: false, connectedPeers: 0 });

const gateways = computed(() => [
  { id: "openclaw", name: "OpenClaw", installUrl: "https://docs.openclaw.ai/install", configPath: "~/.openclaw", port: "/webhook", protocol: "Messaging + OpenAI API", desc: t("harness.openclawDesc"), ...openclaw },
  { id: "hermes", name: "Hermes", installUrl: "https://hermes-agent.nousresearch.com/docs/getting-started/installation/", configPath: "~/.hermes", port: "!bonzai", protocol: "Skill + OpenAI API", desc: t("harness.hermesDesc"), ...hermes },
]);

function applyHarnessStatus(status) {
  if (!status || !status.gateway || !status.integrations) throw new Error("Unable to read local integration status.");
  statusChecked.value = true;
  Object.assign(gateway, status.gateway || {});
  Object.assign(openclaw, status.integrations?.openclaw || {});
  Object.assign(hermes, status.integrations?.hermes || {});
}

function integrationStatusLabel(integration) {
  if (!statusChecked.value) return t("rcLicenses.unknown");
  if (!integration.installed) return t("harness.notInstalled");
  if (integration.enabled && !integration.configured) return t("harness.needsSync");
  return integration.enabled ? t("harness.enabled") : t("harness.installed");
}

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
      { name: "!bonzai generate image <prompt>", desc: "Fast image generation with Qwen Image 2.1 Turbo." },
      { name: "!bonzai generate image_quality <prompt>", desc: "Quality image generation with Z-Image Turbo." },
      { name: "!bonzai generate image_standard <prompt>", desc: "Standard Qwen Image 2.1 generation." },
      { name: "!bonzai generate video <prompt>", desc: "Video generation with LTX-2." },
      { name: "!bonzai generate audio <text>", desc: "Fast TTS." },
      { name: "!bonzai generate audio_quality <text>", desc: "Quality Chatterbox V3 TTS." },
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

const filteredCommandGroups = computed(() => {
  const query = commandQuery.value.trim().toLocaleLowerCase();
  return commandGroups.map((group) => ({ ...group, items: group.items.filter((cmd) =>
    `${group.title} ${cmd.name} ${cmd.desc}`.toLocaleLowerCase().includes(query),
  ) })).filter((group) => group.items.length);
});

const boundedRequest = (request) => withTimeout(request, 8000, t("rcWorkflows.timeout"));

async function copyText(value) {
  copyMessage.value = "";
  try {
    if (window.electronAPI?.copyText) await window.electronAPI.copyText(value);
    else await navigator.clipboard.writeText(value);
    copyMessage.value = t("rcWorkflows.copied");
  } catch (error) { errorMessage.value = error?.message || String(error); }
}

function openSetupGuide(url) {
  if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

async function testGateway() {
  if (testing.value) return;
  testing.value = true;
  testMessage.value = "";
  testPassed.value = false;
  try {
    const response = await fetch(new URL("/health", gateway.baseUrl), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.status !== "ok") throw new Error(t("rcWorkflows.testFailed"));
    testPassed.value = true;
    testMessage.value = t(result.llmLoaded ? "rcWorkflows.testPassed" : "rcWorkflows.testNeedsModel");
  } catch (error) {
    testMessage.value = `${t("rcWorkflows.testFailed")}: ${error?.message || error}`;
  } finally { testing.value = false; }
}

async function refreshAll() {
  if (refreshing.value) return;
  errorMessage.value = "";
  if (!desktopAvailable) return;
  refreshing.value = true;
  try {
    const results = await Promise.allSettled([
      boundedRequest(window.electronAPI.harnessGetStatus()),
      boundedRequest(window.electronAPI.llamaRuntimeStatus?.()),
      boundedRequest(window.electronAPI.p2pStatus?.()),
    ]);
    if (results[0].status === "fulfilled") applyHarnessStatus(results[0].value);
    if (results[1].status === "fulfilled") Object.assign(llama, results[1].value || {});
    if (results[2].status === "fulfilled" && results[2].value?.ok) Object.assign(p2p, results[2].value);
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  } catch (error) {
    errorMessage.value = error?.message || String(error);
  } finally { refreshing.value = false; }
}

async function toggleGateway(id) {
  const target = id === "openclaw" ? openclaw : hermes;
  target.busy = true;
  errorMessage.value = "";
  try {
    const next = !target.enabled;
    const res = await boundedRequest(window.electronAPI.harnessSetEnabled(id, next));
    if (!res?.success) throw new Error(res?.error || "Integration update failed");
    applyHarnessStatus(res.status);
  } catch (error) {
    errorMessage.value = error?.message || String(error);
  } finally {
    target.busy = false;
  }
}

async function syncGateway(id) {
  const target = id === "openclaw" ? openclaw : hermes;
  target.busy = true;
  errorMessage.value = "";
  try {
    const res = await boundedRequest(window.electronAPI.harnessSync(id));
    if (!res?.success) throw new Error(res?.error || "Integration sync failed");
    applyHarnessStatus(res.status);
  } catch (error) {
    errorMessage.value = error?.message || String(error);
  } finally {
    target.busy = false;
  }
}

onMounted(refreshAll);
</script>

<style scoped>
.harness-copy-row { display: flex; flex-wrap: wrap; gap: var(--bz-space-2); align-items: center; }
.harness-copy-row strong, .harness-diagnostics code { overflow-wrap: anywhere; user-select: text; }
.harness-copy-status { color: var(--bz-success); margin: 0; }
.harness-setup { padding-left: var(--bz-space-5); color: var(--bz-fg-mid); line-height: 1.8; margin: 0; }
.harness-setup .is-complete { color: var(--bz-fg); font-weight: 600; }
.harness-setup-copy, .harness-diagnostics p, .harness-test p { color: var(--bz-fg-mid); margin: var(--bz-space-2) 0; }
.harness-diagnostics summary, .harness-panel > summary { cursor: pointer; min-height: 36px; }
.harness-diagnostics { border-top: 1px solid var(--bz-border); padding-top: var(--bz-space-2); }
.harness-test { display: flex; flex-wrap: wrap; align-items: center; gap: var(--bz-space-3); }
.harness-test > div { flex: 1; }
.harness-test > p { flex-basis: 100%; }
.harness-command-search { display: grid; gap: var(--bz-space-2); margin-top: var(--bz-space-4); }
.harness-command-search input { color: var(--bz-fg); background: var(--bz-panel); border-color: var(--bz-border); }
.harness-view {
  overflow-y: auto;
  color: var(--bz-fg);
  background: var(--bz-canvas);
  padding: var(--bz-space-6);
  gap: var(--bz-space-5);
}
.harness-view > * { flex-shrink: 0; min-width: 0; }
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
.harness-local {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-left: 3px solid var(--bz-emerald-500);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
}
.harness-local p { margin: var(--bz-space-1) 0 0; color: var(--bz-fg-mid); }
.harness-error {
  margin: 0;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-danger);
  border-radius: var(--bz-r-sm);
  color: var(--bz-danger);
  overflow-wrap: anywhere;
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
.harness-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
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
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
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
  .harness-section-head,
  .harness-local {
    flex-direction: column;
    align-items: stretch;
  }
}
@media (max-width: 640px) {
  .harness-copy-row { display: flex; flex-wrap: wrap; gap: var(--bz-space-2); align-items: center; }
.harness-copy-row strong, .harness-diagnostics code { overflow-wrap: anywhere; user-select: text; }
.harness-copy-status { color: var(--bz-success); margin: 0; }
.harness-setup { padding-left: var(--bz-space-5); color: var(--bz-fg-mid); line-height: 1.8; margin: 0; }
.harness-setup .is-complete { color: var(--bz-fg); font-weight: 600; }
.harness-setup-copy, .harness-diagnostics p, .harness-test p { color: var(--bz-fg-mid); margin: var(--bz-space-2) 0; }
.harness-diagnostics summary, .harness-panel > summary { cursor: pointer; min-height: 36px; }
.harness-diagnostics { border-top: 1px solid var(--bz-border); padding-top: var(--bz-space-2); }
.harness-test { display: flex; flex-wrap: wrap; align-items: center; gap: var(--bz-space-3); }
.harness-test > div { flex: 1; }
.harness-test > p { flex-basis: 100%; }
.harness-command-search { display: grid; gap: var(--bz-space-2); margin-top: var(--bz-space-4); }
.harness-command-search input { color: var(--bz-fg); background: var(--bz-panel); border-color: var(--bz-border); }
.harness-view {
    padding: var(--bz-space-4);
  }
  .command-row {
    grid-template-columns: 1fr;
  }
}
</style>
