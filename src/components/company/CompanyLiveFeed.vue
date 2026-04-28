<template>
  <div class="live panel models__activity--payouts">
    <div class="live__head">
      <h2 class="panel-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined live__pulse">graphic_eq</span>
        Live Feed
        <span v-if="charter.demoMode" class="live__demo-badge">DEMO</span>
      </h2>
      <div class="live__head-right">
        <div class="live__stats">
          <span class="live__count fira-sans-condensed-black-italic">{{ filtered.length }}</span>
          <span class="live__count-label">events</span>
          <span class="live__separator">·</span>
          <span class="live__rate" :class="{ 'is-active': recentRate > 0 }">
            {{ recentRate }} <small>/ min</small>
          </span>
        </div>
        <button
          class="button is-small is-light fira-sans-condensed-black-italic ml-5"
          :disabled="!entries.length"
          @click="clearFeed"
          :title="charter.demoMode
            ? 'Wipe the audit log so the next demo tick starts fresh'
            : 'Clear the visible audit history (does not affect goals, issues, or treasury)'"
        >
          <span class="material-symbols-outlined mr-1">delete_sweep</span>
          Clear
        </button>
      </div>
    </div>

    <p class="muted">
      Every CEO tick, role action, skill call, and audit entry as it happens. Watch your
      company think, plan, and ship in real time.
    </p>

    <hr />

    <!-- Filter chips -->
    <div class="live__filters">
      <button
        v-for="f in filters"
        :key="f.id"
        class="live__chip"
        :class="{ 'is-active': activeFilter === f.id }"
        @click="activeFilter = f.id"
      >
        {{ f.label }}
        <span v-if="counts[f.id] !== undefined" class="live__chip-count">{{ counts[f.id] }}</span>
      </button>
    </div>

    <!-- Feed -->
    <div class="live__stream" ref="stream">
      <!-- In-flight streams: rendered above the audit log so the live
           "thinking" cards appear at the top of the feed and update as
           tokens arrive. They disappear when the stream ends; the
           completed thought lands in the audit log directly below. -->
      <div v-if="liveStreams.length" class="live__entries live__entries--streaming">
        <div
          v-for="s in liveStreams"
          :key="`stream-${s.streamId}`"
          class="live-entry live-entry--llm live-entry--streaming"
        >
          <div class="live-entry__time">live</div>
          <div class="live-entry__icon">
            <span class="material-symbols-outlined live__pulse">psychology</span>
          </div>
          <div class="live-entry__body">
            <div class="live-entry__head">
              <span class="live-entry__role fira-sans-condensed-black-italic">
                {{ roleDisplayName(s.role) }}
              </span>
              <span class="live-entry__action">
                {{ s.action === 'tickCEO' ? 'Planning' : 'Reasoning' }}
              </span>
              <span class="live-entry__duration">
                {{ Math.round((nowTs - s.startedAt) / 1000) }}<small>s</small>
              </span>
              <span class="live-entry__status tag is-info">streaming…</span>
            </div>
            <pre class="live-entry__response live-entry__response--streaming">{{ s.response || '…' }}<span class="live-entry__cursor">▍</span></pre>
          </div>
        </div>
      </div>

      <transition-group name="live-entry" tag="div" class="live__entries">
        <div
          v-for="entry in filtered.slice(0, 100)"
          :key="entry._id"
          class="live-entry"
          :class="[
            `is-${entry.status || 'executed'}`,
            entry.kind === 'llm' ? 'live-entry--llm' : '',
          ]"
        >
          <div class="live-entry__time">{{ fmtRelative(entry.ts) }}</div>
          <div class="live-entry__icon">
            <span class="material-symbols-outlined">{{ iconFor(entry) }}</span>
          </div>
          <div class="live-entry__body">
            <div class="live-entry__head">
              <span v-if="entry.role" class="live-entry__role fira-sans-condensed-black-italic">
                {{ roleDisplayName(entry.role) }}
              </span>
              <span class="live-entry__action">{{ formatLLMAction(entry) }}</span>
              <span
                v-if="entry.kind === 'llm' && entry.llm?.durationMs"
                class="live-entry__duration"
                :title="entry.llm.durationMs + 'ms model latency'"
              >
                {{ entry.llm.durationMs }}<small>ms</small>
              </span>
              <span class="live-entry__status tag" :class="statusClass(entry.status)">
                {{ statusLabel(entry) }}
              </span>
            </div>
            <div v-if="entry.note" class="live-entry__note">{{ entry.note }}</div>

            <!-- LLM response: collapsible by default; pre-formatted body -->
            <details v-if="entry.kind === 'llm' && entry.llm?.response" class="live-entry__thought" :open="entry.status === 'parse_error'">
              <summary>
                <span class="material-symbols-outlined">psychology_alt</span>
                <span>{{ entry.status === 'parse_error' ? 'Show what the model said' : 'Show response' }}</span>
                <span v-if="entry.llm.truncated" class="live-entry__truncated">truncated</span>
              </summary>
              <pre class="live-entry__response">{{ entry.llm.response }}</pre>
              <div v-if="entry.llm.parseError" class="live-entry__parse-error">
                <span class="material-symbols-outlined">error</span>
                {{ entry.llm.parseError }}
              </div>
            </details>

            <div v-if="entry.txOrLink" class="live-entry__link">
              <span class="material-symbols-outlined">link</span>
              <code>{{ entry.txOrLink }}</code>
            </div>
          </div>
        </div>
      </transition-group>
      <div v-if="!filtered.length" class="live__empty">
        <span class="material-symbols-outlined">hourglass_empty</span>
        <div>
          {{ charter.demoMode
              ? 'Waiting for the next demo tick…'
              : (charter.status === 'paused'
                  ? 'Company is paused — resume to see activity.'
                  : 'Waiting for the next heartbeat. Click Run now to fire one immediately.')
          }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted, onUnmounted } from "vue";
