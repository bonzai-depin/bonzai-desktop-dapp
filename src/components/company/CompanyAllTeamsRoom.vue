<template>
  <section class="all-room company-screen" data-i18n-skip :aria-label="$ui('My workflows')">
    <header class="all-room__head">
      <div>
        <p class="bz-eyebrow">{{ $ui("Smart Workflows") }}</p>
        <h2 class="bz-display">{{ $ui("My workflows") }}</h2>
        <p class="all-room__intro">{{ $ui('Pick up a task, review a result, or start something new.') }}</p>
      </div>
      <button class="bz-iconbtn" :class="{ 'bz-btn--running': loading }" :title="$ui('Refresh')" :aria-label="$ui('Refresh')" :disabled="loading" @click="$emit('refresh')">
        <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
      </button>
    </header>

    <label v-if="bundles.length" class="company-search all-room__search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="workflowQuery" :placeholder="$ui('Find a workflow')" :aria-label="$ui('Find a workflow')" /></label>
    <p v-if="bundles.length && !filteredBundles.length" class="all-room__filter-empty">{{ $ui('No matching workflows.') }} <button class="bz-btn bz-btn--ghost" @click="workflowQuery=''">{{ $ui('Clear filters') }}</button></p>
    <div v-if="filteredBundles.length" class="team-portfolio">
      <article v-for="bundle in filteredBundles" :key="bundle.company.id" class="team-portfolio__card">
        <header><span class="company-status">{{ $ui(bundle.company.status==='active'?'Active':'Paused') }}</span><button class="bz-iconbtn" :aria-label="$ui('Open workflow')+' · '+teamName(bundle.company)" @click="openTeam(bundle.company.id)"><span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button></header>
        <h3>{{ teamName(bundle.company) }}</h3><p>{{ workflowSummary(bundle.company) }}</p>
        <div class="team-portfolio__counts"><button @click="openTeam(bundle.company.id,bundle.company.workspace?.executionWorkflowId?'studio':'issues')"><strong class="bz-metric">{{ visibleTasks(bundle).filter(i=>!['done','cancelled'].includes(i.status)).length }}</strong><span>{{ $ui('Open tasks') }}</span></button><button @click="openTeam(bundle.company.id,'approvals')"><strong class="bz-metric">{{ bundle.company.workspace?.executionWorkflowId ? workflowReviewTasks(bundle,bundle.company).length + workflowReviewApprovals(bundle,bundle.company).length : reviewCount(bundle) }}</strong><span>{{ $ui('Awaiting review') }}</span></button><button @click="openTeam(bundle.company.id,'deliverables')"><strong class="bz-metric">{{ visibleResults(bundle).length }}</strong><span>{{ $ui('Results') }}</span></button></div>
      </article>
    </div>
    <button type="button" class="bz-btn bz-btn--ghost all-room__discover" @click="$emit('browse')"><span class="material-symbols-outlined" aria-hidden="true">explore</span>{{ $ui('Explore workflows') }}</button>
    <details v-if="operationalBundles.length > 1" class="all-room__exchanges">
      <summary>{{ $ui('Shared requests') }}</summary>
      <CompanyTeamExchanges :teams="operationalBundles.map(b=>b.company)" @changed="$emit('refresh')" />
    </details>
    <details class="all-room__activity" @toggle="scrollBottom(true)"><summary>{{ $ui('Recent activity') }}</summary>
    <div ref="timeline" class="all-room__timeline" aria-live="polite" @scroll="onTimelineScroll">
      <p v-if="loading && !bundles.length" class="all-room__empty" role="status">{{ $ui('Loading…') }}</p>
      <div v-else-if="!conversation.length" class="all-room__empty">
        <span class="material-symbols-outlined" aria-hidden="true">groups</span>
        <strong>{{ $ui("No team activity yet.") }}</strong>
        <p>{{ $ui('Start a task in a workflow to see its progress here.') }}</p>
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
            <span v-if="item.role">{{ $ui(formatRoleTitle(item.role)) }}</span>
            <time v-if="toMs(item.ts) > 0">{{ relativeTime(item.ts) }}</time>
          </div>
          <p>{{ visibleText(item.text) }}</p>
          <div v-if="item.progress" class="all-message__progress">
            <span :style="{ width: item.progress.pct + '%' }"></span>
          </div>
          <div v-if="item.work?.length" class="all-message__work">
            <button v-for="task in item.work" :key="task.id" type="button" @click="openTeam(item.team.id, taskDestination(item.team,task), task.id)">
              <span class="material-symbols-outlined" aria-hidden="true">{{ taskIcon(task.status) }}</span>
              <span>{{ task.title }}</span>
              <small>{{ $ui(formatRoleTitle(task.assigneeRole)) }}</small>
            </button>
          </div>
          <button v-if="item.view" type="button" class="all-message__link" @click="openTeam(item.team.id, item.view)">
            {{ $ui(item.view === 'deliverables' ? 'View results' : item.view === 'approvals' ? 'Review' : 'Open task') }}
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      </article>
    </div>

    <button
      v-if="!isNearBottom"
      class="all-room__scroll-bottom"
      type="button"
      :title="$ui('Scroll to latest message')"
      :aria-label="$ui('Scroll to latest message')"
      @click="scrollBottom(true)"
    >
      <span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
    </button>

    <div v-if="operationalBundles.length" class="all-room__scope" :aria-label="$ui('Brief recipients')">
      <button :class="{ 'is-active': !selectedTeamId }" @click="selectedTeamId = ''">{{ $ui('Every active operational team') }}</button>
      <button v-for="bundle in operationalBundles" :key="bundle.company.id" :class="{ 'is-active': selectedTeamId === bundle.company.id }" @click="selectedTeamId = bundle.company.id">
        {{ teamName(bundle.company) }}
      </button>
    </div>

    <form v-if="operationalBundles.length" class="all-composer" @submit.prevent="submit">
      <p v-if="submitError" class="all-composer__error" role="alert">{{ submitError }}</p>
      <textarea v-model="draft" rows="2" :disabled="busy" :placeholder="$ui('Describe the outcome, context and boundaries...')" :aria-label="$ui('Brief teams')" @keydown.meta.enter.prevent="submit" @keydown.ctrl.enter.prevent="submit"></textarea>
      <div class="all-composer__footer">
        <span>{{ recipientLabel }}</span>
        <button class="bz-btn bz-btn--primary all-composer__send" :disabled="busy || !draft.trim() || !briefTargets.length">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
          {{ $ui(busy ? 'Briefing...' : 'Brief teams') }}
        </button>
      </div>
    </form>
    </details>
  </section>
