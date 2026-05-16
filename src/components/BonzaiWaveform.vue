<template>
  <div class="bkwf" :class="[`bkwf--${variant}`]" :style="containerStyle">
    <!-- Canvas-based waveform renderer. We draw on a canvas so we can
         animate smoothly without thrashing the DOM. -->
    <canvas
      ref="canvasRef"
      class="bkwf__canvas"
      :width="pixelWidth"
      :height="pixelHeight"
    />

    <!-- Center playhead / progress indicator for interactive variants -->
    <div v-if="showPlayhead && !isVertical" class="bkwf__playhead" :style="playheadStyle">
      <div class="bkwf__playhead-dot" />
    </div>

    <!-- Optional labels beneath the waveform -->
    <div v-if="$slots.default || label" class="bkwf__meta">
      <slot>
        <span class="bkwf__label">{{ label }}</span>
      </slot>
    </div>
  </div>
</template>

<script setup>
/**
 * BonzaiWaveform
 * ──────────────
 * ElevenLabs-grade audio waveform visualization for BonzAI.
 *
 * Variants:
 *   `minimal`  — thin horizontal bars, no interaction, pure aesthetic
 *   `player`   — interactive waveform with playhead, progress track
 *   `spectrum` — vertical frequency bars, music-mode
 *   `pulse`    — flat line that animates like a heartbeat
 *
 * Props:
 *   `data`      — Array of Float32Array or Number[]. Peak amplitudes per time slice.
 *   `active`    — Boolean — is this audio currently playing? Drives animation.
 *   `progress`  — Number 0–1. Playback position for the playhead.
 *   `bars`      — Number. How many bars to render.
 *   `height`    — Number px. Canvas display height.
 *   `width`     — Number px or 'stretch'. 'stretch' fills parent width.
 *   `color`     — Override bar color (default: brand purple).
 *   `gap`       — Gap between bars as fraction of bar width.
 *   `label`     — Optional caption below waveform.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";

const props = defineProps({
  variant: {
    type: String,
    default: "minimal",
    validator: (v) => ["minimal", "player", "spectrum", "pulse"].includes(v),
  },
  data: { type: Array, default: () => [] },
  active: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  bars: { type: Number, default: 64 },
  height: { type: Number, default: 48 },
  width: { type: [Number, String], default: "stretch" },
  color: { type: String, default: null },
  gap: { type: Number, default: 0.25 },
  label: { type: String, default: "" },
});

const canvasRef = ref(null);
const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
const animFrame = ref(0);

/* Canvas display sizes */
const displayWidth = ref(400);
const displayHeight = computed(() => props.height);

/* Internal pixel buffer size */
const pixelWidth = computed(() => Math.round(displayWidth.value * dpr));
const pixelHeight = computed(() => Math.round(displayHeight.value * dpr));

const isVertical = computed(() => props.variant === "spectrum");
const showPlayhead = computed(() => props.variant === "player");

const containerStyle = computed(() => ({
  height: `${displayHeight.value}px`,
  width: props.width === "stretch" ? "100%" : `${props.width}px`,
}));

const playheadStyle = computed(() => ({
  left: `${Math.max(0, Math.min(100, props.progress * 100))}%`,
}));

/* Smooth random data generation when no real data is supplied —
   this is OK because it's purely decorative, not oscilloscope-accurate. */
const seededRandom = (() => {
  let s = 42;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
})();

function generatePlaceholder() {
  const out = [];
  for (let i = 0; i < props.bars; i++) out.push(0.2 + seededRandom() * 0.6);
  return out;
}

function getData() {
  if (props.data && props.data.length > 0) return props.data;
  return generatePlaceholder();
}

/* ─── Rendering ────────────────────────────────────────────────── */

