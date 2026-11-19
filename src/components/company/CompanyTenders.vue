<script setup>
import "./company-design.css";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { i18n } from "../../i18n/index.js";
import { TENDER_PIECES, TENDER_STAGES, deadlinePassed } from "../../services/company/tendersDomain.js";

const props = defineProps({ companyId: { type: String, required: true } });
const tab = ref("search");
const state = ref({ notices: [], responses: [], documents: [], searches: [] });
const loaded = ref(false), busy = ref(false), error = ref("");
const form = ref({ keywords: "", departments: "", type: "", openOnly: true, page: 0 });
const results = ref(null), searching = ref(false), searchError = ref("");
const draft = ref(null), preview = ref(null);
const attach = ref({ pieceType: "technical", validUntil: "" });
const reviewer = ref(""), approver = ref(""), approved = ref(false), exported = ref(null);
const deposit = ref({ reference: "", recordedBy: "", receiptDocumentId: "", confirmed: false });
let unsubscribe;

const api = () => {
  const a = window.electronAPI?.db?.companyTenders;
  if (!a) throw new Error(i18n.t("publicTenders.restart"));
  return a;
};
const plain = (value) => JSON.parse(JSON.stringify(value));
async function load() {
  state.value = await api().snapshot(props.companyId);
  loaded.value = true;
  if (draft.value?.id) {
    const fresh = state.value.responses.find((r) => r.id === draft.value.id);
    if (fresh && fresh.revision !== draft.value.revision) await select(fresh);
  }
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
      if (companyId === props.companyId && !busy.value) load().catch((e) => (error.value = e.message));
    });
  } catch {}
});
onBeforeUnmount(() => unsubscribe?.());
defineExpose({ openSection(section) { if (["search", "notices", "responses"].includes(section)) tab.value = section; } });

const kept = computed(() => state.value.notices.filter((n) => !n.dismissed));
const keptIds = computed(() => new Set(kept.value.map((n) => `${n.source}:${n.sourceId}`)));
const pages = computed(() => (results.value ? Math.ceil(results.value.total / results.value.pageSize) : 0));
const date = (value) => (value ? i18n.date(new Date(value), { dateStyle: "medium", timeStyle: "short" }) : "—");
const stageLabel = (stage) => i18n.t(`publicTenders.stage.${stage}`);
const pieceLabel = (piece) => i18n.t(`publicTenders.piece.${piece}`);
const cleanError = (message) => String(message || "").replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

async function search(page = 0) {
  if (searching.value || !form.value.keywords.trim()) return;
  searching.value = true;
  searchError.value = "";
  try {
    form.value.page = page;
    results.value = await api().searchNotices(props.companyId, plain(form.value));
  } catch (e) {
    searchError.value = cleanError(e.message);
  } finally {
    searching.value = false;
  }
}
const keep = (notice) => run(() => api().saveNotice(props.companyId, { notice: plain(notice) }));
const dismiss = (notice) => run(() => api().dismissNotice(props.companyId, { id: notice.id }));
const start = (notice) =>
  run(async () => {
    const response = await api().startResponse(props.companyId, { noticeId: notice.id });
    tab.value = "responses";
    await select(response);
  });

