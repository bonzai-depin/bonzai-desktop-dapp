<template>
  <div class="goal-room company-screen">
    <section class="goal-room__conversation" aria-label="Goal room conversation">
      <header class="goal-room__head">
        <span class="goal-room__working">
          <span class="status-dot" :class="charter.status === 'active' ? 'status-active' : 'status-paused'"></span>
          {{ workingLabel }}
        </span>
        <button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="teamComposer.start()">{{ $ui('Request another team') }}</button>
      </header>
      <CompanyTeamExchanges ref="teamComposer" compose-only :company-id="charter.id" :teams="state.companies || []" @changed="loadTeamMessages" />
      <p v-if="teamError" class="goal-composer__error" role="alert">{{ teamError }} <button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="loadTeamMessages">{{ $ui('Retry') }}</button></p>

      <DownloadRequirement category="language"
        v-if="missingModels.length"
        :items="missingModels.map(model => ({ name: modelSpec(model.key)?.filename || model.label }))"
        :active="missingModelsDownloading"
        cancellable
        :cancelling="isCancellingDownloads"
        @cancel="cancelActiveDownloads"
        :tasks="missingModels.map(model => ({ filename: modelSpec(model.key)?.filename || model.label, status: modelDownloading[model.key] != null ? 'downloading' : 'pending', progress: modelDownloading[model.key] || 0 }))"
        :progress="downloadProgress"
        :error="downloadError"
        @download="downloadMissingModels"
      />

      <div ref="timeline" class="goal-room__timeline" aria-live="polite" @scroll="onTimelineScroll">
        <button v-if="allConversation.length > messageLimit" class="bz-btn bz-btn--ghost bz-btn--sm" @click="messageLimit += 50">{{ $ui('Earlier messages') }}</button>
        <div v-if="!conversation.length && !ownerQuestions.length" class="goal-room__welcome">
          <span class="material-symbols-outlined" aria-hidden="true">forum</span>
          <div>
            <strong>{{ $ui("Chat with your team") }}</strong>
            <p>{{ $ui("Describe the work, relevant context and expected result.") }}</p>
          </div>
        </div>

        <section v-if="maintenanceCards.length" class="maintenance-brief" aria-label="Maintenance operating brief">
          <header>
            <div>
              <span class="material-symbols-outlined" aria-hidden="true">hvac</span>
              <div><strong>HVAC operating brief</strong><small>Live from your local maintenance records</small></div>
            </div>
            <button type="button" @click="$emit('open-maintenance', 'dispatch')">View operations</button>
          </header>
          <div class="maintenance-brief__grid">
            <button
              v-for="card in maintenanceCards"
              :key="card.id"
              type="button"
              class="maintenance-card"
              :class="`is-${card.tone}`"
              @click="$emit('open-maintenance', card.channel)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">{{ card.icon }}</span>
              <span class="maintenance-card__copy">
                <small>{{ card.eyebrow }}</small>
                <strong>{{ card.title }}</strong>
                <span>{{ card.detail }}</span>
              </span>
              <span class="maintenance-card__action">{{ card.action }} <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></span>
            </button>
          </div>
        </section>

        <CompanyQuestion v-for="issue in ownerQuestions" :key="issue.id" :issue="issue" :company-id="charter.id" :team-name="charter.name" @answered="companyStore.refreshActive()" />

        <article v-for="item in conversation" :key="item.id" class="goal-message" :class="[`is-${item.kind}`, { 'is-new': isNewMessage(item), 'is-error': item.isError }]">
          <div class="goal-message__avatar" :class="[`is-${item.kind}`, { 'has-image': item.avatar }]">
            <img v-if="item.avatar" :src="item.avatar" :alt="item.author" />
            <span v-else class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>
          </div>
          <div class="goal-message__body">
            <div class="goal-message__meta">
              <strong data-i18n-skip>{{ item.author }}</strong><span class="goal-message__status" data-i18n-skip>{{ item.teamName || charter.name }}</span><span v-if="item.role" data-i18n-skip>{{ $ui(formatRoleTitle(item.role)) }}</span>
              <time>{{ relativeTime(item.ts) }}</time>
              <span v-if="item.status" class="goal-message__status">{{ item.status }}</span>
              <span v-if="item.model" class="goal-message__model bz-mono">{{ item.model }}</span>
            </div>
            <small v-if="item.subject" class="goal-message__subject" data-i18n-skip>{{ visibleText(item.subject) }}</small>
            <p data-i18n-skip>{{ visibleText(item.text) }}</p>
            <button v-if="item.threadId && !item.archived" type="button" class="goal-message__link" @click="replyThreadId = item.threadId">{{ $ui('Reply') }}<span class="material-symbols-outlined" aria-hidden="true">reply</span></button>
            <small v-if="item.archived">{{ $ui('Archived conversation') }}</small>
            <div v-if="item.work?.length" class="goal-message__work">
              <div class="goal-message__progress">
                <span>{{ completedCount(item.work) }}/{{ item.work.length }} completed</span>
                <span class="goal-message__progress-track" aria-hidden="true"><i :style="{ width: `${completionPercent(item.work)}%` }"></i></span>
              </div>
              <div v-for="task in visibleWork(item)" :key="task.id" class="goal-message__workflow"><button type="button" class="goal-message__task" @click="openTask(task)">
                <span class="material-symbols-outlined" aria-hidden="true">{{ taskIcon(task.status) }}</span>
                <span>{{ task.title }}</span>
                <small>{{ roleName(task.assigneeRole) }}</small>
              </button>
              <CompanyWorkflowProgress :stages="taskProgress(task)" :issue="task" compact /></div>
              <button v-if="item.work.length > 4" type="button" class="goal-message__work-toggle" @click="toggleWork(item.id)">
                {{ expandedWork.has(item.id) ? 'Show less' : `Show all ${item.work.length} work items` }}
                <span class="material-symbols-outlined" aria-hidden="true">{{ expandedWork.has(item.id) ? 'expand_less' : 'expand_more' }}</span>
              </button>
            </div>
            <button v-if="item.view" class="goal-message__link" @click="$emit('open-view', item.view)">
              {{ viewLabel(item.view) }}
              <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </button>
          </div>
        </article>

        <article v-for="stream in streams" :key="stream.streamId" class="goal-message is-companion is-streaming">
          <div class="goal-message__avatar is-companion" :class="{ 'has-image': roleAvatar(stream.role) }">
            <img v-if="roleAvatar(stream.role)" :src="roleAvatar(stream.role)" :alt="roleName(stream.role)" />
            <span v-else class="material-symbols-outlined">psychology</span>
          </div>
          <div class="goal-message__body">
            <div class="goal-message__meta"><strong data-i18n-skip>{{ memberName(stream.role) }}</strong><span>{{ roleName(stream.role) }}</span><span data-i18n-skip>{{ charter.name }}</span><span>working now</span></div>
            <p>{{ streamActivity(stream) }}</p>
            <span class="goal-message__pulse" aria-hidden="true"></span>
          </div>
        </article>
      </div>

      <button
        v-if="!isNearBottom"
        class="goal-room__scroll-bottom"
        type="button"
        title="Scroll to latest message"
        aria-label="Scroll to latest message"
        @click="scrollToBottom(true)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
      </button>

      <div v-if="!conversation.length && !ownerQuestions.length" class="goal-room__suggestions" aria-label="Suggested goals">
        <button v-for="suggestion in suggestions" :key="suggestion" type="button" @click="draft = suggestion">{{ suggestion }}</button>
      </div>

      <form class="goal-composer" @submit.prevent="submit">
        <div v-if="replyThread" class="goal-composer__reply"><span data-i18n-skip>{{ replyThread.subject }} · {{ replyThread.source_team_name }} → {{ replyThread.target_team_name }}</span><button type="button" class="bz-iconbtn bz-iconbtn--sm" :aria-label="$ui('Cancel reply')" @click="replyThreadId = ''"><span class="material-symbols-outlined">close</span></button></div>
        <p v-if="submitError" class="goal-composer__error" role="alert">{{ submitError }}</p>
        <textarea
          v-model="draft"
          rows="2"
          :disabled="busy || (!replyThread && missingModels.length > 0)"
          placeholder="Describe the outcome you want, the context that matters, and any boundaries…"
          aria-label="Describe a business goal"
          @keydown.meta.enter.prevent="submit"
          @keydown.ctrl.enter.prevent="submit"
        ></textarea>
        <div class="goal-composer__footer">
          <span><span class="material-symbols-outlined" aria-hidden="true">shield_lock</span> Private company context stays on this device</span>
          <button class="bz-btn bz-btn--primary goal-composer__send" :class="{ 'bz-btn--running': busy }" :disabled="busy || (!replyThread && missingModels.length > 0) || !draft.trim()">
            <span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
            {{ busy ? $ui('Saving…') : replyThread ? $ui('Send reply') : $ui('Brief the team') }}
          </button>
        </div>
      </form>
    </section>

    <aside class="goal-room__context" aria-label="Goal room context">
      <section class="goal-room__attention">
        <div class="goal-room__section-head">
          <h3>Needs you</h3>
          <button v-if="approvals.length" @click="$emit('open-view', 'approvals')">View all</button>
        </div>
        <template v-if="approvals.length">
          <article v-for="approval in approvals.slice(0, 3)" :key="approval.id">
            <div><strong>{{ actionLabel(approval) }}</strong><span>{{ roleName(approval.role) }}</span></div>
            <div class="goal-room__approval-actions">
              <button class="bz-btn bz-btn--ghost bz-btn--sm" @click="$emit('open-view', 'approvals')">Review</button>
              <button class="bz-iconbtn bz-iconbtn--sm bz-iconbtn--danger" title="Reject" @click="reject(approval.id)"><span class="material-symbols-outlined">close</span></button>
            </div>
          </article>
        </template>
        <p v-else-if="ownerQuestions.length" class="goal-room__clear">{{ $ui('Your answer is needed') }} · <span class="bz-metric">{{ ownerQuestions.length }}</span></p>
        <p v-else class="goal-room__clear">No decisions waiting.</p>
      </section>

      <section class="goal-room__outcomes">
        <div class="goal-room__section-head"><h3>{{ $ui('Progress') }}</h3></div>
        <dl>
          <div><dt>Active goals</dt><dd>{{ state.goalCounts?.active || 0 }}</dd></div>
          <div><dt>Completed work</dt><dd>{{ state.issueCounts?.done || 0 }}</dd></div>
          <div><dt>{{ $ui('Saved results') }}</dt><dd class="bz-metric">{{ state.catalog?.length || 0 }}</dd></div>
          <div><dt>Decisions waiting</dt><dd class="bz-metric">{{ approvals.length + ownerQuestions.length }}</dd></div>
        </dl>
      </section>

      <section class="goal-room__team">
        <div class="goal-room__section-head"><h3>{{ $ui('Team') }}</h3><button @click="$emit('open-view', 'org')">Manage</button></div>
        <ul>
          <li v-for="member in team.slice(0, 6)" :key="member.key">
            <span class="goal-room__member-avatar" :class="{ 'has-image': member.avatar }">
              <img v-if="member.avatar" :src="member.avatar" :alt="member.name" />
              <span v-else class="material-symbols-outlined">person</span>
            </span>
            <div class="goal-room__member-copy"><strong>{{ member.name }}</strong><small>{{ member.role }}</small></div>
          </li>
        </ul>
      </section>
    </aside>
  </div>
