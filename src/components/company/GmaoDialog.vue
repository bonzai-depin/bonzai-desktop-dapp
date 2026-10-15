<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      data-i18n-skip
      class="ops-dialog company-screen"
      :aria-labelledby="titleId"
      @cancel.prevent="!busy && $emit('close')"
      @click="backdrop"
    >
      <header class="ops-dialog__head">
        <div>
          <small v-if="eyebrow">{{ eyebrow }}</small>
          <h2 :id="titleId" class="fira-sans-condensed-black-italic">
            {{ title }}
          </h2>
        </div>
        <button
          class="bz-btn bz-btn--ghost ops-dialog__close"
          :disabled="busy"
          :aria-label="$t('common.close')"
          @click="$emit('close')"
        >
          <span class="material-symbols-outlined" aria-hidden="true"
            >close</span
          >
        </button>
      </header>
      <div class="ops-dialog__body"><slot /></div></dialog
  ></Teleport>
</template>
<script setup>
import "./company-design.css";
import { ref, onMounted, onBeforeUnmount, getCurrentInstance } from "vue";
const props = defineProps({ title: String, eyebrow: String, busy: Boolean });
const emit = defineEmits(["close"]);
const dialog = ref(null);
const titleId = `ops-dialog-${getCurrentInstance().uid}`;
let previous;
onMounted(() => {
  previous = document.activeElement;
  dialog.value.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  previous?.focus?.();
});
function backdrop(e) {
  if (e.target === dialog.value && !props.busy) {
    const b = dialog.value.getBoundingClientRect();
    if (
      e.clientX < b.left ||
      e.clientX > b.right ||
      e.clientY < b.top ||
      e.clientY > b.bottom
    )
      emit("close");
  }
}
</script>
<style scoped>
.ops-dialog {
  box-sizing: border-box;
  width: min(800px, calc(100vw - 40px));
  max-height: min(900px, calc(100dvh - 48px));
  padding: 0;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-lg);
  background: var(--bz-card);
  color: var(--bz-fg);
  box-shadow: var(--bz-elev-2);
  font: 400 14px/1.6 var(--bz-font-body);
  overflow: hidden;
}
.ops-dialog[open] {
  display: flex;
  flex-direction: column;
  animation: ops-dialog-enter var(--bz-dur-base, 200ms) var(--bz-ease-out);
}
.ops-dialog::backdrop {
  background: var(--bz-overlay);
  backdrop-filter: blur(9px);
}
.ops-dialog__head {
  flex: 0 0 auto;
  padding: 24px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--bz-border);
}
.ops-dialog__head > div {
  min-width: 0;
}
.ops-dialog__head h2 {
  font: italic 900 27px/1.2 var(--bz-font-metric);
  margin: 0;
  overflow-wrap: anywhere;
  text-transform: none;
}
.ops-dialog__head small {
  display: block;
  font-size: 12px;
  margin-bottom: 6px;
  color: var(--bz-fg-mid);
}
.ops-dialog__close {
  flex: 0 0 36px;
  width: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: var(--bz-r-sm);
}
.ops-dialog__body {
  padding: 28px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.ops-dialog :deep(:is(button, a, summary):focus-visible) {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.ops-dialog :deep(:is(input, select, textarea):focus-visible) { outline: 0; box-shadow: none; border-color: var(--bz-accent); }
@keyframes ops-dialog-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .ops-dialog[open] { animation: none; }
}
@media (max-width: 520px) {
  .ops-dialog {
    width: calc(100vw - 24px);
    max-height: calc(100dvh - 24px);
  }
  .ops-dialog__head,
  .ops-dialog__body {
    padding: 20px;
  }
  .ops-dialog__head h2 { font-size: 24px; }
}
</style>