import companyStore from "../../stores/companyStore.js";

export default {
  name: "CompanyLiveFeed",
  props: {
    charter: { type: Object, required: true },
    state: { type: Object, required: true },
  },
  setup(props) {
    const store = companyStore;
    const activeFilter = ref("all");
    const now = ref(Date.now());

    // Tick now-ref every second so relative-time labels update without
    // touching the audit feed itself.
    let _now = null;
    onMounted(() => { _now = setInterval(() => (now.value = Date.now()), 1000); });
    onUnmounted(() => { if (_now) clearInterval(_now); });

    const filters = [
      { id: "all",       label: "All" },
      { id: "llm",       label: "Thoughts" },
      { id: "system",    label: "System" },
      { id: "issue",     label: "Issues" },
      { id: "action",    label: "Actions" },
      { id: "production",label: "Production" },
      { id: "veto",      label: "Vetoes" },
      { id: "treasury",  label: "Treasury" },
    ];

    const audit = computed(() => props.state.audit || []);

    /**
     * In-flight LLM streams keyed by streamId. These render at the top
     * of the feed and update as tokens arrive — the user sees the model
     * "type" the response in real time.
     */
    const liveStreams = computed(() => {
      const map = props.state.activeStreams || {};
      return Object.values(map).sort((a, b) => a.startedAt - b.startedAt);
    });
    // Re-use `now` for "Xs" duration on streams.
    const nowTs = now;

    // Pre-compute keyed entries (newest first, with stable keys for the
    // transition-group so newcomers animate in cleanly).
    const entries = computed(() =>
      audit.value
        .slice()
        .reverse()
        // auditLog.append() assigns a uuid `id` per entry. Use it as the
        // transition-group key so batched ticks (multiple entries at the
        // same ms) don't collide and animate jankily.
        .map((e, idx) => ({ ...e, _id: e.id || `${e.ts || 0}-${idx}` })),
    );

    const counts = computed(() => {
      const out = { all: entries.value.length };
      for (const f of filters) if (f.id !== "all") out[f.id] = 0;
      for (const e of entries.value) {
        if (out[e.kind] !== undefined) out[e.kind]++;
      }
      return out;
    });

    const filtered = computed(() => {
      if (activeFilter.value === "all") return entries.value;
      return entries.value.filter((e) => e.kind === activeFilter.value);
    });

    // Events in the last 60 seconds, used for the live "rate" indicator
    const recentRate = computed(() => {
      const cutoff = now.value - 60_000;
      return entries.value.filter((e) => (e.ts || 0) >= cutoff).length;
    });

    function iconFor(entry) {
      // LLM "thought" entries get a brain icon regardless of role
      if (entry.kind === "llm") return "psychology";
      const map = {
        system: "settings",
        issue: "task_alt",
        action: "bolt",
        production: "factory",
        veto: "block",
        treasury: "savings",
        approval: "rule",
      };
      // Specific overrides by action verb
      if (entry.action) {
        if (/createGoal|delegate/i.test(entry.action)) return "flag";
        if (/issue\.done/i.test(entry.action)) return "check_circle";
        if (/issue\.error|issue\.blocked/i.test(entry.action)) return "error";
        if (/tickCEO/i.test(entry.action)) return "psychology";
        if (/tickRole|tickRoles/i.test(entry.action)) return "groups";
        if (/sendSMS|broadcastSMS/i.test(entry.action)) return "sms";
        if (/createInvoice|payContractor/i.test(entry.action)) return "receipt_long";
        if (/createProduct|createCheckout/i.test(entry.action)) return "shopping_bag";
        if (/createCampaign/i.test(entry.action)) return "campaign";
        if (/respondReview/i.test(entry.action)) return "reviews";
        if (/conflictCheck|engagementLetter|courtDate/i.test(entry.action)) return "gavel";
        if (/createEvent|reschedule/i.test(entry.action)) return "event";
        if (/produce/i.test(entry.action)) return "auto_awesome";
        if (/publishContent/i.test(entry.action)) return "ios_share";
        if (/broadcastChannel/i.test(entry.action)) return "campaign";
        if (/replyToInbox/i.test(entry.action)) return "forum";
      }
      return map[entry.kind] || "circle";
    }

    function statusClass(s) {
      return ({
        executed: "is-success",
        vetoed: "is-warning",
        error: "is-danger",
        parse_error: "is-danger",
        queued: "is-info",
        pending: "is-info",
      })[s] || "is-light";
    }

    function statusLabel(entry) {
      if (entry.kind === "llm" && entry.status === "executed") return "thought";
      if (entry.status === "parse_error") return "parse error";
      return entry.status || "executed";
    }

    /**
     * For LLM "thought" entries, the action field is `tickCEO` / `tickRole`
     * — re-label these as "Planning" / "Reasoning" so the live feed reads
     * naturally instead of exposing internal scheduler verbs.
     */
    function formatLLMAction(entry) {
      if (entry.kind === "llm") {
        if (entry.action === "tickCEO") return "Planning";
        if (entry.action === "tickRole") return "Reasoning";
      }
      return formatAction(entry.action);
    }

    function fmtRelative(ts) {
      if (!ts) return "—";
      const delta = Math.max(0, now.value - ts);
      if (delta < 5_000) return "just now";
      if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
      if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
      if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
      const d = new Date(ts);
      return d.toLocaleString();
    }

    function formatAction(a) {
      if (!a) return "";
      // Skill action: "twilio.sendSMS" → "Twilio · sendSMS"
      if (a.includes(".")) {
        const [ns, fn] = a.split(".");
        return `${_titleCase(ns)} · ${fn}`;
      }
      // CamelCase → spaced
      return a.replace(/([a-z])([A-Z])/g, "$1 $2");
    }

    function _titleCase(s) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function roleDisplayName(roleKey) {
      if (!roleKey) return "";
      if (roleKey.startsWith("Producer:")) {
        const p = roleKey.split(":")[1] || "";
        let label;
        if (p === "3d") label = "3D";
        else if (p === "fineTune") label = "Fine-Tune";
        else label = p.charAt(0).toUpperCase() + p.slice(1);
        return `${label} Producer`;
      }
      const TITLES = {
        CEO: "CEO", CFO: "CFO", CPO: "CPO", CMO: "CMO", CSO: "CSO", COO: "COO",
        GeneralCounsel: "General Counsel", RnDLead: "R&D Lead",
        FieldTech: "Field Tech", Packer: "Packer",
      };
      return TITLES[roleKey] || roleKey;
    }

    /**
     * Wipe the company's audit log. Goals, issues, treasury, and
     * production catalog are preserved — this only clears the live-feed
     * source. Useful for restarting a demo with a clean slate.
     */
    async function clearFeed() {
      if (!confirm("Clear the live feed?\n\nThis wipes the audit log only — your goals, issues, treasury, and production stay intact. Useful for a fresh demo run.")) return;
      try { await store.clearAudit(); }
      catch (err) { alert("Could not clear feed: " + (err.message || err)); }
    }

    return {
      activeFilter, filters, filtered, entries, counts, recentRate,
      liveStreams, nowTs,
      iconFor, statusClass, statusLabel, fmtRelative, formatAction, formatLLMAction, roleDisplayName,
      clearFeed,
    };
  },
};
</script>

