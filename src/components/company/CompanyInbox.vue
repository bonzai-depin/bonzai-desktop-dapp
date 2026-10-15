<template>
  <section class="inbox-workspace company-screen" data-i18n-skip>
    <nav v-if="!workflowMode" class="intake-tabs"><button class="bz-btn" :aria-pressed="!intakeOpen" @click="intakeOpen=false">{{ ui('Review queue') }}</button><button class="bz-btn" :aria-pressed="intakeOpen" @click="intakeOpen=true">{{ i18n.state.locale==='fr'?'Fichiers et emails':ui('Files & email') }}<span v-if="intakeReviewCount" class="bz-metric intake-count">{{ intakeReviewCount }}</span></button></nav>
    <p v-if="intakeError" class="inbox-error" role="alert">{{ ui(intakeError) }}</p>
    <CompanyIntake v-if="intakeOpen" :key="charter.id" :company-id="charter.id" @open-tools="$emit('open-tools')" />
    <template v-else>
    <header class="inbox-toolbar">
      <span class="inbox-toolbar__count"
        ><b class="bz-metric">{{ pendingCount }}</b
        >{{ ui("Awaiting review") }}</span
      >
      <p v-if="workflowMode" class="inbox-purpose">{{ ui('Review saved results and requests for permission. Your workflow waits for your decision.') }}</p>
      <button v-else class="bz-btn bz-btn--primary" @click="intakeOpen=true"><span class="material-symbols-outlined">upload_file</span>{{ ui('Import document') }}</button>
    </header>
    <div class="inbox-layout" :class="{ 'is-empty': !hasQueueContent }">
      <aside v-if="hasQueueContent" class="inbox-queue" :aria-label="ui('Review queue')">
        <div class="inbox-queue__filters">
          <label class="inbox-search"
            ><span class="material-symbols-outlined" aria-hidden="true"
              >search</span
            ><input
              v-model="query"
              :aria-label="ui(workflowMode ? 'Search reviews' : 'Search inbox')"
              :placeholder="ui(workflowMode ? 'Search reviews' : 'Search inbox')"
              :disabled="busy"
          /></label>
          <select
            v-model="category"
            :aria-label="ui('Filter inbox')"
            :disabled="busy"
          >
            <option value="all">{{ ui("All items") }}</option>
            <option value="approval">{{ ui("Approvals") }}</option>
            <option v-if="workflowMode" value="result">{{ ui('Results') }}</option>
            <option v-if="maintenance" value="document">
              {{ ui("Documents") }}
            </option>
            <option v-if="maintenance" value="message">
              {{ ui("Messages") }}
            </option>
          </select>
          <label v-if="maintenance" class="inbox-history">
            <input
              v-model="history"
              type="checkbox"
              role="switch"
              :aria-checked="history"
              :disabled="busy"
            />
            <span class="inbox-history__track" aria-hidden="true"></span>
            <span>{{ ui("Afficher les messages envoyés") }}</span>
          </label>
        </div>
        <div class="inbox-queue__items">
          <button v-if="intakeReviewCount && category === 'all'" class="inbox-item" type="button" @click="intakeOpen=true"><span class="material-symbols-outlined inbox-item__icon" aria-hidden="true">upload_file</span><span class="inbox-item__copy"><strong>{{ ui('Files & email') }}</strong><span>{{ ui('Needs your attention') }} · {{ intakeReviewCount }}</span></span></button>
          <button
            v-for="item in filtered.slice(0, limit)"
            :key="item.key"
            type="button"
            class="inbox-item"
            :aria-current="selected?.key === item.key ? 'true' : undefined"
            :disabled="busy"
            @click="selectedKey = item.key"
          >
            <span
              class="inbox-item__icon material-symbols-outlined"
              aria-hidden="true"
              >{{ icon(item.kind) }}</span
            >
            <span class="inbox-item__copy"
              ><span class="inbox-item__type"
                >{{ kindLabel(item.kind)
                }}<time v-if="item.timestamp">{{
                  date(item.timestamp)
                }}</time></span
              ><strong>{{ item.title }}</strong
              ><span class="inbox-item__summary">{{ item.subtitle }}</span
              ><span
                class="inbox-item__status"
                :class="{
                  'is-error': ['failed', 'unknown'].includes(
                    item.record.status,
                  ),
                }"
                >{{ item.status }}</span
              ></span
            >
          </button>
          <button
            v-if="filtered.length > limit"
            class="bz-btn bz-btn--ghost"
            @click="limit += 40"
          >
            {{ ui("Load more") }}
          </button>
        </div>
      </aside>
      <article
        v-if="selected"
        class="inbox-detail"
        :aria-label="ui('Review details')"
      >
        <header class="inbox-detail__head">
          <div class="inbox-detail__kind">
            <span class="material-symbols-outlined" aria-hidden="true">{{
              icon(selected.kind)
            }}</span
            >{{ kindLabel(selected.kind)
            }}<span
              class="inbox-detail__status"
              :class="{
                'is-error': ['failed', 'unknown'].includes(
                  selected.record.status,
                ),
              }"
              >{{ selected.status }}</span
            >
          </div>
          <h2>{{ selected.title }}</h2>
          <p v-if="selected.kind === 'approval'">
            {{ roleName(selected.record.role) }} · {{ charter.name }}
          </p>
          <p v-else-if="selected.record.workOrderId">
            {{ workOrderLabel(selected.record.workOrderId) }}
          </p>
        </header>
        <div class="inbox-detail__body">
          <template v-if="selected.kind === 'result'">
            <p class="inbox-detail__hint">{{ ui('Open this task to preview its saved files and approve the result.') }}</p>
            <ul class="inbox-result-files">
              <li v-for="result in selected.results" :key="result.id"><span class="material-symbols-outlined" aria-hidden="true">{{ resultIcon(result.pipeline) }}</span><span>{{ result.meta?.title || result.prompt || ui('Saved result') }}</span></li>
            </ul>
            <p v-if="!selected.results.length" class="inbox-detail__hint">{{ ui('Saved files are available in the task review.') }}</p>
          </template>
          <template v-else-if="selected.kind === 'approval'">
            <dl class="inbox-fields">
              <div v-for="(field, index) in selected.fields" :key="index">
                <dt>{{ field.label }}</dt>
                <dd><CompanyMarkdown :source="field.value" /></dd>
              </div>
            </dl>
            <button
              v-if="approvalTarget"
              type="button"
              class="bz-btn bz-btn--ghost"
              @click="$emit('open-operational-record', approvalTarget)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">{{
                approvalTarget.kind === "invoice"
                  ? "receipt_long"
                  : approvalTarget.kind === "purchaseRequest"
                    ? "shopping_bag"
                    : "mail"
              }}</span>
              {{ approvalRecordLabel(approvalTarget, i18n.state.locale) }}
              <span class="material-symbols-outlined" aria-hidden="true"
                >arrow_forward</span
              >
            </button>
            <details class="inbox-technical">
              <summary>{{ ui("Exact action") }}</summary>
              <CompanyArtifactPreview
                :row="{
                  pipeline: 'text',
                  meta: { format: 'json' },
                  payload: selected.record.action,
                }"
              />
            </details>
          </template>
          <template v-else-if="selected.kind === 'document'">
            <p class="inbox-detail__hint">
              {{ ui("Check extracted fields and link the document.") }}
            </p>
            <CompanyMarkdown
              v-if="selected.record.extractedText"
              :source="selected.record.extractedText"
            />
            <p v-else class="inbox-detail__hint">
              {{ ui("Open the document to review its extracted fields.") }}
            </p>
          </template>
          <template v-else>
            <dl class="inbox-fields">
              <div v-if="selected.record.recipient">
                <dt>{{ ui("Recipient") }}</dt>
                <dd>{{ selected.record.recipient }}</dd>
              </div>
              <div>
                <dt>{{ ui("Channel") }}</dt>
                <dd>
                  {{ selected.record.channel === "sms" ? "SMS" : ui("Email") }}
                </dd>
              </div>
              <div v-if="selected.record.providerId">
                <dt>{{ ui("Receipt") }}</dt>
                <dd>{{ selected.record.providerId }}</dd>
              </div>
            </dl>
            <CompanyMarkdown
              :source="selected.record.body || selected.record.message || ''"
            />
          </template>
          <p v-if="selected.record.error" class="inbox-error" role="status">
            {{ selected.record.error }}
          </p>
          <p
            v-if="selected.record.status === 'unknown'"
            class="inbox-detail__hint"
          >
            {{
              ui("Verify the delivery receipt before attempting another send.")
            }}
          </p>
        </div>
        <footer class="inbox-detail__actions">
          <p v-if="error" class="inbox-error" role="alert">{{ error }}</p>
          <template v-if="selected.kind === 'approval'">
            <label v-if="rejecting" class="inbox-reason"
              >{{ ui("Reason for rejection (optional)")
              }}<textarea v-model="reason" rows="3" :disabled="busy" />
            </label>
            <div v-if="rejecting">
              <button
                type="button"
                class="bz-btn bz-btn--destructive"
                :disabled="busy"
                @click="decide(false)"
              >
                {{ ui("Confirm rejection") }}</button
              ><button
                type="button"
                class="bz-btn bz-btn--ghost"
                :disabled="busy"
                @click="rejecting = false"
              >
                {{ ui("Cancel") }}
              </button>
            </div>
            <div v-else>
              <button
                type="button"
                class="bz-btn bz-btn--primary"
                :disabled="busy"
                @click="decide(true)"
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  >check</span
                >{{ busy ? ui("Saving…") : ui("Approve") }}</button
              ><button
                type="button"
                class="bz-btn bz-btn--ghost"
                :disabled="busy"
                @click="rejecting = true"
              >
                {{ ui("Reject") }}
              </button>
            </div>
          </template>
          <button v-else-if="selected.kind === 'result'" type="button" class="bz-btn bz-btn--primary" @click="$emit('open-workflow-result', selected.record)">{{ ui('Review results') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
          <button
            v-else
            type="button"
            class="bz-btn bz-btn--primary"
            @click="$emit('review', { kind: selected.kind, id: selected.id })"
          >
            {{
              ui(
                selected.kind === "document"
                  ? "Review document"
                  : selected.kind === "notification"
                    ? "Prepare message"
                    : "Open message",
              )
            }}<span class="material-symbols-outlined" aria-hidden="true"
              >arrow_forward</span
            >
          </button>
        </footer>
      </article>
      <div v-else class="inbox-empty">
        <span class="material-symbols-outlined" aria-hidden="true">inbox</span>
        <h2>
          {{
            ui(
              query || category !== "all"
                ? "No matching items."
                : "Nothing awaiting review.",
            )
          }}
        </h2>
        <p>
          {{
            ui(
              workflowMode ? 'Finished results and permission requests will appear here. Start or continue a task in your workflow.' : "Approval requests, incoming documents and message drafts appear here.",
            )
          }}
        </p>
        <button v-if="workflowMode && !query && category === 'all'" type="button" class="bz-btn bz-btn--ghost" @click="$emit('open-view', 'studio')">{{ ui('Open workflow') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
        <button
          v-if="query || category !== 'all'"
          class="bz-btn bz-btn--ghost"
          @click="
            query = '';
            category = 'all';
          "
        >
          {{ ui("Clear filters") }}
        </button>
      </div>
    </div>
    </template>
  </section>
</template>
<script setup>
import "./company-design.css";
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import CompanyIntake from "./CompanyIntake.vue";
const intakeOpen=ref(false);
defineExpose({ openIntake: () => { if (!workflowMode.value) intakeOpen.value = true; } });
import CompanyMarkdown from "./CompanyMarkdown.vue";
import CompanyArtifactPreview from "./CompanyArtifactPreview.vue";
import {
  approvalRecordTarget,
  approvalRecordLabel,
} from "../../services/company/approvalRecord.js";
import { inboxItems } from "../../services/company/inboxPresentation.js";
import { workflowReviewApprovals, workflowReviewItems } from '../../services/company/workflowReview.js';
import { i18n } from "../../i18n/index.js";
import { operationText } from "../../i18n/operations.js";
const props = defineProps({
  state: { type: Object, required: true },
  charter: { type: Object, required: true },
  store: { type: Object, required: true },
  maintenance: Boolean,
  roleName: { type: Function, default: (role) => role || "" },
});
defineEmits(["review", "open-tools", "open-operational-record", "open-view", "open-workflow-result"]);
const workflowMode = computed(() => !!props.charter.workspace?.executionWorkflowId);
const ui = (text) => operationText(text, i18n.state.locale);
const intakeReviewCount=ref(0), intakeError=ref("");
async function refreshIntakeCount(){
 if(workflowMode.value){intakeReviewCount.value=0;intakeError.value='';return;}
 const id=props.charter.id;
 try{const data=await window.electronAPI?.db?.companyIntake?.snapshot(id,{limit:1});if(id===props.charter.id){intakeReviewCount.value=data?.counts?.find(c=>c.status==='review')?.count||0;intakeError.value='';}}
 catch(e){if(id===props.charter.id)intakeError.value=e.message;}
}
let stopIntakeCount;
onMounted(()=>{refreshIntakeCount();stopIntakeCount=window.electronAPI?.db?.companyIntake?.onChanged?.(e=>{if(e.companyId===props.charter.id)refreshIntakeCount();});});
onUnmounted(()=>stopIntakeCount?.());
watch(()=>props.charter.id,refreshIntakeCount);
const query = ref(""),
  category = ref("all"),
  history = ref(false),
  selectedKey = ref(""),
  limit = ref(40),
  busy = ref(false),
  error = ref(""),
  rejecting = ref(false),
  reason = ref("");
const items = computed(() =>
  workflowMode.value ? [...workflowReviewItems(props.state, props.charter).map(item=>({...item,status:ui(item.status)})), ...inboxItems({ ...props.state, approvals: workflowReviewApprovals(props.state, props.charter) }, i18n.state.locale, false).filter(item=>item.kind==='approval')]
    : inboxItems(props.state, i18n.state.locale, history.value),
);
const hasQueueContent = computed(() => workflowMode.value ? items.value.length > 0 : !!intakeReviewCount.value || inboxItems(props.state, i18n.state.locale, true).length > 0);
const pendingCount = computed(
  () => items.value.filter((item) => item.pending).length + intakeReviewCount.value,
);
const filtered = computed(() =>
  items.value.filter(
    (item) =>
      (category.value === "all" ||
        item.kind === category.value ||
        (category.value === "message" && item.kind === "notification")) &&
      `${item.title} ${item.subtitle}`
        .toLocaleLowerCase()
        .includes(query.value.trim().toLocaleLowerCase()),
  ),
);
const selected = computed(
  () =>
    filtered.value.find((item) => item.key === selectedKey.value) ||
    filtered.value[0],
);
const approvalTarget = computed(() =>
  selected.value?.kind === "approval"
    ? approvalRecordTarget(selected.value.record.action)
    : null,
);
watch([query, category], () => {
  limit.value = 40;
});
watch(
  () => selected.value?.key,
  () => {
    error.value = "";
    rejecting.value = false;
    reason.value = "";
  },
);
const icon = (kind) =>
  ({
    approval: "approval",
    document: "description",
    message: "mail",
    notification: "notifications",
    result: 'fact_check',
  })[kind];
const kindLabel = (kind) =>
  ui(
    {
      approval: "Approval",
      document: "Document",
      message: "Message",
      notification: "Notification",
      result: 'Result',
    }[kind],
  );
const resultIcon = pipeline => ({image:'image',audio:'headphones',music:'music_note',video:'movie',text:'description',code:'code','3d':'view_in_ar'})[pipeline] || 'draft';
const date = (value) =>
  new Date(value).toLocaleDateString(i18n.state.locale, {
    month: "short",
    day: "numeric",
  });
const workOrderLabel = (id) => {
  const order = props.state.gmao?.workOrders?.find((row) => row.id === id);
  return order
    ? `${order.workOrderNumber || order.clientOiNumber || ""} · ${order.title}`
    : id;
};
async function decide(approved) {
  if (busy.value || selected.value?.kind !== "approval") return;
  const id = selected.value.id;
  busy.value = true;
  error.value = "";
  try {
    if (approved) await props.store.approve(id);
    else await props.store.reject(id, reason.value.trim());
  } catch (e) {
    error.value = e.message || String(e);
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.inbox-purpose{color:var(--bz-fg-mid);font:400 14px/1.6 var(--bz-font-body);max-width:64ch;margin:0}
.inbox-result-files{list-style:none;padding:0;display:grid;gap:12px}.inbox-result-files li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--bz-border)}.inbox-result-files li>span:last-child{overflow-wrap:anywhere;min-width:0}
.intake-tabs{display:flex;gap:8px;margin:0 0 24px;flex-wrap:wrap}.intake-tabs .bz-btn[aria-pressed=true]{border-color:var(--bz-accent);background:var(--bz-panel)}
.intake-count{padding:2px 8px;border-radius:6px;background:var(--bz-panel);line-height:1.3}
.inbox-workspace {
  min-width: 0;
}
.inbox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
  flex-wrap: wrap;
  margin-bottom: var(--bz-space-5);
}
.inbox-toolbar__count {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  font: 400 var(--bz-size-meta)/1.4 var(--bz-font-body);
  color: var(--bz-fg-mid);
}
.inbox-toolbar b {
  font-size: 32px;
  line-height: 1;
  color: var(--bz-fg);
}
.inbox-toolbar > div {
  display: flex;
  gap: var(--bz-space-2);
}
.inbox-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}
.inbox-toolbar label:focus-within {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.inbox-toolbar label:has(input:disabled) {
  cursor: not-allowed;
  color: var(--bz-fg-mid);
  background: var(--bz-raised);
  border-color: var(--bz-border);
}
.inbox-layout {
  display: grid;
  grid-template-columns: minmax(300px, 32%) minmax(0, 1fr);
  gap: var(--bz-space-6);
  align-items: start;
}
.inbox-queue {
  min-width: 0;
}
.inbox-queue__filters {
  display: grid;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-5);
}
.inbox-search {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  min-height: 44px;
  padding: 10px var(--bz-space-4);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  transition:
    border-color var(--bz-dur-fast),
    background var(--bz-dur-fast);
}
.inbox-search:focus-within {
  border-color: var(--bz-accent);
  outline: 2px solid var(--bz-border-brand);
  outline-offset: 2px;
}
.inbox-search span {
  font-size: 20px;
  color: var(--bz-fg-mid);
}
.inbox-search input {
  min-width: 0;
  width: 100%;
  font: 400 var(--bz-size-body)/1.5 var(--bz-font-body);
  color: var(--bz-fg);
  background: transparent;
  border: 0;
  outline: 0;
}
.inbox-search input::placeholder {
  color: var(--bz-fg-mid);
}
.inbox-queue select {
  font: 400 var(--bz-size-meta)/1.5 var(--bz-font-body);
  color: var(--bz-fg);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  min-height: 40px;
  padding: var(--bz-space-2) var(--bz-space-4);
  background: var(--bz-panel);
  width: 100%;
}
.inbox-history {
  position: relative;
  display: flex;
  gap: var(--bz-space-3);
  align-items: center;
  min-height: 44px;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1.5;
  padding: var(--bz-space-1) 0;
  cursor: pointer;
}
.inbox-history input {
  position: absolute;
  width: 40px;
  height: 24px;
  margin: 0;
  opacity: 0;
  z-index: 1;
  cursor: inherit;
}
.inbox-history__track {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 24px;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-pill);
  background: var(--bz-raised);
  transition:
    background var(--bz-dur-fast),
    border-color var(--bz-dur-fast);
}
.inbox-history__track::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--bz-fg-mid);
  transition:
    transform var(--bz-dur-fast) var(--bz-ease-out),
    background var(--bz-dur-fast);
}
.inbox-history input:checked + .inbox-history__track {
  border-color: var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}
