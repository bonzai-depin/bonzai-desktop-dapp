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
            ? 'Wipe the audit log so the next demo run starts fresh'
            : 'Clear the visible audit history (does not affect outcomes, tasks, or treasury)'"
        >
          <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
          Clear
        </button>
      </div>
    </div>

    <p v-if="!compact" class="muted">
      See coordinator planning, teammate runs, skill calls, approvals, and outputs as they happen.
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
      <div v-if="liveStreams.length && !horizontal" class="live__entries live__entries--streaming">
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
                {{ s.action === 'tickCEO' ? 'Plan next tasks' : 'Run teammate' }}
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
          v-for="entry in displayEntries"
          :key="entry._id"
          class="live-entry"
          :class="[
            `is-${entry.status || 'executed'}`,
            entry.kind === 'llm' ? 'live-entry--llm' : '',
          ]"
          role="button"
          tabindex="0"
          @click="openDetail(entry)"
          @keydown.enter.prevent="openDetail(entry)"
          @keydown.space.prevent="openDetail(entry)"
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
            </div>
            <div v-if="entry.note" class="live-entry__note">{{ sentenceCaseTask(entry.note) }}</div>
            <div class="live-entry__footer">
              <span class="live-entry__footer-spacer"></span>
              <span class="live-entry__status status-pill" :class="statusClass(entry.status)">
                {{ statusLabel(entry) }}
              </span>
            </div>

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
              ? 'Waiting for the next demo run...'
              : (charter.status === 'paused'
                  ? 'This team is paused. Resume to see activity.'
                  : 'Waiting for the next scheduled run. Click Plan next tasks to start immediately.')
          }}
        </div>
      </div>
    </div>

    <div
      v-if="selectedEntry"
      class="feed-detail-overlay"
      @click.self="closeDetail"
    >
      <section class="feed-detail models__activity--payouts" aria-modal="true" role="dialog">
        <div class="feed-detail__head">
          <div>
            <p class="feed-detail__eyebrow">{{ selectedEntry.kind || 'event' }}</p>
            <h3 class="feed-detail__title fira-sans-condensed-black-italic">
              {{ detailTitle }}
            </h3>
          </div>
          <BzCloseButton size="md" aria-label="Close feed detail" @click="closeDetail" />
        </div>

        <div class="feed-detail__meta">
          <span v-if="selectedEntry.role" class="status-pill status-pill--queued">{{ roleDisplayName(selectedEntry.role) }}</span>
          <span class="status-pill" :class="statusClass(selectedEntry.status)">{{ statusLabel(selectedEntry) }}</span>
          <span>{{ fmtRelative(selectedEntry.ts) }}</span>
          <span v-if="selectedEntry.llm?.durationMs">{{ selectedEntry.llm.durationMs }}ms</span>
        </div>

        <div class="feed-detail__grid">
          <article v-if="detailGoal" class="feed-detail__panel">
            <h4 class="fira-sans-condensed-black-italic">Goal</h4>
            <strong>{{ detailGoal.title }}</strong>
            <p v-if="detailGoal.rationale || detailGoal.missionAlignment">
              {{ detailGoal.rationale || detailGoal.missionAlignment }}
            </p>
            <dl>
              <div><dt>Status</dt><dd>{{ detailGoal.status }}</dd></div>
              <div><dt>Created</dt><dd>{{ fmtRelative(detailGoal.createdAt) }}</dd></div>
              <div><dt>Updated</dt><dd>{{ fmtRelative(detailGoal.updatedAt || detailGoal.createdAt) }}</dd></div>
            </dl>
          </article>

          <article v-if="detailIssue" class="feed-detail__panel">
            <h4 class="fira-sans-condensed-black-italic">Issue</h4>
            <strong>{{ detailIssue.title }}</strong>
            <p v-if="detailIssue.description">{{ detailIssue.description }}</p>
            <dl>
              <div><dt>Status</dt><dd>{{ String(detailIssue.status || '').replace('_', ' ') }}</dd></div>
              <div><dt>Priority</dt><dd>{{ detailIssue.priority }}</dd></div>
              <div><dt>Assignee</dt><dd>{{ roleDisplayName(detailIssue.assigneeRole) }}</dd></div>
              <div><dt>Attempts</dt><dd>{{ detailIssue.attempts?.length || 0 }}</dd></div>
            </dl>
          </article>

          <article v-if="detailContent" class="feed-detail__panel feed-detail__panel--wide">
            <h4 class="fira-sans-condensed-black-italic">Result</h4>
            <div class="feed-detail__result-meta">
              <span class="status-pill status-pill--queued">{{ detailContent.pipeline }}</span>
              <span>{{ fmtRelative(detailContent.createdAt) }}</span>
              <span v-if="detailContent.shareLink">{{ detailContent.shareLink }}</span>
            </div>
            <pre class="feed-detail__output">{{ contentPreview(detailContent) }}</pre>
          </article>

          <article class="feed-detail__panel feed-detail__panel--wide">
            <h4 class="fira-sans-condensed-black-italic">Completion metadata</h4>
            <dl>
              <div><dt>Action</dt><dd>{{ formatLLMAction(selectedEntry) || formatAction(selectedEntry.action) }}</dd></div>
              <div><dt>Event id</dt><dd>{{ selectedEntry.id || selectedEntry._id }}</dd></div>
              <div v-if="selectedEntry.txOrLink"><dt>Receipt</dt><dd>{{ selectedEntry.txOrLink }}</dd></div>
              <div v-if="selectedEntry.note"><dt>Note</dt><dd>{{ selectedEntry.note }}</dd></div>
            </dl>
            <details v-if="selectedEntry.llm?.response" class="feed-detail__raw">
              <summary>Model response</summary>
              <pre>{{ selectedEntry.llm.response }}</pre>
            </details>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted, onUnmounted } from "vue";
