<template>
  <div class="live company-screen" :class="{ 'is-compact': compact, 'is-horizontal': horizontal }">
    <div class="live__head">
      <label v-if="!compact" class="live__member-filter"><span>{{ $ui('Member') }}</span><select v-model="memberFilter" :aria-label="$ui('Filter by member')"><option value="">{{ $ui('All members') }}</option><option v-for="role in memberRoles" :key="role" :value="role">{{ roleDisplayName(role) }}</option></select></label>
      <span v-else class="fira-sans-condensed-black-italic">{{ $ui('Activity') }}</span>
      <label v-if="!compact" class="company-search live-search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="query" :aria-label="$ui('Search activity')" :placeholder="$ui('Search activity')" /></label>
      <div class="live__head-right">
        <div class="live__stats">
          <span class="live__count fira-sans-condensed-black-italic">{{ filtered.length }}</span>
          <span class="live__count-label">{{ $ui('events') }}</span>
          <span class="live__separator">·</span>
          <span class="live__rate bz-metric" :class="{ 'is-active': recentRate > 0 }">
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
          {{ $ui('Clear') }}
        </button>
      </div>
    </div>

    <!-- Filter chips -->
    <div v-if="!compact" class="live__filters">
      <button
        v-for="f in filters"
        :key="f.id"
        class="live__chip"
        :class="{ 'is-active': activeFilter === f.id }"
        :aria-pressed="activeFilter === f.id"
        @click="activeFilter = f.id"
      >
        {{ $ui(f.label) }}
        <span v-if="counts[f.id] !== undefined" class="live__chip-count bz-metric">{{ counts[f.id] }}</span>
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
          <div class="live-entry__time">{{ $ui('Live') }}</div>
          <div class="live-entry__icon">
            <span class="material-symbols-outlined live__pulse">neurology</span>
          </div>
          <div class="live-entry__body">
            <div class="live-entry__head">
              <span class="live-entry__role fira-sans-condensed-black-italic">
                {{ roleDisplayName(s.role) }} · {{ charter.name }}
              </span>
              <span class="live-entry__action">
                {{ $ui(s.action === 'tickCEO' ? 'Plan next tasks' : 'Run teammate') }}
              </span>
              <span class="live-entry__duration bz-metric">
                {{ Math.round((nowTs - s.startedAt) / 1000) }}<small>s</small>
              </span>
              <span class="live-entry__status status-pill status-pill--queued">{{ $ui('Generating…') }}</span>
            </div>
            <pre class="live-entry__response live-entry__response--streaming">{{ stripReasoningTags(s.response) || '…' }}<span class="live-entry__cursor">▍</span></pre>
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
          @click="openDetail(entry)"
        >
          <div class="live-entry__time">{{ fmtRelative(entry.ts) }}</div>
          <div class="live-entry__icon">
            <span class="material-symbols-outlined">{{ iconFor(entry) }}</span>
          </div>
          <div class="live-entry__body">
            <div class="live-entry__head">
              <span class="live-entry__role fira-sans-condensed-black-italic" data-i18n-skip>
                {{ entry.extra?.teamMessage?.author_role === 'owner' ? $t('teamExchanges.owner') : entry.extra?.teamMessage?.author_name || roleDisplayName(entry.role) }} · {{ entry.extra?.teamMessage?.team_name || charter.name }}
              </span>
              <span class="live-entry__action">{{ formatLLMAction(entry) }}</span>
              <span
                v-if="entry.kind === 'llm' && entry.llm?.durationMs"
                class="live-entry__duration bz-metric"
                :title="entry.llm.durationMs + 'ms model latency'"
              >
                {{ entry.llm.durationMs }}<small>ms</small>
              </span>
            </div>
            <div v-if="entry.note" class="live-entry__note" data-i18n-skip>{{ sentenceCaseTask(entry.note) }}</div>
            <div class="live-entry__footer">
              <span class="live-entry__footer-spacer"></span>
              <button type="button" class="live-entry__inspect" @click.stop="openDetail(entry)" :aria-label="$ui('View details') + ': ' + sentenceCaseTask(entry.note || formatLLMAction(entry))">{{ $ui("View details") }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
              <span class="live-entry__status status-pill" :class="statusClass(entry.status)">
                {{ statusLabel(entry) }}
              </span>
            </div>

            <!-- LLM response: collapsible by default; pre-formatted body -->
            <details @click.stop @keydown.stop v-if="entry.kind === 'llm' && entry.llm?.response" class="live-entry__thought">
              <summary>
                <span class="material-symbols-outlined">notes</span>
                <span>{{ $ui(entry.status === 'parse_error' ? 'Show model response' : 'Show response') }}</span>
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
              :title="$ui('Delete feed item')"
              :aria-label="$ui('Delete feed item')"
            >
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>
      </transition-group>
      <div v-if="!filtered.length" class="live__empty">
        <span class="material-symbols-outlined">hourglass_empty</span>
        <div>
          {{ (query || memberFilter || activeFilter!=='all') ? $ui('No matching activity.') : charter.demoMode
              ? 'Waiting for the next demo run...'
              : (charter.status === 'paused'
                  ? 'This team is paused. Resume to see activity.'
                  : 'Waiting for the next scheduled run. Click Plan next tasks to start immediately.')
          }}
        </div>
      </div>
    </div>

    <Teleport to="body">
    <div
      v-if="selectedEntry"
      class="feed-detail-overlay company-screen"
      @click.self="closeDetail"
    >
      <section ref="detailDialog" class="feed-detail" aria-modal="true" role="dialog" aria-labelledby="company-feed-detail-title" data-i18n-skip>
        <div class="feed-detail__head">
          <div>
            <p class="feed-detail__eyebrow">{{ $ui('Activity') }}</p>
            <h3 id="company-feed-detail-title" class="feed-detail__title fira-sans-condensed-black-italic">
              {{ detailTitle }}
            </h3>
          </div>
          <BzCloseButton size="md" :aria-label="$ui('Close feed detail')" @click="closeDetail" />
        </div>

        <div class="feed-detail__meta">
          <span class="status-pill status-pill--queued" data-i18n-skip>{{ selectedEntry.extra?.teamMessage?.author_role === 'owner' ? $t('teamExchanges.owner') : selectedEntry.extra?.teamMessage?.author_name || roleDisplayName(selectedEntry.role) }} · {{ selectedEntry.extra?.teamMessage?.team_name || charter.name }}</span>
          <span v-if="selectedEntry.extra?.teamMessage?.author_role && selectedEntry.extra.teamMessage.author_role !== 'owner'">{{ $ui(formatRoleTitle(selectedEntry.extra.teamMessage.author_role)) }}</span>
          <span class="status-pill" :class="statusClass(selectedEntry.status)">{{ statusLabel(selectedEntry) }}</span>
          <span>{{ fmtRelative(selectedEntry.ts) }}</span>
          <span v-if="selectedEntry.llm?.durationMs">{{ selectedEntry.llm.durationMs }}ms</span>
        </div>

        <div class="feed-detail__actions">
          <button v-if="detailWorkspace" type="button" class="bz-btn bz-btn--secondary" @click="$emit('open-view', detailWorkspace.key); closeDetail()"><span class="material-symbols-outlined" aria-hidden="true">{{ detailWorkspace.icon }}</span>{{ $ui(detailWorkspace.label) }}</button>
          <button v-if="detailIssue" type="button" class="bz-btn bz-btn--secondary" @click="closeDetail(); $emit('open-view', 'issues')"><span class="material-symbols-outlined" aria-hidden="true">checklist</span>{{ $ui('Backlog') }}</button>
          <button v-if="detailContent" type="button" class="bz-btn bz-btn--primary" @click="closeDetail(); $emit('open-view', 'deliverables')"><span class="material-symbols-outlined" aria-hidden="true">folder_open</span>{{ $ui('Results') }}</button>
        </div>
        <p v-if="selectedEntry.llm?.parseError || selectedEntry.error" class="live-entry__parse-error" role="alert">{{ selectedEntry.llm?.parseError || selectedEntry.error }}</p>
        <div class="feed-detail__grid">
          <article v-if="detailGoal" class="feed-detail__panel">
            <h4 class="fira-sans-condensed-black-italic">{{ $ui('Goal') }}</h4>
            <strong>{{ detailGoal.title }}</strong>
            <p v-if="detailGoal.rationale || detailGoal.missionAlignment">
              {{ detailGoal.rationale || detailGoal.missionAlignment }}
            </p>
            <dl>
              <div><dt>{{ $ui('Status') }}</dt><dd>{{ $ui(detailGoal.status) }}</dd></div>
              <div><dt>{{ $ui('Created') }}</dt><dd>{{ fmtRelative(detailGoal.createdAt) }}</dd></div>
              <div><dt>{{ $ui('Updated') }}</dt><dd>{{ fmtRelative(detailGoal.updatedAt || detailGoal.createdAt) }}</dd></div>
            </dl>
          </article>

          <article v-if="detailIssue" class="feed-detail__panel">
            <h4 class="fira-sans-condensed-black-italic">{{ $ui('Issue') }}</h4>
            <strong>{{ detailIssue.title }}</strong>
            <p v-if="detailIssue.description">{{ detailIssue.description }}</p>
            <dl>
              <div><dt>{{ $ui('Status') }}</dt><dd>{{ $ui(String(detailIssue.status || '').replaceAll('_', ' ')) }}</dd></div>
              <div><dt>{{ $ui('Priority') }}</dt><dd>{{ detailIssue.priority }}</dd></div>
              <div><dt>{{ $ui('Assignee') }}</dt><dd>{{ roleDisplayName(detailIssue.assigneeRole) }}</dd></div>
              <div><dt>{{ $ui('Attempts') }}</dt><dd>{{ detailIssue.attempts?.length || 0 }}</dd></div>
            </dl>
          </article>

          <article v-if="detailContent" class="feed-detail__panel feed-detail__panel--wide">
            <h4 class="fira-sans-condensed-black-italic">{{ $ui('Result') }}</h4>
            <div class="feed-detail__result-meta">
              <span class="status-pill status-pill--queued">{{ detailContent.pipeline }}</span>
              <span>{{ fmtRelative(detailContent.createdAt) }}</span>
              <span v-if="detailContent.shareLink">{{ detailContent.shareLink }}</span>
            </div>
            <CompanyArtifactPreview :row="detailContent" />
          </article>

          <article class="feed-detail__panel feed-detail__panel--wide">
            <h4 class="fira-sans-condensed-black-italic">{{ $ui('Completion metadata') }}</h4>
            <dl>
              <div><dt>{{ $ui('Action') }}</dt><dd>{{ formatLLMAction(selectedEntry) || formatAction(selectedEntry.action) }}</dd></div>
              <div><dt>{{ $ui('Event id') }}</dt><dd>{{ selectedEntry.id || selectedEntry._id }}</dd></div>
              <div v-if="selectedEntry.txOrLink"><dt>{{ $ui('Receipt') }}</dt><dd>{{ selectedEntry.txOrLink }}</dd></div>
              <div v-if="selectedEntry.note"><dt>{{ $ui('Note') }}</dt><dd>{{ selectedEntry.note }}</dd></div>
            </dl>
            <details v-if="selectedEntry.llm?.response" class="feed-detail__raw">
              <summary>{{ $ui('Model response') }}</summary>
              <CompanyMarkdown :source="selectedEntry.llm.response" />
            </details>
          </article>
        </div>
      </section>
    </div>
    </Teleport>
  </div>
</template>

<script>
import "./company-design.css";
import { actionDisplayName } from "../../services/company/actionLabels.js";
import { visibleText as stripReasoningTags, visibleRecord } from "../../shared/visibleText.js";
import { computed, ref, onMounted, onUnmounted } from "vue";
import companyStore from "../../stores/companyStore.js";
import BzCloseButton from "../BzCloseButton.vue";
import CompanyMarkdown from "./CompanyMarkdown.vue";
import CompanyArtifactPreview from "./CompanyArtifactPreview.vue";
import { useModalAccessibility } from "../../composables/useModalAccessibility.js";
import {operationText} from "../../i18n/operations.js";
import { i18n } from "../../i18n/index.js";
import { formatRoleTitle } from "../../services/company/presentation.js";

export default {
  name: "CompanyLiveFeed",
  components: { BzCloseButton, CompanyMarkdown, CompanyArtifactPreview },
  emits: ["open-view", "open-result"],
  props: {
    charter: { type: Object, required: true },
    state: { type: Object, required: true },
    compact: { type: Boolean, default: false },
    horizontal: { type: Boolean, default: false },
  },
  setup(props) {
    const displayState = computed(() => visibleRecord(props.state));
    const store = companyStore;
    const activeFilter = ref("all"), query=ref('');
    const selectedEntry = ref(null);
    const detailDialog = ref(null);
    useModalAccessibility(detailDialog, { onClose: closeDetail });
    const carouselIndex = ref(0);
    const now = ref(Date.now());
    const memberFilter = ref('');
    const memberRoles = computed(() => [...new Set([...Object.keys(props.charter.roles || {}), ...(displayState.value.audit || []).map(entry => entry.role).filter(Boolean)])]);

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

    const audit = computed(() => visibleRecord(displayState.value.audit || []));

    /**
     * In-flight LLM streams keyed by streamId. These render at the top
     * of the feed and update as tokens arrive — the user sees the model
     * "type" the response in real time.
     */
    const liveStreams = computed(() => {
      const map = displayState.value.activeStreams || {};
      return Object.values(map).filter(s=>s.companyId===props.charter.id && (!memberFilter.value || s.role === memberFilter.value)).sort((a, b) => a.startedAt - b.startedAt);
    });
    // Re-use `now` for "Xs" duration on streams.
    const nowTs = now;

    // Pre-compute keyed entries (newest first, with stable keys for the
    // transition-group so newcomers animate in cleanly).
    const entries = computed(() =>
      audit.value
        .filter(entry => !memberFilter.value || entry.role === memberFilter.value)
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
      const text=query.value.trim().toLocaleLowerCase();
      return entries.value.filter(e=>(activeFilter.value==='all' || e.kind===activeFilter.value) && (!text || [e.note,e.action,e.role,e.status,e.response].some(value=>String(value||'').toLocaleLowerCase().includes(text))));
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
      return id ? (displayState.value.issues || []).find((issue) => issue.id === id) || null : null;
    });
    const detailWorkspace = computed(() => {
      const action = selectedEntry.value?.action || '';
      if (action.startsWith('billing.')) return {key:'billing',label:'Billing',icon:'receipt_long'};
      if (action.startsWith('purchasing.')) return {key:'purchasing',label:'Purchasing',icon:'shopping_bag'};
      if (action.startsWith('maintenance.')) return {key:'operations-settings',label:'Operations settings',icon:'settings'};
      return null;
    });
    const detailGoal = computed(() => {
      const id = selectedEntry.value?.goalId || detailIssue.value?.goalId;
      return id ? (displayState.value.goals || []).find((goal) => goal.id === id) || null : null;
    });
    const detailContent = computed(() => {
      const id = selectedEntry.value?.contentId;
      return id ? (displayState.value.catalog || []).find((row) => row.id === id) || null : null;
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
      if (entry.kind === "llm") return "neurology";
      const map = {
        system: "settings",
        issue: "task_alt",
        action: "play_arrow",
        production: "draft",
        veto: "block",
        treasury: "savings",
        approval: "rule",
      };
      // Specific overrides by action verb
      if (entry.action) {
        if (/createGoal|delegate/i.test(entry.action)) return "flag";
        if (/issue\.done/i.test(entry.action)) return "check_circle";
        if (/issue\.error|issue\.blocked/i.test(entry.action)) return "error";
        if (/tickCEO/i.test(entry.action)) return "neurology";
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
        parse_error: "status-pill--error",
        queued: "status-pill--queued",
        pending: "status-pill--queued",
      })[s] || "status-pill--neutral";
    }

    function statusLabel(entry) {
      if (entry.kind === "llm" && entry.status === "executed") return operationText("Response received", i18n.state.locale);
      if (entry.status === "parse_error") return operationText("Retry needed", i18n.state.locale);
      return operationText(entry.status || "executed", i18n.state.locale);
    }

    /**
     * For LLM "thought" entries, the action field is `tickCEO` / `tickRole`
     * — re-label these as "Planning" / "Reasoning" so the live feed reads
     * naturally instead of exposing internal scheduler verbs.
     */
    function formatLLMAction(entry) {
      if (entry.kind === "llm") {
        if (entry.action === "tickCEO") return operationText("Plan next tasks", i18n.state.locale);
        if (entry.action === "tickRole") return operationText("Run teammate", i18n.state.locale);
      }
      return formatAction(entry.action);
    }

    function fmtRelative(ts) {
      if (!ts) return "—";
      const stamp = typeof ts === "number" ? ts : new Date(ts).getTime();
      if (!Number.isFinite(stamp)) return "—";
      const delta = stamp - now.value;
      const absolute = Math.abs(delta);
      const [value, unit] = absolute < 60_000 ? [Math.round(delta / 1000), 'second'] : absolute < 3_600_000 ? [Math.round(delta / 60_000), 'minute'] : absolute < 86_400_000 ? [Math.round(delta / 3_600_000), 'hour'] : [Math.round(delta / 86_400_000), 'day'];
      return new Intl.RelativeTimeFormat(i18n.state.locale, { numeric: 'auto', style: 'short' }).format(value, unit);
    }

    function formatAction(a) { return actionDisplayName(a, i18n.state.locale); }
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
      return operationText(formatRoleTitle(roleKey),i18n.state.locale);
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
      query, stripReasoningTags, activeFilter, filters, filtered, entries, counts, recentRate, entryLimit, displayEntries,
      formatRoleTitle, detailDialog, selectedEntry, detailTitle, detailGoal, detailIssue, detailContent, detailWorkspace,
      liveStreams, nowTs, memberFilter, memberRoles,
      iconFor, statusClass, statusLabel, fmtRelative, formatAction, formatLLMAction, roleDisplayName,
      contentPreview, sentenceCaseTask, openDetail, closeDetail,
      clearFeed, removeEntry,
    };
  },
};
</script>

