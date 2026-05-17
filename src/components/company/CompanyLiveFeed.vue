<template>
  <div class="live panel models__activity--payouts" :class="{ 'is-compact': compact, 'is-horizontal': horizontal }">
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
          class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
          :disabled="!entries.length"
          @click="clearFeed"
          :title="charter.demoMode
            ? 'Wipe the audit log so the next demo tick starts fresh'
            : 'Clear the visible audit history (does not affect goals, issues, or treasury)'"
        >
          <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
          Clear
        </button>
      </div>
    </div>

    <p v-if="!compact" class="muted">
      Every CEO tick, role action, skill call, and audit entry as it happens. Watch your
      company think, plan, and ship in real time.
    </p>

    <hr v-if="!compact" />

    <!-- Filter chips -->
    <div v-if="!compact" class="live__filters">
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
              <span class="live-entry__status status-pill status-pill--queued">streaming…</span>
            </div>
            <pre class="live-entry__response live-entry__response--streaming">{{ s.response || '…' }}<span class="live-entry__cursor">▍</span></pre>
          </div>
        </div>
      </div>

      <transition-group name="live-entry" tag="div" class="live__entries">
        <div
          v-for="entry in filtered.slice(0, entryLimit)"
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
              <span class="live-entry__status status-pill" :class="statusClass(entry.status)">
                {{ statusLabel(entry) }}
              </span>
            </div>
            <div v-if="entry.note" class="live-entry__note">{{ entry.note }}</div>

            <!-- LLM response: collapsible by default; pre-formatted body -->
            <details v-if="entry.kind === 'llm' && entry.llm?.response" class="live-entry__thought">
              <summary>
                <span class="material-symbols-outlined">psychology_alt</span>
                <span>{{ entry.status === 'parse_error' ? 'Show model response' : 'Show response' }}</span>
                <span v-if="entry.llm.truncated" class="live-entry__truncated">truncated</span>
              </summary>
              <pre class="live-entry__response">{{ entry.llm.response }}</pre>
              <div v-if="entry.llm.parseError" class="live-entry__parse-error">
                <span class="material-symbols-outlined">warning</span>
                {{ entry.llm.parseError }}
              </div>
            </details>

            <div v-if="entry.txOrLink" class="live-entry__link">
              <span class="material-symbols-outlined">link</span>
              <code>{{ entry.txOrLink }}</code>
            </div>
            <button
              class="live-entry__delete bz-iconbtn bz-iconbtn--sm"
              @click.stop="removeEntry(entry)"
              title="Delete this feed item"
              aria-label="Delete feed item"
            >
              <span class="material-symbols-outlined">delete</span>
            </button>
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
    compact: { type: Boolean, default: false },
    horizontal: { type: Boolean, default: false },
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
      { id: "production",label: "Deliverables" },
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
    const entryLimit = computed(() => props.horizontal ? 3 : (props.compact ? 24 : 100));

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
        executed: "status-pill--executed",
        vetoed: "status-pill--vetoed",
        error: "status-pill--error",
        parse_error: "status-pill--queued",
        queued: "status-pill--queued",
        pending: "status-pill--queued",
      })[s] || "status-pill--neutral";
    }

    function statusLabel(entry) {
      if (entry.kind === "llm" && entry.status === "executed") return "thought";
      if (entry.status === "parse_error") return "needs retry";
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
      if (!confirm("Clear the live feed?\n\nThis wipes the audit log only. Your goals, tasks, treasury, and deliverables stay intact.")) return;
      try { await store.clearAudit(); }
      catch (err) { alert("Could not clear feed: " + (err.message || err)); }
    }
    async function removeEntry(entry) {
      if (!entry?.id) return;
      await store.removeAuditEntry(entry.id);
    }

    return {
      activeFilter, filters, filtered, entries, counts, recentRate, entryLimit,
      liveStreams, nowTs,
      iconFor, statusClass, statusLabel, fmtRelative, formatAction, formatLLMAction, roleDisplayName,
      clearFeed, removeEntry,
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
  background: linear-gradient(to right, transparent, var(--bz-fg), transparent);
}
.muted { color: var(--bz-fg-mid); font-size: var(--bz-size-body); }

.panel-title {
  font-size: 1.6rem;
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.4em;
  color: var(--bz-fg) !important;
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
  color: var(--bz-purple-300) !important;
  -webkit-text-fill-color: currentColor !important;
  background: none !important;
  animation: none;
}

.live__demo-badge {
  font-size: 0.55em !important;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 700 !important;
  letter-spacing: 0.12em;
  padding: 3px 9px;
  margin-left: 0.5em;
  border-radius: 999px;
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300) !important;
  border: 1px solid var(--bz-border-brand);
  -webkit-text-fill-color: currentColor !important;
  background-clip: border-box !important;
}