.inbox-history input:checked + .inbox-history__track::after {
  transform: translateX(16px);
  background: var(--bz-control-selected-fg);
}
.inbox-history input:focus-visible + .inbox-history__track {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.inbox-history:has(input:disabled) {
  cursor: not-allowed;
}
.inbox-history input:disabled + .inbox-history__track {
  opacity: 0.55;
}
.inbox-queue__items {
  display: grid;
  gap: var(--bz-space-2);
  max-height: 68dvh;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--bz-border-strong) transparent;
  padding: 3px;
  margin: -3px;
}
.inbox-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4);
  border: 1px solid transparent;
  border-radius: var(--bz-r);
  background: transparent;
  color: var(--bz-fg);
  text-align: left;
  cursor: pointer;
  min-width: 0;
  width: 100%;
  transition:
    background var(--bz-dur-fast),
    border-color var(--bz-dur-fast);
}
.inbox-item::before {
  position: absolute;
  content: "";
  left: -1px;
  top: 20px;
  bottom: 20px;
  width: 3px;
  border-radius: var(--bz-r-pill);
  background: transparent;
  transition: background var(--bz-dur-fast);
}
.inbox-item:hover:not(:disabled) {
  background: var(--bz-panel);
  border-color: var(--bz-border);
}
.inbox-item[aria-current] {
  background: var(--bz-accent-soft);
  border-color: var(--bz-border-brand);
}
.inbox-item[aria-current]::before {
  background: var(--bz-accent);
}
.inbox-item:disabled {
  cursor: wait;
}
.inbox-item__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  font-size: 20px;
  color: var(--bz-fg-mid);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}
