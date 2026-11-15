<template>
  <div class="background-settings">
    <p class="background-settings__scope">{{ $ui('These settings apply to every team on this device.') }}</p>
    <label v-for="option in options" :key="option.key" class="background-settings__row">
      <input type="checkbox" role="switch" :checked="values[option.key]" :disabled="!loaded || saving === option.key" @change="save(option, $event.target.checked)" />
      <span><strong>{{ $ui(option.label) }}</strong><small>{{ $ui(option.hint) }}</small></span>
    </label>
    <p v-if="error" class="background-settings__error" role="alert">{{ $ui('This setting could not be saved. Try again.') }}</p>
  </div>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue';
// Device-wide preferences read by the main process (see src/main/backgroundMode.js and ownerAttention.js).
const options = [
  { key: 'company.keepRunningInBackground', fallback: false, label: 'Keep teams running when the window is closed',
    hint: 'BonzAI stays in the system tray while a team is playing. Choose Quit from the tray icon to stop everything.' },
  { key: 'company.ownerNotifications', fallback: true, label: 'Notify me when a team is waiting on me',
    hint: 'Approvals, questions and tasks that need review. Shown when the BonzAI window is not in front.' },
];
const values = reactive(Object.fromEntries(options.map(option => [option.key, option.fallback])));
const loaded = ref(false), saving = ref(''), error = ref(false);
onMounted(async () => {
  try {
    for (const option of options) values[option.key] = (await window.electronAPI.store.get(option.key, option.fallback)) === true;
    loaded.value = true;
  } catch { error.value = true; }
});
async function save(option, checked) {
  const previous = values[option.key];
  saving.value = option.key; error.value = false; values[option.key] = checked;
  try { await window.electronAPI.store.set(option.key, checked); }
  catch { values[option.key] = previous; error.value = true; }
  finally { saving.value = ''; }
}
</script>
<style scoped>
.background-settings { display: grid; gap: var(--bz-space-3); }
.background-settings__scope, .background-settings__error { margin: 0; font-size: 12px; line-height: 1.45; color: var(--bz-fg-mid); }
.background-settings__error { color: var(--bz-danger, #e5484d); }
.background-settings__row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--bz-space-3); align-items: start; padding: var(--bz-space-3); border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); cursor: pointer; }
.background-settings__row:focus-within { border-color: var(--bz-accent); }
.background-settings__row input { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--bz-purple-300); }
.background-settings__row span { display: grid; gap: var(--bz-space-1); min-width: 0; }
.background-settings__row strong { color: var(--bz-fg); font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.background-settings__row small { color: var(--bz-fg-mid); font-size: 12px; line-height: 1.45; }
</style>
