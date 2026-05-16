<template>
  <figure class="bz-code">
    <header class="bz-code__head">
      <span class="bz-code__lang bz-mono">{{ displayLang }}</span>
      <button
        type="button"
        class="bz-code__copy"
        :class="{ 'bz-code__copy--ok': copied }"
        @click="onCopy"
        :title="copied ? 'Copied' : 'Copy'"
        :aria-label="copied ? 'Copied to clipboard' : 'Copy code'"
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          {{ copied ? 'check' : 'content_copy' }}
        </span>
      </button>
    </header>
    <pre class="bz-code__body" :class="`bz-code__body--${displayLang}`"><code ref="codeEl"><slot>{{ code }}</slot></code></pre>
  </figure>
</template>

<script setup>
import { ref, computed } from "vue";

const codeEl = ref(null);

const props = defineProps({
  /** Language label shown top-right (mono uppercase eyebrow style). */
  lang: { type: String, default: "" },
  /** Raw code string — when no slot content is provided. */
  code: { type: String, default: "" },
});

const displayLang = computed(() => (props.lang || "code").toLowerCase());

const copied = ref(false);
let _resetTimer = null;

async function onCopy() {
  const text = props.code || extractSlotText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    if (_resetTimer) clearTimeout(_resetTimer);
    _resetTimer = setTimeout(() => { copied.value = false; }, 1600);
  } catch (e) {
    console.warn("[CodeBlock] copy failed:", e);
  }
}

function extractSlotText() {
  // Best-effort: pull text from the rendered <code> if a slot was used.
  return codeEl.value?.textContent ?? "";
}
</script>

<style scoped>
/* Stripe / Linear-grade code block.
   Mono throughout, language label as an eyebrow, hover-revealed copy
   button that flips to a check on success. No syntax-highlight library
   bundled — the parent's markdown renderer handles `<code>` styling
   inside (Prism, Shiki, etc. when installed). */

.bz-code {
  margin: 0 0 var(--bz-space-3) 0;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  overflow: hidden;
  position: relative;
}

.bz-code__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bz-space-2) var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
  background: var(--bz-card);
}

.bz-code__lang {
  font-size: var(--bz-size-micro);
  letter-spacing: var(--bz-track-eyebrow);
  text-transform: uppercase;
  color: var(--bz-fg-low);
}

.bz-code__copy {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-low);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-code__copy:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
  border-color: var(--bz-border);
}
.bz-code__copy--ok {
  color: var(--bz-emerald-500);
}
.bz-code__copy .material-symbols-outlined {
  font-size: 16px !important;
}

.bz-code__body {
  margin: 0;
  padding: var(--bz-space-3) var(--bz-space-4);
  background: var(--bz-canvas);
  color: var(--bz-fg);
  font-family: var(--bz-font-mono);
  font-size: 13px;
  line-height: 1.55;
  overflow-x: auto;
  white-space: pre;
  /* Tabular numerics keep diff-style line numbers aligned when used. */
  font-feature-settings: "tnum" 1, "calt" 0;
}

.bz-code__body code {
  background: transparent;
  padding: 0;
  font-family: inherit;
  color: inherit;
  white-space: inherit;
}
</style>