function drawMinimal(ctx, w, h, data) {
  const n = Math.min(data.length, props.bars);
  const barGap = props.gap;
  const barW = w / (n * (1 + barGap) - barGap);
  const gapPx = barW * barGap;
  const col = props.color || getComputedColor("--bz-purple-300");
  const baseAlpha = props.active ? 0.85 : 0.5;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = col;

  for (let i = 0; i < n; i++) {
    const amp = data[i];
    const bh = amp * h;
    const x = i * (barW + gapPx);
    const y = (h - bh) / 2;
    const radius = Math.min(barW / 2, 3);

    ctx.globalAlpha = baseAlpha * (0.3 + amp * 0.7);
    ctx.beginPath();
    ctx.roundRect(x, y, barW - 1, bh, radius);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(ctx, w, h, data) {
  const n = Math.min(data.length, props.bars);
  const barGap = props.gap;
  const barW = w / (n * (1 + barGap) - barGap);
  const gapPx = barW * barGap;
  const progressX = props.progress * w;
  const colPlayed = props.color || getComputedColor("--bz-purple-300");
  const colPending = getComputedColor("--bz-fg-faint");

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < n; i++) {
    const amp = data[i];
    const bh = amp * h * 0.8;
    const x = i * (barW + gapPx);
    const y = (h - bh) / 2;
    const radius = Math.min(barW / 2, 3);
    const center = x + barW / 2;

    ctx.fillStyle = center <= progressX ? colPlayed : colPending;
    ctx.globalAlpha = center <= progressX ? 0.85 : 0.35;
    ctx.beginPath();
    ctx.roundRect(x, y, barW - 1, bh, radius);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSpectrum(ctx, w, h, data) {
  const n = Math.min(data.length, props.bars);
  const barGap = props.gap;
  const barW = w / (n * (1 + barGap) - barGap);
  const gapPx = barW * barGap;
  const col = props.color || getComputedColor("--bz-purple-300");
  const colMid = getComputedColor("--bz-purple-500");
  const emerald = getComputedColor("--bz-emerald-500");

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < n; i++) {
    const amp = data[i];
    const bh = amp * h;
    const x = i * (barW + gapPx);
    const y = h - bh;
    const radius = Math.min(barW / 2, 2);

    /* Color gradient by height — low = purple, mid = brand, high = emerald */
    ctx.fillStyle = amp > 0.75 ? emerald : amp > 0.45 ? colMid : col;
    ctx.globalAlpha = 0.7 + amp * 0.3;
    ctx.beginPath();
    ctx.roundRect(x, y, barW - 1, bh, [radius, radius, 0, 0]);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

let pulsePhase = 0;
function drawPulse(ctx, w, h) {
  const col = props.color || getComputedColor("--bz-purple-300");
  ctx.clearRect(0, 0, w, h);

  const midY = h / 2;
  const points = 120;
  const amplitude = h * 0.35;

  pulsePhase += 0.08;

  ctx.strokeStyle = col;
  ctx.lineWidth = 2 * dpr;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  for (let i = 0; i <= points; i++) {
    const x = (i / points) * w;
    const t = i * 0.15 + pulsePhase;
    const decay = Math.exp(-Math.pow((i - points / 2) / (points / 3), 2));
    const y = midY + Math.sin(t) * amplitude * decay * (props.active ? 1 : 0.3);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.stroke();

  /* Soft glow under the line */
  ctx.shadowColor = getComputedColor("--bz-purple-glow");
  ctx.shadowBlur = 8 * dpr;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

let computedColorCache = null;
function getComputedColor(varName) {
  if (!computedColorCache) computedColorCache = {};
  if (computedColorCache[varName]) return computedColorCache[varName];
  if (typeof window === "undefined") return "#8b5cf6";
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  computedColorCache[varName] = val || "#8b5cf6";
  return computedColorCache[varName];
}

function renderOnce() {
  const cvs = canvasRef.value;
  if (!cvs) return;
  const ctx = cvs.getContext("2d");
  const w = pixelWidth.value;
  const h = pixelHeight.value;
  const data = getData();

  ctx.resetTransform?.();
  ctx.scale(dpr, dpr);

  switch (props.variant) {
    case "minimal": drawMinimal(ctx, displayWidth.value, displayHeight.value, data); break;
    case "player": drawPlayer(ctx, displayWidth.value, displayHeight.value, data); break;
    case "spectrum": drawSpectrum(ctx, displayWidth.value, displayHeight.value, data); break;
    case "pulse": drawPulse(ctx, displayWidth.value, displayHeight.value, data); break;
  }
}

function measureWidth() {
  const el = canvasRef.value?.parentElement;
  if (el) {
    displayWidth.value = el.clientWidth || 400;
  }
}

function tick() {
  renderOnce();
  if (props.active || props.variant === "pulse") {
    animFrame.value = requestAnimationFrame(tick);
  }
}

/* ─── Lifecycle ────────────────────────────────────────────────── */

onMounted(async () => {
  await nextTick();
  measureWidth();
  renderOnce();
  if (props.active || props.variant === "pulse") {
    tick();
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animFrame.value);
});

watch(() => props.data, () => renderOnce(), { deep: true });
watch(() => props.progress, () => {
  if (!props.active && props.variant === "player") renderOnce();
});
watch(() => props.active, (v) => {
  if (v) tick();
  else cancelAnimationFrame(animFrame.value);
});

/* ResizeObserver for stretch width */
let ro = null;
onMounted(() => {
  if (props.width === "stretch" && typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      measureWidth();
      renderOnce();
    });
    if (canvasRef.value?.parentElement) {
      ro.observe(canvasRef.value.parentElement);
    }
  }
});

onBeforeUnmount(() => {
  ro?.disconnect();
});
</script>

<style scoped>
.bkwf {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  user-select: none;
}

.bkwf__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.bkwf__playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--bz-purple-300);
  box-shadow: 0 0 8px var(--bz-purple-glow);
  pointer-events: none;
  transition: left 0.08s linear;
}
.bkwf__playhead-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-purple-300);
  box-shadow: 0 0 12px var(--bz-purple-glow);
}

.bkwf__meta {
  margin-top: var(--bz-space-2);
  text-align: center;
}
.bkwf__label {
  font-size: var(--bz-size-micro);
  color: var(--bz-fg-low);
  letter-spacing: var(--bz-track-mono);
}
</style>