import companyStore from "../../stores/companyStore.js";
import BzCloseButton from "../BzCloseButton.vue";
import { i18n } from "../../i18n/index.js";
import { formatRoleTitle } from "../../services/company/presentation.js";

export default {
  name: "CompanyLiveFeed",
  components: { BzCloseButton },
  props: {
    charter: { type: Object, required: true },
    state: { type: Object, required: true },
    compact: { type: Boolean, default: false },
    horizontal: { type: Boolean, default: false },
  },
  setup(props) {
    const store = companyStore;
    const activeFilter = ref("all");
    const selectedEntry = ref(null);
    const carouselIndex = ref(0);
    const now = ref(Date.now());

    // Relative labels do not need a frame-rate clock. A five-second tick
    // keeps live durations legible without waking the whole feed each second.
    let _now = null;
    let _carousel = null;
    onMounted(() => {
      _now = setInterval(() => {
        if (!document.hidden) now.value = Date.now();
      }, 5000);
      _carousel = setInterval(() => {
        if (!props.horizontal || filtered.value.length <= 3) return;
        carouselIndex.value = (carouselIndex.value + 1) % filtered.value.length;
      }, 4200);
    });
    onUnmounted(() => {
      if (_now) clearInterval(_now);
      if (_carousel) clearInterval(_carousel);
    });

    const filters = [
      { id: "all",       label: "All" },
      { id: "llm",       label: "Feedback" },
      { id: "system",    label: "System" },
      { id: "issue",     label: "Work" },
      { id: "action",    label: "Actions" },
      { id: "production",label: "Results" },
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
    const displayEntries = computed(() => {
      if (!props.horizontal) return filtered.value.slice(0, entryLimit.value);
      const list = filtered.value;
      if (list.length <= 3) return list;
      return Array.from({ length: 3 }, (_, idx) => list[(carouselIndex.value + idx) % list.length]);
    });
    const detailIssue = computed(() => {
      const id = selectedEntry.value?.issueId;
      return id ? (props.state.issues || []).find((issue) => issue.id === id) || null : null;
    });
    const detailGoal = computed(() => {
      const id = selectedEntry.value?.goalId || detailIssue.value?.goalId;
      return id ? (props.state.goals || []).find((goal) => goal.id === id) || null : null;
    });
    const detailContent = computed(() => {
      const id = selectedEntry.value?.contentId;
      return id ? (props.state.catalog || []).find((row) => row.id === id) || null : null;
    });
    const detailTitle = computed(() => {
      if (detailContent.value) return detailContent.value.prompt || "Produced deliverable";
      if (detailIssue.value) return detailIssue.value.title;
      if (detailGoal.value) return detailGoal.value.title;
      return selectedEntry.value?.note || formatAction(selectedEntry.value?.action) || "Company event";
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
        if (entry.action === "tickCEO") return "Plan next tasks";
        if (entry.action === "tickRole") return "Run teammate";
      }
      return formatAction(entry.action);
    }

    function fmtRelative(ts) {
      if (!ts) return "—";
      const stamp = typeof ts === "number" ? ts : new Date(ts).getTime();
      if (!Number.isFinite(stamp)) return "—";
      const delta = Math.max(0, now.value - stamp);
      if (delta < 5_000) return "just now";
      if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
      if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
      if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
      const d = new Date(stamp);
      return d.toLocaleString(i18n.state.locale);
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
    function sentenceCaseTask(value) {
      const text = String(value || "").trim();
      if (!text) return "";
      const lowered = text
        .split(/\s+/)
        .map((word) => (/^[A-Z0-9]{2,}$/.test(word.replace(/[^\p{L}\p{N}]/gu, "")) ? word : word.toLocaleLowerCase()))
        .join(" ");
      return lowered.charAt(0).toLocaleUpperCase() + lowered.slice(1);
    }
    function contentPreview(row) {
      if (!row) return "";
      if (typeof row.payload === "string") return stripReasoningTags(row.payload);
      if (row.blobId) return `${row.pipeline || "media"} artifact saved as ${row.blobExt || "blob"} (${row.blobId})`;
      return row.shareLink || "Artifact recorded.";
    }
    function stripReasoningTags(value) {
      return String(value || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<\/?(?:think|thinking|reasoning|analysis|reflection)\b[^>]*>/gi, "")
        .trim();
    }
    function openDetail(entry) {
      selectedEntry.value = entry;
    }
    function closeDetail() {
      selectedEntry.value = null;
    }

    function _titleCase(s) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function roleDisplayName(roleKey) {
      return formatRoleTitle(roleKey);
    }

    /**
     * Wipe the team's audit log. Outcomes, tasks, treasury, and
     * outputs are preserved — this only clears the live-feed source.
     */
    async function clearFeed() {
      if (!confirm("Clear the live feed?\n\nThis wipes the audit log only. Your outcomes, tasks, treasury, and outputs stay intact.")) return;
      try { await store.clearAudit(); }
      catch (err) { alert("Could not clear feed: " + (err.message || err)); }
    }
    async function removeEntry(entry) {
      if (!entry?.id) return;
      await store.removeAuditEntry(entry.id);
    }

    return {
      activeFilter, filters, filtered, entries, counts, recentRate, entryLimit, displayEntries,
      selectedEntry, detailTitle, detailGoal, detailIssue, detailContent,
      liveStreams, nowTs,
      iconFor, statusClass, statusLabel, fmtRelative, formatAction, formatLLMAction, roleDisplayName,
      contentPreview, sentenceCaseTask, openDetail, closeDetail,
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
  background: var(--bz-border);
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
.live.is-compact {
  padding: var(--bz-space-2) var(--bz-space-3) !important;
}
.live.is-horizontal {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.live.is-horizontal .panel-title {
  margin-bottom: 0 !important;
  font-size: 1.1rem;
}
.live.is-horizontal .live__head {
  min-height: 24px;
}
.live.is-horizontal .live__stream {
  max-height: none;
  height: 100%;
  display: flex;
  align-items: stretch;
  overflow: hidden;
}
.live.is-horizontal .live__entries {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bz-space-2);
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
  cursor: pointer;
}
.live-entry__body {
  min-width: 0;
}
.live.is-horizontal .live-entry {
  width: 100%;
  max-width: none;
  min-width: 0;
  min-height: 0;
  max-height: none;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: var(--bz-space-1);
  padding: var(--bz-space-2) var(--bz-space-3);
  overflow: hidden;
}
.live.is-horizontal .live-entry__time,
.live.is-horizontal .live-entry__icon {
  display: none;
}
.live.is-horizontal .live-entry__head {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  flex-wrap: nowrap;
  min-width: 0;
  gap: var(--bz-space-1);
  margin: 0;
}
.live.is-horizontal .live-entry__body {
  min-width: 0;
  width: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: var(--bz-space-2);
  height: 100%;
}
.live.is-horizontal .live-entry__role,
.live.is-horizontal .live-entry__action {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.live.is-horizontal .live-entry__note {
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  white-space: normal;
  color: var(--bz-fg-mid);
  font-size: 11px;
  line-height: 1.3;
}
.live-entry:hover,
.live-entry:focus-visible {
  border-color: var(--bz-border-strong);
  outline: none;
}
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
.live-entry.is-error        { border-left: 3px solid var(--bz-warning); }
.live-entry.is-parse_error  { border-left: 3px solid var(--bz-warning); }
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
  font-size: 0.82rem;
  color: var(--bz-fg);
}
.live-entry__action {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.76em;
  color: var(--bz-fg-mid);
  letter-spacing: 0.02em;
}
.live-entry__status {
  font-size: 10px !important;
  text-transform: capitalize;
}
.live-entry__footer {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: var(--bz-space-2);
  margin-top: auto;
}
.live-entry__footer-spacer {
  flex: 1 1 auto;
}
.status-pill {
  min-height: 18px;
  display: inline-flex;
  align-items: center;
  padding: 0 7px;
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
  border-color: var(--bz-warning);
  background: var(--bz-warning-soft);
  color: var(--bz-warning);
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
  font-size: 0.78em;
  line-height: 1.35;
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
.live.is-horizontal .live-entry-enter-active,
.live.is-horizontal .live-entry-leave-active,
.live.is-horizontal .live-entry-move {
  transition:
    opacity 0.72s cubic-bezier(.16, 1, .3, 1),
    transform 0.72s cubic-bezier(.16, 1, .3, 1);
}

.live.is-horizontal {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
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
.live.is-horizontal .live-entry__role,
.live.is-horizontal .live-entry__action,
.live.is-horizontal .live-entry__status {
  white-space: nowrap;
}
.live.is-horizontal .live-entry__delete {
  display: none;
}
.live.is-horizontal .live-entry__time,
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

.feed-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--bz-space-5);
  background: rgba(7, 7, 10, 0.72);
}
.feed-detail {
  width: min(980px, calc(100vw - 48px));
  max-height: min(780px, calc(100vh - 48px));
  overflow: auto;
  padding: var(--bz-space-5) !important;
}
.feed-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-4);
}
.feed-detail__eyebrow {
  margin: 0 0 var(--bz-space-1) !important;
  color: var(--bz-fg-low) !important;
  font-size: 11px !important;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.feed-detail__title {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 28px !important;
  line-height: 1;
  text-align: left !important;
}
.feed-detail__meta,
.feed-detail__result-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 12px;
}
.feed-detail__meta {
  margin-top: var(--bz-space-3);
}
.feed-detail__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-4);
}
.feed-detail__panel {
  min-width: 0;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.feed-detail__panel--wide {
  grid-column: 1 / -1;
}
.feed-detail__panel h4 {
  margin: 0 0 var(--bz-space-2) !important;
  color: var(--bz-fg) !important;
  font-size: 16px !important;
  text-align: left !important;
  text-transform: uppercase;
}
.feed-detail__panel strong {
  display: block;
  color: var(--bz-fg);
  font-size: 16px;
  line-height: 1.3;
}
.feed-detail__panel p {
  margin: var(--bz-space-2) 0 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 13px !important;
  line-height: 1.45;
  text-align: left !important;
}
.feed-detail__panel dl {
  display: grid;
  gap: var(--bz-space-2);
  margin: var(--bz-space-3) 0 0;
}
.feed-detail__panel dl div {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: var(--bz-space-3);
}
.feed-detail__panel dt {
  color: var(--bz-fg-low);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.feed-detail__panel dd {
  min-width: 0;
  margin: 0;
  color: var(--bz-fg-mid);
  overflow-wrap: anywhere;
}
.feed-detail__output,
.feed-detail__raw pre {
  max-height: 280px;
  overflow: auto;
  margin: var(--bz-space-3) 0 0;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  color: var(--bz-fg);
  font-family: "Fira Code", "JetBrains Mono", "SF Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.feed-detail__raw {
  margin-top: var(--bz-space-3);
}
.feed-detail__raw summary {
  cursor: pointer;
  color: var(--bz-fg-mid);
  font-size: 12px;
  text-transform: uppercase;
}

@media (max-width: 820px) {
  .feed-detail__grid {
    grid-template-columns: 1fr;
  }
  .feed-detail__panel--wide {
    grid-column: auto;
  }
}

</style>
