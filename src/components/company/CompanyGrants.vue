<script setup>
import "./company-design.css";
import CompanyMetricStrip from "./CompanyMetricStrip.vue";
import { useCompanyDraft } from "../../services/company/viewDrafts.js";
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import {
  GRANT_DOCUMENT_TYPES,
  GRANT_STAGES,
  GRANT_LABELS,
  GRANT_SCHEMES,
} from "../../services/company/grantsDomain.js";
import { documentBelongsToGrant, grantDocumentScope } from '../../services/company/grantDocuments.js';
import { i18n } from '../../i18n/index.js';
import CompanyWorkflowProgress from "./CompanyWorkflowProgress.vue";
import CompanyBrowserPanel from "./CompanyBrowserPanel.vue";
const props = defineProps({ companyId: { type: String, required: true } });
const emit = defineEmits(['open-intake']);
const attachmentDossierId = ref('');
const detailTab = ref('info'), savedDraft=ref(null);
const correction = ref({reference:'',request:'',dueDate:''});
const state = ref({ dossiers: [], documents: [], events: [] }),
  draft = ref(null),
  tab = ref("dossiers"),
  error = ref(""),
  busy = ref(false),
  query = ref(""),
  stageFilter = ref(""), page = ref(0), documentType = ref(""),
  payment = ref({id:"",reference:"",amountCents:0}),
  evidence = ref(""),
  evidenceDocumentId = ref(""),
  documentOwner = ref(""),
  validUntil = ref("");