</template>

<script setup>
import "./company-design.css";
import { actionDisplayName } from "../../services/company/actionLabels.js";
import CompanyWorkflowProgress from "./CompanyWorkflowProgress.vue";
import { taskProgress } from "../../services/company/workflowProgress.js";
import CompanyQuestion from "./CompanyQuestion.vue";
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { visibleText } from '../../shared/visibleText.js';
import CompanyTeamExchanges from './CompanyTeamExchanges.vue';
import { listTeamConversations, replyToTeam, onTeamMessages } from '../../services/company/teamCommunication.js';
import companyStore from "../../stores/companyStore.js";
import { cancelLocalDownloads } from '../../services/downloadCancellation.js';
import DownloadRequirement from "../DownloadRequirement.vue";
import { smartAgentCatalog } from "../../services/smartAgentCatalog.js";
import { DEFAULT_COMPANIONS, listAllLLMs } from "../../skills/flagship.js";
import {i18n} from "../../i18n/index.js";
import {operationText} from "../../i18n/operations.js";
import { companionAvatar, formatModelLabel, formatRoleTitle } from "../../services/company/presentation.js";
import { isMaintenanceWorkspace, maintenanceAttentionCards } from "../../services/company/maintenanceWorkspace.js";

const props = defineProps({
  charter: { type: Object, required: true },
  state: { type: Object, required: true },
});
const emit = defineEmits(["open-view", "open-result", "open-maintenance"]);

