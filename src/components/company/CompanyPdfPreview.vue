<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
const props = defineProps({ bytes: { type: Uint8Array, required: true } });
const canvas = ref(null),
  container = ref(null),
  pageNumber = ref(1),
  pageCount = ref(0),
  text = ref(""),
  error = ref(""),
  busy = ref(true);
let pdf,
  loading,
  renderTask,
  observer,
  closed = false,
  paint = 0;
async function render() {
  if (!pdf || !canvas.value || closed) return;
  const current = ++paint;
  renderTask?.cancel();
  busy.value = true;
  error.value = "";
  try {
    const page = await pdf.getPage(pageNumber.value);
    if (closed || current !== paint) return;
    const base = page.getViewport({ scale: 1 }),
      width = Math.min(1200, container.value.clientWidth || 800),
      scale = width / base.width;
    const viewport = page.getViewport({ scale }),
      ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.value.width = Math.ceil(viewport.width * ratio);
    canvas.value.height = Math.ceil(viewport.height * ratio);
    canvas.value.style.width = "100%";
    canvas.value.style.height = "auto";
    renderTask = page.render({
      canvasContext: canvas.value.getContext("2d"),
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    await renderTask.promise;
    const content = await page.getTextContent();
    if (current === paint)
      text.value = content.items.map((item) => item.str || "").join(" ");
  } catch (e) {
    if (
      !closed &&
      current === paint &&
      e.name !== "RenderingCancelledException"
    )
      error.value = e.message;
  } finally {
    if (current === paint) busy.value = false;
  }
}
onMounted(async () => {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"),
      worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    if (closed) return;
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    loading = pdfjs.getDocument({
      data: new Uint8Array(props.bytes),
      isEvalSupported: false,
    });
    pdf = await loading.promise;
    if (closed) {
      await pdf.destroy();
      return;
    }
    pageCount.value = pdf.numPages;
    await render();
    observer = new ResizeObserver(() => render());
    observer.observe(container.value);
  } catch (e) {
    if (!closed) {
      error.value = e.message;
      busy.value = false;
    }
  }
});
watch(pageNumber, render);
onBeforeUnmount(() => {
  closed = true;
  ++paint;
  observer?.disconnect();
  renderTask?.cancel();
  loading?.destroy().catch(() => {});
});
</script>
<template>
  <section class="pdf-preview" :aria-label="$ui('Document preview')">
    <nav v-if="pageCount > 1" :aria-label="$ui('Pages')">
      <button
        type="button"
        class="bz-btn"
        :disabled="pageNumber === 1"
        @click="pageNumber--"
      >
        {{ $ui("Previous") }}</button
      ><span class="bz-metric">{{ pageNumber }} / {{ pageCount }}</span
      ><button
        type="button"
        class="bz-btn"
        :disabled="pageNumber === pageCount"
        @click="pageNumber++"
      >
        {{ $ui("Next") }}
      </button>
    </nav>
    <p v-if="error" role="alert">
      {{ $ui("Document preview failed. Download the file to open it.") }}
    </p>
    <p v-else-if="busy" role="status">{{ $ui("Loading…") }}</p>
    <div ref="container">
      <canvas
        ref="canvas"
        role="img"
        :aria-label="text || $ui('Document preview')"
        :aria-busy="busy"
      />
    </div>
  </section>
</template>
<style scoped>
.pdf-preview {
  margin-top: 20px;
  min-width: 0;
}
.pdf-preview nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.pdf-preview canvas {
  display: block;
  background: white;
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  max-width: 100%;
}
.pdf-preview p {
  color: var(--bz-fg-mid);
}
</style>
