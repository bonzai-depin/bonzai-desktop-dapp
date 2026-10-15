<template>
  <section class="rh">
    <div class="rh__bar">
      <span class="rh__status" :class="`is-${state.status}`"><i></i>{{ statusLabel }}</span>
      <button
        v-if="state.status !== 'connected'"
        class="bz-btn bz-btn--primary"
        :disabled="busy || running || !desktopAvailable"
        @click="connect"
      >
        <span class="material-symbols-outlined" aria-hidden="true">link</span>
        Connect Robinhood
      </button>
      <button v-else class="bz-btn bz-btn--ghost" :disabled="busy || running" @click="disconnect">
        <span class="material-symbols-outlined" aria-hidden="true">link_off</span>
        Disconnect
      </button>
    </div>

    <div v-if="state.error" class="bz-notice bz-notice--danger" role="alert">{{ state.error }}</div>

    <section class="rh__execution">
      <div class="rh__section-head">
        <div>
          <p class="bz-eyebrow">Controlled execution</p>
          <h2 class="bz-h2">Prepare the next action</h2>
        </div>
        <span>{{ selectedTool?.classification || "Read" }}</span>
      </div>

      <div class="rh__execution-grid">
        <div class="rh__composer">
          <label>
            Robinhood capability
            <select v-model="selectedToolName" :disabled="!state.tools.length || running">
              <option value="" disabled>Select a capability</option>
              <option v-for="tool in state.tools" :key="tool.name" :value="tool.name">
                {{ humanize(tool.name) }}
              </option>
            </select>
          </label>
          <p v-if="selectedTool?.description" class="rh__tool-description">{{ selectedTool.description }}</p>

          <label>
            Parameters
            <textarea
              v-model="argumentsJson"
              rows="8"
              spellcheck="false"
              :disabled="running"
              placeholder='{"symbol":"HOOD"}'
            ></textarea>
          </label>

          <label v-if="requiresApproval" class="rh__approval">
            <input v-model="approved" type="checkbox" />
            <span><strong>Confirm this action</strong><small>This approval applies once and resets after execution.</small></span>
          </label>

          <div class="rh__actions">
            <span class="rh__policy">
              <span class="material-symbols-outlined" aria-hidden="true">shield</span>
              {{ policyLabel }}
            </span>
            <button
              class="bz-btn bz-btn--primary"
              :disabled="!canExecute"
              @click="execute"
            >
              <span class="material-symbols-outlined" aria-hidden="true">{{ requiresApproval ? "check_circle" : "play_arrow" }}</span>
              {{ running ? "Running" : requiresApproval ? "Confirm & run" : "Run" }}
            </button>
          </div>
        </div>

        <div class="rh__output" aria-live="polite">
          <div class="rh__output-head">
            <strong>Result</strong>
            <span v-if="lastRunAt">{{ lastRunAt }}</span>
          </div>
          <pre v-if="result">{{ result }}</pre>
          <div v-else class="rh__empty">
            <span class="material-symbols-outlined" aria-hidden="true">terminal</span>
            <p>Results, reviews, and order receipts appear here.</p>
          </div>
        </div>
      </div>
    </section>


  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";

const props = defineProps({
  locked: { type: Boolean, default: false },
});
const emit = defineEmits(['result-created']);
const state = reactive({ status: "disconnected", tools: [], error: null });
const busy = ref(false);
const running = ref(false);
const selectedToolName = ref("");
const argumentsJson = ref("{}");
const approved = ref(false);
const result = ref("");
const lastRunAt = ref("");
const desktopAvailable = Boolean(window.electronAPI?.robinhood);
let unsubscribe;