const draft = ref("");
const busy = ref(false);
const submitError = ref("");
const teamComposer = ref(null), threads = ref([]), teamError = ref(''), replyThreadId = ref('');
const messageLimit = ref(50);
const replyThread = computed(() => threads.value.find(thread => thread.id === replyThreadId.value && !thread.archived));
let teamRevision = 0, unsubscribeTeams = () => {}, replyKey = crypto.randomUUID();
watch(draft, () => { replyKey = crypto.randomUUID(); });
watch(replyThreadId, () => { replyKey = crypto.randomUUID(); });
async function loadTeamMessages() {
  const revision = ++teamRevision;
  if (!window.electronAPI?.db?.teams?.list) return;
  try {
    const rows = await listTeamConversations(props.charter.id);
    if (revision !== teamRevision) return;
    threads.value = rows;
    teamError.value = '';
  } catch (error) { if (revision === teamRevision) teamError.value = error.message; }
}
onMounted(() => { loadTeamMessages(); unsubscribeTeams = onTeamMessages(loadTeamMessages); });
onBeforeUnmount(() => { teamRevision++; unsubscribeTeams(); });
watch(() => props.charter.id, () => { threads.value = []; replyThreadId.value = ''; messageLimit.value = 50; loadTeamMessages(); });
const expandedWork = reactive(new Set());
const timeline = ref(null);
const isNearBottom = ref(true);
const modelAvailability = reactive({});
const modelDownloading = reactive({});
const downloadError = ref("");
const downloadProgress = computed(() => { const values = Object.values(modelDownloading); return values.length ? values.reduce((sum, progress) => sum + progress, 0) / values.length : 0; });
const modelSpecs = listAllLLMs().filter((model) => !model.draft);
const maintenanceWorkspace = computed(() => isMaintenanceWorkspace(props.charter));
const maintenanceCards = computed(() => maintenanceWorkspace.value ? maintenanceAttentionCards(props.state.gmao) : []);
const suggestions = computed(() => maintenanceWorkspace.value ? [
  "Which interventions need attention before the next SLA deadline?",
  "Prepare today's dispatch plan",
  "What completed work is blocked from invoicing?",
] : [
  "Recover overdue invoices without damaging client relationships",
  "Prepare this week's operating brief",
  "Revive leads that have gone quiet",
]);
const streams = computed(() => Object.values(props.state.activeStreams || {}).filter(s=>s.companyId===props.charter.id));
const ownerQuestions = computed(() => (props.state.issues || []).filter(issue => issue.status === 'blocked' && issue.execution?.agent?.status === 'waiting_owner'));
const approvals = computed(() => props.state.approvals || []);
const workingLabel = computed(() => streams.value.length ? `${streams.value.length} teammate${streams.value.length === 1 ? '' : 's'} working` : props.charter.status === "active" ? "Active" : "Paused");

const companionNames = Object.fromEntries(DEFAULT_COMPANIONS.map((companion) => [companion.id, companion.name]));
const team = computed(() => Object.entries(props.charter.roles || {}).map(([key, role]) => ({
  key,
  name: role.companionName || role.companion?.name || role.name || smartAgentCatalog.agents.find(agent => agent.id === role.companion)?.name || companionNames[role.companion] || roleName(key),
  role: roleName(key),
  avatar: companionAvatar(role.companion),
  modelKey: role.llm || "",
  model: modelLabel(role.llm),
  missing: Boolean(role.llm && modelAvailability[modelSpec(role.llm)?.filename] === false),
})).filter((member) => member.name));
const missingModels = computed(() => {
  const seen = new Set();
  return team.value.filter((member) => member.missing && !seen.has(member.modelKey) && seen.add(member.modelKey)).map((member) => ({
    key: member.modelKey,
    label: member.model,
  }));
});
const missingModelsDownloading = computed(() => missingModels.value.some((model) => modelDownloading[model.key] != null));

