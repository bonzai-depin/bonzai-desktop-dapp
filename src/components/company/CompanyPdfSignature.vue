<template>
  <section class="pdf-signature company-screen" data-i18n-skip>
    <p>
      {{
        $ui("Dessinez votre signature, puis placez-la sur le bon de commande.")
      }}
    </p>
    <canvas
      ref="pad"
      class="signature-pad"
      width="600"
      height="140"
      :aria-label="$ui('Signature manuscrite')"
      @pointerdown="start"
      @pointermove="draw"
      @pointerup="end"
      @pointercancel="end"
    />
    <div class="signature-controls">
      <button type="button" class="bz-btn bz-btn--ghost" @click="clear">
        {{ $ui("Effacer la signature") }}</button
      ><label
        >{{ $ui("Page")
        }}<select v-model.number="pageIndex" @change="renderPage">
          <option v-for="n in pageCount" :value="n - 1" :key="n">
            {{ n }}
          </option>
        </select></label
      >
    </div>
    <p v-if="error" role="alert">{{ $ui(error) }}</p>
    <div class="signature-page" ref="container">
      <canvas ref="pageCanvas" />
      <button
        v-if="loaded"
        type="button"
        class="signature-placement"
        :aria-label="$ui('Placer la signature sur le document')"
        @click="place"
        @keydown="move"
      >
        <span v-if="placement" class="signature-stamp" :style="stampStyle"
          ><img :src="signatureImage" alt="" /><small>{{ signer }}</small></span
        >
      </button>
    </div>
    <p class="signature-help">
      {{
        $ui(
          "Cliquez sur la page pour placer la signature. Les flèches permettent d’ajuster sa position.",
        )
      }}
    </p>
    <button
      type="button"
      class="bz-btn bz-btn--primary"
      :disabled="!hasInk || !placement || !signer.trim() || saving || !loaded"
      @click="save"
    >
      {{ $ui(saving ? "Enregistrement…" : "Conserver une copie signée") }}
    </button>
  </section>
</template>
<script setup>
import "./company-design.css";
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { applyPdfSignature } from "../../services/company/pdfSignature.js";
const props = defineProps({
  document: { type: Object, required: true },
  signer: { type: String, default: "" },
});
const emit = defineEmits(["signed"]);
const pad = ref(null),
  pageCanvas = ref(null),
  container = ref(null),
  pageIndex = ref(0),
  pageCount = ref(0),
  placement = ref(null),
  hasInk = ref(false),
  signatureImage = ref(""),
  error = ref(""),
  saving = ref(false),
  loaded = ref(false);
let pdf,
  bytes,
  task,
  drawing = false,
  viewport,
  stopped = false;
