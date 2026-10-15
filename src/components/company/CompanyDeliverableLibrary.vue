<template>
  <section
    class="deliverable-library company-screen"
    data-i18n-skip
    :aria-label="ui('Saved results')"
  >
    <aside class="deliverable-library__list">
      <header>
        <h2>{{ ui("Saved results") }}</h2>
        <b class="bz-metric">{{ rows.length }}</b>
      </header>
      <label class="deliverable-search"
        ><span class="material-symbols-outlined" aria-hidden="true">search</span
        ><input
          v-model="query"
          :placeholder="ui('Search results')"
          :aria-label="ui('Search results')"
      /></label>
      <div class="deliverable-filters" :aria-label="ui('Result type')">
        <button v-for="filter in filters" :key="filter.key" type="button" :aria-pressed="type === filter.key" @click="type = filter.key">{{ ui(filter.label) }} <span class="bz-metric">{{ filter.count }}</span></button>
      </div>
      <div class="deliverable-library__entries">
        <button
          v-for="row in filtered.slice(0, limit)"
          :key="row.id"
          type="button"
          class="deliverable-file"
          :aria-current="selected?.id === row.id ? 'true' : undefined"
          @click="selectedId = row.id"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{
            icon(row)
          }}</span>
          <span
            ><strong>{{ row.meta?.demoRun ? ui(artifactTitle(row)) : artifactTitle(row) }}</strong
            ><small>{{ ui(typeLabel(row)) }} · {{ date(row.createdAt) }}</small>
            <span class="deliverable-file__status" :class="`is-${review(row).tone}`">{{ ui(review(row).label) }}</span></span
          >
        </button>
        <p v-if="!filtered.length && !loadError" class="deliverable-no-match">
          {{ ui(rows.length ? "No matching results." : "No saved results yet.") }}
        </p>
        <button
          v-if="filtered.length > limit"
          type="button"
          class="bz-btn bz-btn--ghost"
          @click="limit += 40"
        >
          {{ ui("Load more") }}
        </button>
      </div>
    </aside>
    <article
      v-if="selected"
      class="deliverable-preview"
      :aria-label="ui('Result preview')"
    >
      <header class="deliverable-preview__head">
        <div class="deliverable-preview__identity">
          <span class="material-symbols-outlined" aria-hidden="true">{{
            icon(selected)
          }}</span
          ><span class="deliverable-preview__metadata"
            ><strong>{{
              ui(typeLabel(selected))
            }}</strong
            ><span
              ><span v-if="roleName(selected.role)"
                >{{ roleName(selected.role) }} · </span
              >{{ date(selected.createdAt) }}</span
            ></span
          >
        </div>
        <div class="deliverable-preview__buttons">
          <button v-if="review(selected).issue" type="button" class="bz-btn bz-btn--ghost" @click="$emit('open-task', review(selected).issue.id)"><span class="material-symbols-outlined" aria-hidden="true">arrow_outward</span>{{ ui('Open task') }}</button>
          <button
            v-if="['text', 'code'].includes(artifactKind(selected)) && copy"
            type="button"
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="perform(copy, 'Copied')"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >content_copy</span
            >{{ ui("Copy") }}</button
          ><button
            type="button"
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="perform(download || downloadArtifact)"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >download</span
            >{{ ui("Download") }}
          </button>
        </div>
      </header>
      <p
        v-if="notice"
        class="deliverable-preview__notice"
        :role="failed ? 'alert' : 'status'"
      >
        {{ notice }}
      </p>
      <div class="deliverable-preview__caption"><h3 v-if="artifactKind(selected) !== 'text'">{{ title(selected) }}</h3><span class="deliverable-file__status" :class="`is-${review(selected).tone}`">{{ ui(review(selected).label) }}</span></div>
      <div class="deliverable-preview__body">
        <CompanyArtifactPreview :key="selected.id" :row="selected" />
      </div>
      <dl v-if="commercialMetrics.length" class="deliverable-preview__metrics">
        <div v-for="metric in commercialMetrics" :key="metric.label">
          <dt>{{ ui(metric.label) }}</dt>
          <dd class="bz-metric">{{ metric.value }}</dd>
        </div>
      </dl>
      <details v-if="selected.prompt" class="deliverable-preview__request">
        <summary>{{ ui("Original request") }}</summary>
        <CompanyMarkdown :source="selected.meta?.demoRun ? ui(selected.prompt) : selected.prompt" />
      </details>
    </article>
    <div v-else-if="!rows.length && !loadError" class="deliverable-library__empty">
      <span class="material-symbols-outlined" aria-hidden="true">perm_media</span>
      <h3>{{ ui('Your creations will appear here') }}</h3>
      <p>{{ ui('Generated text, images, audio and videos are saved here automatically, including results waiting for your review.') }}</p>
      <div class="deliverable-library__empty-actions">
        <button type="button" class="bz-btn bz-btn--primary" @click="$emit('start-task')">{{ ui('Start a task') }}</button>
        <button v-if="hasRecords" type="button" class="bz-btn bz-btn--ghost" @click="$emit('open-records')">{{ ui('Documents & records') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
      </div>
    </div>
  </section>
</template>
<script setup>
import "./company-design.css";
import { computed, ref, watch } from "vue";
import { artifactKind, artifactReviewState, downloadArtifact } from "../../services/company/artifactMedia.js";
defineEmits(['open-task', 'start-task', 'open-records']);
import CompanyArtifactPreview from "./CompanyArtifactPreview.vue";
import CompanyMarkdown from "./CompanyMarkdown.vue";
import {
  artifactTitle,
} from "../../services/company/artifactPresentation.js";
import { i18n } from "../../i18n/index.js";
import { operationText } from "../../i18n/operations.js";
const props = defineProps({
  rows: { type: Array, default: () => [] },
  issues: { type: Array, default: () => [] },
  loadError: { type: String, default: "" },
  hasRecords: Boolean,
  roleName: { type: Function, default: (role) => role || "" },
  copy: Function,
  download: Function,
  formatMoney: {
    type: Function,
    default: (value, currency) => `${value} ${currency || ""}`.trim(),
  },
});
const ui = (text) => operationText(text, i18n.state.locale);
const type = ref('all');
const query = ref(""),
  selectedId = ref(""),
  limit = ref(40),
  busy = ref(false),
  notice = ref(""),
  failed = ref(false);
const typeLabels = { image: 'Images', audio: 'Audio', video: 'Videos', text: 'Text', code: 'Code', '3d': '3D', file: 'Files' };
const typeLabel = row => ({ image: 'Image', video: 'Video', file: 'File' })[artifactKind(row)] || typeLabels[artifactKind(row)] || 'File';
const title = row => row.meta?.demoRun ? ui(artifactTitle(row)) : artifactTitle(row);
const review = row => artifactReviewState(row, props.issues);
const filters = computed(() => [{ key: 'all', label: 'All', count: props.rows.length }, ...Object.entries(typeLabels).map(([key, label]) => ({ key, label, count: props.rows.filter(row => artifactKind(row) === key).length })).filter(item => item.count)]);
const filtered = computed(() => props.rows.filter(row =>
  (type.value === 'all' || artifactKind(row) === type.value)
  && `${title(row)} ${ui(typeLabel(row))} ${row.prompt || ''} ${review(row).issue?.title || ''}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())
));
const selected = computed(
  () =>
    filtered.value.find((row) => row.id === selectedId.value) ||
    filtered.value[0],
);
const commercialMetrics = computed(() => {
  const row = selected.value;
  if (!row) return [];
  return [
    ["Price", "price"],
    ["Sales", "sales"],
    ["Revenue", "revenue"],
  ]
    .filter(([, key]) => Number(row[key]) > 0)
    .map(([label, key]) => ({
      label,
      value:
        key === "sales"
          ? Number(row[key]).toLocaleString(i18n.state.locale)
          : props.formatMoney(row[key], row.currency),
    }));
});
watch([query, type], () => {
  limit.value = 40;
});
watch(
  () => selected.value?.id,
  () => {
    notice.value = "";
  },
);
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString(i18n.state.locale, {
        month: "short",
        day: "numeric",
      })
    : "";
const icon = (row) =>
  artifactKind(row) === 'code'
    ? "code"
    : {
        image: "image",
        video: "movie",
        audio: "headphones",
        music: "music_note",
        speech: "record_voice_over",
        "3d": "deployed_code",
      }[row.pipeline] || "description";
async function perform(action, success) {
  if (!action || !selected.value || busy.value) return;
  const id = selected.value.id;
  busy.value = true;
  notice.value = "";
  failed.value = false;
  try {
    await action(selected.value);
    if (selected.value?.id === id) notice.value = success ? ui(success) : "";
  } catch (error) {
    if (selected.value?.id === id) {
      failed.value = true;
      notice.value = ui(error.message || String(error));
    }
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.deliverable-library {
  display: grid;
  grid-template-columns: minmax(290px, 30%) minmax(0, 1fr);
  gap: var(--bz-space-6);
  align-items: start;
}
.deliverable-library__list {
  min-width: 0;
}
.deliverable-library__list > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
  margin-bottom: var(--bz-space-5);
  min-height: 36px;
}
.deliverable-library__list h2 {
  font: italic 900 24px/1.3 var(--bz-font-metric);
  color: var(--bz-fg);
  margin: 0;
}
.deliverable-library__list b {
  font-size: 24px;
  line-height: 1;
  color: var(--bz-fg-mid);
}
.deliverable-search {
  display: flex;
  gap: var(--bz-space-3);
  align-items: center;
  min-height: 44px;
  padding: 10px var(--bz-space-4);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
  margin-bottom: var(--bz-space-5);
  transition: border-color var(--bz-dur-fast);
}
.deliverable-search:focus-within {
  border-color: var(--bz-accent);
  outline: 0;
}
.deliverable-search span {
  font-size: 20px;
  color: var(--bz-fg-mid);
}
.deliverable-search input {
  background: transparent;
  border: 0;
  outline: 0;
  min-width: 0;
  width: 100%;
  color: var(--bz-fg);
  font: 400 var(--bz-size-body)/1.5 var(--bz-font-body);
}
.deliverable-search input::placeholder {
  color: var(--bz-fg-mid);
}
.deliverable-library__entries {
  display: grid;
  gap: var(--bz-space-2);

  padding: 3px;
  margin: -3px;
  scrollbar-width: thin;
  scrollbar-color: var(--bz-border-strong) transparent;
}
.deliverable-file {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-3);
  text-align: left;
  padding: var(--bz-space-4);
  background: transparent;
  color: var(--bz-fg);
  border: 1px solid transparent;
  border-radius: var(--bz-r);
  cursor: pointer;
  min-width: 0;
  transition:
    background var(--bz-dur-fast),
    border-color var(--bz-dur-fast);
}
.deliverable-file::before {
  position: absolute;
  content: "";
  left: -1px;
  top: 18px;
  bottom: 18px;
  width: 3px;
  border-radius: var(--bz-r-pill);
  background: transparent;
  transition: background var(--bz-dur-fast);
}
.deliverable-file:hover {
  background: var(--bz-panel);
  border-color: var(--bz-border);
}
.deliverable-file[aria-current] {
  background: var(--bz-accent-soft);
  border-color: var(--bz-border-brand);
}
.deliverable-file[aria-current]::before {
  background: var(--bz-accent);
}
.deliverable-file > span:first-child {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 36px;
  height: 40px;
  font-size: 21px;
  color: var(--bz-fg-mid);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}
.deliverable-file[aria-current] > span:first-child {
  color: var(--bz-accent);
  border-color: var(--bz-border-brand);
  background: var(--bz-accent-soft);
}
.deliverable-file > span:last-child {
  min-width: 0;
  display: grid;
  gap: var(--bz-space-2);
  padding-top: 1px;
}
.deliverable-file strong {
  font: 400 15px/1.45 var(--bz-font-body);
  color: var(--bz-fg);
  overflow-wrap: anywhere;
}
.deliverable-file__status { font: 400 var(--bz-size-meta)/1.5 var(--bz-font-body); color: var(--bz-fg-mid); }
.deliverable-file__status.is-warning { color: var(--bz-warning); }
.deliverable-file__status.is-success { color: var(--bz-success); }
.deliverable-file small {
  font-size: var(--bz-size-meta);
  line-height: 1.5;
  color: var(--bz-fg-mid);
}
.deliverable-preview {
  min-width: 0;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-lg);
  background: var(--bz-card);
  overflow: hidden;
}
.deliverable-preview__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-4);
  padding: var(--bz-space-5) var(--bz-space-6);
  border-bottom: 1px solid var(--bz-border);
}
.deliverable-preview__identity {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  min-width: 0;
  flex: 1 1 180px;
}
.deliverable-preview__identity > .material-symbols-outlined {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 44px;
  font-size: 22px;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-mid);
}
.deliverable-preview__metadata {
  display: grid;
  gap: var(--bz-space-1);
  min-width: 0;
  color: var(--bz-fg-mid);
  font: 400 var(--bz-size-meta)/1.5 var(--bz-font-body);
  overflow-wrap: anywhere;
}
.deliverable-preview__metadata strong {
  color: var(--bz-fg);
  font-size: var(--bz-size-body);
  font-weight: 400;
}
.deliverable-preview__buttons {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
}
.deliverable-preview__buttons .material-symbols-outlined {
  font-size: 19px;
}
.deliverable-preview__body {
  padding: var(--bz-space-7);
  min-height: 200px;
}
.deliverable-preview__body :deep(.artifact-preview.is-text) {
  max-width: 82ch;
  margin-inline: auto;
}
.deliverable-filters { display: flex; flex-wrap: wrap; gap: var(--bz-space-2); margin-bottom: var(--bz-space-4); }
.deliverable-filters button { display: inline-flex; gap: var(--bz-space-2); align-items: center; border: 1px solid var(--bz-border); border-radius: var(--bz-r-pill); background: transparent; color: var(--bz-fg-mid); padding: 6px 12px; font: inherit; cursor: pointer; }
.deliverable-filters button[aria-pressed="true"] { color: var(--bz-fg); background: var(--bz-accent-soft); border-color: var(--bz-border-brand); }
.deliverable-preview__caption { display: flex; align-items: baseline; flex-wrap: wrap; justify-content: space-between; gap: var(--bz-space-3); padding: var(--bz-space-6) var(--bz-space-7) 0; }
.deliverable-preview__caption h3 { margin: 0; font: 500 20px/1.4 var(--bz-font-body); overflow-wrap: anywhere; min-width: 0; }
.deliverable-library__empty { display: grid; align-content: center; justify-items: start; gap: var(--bz-space-4); padding: var(--bz-space-7); min-height: 320px; }
.deliverable-library__empty-actions { display: flex; flex-wrap: wrap; gap: var(--bz-space-3); }
.deliverable-library__empty > span { font-size: 36px; color: var(--bz-accent); }
.deliverable-library__empty h3 { font: 900 italic 26px/1.2 var(--bz-font-metric); margin: 0; }
.deliverable-library__empty p { max-width: 54ch; color: var(--bz-fg-mid); line-height: 1.6; margin: 0; }
.deliverable-preview__request {
  padding: var(--bz-space-5) var(--bz-space-6);
  border-top: 1px solid var(--bz-border);
  color: var(--bz-fg-mid);
  background: var(--bz-panel);
}
.deliverable-preview__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-6);
  margin: 0;
  padding: var(--bz-space-5) var(--bz-space-6);
  border-top: 1px solid var(--bz-border);
}
.deliverable-preview__metrics dt {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
}
.deliverable-preview__metrics dd {
  margin: var(--bz-space-2) 0 0;
  font-size: 24px;
  line-height: 1.2;
  color: var(--bz-fg);
}
.deliverable-preview__request summary {
  cursor: pointer;
  font-size: var(--bz-size-meta);
  line-height: 1.5;
  padding: var(--bz-space-1) 0;
}
.deliverable-preview__request[open] summary {
  margin-bottom: var(--bz-space-5);
}
.deliverable-preview__notice {
  margin: 0;
  padding: var(--bz-space-3) var(--bz-space-6);
  color: var(--bz-success);
  font-size: var(--bz-size-meta);
  line-height: 1.6;
  border-bottom: 1px solid var(--bz-border);
}
.deliverable-preview__notice[role="alert"] {
  color: var(--bz-danger);
}
.deliverable-no-match {
  padding: var(--bz-space-5);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-body);
  line-height: 1.6;
}
.deliverable-library :is(button, summary):focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
@media (max-width: 1000px) {
  .deliverable-library {
    grid-template-columns: minmax(235px, 32%) minmax(0, 1fr);
    gap: var(--bz-space-5);
  }
  .deliverable-preview__body {
    padding: var(--bz-space-6);
  }
  .deliverable-preview__head {
    padding: var(--bz-space-5);
  }
}
@media (max-width: 700px) {
  .deliverable-library {
    grid-template-columns: minmax(0, 1fr);
  }
  .deliverable-library__entries {
    max-height: 320px;
    overflow-y: auto;
  }
  .deliverable-preview__caption { padding: var(--bz-space-5) var(--bz-space-5) 0; }
  .deliverable-library__empty { padding: var(--bz-space-5) 0; }
  .deliverable-preview__body {
    padding: var(--bz-space-5);
    min-height: 200px;
  }
  .deliverable-preview__head,
  .deliverable-preview__request,
  .deliverable-preview__metrics,
  .deliverable-preview__notice {
    padding-inline: var(--bz-space-5);
  }
}
@media (prefers-reduced-motion: reduce) {
  .deliverable-search,
  .deliverable-file,
  .deliverable-file::before {
    transition: none;
  }
}
</style>