async function select(response) {
  draft.value = { ...plain(response), deadlineLocal: response.deadline ? new Date(response.deadline).toISOString().slice(0, 16) : "" };
  approver.value = "";
  approved.value = false;
  exported.value = null;
  deposit.value = { reference: "", recordedBy: "", receiptDocumentId: "", confirmed: false };
  preview.value = null;
  try {
    preview.value = await api().approvalPreview(props.companyId, { id: response.id });
  } catch (e) {
    error.value = cleanError(e.message);
  }
}
const editable = computed(() => ["preparing", "review", "approved"].includes(draft.value?.stage));
const documents = computed(() => state.value.documents.filter((d) => d.responseId === draft.value?.id || (!d.responseId && draft.value)));
const receipts = computed(() => state.value.documents.filter((d) => d.responseId === draft.value?.id && d.pieceType === "receipt"));
const included = (doc) => (draft.value?.documentIds || []).includes(doc.id);
function toggleDocument(doc) {
  const ids = new Set(draft.value.documentIds || []);
  ids.has(doc.id) ? ids.delete(doc.id) : ids.add(doc.id);
  draft.value.documentIds = [...ids];
}
function togglePiece(piece) {
  const set = new Set(draft.value.requiredPieces || []);
  set.has(piece) ? set.delete(piece) : set.add(piece);
  draft.value.requiredPieces = [...set];
}
const act = (method, input = {}) =>
  run(async () => {
    const result = await api()[method](props.companyId, { id: draft.value.id, revision: draft.value.revision, ...input });
    if (result?.status === "exported") exported.value = result;
    if (result?.id === draft.value.id && result.stage) await select(result);
  }).then(() => { error.value = cleanError(error.value); });
const save = () =>
  act("saveResponse", { ...plain(draft.value), deadline: draft.value.deadlineLocal ? new Date(draft.value.deadlineLocal).toISOString() : null });
const attachDocument = (pieceType, responseId = draft.value.id) =>
  run(async () => {
    await api().attachDocument(props.companyId, { responseId, pieceType, validUntil: attach.value.validUntil || undefined });
    await load();
    const fresh = state.value.responses.find((r) => r.id === draft.value.id);
    if (fresh) await select(fresh);
  }).then(() => { error.value = cleanError(error.value); });
const markReviewed = (doc) =>
  run(async () => {
    await api().reviewDocument(props.companyId, { id: doc.id, reviewedBy: reviewer.value, confirmed: true });
    preview.value = await api().approvalPreview(props.companyId, { id: draft.value.id });
  }).then(() => { error.value = cleanError(error.value); });
</script>

