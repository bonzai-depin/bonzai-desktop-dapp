<template>
  <section class="company-planning" data-i18n-skip>
    <!-- Goals whose tasks are done but whose business result the owner has not confirmed. -->
    <form v-for="goal in reviews" :key="goal.id" class="planning-review" @submit.prevent>
      <header>
        <span class="material-symbols-outlined" aria-hidden="true">fact_check</span>
        <span>{{ $t('companyPlan.confirmOutcome') }}</span>
        <span v-if="goal.overdue" class="company-pill company-pill--danger">{{ $t('companyPlan.overdue') }}</span>
      </header>
      <strong>{{ goal.title }}</strong>
      <p v-if="goal.successCriteria">{{ $t('companyPlan.successCriteria') }} · {{ goal.successCriteria }}</p>
      <p v-if="goal.outcome?.cancelledTasks">{{ $t('companyPlan.cancelledTasks') }}</p>
      <label :for="`evidence-${goal.id}`">{{ $t('companyPlan.evidence') }}</label>
      <textarea :id="`evidence-${goal.id}`" v-model.trim="evidence[goal.id]" rows="2" maxlength="2000" :placeholder="$t('companyPlan.evidenceHint')" :disabled="busy === goal.id"></textarea>
      <footer>
        <span v-if="errors[goal.id]" class="planning-error" role="alert">{{ errors[goal.id] }}</span>
        <button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy === goal.id || !canDecide(goal)" @click="decide(goal, false)">{{ $t('companyPlan.notMet') }}</button>
        <button type="button" class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy === goal.id || !canDecide(goal)" @click="decide(goal, true)">{{ $t('companyPlan.met') }}</button>
      </footer>
    </form>

    <div class="planning-head">
      <span class="planning-head__title"><span class="material-symbols-outlined" aria-hidden="true">event_repeat</span>{{ $t('companyPlan.scheduledWork') }} <b class="bz-metric">{{ schedules.length }}</b></span>
      <button v-if="!formOpen" type="button" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="!roles.length" @click="openForm"><span class="material-symbols-outlined" aria-hidden="true">add</span>{{ $t('companyPlan.addSchedule') }}</button>
    </div>
    <p v-if="loadError" class="planning-error" role="alert">{{ loadError }}</p>

    <form v-if="formOpen" class="planning-form" @submit.prevent="createSchedule">
      <label class="planning-field planning-field--wide"><span>{{ $t('companyPlan.title') }}</span><input v-model.trim="draft.title" maxlength="200" required /></label>
      <label class="planning-field planning-field--wide"><span>{{ $t('companyPlan.details') }}</span><textarea v-model.trim="draft.description" rows="2" maxlength="4000"></textarea></label>
      <label class="planning-field"><span>{{ $t('companyPlan.role') }}</span>
        <select v-model="draft.assigneeRole" required><option v-for="role in roles" :key="role" :value="role">{{ roleLabel(role) }}</option></select>
      </label>
      <label class="planning-field"><span>{{ $t('companyPlan.repeats') }}</span>
        <select v-model="draft.every"><option value="day">{{ $t('companyPlan.daily') }}</option><option value="week">{{ $t('companyPlan.weekly') }}</option><option value="month">{{ $t('companyPlan.monthly') }}</option></select>
      </label>
      <label v-if="draft.every === 'week'" class="planning-field"><span>{{ $t('companyPlan.weekday') }}</span>
        <select v-model.number="draft.weekday"><option v-for="(name, index) in weekdays" :key="index" :value="index">{{ name }}</option></select>
      </label>
      <label v-if="draft.every === 'month'" class="planning-field"><span>{{ $t('companyPlan.monthDay') }}</span><input v-model.number="draft.day" type="number" min="1" max="28" step="1" required /></label>
      <label class="planning-field"><span>{{ $t('companyPlan.time') }}</span><input v-model="draft.at" type="time" required /></label>
      <footer>
        <span v-if="formError" class="planning-error" role="alert">{{ formError }}</span>
        <button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="saving" @click="formOpen = false">{{ $t('companyPlan.cancel') }}</button>
        <button class="bz-btn bz-btn--primary bz-btn--sm" :disabled="saving || !draft.title || !draft.assigneeRole">{{ $t('companyPlan.create') }}</button>
      </footer>
    </form>

    <ul v-if="schedules.length" class="planning-list">
      <li v-for="schedule in schedules" :key="schedule.id" :class="{ 'is-paused': !schedule.enabled }">
        <div class="planning-list__main">
          <strong>{{ schedule.title }}</strong>
          <small>{{ roleLabel(schedule.assigneeRole) }} · {{ cadenceLabel(schedule.cadence) }}<template v-if="schedule.enabled"> · {{ $t('companyPlan.nextRun', { date: $d(schedule.nextRunAt) }) }}</template></small>
        </div>
        <label class="planning-toggle">
          <input type="checkbox" role="switch" :checked="schedule.enabled" :disabled="pending === schedule.id" @change="toggle(schedule, $event.target.checked)" />
          <span>{{ schedule.enabled ? $t('companyPlan.active') : $t('companyPlan.paused') }}</span>
        </label>
        <button type="button" class="bz-iconbtn bz-iconbtn--sm" :title="$t('companyPlan.remove')" :aria-label="$t('companyPlan.remove')" :disabled="pending === schedule.id" @click="removeSchedule(schedule)"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
      </li>
    </ul>
    <p v-else-if="!formOpen && !loadError" class="planning-empty">{{ $t('companyPlan.noSchedules') }}</p>
    <p v-if="listError" class="planning-error" role="alert">{{ listError }}</p>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue';