useCompanyDraft(() => props.companyId + ':grants', {draft, savedDraft, tab, detailTab, evidence, evidenceDocumentId, payment, correction});
const hasUnsavedChanges = computed(() => !!draft.value?.id && !!savedDraft.value && JSON.stringify(savedDraft.value) !== JSON.stringify(draft.value));
async function openRecord(id) { await load(); const record=state.value.dossiers.find(d=>d.id===id); if(record) {tab.value='dossiers';select(record);} else error.value='Record not found in this team.'; }
defineExpose({openRecord, openSection(section) { if (section === 'new') {tab.value='dossiers';create();} else if (section === 'documents') tab.value='documents'; else {tab.value='dossiers'; detailTab.value=section;} }});
let unsubscribe;
const api = () => {
  const a = window.electronAPI?.db?.companyGrants;
  if (!a) throw new Error("Restart BonzAI to enable grant dossiers.");
  return a;
};
async function load() {
  const fresh = await api().snapshot(props.companyId);
  if(draft.value?.id && !hasUnsavedChanges.value) {
    const updated=fresh.dossiers.find(d=>d.id===draft.value.id);
    if(updated) {draft.value=JSON.parse(JSON.stringify(updated)); savedDraft.value=JSON.parse(JSON.stringify(updated));}
  }
  state.value = fresh;
}
async function run(fn) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
onMounted(() => {
  run(load);
  try {
    unsubscribe = api().onChanged(({ companyId }) => {
      if (companyId === props.companyId)
        load().catch((e) => (error.value = e.message));
    });
  } catch {}
});
onBeforeUnmount(() => unsubscribe?.());
const isOverdue = d => d.dueDate && !['settled','rejected','withdrawn'].includes(d.stage) && new Date(d.dueDate+'T23:59:59').getTime() < Date.now();
const grantMetrics = computed(() => [
  {id:'',label:'Applications',value:state.value.dossiers.length,icon:'folder_open',action:true,selected:stageFilter.value===''},
  {id:'under_review',label:'Under review',value:state.value.dossiers.filter(d=>['submitted','instruction'].includes(d.stage)).length,icon:'fact_check',action:true,selected:stageFilter.value==='under_review'},
  {id:'overdue',label:'Overdue',value:state.value.dossiers.filter(isOverdue).length,icon:'event_busy',tone:state.value.dossiers.some(isOverdue)?'warning':null,action:true,selected:stageFilter.value==='overdue'},
  {id:'received',label:'Received',value:(received.value/100).toLocaleString(i18n.state.locale,{style:'currency',currency:'EUR'}),icon:'account_balance',action:true,selected:stageFilter.value==='received'},
]);
const filtered = computed(() =>
  state.value.dossiers.filter((d) =>
    (!stageFilter.value || (stageFilter.value === 'under_review' ? ['submitted','instruction'].includes(d.stage) : stageFilter.value === 'overdue' ? isOverdue(d) : stageFilter.value === 'received' ? d.receivedCents > 0 : d.stage === stageFilter.value)) && `${d.title} ${d.beneficiary} ${d.applicationReference || ""}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
const visible = computed(() => filtered.value.slice(page.value * 30, (page.value + 1) * 30));
const documents = computed(() =>
  state.value.documents.filter(
    (d) => documentBelongsToGrant(d, draft.value),
  ),
);
const next = computed(() =>
  GRANT_STAGES.includes(draft.value?.stage)
    ? GRANT_STAGES[GRANT_STAGES.indexOf(draft.value.stage) + 1]
    : null,
);
const stageLabel = (stage) =>
  ({ rejected: "Rejected", withdrawn: "Withdrawn" })[stage] ||
  GRANT_LABELS[GRANT_STAGES.indexOf(stage)];
const received = computed(() =>
  state.value.dossiers.reduce((sum, d) => sum + (d.receivedCents || 0), 0),
);
function select(d) {
  draft.value = JSON.parse(JSON.stringify(d));
  savedDraft.value = JSON.parse(JSON.stringify(d));
  detailTab.value = d.id ? (detailTab.value === "portal" ? "portal" : "followup") : "info";
  evidence.value = "";
  evidenceDocumentId.value = "";
}
function create() {
  select({
    title: "",
    beneficiary: "",
    territory: "",
    scheme: "",
    ruleSource: "",
    ruleVersion: "",
    checklist: "",
    portalUrl: "",
    applicationReference: "",
    workOrderReference: "",
    nextAction: "",
    dueDate: "",
    documentIds: [],
    stage: "qualification",
    estimatedCents: 0,
    awardedCents: 0,
    receivedCents: 0,
  });
}
async function save() {
  await run(async () => {
    draft.value = await api().saveDossier(
      props.companyId,
      JSON.parse(JSON.stringify(draft.value)),
    );
    savedDraft.value=JSON.parse(JSON.stringify(draft.value));
  });
}
async function advance(stage = next.value) {
  await run(async () => {
    const saved = await api().saveDossier(
      props.companyId,
      JSON.parse(JSON.stringify(draft.value)),
    );
    draft.value = saved;
    draft.value = await api().advanceDossier(props.companyId, {
      id: saved.id,
      revision: saved.revision,
      stage,
      evidence: evidence.value,
      evidenceDocumentId: evidenceDocumentId.value,
    });
    evidence.value = "";
    savedDraft.value=JSON.parse(JSON.stringify(draft.value));
  });
}
function toggleDocument(id) {
  const ids = draft.value.documentIds;
  draft.value.documentIds = ids.includes(id)
    ? ids.filter((x) => x !== id)
    : [...ids, id];
}
function download(doc) {
  return run(async () => {
    const file = await api().readDocument(props.companyId, { id: doc.id });
    const blob = new Blob([
      Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)),
    ]);
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = doc.label.endsWith("." + doc.ext)
      ? doc.label
      : doc.label + "." + doc.ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
function attach() {
  return run(() =>
    api().attachDocument(props.companyId, {
      beneficiary: attachmentDossierId.value ? undefined : documentOwner.value,
      dossierId: attachmentDossierId.value || undefined,
      validUntil: validUntil.value || null,
      documentType: documentType.value,
    }),
  );
}
async function prepare() {
  await run(async () => {
    await api().prepareBatch(props.companyId, {ids: visible.value.map(d => d.id)});
    if (draft.value?.id) { await load(); select(state.value.dossiers.find(d => d.id === draft.value.id)); }
  });
}
async function reconcile() {
  await run(async () => {
    draft.value = await api().reconcilePayment(props.companyId, {id:draft.value.id,revision:draft.value.revision,transaction:{...payment.value},evidenceDocumentId:evidenceDocumentId.value,confirmed:true});
    payment.value={id:'',reference:'',amountCents:0};savedDraft.value=JSON.parse(JSON.stringify(draft.value));
  });
}
</script>
<template>
  <div class="grants-workspace company-screen" data-i18n-skip>
    <nav class="grant-sections" :aria-label="$ui('Grant workspace')">
      <button
        v-for="[id, label, icon] in [
          ['dossiers', 'Applications', 'folder_open'],
          ['documents', 'Company documents', 'description'],
          ['intake', 'Files & email', 'upload_file'],
        ]"
        :key="id"
        :aria-pressed="tab === id"
        @click="id === 'intake' ? emit('open-intake') : tab = id"
      >
        <span class="material-symbols-outlined" aria-hidden="true">{{
          icon
        }}</span
        >{{ $ui(label) }}
      </button>
    </nav>
    <p v-if="error" class="grant-error" role="alert">{{ $ui(error) }}</p>
    <template v-if="tab === 'dossiers'">
      <CompanyMetricStrip :items="grantMetrics" @select="item => {stageFilter = stageFilter === item.id ? '' : item.id; page=0;}" />
      <div class="grant-toolbar">
        <select v-model="stageFilter" @change="page=0" :aria-label="$ui('Application progress')">
          <option value="">{{ $ui('All applications') }}</option>
          <option value="under_review">{{ $ui('Under review') }}</option><option value="overdue">{{ $ui('Overdue') }}</option><option value="received">{{ $ui('Received') }}</option>
          <option v-for="stage in [...GRANT_STAGES,'rejected','withdrawn']" :key="stage" :value="stage">{{ $ui(stageLabel(stage)) }}</option>
        </select>
        <button class="bz-btn" :disabled="busy || !visible.length" @click="prepare">{{ $ui('Prepare this page') }}</button>
        <span class="bz-metric">{{ filtered.length }}</span>
      </div>
      <div class="grant-split">
        <aside>
          <div class="grant-list-head">
            <input
              v-model="query" @input="page=0" :aria-label="$ui('Search applications')"
              :placeholder="$ui('Search applications')"
            /><button class="bz-btn bz-btn--primary" @click="create">
              <span class="material-symbols-outlined" aria-hidden="true"
                >add</span
              >{{ $ui("New application") }}
            </button>
          </div>
          <button
            v-for="d in visible"
            :key="d.id"
            class="grant-row"
            :aria-current="draft?.id === d.id ? 'true' : undefined"
            @click="select(d)"
          >
            <strong>{{ d.title }}</strong
            ><span>{{ d.beneficiary }} · {{ d.territory }}</span
            ><small
              >{{ $ui(stageLabel(d.stage))
              }}<template v-if="d.dueDate"> · {{ d.dueDate }}</template></small
            >
          </button>
          <p v-if="!filtered.length" class="grant-empty">
            {{
              $ui(
                query || stageFilter ? "No matching records." : "No applications yet. Create a dossier for your first installation.",
              )
            }}
          </p>
          <div class="grant-pagination">
            <button class="bz-btn" :disabled="page === 0" @click="page--">{{ $ui('Previous') }}</button>
            <span class="bz-metric">{{ page + 1 }} / {{ Math.max(1,Math.ceil(filtered.length/30)) }}</span>
            <button class="bz-btn" :disabled="(page+1)*30 >= filtered.length" @click="page++">{{ $ui('Next') }}</button>
          </div>
        </aside>
        <form v-if="draft" class="grant-detail" @submit.prevent="save">
          <CompanyWorkflowProgress :stages="GRANT_STAGES.map((id,i)=>({id,label:GRANT_LABELS[i],status: i < GRANT_STAGES.indexOf(draft.stage) ? 'done' : id===draft.stage ? 'active' : 'pending'}))" compact />

          <h2 class="fira-sans-condensed-black-italic">
            {{ draft.title || $ui("New application") }}
          </h2>
          <div v-if="draft.nextAction || draft.dueDate" class="grant-next-action"><span class="material-symbols-outlined" aria-hidden="true">event</span><div><span class="company-caption">{{ $ui('Next action') }}</span><p>{{ draft.nextAction || $ui('Follow-up') }}</p></div><time v-if="draft.dueDate">{{ draft.dueDate }}</time></div>
          <nav class="grant-detail-tabs" :aria-label="$ui('Application details')">
            <button type="button" v-for="[id,label,icon] in [['info','Information','assignment'],['documents','Documents','description'],['followup','Follow-up','timeline'],...(draft.id ? [['portal','Submission portal','web']] : [])]" :key="id" :aria-pressed="detailTab===id" @click="detailTab=id"><span class="material-symbols-outlined" aria-hidden="true">{{ icon }}</span>{{ $ui(label) }}</button>
          </nav>
          <div v-show="detailTab === 'info'" class="grant-fields">
            <h3 class="grant-group-title">{{ $ui('Application details') }}</h3>
            <label
              v-for="[key, label] in [
                ['title', 'Application title'],
                ['beneficiary', 'Beneficiary'],
                ['territory', 'Territory'],
                ['workOrderReference', 'Work order reference'],
              ]"
              :key="key"
              >{{ $ui(label)
              }}<input
                v-model="draft[key]"
                :required="detailTab === 'info' && key !== 'workOrderReference'"
            /></label>
            <h3 class="grant-group-title">{{ $ui("Eligibility and document checklist") }}</h3>
            <label
              >{{ $ui("Scheme")
              }}<input v-model="draft.scheme" list="grant-schemes" /><datalist
                id="grant-schemes"
              >
                <option
                  v-for="scheme in GRANT_SCHEMES"
                  :key="scheme.id"
                  :value="scheme.id"
                >
                  {{ scheme.label }}
                </option>
              </datalist></label
            >
            <label
              >{{ $ui("Rule version / verification date")
              }}<input v-model="draft.ruleVersion"
            /></label>
            <label class="wide"
              >{{ $ui("Official rule source")
              }}<input
                v-model="draft.ruleSource"
                type="url"
                placeholder="https://…"
            /></label>
            <label class="wide"
              >{{ $ui("Eligibility and document checklist")
              }}<textarea
                v-model="draft.checklist"
                rows="4"
                :placeholder="
                  $ui(
                    'Territory, equipment, building, dates, qualifications and required documents…',
                  )
                "
              />
            </label>
            <h3 class="grant-group-title">{{ $ui("Follow-up") }}</h3>
            <label
              >{{ $ui("Portal URL")
              }}<input
                v-model="draft.portalUrl"
                type="url"
                placeholder="https://…" /></label
            ><label
              >{{ $ui("Application reference")
              }}<input v-model="draft.applicationReference"
            /></label>
            <label
              >{{ $ui("Next action")
              }}<input v-model="draft.nextAction" /></label
            ><label
              >{{ $ui("Due date") }}<input v-model="draft.dueDate" type="date"
            /></label>
          </div>
          <div v-show="['info','followup'].includes(detailTab)" class="grant-amounts">
            <label
              v-for="[key, label] in [
                ['estimatedCents', 'Estimated'],
                ['awardedCents', 'Awarded'],
                ['receivedCents', 'Received'],
              ]"
              :key="key"
              >{{ $ui(label) }} · EUR<input
                type="number"
                min="0"
                step="0.01"
                :value="draft[key] / 100"
                :readonly="key === 'receivedCents'"
                @input="
                  draft[key] = Math.round(Number($event.target.value) * 100)
                "
            /></label>
          </div>
          <section v-show="detailTab === 'documents'" class="grant-preparation">
            <h3>{{ $ui('Required documents') }}</h3>
            <div class="grant-type-options">
              <button type="button" v-for="[type,label] in GRANT_DOCUMENT_TYPES" :key="type" :aria-pressed="(draft.requiredDocumentTypes || []).includes(type)" @click="draft.requiredDocumentTypes=(draft.requiredDocumentTypes || []).includes(type)?draft.requiredDocumentTypes.filter(t=>t!==type):[...(draft.requiredDocumentTypes || []),type]">
                <span class="material-symbols-outlined" aria-hidden="true">{{ (draft.requiredDocumentTypes || []).includes(type)?'check_circle':'add_circle' }}</span>{{ $ui(label) }}
              </button>
            </div>
            <template v-if="draft.preparation">
              <h3>{{ $ui('Preparation checks') }}</h3>
              <ul v-if="draft.preparation.blockers.length"><li v-for="blocker in draft.preparation.blockers" :key="blocker">{{ $ui(blocker) }}</li></ul>
              <p v-else>{{ $ui('Documents prepared. Review before submitting.') }}</p>
              <p v-if="draft.preparation.missing.length">{{ draft.preparation.missing.map(type=>$ui(GRANT_DOCUMENT_TYPES.find(t=>t[0]===type)?.[1] || type)).join(', ') }}</p><details><summary>{{ $ui('Application summary') }}</summary><pre>{{ draft.preparation.summary }}</pre></details>
            </template>
          </section>
          <section v-if="detailTab === 'followup' && ['submitted','instruction'].includes(draft.stage)" class="grant-preparation">
            <h3>{{ $ui('Provider correction request') }}</h3>
            <label>{{ $ui('Reference') }}<input v-model="correction.reference" /></label>
            <label>{{ $ui('Requested correction') }}<textarea v-model="correction.request" rows="2" /></label>
            <label>{{ $ui('Deadline') }}<input v-model="correction.dueDate" type="date" /></label>
            <label>{{ $ui('Supporting evidence') }}<select v-model="evidenceDocumentId"><option value="">{{ $ui('Select document') }}</option><option v-for="doc in documents.filter(d=>!d.draft && d.documentType==='notice')" :key="doc.id" :value="doc.id">{{ doc.label }}</option></select></label>
            <button type="button" class="bz-btn" :disabled="busy || !evidenceDocumentId" @click="run(async()=>{draft=await api().recordCorrection(companyId,{id:draft.id,revision:draft.revision,...correction,evidenceDocumentId});correction={reference:'',request:'',dueDate:''};savedDraft=JSON.parse(JSON.stringify(draft))})">{{ $ui('Prepare correction') }}</button>
          </section>
          <section v-if="detailTab === 'followup' && draft.stage === 'awarded'" class="grant-preparation">
            <h3>{{ $ui('Reconcile a payment') }}</h3>
            <label>{{ $ui('Bank transaction ID') }}<input v-model="payment.id" /></label>
            <label>{{ $ui('Application reference') }}<input v-model="payment.reference" /></label>
            <label>{{ $ui('Amount received (EUR)') }}<input type="number" min="0.01" step="0.01" :value="payment.amountCents/100" @input="payment.amountCents=Math.round(Number($event.target.value)*100)" /></label>
            <label>{{ $ui('Supporting evidence') }}<select v-model="evidenceDocumentId"><option value="">{{ $ui('Select document') }}</option><option v-for="doc in documents.filter(d=>!d.draft && d.documentType==='bank')" :key="doc.id" :value="doc.id">{{ doc.label }}</option></select></label>
            <button type="button" class="bz-btn" :disabled="busy || !evidenceDocumentId || !payment.id" @click="reconcile">{{ $ui('Confirm received payment') }}</button>
          </section>
          <section v-show="detailTab === 'documents'">
            <h3>{{ $ui("Supporting documents") }}</h3>
            <div class="grant-documents">
              <button
                type="button"
                v-for="doc in documents"
                :key="doc.id"
                :aria-pressed="draft.documentIds.includes(doc.id)"
                @click="toggleDocument(doc.id)"
              >
                <span class="material-symbols-outlined" aria-hidden="true">{{
                  draft.documentIds.includes(doc.id)
                    ? "check_circle"
                    : "description"
                }}</span
                >{{ doc.label
                }}<small v-if="doc.validUntil">{{ doc.validUntil }}</small>
              </button>
            </div>
            <button type="button" class="bz-btn" @click="attachmentDossierId=draft.id || ''; tab = 'documents'">
              {{ $ui("Add document") }}
            </button>
          </section>
          <div class="grant-review" v-if="detailTab === 'followup' && draft.id && next">
            <h3>
              {{ $ui("Next step") }} ·
              {{ $ui(GRANT_LABELS[GRANT_STAGES.indexOf(next)]) }}
            </h3>
            <label
              >{{ $ui("Review / receipt reference")
              }}<textarea v-model="evidence" rows="2" /></label
            ><label
              >{{ $ui("Supporting evidence")
              }}<select v-model="evidenceDocumentId">
                <option value="">{{ $ui("Select document") }}</option>
                <option
                  v-for="doc in documents.filter((d) =>
                    draft.documentIds.includes(d.id),
                  )"
                  :key="doc.id"
                  :value="doc.id"
                >
                  {{ doc.label }}
                </option>
              </select></label
            ><button
              type="button"
              class="bz-btn"
              :disabled="busy"
              @click="advance()"
            >
              {{ $ui("Confirm next step") }}
            </button>
            <div class="portal-actions">
              <button
                type="button"
                class="bz-btn"
                :disabled="busy"
                @click="advance('rejected')"
              >
                {{ $ui("Record refusal") }}
              </button>
              <button
                type="button"
                class="bz-btn"
                :disabled="busy"
                @click="advance('withdrawn')"
              >
                {{ $ui("Withdraw application") }}
              </button>
            </div>
          </div>
          <details v-if="detailTab === 'followup' && draft.history?.length">
            <summary>{{ $ui("Progress history") }}</summary>
            <p v-for="(entry, i) in draft.history" :key="i">
              {{ i18n.date(entry.at) }} ·
              {{ $ui(stageLabel(entry.to)) }} · {{ entry.evidence }}
            </p>
          </details>
          <p v-if="detailTab === 'portal' && hasUnsavedChanges" role="status">{{ $ui("Save your changes before opening the submission portal.") }}</p>
          <CompanyBrowserPanel v-if="detailTab === 'portal' && draft.id && !hasUnsavedChanges" :key="draft.id" :company-id="companyId" :dossier-id="draft.id" :initial-url="draft.portalUrl || ''" />
          <footer>
            <button class="bz-btn bz-btn--primary" :disabled="busy">
              {{ $ui(busy ? "Saving…" : "Save") }}
            </button>
          </footer>
        </form>
        <div v-else class="grant-empty grant-detail">
          <span class="material-symbols-outlined" aria-hidden="true"
            >account_balance</span
          >
          <h2>{{ $ui("Select an application") }}</h2>
          <p>
            {{
              $ui(
                "Documents, portal receipts and payment evidence stay together.",
              )
            }}
          </p>
        </div>
      </div>
    </template>
    <section v-else-if="tab === 'documents'" class="grant-detail">
      <h2 class="fira-sans-condensed-black-italic">
        {{ $ui("Company documents") }}
      </h2>
      <p>
        {{
          $ui(
            "Company identity and qualifications can be reused. Quotes, invoices and receipts must be linked to an application.",
          )
        }}
      </p>
      <div class="grant-fields">
        <label>{{ $ui("Document type") }}<select v-model="documentType"><option value="">{{ $ui('Select') }}</option><option v-for="[type,label] in GRANT_DOCUMENT_TYPES" :key="type" :value="type">{{ $ui(label) }}</option></select></label><label>{{ $ui("Application") }}<select v-model="attachmentDossierId"><option value="">{{ $ui("Reusable document") }}</option><option v-for="d in state.dossiers" :key="d.id" :value="d.id">{{ d.title }} · {{ d.beneficiary }}</option></select></label><label v-if="!attachmentDossierId && documentType === 'tax_notice'">{{ $ui("Beneficiary") }}<input v-model="documentOwner" /></label
        ><label
          >{{ $ui("Valid until") }}<input v-model="validUntil" type="date"
        /></label>
      </div>
      <button class="bz-btn bz-btn--primary" :disabled="busy || !documentType || (!attachmentDossierId && !['company_identity','qualification','tax_notice'].includes(documentType))" @click="attach">
        {{ $ui("Choose a local document") }}
      </button>
      <div class="grant-documents">
        <div v-for="doc in state.documents" :key="doc.id">
          <span class="material-symbols-outlined" aria-hidden="true"
            >description</span
          ><strong>{{ doc.label }}</strong
          ><span>{{ doc.beneficiary || $ui("Company") }}</span
          ><small
            >{{ doc.validUntil }}
            <template v-if="doc.draft">· {{ $ui("Draft") }}</template></small
          ><button class="bz-btn" :disabled="busy" @click="download(doc)">
            {{ $ui("Download") }}
          </button>
        </div>
      </div>
    </section>

  </div>
</template>
<style scoped>
.grant-detail > .bz-btn { justify-self:start; }
.grant-detail > footer { position:sticky; bottom:0; padding:16px; margin-top:20px; border-top:1px solid var(--bz-border); border-radius:0 0 12px 12px; background:var(--bz-panel); z-index:1; }
.grant-type-options { display:flex; flex-wrap:wrap; gap:8px; }
.grant-type-options button { display:inline-flex; align-items:center; gap:8px; padding:10px 12px; border:1px solid var(--bz-border); border-radius:8px; background:var(--bz-canvas); color:var(--bz-fg-mid); cursor:pointer; font:inherit; }
.grant-type-options button[aria-pressed="true"] { border-color:var(--bz-accent); color:var(--bz-fg); }
.grant-type-options .material-symbols-outlined {font-size:18px;}

.grant-detail-tabs { display:flex; gap:8px; border-bottom:1px solid var(--bz-border); padding-bottom:16px; flex-wrap:wrap; }
.grant-detail-tabs button { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--bz-fg-mid); font:inherit; cursor:pointer; }
.grant-detail-tabs button[aria-pressed="true"] { border-color:var(--bz-accent); color:var(--bz-fg); background:var(--bz-raised); }
.grant-detail-tabs .material-symbols-outlined { font-size:20px; }
.grant-progress li { position:relative; }
.grant-progress li:not(:last-child)::after { content:''; position:absolute; top:15px; left:38px; right:4px; height:1px; background:var(--bz-border); }
.grant-toolbar { flex-wrap:wrap; }

.grant-toolbar, .grant-pagination { display:flex; align-items:center; gap:12px; padding:16px 0; }
.grant-toolbar select { max-width:260px; }
.grant-pagination { justify-content:space-between; }
.grant-import, .grant-preparation { display:grid; gap:16px; padding:24px; border:1px solid var(--bz-border); border-radius:12px; background:var(--bz-card); }
.grant-preparation pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; color:var(--bz-fg-mid); }
.grant-row { margin:6px 0; transition:background .15s; }
.grant-row[aria-current="true"] { border-left:3px solid var(--bz-accent); }

.grants-workspace {
  color: var(--bz-fg);
  display: grid;
  gap: 24px;
}
.grant-sections {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.grant-sections button,
.grant-documents button {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 18px;
  border: 1px solid var(--bz-border);
  border-radius: 10px;
  background: var(--bz-panel);
  color: var(--bz-fg);
}
.grant-sections button[aria-pressed="true"],
.grant-documents button[aria-pressed="true"] {
  border-color: var(--bz-accent);
  background: var(--bz-raised);
}
.grant-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.grant-summary > div {
  padding: 20px 24px;
  border: 1px solid var(--bz-border);
  border-radius: 14px;
  display: grid;
  gap: 8px;
  background: var(--bz-panel);
}
.grant-summary b {
  font-size: 32px;
}
.grant-split {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(0, 2fr);
  gap: 24px;
  align-items: start;
}
.grant-list-head {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.grant-list-head input {
  width: 100%;
}
.grant-row {
  display: grid;
  gap: 8px;
  text-align: left;
  width: 100%;
  padding: 20px;
  border: 1px solid var(--bz-border);
  border-radius: 12px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  margin-bottom: 12px;
}
.grant-row:hover,
.grant-row[aria-current="true"] {
  border-color: var(--bz-accent);
  background: var(--bz-raised);
}
.grant-row small,
.grant-row span,
.grant-empty p {
  color: var(--bz-muted);
}
.grant-detail > .bz-btn { justify-self: start; width: auto; }
.grant-detail {
  padding: 28px;
  border: 1px solid var(--bz-border);
  border-radius: 16px;
  background: var(--bz-panel);
  display: grid;
  gap: 24px;
  min-width: 0;
}
.grant-detail h2 {
  font-size: 30px;
  margin: 0;
}
.grant-detail h3 {
  margin: 0 0 12px;
}
.grant-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.grant-fields .wide {
  grid-column: 1/-1;
}
.grant-detail label {
  display: grid;
  gap: 8px;
}
.grants-workspace input,
.grants-workspace textarea,
.grants-workspace select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  padding: 12px 16px;
  font: inherit;
  background: var(--bz-canvas);
  color: var(--bz-fg);
}
.grants-workspace select {
  padding-right: 40px;
}
.grants-workspace input:focus,
.grants-workspace textarea:focus,
.grants-workspace select:focus {
  outline: none;
  box-shadow: none;
  border-color: var(--bz-accent);
}
.grant-amounts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.grant-progress {
  list-style: none;
  display: flex;
  gap: 12px;
  overflow: auto;
  padding: 0 0 12px;
  margin: 0;
}
.grant-progress li {
  display: grid;
  gap: 8px;
  min-width: 76px;
  flex: 1;
  font-size: 12px;
  color: var(--bz-muted);
}
.grant-progress b {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--bz-border);
  border-radius: 50%;
  font-size: 16px;
}
.grant-progress .current {
  color: var(--bz-fg);
}
.grant-progress .current b,
.grant-progress .done b {
  border-color: var(--bz-accent);
  color: var(--bz-accent);
}
.grant-documents {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0;
}
.grant-documents > div {
  display: grid;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--bz-border);
  border-radius: 12px;
}
.grant-review {
  display: grid;
  gap: 16px;
  padding-top: 24px;
  border-top: 1px solid var(--bz-border);
}
.grant-empty {
  padding: 32px;
  line-height: 1.7;
}
.grant-empty > .material-symbols-outlined {
  font-size: 40px;
}
.grant-error {
  padding: 16px;
  border: 1px solid var(--bz-border);
  border-radius: 10px;
  color: var(--bz-fg);
  background: var(--bz-raised);
}
@media (max-width: 1000px) {
  .grant-split {
    grid-template-columns: 1fr;
  }
  .grant-detail {
    padding: 20px;
  }
}
@media (max-width: 600px) {
  .grant-fields,
  .grant-amounts {
    grid-template-columns: 1fr;
  }
  .grant-summary {
    gap: 8px;
  }
  .grant-summary > div {
    padding: 14px;
  }
  .grant-summary b {
    font-size: 24px;
  }
}
</style>
