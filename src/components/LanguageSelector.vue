<template>
  <label class="bz-language-picker">
    <span class="material-symbols-outlined" aria-hidden="true">language</span>
    <select :value="i18n.state.locale" :aria-label="i18n.t('locale.select')" @change="i18n.setLocale($event.target.value)" data-i18n-skip>
      <option v-for="locale in i18n.supportedLocales" :key="locale.code" :value="locale.code">{{ locale.label }}</option>
    </select>
  </label>
</template>
<script setup>
import { useI18n } from '../i18n/index.js'
const i18n = useI18n()
</script>
<style scoped>
.bz-language-picker { display: flex; align-items: center; gap: 8px; width: 190px; max-width: 100%; min-width: 0; flex-shrink: 0; padding: 8px 10px; box-sizing: border-box; border: 1px solid var(--bz-border); border-radius: var(--bz-r); color: var(--bz-fg); background: var(--bz-panel); }
.bz-language-picker > span { color: var(--bz-accent); font-size: 20px; }
.bz-language-picker select { min-width: 0; width: 100%; border: 0; background: var(--bz-panel); color: var(--bz-fg); font: inherit; font-size: 14px; padding: 4px 0; cursor: pointer; }
.bz-language-picker:focus-within { outline: 2px solid var(--bz-accent); outline-offset: 2px; }
</style>