const allConversation = computed(() => {
  const issuesByGoal = new Map();
  for (const issue of props.state.issues || []) {
    if (!issuesByGoal.has(issue.goalId)) issuesByGoal.set(issue.goalId, []);
    issuesByGoal.get(issue.goalId).push(issue);
  }
  const goals = (props.state.goals || []).map((goal) => ({
    id: `goal:${goal.id}`, kind: "owner", icon: "person", author: "You",
    text: goal.title, ts: goal.createdAt, status: goal.status, view: "issues",
    work: issuesByGoal.get(goal.id) || [],
  }));
  const sharedMessages = threads.value.flatMap(thread => (thread.messages || []).map(message => ({
    id: `team:${thread.id}:${message.id}`, messageId: message.id, threadId: thread.id, archived: thread.archived,
    subject: thread.subject, kind: message.company_id === props.charter.id && message.author_role === 'owner' ? 'owner' : 'companion',
    author: message.author_role === 'owner' ? i18n.t('teamExchanges.owner') : message.author_name,
    teamName: message.team_name, role: message.author_role === 'owner' ? null : message.author_role,
    avatar: companionAvatar(message.author_member_id), icon: 'forum', text: message.body, ts: message.created_at,
  })));
  const sharedIds = new Set(sharedMessages.map(message => message.messageId));
  const events = (props.state.audit || []).filter((event) => {
    if (!(event.note || event.action)) return false;
    if (sharedIds.has((event.extra?.teamMessage || event.teamMessage)?.id)) return false;
    return event.action !== "createGoal";
  }).map((event) => {
    const action = String(event.action || "");
    const isResult = event.kind === "production" || action === "publishContent";
    const isApproval = event.status === "proposed" || event.status === "queued";
    const isError = ["error", "parse_error", "vetoed", "blocked", "failed"].includes(String(event.status || "").toLowerCase());
    const assignment = props.charter.roles?.[event.role] || {};
    const sender=event.extra?.teamMessage||event.teamMessage;
    return {
      id: `event:${event.id || event._id || event.ts}:${action}`,
      kind: sender ? (sender.author_role==='owner'?'owner':'companion') : event.role ? "companion" : "system",
      teamName: sender?.team_name || props.charter.name,
      role: sender?.author_role === "owner" ? null : sender?.author_role || event.role,
      icon: isError ? "error" : isResult ? "draft" : isApproval ? "rule" : event.role ? "psychology" : "check_circle",
      author: sender?.author_role === "owner" ? i18n.t("teamExchanges.owner") : sender?.author_name || (event.role ? (smartAgentCatalog.agents.find((agent) => agent.id === assignment.companion)?.name || companionNames[assignment.companion] || roleName(event.role)) : "BonzAI"),
      avatar: companionAvatar(sender?.author_member_id || assignment.companion),
      model: event.llm ? formatModelLabel(event.llm.modelKey || event.llm.model || event.llm.filename || event.llm) : "",
      text: sender?.body || feedbackText(event),
      ts: event.ts || event.createdAt,
      status: event.status,
      isError,
      view: isResult ? "deliverables" : isApproval ? "approvals" : event.issueId || isError ? "issues" : null,
    };
  });
  const answers = (props.state.issues || []).flatMap(issue => (issue.execution?.agent?.events || [])
    .filter(event => event.type === 'owner_answer')
    .map((event, index) => ({ id: `answer:${issue.id}:${index}`, kind: 'owner', author: i18n.t('teamExchanges.owner'),
      teamName: props.charter.name, icon: 'person', subject: event.question || issue.title, text: event.text, ts: event.at })));
  return [...goals, ...events, ...sharedMessages, ...answers].sort((a, b) => toMs(a.ts) - toMs(b.ts));
});
const conversation = computed(() => allConversation.value.slice(-messageLimit.value));

const conversationTail = computed(() => {
  const last = conversation.value.at(-1);
  return last ? `${last.id}:${last.status || ""}:${last.work?.length || 0}` : "";
});
const streamTail = computed(() => streams.value.map((stream) => `${stream.streamId}:${stream.response?.length || 0}`).join("|"));
watch([conversationTail, streamTail], () => scrollToBottom(false));
onMounted(async () => {
  await refreshModelAvailability();
  await scrollToBottom(true);
});

function onTimelineScroll() {
  const el = timeline.value;
  if (!el) return;
  isNearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 96;
}
async function scrollToBottom(force = false) {
  if (!force && !isNearBottom.value) return;
  await nextTick();
  const el = timeline.value;
  if (!el) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollTo({ top: el.scrollHeight, behavior: force && !reduceMotion ? "smooth" : "auto" });
  isNearBottom.value = true;
}
function isNewMessage(item) {
  return Date.now() - toMs(item.ts) < 2200;
}