<style scoped>
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
}
hr {
  margin: 20px 0 !important;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 1), transparent);
}
.muted { color: rgba(255, 255, 255, 0.65); font-size: 0.92em; }

.panel-title {
  font-size: 1.6rem;
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.4em;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}

.live__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5em;
}

.live__pulse {
  font-size: 28px !important;
  -webkit-text-fill-color: rgb(255, 153, 51) !important;
  background: none !important;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.08); }
}

.live__demo-badge {
  font-size: 0.55em !important;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 700 !important;
  letter-spacing: 0.12em;
  padding: 3px 9px;
  margin-left: 0.5em;
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51));
  color: #000 !important;
  -webkit-text-fill-color: #000 !important;
  background-clip: border-box !important;
}

.live__head-right {
  display: flex;
  align-items: center;
  gap: 0.5em;
  flex-wrap: wrap;
}
.live__stats {
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  font-family: "Fira Sans", sans-serif;
  color: rgba(255, 255, 255, 0.8);
}
.live__count {
  font-size: 1.4rem;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.live__count-label {
  font-size: 0.72em;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: rgba(255, 255, 255, 0.55);
}
.live__separator { color: rgba(255, 255, 255, 0.3); }
.live__rate {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.82em;
}
.live__rate.is-active { color: #48c78e; }
.live__rate small { font-weight: 400; opacity: 0.7; }

/* ───────── Filter chips — agentic-skills selector pattern ───────── */
.live__filters {
  display: flex;
  gap: 0.4em;
  flex-wrap: wrap;
  margin-bottom: 1em;
}
.live__chip {
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 600 !important;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  backdrop-filter: blur(32px);
  transition: all 0.18s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}
.live__chip:hover {
  background: rgba(97, 55, 142, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
  color: #fff;
}
.live__chip.is-active {
  color: #fff !important;
  border-color: #fff !important;
  background: rgba(97, 55, 142, 0.33) !important;
}
.live__chip-count {
  font-size: 0.85em;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

/* ───────── Stream ───────── */
.live__stream {
  max-height: calc(100vh - 360px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}
.live__stream::-webkit-scrollbar { width: 6px; }
.live__stream::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; }
.live__entries { display: flex; flex-direction: column; gap: 0.5em; }

.live-entry {
  display: grid;
  grid-template-columns: 80px 36px 1fr;
  gap: 0.85em;
  align-items: flex-start;
  padding: 0.85em 1em;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px;
  transition: border-color 0.15s ease;
}
.live-entry:hover { border-color: rgba(255, 255, 255, 0.22); }

.live-entry.is-vetoed       { border-left: 3px solid #ffe08a; }
.live-entry.is-error        { border-left: 3px solid #f14668; }
.live-entry.is-parse_error  { border-left: 3px solid #f14668; }
.live-entry.is-queued       { border-left: 3px solid #3e8ed0; }
.live-entry.is-executed     { border-left: 3px solid #48c78e; }
.live-entry--llm.is-executed {
  border-left-color: rgb(155, 109, 200);
  background: rgba(155, 109, 200, 0.07);
}
.live-entry--llm .live-entry__icon .material-symbols-outlined {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}

.live-entry__time {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.74em;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  padding-top: 0.3em;
  white-space: nowrap;
}
.live-entry__icon {
  display: flex; justify-content: center; align-items: flex-start;
  padding-top: 0.15em;
}
.live-entry__icon .material-symbols-outlined {
  font-size: 24px;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}

.live-entry__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5em;
  margin-bottom: 0.25em;
}
.live-entry__role {
  font-size: 0.95rem;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.live-entry__action {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.86em;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.02em;
}
.live-entry__status {
  font-size: 0.7em !important;
  text-transform: capitalize;
}
.live-entry__note {
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.88em;
  line-height: 1.45;
}
.live-entry__duration {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.78em;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.04em;
  margin-left: auto;
  margin-right: 0.3em;
}
.live-entry__duration small { font-weight: 400; opacity: 0.7; }

/* ───────── LLM "thought" collapsible ───────── */
.live-entry__thought {
  margin-top: 0.55em;
  border: 1px solid rgba(155, 109, 200, 0.3);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(32px);
  overflow: hidden;
}
.live-entry__thought summary {
  list-style: none;
  cursor: pointer;
  padding: 0.55em 0.85em;
  display: flex;
  align-items: center;
  gap: 0.45em;
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.76em;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.78);
  transition: background 0.15s ease;
}
.live-entry__thought summary::-webkit-details-marker { display: none; }
.live-entry__thought summary:hover { background: rgba(155, 109, 200, 0.15); }
.live-entry__thought summary .material-symbols-outlined {
  font-size: 16px !important;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.live-entry__thought[open] summary {
  background: rgba(155, 109, 200, 0.15);
  border-bottom: 1px solid rgba(155, 109, 200, 0.3);
}
.live-entry__truncated {
  margin-left: auto;
  font-size: 0.85em;
  font-weight: 400;
  text-transform: lowercase;
  color: rgba(255, 224, 138, 0.85);
}

.live-entry__response {
  margin: 0;
  padding: 0.85em 1em;
  font-family: "Fira Code", "JetBrains Mono", "SF Mono", monospace;
  font-size: 0.78em !important;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.88);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.45);
}
.live-entry__response::-webkit-scrollbar { width: 4px; }
.live-entry__response::-webkit-scrollbar-thumb {
  background: rgba(155, 109, 200, 0.45); border-radius: 999px;
}

/* ───────── In-flight streaming cards ───────── */
.live__entries--streaming { margin-bottom: 0.5em; }
.live-entry--streaming {
  border-left: 3px solid rgb(255, 153, 51) !important;
  background: rgba(155, 109, 200, 0.12) !important;
  box-shadow: 0 0 24px rgba(255, 153, 51, 0.18);
  animation: stream-glow 2.4s ease-in-out infinite;
}
@keyframes stream-glow {
  0%, 100% { box-shadow: 0 0 18px rgba(255, 153, 51, 0.12); }
  50%      { box-shadow: 0 0 28px rgba(255, 153, 51, 0.28); }
}
.live-entry__response--streaming {
  /* No collapsing details — show the streaming text inline */
  background: rgba(0, 0, 0, 0.45);
  margin-top: 0.4em;
  border: 1px solid rgba(155, 109, 200, 0.35);
  border-radius: 4px;
}
.live-entry__cursor {
  display: inline-block;
  margin-left: 0.1em;
  color: rgb(255, 153, 51);
  animation: blink 0.9s steps(2, start) infinite;
}
@keyframes blink {
  to { visibility: hidden; }
}

.live-entry__parse-error {
  display: flex;
  align-items: flex-start;
  gap: 0.4em;
  padding: 0.6em 1em;
  background: rgba(241, 70, 104, 0.12);
  border-top: 1px solid rgba(241, 70, 104, 0.4);
  color: #ffd0d8;
  font-size: 0.82em;
  line-height: 1.45;
}
.live-entry__parse-error .material-symbols-outlined {
  font-size: 16px !important;
  color: #f14668 !important;
  -webkit-text-fill-color: #f14668 !important;
  background: none !important;
}

.live-entry__link {
  display: flex; align-items: center; gap: 0.3em;
  font-size: 0.78em;
  margin-top: 0.3em;
  color: rgba(255, 255, 255, 0.55);
}
.live-entry__link .material-symbols-outlined { font-size: 14px; color: rgba(255,255,255,0.55) !important; -webkit-text-fill-color: rgba(255,255,255,0.55) !important; background: none !important; }
.live-entry__link code {
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: "Fira Code", "JetBrains Mono", monospace;
  font-size: 0.95em;
}

/* ───────── Animation: new entries fade + slide in ───────── */
.live-entry-enter-active {
  transition: all 0.45s cubic-bezier(.22, 1, .36, 1);
}
.live-entry-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}
.live-entry-leave-active {
  transition: all 0.25s ease;
  position: absolute;
}
.live-entry-leave-to { opacity: 0; transform: translateY(-6px); }
.live-entry-move { transition: transform 0.4s ease; }

.live__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6em;
  padding: 3em 1em;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
  text-align: center;
}
.live__empty .material-symbols-outlined {
  font-size: 48px;
  opacity: 0.5;
}

:deep(.tag.is-light) {
  background: rgba(255, 255, 255, 0.1) !important;
  color: rgba(255, 255, 255, 0.78) !important;
}
</style>
