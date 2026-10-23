<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { i18n } from "../../i18n/index.js";
const props = defineProps({
  source: Object,
  readonly: Boolean,
  highlight: Object,
});
const emit = defineEmits(["region"]);
const t = (fr, en) => (i18n.state.locale.startsWith("fr") ? fr : en);
const image = ref(""),
  page = ref(1),
  total = ref(1),
  busy = ref(false),
  error = ref(""),
  start = ref(null),
  box = ref(null);
let pdf,
  objectUrl,
  disposed = false,
  renderTask;
const area = computed(() =>
  box.value
    ? {
        left: box.value[0] * 100 + "%",
        top: box.value[1] * 100 + "%",
        width: box.value[2] * 100 + "%",
        height: box.value[3] * 100 + "%",
      }
    : {}
);
async function render() {
  busy.value = true;
  try {
    const p = await pdf.getPage(page.value),
      viewport = p.getViewport({
        scale: Math.min(2, 1400 / p.getViewport({ scale: 1 }).width),
      }),
      canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    renderTask = p.render({ canvasContext: canvas.getContext("2d"), viewport });
    await renderTask.promise;
    if (!disposed) image.value = canvas.toDataURL("image/png");
    canvas.width = canvas.height = 0;
    p.cleanup();
    box.value = null;
  } catch (e) {
    if (!disposed)
      error.value = t(
        "Aperçu indisponible. Ouvrez le fichier original.",
        "Preview unavailable. Open the original file."
      );
  } finally {
    busy.value = false;
  }
}
function point(e) {
  const b = e.currentTarget.getBoundingClientRect();
  return [
    Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
    Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
  ];
}
function down(e) {
  if (props.readonly || busy.value || !image.value) return;
  start.value = point(e);
  e.currentTarget.setPointerCapture(e.pointerId);
  box.value = null;
}
function move(e) {
  if (!start.value) return;
  const p = point(e),
    s = start.value;
  box.value = [
    Math.min(s[0], p[0]),
    Math.min(s[1], p[1]),
    Math.abs(p[0] - s[0]),
    Math.abs(p[1] - s[1]),
  ];
}
function up(e) {
  if (!start.value) return;
  move(e);
  start.value = null;
  if (box.value[2] > 0.005 && box.value[3] > 0.005)
    emit("region", { page: page.value, region: [...box.value] });
}
onMounted(async () => {
  try {
    const bytes = await window.electronAPI.db.blobs.read(
      props.source.blobId,
      props.source.ext
    );
    if (disposed) return;
    if (props.source.ext === "pdf") {
      const lib = await import("pdfjs-dist/legacy/build/pdf.mjs"),
        worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      pdf = await lib.getDocument({
        data: new Uint8Array(bytes),
        isEvalSupported: false,
      }).promise;
      if (disposed) {
        await pdf.destroy();
        return;
      }
      total.value = pdf.numPages;
      await render();
    } else {
      objectUrl = URL.createObjectURL(new Blob([bytes]));
      image.value = objectUrl;
    }
  } catch {
    error.value = t(
      "Aperçu indisponible. Ouvrez le fichier original.",
      "Preview unavailable. Open the original file."
    );
  }
});
watch(
  () => props.highlight,
  async (value) => {
    if (!value?.region) return;
    if (pdf && value.page !== page.value) {
      page.value = value.page;
      await render();
    }
    box.value = [...value.region];
  }
);
onUnmounted(() => {
  disposed = true;
  renderTask?.cancel();
  pdf?.destroy();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});
</script>
<template>
  <section class="source-viewer" data-i18n-skip>
    <header>
      <button
        type="button"
        class="bz-btn bz-btn--ghost"
        :disabled="busy || page <= 1"
        :aria-label="t('Page précédente', 'Previous page')"
        @click="
          page--;
          render();
        "
      >
        ←</button
      ><span>{{ t("Page", "Page") }} {{ page }} / {{ total }}</span
      ><button
        type="button"
        class="bz-btn bz-btn--ghost"
        :disabled="busy || page >= total"
        :aria-label="t('Page suivante', 'Next page')"
        @click="
          page++;
          render();
        "
      >
        →
      </button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">
      {{ t("Chargement de la page…", "Loading page…") }}
    </p>
    <div
      v-if="image"
      class="source-page"
      :class="{ selectable: !readonly }"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="start = null"
    >
      <img
        :src="image"
        :alt="t('Pièce originale', 'Original evidence')"
        draggable="false"
      />
      <div v-if="box" class="source-region" :style="area" />
    </div>
    <small v-if="!readonly">{{
      t(
        "Sélectionnez une zone du scan pour la relier à un champ.",
        "Select an area of the scan to link it to a field."
      )
    }}</small>
  </section>
</template>
<style scoped>
.source-viewer {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.source-viewer header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.source-page {
  position: relative;
  line-height: 0;
}
.source-page.selectable {
  touch-action: none;
  cursor: crosshair;
}
.source-page img {
  width: 100%;
  display: block;
  user-select: none;
}
.source-region {
  position: absolute;
  border: 2px solid #7956d9;
  background: #7956d933;
  pointer-events: none;
  box-sizing: border-box;
}
.source-viewer small {
  line-height: 1.5;
}
</style>