<template>
  <div class="tenders company-screen" data-i18n-skip>
    <nav class="tenders__tabs" :aria-label="$t('publicTenders.title')">
      <button v-for="[id, icon, count] in [['search', 'travel_explore', null], ['notices', 'bookmark', kept.length], ['responses', 'folder_open', state.responses.length]]" :key="id" type="button" :aria-pressed="tab === id" @click="tab = id">
        <span class="material-symbols-outlined" aria-hidden="true">{{ icon }}</span>{{ $t(`publicTenders.tab.${id}`) }}<span v-if="count" class="bz-metric">{{ count }}</span>
      </button>
    </nav>
    <p v-if="error" class="tenders__error" role="alert">{{ $ui(error) }}</p>
    <p v-if="!loaded && !error" class="tenders__muted" role="status">{{ $t('publicTenders.loading') }}</p>

    <section v-if="tab === 'search'" class="tenders__panel">
      <form class="tenders__search" @submit.prevent="search(0)">
        <label>{{ $t('publicTenders.keywords') }}<input v-model="form.keywords" maxlength="120" :placeholder="$t('publicTenders.keywordsHint')" required /></label>
        <label>{{ $t('publicTenders.departments') }}<input v-model="form.departments" maxlength="60" placeholder="75, 972" /></label>
        <label>{{ $t('publicTenders.type') }}
          <select v-model="form.type">
            <option value="">{{ $t('publicTenders.anyType') }}</option>
            <option value="TRAVAUX">{{ $t('publicTenders.works') }}</option>
            <option value="SERVICES">{{ $t('publicTenders.services') }}</option>
            <option value="FOURNITURES">{{ $t('publicTenders.supplies') }}</option>
          </select>
        </label>
        <label class="tenders__check"><input v-model="form.openOnly" type="checkbox" />{{ $t('publicTenders.openOnly') }}</label>
        <button class="bz-btn bz-btn--primary" type="submit" :disabled="searching || !form.keywords.trim()">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>{{ searching ? $t('publicTenders.searching') : $t('publicTenders.search') }}
        </button>
      </form>
      <p class="tenders__notice"><span class="material-symbols-outlined" aria-hidden="true">public</span>{{ $t('publicTenders.networkNote') }}</p>
      <p v-if="searchError" class="tenders__error" role="alert">{{ $ui(searchError) }}</p>
      <p v-else-if="searching" class="tenders__muted" role="status">{{ $t('publicTenders.searching') }}</p>
      <p v-else-if="!results" class="tenders__empty">{{ $t('publicTenders.searchEmpty') }}</p>
      <p v-else-if="!results.notices.length" class="tenders__empty">{{ $t('publicTenders.noResults') }}</p>
      <template v-else>
        <p class="tenders__muted">{{ $t('publicTenders.resultCount', { count: results.total }) }}</p>
        <ul class="tenders__list">
          <li v-for="notice in results.notices" :key="notice.sourceId" class="tenders__card">
            <div>
              <h3>{{ notice.title }}</h3>
              <p class="tenders__meta">{{ notice.buyer }} · {{ notice.type }} · {{ notice.departments.join(', ') }}</p>
              <p class="tenders__meta" :class="{ 'tenders__late': deadlinePassed(notice) }">{{ $t('publicTenders.deadline') }} · {{ date(notice.deadline) }}</p>
            </div>
            <div class="tenders__actions">
              <a v-if="notice.url" class="bz-btn" :href="notice.url" target="_blank" rel="noopener noreferrer">{{ $t('publicTenders.openNotice') }} ↗</a>
              <button class="bz-btn bz-btn--primary" type="button" :disabled="busy || keptIds.has(`${notice.source}:${notice.sourceId}`)" @click="keep(notice)">
                {{ keptIds.has(`${notice.source}:${notice.sourceId}`) ? $t('publicTenders.kept') : $t('publicTenders.keep') }}
              </button>
            </div>
          </li>
        </ul>
        <div v-if="pages > 1" class="tenders__pager">
          <button class="bz-btn" type="button" :disabled="searching || form.page === 0" @click="search(form.page - 1)">{{ $t('publicTenders.previous') }}</button>
          <span class="tenders__muted">{{ form.page + 1 }} / {{ pages }}</span>
          <button class="bz-btn" type="button" :disabled="searching || form.page + 1 >= pages" @click="search(form.page + 1)">{{ $t('publicTenders.next') }}</button>
        </div>
      </template>
    </section>

    <section v-else-if="tab === 'notices'" class="tenders__panel">
      <p v-if="loaded && !kept.length" class="tenders__empty">{{ $t('publicTenders.noticesEmpty') }}</p>
      <ul v-else class="tenders__list">
        <li v-for="notice in kept" :key="notice.id" class="tenders__card">
          <div>
            <h3>{{ notice.title }}</h3>
            <p class="tenders__meta">{{ notice.buyer }} · {{ notice.type }} · {{ notice.departments.join(', ') }}</p>
            <p class="tenders__meta" :class="{ 'tenders__late': deadlinePassed(notice) }">{{ $t('publicTenders.deadline') }} · {{ date(notice.deadline) }}</p>
          </div>
          <div class="tenders__actions">
            <a v-if="notice.url" class="bz-btn" :href="notice.url" target="_blank" rel="noopener noreferrer">{{ $t('publicTenders.openNotice') }} ↗</a>
            <button class="bz-btn" type="button" :disabled="busy" @click="dismiss(notice)">{{ $t('publicTenders.dismiss') }}</button>
            <button class="bz-btn bz-btn--primary" type="button" :disabled="busy || deadlinePassed(notice)" :title="deadlinePassed(notice) ? $t('publicTenders.deadlinePassed') : undefined" @click="start(notice)">{{ $t('publicTenders.prepare') }}</button>
          </div>
        </li>
      </ul>
    </section>

    <section v-else class="tenders__split">
      <aside>
        <p v-if="loaded && !state.responses.length" class="tenders__empty">{{ $t('publicTenders.responsesEmpty') }}</p>
        <button v-for="response in state.responses" :key="response.id" type="button" class="tenders__row" :aria-current="draft?.id === response.id" @click="select(response)">
          <b>{{ response.title }}</b>
          <span class="tenders__meta">{{ response.buyer }}</span>
          <span class="tenders__badge" :data-stage="response.stage">{{ stageLabel(response.stage) }}</span>
        </button>
      </aside>
      <p v-if="!draft" class="tenders__empty">{{ $t('publicTenders.selectResponse') }}</p>
      <article v-else class="tenders__detail">
        <ol class="tenders__steps">
          <li v-for="stage in TENDER_STAGES" :key="stage" :aria-current="draft.stage === stage ? 'step' : undefined">{{ stageLabel(stage) }}</li>
        </ol>
        <p v-if="!TENDER_STAGES.includes(draft.stage)" class="tenders__notice">{{ stageLabel(draft.stage) }}</p>

        <fieldset :disabled="!editable || busy">
          <legend>{{ $t('publicTenders.consultation') }}</legend>
          <label class="tenders__wide">{{ $t('publicTenders.fieldTitle') }}<textarea v-model="draft.title" rows="2" maxlength="1000"></textarea></label>
          <label>{{ $t('publicTenders.buyer') }}<input v-model="draft.buyer" maxlength="300" /></label>
          <label>{{ $t('publicTenders.reference') }}<input v-model="draft.consultationReference" maxlength="120" /></label>
          <label>{{ $t('publicTenders.lots') }}<input v-model="draft.lots" maxlength="500" /></label>
          <label>{{ $t('publicTenders.deadline') }}<input v-model="draft.deadlineLocal" type="datetime-local" /></label>
          <label class="tenders__wide">{{ $t('publicTenders.platform') }}<input v-model="draft.platformUrl" type="url" placeholder="https://" maxlength="500" /><small>{{ $t('publicTenders.platformHint') }}</small></label>
          <div class="tenders__wide">
            <span class="tenders__label">{{ $t('publicTenders.requiredPieces') }}</span>
            <div class="tenders__chips">
              <button v-for="piece in TENDER_PIECES" :key="piece" type="button" :aria-pressed="(draft.requiredPieces || []).includes(piece)" @click="togglePiece(piece)">{{ pieceLabel(piece) }}</button>
            </div>
          </div>
          <label class="tenders__wide">{{ $t('publicTenders.notes') }}<textarea v-model="draft.notes" rows="3" maxlength="8000"></textarea></label>
        </fieldset>

        <section>
          <h3>{{ $t('publicTenders.documents') }}</h3>
          <p v-if="!documents.length" class="tenders__empty">{{ $t('publicTenders.documentsEmpty') }}</p>
          <ul class="tenders__docs">
            <li v-for="doc in documents" :key="doc.id">
              <label v-if="TENDER_PIECES.includes(doc.pieceType)" class="tenders__check"><input type="checkbox" :checked="included(doc)" :disabled="!editable || busy" @change="toggleDocument(doc)" /><span>{{ doc.label }}</span></label>
              <span v-else>{{ doc.label }}</span>
              <span class="tenders__meta">{{ pieceLabel(doc.pieceType) }}</span>
              <span v-if="doc.draft && !doc.reviewedBy" class="tenders__badge" data-stage="review">{{ $t('publicTenders.draftToReview') }}</span>
              <span v-else-if="doc.reviewedBy" class="tenders__badge" data-stage="approved">{{ $t('publicTenders.reviewedBy', { name: doc.reviewedBy }) }}</span>
              <button v-if="doc.draft && !doc.reviewedBy" class="bz-btn" type="button" :disabled="busy || !reviewer.trim()" @click="markReviewed(doc)">{{ $t('publicTenders.markReviewed') }}</button>
            </li>
          </ul>
          <label v-if="documents.some((d) => d.draft && !d.reviewedBy)">{{ $t('publicTenders.reviewerName') }}<input v-model="reviewer" maxlength="120" /></label>
          <div v-if="editable" class="tenders__attach">
            <select v-model="attach.pieceType" :aria-label="$t('publicTenders.pieceType')">
              <option v-for="piece in [...TENDER_PIECES, 'consultation']" :key="piece" :value="piece">{{ pieceLabel(piece) }}</option>
            </select>
            <button class="bz-btn" type="button" :disabled="busy" @click="attachDocument(attach.pieceType)"><span class="material-symbols-outlined" aria-hidden="true">attach_file</span>{{ $t('publicTenders.attach') }}</button>
          </div>
          <p class="tenders__muted">{{ $t('publicTenders.draftingNote') }}</p>
        </section>

        <ul v-if="preview?.preparation?.blockers?.length && draft.stage === 'preparing'" class="tenders__blockers">
          <li v-for="blocker in preview.preparation.blockers" :key="blocker">{{ $ui(blocker) }}</li>
          <li v-for="piece in preview.preparation.missing" :key="piece">{{ $t('publicTenders.missingPiece', { piece: pieceLabel(piece) }) }}</li>
        </ul>

        <footer v-if="editable" class="tenders__actions">
          <button class="bz-btn" type="button" :disabled="busy" @click="save">{{ $t('publicTenders.save') }}</button>
          <button v-if="draft.stage === 'preparing'" class="bz-btn bz-btn--primary" type="button" :disabled="busy || !!preview?.preparation?.blockers?.length" @click="act('requestReview')">{{ $t('publicTenders.requestReview') }}</button>
        </footer>

        <section v-if="draft.stage === 'review' && preview" class="tenders__approval" aria-live="polite">
          <h3>{{ $t('publicTenders.approvalTitle') }}</h3>
          <p>{{ $t('publicTenders.approvalIntro') }}</p>
          <dl>
            <dt>{{ $t('publicTenders.buyer') }}</dt><dd>{{ preview.manifest.recipient.buyer }}</dd>
            <dt>{{ $t('publicTenders.reference') }}</dt><dd>{{ preview.manifest.recipient.consultationReference || '—' }}</dd>
            <dt>{{ $t('publicTenders.lots') }}</dt><dd>{{ preview.manifest.recipient.lots || '—' }}</dd>
            <dt>{{ $t('publicTenders.platform') }}</dt><dd>{{ preview.manifest.recipient.platformUrl }}</dd>
            <dt>{{ $t('publicTenders.deadline') }}</dt><dd>{{ date(preview.manifest.deadline) }}</dd>
          </dl>
          <ul class="tenders__docs">
            <li v-for="file in preview.manifest.documents" :key="file.id"><span>{{ file.label }}</span><span class="tenders__meta">{{ pieceLabel(file.pieceType) }} · .{{ file.ext }} · {{ file.sha256.slice(0, 12) }}</span></li>
          </ul>
          <label>{{ $t('publicTenders.approverName') }}<input v-model="approver" maxlength="120" /></label>
          <label class="tenders__check"><input v-model="approved" type="checkbox" />{{ $t('publicTenders.approvalConfirm') }}</label>
          <button class="bz-btn bz-btn--primary" type="button" :disabled="busy || !approved || !approver.trim()" @click="act('approveResponse', { approvedBy: approver, confirmed: approved, manifest: plain(preview.manifest) })">{{ $t('publicTenders.approve') }}</button>
        </section>

        <section v-if="draft.stage === 'approved'" class="tenders__approval">
          <h3>{{ $t('publicTenders.depositTitle') }}</h3>
          <p>{{ $t('publicTenders.depositIntro', { name: draft.approval?.approvedBy || '' }) }}</p>
          <div class="tenders__actions">
            <button class="bz-btn" type="button" :disabled="busy" @click="act('exportPackage')"><span class="material-symbols-outlined" aria-hidden="true">folder_zip</span>{{ $t('publicTenders.export') }}</button>
            <a class="bz-btn" :href="draft.platformUrl" target="_blank" rel="noopener noreferrer">{{ $t('publicTenders.openPlatform') }} ↗</a>
          </div>
          <p v-if="exported" class="tenders__muted" role="status">{{ $t('publicTenders.exported', { count: exported.files.length }) }} <code>{{ exported.folder }}</code></p>
          <div class="tenders__attach">
            <button class="bz-btn" type="button" :disabled="busy" @click="attachDocument('receipt')"><span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>{{ $t('publicTenders.attachReceipt') }}</button>
            <select v-model="deposit.receiptDocumentId" :aria-label="$t('publicTenders.receipt')" :disabled="!receipts.length">
              <option value="">{{ receipts.length ? $t('publicTenders.chooseReceipt') : $t('publicTenders.noReceipt') }}</option>
              <option v-for="doc in receipts" :key="doc.id" :value="doc.id">{{ doc.label }}</option>
            </select>
          </div>
          <label>{{ $t('publicTenders.receiptReference') }}<input v-model="deposit.reference" maxlength="120" /></label>
          <label>{{ $t('publicTenders.depositedBy') }}<input v-model="deposit.recordedBy" maxlength="120" /></label>
          <label class="tenders__check"><input v-model="deposit.confirmed" type="checkbox" />{{ $t('publicTenders.depositConfirm') }}</label>
          <button class="bz-btn bz-btn--primary" type="button" :disabled="busy || !deposit.confirmed || !deposit.reference.trim() || !deposit.recordedBy.trim() || !deposit.receiptDocumentId" @click="act('recordDeposit', plain(deposit))">{{ $t('publicTenders.recordDeposit') }}</button>
        </section>

        <section v-if="draft.deposit" class="tenders__approval">
          <h3>{{ $t('publicTenders.deposited') }}</h3>
          <p>{{ $t('publicTenders.depositSummary', { reference: draft.deposit.reference, name: draft.deposit.recordedBy }) }} · {{ date(draft.deposit.depositedAt) }}</p>
        </section>
      </article>
    </section>
  </div>