.live__head-right {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  flex-wrap: wrap;
}
.live__stats {
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  font-family: "Fira Sans", sans-serif;
  color: var(--bz-fg-mid);
}
.live__count {
  font-size: 1.4rem;
  color: var(--bz-fg);
}
.live__count-label {
  font-size: 0.72em;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--bz-fg-low);
}
.live__separator { color: var(--bz-fg-faint); }
.live__rate {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  color: var(--bz-fg-mid);
  font-size: 0.82em;
}
.live__rate.is-active { color: var(--bz-emerald-500); }
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
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  background: transparent;
  color: var(--bz-fg-low);
  cursor: pointer;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 600 !important;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: all 0.18s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}
.live__chip:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg);
}
.live__chip.is-active {
  color: var(--bz-fg) !important;
  border-color: var(--bz-border-brand) !important;
  background: var(--bz-purple-soft) !important;
}
.live__chip-count {
  font-size: 0.85em;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--bz-card);
  color: var(--bz-fg);
}

/* ───────── Stream ───────── */
.live__stream {
  max-height: calc(100vh - 360px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--bz-border-strong) transparent;
}
.live__stream::-webkit-scrollbar { width: 6px; }
.live__stream::-webkit-scrollbar-thumb { background: var(--bz-border-strong); border-radius: 999px; }
.live__entries { display: flex; flex-direction: column; gap: 0.5em; }

.live-entry {
  position: relative;
  display: grid;
  grid-template-columns: 80px 36px 1fr;
  gap: 0.85em;
  align-items: flex-start;
  padding: 0.85em 1em;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  transition: border-color 0.15s ease;
}
.live-entry:hover { border-color: var(--bz-border-strong); }
.live-entry__delete {
  position: absolute;
  right: var(--bz-space-2);
  top: var(--bz-space-2);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--bz-dur-fast);
}
.live-entry:hover .live-entry__delete {
  opacity: 1;
  pointer-events: auto;
}

.live-entry.is-vetoed       { border-left: 3px solid var(--bz-warning); }
.live-entry.is-error        { border-left: 3px solid var(--bz-danger); }
.live-entry.is-parse_error  { border-left: 3px solid var(--bz-danger); }
.live-entry.is-queued       { border-left: 3px solid var(--bz-info); }
.live-entry.is-executed     { border-left: 3px solid var(--bz-emerald-500); }
.live-entry--llm.is-executed {
  border-left-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
}
.live-entry--llm .live-entry__icon .material-symbols-outlined {
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
}

.live-entry__time {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.74em;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--bz-fg-low);
  padding-top: 0.3em;
  white-space: nowrap;
}
.live-entry__icon {
  display: flex; justify-content: center; align-items: flex-start;
  padding-top: 0.15em;
}
.live-entry__icon .material-symbols-outlined {
  font-size: 24px;
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
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
  color: var(--bz-fg);
}
.live-entry__action {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.86em;
  color: var(--bz-fg-mid);
  letter-spacing: 0.02em;
}
.live-entry__status {
  font-size: var(--bz-size-meta) !important;
  text-transform: capitalize;
}
.status-pill {
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-ui);
  font-weight: 800;
  letter-spacing: 0.05em;
  line-height: 1;
}
.status-pill--executed {
  border-color: var(--bz-emerald-500);
  background: var(--bz-success-soft);
  color: var(--bz-emerald-500);
}
.status-pill--vetoed {
  border-color: var(--bz-warning);
  background: var(--bz-warning-soft);
  color: var(--bz-warning);
}
.status-pill--error {
  border-color: var(--bz-danger);
  background: var(--bz-danger-soft);
  color: var(--bz-danger);
}
.status-pill--queued {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
}
.status-pill--neutral {
  border-color: var(--bz-border);
  color: var(--bz-fg-mid);
}
.live-entry__note {
  color: var(--bz-fg-mid);
  font-size: 0.88em;
  line-height: 1.45;
}
.live-entry__duration {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.78em;
  color: var(--bz-fg-low);
  letter-spacing: 0.04em;
  margin-left: auto;
  margin-right: 0.3em;
}
.live-entry__duration small { font-weight: 400; color: var(--bz-fg-low); }

/* ───────── LLM "thought" collapsible ───────── */
.live-entry__thought {
  margin-top: 0.55em;
  border: 1px solid rgba(155, 109, 200, 0.3);
  border-radius: 4px;
  background: var(--bz-card);
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
  color: var(--bz-fg-mid);
  transition: background 0.15s ease;
}
.live-entry__thought summary::-webkit-details-marker { display: none; }
.live-entry__thought summary:hover { background: var(--bz-purple-soft); }
.live-entry__thought summary .material-symbols-outlined {
  font-size: 16px !important;
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
}
.live-entry__thought[open] summary {
  background: var(--bz-purple-soft);
  border-bottom: 1px solid rgba(155, 109, 200, 0.3);
}
.live-entry__truncated {
  margin-left: auto;
  font-size: 0.85em;
  font-weight: 400;
  text-transform: lowercase;
  color: var(--bz-warning);
}

