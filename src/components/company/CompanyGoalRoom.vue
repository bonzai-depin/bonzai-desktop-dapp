<template>
  <div class="goal-room">
    <section class="goal-room__conversation" aria-label="Goal room conversation">
      <header class="goal-room__head">
        <div>
          <p class="bz-eyebrow">Goal room</p>
          <h2 class="bz-display">What should the team achieve?</h2>
        </div>
        <span class="goal-room__working">
          <span class="status-dot" :class="charter.status === 'active' ? 'status-active' : 'status-paused'"></span>
          {{ workingLabel }}
        </span>
      </header>

      <div v-if="missingModels.length" class="goal-room__model-alert" role="alert">
        <span class="material-symbols-outlined" aria-hidden="true">download_for_offline</span>
        <div>
          <strong>{{ missingModels.length }} required model{{ missingModels.length === 1 ? '' : 's' }} missing</strong>
          <p>{{ missingModels.map((model) => model.label).join(' · ') }}</p>
        </div>
        <button class="bz-btn bz-btn--primary" :disabled="missingModelsDownloading" @click="downloadMissingModels">
          <span class="material-symbols-outlined" aria-hidden="true">download</span>
          {{ missingModelsDownloading ? 'Downloading...' : 'Download required models' }}
        </button>
      </div>

      <div ref="timeline" class="goal-room__timeline" aria-live="polite" @scroll="onTimelineScroll">
        <div v-if="!conversation.length" class="goal-room__welcome">
          <span class="material-symbols-outlined" aria-hidden="true">forum</span>
          <div>
            <strong>Give the team an outcome, not a list of tasks.</strong>
            <p>BonzAI will plan the work, assign companions, use connected evidence and return for approval where needed.</p>
          </div>
        </div>

        <article v-for="item in conversation" :key="item.id" class="goal-message" :class="[`is-${item.kind}`, { 'is-new': isNewMessage(item), 'is-error': item.isError }]">
          <div class="goal-message__avatar" :class="[`is-${item.kind}`, { 'has-image': item.avatar }]">
            <img v-if="item.avatar" :src="item.avatar" :alt="item.author" />
            <span v-else class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>
          </div>
          <div class="goal-message__body">
            <div class="goal-message__meta">
              <strong>{{ item.author }}</strong>
              <time>{{ relativeTime(item.ts) }}</time>
              <span v-if="item.status" class="goal-message__status">{{ item.status }}</span>
              <span v-if="item.model" class="goal-message__model bz-mono">{{ item.model }}</span>
            </div>
            <p>{{ item.text }}</p>
            <div v-if="item.work?.length" class="goal-message__work">
              <div class="goal-message__progress">
                <span>{{ completedCount(item.work) }}/{{ item.work.length }} completed</span>
                <span class="goal-message__progress-track" aria-hidden="true"><i :style="{ width: `${completionPercent(item.work)}%` }"></i></span>
              </div>
              <button v-for="task in visibleWork(item)" :key="task.id" type="button" class="goal-message__task" @click="openTask(task)">
                <span class="material-symbols-outlined" aria-hidden="true">{{ taskIcon(task.status) }}</span>
                <span>{{ task.title }}</span>
                <small>{{ roleName(task.assigneeRole) }}</small>
              </button>
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
            <div class="goal-message__meta"><strong>{{ roleName(stream.role) }}</strong><span>working now</span></div>
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

      <div class="goal-room__suggestions" aria-label="Suggested goals">
        <button v-for="suggestion in suggestions" :key="suggestion" type="button" @click="draft = suggestion">{{ suggestion }}</button>
      </div>

      <form class="goal-composer" @submit.prevent="submit">
        <p v-if="submitError" class="goal-composer__error" role="alert">{{ submitError }}</p>
        <textarea
          v-model="draft"
          rows="2"
          :disabled="busy || missingModels.length > 0"
          placeholder="Describe the outcome you want, the context that matters, and any boundaries…"
          aria-label="Describe a business goal"
          @keydown.meta.enter.prevent="submit"
          @keydown.ctrl.enter.prevent="submit"
        ></textarea>
        <div class="goal-composer__footer">
          <span><span class="material-symbols-outlined" aria-hidden="true">shield_lock</span> Private company context stays on this device</span>
          <button class="bz-btn bz-btn--primary goal-composer__send" :class="{ 'bz-btn--running': busy }" :disabled="busy || missingModels.length > 0 || !draft.trim()">
            <span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
            {{ busy ? 'Planning…' : 'Brief the team' }}
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
              <button class="bz-iconbtn bz-iconbtn--sm" title="Approve" @click="approve(approval.id)"><span class="material-symbols-outlined">check</span></button>
              <button class="bz-iconbtn bz-iconbtn--sm bz-iconbtn--danger" title="Reject" @click="reject(approval.id)"><span class="material-symbols-outlined">close</span></button>
            </div>
          </article>
        </template>
        <p v-else class="goal-room__clear">No decisions waiting.</p>
      </section>

      <section class="goal-room__outcomes">
        <div class="goal-room__section-head"><h3>Business impact</h3></div>
        <dl>
          <div><dt>Active goals</dt><dd>{{ state.goalCounts?.active || 0 }}</dd></div>
          <div><dt>Completed work</dt><dd>{{ state.issueCounts?.done || 0 }}</dd></div>
          <div><dt>Results delivered</dt><dd>{{ state.catalog?.length || 0 }}</dd></div>
          <div><dt>Decisions waiting</dt><dd>{{ approvals.length }}</dd></div>
        </dl>
      </section>

      <section class="goal-room__team">
        <div class="goal-room__section-head"><h3>Team in this room</h3><button @click="$emit('open-view', 'org')">Manage</button></div>
        <ul>
          <li v-for="member in team.slice(0, 6)" :key="member.key">
            <span class="goal-room__member-avatar" :class="{ 'has-image': member.avatar }">
              <img v-if="member.avatar" :src="member.avatar" :alt="member.name" />
              <span v-else class="material-symbols-outlined">person</span>
            </span>
            <dl class="goal-room__member-copy">
              <div><dt>Name</dt><dd>{{ member.name }}</dd></div>
              <div><dt>Role</dt><dd>{{ member.role }}</dd></div>
              <div><dt>Model</dt><dd class="bz-mono">{{ member.model }}</dd></div>
              <div>
                <dt>Download</dt>
                <dd>
                  <button
                    v-if="member.missing"
                    class="goal-room__model-download"
                    :disabled="modelDownloading[member.modelKey] != null"
                    :title="`Download ${member.model}`"
                    @click="downloadModel(member.modelKey)"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">download</span>
                    {{ modelDownloading[member.modelKey] != null ? `${modelDownloading[member.modelKey]}%` : 'Download' }}
                  </button>
                  <span v-else class="goal-room__model-ready">Installed</span>
                </dd>
              </div>
            </dl>
          </li>
        </ul>
      </section>
    </aside>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import companyStore from "../../stores/companyStore.js";
