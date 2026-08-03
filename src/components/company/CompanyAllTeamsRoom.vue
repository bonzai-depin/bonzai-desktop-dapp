<template>
  <section class="all-room" aria-label="All teams conversation">
    <header class="all-room__head">
      <div>
        <p class="bz-eyebrow">All teams</p>
        <h2 class="bz-display">Brief the whole company.</h2>
      </div>
      <button class="bz-iconbtn" :class="{ 'bz-btn--running': loading }" title="Refresh conversation" @click="$emit('refresh')">
        <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
      </button>
    </header>

    <div ref="timeline" class="all-room__timeline" aria-live="polite" @scroll="onTimelineScroll">
      <div v-if="!conversation.length" class="all-room__empty">
        <span class="material-symbols-outlined" aria-hidden="true">groups</span>
        <strong>Every workflow team is listening.</strong>
        <p>Send one outcome to all active teams, or target a specific team before you brief them.</p>
      </div>

      <article v-for="item in conversation" :key="item.id" class="all-message" :class="[`is-${item.kind}`, { 'is-new': isNewMessage(item) }]">
        <div class="all-message__avatar" :class="{ 'has-image': item.avatar }">
          <img v-if="item.avatar" :src="item.avatar" :alt="item.author" />
          <span v-else class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>
        </div>
        <div class="all-message__content">
          <div class="all-message__meta">
            <strong>{{ item.author }}</strong>
            <button class="team-tag" @click="openTeam(item.team.id)">{{ teamName(item.team) }}</button>
            <span v-if="item.role">{{ item.role }}</span>
            <time>{{ relativeTime(item.ts) }}</time>
          </div>
          <p>{{ item.text }}</p>
          <div v-if="item.progress" class="all-message__progress">
            <span :style="{ width: item.progress.pct + '%' }"></span>
          </div>
          <div v-if="item.work?.length" class="all-message__work">
            <button v-for="task in item.work" :key="task.id" type="button" @click="openTeam(item.team.id, task.status === 'done' ? 'deliverables' : 'issues', task.id)">
              <span class="material-symbols-outlined" aria-hidden="true">{{ taskIcon(task.status) }}</span>
              <span>{{ task.title }}</span>
              <small>{{ formatRoleTitle(task.assigneeRole) }}</small>
            </button>
          </div>
          <button v-if="item.view" type="button" class="all-message__link" @click="openTeam(item.team.id, item.view)">
            {{ item.view === 'deliverables' ? 'Open result' : item.view === 'approvals' ? 'Review decision' : 'Open work' }}
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      </article>
    </div>

    <button
      v-if="!isNearBottom"
      class="all-room__scroll-bottom"
      type="button"
      title="Scroll to latest message"
      aria-label="Scroll to latest message"
      @click="scrollBottom(true)"
    >
      <span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
    </button>

    <div class="all-room__scope" aria-label="Brief recipients">
      <button :class="{ 'is-active': !selectedTeamId }" @click="selectedTeamId = ''">Every active team</button>
      <button v-for="bundle in bundles" :key="bundle.company.id" :class="{ 'is-active': selectedTeamId === bundle.company.id }" @click="selectedTeamId = bundle.company.id">
        {{ teamName(bundle.company) }}
      </button>
    </div>

    <form class="all-composer" @submit.prevent="submit">
      <p v-if="submitError" class="all-composer__error" role="alert">{{ submitError }}</p>
      <textarea v-model="draft" rows="2" :disabled="busy" placeholder="Describe the outcome, context and boundaries..." aria-label="Brief teams" @keydown.meta.enter.prevent="submit" @keydown.ctrl.enter.prevent="submit"></textarea>
      <div class="all-composer__footer">
        <span>{{ recipientLabel }}</span>
        <button class="bz-btn bz-btn--primary all-composer__send" :disabled="busy || !draft.trim()">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
          {{ busy ? 'Briefing...' : 'Brief teams' }}
        </button>
      </div>
    </form>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import companyStore from "../../stores/companyStore.js";
