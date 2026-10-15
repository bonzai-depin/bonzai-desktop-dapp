<script setup>
import "./company-design.css";
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import CompanyPdfPreview from "./CompanyPdfPreview.vue";
import CompanyMarkdown from "./CompanyMarkdown.vue";
import { i18n } from "../../i18n/index.js";
const emit = defineEmits(["open-record"]);
const props = defineProps({ companyId: { type: String, required: true } });
const state = ref({ rows: [], total: 0 }),
  query = ref(""),
  kind = ref(""),
  offset = ref(0),
  selected = ref(null),
  url = ref(""),
  text = ref(""),
  error = ref(""),
  busy = ref(false);
const pdfBytes = ref(null);
const api = () => window.electronAPI?.db?.companyWorkspace;
let generation = 0,
  timer,
  stops = [];
async function load() {
  const run = ++generation;
  try {
    if (!api()) throw new Error("Reopen BonzAI after your running work finishes to load documents.");
    const value = await api().deliverables(props.companyId, {
      query: query.value,
      kind: kind.value,
      offset: offset.value,
    });
    if (run === generation) {
      state.value = value;
      error.value = "";
    }
  } catch (e) {
    if (run === generation) error.value = e.message;
  }
}
function release() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = "";
  text.value = "";
  pdfBytes.value = null;
}
function openOriginal() {
  const row = selected.value;
  const kind = {
    grant: "grant",
    invoice: "invoice",
    maintenance: "workOrder",
    purchase: {
      order: "purchaseOrder",
      invoice: "supplierInvoice",
      request: "purchaseRequest",
    }[row.recordKind],
  }[row.kind];
  if (kind && row.recordId) emit("open-record", { kind, id: row.recordId });
}
let preview = 0;
async function open(row) {
  selected.value = row;
  release();
  const run = ++preview;
  busy.value = true;
  error.value = "";
  try {
    const file = await api().readDeliverable(props.companyId, { id: row.id });
    if (run !== preview) return;
    const bytes =
      file.html || Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
    const mime = file.html
      ? "text/html"
      : {
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
          txt: "text/plain",
          csv: "text/plain",
          json: "text/plain",
        }[file.ext] || "application/octet-stream";
    if (file.ext === "pdf") pdfBytes.value = bytes;
    if (mime === "text/plain") text.value = new TextDecoder().decode(bytes);
    url.value = URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch (e) {
    if (run === preview) error.value = e.message;
  } finally {
    if (run === preview) busy.value = false;
  }
}
function download() {
  if (!url.value) return;
  const a = document.createElement("a");
  a.href = url.value;
  a.download = selected.value.title.endsWith("." + selected.value.ext)
    ? selected.value.title
    : selected.value.title + "." + selected.value.ext;
  a.click();
}
watch([query, kind], () => {
  offset.value = 0;
  clearTimeout(timer);
  timer = setTimeout(load, 180);
});
watch(offset, load);
onMounted(() => {
  load();
  for (const name of [
    "companyGrants",
    "companyBilling",
    "purchasing",
    "gmao",
  ]) {
    const stop = window.electronAPI?.db?.[name]?.onChanged?.((e) => {
      if (e.companyId === props.companyId) load();
    });
    if (stop) stops.push(stop);
  }
});
onBeforeUnmount(() => {
  ++generation;
  ++preview;
  release();
  clearTimeout(timer);
  stops.forEach((f) => f());
});
</script>
<template>
  <section class="operational-files company-screen" data-i18n-skip>
    <header>
      <h3>{{ $ui("Documents & records") }}</h3>
      <span class="bz-metric">{{ state.total }}</span>
    </header>
    <p v-if="error" role="alert">{{ $ui(error) }}</p>
    <div class="files-layout">
      <aside>
        <input
          v-model="query"
          :aria-label="$ui('Search documents')"
          :placeholder="$ui('Search documents')"
        /><select v-model="kind" :aria-label="$ui('Document type')">
          <option value="">{{ $ui("All documents") }}</option>
          <option value="grant">{{ $ui("Grant dossiers") }}</option>
          <option value="invoice">{{ $ui("Billing") }}</option>
          <option value="purchase">{{ $ui("Purchasing") }}</option>
          <option value="maintenance">{{ $ui("Work orders") }}</option>
        </select>
        <button
          type="button"
          v-for="row in state.rows"
          :key="row.id"
          class="file-row"
          :aria-current="selected?.id === row.id"
          @click="open(row)"
        >
          <span class="material-symbols-outlined" aria-hidden="true"
            >description</span
          ><span
            ><strong>{{ row.title }}</strong
            ><small
              >{{ $ui(row.status) }} ·
              {{ i18n.date(row.updatedAt, { dateStyle: "medium" }) }}</small
            ></span
          >
        </button>
        <p v-if="!state.rows.length && !error">
          {{ $ui("No matching documents.") }}
        </p>
        <footer>
          <button
            type="button"
            class="bz-btn"
            :disabled="!offset"
            @click="offset -= 40"
          >
            {{ $ui("Previous") }}</button
          ><button
            type="button"
            class="bz-btn"
            :disabled="offset + 40 >= state.total"
            @click="offset += 40"
          >
            {{ $ui("Next") }}
          </button>
        </footer>
      </aside>
      <article>
        <header v-if="selected">
          <strong>{{ selected.title }}</strong
          ><button
            v-if="selected.recordId"
            type="button"
            class="bz-btn"
            @click="openOriginal"
          >
            {{ $ui("Open original record") }}</button
          ><button
            type="button"
            class="bz-btn"
            :disabled="busy || !url"
            @click="download"
          >
            {{ $ui("Download") }}
          </button>
        </header>
        <p v-if="busy" role="status">{{ $ui("Loading…") }}</p>
        <CompanyMarkdown v-else-if="text" :source="text" /><CompanyPdfPreview
          v-else-if="pdfBytes"
          :key="selected.id"
          :bytes="pdfBytes"
        />
        <iframe
          v-else-if="url && selected?.ext === 'html'"
          :src="url"
          :title="selected.title"
          sandbox="allow-same-origin"
        /><img
          v-else-if="
            url && ['png', 'jpg', 'jpeg', 'webp'].includes(selected?.ext)
          "
          :src="url"
          :alt="selected.title"
        />
        <p v-else>
          {{
            $ui(
              selected
                ? "Download to open this file."
                : "Select a document to preview it.",
            )
          }}
        </p>
      </article>
    </div>
  </section>
</template>
<style scoped>
.operational-files {
  margin-block: var(--bz-space-6);
  color: var(--bz-fg);
}
header,
footer {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  flex-wrap: wrap;
}
h3 {
  font: 900 italic 24px/1.3 var(--bz-font-metric);
  margin: 0;
}
.files-layout {
  display: grid;
  grid-template-columns: minmax(280px, 34%) minmax(0, 1fr);
  gap: 24px;
  margin-top: 20px;
}
.files-layout aside {
  display: grid;
  align-content: start;
  gap: 10px;
}
.files-layout input,
.files-layout select {
  padding: 12px 36px 12px 14px;
  width: 100%;
  border: 1px solid var(--bz-border);
  border-radius: 10px;
  background: var(--bz-panel);
  color: inherit;
  font: inherit;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--bz-panel);
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.file-row:hover {
  background: var(--bz-raised);
}
.file-row[aria-current="true"] {
  border-color: var(--bz-accent);
}
.file-row strong,
.file-row small {
  display: block;
  overflow-wrap: anywhere;
}
.file-row small {
  color: var(--bz-fg-mid);
  margin-top: 6px;
}
article {
  border: 1px solid var(--bz-border);
  border-radius: 14px;
  padding: 24px;
  min-width: 0;
}
article iframe {
  width: 100%;
  height: 65vh;
  border: 0;
  margin-top: 20px;
  background: white;
}
article img {
  max-width: 100%;
  max-height: 65vh;
  object-fit: contain;
}
article p {
  color: var(--bz-fg-mid);
}
@media (max-width: 800px) {
  .files-layout {
    grid-template-columns: 1fr;
  }
  article {
    padding: 16px;
  }
}
</style>