import { DEFAULT_COMPANIONS, listAllLLMs } from "../../skills/flagship.js";
import { companionAvatar, formatModelLabel, formatRoleTitle } from "../../services/company/presentation.js";

const props = defineProps({
  charter: { type: Object, required: true },
  state: { type: Object, required: true },
});
const emit = defineEmits(["open-view", "open-result"]);

const draft = ref("");
const busy = ref(false);
const submitError = ref("");
const expandedWork = reactive(new Set());
const timeline = ref(null);
const isNearBottom = ref(true);
const modelAvailability = reactive({});
const modelDownloading = reactive({});
const modelSpecs = listAllLLMs().filter((model) => !model.draft);
const suggestions = [
  "Recover overdue invoices without damaging client relationships",
  "Prepare this week's operating brief",
  "Revive leads that have gone quiet",
];
const streams = computed(() => Object.values(props.state.activeStreams || {}));
const approvals = computed(() => props.state.approvals || []);
const workingLabel = computed(() => streams.value.length ? `${streams.value.length} teammate${streams.value.length === 1 ? '' : 's'} working` : props.charter.status === "active" ? "Team is listening" : "Team is paused");

const companionNames = Object.fromEntries(DEFAULT_COMPANIONS.map((companion) => [companion.id, companion.name]));
const team = computed(() => Object.entries(props.charter.roles || {}).map(([key, role]) => ({
  key,
  name: role.companionName || role.companion?.name || role.name || companionNames[role.companion] || roleName(key),
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

const conversation = computed(() => {
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
  const events = (props.state.audit || []).filter((event) => {
    if (!(event.note || event.action)) return false;
    return event.action !== "createGoal";
  }).slice(0, 60).map((event) => {
    const action = String(event.action || "");
    const isResult = event.kind === "production" || action === "publishContent";
    const isApproval = event.status === "proposed" || event.status === "queued";
    const isError = ["error", "parse_error", "vetoed", "blocked", "failed"].includes(String(event.status || "").toLowerCase());
    const assignment = props.charter.roles?.[event.role] || {};
    return {
      id: `event:${event.id || event._id || event.ts}:${action}`,
      kind: event.role ? "companion" : "system",
      icon: isError ? "error" : isResult ? "draft" : isApproval ? "rule" : event.role ? "psychology" : "check_circle",
      author: event.role ? (companionNames[assignment.companion] || roleName(event.role)) : "BonzAI",
      avatar: event.role ? companionAvatar(assignment.companion) : null,
      model: event.llm ? formatModelLabel(event.llm.modelKey || event.llm.model || event.llm.filename || event.llm) : "",
      text: feedbackText(event),
      ts: event.ts || event.createdAt,
      status: event.status,
      isError,
      view: isResult ? "deliverables" : isApproval ? "approvals" : event.issueId || isError ? "issues" : null,
    };
  });
  return [...goals, ...events].sort((a, b) => toMs(a.ts) - toMs(b.ts)).slice(-30);
});

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
  el.scrollTo({ top: el.scrollHeight, behavior: force ? "smooth" : "auto" });
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
  const raw = event.llm?.response;
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
function roleName(role) {
  return formatRoleTitle(role || "CEO");
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
async function downloadModel(key) {
  const spec = modelSpec(key);
  if (!spec?.filename || !spec?.url || modelDownloading[key] != null) return;
  modelDownloading[key] = 0;
  const unsubscribe = window.electronAPI?.onDownloadProgress?.((_event, data) => {
    if (data.filename === spec.filename) modelDownloading[key] = Math.round((data.percent || 0) * 100);
  });
  try {
    const result = await window.electronAPI.downloadModel(spec.url, spec.filename);
    modelAvailability[spec.filename] = Boolean(result === true || result?.savedPath);
    if (result?.error) alert(`Model download failed: ${result.error}`);
  } finally {
    unsubscribe?.();
    delete modelDownloading[key];
  }
}
async function downloadMissingModels() {
  for (const model of missingModels.value) await downloadModel(model.key);
}
function actionLabel(item) { return String(item.action?.type || item.action || "Review action").replace(/([a-z])([A-Z])/g, "$1 $2"); }
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
.goal-room { display: grid; grid-template-columns: minmax(0, 1fr) 360px; height: calc(100vh - 430px); min-height: 500px; max-height: 720px; background: var(--bz-canvas); border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); overflow: hidden; }
.goal-room__conversation { position: relative; min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; }
.goal-room__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--bz-space-5); padding: var(--bz-space-5) var(--bz-space-6); border-bottom: 1px solid var(--bz-border); }
.goal-room__head p, .goal-room__head h2 { margin: 0; }
.goal-room__head h2 { margin-top: var(--bz-space-1); font-size: 30px; }
.goal-room__working { display: flex; align-items: center; gap: var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); white-space: nowrap; }
.goal-room__model-alert { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-3) var(--bz-space-5); border-bottom: 1px solid var(--bz-warning); background: var(--bz-warning-soft); color: var(--bz-fg); }
.goal-room__model-alert > .material-symbols-outlined { color: var(--bz-warning); font-size: 26px; }
.goal-room__model-alert strong { font-size: var(--bz-size-body); }
.goal-room__model-alert p { margin: 2px 0 0; color: var(--bz-fg-mid); font: 400 var(--bz-size-micro)/1.3 var(--bz-font-mono); }
.goal-room__model-alert .bz-btn { min-height: 36px; max-width: 190px; padding: 0 var(--bz-space-3); font-size: var(--bz-size-meta); line-height: 1.15; white-space: normal; }
.goal-room__timeline { min-height: 0; overflow-y: auto; padding: var(--bz-space-5) var(--bz-space-6); scroll-behavior: smooth; }
.goal-room__welcome { max-width: 620px; margin: var(--bz-space-7) auto; display: flex; gap: var(--bz-space-4); color: var(--bz-fg-mid); }
.goal-room__welcome > span { color: var(--bz-purple-300); font-size: 28px; }
.goal-room__welcome strong { color: var(--bz-fg); font-size: 17px; font-weight: 400; }
.goal-room__welcome p { max-width: 60ch; margin: var(--bz-space-2) 0 0; line-height: 1.55; }
.goal-message { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: var(--bz-space-3); max-width: 760px; margin: 0 0 var(--bz-space-5); }
.goal-message.is-owner { margin-left: auto; grid-template-columns: minmax(0, 1fr) 34px; }
.goal-message.is-owner .goal-message__avatar { grid-column: 2; grid-row: 1; }
.goal-message.is-owner .goal-message__body { grid-column: 1; grid-row: 1; background: var(--bz-purple-soft); border-color: var(--bz-border-brand); }
.goal-message__avatar { width: 34px; height: 34px; display: grid; place-items: center; overflow: hidden; border-radius: 50%; color: var(--bz-purple-100); background: var(--bz-raised); border: 1px solid var(--bz-border); }
.goal-message__avatar span { font-size: 18px; }
.goal-message__avatar img { width: 100%; height: 100%; object-fit: cover; }
.goal-message__avatar.is-owner { color: var(--bz-fg); background: var(--bz-purple-500); }
.goal-message__body { position: relative; padding: var(--bz-space-3) var(--bz-space-4); background: var(--bz-card); border: 1px solid var(--bz-border); border-radius: 18px 18px 18px 6px; box-shadow: var(--bz-elev-1); }
.goal-message.is-owner .goal-message__body { border-radius: 18px 18px 6px 18px; }
.goal-message__body p { margin: var(--bz-space-2) 0 0; color: var(--bz-fg-mid); line-height: 1.55; white-space: pre-wrap; }
.goal-message.is-error .goal-message__body { border-color: var(--bz-danger); background: var(--bz-danger-soft); }
.goal-message.is-error .goal-message__avatar { color: var(--bz-danger); border-color: var(--bz-danger); }
.goal-message__meta { display: flex; align-items: center; gap: var(--bz-space-2); color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.goal-message__meta strong { color: var(--bz-fg); font-size: var(--bz-size-meta); font-weight: 400; }
.goal-message__status { padding: 2px 6px; border-radius: 8px; background: var(--bz-raised); text-transform: capitalize; }
.goal-message__model { color: var(--bz-fg-low); font-size: 10px; }
.goal-message__work { display: grid; gap: 1px; margin-top: var(--bz-space-3); overflow: hidden; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-panel); }
.goal-message__progress { display: grid; grid-template-columns: auto minmax(80px, 1fr); align-items: center; gap: var(--bz-space-3); padding: 8px 10px; color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.goal-message__progress-track { height: 4px; overflow: hidden; border-radius: 2px; background: var(--bz-raised); }
.goal-message__progress-track i { display: block; height: 100%; background: var(--bz-emerald-500); transition: width 220ms var(--bz-ease-out); }
.goal-message__task { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: var(--bz-space-2); width: 100%; padding: 8px 10px; color: var(--bz-fg-mid); text-align: left; background: var(--bz-card); border: 0; border-top: 1px solid var(--bz-border); cursor: pointer; font: 400 var(--bz-size-meta)/1.3 var(--bz-font-body); }
.goal-message__task:hover { color: var(--bz-fg); background: var(--bz-raised); }
.goal-message__task .material-symbols-outlined { color: var(--bz-purple-100); font-size: 17px; }
.goal-message__task small { color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.goal-message__work-toggle { display: flex; align-items: center; justify-content: center; gap: var(--bz-space-1); min-height: 32px; border: 0; border-top: 1px solid var(--bz-border); background: var(--bz-panel); color: var(--bz-purple-100); cursor: pointer; font: 400 var(--bz-size-micro)/1 var(--bz-font-body); }
.goal-message__work-toggle .material-symbols-outlined { font-size: 16px; }
.goal-message__link { display: inline-flex; align-items: center; gap: var(--bz-space-1); margin-top: var(--bz-space-3); padding: 0; color: var(--bz-purple-100); background: none; border: 0; cursor: pointer; font: inherit; }
.goal-message__link span { font-size: 16px; }
.goal-message__pulse { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; overflow: hidden; background: var(--bz-gradient-brand); animation: bz-gradient-sweep 1.6s linear infinite; }
.goal-message.is-new:not(.is-owner) { animation: goal-message-from-left 280ms var(--bz-ease-out) both; }
.goal-message.is-new.is-owner { animation: goal-message-from-right 280ms var(--bz-ease-out) both; }
@keyframes goal-message-from-left { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: translateX(0); } }
@keyframes goal-message-from-right { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
.goal-room__scroll-bottom { position: absolute; right: var(--bz-space-6); bottom: 154px; z-index: 3; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--bz-border-strong); border-radius: 50%; background: var(--bz-raised); color: var(--bz-fg); box-shadow: var(--bz-shadow-lg); cursor: pointer; }
.goal-room__suggestions { display: flex; gap: var(--bz-space-2); padding: 0 var(--bz-space-6) var(--bz-space-3); overflow-x: auto; }
.goal-room__suggestions button { flex: 0 0 auto; padding: 7px 10px; color: var(--bz-fg-mid); background: transparent; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); cursor: pointer; font: 400 var(--bz-size-meta)/1.2 var(--bz-font-body); }
.goal-room__suggestions button:hover { color: var(--bz-fg); border-color: var(--bz-border-strong); background: var(--bz-raised); }
.goal-composer { margin: 0 var(--bz-space-6) var(--bz-space-5); background: var(--bz-card); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-sm); overflow: hidden; }
.goal-composer:focus-within { border-color: var(--bz-border-brand); box-shadow: var(--bz-elev-brand); }
.goal-composer textarea { width: 100%; min-height: 76px; resize: none; padding: var(--bz-space-4); color: var(--bz-fg); background: transparent; border: 0; outline: 0; font: 400 15px/1.5 var(--bz-font-body); box-sizing: border-box; }
.goal-composer textarea::placeholder { color: var(--bz-fg-low); }
.goal-composer__error { margin: 0; padding: var(--bz-space-2) var(--bz-space-4); border-bottom: 1px solid var(--bz-danger); background: var(--bz-danger-soft); color: var(--bz-fg); font-size: var(--bz-size-meta); }
.goal-composer__footer { display: flex; justify-content: space-between; align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-2); border-top: 1px solid var(--bz-border); }
.goal-composer__footer > span { display: flex; align-items: center; gap: var(--bz-space-1); padding-left: var(--bz-space-2); color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.goal-composer__footer > span span { font-size: 15px; color: var(--bz-emerald-500); }
.goal-composer__send { min-height: 36px; padding: 0 var(--bz-space-3); font-size: var(--bz-size-meta); white-space: nowrap; }
.goal-room__context { min-width: 0; overflow-y: auto; background: var(--bz-panel); border-left: 1px solid var(--bz-border); }
.goal-room__context > section { padding: var(--bz-space-5); border-bottom: 1px solid var(--bz-border); }
.goal-room__section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-2); margin-bottom: var(--bz-space-4); }
.goal-room__section-head h3 { margin: 0; color: var(--bz-fg); font-size: 15px; font-weight: 400; }
.goal-room__section-head button { padding: 0; color: var(--bz-purple-100); background: none; border: 0; cursor: pointer; font-size: var(--bz-size-meta); }
.goal-room__attention article { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-2); padding: var(--bz-space-3) 0; border-top: 1px solid var(--bz-border); }
.goal-room__attention article > div:first-child { display: grid; gap: 2px; min-width: 0; }
.goal-room__attention article strong { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.goal-room__attention article span, .goal-room__clear { color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.goal-room__approval-actions { display: flex; gap: var(--bz-space-1); }
.goal-room__outcomes dl { margin: 0; display: grid; gap: var(--bz-space-3); }
.goal-room__outcomes dl div { display: flex; justify-content: space-between; gap: var(--bz-space-3); }
.goal-room__outcomes dt { color: var(--bz-fg-low); font-size: var(--bz-size-meta); }
.goal-room__outcomes dd { margin: 0; color: var(--bz-fg); font: 400 var(--bz-size-meta)/1.2 var(--bz-font-mono); }
.goal-room__team ul { display: grid; gap: var(--bz-space-3); margin: 0; padding: 0; list-style: none; }
.goal-room__team li { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: start; gap: var(--bz-space-3); padding: var(--bz-space-3) 0; border-top: 1px solid var(--bz-border); }
.goal-room__member-avatar { width: 28px; height: 28px; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--bz-border); border-radius: 50%; background: var(--bz-raised); color: var(--bz-fg-low); }
.goal-room__member-avatar img { width: 100%; height: 100%; object-fit: cover; }
.goal-room__member-avatar span { font-size: 16px; }
.goal-room__member-copy { display: grid; gap: 5px; min-width: 0; margin: 0; }
.goal-room__member-copy div { display: grid; grid-template-columns: 58px minmax(0, 1fr); align-items: center; gap: var(--bz-space-2); }
.goal-room__member-copy dt { color: var(--bz-fg-low); font-size: 10px; text-transform: uppercase; }
.goal-room__member-copy dd { min-width: 0; margin: 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); overflow-wrap: anywhere; }
.goal-room__model-download { display: inline-flex; align-items: center; gap: 3px; padding: 3px 6px; border: 1px solid var(--bz-border-brand); border-radius: var(--bz-r-sm); background: var(--bz-purple-soft); color: var(--bz-purple-100); font: 400 10px/1 var(--bz-font-body); cursor: pointer; }
.goal-room__model-download .material-symbols-outlined { font-size: 13px; }
.goal-room__model-ready { color: var(--bz-emerald-500); font-size: var(--bz-size-micro); }
@media (max-width: 1100px) { .goal-room { grid-template-columns: minmax(0, 1fr); } .goal-room__context { display: none; } }
</style>
