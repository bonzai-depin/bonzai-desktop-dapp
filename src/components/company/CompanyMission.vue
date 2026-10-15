<template>
  <div class="team-mission company-screen" data-i18n-skip>
    <form class="team-mission__editor" @submit.prevent="save">
      <div class="team-mission__field">
        <label for="team-master-mission">{{ $ui('Master mission') }}</label>
        <p id="mission-hint">{{ $ui('The objective used by the coordinator to plan the team’s work.') }}</p>
        <textarea id="team-master-mission" v-model="draft.mission" rows="7" required minlength="10" :disabled="saving" aria-describedby="mission-hint" />
      </div>
      <div class="team-mission__field">
        <label for="team-standing-instructions">{{ $ui('Standing instructions') }}</label>
        <p id="instructions-hint">{{ $ui('Priorities, constraints and standards for every task.') }}</p>
        <textarea id="team-standing-instructions" v-model="draft.instructions" rows="5" :disabled="saving" aria-describedby="instructions-hint" />
      </div>
      <footer>
        <button class="bz-btn bz-btn--primary" type="submit" :disabled="saving || !dirty || draft.mission.trim().length < 10"><span class="material-symbols-outlined" aria-hidden="true">check</span>{{ $ui(saving ? 'Saving…' : 'Save mission') }}</button>
        <button class="bz-btn bz-btn--ghost" type="button" :disabled="saving || !dirty" @click="reset">{{ $ui('Reset') }}</button>
        <span v-if="saved && !dirty" role="status">{{ $ui('Mission saved') }}</span>
        <span v-else-if="dirty">{{ $ui('Unsaved changes') }}</span>
      </footer>
      <p v-if="error" class="team-mission__error" role="alert">{{ error }}</p>
    </form>
    <aside class="team-mission__outcomes">
      <header><h2>{{ $ui('Active outcomes') }}</h2><span class="bz-metric">{{ activeGoals.length }}</span></header>
      <p v-if="!activeGoals.length">{{ $ui('No active outcomes. Add work in Backlog or brief the team in Chat.') }}</p>
      <ol v-else>
        <li v-for="goal in activeGoals" :key="goal.id"><span class="material-symbols-outlined" aria-hidden="true">flag</span><div><strong>{{ visibleText(goal.title) }}</strong><p v-if="goal.missionAlignment || goal.rationale">{{ visibleText(goal.missionAlignment || goal.rationale) }}</p></div></li>
      </ol>
      <button class="bz-btn bz-btn--ghost" type="button" @click="$emit('open-view', 'issues')">{{ $ui('Open backlog') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
    </aside>
  </div>
</template>

<script setup>
import "./company-design.css";
import { computed, reactive, ref, watch } from 'vue';
import { visibleText } from '../../shared/visibleText.js';
const props = defineProps({ charter: { type: Object, required: true }, goals: { type: Array, default: () => [] }, store: { type: Object, required: true } });
defineEmits(['open-view']);
const draft = reactive({ mission: '', instructions: '' });
const baseline = reactive({ mission: '', instructions: '' });
const saving = ref(false), error = ref(''), saved = ref(false);
let saveRevision = 0;
const dirty = computed(() => draft.mission !== baseline.mission || draft.instructions !== baseline.instructions);
const activeGoals = computed(() => props.goals.filter(goal => goal.status === 'active'));
function reset() {
  saveRevision++; saving.value = false;
  Object.assign(draft, { mission: visibleText(props.charter.mission || ''), instructions: visibleText(props.charter.experience?.instructions || '') });
  Object.assign(baseline, draft); error.value = ''; saved.value = false;
}
watch(() => props.charter.id, reset, { immediate: true });
watch(() => [props.charter.mission, props.charter.experience?.instructions], () => { if (!dirty.value && !saving.value) reset(); });
async function save() {
  if (saving.value || draft.mission.trim().length < 10) return;
  const revision = ++saveRevision;
  saving.value = true; error.value = ''; saved.value = false;
  const mission = draft.mission.trim(), instructions = draft.instructions.trim();
  try {
    // Merge into the current charter, retaining roles, policies and operational settings.
    const next = JSON.parse(JSON.stringify(props.charter));
    next.mission = mission; next.experience = { ...next.experience, instructions };
    await props.store.update(next);
    if (revision !== saveRevision) return;
    Object.assign(draft, { mission, instructions }); Object.assign(baseline, draft); saved.value = true;
  } catch (err) { if (revision === saveRevision) error.value = err.message || String(err); }
  finally { if (revision === saveRevision) saving.value = false; }
}
</script>

<style scoped>
.team-mission { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr); align-items: start; gap: var(--bz-space-7); color: var(--bz-fg); }
.team-mission__editor { display: grid; gap: var(--bz-space-6); min-width: 0; }
.team-mission__field { display: grid; gap: var(--bz-space-2); }
.team-mission__field + .team-mission__field { padding-top: var(--bz-space-6); border-top: 1px solid var(--bz-border); }
.team-mission__editor label { color: var(--bz-fg); font-size: var(--bz-size-h3); line-height: var(--bz-line-tight); font-weight: 400; }
.team-mission p { margin: 0; color: var(--bz-fg-mid); font-size: var(--bz-size-body); line-height: 1.65; overflow-wrap: anywhere; }
.team-mission textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 144px; margin-top: var(--bz-space-2); padding: var(--bz-space-5); background: var(--bz-panel); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-lg); color: var(--bz-fg); font: 400 15px/1.75 var(--bz-font-body); transition: border-color var(--bz-dur-fast), background var(--bz-dur-fast); }
.team-mission textarea:hover:not(:disabled) { border-color: var(--bz-border-brand); }
.team-mission textarea:focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; border-color: var(--bz-accent); background: var(--bz-card); }
.team-mission textarea:disabled { cursor: wait; color: var(--bz-fg-mid); }
.team-mission footer { display: flex; align-items: center; flex-wrap: wrap; gap: var(--bz-space-3); padding-top: var(--bz-space-4); border-top: 1px solid var(--bz-border); }
.team-mission footer > span { font-size: var(--bz-size-meta); color: var(--bz-fg-mid); margin-left: auto; }
.team-mission__outcomes { min-width: 0; border-left: 1px solid var(--bz-border); padding-left: var(--bz-space-6); }
.team-mission__outcomes header { display: flex; justify-content: space-between; gap: var(--bz-space-3); align-items: center; margin-bottom: var(--bz-space-5); }
.team-mission__outcomes h2 { margin: 0; font-size: var(--bz-size-h3); font-family: var(--bz-font-body); font-weight: 400; line-height: var(--bz-line-tight); color: var(--bz-fg); }
.team-mission__outcomes .bz-metric { display: grid; place-items: center; min-width: 36px; min-height: 36px; padding: 0 var(--bz-space-2); border-radius: var(--bz-r); background: var(--bz-raised); font-size: var(--bz-size-h2); }
.team-mission__outcomes ol { list-style: none; padding: 0; margin: 0; }
.team-mission__outcomes li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: var(--bz-space-3); padding: var(--bz-space-5) 0; border-top: 1px solid var(--bz-border); overflow-wrap: anywhere; }
.team-mission__outcomes li > span { color: var(--bz-accent); font-size: 20px; margin-top: 2px; }
.team-mission__outcomes strong { font-size: var(--bz-size-body); font-weight: 500; line-height: 1.5; }
.team-mission__outcomes li p { margin-top: var(--bz-space-2); font-size: var(--bz-size-meta); }
.team-mission__outcomes .bz-btn { margin-top: var(--bz-space-5); }
.team-mission .team-mission__error { color: var(--bz-danger); padding: var(--bz-space-3) var(--bz-space-4); border-radius: var(--bz-r-sm); background: var(--bz-danger-soft); }
@media (max-width: 900px) { .team-mission { grid-template-columns: minmax(0, 1fr); gap: var(--bz-space-6); } .team-mission__outcomes { border-left: 0; border-top: 1px solid var(--bz-border); padding: var(--bz-space-5) 0 0; } }
@media (max-width: 600px) { .team-mission textarea { padding: var(--bz-space-4); } .team-mission footer > span { margin-left: 0; flex-basis: 100%; } }
@media (prefers-reduced-motion: reduce) { .team-mission textarea { transition: none; } }
</style>