import { useI18n } from '../../i18n/index.js';
import { operationText } from '../../i18n/operations.js';
import { formatRoleTitle } from '../../services/company/presentation.js';
import * as schedulesSvc from '../../services/company/schedules.js';
import * as goalsSvc from '../../services/company/goals.js';

const props = defineProps({ charter: { type: Object, required: true }, goals: { type: Array, default: () => [] } });
const emit = defineEmits(['changed']);
const i18n = useI18n();

const MIN_EVIDENCE = 10;
const roles = computed(() => Object.keys(props.charter.roles || {}).filter(key => props.charter.roles[key]?.companion));
const roleLabel = role => operationText(formatRoleTitle(role), i18n.state.locale);
// 4 January 1970 was a Sunday, matching the cadence's weekday 0.
const weekdays = computed(() => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(i18n.state.locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(1970, 0, 4 + index)))));

// ─── Outcome confirmation ────────────────────────────────────────
const reviews = computed(() => props.goals.filter(goal => goal.status === 'active' && goal.outcome?.status === 'pending_review'));
const evidence = reactive({}), errors = reactive({}), busy = ref('');
const canDecide = goal => (evidence[goal.id] || '').length >= MIN_EVIDENCE;
async function decide(goal, met) {
  busy.value = goal.id; errors[goal.id] = '';
  try {
    await goalsSvc.recordOutcome(props.charter.id, goal.id, { met, evidence: evidence[goal.id] });
    delete evidence[goal.id];
    emit('changed');
  } catch (error) { errors[goal.id] = error.message || String(error); } finally { busy.value = ''; }
}

// ─── Scheduled work ──────────────────────────────────────────────
const schedules = ref([]), loadError = ref(''), listError = ref(''), pending = ref('');
const formOpen = ref(false), formError = ref(''), saving = ref(false);
const draft = reactive({ title: '', description: '', assigneeRole: '', every: 'day', weekday: 1, day: 1, at: '09:00' });
async function load() {
  try { schedules.value = await schedulesSvc.list(props.charter.id); loadError.value = ''; }
  catch (error) { loadError.value = error.message || String(error); }
}
function openForm() {
  Object.assign(draft, { title: '', description: '', assigneeRole: roles.value[0] || '', every: 'day', weekday: 1, day: 1, at: '09:00' });
  formError.value = ''; formOpen.value = true;
}
function cadenceOf() {
  if (draft.every === 'week') return { every: 'week', weekday: draft.weekday, at: draft.at };
  if (draft.every === 'month') return { every: 'month', day: draft.day, at: draft.at };
  return { every: 'day', at: draft.at };
}
function cadenceLabel(cadence = {}) {
  if (cadence.everyMinutes) return i18n.t('companyPlan.cadenceInterval', { minutes: cadence.everyMinutes });
  if (cadence.every === 'week') return i18n.t('companyPlan.cadenceWeekly', { day: weekdays.value[cadence.weekday] || '', time: cadence.at });
  if (cadence.every === 'month') return i18n.t('companyPlan.cadenceMonthly', { day: cadence.day, time: cadence.at });
  return i18n.t('companyPlan.cadenceDaily', { time: cadence.at });
}
async function createSchedule() {
  saving.value = true; formError.value = '';
  try {
    await schedulesSvc.create(props.charter.id, { title: draft.title, description: draft.description, assigneeRole: draft.assigneeRole, cadence: cadenceOf() });
    formOpen.value = false;
    await load();
  } catch (error) { formError.value = error.message || String(error); } finally { saving.value = false; }
}
async function change(schedule, action) {
  pending.value = schedule.id; listError.value = '';
  try { await action(); } catch (error) { listError.value = error.message || String(error); } finally { pending.value = ''; await load(); }
}
const toggle = (schedule, enabled) => change(schedule, () => schedulesSvc.update(props.charter.id, schedule.id, { enabled }));
function removeSchedule(schedule) {
  if (!window.confirm(i18n.t('companyPlan.removeConfirm'))) return;
  return change(schedule, () => schedulesSvc.remove(props.charter.id, schedule.id));
}