<style scoped>
.live { min-width: 0; color: var(--bz-fg); }
.live__head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--bz-space-4); padding-bottom: var(--bz-space-5); border-bottom: 1px solid var(--bz-border); }
.live__member-filter { display: flex; align-items: center; gap: var(--bz-space-3); font-size: var(--bz-size-meta); color: var(--bz-fg-mid); min-width: 0; }
.live__member-filter select { min-height: 40px; max-width: 260px; min-width: 0; padding: var(--bz-space-2) var(--bz-space-6) var(--bz-space-2) var(--bz-space-3); font: 400 var(--bz-size-body)/1.4 var(--bz-font-body); color: var(--bz-fg); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r); background: var(--bz-panel); }
.live__head-right { display: flex; align-items: center; gap: var(--bz-space-5); flex-wrap: wrap; }
.live__stats { display: flex; align-items: baseline; gap: var(--bz-space-2); color: var(--bz-fg-mid); }
.live__count { font-size: 28px; line-height: 1; color: var(--bz-fg); }
.live__count-label { font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
.live__separator { color: var(--bz-border-strong); margin-inline: var(--bz-space-1); }
.live__rate { color: var(--bz-fg-mid); font-size: 20px; }
.live__rate.is-active { color: var(--bz-success); }
.live__rate small { color: var(--bz-fg-mid); font: 400 var(--bz-size-meta)/1 var(--bz-font-body); }
.live__head-right > .bz-btn { font: 400 var(--bz-size-meta)/1.3 var(--bz-font-body); }
.live__filters { display: flex; gap: var(--bz-space-2); flex-wrap: wrap; padding: var(--bz-space-5) 0; }
.live__chip { min-height: 36px; padding: var(--bz-space-2) var(--bz-space-3); border: 1px solid var(--bz-border); border-radius: var(--bz-r); background: transparent; color: var(--bz-fg-mid); cursor: pointer; font: 400 var(--bz-size-meta)/1.3 var(--bz-font-body); display: inline-flex; align-items: center; gap: var(--bz-space-2); transition: background var(--bz-dur-fast), border-color var(--bz-dur-fast), color var(--bz-dur-fast); }
.live__chip:hover { border-color: var(--bz-border-strong); background: var(--bz-raised); color: var(--bz-fg); }
.live__chip.is-active { color: var(--bz-fg); border-color: var(--bz-border-brand); background: var(--bz-purple-soft); }
.live__chip-count { min-width: 18px; text-align: center; font-size: 16px; color: var(--bz-fg); }
.live__stream { min-width: 0; scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; }
.live__entries { display: flex; flex-direction: column; gap: var(--bz-space-3); }
.live__entries--streaming { margin-bottom: var(--bz-space-3); }
.live-entry { position: relative; display: grid; grid-template-columns: 80px minmax(0, 1fr); grid-template-rows: 44px minmax(0, 1fr); column-gap: var(--bz-space-5); align-items: start; padding: var(--bz-space-5); border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); background: var(--bz-panel); cursor: pointer; transition: background var(--bz-dur-fast), border-color var(--bz-dur-fast); }
.live-entry:hover { border-color: var(--bz-border-strong); background: var(--bz-card); }
.live-entry:focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; }
.live-entry__time { grid-column: 1; grid-row: 2; align-self: start; text-align: center; padding-top: var(--bz-space-2); color: var(--bz-fg-mid); font: 400 var(--bz-size-meta)/1.4 var(--bz-font-body); overflow-wrap: anywhere; }
.live-entry__icon { grid-column: 1; grid-row: 1; display: grid; place-items: center; width: 44px; height: 44px; justify-self: center; border: 1px solid var(--bz-border); border-radius: var(--bz-r); background: var(--bz-card); color: var(--bz-fg-mid); }
.live-entry__icon .material-symbols-outlined { font-size: 24px; font-variation-settings: "FILL" 0, "wght" 400, "opsz" 24; }
.live-entry.is-executed .live-entry__icon { color: var(--bz-success); background: var(--bz-success-soft); border-color: transparent; }
.live-entry--llm.is-executed .live-entry__icon, .live-entry--streaming .live-entry__icon { color: var(--bz-accent); background: var(--bz-purple-soft); }
.live-entry:is(.is-error, .is-parse_error) .live-entry__icon { color: var(--bz-danger); background: var(--bz-danger-soft); }
.live-entry.is-vetoed .live-entry__icon { color: var(--bz-warning); background: var(--bz-warning-soft); }
.live-entry.is-queued .live-entry__icon { color: var(--bz-info); background: var(--bz-info-soft); }
.live-entry__body { grid-column: 2; grid-row: 1 / 3; min-width: 0; padding-right: var(--bz-space-5); }
.live-entry__head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--bz-space-1) var(--bz-space-3); margin-bottom: var(--bz-space-2); }
.live-entry__role { font: 500 var(--bz-size-body)/1.5 var(--bz-font-body); color: var(--bz-fg); overflow-wrap: anywhere; }
.live-entry__action { font: 400 var(--bz-size-meta)/1.5 var(--bz-font-body); color: var(--bz-fg-mid); }
.live-entry__note { max-width: 100ch; color: var(--bz-fg-mid); font-size: var(--bz-size-body); line-height: 1.7; overflow-wrap: anywhere; }
.live-entry__duration { margin-left: auto; color: var(--bz-fg-mid); font-size: 16px; white-space: nowrap; }
.live-entry__duration small { margin-left: 2px; color: var(--bz-fg-mid); font: 400 var(--bz-size-meta)/1 var(--bz-font-body); }
.live-entry__footer { display: flex; align-items: center; gap: var(--bz-space-2); margin-top: var(--bz-space-3); }
.live-entry__footer-spacer { display: none; }
.status-pill { min-height: 24px; display: inline-flex; align-items: center; padding: 2px var(--bz-space-2); border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-card); color: var(--bz-fg-mid); font: 400 var(--bz-size-meta)/1.4 var(--bz-font-body); }
.status-pill--executed { background: var(--bz-success-soft); border-color: transparent; color: var(--bz-success); }
.status-pill--vetoed { background: var(--bz-warning-soft); border-color: transparent; color: var(--bz-warning); }
.status-pill--error { background: var(--bz-danger-soft); border-color: transparent; color: var(--bz-danger); }
.status-pill--queued { background: var(--bz-purple-soft); border-color: transparent; color: var(--bz-accent); }
.status-pill--neutral { color: var(--bz-fg-mid); }
.live-entry__delete { position: absolute; right: var(--bz-space-2); top: var(--bz-space-2); opacity: 0; pointer-events: none; transition: opacity var(--bz-dur-fast); }
.live-entry:hover .live-entry__delete, .live-entry:focus-within .live-entry__delete { opacity: 1; pointer-events: auto; }
.live-entry__thought { margin-top: var(--bz-space-4); border-top: 1px solid var(--bz-border); }
.live-entry__thought summary { cursor: pointer; min-height: 36px; padding: var(--bz-space-3) 0; display: flex; align-items: center; gap: var(--bz-space-2); color: var(--bz-fg-mid); font: 400 var(--bz-size-meta)/1.5 var(--bz-font-body); list-style: none; }
.live-entry__thought summary::-webkit-details-marker { display: none; }
.live-entry__thought summary:hover { color: var(--bz-fg); }
.live-entry__thought summary .material-symbols-outlined { font-size: 18px; color: var(--bz-accent); }
.live-entry__truncated { margin-left: auto; color: var(--bz-warning); }
.live-entry__response { margin: 0; padding: var(--bz-space-4); border: 1px solid var(--bz-border); border-radius: var(--bz-r); font: 400 13px/1.7 var(--bz-font-mono); color: var(--bz-fg); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 360px; overflow: auto; background: var(--bz-canvas); scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; }
.live-entry--streaming { border-color: var(--bz-border-brand); }
.live-entry__response--streaming { margin-top: var(--bz-space-3); }
.live-entry__cursor { display: inline-block; margin-left: 2px; color: var(--bz-accent); animation: blink 1s steps(2, start) infinite; }
@keyframes blink { to { visibility: hidden; } }
.live-entry__parse-error { display: flex; align-items: start; gap: var(--bz-space-2); padding: var(--bz-space-3) var(--bz-space-4); border-radius: var(--bz-r-sm); margin-top: var(--bz-space-2); background: var(--bz-danger-soft); color: var(--bz-danger); font-size: var(--bz-size-meta); line-height: 1.6; overflow-wrap: anywhere; }
.live-entry__parse-error .material-symbols-outlined { font-size: 18px; flex-shrink: 0; }
.live-entry__link { display: flex; align-items: start; gap: var(--bz-space-2); margin-top: var(--bz-space-3); color: var(--bz-fg-mid); }
.live-entry__link .material-symbols-outlined { font-size: 16px; flex-shrink: 0; }
.live-entry__link code { background: var(--bz-raised); color: var(--bz-fg-mid); padding: 2px var(--bz-space-2); border-radius: var(--bz-r-xs); font: 400 var(--bz-size-meta)/1.6 var(--bz-font-mono); overflow-wrap: anywhere; }
.live-entry-enter-active, .live-entry-leave-active { transition: opacity var(--bz-dur-base) var(--bz-ease-out), transform var(--bz-dur-base) var(--bz-ease-out); }
.live-entry-enter-from { opacity: 0; transform: translateY(-6px); }
.live-entry-leave-to { opacity: 0; transform: translateY(6px); }
.live-entry-move { transition: transform var(--bz-dur-base) var(--bz-ease-out); }
.live__empty { display: grid; justify-items: center; align-content: center; gap: var(--bz-space-4); min-height: 260px; padding: var(--bz-space-7) var(--bz-space-5); color: var(--bz-fg-mid); text-align: center; font-size: var(--bz-size-body); line-height: 1.65; }
.live__empty > div { max-width: 48ch; }
.live__empty .material-symbols-outlined { font-size: 28px; color: var(--bz-fg-low); padding: var(--bz-space-4); border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); background: var(--bz-panel); }
.live.is-compact { padding: var(--bz-space-3); }
.live.is-compact .live__head { padding-bottom: var(--bz-space-3); border-bottom: 0; }
.live.is-compact .live__head-right { gap: var(--bz-space-2); }
.live.is-compact .live__count { font-size: 20px; }
.live.is-compact .live__rate { font-size: 16px; }
.live.is-compact .live__stream { max-height: calc(100dvh - 360px); overflow-y: auto; }
.live.is-horizontal { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; min-height: 0; overflow: hidden; box-sizing: border-box; }
.live.is-horizontal .live__head { flex-wrap: nowrap; min-height: 28px; }
.live.is-horizontal .live__stats { white-space: nowrap; }
.live.is-horizontal .live__stream { max-height: none; height: 100%; overflow: hidden; }
.live.is-horizontal .live__entries { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); height: 100%; gap: var(--bz-space-2); }
.live.is-horizontal .live-entry { display: block; padding: var(--bz-space-3); min-width: 0; height: 100%; overflow: hidden; box-sizing: border-box; }
.live.is-horizontal .live-entry__body { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: var(--bz-space-2); height: 100%; padding: 0; }
.live.is-horizontal .live-entry__head { flex-wrap: nowrap; gap: var(--bz-space-2); margin: 0; }
.live.is-horizontal .live-entry__role, .live.is-horizontal .live-entry__action { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--bz-size-meta); }
.live.is-horizontal .live-entry__note { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 3; -webkit-box-orient: vertical; font-size: var(--bz-size-meta); line-height: 1.5; }
.live.is-horizontal .live-entry__footer { margin: 0; }
.live.is-horizontal :is(.live-entry__time, .live-entry__icon, .live-entry__duration, .live-entry__thought, .live-entry__link, .live-entry__delete) { display: none; }
.feed-detail-overlay { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: var(--bz-space-5); background: var(--bz-overlay); backdrop-filter: blur(8px); }
.feed-detail { box-sizing: border-box; width: min(980px, 100%); max-height: calc(100dvh - 48px); overflow: auto; padding: var(--bz-space-6) !important; border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-lg); background: var(--bz-panel); color: var(--bz-fg); scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; }
.feed-detail__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--bz-space-5); }
.feed-detail__eyebrow { margin: 0 0 var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.feed-detail__title { margin: 0; color: var(--bz-fg); font-size: 28px; line-height: 1.25; text-align: left; overflow-wrap: anywhere; }
.feed-detail__meta, .feed-detail__result-meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--bz-space-3); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); overflow-wrap: anywhere; }
.feed-detail__meta { margin-top: var(--bz-space-4); padding-bottom: var(--bz-space-5); border-bottom: 1px solid var(--bz-border); }
.feed-detail__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--bz-space-6); margin-top: var(--bz-space-6); }
.feed-detail__panel { min-width: 0; }
.feed-detail__panel--wide { grid-column: 1 / -1; padding-top: var(--bz-space-5); border-top: 1px solid var(--bz-border); }
.feed-detail__panel h4 { margin: 0 0 var(--bz-space-4); color: var(--bz-fg); font: 400 var(--bz-size-h3)/1.4 var(--bz-font-body); text-align: left; }
.feed-detail__panel strong { display: block; color: var(--bz-fg); font-size: var(--bz-size-body); font-weight: 500; line-height: 1.6; overflow-wrap: anywhere; }
.feed-detail__panel p { margin: var(--bz-space-2) 0 0; color: var(--bz-fg-mid); font-size: var(--bz-size-body); line-height: 1.65; text-align: left; overflow-wrap: anywhere; }
.feed-detail__panel dl { display: grid; gap: var(--bz-space-3); margin: var(--bz-space-4) 0 0; }
.feed-detail__panel dl div { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: var(--bz-space-3); }
.feed-detail__panel dt { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.feed-detail__panel dd { min-width: 0; margin: 0; color: var(--bz-fg); font-size: var(--bz-size-meta); overflow-wrap: anywhere; }
.feed-detail__output, .feed-detail__raw pre { max-height: 360px; overflow: auto; margin: var(--bz-space-4) 0 0; padding: var(--bz-space-4); border: 1px solid var(--bz-border); border-radius: var(--bz-r); background: var(--bz-canvas); color: var(--bz-fg); font: 400 13px/1.7 var(--bz-font-mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.feed-detail__raw { margin-top: var(--bz-space-4); }
.feed-detail__raw summary { cursor: pointer; color: var(--bz-fg-mid); padding: var(--bz-space-2) 0; font-size: var(--bz-size-meta); }
.live :is(select, button, summary):focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; }
@media (max-width: 820px) { .feed-detail__grid { grid-template-columns: minmax(0, 1fr); gap: var(--bz-space-5); } .feed-detail__panel--wide { grid-column: auto; } }
@media (max-width: 600px) {
  .live__head-right { gap: var(--bz-space-3); width: 100%; justify-content: space-between; }
  .live__filters { padding-block: var(--bz-space-4); gap: var(--bz-space-1); }
  .live__chip { padding-inline: var(--bz-space-2); }
  .live-entry { grid-template-columns: 32px minmax(0, 1fr); grid-template-rows: 30px minmax(0, 1fr); column-gap: var(--bz-space-3); padding: var(--bz-space-4); }
  .live-entry__icon { width: 30px; height: 30px; border-radius: var(--bz-r-sm); }
  .live-entry__icon .material-symbols-outlined { font-size: 18px; }
  .live-entry__time { font-size: var(--bz-size-micro); }
  .live-entry__body { padding-right: var(--bz-space-3); }
  .live-entry__role { padding-right: var(--bz-space-2); }
  .live-entry__duration { margin-left: 0; }
  .live-entry__response { padding: var(--bz-space-3); font-size: var(--bz-size-meta); }
  .feed-detail-overlay { padding: var(--bz-space-3); }
  .feed-detail { max-height: calc(100dvh - 24px); padding: var(--bz-space-5) !important; }
  .feed-detail__panel dl div { grid-template-columns: 80px minmax(0, 1fr); }
}
@media (hover: none) { .live-entry__delete { opacity: 1; pointer-events: auto; } }
@media (prefers-reduced-motion: reduce) {
  .live-entry__cursor { animation: none; }
  .live-entry, .live__chip, .live-entry__delete, .live-entry-enter-active, .live-entry-leave-active, .live-entry-move { transition: none; }
}
.live-entry__inspect { min-height: 32px; padding: 4px 0; border: 0; background: transparent; text-align: left; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; margin-right: auto; font: 400 12px/1.5 var(--bz-font-body); color: var(--bz-fg-mid); }
.live-entry__inspect .material-symbols-outlined { font-size: 17px; }
.live-entry:hover .live-entry__inspect { color: var(--bz-accent); }
.feed-detail__actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.feed-detail__actions:empty { display: none; }
.feed-detail :is(button, summary):focus-visible { outline: 2px solid var(--bz-accent); outline-offset: 3px; }
.feed-detail .material-symbols-outlined { font-variation-settings: "FILL" 0, "wght" 350, "opsz" 24; }
</style>