const stampStyle = computed(() => ({
  left: `${placement.value?.x * 100}%`,
  top: `${placement.value?.y * 100}%`,
  width: "30%",
  height: "12%",
}));
function point(e) {
  const r = pad.value.getBoundingClientRect();
  return [
    ((e.clientX - r.left) * 600) / r.width,
    ((e.clientY - r.top) * 140) / r.height,
  ];
}
function start(e) {
  pad.value.setPointerCapture(e.pointerId);
  drawing = true;
  const c = pad.value.getContext("2d");
  c.beginPath();
  c.moveTo(...point(e));
}
function draw(e) {
  if (!drawing) return;
  const c = pad.value.getContext("2d");
  c.lineWidth = 2.5;
  c.lineCap = "round";
  c.strokeStyle = "#182233";
  c.lineTo(...point(e));
  c.stroke();
  hasInk.value = true;
}
function end() {
  drawing = false;
  signatureImage.value = pad.value.toDataURL("image/png");
}
function clear() {
  pad.value.getContext("2d").clearRect(0, 0, 600, 140);
  hasInk.value = false;
  signatureImage.value = "";
  placement.value = null;
}
function place(e) {
  const r = e.currentTarget.getBoundingClientRect();
  placement.value = {
    x: Math.max(0, Math.min(0.7, (e.clientX - r.left) / r.width - 0.15)),
    y: Math.max(0, Math.min(0.88, (e.clientY - r.top) / r.height - 0.06)),
  };
}
function move(e) {
  const d = {
    ArrowLeft: [-0.01, 0],
    ArrowRight: [0.01, 0],
    ArrowUp: [0, -0.01],
    ArrowDown: [0, 0.01],
  }[e.key];
  if (!d) return;
  e.preventDefault();
  const p = placement.value || { x: 0.6, y: 0.8 };
  placement.value = {
    x: Math.max(0, Math.min(0.7, p.x + d[0])),
    y: Math.max(0, Math.min(0.88, p.y + d[1])),
  };
}
async function renderPage() {
  loaded.value = false;
  placement.value = null;
  error.value = "";
  try {
    task?.cancel();
    const page = await pdf.getPage(pageIndex.value + 1);
    if (stopped) return;
    viewport = page.getViewport({ scale: 1, rotation: 0 });
    const v = page.getViewport({ scale: 1.3, rotation: 0 });
    pageCanvas.value.width = v.width;
    pageCanvas.value.height = v.height;
    task = page.render({
      canvasContext: pageCanvas.value.getContext("2d"),
      viewport: v,
    });
    await task.promise;
    if (!stopped) loaded.value = true;
  } catch (e) {
    if (e.name !== "RenderingCancelledException") error.value = e.message;
  }
}
async function save() {
  saving.value = true;
  error.value = "";
  try {
    const stamp = document.createElement("canvas");
    stamp.width = 600;
    stamp.height = 230;
    const c = stamp.getContext("2d");
    c.drawImage(pad.value, 0, 0);
    c.fillStyle = "#182233";
    c.font = "22px sans-serif";
    c.fillText(props.signer, 10, 176, 580);
    c.font = "16px sans-serif";
    c.fillText(new Date().toLocaleString(), 10, 212, 580);
    const width = viewport.width * 0.3,
      height = viewport.height * 0.12;
    const signed = await applyPdfSignature(bytes, {
      pageIndex: pageIndex.value,
      x: placement.value.x * viewport.width,
      y: viewport.height * (1 - placement.value.y) - height,
      width,
      height,
      png: stamp.toDataURL("image/png"),
    });
    emit("signed", {
      file: new File(
        [signed],
        `${props.document.filename.replace(/\.pdf$/i, "")}-signed.pdf`,
        { type: "application/pdf" },
      ),
      metadata: {
        sourceDocumentId: props.document.id,
        signer: props.signer,
        signedAt: Date.now(),
        signatureKind: "handwritten",
        page: pageIndex.value + 1,
      },
    });
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
onMounted(async () => {
  try {
    const encoded = await window.electronAPI.db.blobs.read(
      props.document.blobId,
      props.document.blobExt,
    );
    bytes =
      typeof encoded === "string"
        ? Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
        : new Uint8Array(encoded);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const worker =
      await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    pdf = await pdfjs.getDocument({
      data: bytes.slice(),
      isEvalSupported: false,
    }).promise;
    if (stopped) {
      await pdf.destroy();
      return;
    }
    pageCount.value = pdf.numPages;
    await renderPage();
  } catch (e) {
    error.value = e.message;
  }
});
onBeforeUnmount(() => {
  stopped = true;
  task?.cancel();
  pdf?.destroy();
});
</script>
<style scoped>
.pdf-signature {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  min-width: 0;
  font-family: var(--bz-font-body);
}
.pdf-signature p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--bz-fg-mid);
}
.signature-pad {
  width: 100%;
  height: 140px;
  background: #fff;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  touch-action: none;
  cursor: crosshair;
}
.signature-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.signature-controls .bz-btn--ghost {
  color: var(--bz-fg);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
}
.signature-controls label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bz-fg-mid);
  font-size: 13px;
}
.signature-controls select {
  min-height: 38px;
  min-width: 64px;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  padding: 6px 10px;
  font: 400 14px/1.4 var(--bz-font-body);
  color: var(--bz-fg);
  background: var(--bz-panel);
}
.signature-page {
  position: relative;
  width: 100%;
  max-width: 460px;
  margin: auto;
  border: 1px solid var(--bz-border-strong);
}
.signature-page > canvas {
  display: block;
  width: 100%;
  height: auto;
}
.signature-placement {
  position: absolute;
  inset: 0;
  background: transparent;
  border: 0;
  cursor: crosshair;
  width: 100%;
  padding: 0;
}
.signature-placement:focus-visible {
  outline: 3px solid var(--bz-accent);
  outline-offset: 2px;
}
.signature-stamp {
  position: absolute;
  border: 1px dashed #633599;
  color: #182233;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.signature-stamp img {
  width: 100%;
  height: 65%;
  object-fit: contain;
}
.signature-stamp small {
  font-size: 10px;
}
.pdf-signature .signature-help {
  font-size: 12px;
  line-height: 1.65;
}
.pdf-signature > .bz-btn--primary { justify-self: start; }
.pdf-signature p[role="alert"] { color: var(--bz-danger); }
</style>