.live-entry__response {
  margin: 0;
  padding: 0.85em 1em;
  font-family: "Fira Code", "JetBrains Mono", "SF Mono", monospace;
  font-size: 0.78em !important;
  line-height: 1.55;
  color: var(--bz-fg);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
  background: var(--bz-canvas);
}
.live-entry__response::-webkit-scrollbar { width: 4px; }
.live-entry__response::-webkit-scrollbar-thumb {
  background: rgba(155, 109, 200, 0.45); border-radius: 999px;
}

/* ───────── In-flight streaming cards ───────── */
.live__entries--streaming { margin-bottom: 0.5em; }
.live-entry--streaming {
  border-left: 3px solid var(--bz-purple-300) !important;
  background: var(--bz-purple-soft) !important;
}
.live-entry__response--streaming {
  /* No collapsing details — show the streaming text inline */
  background: var(--bz-canvas);
  margin-top: 0.4em;
  border: 1px solid rgba(155, 109, 200, 0.35);
  border-radius: 4px;
}
.live-entry__cursor {
  display: inline-block;
  margin-left: 0.1em;
  color: var(--bz-purple-300);
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
  background: var(--bz-danger-soft);
  border-top: 1px solid rgba(241, 70, 104, 0.4);
  color: #ffd0d8;
  font-size: 0.82em;
  line-height: 1.45;
}
.live-entry__parse-error .material-symbols-outlined {
  font-size: 16px !important;
  color: var(--bz-danger) !important;
  -webkit-text-fill-color: var(--bz-danger) !important;
  background: none !important;
}

.live-entry__link {
  display: flex; align-items: center; gap: 0.3em;
  font-size: 0.78em;
  margin-top: 0.3em;
  color: var(--bz-fg-low);
}
.live-entry__link .material-symbols-outlined { font-size: 14px; color: var(--bz-fg-low) !important; -webkit-text-fill-color: var(--bz-fg-low) !important; background: none !important; }
.live-entry__link code {
  background: var(--bz-raised);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: "Fira Code", "JetBrains Mono", monospace;
  font-size: 0.95em;
}

/* ───────── Animation: new entries fade + slide in ───────── */
.live-entry-enter-active {
  transition:
    opacity 0.55s cubic-bezier(.16, 1, .3, 1),
    transform 0.55s cubic-bezier(.16, 1, .3, 1);
}
.live-entry-enter-from {
  opacity: 0;
  transform: translateX(34px) scale(0.985);
}
.live-entry-leave-active {
  transition:
    opacity 0.42s cubic-bezier(.55, 0, .1, 1),
    transform 0.42s cubic-bezier(.55, 0, .1, 1);
  position: absolute;
}
.live-entry-leave-to {
  opacity: 0;
  transform: translateX(-42px) scale(0.985);
}
.live-entry-move {
  transition: transform 0.72s cubic-bezier(.16, 1, .3, 1);
}

.live.is-horizontal {
  box-sizing: border-box;
  height: 100%;
  padding: var(--bz-space-2) var(--bz-space-3) !important;
  min-height: 0;
  overflow: hidden;
}
.live.is-horizontal .live__head {
  flex-wrap: nowrap;
  margin-bottom: var(--bz-space-1);
}
.live.is-horizontal .panel-title {
  margin-bottom: 0;
  white-space: nowrap;
  font-size: 1rem;
}
.live.is-horizontal .live__stats {
  white-space: nowrap;
}
.live.is-horizontal .live__stream {
  max-height: none;
  overflow-x: hidden;
  overflow-y: hidden;
}
.live.is-horizontal .live__entries,
.live.is-horizontal .live__entries--streaming {
  flex-direction: row;
  gap: var(--bz-space-2);
  position: relative;
  min-height: 80px;
  width: 100%;
}
.live.is-horizontal .live-entry {
  flex: 1 1 calc((100% - (2 * var(--bz-space-2))) / 3);
  max-width: calc((100% - (2 * var(--bz-space-2))) / 3);
  grid-template-columns: 1fr;
  gap: var(--bz-space-1);
  min-height: 72px;
  max-height: 80px;
  overflow: hidden;
  padding: var(--bz-space-2) var(--bz-space-3);
}
.live.is-horizontal .live-entry__time {
  order: 2;
  padding-top: 0;
  font-size: 0.64em;
}
.live.is-horizontal .live-entry__icon {
  display: none;
}
.live.is-horizontal .live-entry__head {
  flex-wrap: nowrap;
  min-width: 0;
  padding-right: 30px;
  gap: var(--bz-space-2);
  margin-bottom: 0;
}
.live.is-horizontal .live-entry__role,
.live.is-horizontal .live-entry__status {
  flex: 0 0 auto;
}
.live.is-horizontal .live-entry__action {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.live.is-horizontal .live-entry__note {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8em;
}
.live.is-horizontal .live-entry__duration {
  display: none;
}
.live.is-horizontal .live-entry__thought,
.live.is-horizontal .live-entry__link {
  display: none;
}

.live__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6em;
  padding: 3em 1em;
  color: var(--bz-fg-low);
  font-style: italic;
  text-align: center;
}
.live__empty .material-symbols-outlined {
  font-size: 48px;
  opacity: 0.5;
}

</style>