const selectedTool = computed(() => state.tools.find((tool) => tool.name === selectedToolName.value));
const requiresApproval = computed(() => selectedTool.value?.classification === "mutation");
const statusLabel = computed(() => ({
  disconnected: "Not connected",
  connecting: "Connecting",
  authorizing: "Authorize in browser",
  connected: "Connected",
  error: "Needs attention",
}[state.status] || state.status));
const policyLabel = computed(() => {
  if (props.locked) return "Companion token required";
  if (!selectedTool.value) return "Select a capability";
  if (requiresApproval.value) return approved.value ? "Approved for one execution" : "Fresh approval required";
  return selectedTool.value.classification === "review" ? "Review only" : "Read only";
});
const canExecute = computed(() =>
  state.status === "connected" &&
  !props.locked &&
  selectedTool.value &&
  !running.value &&
  (!requiresApproval.value || approved.value),
);

const humanize = (value) => String(value || "")
  .replace(/[_./:-]+/g, " ")
  .replace(/\b\w/g, (character) => character.toUpperCase());
const apply = (next) => Object.assign(state, next || {});
const connect = async () => {
  if (!desktopAvailable || busy.value || running.value) return;
  state.error = null;
  busy.value = true;
  try { apply(await window.electronAPI.robinhood.connect()); } catch (cause) { state.error = cause?.message || String(cause); } finally { busy.value = false; }
};
const disconnect = async () => {
  if (!desktopAvailable || busy.value || running.value) return;
  busy.value = true;
  try { apply(await window.electronAPI.robinhood.disconnect()); }
  catch (cause) { state.error = cause?.message || String(cause); }
  finally { busy.value = false; }
};
const execute = async () => {
  if (!canExecute.value) return;
  const toolName = selectedToolName.value;
  const needsApproval = requiresApproval.value;
  const onceApproved = approved.value;
  approved.value = false;
  state.error = null;
  running.value = true;
  try {
    const args = JSON.parse(argumentsJson.value || "{}");
    if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('Enter parameters as a JSON object.');
    const response = await window.electronAPI.robinhood.callTool({
      name: toolName,
      arguments: args,
      approved: needsApproval ? onceApproved : false,
    });
    result.value = JSON.stringify(response, null, 2);
    if (!response || response.isError === true || response.success === false || response.error) throw new Error(response?.error || 'The connected tool did not return a successful result.');
    emit('result-created', { tool: toolName, arguments: args, result: response });
    lastRunAt.value = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (cause) {
    state.error = cause?.message || String(cause);
  } finally {
    approved.value = false;
    running.value = false;
  }
};

watch(() => state.tools, (tools) => {
  if (!tools.some((tool) => tool.name === selectedToolName.value)) {
    selectedToolName.value = tools[0]?.name || "";
  }
}, { deep: true });
watch([selectedToolName, argumentsJson], () => {
  approved.value = false;
  result.value = "";
}, { flush: "sync" });
onMounted(async () => {
  if (!desktopAvailable) { state.error = 'Open the desktop app to connect your brokerage account.'; return; }
  try {
    apply(await window.electronAPI.robinhood.status());
    unsubscribe = window.electronAPI.robinhood.onState(apply);
  } catch (cause) { state.error = cause?.message || String(cause); }
});
onUnmounted(() => unsubscribe?.());
</script>

<style scoped>
.rh{height:100%;overflow:auto;padding:var(--bz-space-6);color:var(--bz-fg);background:var(--bz-canvas)}
.rh__bar{display:flex;align-items:center;justify-content:flex-end;gap:var(--bz-space-3);padding-bottom:var(--bz-space-5);border-bottom:1px solid var(--bz-border)}
.rh__status{display:flex;align-items:center;gap:8px;color:var(--bz-fg-mid);font-size:12px}.rh__status i{width:7px;height:7px;border-radius:50%;background:var(--bz-fg-low)}.rh__status.is-connected i{background:var(--bz-emerald-500)}
.rh__execution{padding:var(--bz-space-6) 0 var(--bz-space-7)}.rh__section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--bz-space-4);margin-bottom:var(--bz-space-4)}.rh__section-head h2,.rh__section-head p{margin:0}.rh__section-head span{color:var(--bz-fg-mid);font-size:12px;text-transform:capitalize}
.rh__execution-grid{display:grid;grid-template-columns:minmax(320px,.85fr) minmax(360px,1.15fr);border:1px solid var(--bz-border);background:var(--bz-panel)}
.rh__composer{padding:var(--bz-space-5);border-right:1px solid var(--bz-border)}.rh__composer>label{display:grid;gap:8px;margin-bottom:var(--bz-space-4);color:var(--bz-fg-mid);font-size:12px}.rh select,.rh textarea,.rh input[type=number]{width:100%;border:1px solid var(--bz-border);border-radius:var(--bz-r-sm);background:var(--bz-canvas);color:var(--bz-fg);font:13px var(--bz-font-mono)}.rh select,.rh input[type=number]{min-height:40px;padding:0 12px}.rh textarea{padding:12px;resize:vertical;line-height:1.5}.rh select:focus,.rh textarea:focus,.rh input:focus{outline:none;border-color:var(--bz-border-brand)}
.rh__tool-description{margin:-6px 0 var(--bz-space-4);color:var(--bz-fg-mid);font-size:12px;line-height:1.5}.rh__approval{grid-template-columns:18px 1fr!important;align-items:start;padding:var(--bz-space-3);border-left:2px solid var(--bz-warning);background:var(--bz-warning-soft)}.rh__approval input{margin-top:2px}.rh__approval strong,.rh__approval small{display:block;color:var(--bz-fg)}.rh__approval small{margin-top:3px;color:var(--bz-fg-mid)}
.rh__actions{display:flex;align-items:center;justify-content:space-between;gap:var(--bz-space-4);padding-top:var(--bz-space-2)}.rh__policy{display:flex;align-items:center;gap:6px;color:var(--bz-fg-mid);font-size:12px}.rh__policy .material-symbols-outlined{font-size:16px}
.rh__output{min-height:360px;display:flex;flex-direction:column}.rh__output-head{display:flex;justify-content:space-between;padding:var(--bz-space-3) var(--bz-space-4);border-bottom:1px solid var(--bz-border);color:var(--bz-fg-mid);font-size:12px}.rh__output-head strong{color:var(--bz-fg)}.rh__output pre{flex:1;margin:0;padding:var(--bz-space-4);overflow:auto;color:var(--bz-fg);font:12px/1.6 var(--bz-font-mono);white-space:pre-wrap}.rh__empty{flex:1;display:grid;place-content:center;text-align:center;color:var(--bz-fg-mid)}.rh__empty .material-symbols-outlined{margin:auto;font-size:28px}.rh__empty p{margin:8px 0 0}
.rh__reference{display:grid;grid-template-columns:1fr 1fr;gap:var(--bz-space-7);padding-top:var(--bz-space-6);border-top:1px solid var(--bz-border)}.rh__fields{display:grid;grid-template-columns:1fr 1fr;gap:var(--bz-space-4)}.rh__fields label{display:grid;grid-template-columns:1fr auto;gap:6px;color:var(--bz-fg-mid);font-size:12px}.rh__fields input{grid-column:1/-1}.rh__disclosure{margin-top:var(--bz-space-4);color:var(--bz-fg-mid);font-size:12px;line-height:1.6}
.rh__role{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:var(--bz-space-3);min-height:54px;border-bottom:1px solid var(--bz-border)}.rh__role>span:first-child{color:var(--bz-purple-100)}.rh__role strong,.rh__role small{display:block}.rh__role small,.rh__role>span:last-child{margin-top:2px;color:var(--bz-fg-mid);font-size:11px}.rh__role>span:last-child{font-family:var(--bz-font-mono);text-transform:uppercase}
@media(max-width:900px){.rh__execution-grid,.rh__reference{grid-template-columns:1fr}.rh__composer{border-right:0;border-bottom:1px solid var(--bz-border)}.rh__actions{align-items:stretch;flex-direction:column}.rh__fields{grid-template-columns:1fr}}
</style>