watch(() => props.charter.id, () => { formOpen.value = false; schedules.value = []; load(); }, { immediate: true });
// The main process creates due tasks and advances the next run; reflect that without polling.
const stop = schedulesSvc.onChanged(payload => { if (!payload?.companyId || payload.companyId === props.charter.id) load(); });
onBeforeUnmount(stop);
</script>

<style scoped>
.company-planning { display: grid; gap: var(--bz-space-3); margin-bottom: var(--bz-space-5); min-width: 0; color: var(--bz-fg); }
.planning-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--bz-space-3); padding-top: var(--bz-space-3); border-top: 1px solid var(--bz-border); }
.planning-head__title { display: inline-flex; align-items: center; gap: var(--bz-space-2); font-size: var(--bz-size-body); color: var(--bz-fg-mid); }
.planning-head__title .material-symbols-outlined { font-size: 20px; }
.planning-review, .planning-form { display: grid; gap: var(--bz-space-3); padding: var(--bz-space-4); border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); background: var(--bz-panel); min-width: 0; }
.planning-review { border-left: 3px solid var(--bz-accent); }
.planning-review header { display: flex; align-items: center; flex-wrap: wrap; gap: var(--bz-space-2); font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
.planning-review header .material-symbols-outlined { font-size: 20px; color: var(--bz-accent); }
.planning-review strong, .planning-review p, .planning-list strong { overflow-wrap: anywhere; }
.planning-review strong { font-weight: 500; font-size: var(--bz-size-h3); }
.planning-review p { margin: 0; color: var(--bz-fg-mid); font-size: var(--bz-size-body); line-height: 1.6; }
.planning-review label, .planning-field > span { font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
.planning-review textarea, .planning-field input, .planning-field select, .planning-field textarea { width: 100%; box-sizing: border-box; min-width: 0; }
.planning-form { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); align-items: end; }
.planning-field { display: grid; gap: var(--bz-space-1); min-width: 0; }
.planning-field--wide, .planning-form footer { grid-column: 1 / -1; }
.planning-review footer, .planning-form footer { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: var(--bz-space-2); }
.planning-error { margin: 0 auto 0 0; color: var(--bz-danger); font-size: var(--bz-size-meta); overflow-wrap: anywhere; }
.planning-empty { margin: 0; color: var(--bz-fg-mid); font-size: var(--bz-size-body); }
.planning-list { list-style: none; margin: 0; padding: 0; display: grid; }
.planning-list li { display: flex; align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-3) 0; border-top: 1px solid var(--bz-border); min-width: 0; }
.planning-list li:first-child { border-top: 0; }
.planning-list__main { display: grid; gap: var(--bz-space-1); flex: 1; min-width: 0; }
.planning-list strong { font-weight: 500; font-size: var(--bz-size-body); }
.planning-list small { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); overflow-wrap: anywhere; }
.planning-list li.is-paused strong { color: var(--bz-fg-mid); }
.planning-toggle { display: inline-flex; align-items: center; gap: var(--bz-space-2); flex: none; font-size: var(--bz-size-meta); color: var(--bz-fg-mid); cursor: pointer; }
.planning-toggle input { accent-color: var(--bz-accent); }
@media (max-width: 600px) { .planning-list li { flex-wrap: wrap; } .planning-list__main { flex-basis: 100%; } }
</style>