async function submit() {
  const text = draft.value.trim();
  if (!text || busy.value) return;
  busy.value = true;
  submitError.value = "";
  try {
    if (replyThread.value) {
      await replyToTeam(props.charter.id, { conversationId: replyThread.value.id, body: text, requestKey: replyKey });
      draft.value = ''; replyThreadId.value = '';
      await loadTeamMessages();
      return;
    }
    const goal = await companyStore.createGoal({ title: text, rationale: text, tasks: [] });
    draft.value = "";
    const roles = [...new Set((goal?.createdIssues || []).map((issue) => issue.assigneeRole).filter(Boolean))];
    for (const role of roles) await companyStore.tickRoleNow(role);
  } catch (error) {
    submitError.value = error?.message || "The team could not start this brief. Check the required models and try again.";
  } finally {
    busy.value = false;
  }
}
function visibleWork(item) { return expandedWork.has(item.id) ? item.work : item.work.slice(0, 4); }
function toggleWork(id) {
  if (expandedWork.has(id)) expandedWork.delete(id);
  else expandedWork.add(id);
}
function openTask(task) {
  if (task.status === "done") emit("open-result", task.id);
  else emit("open-view", "issues");
}
function feedbackText(event) {
  const action = String(event.action || "");
  const raw = visibleText(event.llm?.response);
  if (raw) {
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const plan = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
      if (Array.isArray(plan.goals) && plan.goals.length) {
        return `I planned ${plan.goals.length} goal${plan.goals.length === 1 ? "" : "s"} and assigned the work: ${plan.goals.map((goal) => goal.title).filter(Boolean).slice(0, 2).join("; ")}.`;
      }
      if (Array.isArray(plan.actions) && plan.actions.length) {
        const details = plan.actions.map((entry) => entry.summary || entry.title || entry.description || entry.prompt || entry.type).filter(Boolean).slice(0, 2);
        return details.length ? concise(details.join(". ")) : `I prepared ${plan.actions.length} action${plan.actions.length === 1 ? "" : "s"}.`;
      }
    } catch {}
  }
  if (action === "tickCEO" && /^emitted\s+\d+\s+goals?/i.test(event.note || "")) return "I turned the brief into a plan and assigned the first work.";
  return event.note || action.replace(/([a-z])([A-Z])/g, "$1 $2");
}
function concise(value, max = 360) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
function completedCount(work) { return work.filter((task) => task.status === "done").length; }
function completionPercent(work) { return work.length ? Math.round((completedCount(work) / work.length) * 100) : 0; }
function taskIcon(status) {
  return ({ done: "check_circle", blocked: "error", in_progress: "progress_activity", cancelled: "block" })[status] || "radio_button_unchecked";
}
function viewLabel(view) {
  return ({ issues: "Open work", approvals: "Review decision", deliverables: "View result" })[view] || "Open";
}
const approve = (id) => companyStore.approve(id);
const reject = (id) => companyStore.reject(id, "Rejected by owner from the goal room");
function memberName(role) {
  const assignment=props.charter.roles?.[role]||{};
  return assignment.companionName || assignment.companion?.name || smartAgentCatalog.agents.find(a=>a.id===assignment.companion)?.name || companionNames[assignment.companion] || roleName(role);
}

function roleName(role) {
  return operationText(formatRoleTitle(role || "CEO"),i18n.state.locale);
}
function roleAvatar(role) { return companionAvatar(props.charter.roles?.[role]?.companion); }
function modelSpec(key) { return modelSpecs.find((model) => model.key === key); }
function modelLabel(key) { return formatModelLabel(modelSpec(key)?.name || key || "current model"); }
async function refreshModelAvailability() {
  if (!window.electronAPI?.checkModel) return;
  const keys = [...new Set(Object.values(props.charter.roles || {}).map((role) => role?.llm).filter(Boolean))];
  await Promise.all(keys.map(async (key) => {
    const spec = modelSpec(key);
    if (spec?.filename) modelAvailability[spec.filename] = await window.electronAPI.checkModel(spec.filename);
  }));
}
let downloadRun = 0;
const isCancellingDownloads = ref(false);
async function cancelActiveDownloads() {
  if (isCancellingDownloads.value) return;
  isCancellingDownloads.value = true;
  downloadRun++;
  try {
    await cancelLocalDownloads({ filenames: Object.keys(modelDownloading).map(key => modelSpec(key)?.filename) });
  } catch (error) { downloadError.value = error.message; }
  finally { isCancellingDownloads.value = false; }
}
async function downloadModel(key) {
  const spec = modelSpec(key);
  if (!spec?.filename || !spec?.url || modelDownloading[key] != null) return;
  downloadError.value = "";
  modelDownloading[key] = 0;
  const unsubscribe = window.electronAPI?.onDownloadProgress?.((_event, data) => {
    if (data.filename === spec.filename) modelDownloading[key] = Math.round((data.percent || 0) * 100);
  });
  try {
    const result = await window.electronAPI.downloadModel(spec.url, spec.filename);
    modelAvailability[spec.filename] = Boolean(result === true || result?.savedPath);
    if (result?.error) downloadError.value = `Model download failed: ${result.error}`;
  } catch (error) {
    downloadError.value = error.message;
  } finally {
    unsubscribe?.();
    delete modelDownloading[key];
  }
}
async function downloadMissingModels() {
  if (isCancellingDownloads.value) return;
  const run = ++downloadRun;
  for (const model of missingModels.value) {
    if (run !== downloadRun) return;
    await downloadModel(model.key);
  }
}
function actionLabel(item) { return actionDisplayName(item.action, i18n.state.locale); }
function streamActivity(stream) {
  if (stream.action === "tickCEO") return "Reviewing goals, evidence and team capacity to plan the next work.";
  return "Working through the assigned task with the available company context.";
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
  return Number.isFinite(parsed) ? parsed : Date.now();
}
</script>

