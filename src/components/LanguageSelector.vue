<template>
  <div class="bz-sidebar__theme-picker" role="group" :aria-label="i18n.t('locale.select')">
    <button
      type="button"
      class="bz-sidebar__theme-arrow"
      :title="i18n.t('locale.previous')"
      :aria-label="i18n.t('locale.previous')"
      @click="cycleLocale(-1)"
    >
      <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
    </button>

    <div class="bz-sidebar__theme-display" aria-live="polite">
      <span class="material-symbols-outlined bz-language__icon" aria-hidden="true">language</span>
      <span class="bz-sidebar__theme-name">{{ currentLocale.label }}</span>
    </div>

    <button
      type="button"
      class="bz-sidebar__theme-arrow"
      :title="i18n.t('locale.next')"
      :aria-label="i18n.t('locale.next')"
      @click="cycleLocale(1)"
    >
      <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../i18n/index.js'

const i18n = useI18n()
const currentLocale = computed(() => (
  i18n.supportedLocales.find(item => item.code === i18n.state.locale) || i18n.supportedLocales[0]
))

function cycleLocale(direction) {
  const currentIndex = i18n.supportedLocales.findIndex(item => item.code === i18n.state.locale)
  const nextIndex = (currentIndex + direction + i18n.supportedLocales.length) % i18n.supportedLocales.length
  i18n.setLocale(i18n.supportedLocales[nextIndex].code)
}
</script>

<style scoped>
.bz-language__icon {
  min-height: 10px;
  color: var(--bz-purple-300);
  font-size: 11px;
  line-height: 1;
}
</style>
