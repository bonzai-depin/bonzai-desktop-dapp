<template>
  <section class="bz-download-requirement" :class="{ 'is-error': !!error }" :aria-busy="active" :aria-label="heading">
    <div class="bz-download-requirement__head">
      <span class="material-symbols-outlined bz-download-requirement__icon" aria-hidden="true">{{ error ? 'error_outline' : 'download' }}</span>
      <p class="bz-download-requirement__title">{{ heading }}</p>
      <div class="bz-download-requirement__actions">
        <span v-if="active" class="bz-download-requirement__percent" role="status">{{ percent }}%</span>
        <button v-if="active && cancellable" type="button" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="cancelling" @click="$emit('cancel')">{{ $t('common.cancel') }}</button>
        <button v-if="!active" type="button" class="bz-btn bz-btn--primary bz-btn--sm" :disabled="disabled" @click="$emit('download')">
          {{ actionLabel || $t('common.download') }}
        </button>
      </div>
    </div>
    <ul v-if="entries.length && !(active && taskEntries.length)" class="bz-download-requirement__list">
      <li v-for="entry in entries" :key="entry.name || entry.category">
        <span class="material-symbols-outlined bz-download-requirement__crate" aria-hidden="true">inventory_2</span>
        <span class="bz-download-requirement__name">{{ entry.name || categoryLabel(entry.category) }}</span>
        <span v-if="entry.size" class="bz-mono bz-download-requirement__meta">{{ entry.size }}</span>
      </li>
    </ul>
    <progress v-if="active" class="bz-download-requirement__progress" :value="percent" max="100" :aria-label="heading" />
    <ul v-if="active && tasks.length" class="bz-download-requirement__list bz-download-requirement__tasks">
      <li v-for="task in taskEntries" :key="task.name || task.category">
        <span class="material-symbols-outlined bz-download-requirement__crate" aria-hidden="true">inventory_2</span>
        <span class="bz-download-requirement__name">{{ task.name || categoryLabel(task.category) }}</span>
        <span v-if="task.status !== 'downloading'" class="bz-download-requirement__meta bz-download-requirement__status" data-i18n-skip>{{ taskStatusLabels[task.status] }}</span>
        <span class="bz-download-requirement__percent">{{ task.progress }}%</span>
      </li>
    </ul>
    <p v-if="error" class="bz-download-requirement__error" role="alert">{{ displayError }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from '../i18n/index.js';
import { downloadItems, downloadTasks, downloadPercent } from '../utils/downloadPresentation.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  category: { type: String, default: 'resources' },
  active: Boolean,
  cancellable: Boolean,
  cancelling: Boolean,
  progress: { type: Number, default: 0 },
  tasks: { type: Array, default: () => [] },
  disabled: Boolean,
  error: { type: String, default: '' },
  title: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
});
defineEmits(['download', 'cancel']);
const { t } = useI18n();
const heading = computed(() => props.title || t(props.active ? 'create.downloading' : 'create.downloadRequired'));
const entries = computed(() => downloadItems(props.items, props.category));
const taskEntries = computed(() => downloadTasks(props.tasks, props.items, props.category));
const taskStatusLabels = computed(() => ({ downloading: t('rcDownloads.downloading'), completed: t('rcDownloads.completed'), failed: t('rcDownloads.failed') }));
const categoryLabel = category => t('rcDownloads.categories.' + category).toLowerCase();
const displayError = computed(() => props.error === t('rcDownloads.authRequired') ? props.error : t('rcDownloads.downloadFailed'));
const percent = computed(() => downloadPercent(props.progress));
</script>

<style scoped>
.bz-download-requirement {
  --download-accent: var(--bz-accent);
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  container-type: inline-size;
  margin-block: var(--bz-space-3, 12px);
  padding: var(--bz-space-4, 16px);
  border: 1px solid color-mix(in srgb, var(--download-accent) 65%, var(--bz-border-strong));
  border-inline-start: 4px solid var(--download-accent);
  border-radius: var(--bz-radius-md, 10px);
  background: color-mix(in srgb, var(--download-accent) 12%, var(--bz-panel));
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body, 14px);
  line-height: 1.5;
}
.bz-download-requirement.is-error { --download-accent: var(--bz-danger); }
.bz-download-requirement__head { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: var(--bz-space-3, 12px); }
.bz-download-requirement__actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--bz-space-3, 12px); }
.bz-download-requirement__actions button { flex-shrink: 0; }
.bz-download-requirement__icon {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: var(--bz-radius-sm, 6px);
  background: color-mix(in srgb, var(--download-accent) 18%, var(--bz-panel));
  color: var(--download-accent);
  font-size: 22px;
}
.is-error .bz-download-requirement__icon { color: var(--bz-danger); }
.bz-download-requirement__title { margin: 0; flex: 1; min-width: 0; font-weight: 900; font-style: italic; font-family: 'Fira Sans Condensed', sans-serif; font-size: 18px; line-height: 1.4; color: var(--bz-fg); }
.bz-download-requirement__list { list-style: none; margin: var(--bz-space-4, 16px) 0 0; padding: 0; display: grid; gap: var(--bz-space-2, 8px); font-size: 12px; }
.bz-download-requirement__list li { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; column-gap: var(--bz-space-3, 12px); row-gap: var(--bz-space-1, 4px); align-items: start; min-width: 0; padding-block: var(--bz-space-1, 4px); }
.bz-download-requirement__name { min-width: 0; overflow-wrap: anywhere; text-transform: lowercase; }
.bz-download-requirement__percent { font-family: 'Fira Sans Condensed', sans-serif; font-style: italic; font-weight: 900; font-size: 16px; font-variant-numeric: tabular-nums; }
.bz-download-requirement__crate { font-size: 16px; color: var(--bz-fg-mid); justify-self: center; margin-top: 1px; }
.bz-download-requirement__meta { color: var(--bz-fg-mid); text-align: end; }
.bz-download-requirement__list .bz-download-requirement__meta,
.bz-download-requirement__list .bz-download-requirement__percent { grid-column: 3; grid-row: 1; }
.bz-download-requirement__tasks .bz-download-requirement__status { grid-column: 2; grid-row: 2; text-align: start; }
.bz-download-requirement__tasks { max-height: 180px; overflow: auto; }
.bz-download-requirement__progress { display: block; width: 100%; height: 6px; margin-top: var(--bz-space-4, 16px); border: 0; accent-color: var(--download-accent); border-radius: var(--bz-radius-pill, 99px); overflow: hidden; }
.bz-download-requirement__progress::-webkit-progress-bar { background: var(--bz-raised); }
.bz-download-requirement__progress::-webkit-progress-value { background: var(--download-accent); }
.bz-download-requirement__error { color: color-mix(in srgb, var(--bz-danger) 70%, var(--bz-fg)); margin: var(--bz-space-4, 16px) 0 0; font-size: 12px; overflow-wrap: anywhere; }
@container (max-width: 440px) {
  .bz-download-requirement__head { grid-template-columns: 36px minmax(0, 1fr); }
  .bz-download-requirement__actions { grid-column: 2; justify-content: flex-start; flex-wrap: wrap; }
}
</style>