<style scoped>
.goal-room { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 27%); height: calc(100dvh - 310px); min-height: 540px; max-height: 1000px; background: var(--bz-canvas); border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); overflow: hidden; }
.goal-room__conversation { position: relative; min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.goal-room__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--bz-space-5); padding: var(--bz-space-4) var(--bz-space-5); border-bottom: 1px solid var(--bz-border); }
.goal-room__head p, .goal-room__head h2 { margin: 0; }
.goal-room__head h2 { margin-top: var(--bz-space-1); font-size: 30px; }
.goal-room__head { flex-wrap: wrap; align-items: center; }
.goal-message__meta { flex-wrap: wrap; }
.goal-message__subject { display: block; margin-top: var(--bz-space-2); color: var(--bz-fg-mid); overflow-wrap: anywhere; line-height: 1.5; }
.goal-message__body p { overflow-wrap: anywhere; }
.goal-composer__reply { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-3); color: var(--bz-fg-mid); padding: var(--bz-space-3) var(--bz-space-4); border-bottom: 1px solid var(--bz-border); background: var(--bz-panel); overflow-wrap: anywhere; }
.goal-room__working { display: flex; align-items: center; gap: var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); white-space: nowrap; }
.goal-room__model-alert { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-3) var(--bz-space-5); border-bottom: 1px solid var(--bz-warning); background: var(--bz-warning-soft); color: var(--bz-fg); }
.goal-room__model-alert > .material-symbols-outlined { color: var(--bz-warning); font-size: 26px; }
.goal-room__model-alert strong { font-size: var(--bz-size-body); }
.goal-room__model-alert p { margin: 2px 0 0; color: var(--bz-fg-mid); font: 400 var(--bz-size-micro)/1.3 var(--bz-font-mono); }
.goal-room__model-alert .bz-btn { min-height: 36px; max-width: 190px; padding: 0 var(--bz-space-3); font-size: var(--bz-size-meta); line-height: 1.15; white-space: normal; }
.goal-room__timeline { flex: 1; min-height: 0; overflow-y: auto; padding: var(--bz-space-6); scroll-behavior: smooth; overscroll-behavior-y: contain; scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; }
.goal-room__welcome { max-width: 620px; margin: var(--bz-space-7) auto; display: flex; gap: var(--bz-space-4); color: var(--bz-fg-mid); }
.goal-room__welcome > span { color: var(--bz-accent); font-size: 26px; flex-shrink: 0; padding: var(--bz-space-3); border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); background: var(--bz-panel); }
.goal-room__welcome strong { color: var(--bz-fg); font-size: 17px; font-weight: 400; }
.goal-room__welcome p { max-width: 60ch; margin: var(--bz-space-2) 0 0; line-height: 1.55; }
.maintenance-brief { max-width: 760px; margin: 0 0 var(--bz-space-6); overflow: hidden; border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); background: var(--bz-panel); }
.maintenance-brief > header { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-3); padding: var(--bz-space-3) var(--bz-space-4); border-bottom: 1px solid var(--bz-border); background: var(--bz-panel); }
.maintenance-brief > header > div { display: flex; align-items: center; gap: var(--bz-space-2); }
.maintenance-brief > header > div > .material-symbols-outlined { color: var(--bz-accent); }
.maintenance-brief > header div div { display: grid; gap: 1px; }
.maintenance-brief > header strong { color: var(--bz-fg); font-size: var(--bz-size-meta); font-weight: 500; }
.maintenance-brief > header small { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.5; }
.maintenance-brief > header button { padding: 0; border: 0; background: transparent; color: var(--bz-accent); cursor: pointer; font: 400 var(--bz-size-meta)/1.2 var(--bz-font-body); }
.maintenance-brief__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.maintenance-card { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-content: start; gap: var(--bz-space-2); padding: var(--bz-space-4); color: var(--bz-fg-mid); text-align: left; background: var(--bz-card); border: 0; border-right: 1px solid var(--bz-border); cursor: pointer; font-family: var(--bz-font-body); }
.maintenance-card:last-child { border-right: 0; }
.maintenance-card:hover { background: var(--bz-raised); }
.maintenance-card > .material-symbols-outlined { color: var(--bz-accent); font-size: 19px; }
.maintenance-card.is-danger > .material-symbols-outlined { color: var(--bz-danger); }
.maintenance-card.is-warning > .material-symbols-outlined { color: var(--bz-warning); }
.maintenance-card__copy { min-width: 0; display: grid; gap: 3px; }
.maintenance-card__copy small { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.5; }
.maintenance-card__copy strong { color: var(--bz-fg); font-size: var(--bz-size-meta); font-weight: 500; }
.maintenance-card__copy > span { display: -webkit-box; overflow: hidden; color: var(--bz-fg-low); font-size: var(--bz-size-meta); line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.maintenance-card__action { grid-column: 2; display: inline-flex; align-items: center; gap: 2px; margin-top: var(--bz-space-2); color: var(--bz-accent); font-size: var(--bz-size-micro); }
.maintenance-card__action .material-symbols-outlined { font-size: 14px; }
.goal-message { display: grid; grid-template-columns: 38px minmax(0, 1fr); align-items: start; gap: var(--bz-space-3); max-width: 800px; margin: 0 0 var(--bz-space-5); }
.goal-message.is-owner { margin-left: auto; grid-template-columns: minmax(0, 1fr) 38px; }
.goal-message.is-owner .goal-message__avatar { grid-column: 2; grid-row: 1; }
.goal-message.is-owner .goal-message__body { grid-column: 1; grid-row: 1; background: var(--bz-purple-soft); border-color: var(--bz-border-brand); }
.goal-message__avatar { width: 38px; height: 38px; display: grid; place-items: center; overflow: hidden; border-radius: 50%; color: var(--bz-accent); background: var(--bz-raised); border: 1px solid var(--bz-border); }
.goal-message__avatar span { font-size: 18px; }
.goal-message__avatar img { width: 100%; height: 100%; object-fit: cover; }
.goal-message__avatar.is-owner { color: var(--bz-on-accent); background: var(--bz-purple-500); }
.goal-message__body { position: relative; min-width: 0; padding: var(--bz-space-4) var(--bz-space-5); background: var(--bz-card); border: 1px solid var(--bz-border); border-radius: 16px 16px 16px 5px; }
.goal-message.is-owner .goal-message__body { border-radius: 16px 16px 5px 16px; }
.goal-message__body p { margin: var(--bz-space-3) 0 0; color: var(--bz-fg); font-size: var(--bz-size-body); line-height: 1.75; white-space: pre-wrap; }
.goal-message.is-error .goal-message__body { border-color: var(--bz-danger); background: var(--bz-danger-soft); }
.goal-message.is-error .goal-message__avatar { color: var(--bz-danger); border-color: var(--bz-danger); }
.goal-message__meta { display: flex; align-items: baseline; gap: var(--bz-space-1) var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.5; overflow-wrap: anywhere; }
.goal-message__meta strong { color: var(--bz-fg); font-size: var(--bz-size-body); font-weight: 500; }
.goal-message__status { padding: 2px var(--bz-space-2); border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-panel); line-height: 1.3; }
.goal-message__model { color: var(--bz-fg-mid); font-size: var(--bz-size-micro); overflow-wrap: anywhere; }
.goal-message__work { display: grid; margin-top: var(--bz-space-4); overflow: hidden; border-top: 1px solid var(--bz-border); }
.goal-message__workflow { min-width: 0; padding-bottom: var(--bz-space-1); border-top: 1px solid var(--bz-border); }
.goal-message__progress { display: grid; grid-template-columns: auto minmax(80px, 1fr); align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-3) 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.goal-message__progress-track { height: 4px; overflow: hidden; border-radius: 2px; background: var(--bz-raised); }
.goal-message__progress-track i { display: block; height: 100%; background: var(--bz-emerald-500); transition: width 220ms var(--bz-ease-out); }
.goal-message__task { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: start; gap: var(--bz-space-2); width: 100%; min-width: 0; padding: var(--bz-space-3) var(--bz-space-2); color: var(--bz-fg); text-align: left; background: transparent; border: 0; border-radius: var(--bz-r-sm); cursor: pointer; font: 400 var(--bz-size-body)/1.5 var(--bz-font-body); overflow-wrap: anywhere; transition: background var(--bz-dur-fast); }
.goal-message__task:hover { color: var(--bz-fg); background: var(--bz-raised); }
.goal-message__task .material-symbols-outlined { color: var(--bz-accent); font-size: 17px; }
.goal-message__task small { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.goal-message__work-toggle { display: flex; align-items: center; justify-content: center; gap: var(--bz-space-1); min-height: 32px; border: 0; border-top: 1px solid var(--bz-border); background: var(--bz-panel); color: var(--bz-accent); cursor: pointer; font: 400 var(--bz-size-micro)/1 var(--bz-font-body); }
.goal-message__work-toggle .material-symbols-outlined { font-size: 16px; }
.goal-message__link { display: inline-flex; align-items: center; gap: var(--bz-space-1); margin-top: var(--bz-space-3); padding: 0; color: var(--bz-accent); background: none; border: 0; cursor: pointer; font: inherit; }
.goal-message__link span { font-size: 16px; }
.goal-message__pulse { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; overflow: hidden; background: var(--bz-accent); border-radius: 0 0 var(--bz-r-lg) var(--bz-r-lg); }
.goal-message.is-new:not(.is-owner) { animation: goal-message-from-left 280ms var(--bz-ease-out) both; }
.goal-message.is-new.is-owner { animation: goal-message-from-right 280ms var(--bz-ease-out) both; }
@keyframes goal-message-from-left { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
@keyframes goal-message-from-right { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
.goal-room__scroll-bottom { position: absolute; right: var(--bz-space-6); bottom: 154px; z-index: 3; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--bz-border-strong); border-radius: 50%; background: var(--bz-raised); color: var(--bz-fg); box-shadow: var(--bz-elev-1); cursor: pointer; }
.goal-room__suggestions { display: flex; gap: var(--bz-space-2); padding: 0 var(--bz-space-6) var(--bz-space-3); overflow-x: auto; }
.goal-room__suggestions button { flex: 0 0 auto; min-height: 36px; padding: var(--bz-space-2) var(--bz-space-3); color: var(--bz-fg-mid); background: transparent; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); cursor: pointer; font: 400 var(--bz-size-meta)/1.2 var(--bz-font-body); }
.goal-room__suggestions button:hover { color: var(--bz-fg); border-color: var(--bz-border-strong); background: var(--bz-raised); }
.goal-composer { margin: 0 var(--bz-space-6) var(--bz-space-5); background: var(--bz-card); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-lg); overflow: hidden; }
.goal-composer:focus-within { border-color: var(--bz-accent); outline: 2px solid var(--bz-border-brand); outline-offset: 3px; }
.goal-composer textarea { width: 100%; min-height: 96px; resize: vertical; max-height: 220px; padding: var(--bz-space-4) var(--bz-space-5); color: var(--bz-fg); background: transparent; border: 0; outline: 0; font: 400 15px/1.65 var(--bz-font-body); box-sizing: border-box; }
.goal-composer textarea::placeholder { color: var(--bz-fg-low); }
.goal-composer__error { margin: 0; padding: var(--bz-space-2) var(--bz-space-4); border-bottom: 1px solid var(--bz-danger); background: var(--bz-danger-soft); color: var(--bz-fg); font-size: var(--bz-size-meta); }
.goal-composer__footer { display: flex; justify-content: space-between; align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-2); border-top: 1px solid var(--bz-border); }
.goal-composer__footer > span { display: flex; align-items: center; gap: var(--bz-space-2); padding-left: var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.4; }
.goal-composer__footer > span span { font-size: 16px; color: var(--bz-fg-low); }
.goal-composer__send { min-height: 36px; padding: 0 var(--bz-space-3); font-size: var(--bz-size-meta); white-space: nowrap; }
.goal-room__context { min-width: 0; overflow-y: auto; background: var(--bz-panel); border-left: 1px solid var(--bz-border); }
.goal-room__context > section { padding: var(--bz-space-5); border-bottom: 1px solid var(--bz-border); }
.goal-room__context > section:last-child { border-bottom: 0; }
.goal-room__section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-2); margin-bottom: var(--bz-space-4); }
.goal-room__section-head h3 { margin: 0; color: var(--bz-fg); font-size: var(--bz-size-h3); line-height: 1.3; font-weight: 400; }
.goal-room__section-head button { padding: 0; color: var(--bz-accent); background: none; border: 0; cursor: pointer; font-size: var(--bz-size-meta); }
.goal-room__attention article { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-2); padding: var(--bz-space-3) 0; border-top: 1px solid var(--bz-border); }
.goal-room__attention article > div:first-child { display: grid; gap: 2px; min-width: 0; }
.goal-room__attention article strong { color: var(--bz-fg); font-size: var(--bz-size-body); font-weight: 400; line-height: 1.5; overflow-wrap: anywhere; }
.goal-room__attention article span, .goal-room__clear { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.6; }
.goal-room__approval-actions { display: flex; gap: var(--bz-space-1); }
.goal-room__outcomes dl { margin: 0; display: grid; gap: var(--bz-space-3); }
.goal-room__outcomes dl div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--bz-space-3); padding-bottom: var(--bz-space-2); border-bottom: 1px solid var(--bz-border); }
.goal-room__outcomes dl div:last-child { border-bottom: 0; padding-bottom: 0; }
.goal-room__outcomes dt { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.goal-room__outcomes dd { margin: 0; color: var(--bz-fg); font: italic 900 24px/1.2 var(--bz-font-metric); }
.goal-room__team ul { display: grid; gap: var(--bz-space-1); margin: 0; padding: 0; list-style: none; }
.goal-room__team li { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: start; gap: var(--bz-space-3); padding: var(--bz-space-3) 0; border-top: 1px solid var(--bz-border); }
.goal-room__member-avatar { width: 34px; height: 34px; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--bz-border); border-radius: 50%; background: var(--bz-raised); color: var(--bz-fg-low); }
.goal-room__member-avatar img { width: 100%; height: 100%; object-fit: cover; }
.goal-room__member-avatar span { font-size: 16px; }
.goal-room__member-copy strong{font-size:14px;color:var(--bz-fg);font-weight:500}.goal-room__member-copy small{font-size:12px;color:var(--bz-fg-mid)}
.goal-room__member-copy { display: grid; gap: 5px; min-width: 0; margin: 0; }
.goal-room__member-copy div { display: grid; grid-template-columns: 58px minmax(0, 1fr); align-items: center; gap: var(--bz-space-2); }
.goal-room__member-copy dt { color: var(--bz-fg-low); font-size: 10px; text-transform: uppercase; }
.goal-room__member-copy dd { min-width: 0; margin: 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); overflow-wrap: anywhere; }
.goal-room__model-download { display: inline-flex; align-items: center; gap: 3px; padding: 3px 6px; border: 1px solid var(--bz-border-brand); border-radius: var(--bz-r-sm); background: var(--bz-purple-soft); color: var(--bz-accent); font: 400 10px/1 var(--bz-font-body); cursor: pointer; }
.goal-room__model-download .material-symbols-outlined { font-size: 13px; }
.goal-room__model-ready { color: var(--bz-emerald-500); font-size: var(--bz-size-micro); }
@media (max-width: 1100px) { .goal-room { grid-template-columns: minmax(0, 1fr); } .goal-room__context { display: none; } }
@media (max-width: 760px) { .maintenance-brief__grid { grid-template-columns: 1fr; } .maintenance-card { border-right: 0; border-bottom: 1px solid var(--bz-border); } .maintenance-card:last-child { border-bottom: 0; } }
.goal-room__head,.goal-composer,.goal-room__suggestions{flex-shrink:0}
@media(max-width:600px){.goal-room__timeline{padding:var(--bz-space-3)}.goal-room__head{padding:var(--bz-space-3)}.goal-composer{margin:var(--bz-space-3)}.goal-composer__footer{flex-wrap:wrap}.goal-composer__send{margin-left:auto}.goal-room__suggestions{padding-inline:var(--bz-space-3)}}

