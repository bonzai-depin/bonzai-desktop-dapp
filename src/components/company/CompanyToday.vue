<script setup>
import "./company-design.css";
import { computed } from "vue";
import { i18n } from "../../i18n/index.js";
import { reviewCount } from "../../services/company/workspaceNavigation.js";
import { formatRoleTitle } from "../../services/company/presentation.js";
import { visibleText } from "../../shared/visibleText.js";
import CompanyMetricStrip from "./CompanyMetricStrip.vue";
const props = defineProps({
  state: { type: Object, required: true },
  charter: { type: Object, required: true },
  views: { type: Array, default: () => [] },
});
const missionPreview = computed(() => visibleText(props.charter.mission || '')
  .split(/(?<=[.!?])\s+/)
  .filter(sentence => !/\b\w+\.\w+\(|\b(?:team|records|grants|browser)\.[A-Za-z]/.test(sentence))
  .slice(0, 2).join(' '));
const workError = (item) => {
  const text = String(item.lastError || '');
  if (/Team not found|company not found/i.test(text)) return 'The linked team is unavailable. Review the task assignment.';
  if (/LLM did not return JSON|invalid.*JSON|Unexpected token/i.test(text)) return 'The model returned an unusable response. Open the task to review and retry.';
  return 'This task needs attention. Open it to review the details.';
};
defineEmits(["open-view", "open-result"]);
const work = computed(() => props.state.issues || []);
const active = computed(() =>
  work.value.filter((w) => w.status === "in_progress"),
);
const queued = computed(() => work.value.filter((w) => w.status === "open"));
const blocked = computed(() =>
  work.value.filter((w) => w.status === "blocked"),
);
const recent = computed(() =>
  work.value
    .filter((w) => w.status === "done")
    .sort(
      (a, b) =>
        (b.completedAt || b.updatedAt || 0) -
        (a.completedAt || a.updatedAt || 0),
    )
    .slice(0, 5),
);
const priorities = computed(() =>
  [...blocked.value, ...active.value, ...queued.value].slice(0, 10),
);
const destinations = computed(() =>
  props.views.filter(
    (v) =>
      !v.utility &&
      !["overview", "approvals", "deliverables", "getting-started"].includes(
        v.key,
      ),
  ),
);
const metrics = computed(() => [
  {
    id: "working",
    label: "Active work",
    value: active.value.length + queued.value.length,
    icon: "pending",
    action: true,
    target: { view: "issues", filter: "active" },
  },
  {
    id: "review",
    label: "Awaiting review",
    value: reviewCount(props.state),
    icon: "fact_check",
    tone: reviewCount(props.state) ? "warning" : null,
    action: true,
    target: "approvals",
  },
  {
    id: "blocked",
    label: "Blocked",
    value: blocked.value.length,
    icon: "error_outline",
    tone: blocked.value.length ? "danger" : null,
    action: true,
    target: { view: "issues", filter: "attention" },
  },
  {
    id: "done",
    label: "Completed work",
    value: work.value.filter((w) => w.status === "done").length,
    icon: "task_alt",
    action: true,
    target: "deliverables",
  },
]);
const statusLabel = (status) =>
  ({ blocked: "Blocked", open: "Queued", in_progress: "In progress" })[
    status
  ] || status;
</script>
<template>
  <section class="team-today company-screen" data-i18n-skip>
    <div class="today-brief">
      <div>
        <span class="company-caption">{{ $ui("Mission") }}</span>
        <p>{{ missionPreview }}</p>
      </div>
      <div class="company-actions">
        <button class="bz-btn" @click="$emit('open-view', 'intake')">
          <span class="material-symbols-outlined" aria-hidden="true"
            >upload_file</span
          >{{ $ui("Import document") }}</button
        ><button
          class="bz-btn bz-btn--primary"
          @click="$emit('open-view', 'command')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">add</span
          >{{ $ui("Give instructions") }}
        </button>
      </div>
    </div>
    <CompanyMetricStrip
      :items="metrics"
      @select="(item) => $emit('open-view', item.target)"
    />
    <div class="today-columns">
      <section class="today-work">
        <header class="company-section-title">
          <h2>{{ $ui("Next actions") }}</h2>
          <span class="company-caption"
            >{{ priorities.length }} /
            {{ active.length + blocked.length + queued.length }}</span
          >
        </header>
        <div v-if="!priorities.length" class="company-empty">
          <span class="material-symbols-outlined" aria-hidden="true"
            >task_alt</span
          >
          <h3>{{ $ui("No work in progress") }}</h3>
          <p>
            {{ $ui("Give the team a request or import a document to begin.") }}
          </p>
          <button class="bz-btn" @click="$emit('open-view', 'getting-started')">
            {{ $ui("Getting started")
            }}<span class="material-symbols-outlined" aria-hidden="true"
              >arrow_forward</span
            >
          </button>
        </div>
        <button
          v-for="item in priorities"
          :key="item.id"
          class="today-row"
          @click="$emit('open-result', item.id)"
        >
          <span
            class="today-row__icon material-symbols-outlined"
            :class="{ 'is-warning': item.status === 'blocked' }"
            aria-hidden="true"
            >{{
              item.status === "blocked"
                ? "error_outline"
                : item.status === "in_progress"
                  ? "pending"
                  : "radio_button_unchecked"
            }}</span
          >
          <span class="today-row__body"
            ><strong>{{ visibleText(item.title) }}</strong
            ><small>{{
              formatRoleTitle(item.assigneeRole, i18n.state.locale)
            }}</small
            ><span v-if="item.lastError" class="today-row__error">{{
              $ui(workError(item))
            }}</span></span
          >
          <span
            class="company-status"
            :class="{ 'is-warning': item.status === 'blocked' }"
            >{{ $ui(statusLabel(item.status)) }}</span
          ><span class="material-symbols-outlined" aria-hidden="true"
            >chevron_right</span
          >
        </button>
      </section>
      <aside class="today-aside">
        <section v-if="destinations.length">
          <header class="company-section-title">
            <h2>{{ $ui("Workspaces") }}</h2>
          </header>
          <button
            v-for="view in destinations"
            :key="view.key"
            class="today-shortcut"
            @click="$emit('open-view', view.key)"
          >
            <span class="material-symbols-outlined" aria-hidden="true">{{
              view.icon
            }}</span
            ><span>{{ $ui(view.label) }}</span
            ><span class="material-symbols-outlined" aria-hidden="true"
              >arrow_forward</span
            >
          </button>
        </section>
        <section>
          <header class="company-section-title">
            <h2>{{ $ui("Recent deliverables") }}</h2>
          </header>
          <button
            v-for="item in recent"
            :key="item.id"
            class="today-deliverable"
            @click="$emit('open-result', item.id)"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >description</span
            ><span>{{ visibleText(item.title) }}</span
            ><span class="material-symbols-outlined" aria-hidden="true"
              >arrow_forward</span
            >
          </button>
          <p v-if="!recent.length" class="company-muted">
            {{ $ui("Completed work and its evidence will appear here.") }}
          </p>
        </section>
      </aside>
    </div>
  </section>
</template>
<style scoped>
.today-brief {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  margin-bottom: 28px;
}
.today-brief > div:first-child {
  min-width: 0;
  max-width: 680px;
}
.today-brief p {
  font-size: 15px;
  line-height: 1.6;
  margin: 6px 0 0;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.today-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr);
  gap: 40px;
}
.today-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 20px 12px;
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--bz-border);
  color: var(--bz-fg);
  font: inherit;
  cursor: pointer;
  border-radius: var(--bz-r-sm);
}
.today-row:hover {
  background: var(--bz-raised);
}
.today-row__body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
}
.today-row__body strong {
  font-size: 15px;
  font-weight: 500;
}
.today-row__body small {
  font-size: 12px;
  color: var(--bz-fg-mid);
}
.today-row__error {
  font-size: 13px;
  color: var(--bz-warning);
}
.today-row > .material-symbols-outlined {
  font-size: 20px;
  color: var(--bz-fg-low);
}
.today-row__icon.is-warning {
  color: var(--bz-warning);
}
.today-aside {
  display: grid;
  gap: 32px;
  align-content: start;
  border-left: 1px solid var(--bz-border);
  padding-left: 32px;
}
.today-shortcut,
.today-deliverable {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--bz-border);
  padding: 16px 8px;
  background: transparent;
  color: var(--bz-fg);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.today-shortcut:hover,
.today-deliverable:hover {
  background: var(--bz-raised);
}
.today-shortcut > span:nth-child(2),
.today-deliverable > span:nth-child(2) {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.today-shortcut .material-symbols-outlined,
.today-deliverable .material-symbols-outlined {
  font-size: 20px;
  color: var(--bz-fg-mid);
}
@media (max-width: 900px) {
  .today-brief {
    align-items: start;
    flex-direction: column;
  }
  .today-columns {
    grid-template-columns: 1fr;
  }
  .today-aside {
    border-left: 0;
    border-top: 1px solid var(--bz-border);
    padding: 24px 0 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .today-aside {
    grid-template-columns: 1fr;
  }
  .today-row {
    gap: 10px;
    flex-wrap: wrap;
  }
  .today-row__body {
    flex-basis: 65%;
  }
  .today-row > .company-status {
    margin-left: 30px;
  }
}
</style>