.inbox-item[aria-current] .inbox-item__icon {
  color: var(--bz-accent);
  border-color: var(--bz-border-brand);
  background: var(--bz-accent-soft);
}
.inbox-item__copy {
  display: grid;
  gap: var(--bz-space-2);
  min-width: 0;
  flex: 1;
}
.inbox-item strong {
  font: 400 15px/1.45 var(--bz-font-body);
  color: var(--bz-fg);
  overflow-wrap: anywhere;
}
.inbox-item__type {
  display: flex;
  justify-content: space-between;
  gap: var(--bz-space-2);
  font-size: var(--bz-size-micro);
  line-height: 1.4;
  color: var(--bz-fg-mid);
}
.inbox-item__type time {
  flex-shrink: 0;
}
.inbox-item__summary {
  font-size: var(--bz-size-meta);
  line-height: 1.5;
  color: var(--bz-fg-mid);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inbox-item__status {
  justify-self: start;
  font-size: var(--bz-size-micro);
  line-height: 1.5;
  color: var(--bz-fg-mid);
}
.inbox-item__status.is-error,
.inbox-detail__status.is-error {
  color: var(--bz-danger);
}
.inbox-detail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 540px;
  background: var(--bz-card);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-lg);
  overflow: hidden;
}
.inbox-detail__head {
  padding: var(--bz-space-6);
  border-bottom: 1px solid var(--bz-border);
}
.inbox-detail__kind {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bz-space-2);
  font-size: var(--bz-size-meta);
  line-height: 1.5;
  color: var(--bz-fg-mid);
}
.inbox-detail__status {
  margin-left: auto;
  padding: var(--bz-space-1) var(--bz-space-2);
  border: 1px solid var(--bz-border);
  background: var(--bz-panel);
  border-radius: var(--bz-r-pill);
  font-size: var(--bz-size-micro);
}
.inbox-detail__kind .material-symbols-outlined {
  font-size: 19px;
}
.inbox-detail h2 {
  font: 400 clamp(22px, 1.8vw, 26px)/1.3 var(--bz-font-body);
  margin: var(--bz-space-5) 0 var(--bz-space-3);
  text-wrap: balance;
  overflow-wrap: anywhere;
  color: var(--bz-fg);
}
.inbox-detail__head p {
  margin: 0;
  font-size: var(--bz-size-meta);
  line-height: 1.5;
  color: var(--bz-fg-mid);
}
.inbox-detail__body {
  padding: var(--bz-space-6);
  overflow-wrap: anywhere;
  min-width: 0;
}
.inbox-fields {
  display: grid;
  gap: var(--bz-space-4);
  margin: 0 0 var(--bz-space-5);
}
.inbox-fields > div {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: var(--bz-space-5);
}
.inbox-fields dt {
  font-size: var(--bz-size-meta);
  line-height: 1.6;
  color: var(--bz-fg-mid);
  padding-top: 3px;
}
.inbox-fields dd {
  margin: 0;
  min-width: 0;
  font-size: var(--bz-size-body);
  line-height: 1.65;
  color: var(--bz-fg);
}
.inbox-fields dd :deep(.company-markdown) {
  font-size: var(--bz-size-body);
}
.inbox-detail__hint {
  font-size: var(--bz-size-meta);
  line-height: 1.65;
  color: var(--bz-fg-mid);
  margin: 0 0 var(--bz-space-5);
}
.inbox-technical {
  margin-top: var(--bz-space-5);
  padding-top: var(--bz-space-5);
  border-top: 1px solid var(--bz-border);
}
.inbox-technical summary {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
  cursor: pointer;
  line-height: 1.5;
  padding: var(--bz-space-1) 0;
}
.inbox-technical[open] summary {
  margin-bottom: var(--bz-space-4);
}
.inbox-detail__actions {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: var(--bz-space-4);
  padding: var(--bz-space-5) var(--bz-space-6);
  border-top: 1px solid var(--bz-border);
  background: var(--bz-panel);
  margin-top: auto;
}
.inbox-detail__actions > div {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.inbox-reason {
  display: grid;
  gap: var(--bz-space-2);
  width: 100%;
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
}
.inbox-reason textarea {
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border-strong);
  background: var(--bz-card);
  color: var(--bz-fg);
  border-radius: var(--bz-r);
  font: inherit;
  line-height: 1.6;
  resize: vertical;
}
.inbox-error {
  color: var(--bz-danger);
  font-size: var(--bz-size-meta);
  line-height: 1.6;
  overflow-wrap: anywhere;
  margin: 0;
}
.inbox-empty {
  min-height: 440px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
  padding: var(--bz-space-7);
  color: var(--bz-fg-mid);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  background: var(--bz-panel);
}
.inbox-empty > span {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  font-size: 28px;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-lg);
}
.inbox-empty h2 {
  font: 400 20px/1.4 var(--bz-font-body);
  color: var(--bz-fg);
  margin: var(--bz-space-5) 0 var(--bz-space-2);
}
.inbox-empty p {
  font-size: var(--bz-size-body);
  line-height: 1.65;
  max-width: 36ch;
  margin: 0 0 var(--bz-space-5);
}
.inbox-workspace
  :is(button, select, textarea, summary, input[type="checkbox"]):focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
@media (max-width: 1000px) {
  .inbox-layout {
    grid-template-columns: minmax(260px, 35%) minmax(0, 1fr);
    gap: var(--bz-space-5);
  }
  .inbox-detail__head,
  .inbox-detail__body,
  .inbox-detail__actions {
    padding: var(--bz-space-5);
  }
  .inbox-fields > div {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--bz-space-1);
  }
}
@media (max-width: 700px) {
  .inbox-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .inbox-queue__items {
    max-height: 300px;
  }
  .inbox-detail {
    min-height: 360px;
  }
  .inbox-toolbar {
    gap: var(--bz-space-3);
  }
  .inbox-toolbar > div {
    flex-wrap: wrap;
  }
  .inbox-detail h2 {
    font-size: 22px;
  }
  .inbox-detail__head,
  .inbox-detail__body,
  .inbox-detail__actions {
    padding: 20px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .inbox-search,
  .inbox-item,
  .inbox-item::before,
  .inbox-history__track,
  .inbox-history__track::after {
    transition: none;
  }
}
</style>