.goal-room :is(button, textarea) { transition: background var(--bz-dur-fast), border-color var(--bz-dur-fast), color var(--bz-dur-fast); }
.goal-room :is(button, summary):focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; }
.goal-room__working { white-space: normal; line-height: 1.5; }
.goal-room__timeline > .bz-btn { margin-bottom: var(--bz-space-5); }
@media (max-width: 600px) {
  .goal-message { grid-template-columns: 28px minmax(0, 1fr); gap: var(--bz-space-2); }
  .goal-message.is-owner { grid-template-columns: minmax(0, 1fr) 28px; }
  .goal-message__avatar { width: 28px; height: 28px; }
  .goal-message__body { padding: var(--bz-space-3); }
  .goal-message__task { grid-template-columns: 20px minmax(0, 1fr); }
  .goal-message__task small { grid-column: 2; }
  .goal-message__progress { grid-template-columns: minmax(0, 1fr); gap: var(--bz-space-2); }
  .goal-composer textarea { padding: var(--bz-space-4); }
  .goal-composer__footer > span { flex-basis: 100%; padding: var(--bz-space-1); }
  .goal-room__scroll-bottom { right: var(--bz-space-5); }
}
@media (prefers-reduced-motion: reduce) {
  .goal-message.is-new, .goal-message__pulse { animation: none; }
  .goal-room :is(button, textarea), .goal-message__progress-track i { transition: none; }
  .goal-room__timeline { scroll-behavior: auto; }
}
</style>