</template>

<style scoped>
.tenders { display: grid; gap: var(--bz-space-5, 24px); color: var(--bz-fg); min-width: 0; }
.tenders__tabs, .tenders__actions, .tenders__pager, .tenders__attach, .tenders__chips { display: flex; flex-wrap: wrap; gap: var(--bz-space-2, 8px); align-items: center; }
.tenders__tabs button, .tenders__chips button { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-md, 10px); background: var(--bz-panel); color: var(--bz-fg-mid); font: inherit; cursor: pointer; }
.tenders__tabs button[aria-pressed="true"], .tenders__chips button[aria-pressed="true"] { border-color: var(--bz-accent); background: var(--bz-raised); color: var(--bz-fg); }
.tenders__chips button:disabled { cursor: default; opacity: 0.7; }
.tenders__panel, .tenders__detail { display: grid; gap: var(--bz-space-4, 16px); min-width: 0; }
.tenders__search { display: grid; grid-template-columns: minmax(200px, 2fr) minmax(120px, 1fr) minmax(140px, 1fr); gap: var(--bz-space-3, 12px); align-items: end; }
.tenders__search .bz-btn { justify-self: start; }
.tenders label { display: grid; gap: 6px; font-size: var(--bz-size-small, 13px); color: var(--bz-fg-mid); min-width: 0; }
.tenders input:not([type="checkbox"]), .tenders select, .tenders textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm, 8px); background: var(--bz-canvas); color: var(--bz-fg); font: inherit; }
.tenders label.tenders__check { display: flex; align-items: center; gap: 8px; color: var(--bz-fg); }
.tenders small, .tenders__muted, .tenders__meta { color: var(--bz-fg-mid); font-size: var(--bz-size-small, 13px); margin: 0; overflow-wrap: anywhere; }
.tenders__notice { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 12px 16px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-md, 10px); background: var(--bz-info-soft, var(--bz-panel)); color: var(--bz-fg); font-size: var(--bz-size-small, 13px); }
.tenders__error, .tenders__blockers { margin: 0; padding: 12px 16px; border: 1px solid var(--bz-danger); border-radius: var(--bz-r-md, 10px); background: var(--bz-danger-soft); color: var(--bz-fg); overflow-wrap: anywhere; }
.tenders__blockers { border-color: var(--bz-warning); background: var(--bz-warning-soft); padding-left: 32px; }
.tenders__empty { margin: 0; padding: 32px 16px; border: 1px dashed var(--bz-border); border-radius: var(--bz-r-md, 10px); color: var(--bz-fg-mid); text-align: center; }
.tenders__list, .tenders__docs, .tenders__steps { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--bz-space-2, 8px); }
.tenders__card { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--bz-space-3, 12px); padding: 16px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-md, 10px); background: var(--bz-card); }
.tenders__card > div:first-child { flex: 1 1 320px; min-width: 0; display: grid; gap: 6px; }
.tenders h3 { margin: 0; font-family: var(--bz-font-display); font-size: var(--bz-size-h3, 16px); line-height: 1.35; overflow-wrap: anywhere; }
.tenders__card h3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.tenders__late { color: var(--bz-danger); }
.tenders__split { display: grid; grid-template-columns: minmax(240px, 0.8fr) minmax(0, 2fr); gap: var(--bz-space-5, 24px); align-items: start; }
.tenders__split aside { display: grid; gap: var(--bz-space-2, 8px); min-width: 0; }
.tenders__row { display: grid; gap: 6px; justify-items: start; text-align: left; padding: 12px 16px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-md, 10px); background: var(--bz-panel); color: var(--bz-fg); font: inherit; cursor: pointer; min-width: 0; }
.tenders__row b { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.tenders__row[aria-current="true"] { border-color: var(--bz-accent); background: var(--bz-raised); }
.tenders__badge { padding: 2px 10px; border-radius: var(--bz-r-pill, 999px); border: 1px solid var(--bz-border); font-size: var(--bz-size-caption, 12px); color: var(--bz-fg); background: var(--bz-panel); }
.tenders__badge[data-stage="review"] { border-color: var(--bz-warning); background: var(--bz-warning-soft); }
.tenders__badge[data-stage="approved"], .tenders__badge[data-stage="deposited"], .tenders__badge[data-stage="awarded"] { border-color: var(--bz-success); background: var(--bz-success-soft); }
.tenders__steps { grid-auto-flow: column; grid-auto-columns: 1fr; }
.tenders__steps li { padding: 8px; border-bottom: 2px solid var(--bz-border); color: var(--bz-fg-mid); font-size: var(--bz-size-small, 13px); text-align: center; }
.tenders__steps li[aria-current="step"] { border-color: var(--bz-accent); color: var(--bz-fg); }
.tenders fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--bz-space-3, 12px); margin: 0; padding: 16px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-md, 10px); min-width: 0; }
.tenders fieldset:disabled { opacity: 0.75; }
.tenders legend, .tenders__label { color: var(--bz-fg-mid); font-size: var(--bz-size-small, 13px); }
.tenders__wide { grid-column: 1 / -1; display: grid; gap: 6px; }
.tenders__docs li { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm, 8px); background: var(--bz-panel); overflow-wrap: anywhere; }
.tenders__docs li > :first-child { flex: 1 1 220px; min-width: 0; }
.tenders__detail > section { display: grid; gap: var(--bz-space-3, 12px); }
.tenders__approval { padding: 16px; border: 1px solid var(--bz-border-strong, var(--bz-border)); border-radius: var(--bz-r-md, 10px); background: var(--bz-card); }
.tenders__approval p { margin: 0; }
.tenders__approval dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; margin: 0; }
.tenders__approval dt { color: var(--bz-fg-mid); }
.tenders__approval dd { margin: 0; overflow-wrap: anywhere; }
.tenders code { font-family: var(--bz-font-mono); overflow-wrap: anywhere; }
.tenders .material-symbols-outlined { font-size: 20px; }
@media (max-width: 860px) {
  .tenders__split, .tenders__search, .tenders fieldset { grid-template-columns: minmax(0, 1fr); }
  .tenders__steps { grid-auto-flow: row; }
}
</style>