</template>

<script setup>
import "./company-design.css";
import { actionDisplayName } from "../../services/company/actionLabels.js";
import { operationText } from "../../i18n/operations.js";
import { visibleText } from "../../shared/visibleText.js";
import {reviewCount} from '../../services/company/workspaceNavigation.js';
import { workflowReviewTasks, workflowReviewApprovals } from '../../services/company/workflowReview.js';
import { isAutonomousWorkflowTask } from '../../shared/companyAutomation.js';
import { workflowTeamPresets } from '../../services/company/workflowTeams.js';
import { templatePresentation } from '../../services/company/templateCatalog.js';
import { i18n } from '../../i18n/index.js';
import CompanyTeamExchanges from "./CompanyTeamExchanges.vue";
import { smartAgentCatalog } from "../../services/smartAgentCatalog.js";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import companyStore from "../../stores/companyStore.js";
import { DEFAULT_COMPANIONS } from "../../skills/flagship.js";
import { companionAvatar, formatRoleTitle } from "../../services/company/presentation.js";

const props = defineProps({
  bundles: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(["refresh", "open-team", "browse"]);
const operationalBundles = computed(() => props.bundles.filter(bundle=>!bundle.company.workspace?.executionWorkflowId));
const workflowQuery=ref('');
const filteredBundles=computed(()=>props.bundles.filter(bundle=>`${teamName(bundle.company)} ${workflowSummary(bundle.company)}`.toLocaleLowerCase().includes(workflowQuery.value.trim().toLocaleLowerCase())));
function belongsTo(bundle, record) { return !record.companyId || record.companyId === bundle.company.id; }
function visibleTasks(bundle) { return (bundle.issues || []).filter(issue => belongsTo(bundle, issue) && !isAutonomousWorkflowTask(bundle.company, issue, (bundle.goals || []).find(goal => goal.id === issue.goalId))); }
function visibleResults(bundle) { return (bundle.catalog || []).filter(result => belongsTo(bundle, result)); }
function taskDestination(company, task) {
  if (task.status === 'done') return 'deliverables';
  if (!company.workspace?.executionWorkflowId) return 'issues';
  return workflowReviewTasks({ issues: [task] }, company).length ? 'approvals' : 'studio';
}
function workflowSummary(company){
  const workflowId=company.workspace?.executionWorkflowId;
  const source=workflowId ? workflowTeamPresets([{id:workflowId,name:company.businessContext?.businessType||teamName(company)}])[0] : {id:company.template?.id,title:teamName(company)};
  const presentation=templatePresentation(source || {id:workflowId,title:teamName(company)},i18n.state.locale);
  return presentation.catalogDescription || presentation.catalogOutcome || company.businessContext?.businessType || '';
}

const draft = ref("");
const busy = ref(false);
const submitError = ref("");
const selectedTeamId = ref("");
const timeline = ref(null);
const isNearBottom = ref(true);
const companionNames = Object.fromEntries(DEFAULT_COMPANIONS.map((companion) => [companion.id, companion.name]));
const briefTargets = computed(() => operationalBundles.value.filter(bundle => selectedTeamId.value
  ? bundle.company.id === selectedTeamId.value : bundle.company.status === 'active'));
watch(operationalBundles, bundles => { if (selectedTeamId.value && !bundles.some(bundle => bundle.company.id === selectedTeamId.value)) selectedTeamId.value = ''; });
const recipientLabel = computed(() => selectedTeamId.value
  ? teamName(briefTargets.value[0]?.company)
  : `${briefTargets.value.length} · ${operationText('Active operational teams', i18n.state.locale)}`);

const conversation = computed(() => props.bundles.flatMap((bundle) => {
  const roles = bundle.company.roles || {};
  const tasks = visibleTasks(bundle);
  const goals = (bundle.goals || []).filter(goal => belongsTo(bundle, goal) && (!bundle.company.workspace?.executionWorkflowId || goal.createdBy !== 'ceo')).map((goal) => ({
    id: `${bundle.company.id}:goal:${goal.id}`,
    kind: "owner",
    icon: "person",
    author: operationText("You", i18n.state.locale),
    team: bundle.company,
    text: goal.title,
    ts: goal.createdAt,
    work: tasks.filter((issue) => issue.goalId === goal.id),
    progress: goalProgress(goal, tasks),
    view: bundle.company.workspace?.executionWorkflowId ? "studio" : "issues",
  }));
  const events = (bundle.audit || []).filter(event => belongsTo(bundle, event) && (!event.issueId || tasks.some(task => task.id === event.issueId) || !(bundle.issues || []).some(task => task.id === event.issueId))).filter((event) => event.action !== "team.message" && event.action !== "createGoal" && (event.note || event.action)).slice(0, 35).map((event) => {
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
          : event.issueId ? (bundle.company.workspace?.executionWorkflowId ? "studio" : "issues") : null,
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
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  timeline.value.scrollTo({ top: timeline.value.scrollHeight, behavior: force && !reduceMotion ? "smooth" : "auto" });
  isNearBottom.value = true;
}
function isNewMessage(item) { return Date.now() - toMs(item.ts) < 2200; }
function openTeam(id, view = "", resultId = "") { emit("open-team", id, view, resultId); }

async function submit() {
  const text = draft.value.trim();
  if (!text || busy.value) return;
  const targets = [...briefTargets.value];
  if (!targets.length) return;
  busy.value = true;
  submitError.value = "";
  try {
    await Promise.all(targets.map(async (bundle) => {
      const goal = await companyStore.createGoalForCompany(bundle.company.id, { title: text, rationale: text, tasks: [] });
      const roles = [...new Set((goal?.createdIssues || []).map((issue) => issue.assigneeRole).filter(Boolean))];
      if (bundle.company.status === "active") {
        for (const role of roles) await companyStore.tickRoleForCompany(bundle.company.id, role);
      }
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
  return value || smartAgentCatalog.agents.find((agent) => agent.id === assignment.companion)?.name || companionNames[assignment.companion] || formatRoleTitle(role);
}
function teamName(team) { return (team?.name || "Team").replace(/\s+\(Draft\)$/i, ""); }
function feedbackText(event) {
  const raw = visibleText(event.llm?.response);
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
  return event.note || actionDisplayName(event.action, i18n.state.locale);
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
  const time = toMs(ts);
  if (!time) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  const unit = seconds < 60 ? 'second' : seconds < 3600 ? 'minute' : seconds < 86400 ? 'hour' : 'day';
  const amount = seconds < 60 ? 0 : Math.floor(seconds / ({ minute: 60, hour: 3600, day: 86400 }[unit]));
  return new Intl.RelativeTimeFormat(i18n.state.locale, { numeric: 'auto', style: 'short' }).format(-amount, unit);
}
function toMs(value) {
  if (typeof value === "number") return value;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}
</script>

<style scoped>
.all-room { position: relative; min-width: 0; display: flex; flex-direction: column; background: var(--bz-canvas); }
.all-room__intro{margin-top:12px!important;color:var(--bz-fg-mid);line-height:1.6}
.all-room__search{margin:20px var(--bz-space-6) 0;max-width:560px}.all-room__filter-empty{padding:24px var(--bz-space-6);color:var(--bz-fg-mid)}
.all-room__discover{align-self:flex-start;margin:0 var(--bz-space-6) var(--bz-space-6)}
.all-room__activity{position:relative;border-top:1px solid var(--bz-border)}.all-room__activity>summary{cursor:pointer;padding:20px var(--bz-space-6);color:var(--bz-fg-mid)}
.all-room__exchanges { margin: 0 var(--bz-space-6); border-block: 1px solid var(--bz-border); }
.all-room__exchanges > summary { padding: var(--bz-space-4) 0; color: var(--bz-fg-mid); cursor: pointer; }
.all-room__exchanges > .team-exchanges { padding: var(--bz-space-4) 0 var(--bz-space-6); }
.team-portfolio { padding: var(--bz-space-6); }
.all-room__head { display: flex; justify-content: space-between; gap: var(--bz-space-4); padding: var(--bz-space-5) var(--bz-space-6); border-bottom: 1px solid var(--bz-border); }
.all-room__head p, .all-room__head h2 { margin: 0; }
.all-room__head h2 { margin-top: var(--bz-space-2); font: italic 900 var(--bz-size-h1)/1.3 var(--bz-font-metric); }
.all-room__timeline { height: clamp(320px, 50vh, 640px); flex-shrink: 0; overflow-y: auto; padding: var(--bz-space-6); scroll-behavior: smooth; overscroll-behavior-y: contain; scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; }
.all-room__empty { max-width: 520px; margin: 8vh auto; display: grid; justify-items: center; gap: var(--bz-space-2); text-align: center; color: var(--bz-fg-mid); }
.all-room__empty > span { font-size: 30px; color: var(--bz-purple-300); }
.all-room__empty strong { color: var(--bz-fg); font-size: 18px; font-weight: 500; }
.all-room__empty p { margin: 0; line-height: 1.55; }
.all-message { max-width: 800px; display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: var(--bz-space-3); margin: 0 auto var(--bz-space-5); }
.all-message.is-owner { grid-template-columns: minmax(0, 1fr) 38px; }
.all-message.is-owner .all-message__avatar { grid-column: 2; }
.all-message.is-owner .all-message__content { grid-column: 1; grid-row: 1; background: var(--bz-purple-soft); border-color: var(--bz-border-brand); }
.all-message__avatar { width: 38px; height: 38px; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--bz-border); border-radius: 50%; background: var(--bz-raised); color: var(--bz-accent); }
.all-message__avatar img { width: 100%; height: 100%; object-fit: cover; }
.all-message__avatar span { font-size: 18px; }
.all-message__content { min-width: 0; padding: var(--bz-space-4) var(--bz-space-5); border: 1px solid var(--bz-border); border-radius: 18px 18px 18px 6px; background: var(--bz-card); }
.all-message.is-owner .all-message__content { border-radius: 18px 18px 6px 18px; }
.all-message.is-new:not(.is-owner) { animation: all-message-from-left 280ms var(--bz-ease-out) both; }
.all-message.is-new.is-owner { animation: all-message-from-right 280ms var(--bz-ease-out) both; }
@keyframes all-message-from-left { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
@keyframes all-message-from-right { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
.all-message__meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.all-message__meta strong { color: var(--bz-fg); font-size: var(--bz-size-body); font-weight: 500; }
.all-message__content p { margin: var(--bz-space-3) 0 0; color: var(--bz-fg); font-size: var(--bz-size-body); line-height: 1.75; overflow-wrap: anywhere; white-space: pre-wrap; }
.team-tag { padding: 2px 7px; border: 1px solid var(--bz-border-brand); border-radius: var(--bz-r-pill); background: var(--bz-purple-soft); color: var(--bz-accent); font: inherit; cursor: pointer; }
.all-message__progress { height: 2px; margin-top: var(--bz-space-3); overflow: hidden; background: var(--bz-raised); }
.all-message__progress span { display: block; height: 100%; background: var(--bz-accent); transition: width var(--bz-dur-base) var(--bz-ease-out); }
.all-message__work { display: grid; margin-top: var(--bz-space-3); overflow: hidden; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); }
.all-message__work button { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: var(--bz-space-2); min-height: 36px; padding: var(--bz-space-2) var(--bz-space-3); border: 0; border-top: 1px solid var(--bz-border); background: var(--bz-panel); color: var(--bz-fg-mid); text-align: left; cursor: pointer; font: 400 var(--bz-size-body)/1.5 var(--bz-font-body); }
.all-message__work button:first-child { border-top: 0; }
.all-message__work button:hover { background: var(--bz-raised); color: var(--bz-fg); }
.all-message__work .material-symbols-outlined { color: var(--bz-accent); font-size: 17px; }
.all-message__work small { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.all-message__link { display: inline-flex; align-items: center; gap: var(--bz-space-1); margin-top: var(--bz-space-3); padding: 0; border: 0; background: transparent; color: var(--bz-accent); cursor: pointer; font: 400 var(--bz-size-meta)/1 var(--bz-font-body); }
.all-message__link .material-symbols-outlined { font-size: 16px; }
.all-room__scroll-bottom { position: absolute; right: var(--bz-space-6); bottom: 154px; z-index: 3; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--bz-border-strong); border-radius: 50%; background: var(--bz-raised); color: var(--bz-fg); box-shadow: var(--bz-elev-1); cursor: pointer; }
.all-room__scope { display: flex; gap: var(--bz-space-2); padding: 0 var(--bz-space-6) var(--bz-space-3); overflow-x: auto; }
.all-room__scope button { flex: 0 0 auto; min-height: 30px; padding: 0 var(--bz-space-3); border: 1px solid var(--bz-border); border-radius: var(--bz-r-pill); background: transparent; color: var(--bz-fg-mid); cursor: pointer; }
.all-room__scope button.is-active { border-color: var(--bz-border-brand); background: var(--bz-purple-soft); color: var(--bz-fg); }
.all-composer { margin: 0 var(--bz-space-6) var(--bz-space-5); overflow: hidden; border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-lg); background: var(--bz-card); }
.all-composer:focus-within { border-color: var(--bz-accent); }
.all-composer textarea { box-sizing: border-box; width: 100%; min-height: 96px; max-height: 220px; resize: vertical; padding: var(--bz-space-4); border: 0; outline: 0; background: transparent; color: var(--bz-fg); font: 400 15px/1.65 var(--bz-font-body); }
.all-composer__error { margin: 0; padding: var(--bz-space-2) var(--bz-space-4); border-bottom: 1px solid var(--bz-danger); background: var(--bz-danger-soft); color: var(--bz-fg); font-size: var(--bz-size-meta); }
.all-composer__footer { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-3); padding: var(--bz-space-2); border-top: 1px solid var(--bz-border); }
.all-composer__footer > span { padding-left: var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.all-composer__send { min-height: 36px; padding: 0 var(--bz-space-3); font-size: var(--bz-size-meta); white-space: nowrap; }

.all-room > .team-exchanges { padding-inline: var(--bz-space-6); min-height: 0; overflow-y: auto; }
.all-room :is(button, textarea) { transition: background var(--bz-dur-fast), border-color var(--bz-dur-fast), color var(--bz-dur-fast); }
.all-room :is(button, textarea):focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; }
.all-message__meta { overflow-wrap: anywhere; line-height: 1.5; }
.all-message__work button { overflow-wrap: anywhere; }
.all-composer textarea::placeholder { color: var(--bz-fg-low); }
@media (max-width: 600px) {
  .all-room__head, .all-room__timeline { padding: var(--bz-space-4); }
  .team-portfolio { padding: var(--bz-space-4); }
  .all-room__search { margin-inline: var(--bz-space-4); }
  .all-room__discover { margin-inline: var(--bz-space-4); }
  .all-room__exchanges { margin-inline: var(--bz-space-4); }
  .all-room > .team-exchanges, .all-room__scope { padding-inline: var(--bz-space-4); }
  .all-room__head h2 { font-size: var(--bz-size-h2); }
  .all-composer { margin: 0 var(--bz-space-4) var(--bz-space-4); }
  .all-composer__footer { flex-wrap: wrap; }
  .all-composer__send { margin-left: auto; }
  .all-message { grid-template-columns: 28px minmax(0, 1fr); gap: var(--bz-space-2); }
  .all-message.is-owner { grid-template-columns: minmax(0, 1fr) 28px; }
  .all-message__avatar { width: 28px; height: 28px; }
  .all-message__content { padding: var(--bz-space-3); }
  .all-message__work button { grid-template-columns: 18px minmax(0, 1fr); }
  .all-message__work small { grid-column: 2; }
}
@media (prefers-reduced-motion: reduce) {
  .all-message.is-new { animation: none; }
  .all-room :is(button, textarea), .all-message__progress span { transition: none; }
  .all-room__timeline { scroll-behavior: auto; }
}
</style>