import { DEFAULT_COMPANIONS } from "../../skills/flagship.js";
import { companionAvatar, formatRoleTitle } from "../../services/company/presentation.js";

const props = defineProps({
  bundles: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(["refresh", "open-team"]);

const draft = ref("");
const busy = ref(false);
const submitError = ref("");
const selectedTeamId = ref("");
const timeline = ref(null);
const isNearBottom = ref(true);
const companionNames = Object.fromEntries(DEFAULT_COMPANIONS.map((companion) => [companion.id, companion.name]));
const recipientLabel = computed(() => selectedTeamId.value
  ? teamName(props.bundles.find((bundle) => bundle.company.id === selectedTeamId.value)?.company)
  : `${props.bundles.filter((bundle) => bundle.company.status === "active").length} active teams`);

const conversation = computed(() => props.bundles.flatMap((bundle) => {
  const roles = bundle.company.roles || {};
  const goals = (bundle.goals || []).map((goal) => ({
    id: `${bundle.company.id}:goal:${goal.id}`,
    kind: "owner",
    icon: "person",
    author: "You",
    team: bundle.company,
    text: goal.title,
    ts: goal.createdAt,
    work: (bundle.issues || []).filter((issue) => issue.goalId === goal.id),
    progress: goalProgress(goal, bundle.issues),
    view: "issues",
  }));
  const events = (bundle.audit || []).filter((event) => event.action !== "createGoal" && (event.note || event.action)).slice(0, 35).map((event) => {
    const assignment = roles[event.role] || {};
    return {
      id: `${bundle.company.id}:event:${event.id || event.ts}`,
      kind: event.role ? "companion" : "system",
      icon: event.role ? "psychology" : "check_circle",
      author: event.role ? companionName(assignment, event.role) : "BonzAI",
      avatar: companionAvatar(assignment.companion),
      role: event.role ? formatRoleTitle(event.role) : "",
      team: bundle.company,
      text: feedbackText(event),
      ts: event.ts || event.createdAt,
      view: event.kind === "production" || event.action === "publishContent"
        ? "deliverables"
        : event.status === "proposed" || event.status === "queued"
          ? "approvals"
          : event.issueId ? "issues" : null,
    };
  });
  return [...goals, ...events];
}).sort((a, b) => toMs(a.ts) - toMs(b.ts)).slice(-100));

watch(() => conversation.value.length, () => scrollBottom(false));
onMounted(() => scrollBottom(true));

function onTimelineScroll() {
  const el = timeline.value;
  if (!el) return;
  isNearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 96;
}
async function scrollBottom(force = false) {
  if (!force && !isNearBottom.value) return;
  await nextTick();
  if (!timeline.value) return;
  timeline.value.scrollTo({ top: timeline.value.scrollHeight, behavior: force ? "smooth" : "auto" });
  isNearBottom.value = true;
}
function isNewMessage(item) { return Date.now() - toMs(item.ts) < 2200; }
function openTeam(id, view = "command", resultId = "") { emit("open-team", id, view, resultId); }

async function submit() {
  const text = draft.value.trim();
  if (!text || busy.value) return;
  const targets = props.bundles.filter((bundle) => selectedTeamId.value
    ? bundle.company.id === selectedTeamId.value
    : bundle.company.status === "active");
  if (!targets.length) return;
  busy.value = true;
  submitError.value = "";
  try {
    await Promise.all(targets.map(async (bundle) => {
      const goal = await companyStore.createGoalForCompany(bundle.company.id, { title: text, rationale: text, tasks: [] });
      const roles = [...new Set((goal?.createdIssues || []).map((issue) => issue.assigneeRole).filter(Boolean))];
      for (const role of roles) await companyStore.tickRoleForCompany(bundle.company.id, role);
    }));
    draft.value = "";
    await companyStore.refreshList();
    emit("refresh");
  } catch (error) {
    submitError.value = error?.message || "BonzAI could not brief the selected teams. Open the team to check its models and settings.";
  } finally {
    busy.value = false;
  }
}

function companionName(assignment, role) {
  const value = assignment.companionName || assignment.companion?.name || assignment.name;
  return value || companionNames[assignment.companion] || formatRoleTitle(role);
}
function teamName(team) { return (team?.name || "Team").replace(/\s+\(Draft\)$/i, ""); }
function humanize(value) { return String(value || "Update").replace(/([a-z0-9])([A-Z])/g, "$1 $2"); }
function feedbackText(event) {
  const raw = event.llm?.response;
  if (raw) {
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const plan = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
      if (Array.isArray(plan.goals) && plan.goals.length) return `Planned and assigned: ${plan.goals.map((goal) => goal.title).filter(Boolean).slice(0, 2).join("; ")}.`;
      if (Array.isArray(plan.actions) && plan.actions.length) {
        const details = plan.actions.map((entry) => entry.summary || entry.title || entry.description || entry.prompt || entry.type).filter(Boolean).slice(0, 2);
        if (details.length) return concise(details.join(". "));
      }
    } catch {}
  }
  return event.note || humanize(event.action);
}
function concise(value, max = 360) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
function taskIcon(status) {
  return ({ done: "check_circle", blocked: "error", in_progress: "progress_activity", cancelled: "block" })[status] || "radio_button_unchecked";
}
function goalProgress(goal, issues = []) {
  const linked = issues.filter((issue) => issue.goalId === goal.id);
  if (!linked.length) return null;
  const done = linked.filter((issue) => issue.status === "done").length;
  return { pct: Math.round((done / linked.length) * 100) };
}
function relativeTime(ts) {
  const seconds = Math.max(0, Math.floor((Date.now() - toMs(ts)) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
function toMs(value) {
  if (typeof value === "number") return value;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}
</script>

<style scoped>
.all-room { position: relative; min-height: 600px; height: calc(100vh - 132px); display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; overflow: hidden; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-canvas); }
.all-room__head { display: flex; justify-content: space-between; gap: var(--bz-space-4); padding: var(--bz-space-5) var(--bz-space-6); border-bottom: 1px solid var(--bz-border); }
.all-room__head p, .all-room__head h2 { margin: 0; }
.all-room__head h2 { margin-top: var(--bz-space-1); font-size: 30px; }
.all-room__timeline { min-height: 0; overflow-y: auto; padding: var(--bz-space-6); scroll-behavior: smooth; }
.all-room__empty { max-width: 520px; margin: 12vh auto 0; display: grid; justify-items: center; gap: var(--bz-space-2); text-align: center; color: var(--bz-fg-mid); }
.all-room__empty > span { font-size: 30px; color: var(--bz-purple-300); }
.all-room__empty strong { color: var(--bz-fg); font-size: 18px; font-weight: 500; }
.all-room__empty p { margin: 0; line-height: 1.55; }
.all-message { max-width: 800px; display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: var(--bz-space-3); margin: 0 auto var(--bz-space-5); }
.all-message.is-owner { grid-template-columns: minmax(0, 1fr) 34px; }
.all-message.is-owner .all-message__avatar { grid-column: 2; }
.all-message.is-owner .all-message__content { grid-column: 1; grid-row: 1; background: var(--bz-purple-soft); border-color: var(--bz-border-brand); }
.all-message__avatar { width: 34px; height: 34px; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--bz-border); border-radius: 50%; background: var(--bz-raised); color: var(--bz-purple-100); }
.all-message__avatar img { width: 100%; height: 100%; object-fit: cover; }
.all-message__avatar span { font-size: 18px; }
.all-message__content { padding: var(--bz-space-3) var(--bz-space-4); border: 1px solid var(--bz-border); border-radius: 18px 18px 18px 6px; background: var(--bz-card); box-shadow: var(--bz-elev-1); }
.all-message.is-owner .all-message__content { border-radius: 18px 18px 6px 18px; }
.all-message.is-new:not(.is-owner) { animation: all-message-from-left 280ms var(--bz-ease-out) both; }
.all-message.is-new.is-owner { animation: all-message-from-right 280ms var(--bz-ease-out) both; }
@keyframes all-message-from-left { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: translateX(0); } }
@keyframes all-message-from-right { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
.all-message__meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--bz-space-2); color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.all-message__meta strong { color: var(--bz-fg); font-size: var(--bz-size-meta); font-weight: 500; }
.all-message__content p { margin: var(--bz-space-2) 0 0; color: var(--bz-fg-mid); line-height: 1.55; white-space: pre-wrap; }
.team-tag { padding: 2px 7px; border: 1px solid var(--bz-border-brand); border-radius: var(--bz-r-pill); background: var(--bz-purple-soft); color: var(--bz-purple-100); font: inherit; cursor: pointer; }
.all-message__progress { height: 2px; margin-top: var(--bz-space-3); overflow: hidden; background: var(--bz-raised); }
.all-message__progress span { display: block; height: 100%; background: var(--bz-gradient-brand); }
.all-message__work { display: grid; margin-top: var(--bz-space-3); overflow: hidden; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); }
.all-message__work button { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: var(--bz-space-2); min-height: 36px; padding: var(--bz-space-2) var(--bz-space-3); border: 0; border-top: 1px solid var(--bz-border); background: var(--bz-panel); color: var(--bz-fg-mid); text-align: left; cursor: pointer; font: 400 var(--bz-size-meta)/1.3 var(--bz-font-body); }
.all-message__work button:first-child { border-top: 0; }
.all-message__work button:hover { background: var(--bz-raised); color: var(--bz-fg); }
.all-message__work .material-symbols-outlined { color: var(--bz-purple-100); font-size: 17px; }
.all-message__work small { color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.all-message__link { display: inline-flex; align-items: center; gap: var(--bz-space-1); margin-top: var(--bz-space-3); padding: 0; border: 0; background: transparent; color: var(--bz-purple-100); cursor: pointer; font: 400 var(--bz-size-meta)/1 var(--bz-font-body); }
.all-message__link .material-symbols-outlined { font-size: 16px; }
.all-room__scroll-bottom { position: absolute; right: var(--bz-space-6); bottom: 154px; z-index: 3; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--bz-border-strong); border-radius: 50%; background: var(--bz-raised); color: var(--bz-fg); box-shadow: var(--bz-shadow-lg); cursor: pointer; }
.all-room__scope { display: flex; gap: var(--bz-space-2); padding: 0 var(--bz-space-6) var(--bz-space-3); overflow-x: auto; }
.all-room__scope button { flex: 0 0 auto; min-height: 30px; padding: 0 var(--bz-space-3); border: 1px solid var(--bz-border); border-radius: var(--bz-r-pill); background: transparent; color: var(--bz-fg-mid); cursor: pointer; }
.all-room__scope button.is-active { border-color: var(--bz-border-brand); background: var(--bz-purple-soft); color: var(--bz-fg); }
.all-composer { margin: 0 var(--bz-space-6) var(--bz-space-5); overflow: hidden; border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-sm); background: var(--bz-card); }
.all-composer:focus-within { border-color: var(--bz-border-brand); box-shadow: var(--bz-elev-brand); }
.all-composer textarea { box-sizing: border-box; width: 100%; min-height: 72px; resize: none; padding: var(--bz-space-4); border: 0; outline: 0; background: transparent; color: var(--bz-fg); font: 400 15px/1.5 var(--bz-font-body); }
.all-composer__error { margin: 0; padding: var(--bz-space-2) var(--bz-space-4); border-bottom: 1px solid var(--bz-danger); background: var(--bz-danger-soft); color: var(--bz-fg); font-size: var(--bz-size-meta); }
.all-composer__footer { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-3); padding: var(--bz-space-2); border-top: 1px solid var(--bz-border); }
.all-composer__footer > span { padding-left: var(--bz-space-2); color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.all-composer__send { min-height: 36px; padding: 0 var(--bz-space-3); font-size: var(--bz-size-meta); white-space: nowrap; }
</style>
