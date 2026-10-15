<template>
  <Teleport :to="host">
    <section v-if="target" ref="panel" popover="manual" class="bz-calendar" data-i18n-skip role="dialog" aria-modal="true" :aria-label="t('Choose a date', 'Choisir une date')" :style="position" @keydown="onPanelKey">
      <header>
        <button type="button" :aria-label="t('Previous month','Mois précédent')" @click="moveMonth(-1)"><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
        <select v-model.number="month" :aria-label="t('Month','Mois')"><option v-for="(name, index) in months" :key="index" :value="index">{{ name }}</option></select>
        <input v-model.number="year" type="number" min="1" max="9999" :aria-label="t('Year','Année')" @change="year = Math.min(9999, Math.max(1, Number(year) || new Date().getFullYear()))" />
        <button type="button" :aria-label="t('Next month','Mois suivant')" @click="moveMonth(1)"><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
      </header>
      <div class="bz-calendar__week" aria-hidden="true"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
      <div class="bz-calendar__days" role="grid" :aria-label="`${months[month]} ${year}`">
        <button v-for="day in days" :key="day.value" type="button" role="gridcell" :data-date="day.value" :tabindex="day.value === focusDate ? 0 : -1" :aria-label="day.label" :aria-selected="day.value === selected" :aria-current="day.value === today ? 'date' : undefined" :disabled="day.disabled" :class="{'is-outside':day.outside}" @click="choose(day.value)" @keydown="navigate($event, day)">{{ day.number }}</button>
      </div>
      <div v-if="hasTime" class="bz-calendar__time">
        <div class="bz-calendar__time-title"><span class="material-symbols-outlined" aria-hidden="true">schedule</span>{{ t('Time','Heure') }}<small>24h</small></div>
        <div class="bz-calendar__time-fields">
          <label v-for="unit in timeUnits" :key="unit.key" class="bz-calendar__time-unit">
            <span>{{ unit.label }}</span>
            <div class="bz-calendar__time-control">
              <input v-model="clock[unit.key]" type="number" min="0" :max="unit.max" :step="unit.key === 'second' ? secondStep : 1" :aria-label="unit.label" @input="error = ''" @blur="formatUnit(unit.key)" />
              <div>
                <button type="button" :aria-label="`${t('Increase','Augmenter')} ${unit.label}`" @click="adjustTime(unit, 1)"><span class="material-symbols-outlined" aria-hidden="true">keyboard_arrow_up</span></button>
                <button type="button" :aria-label="`${t('Decrease','Diminuer')} ${unit.label}`" @click="adjustTime(unit, -1)"><span class="material-symbols-outlined" aria-hidden="true">keyboard_arrow_down</span></button>
              </div>
            </div>
          </label>
        </div>
      </div>
      <p v-if="error" class="bz-calendar__error" role="alert">{{ error }}</p>
      <footer>
        <button type="button" :disabled="!dateAllowed(today)" @click="choose(today)">{{ t('Today','Aujourd’hui') }}</button>
        <button v-if="!target.required" type="button" @click="clearDraft">{{ t('Clear','Effacer') }}</button>
        <span></span>
        <button type="button" @click="close()">{{ t('Cancel','Annuler') }}</button>
        <button class="is-primary" type="button" @click="apply">{{ t('Apply','Appliquer') }}</button>
      </footer>
    </section>
  </Teleport>
</template>

<script setup>
import { computed, reactive, nextTick, onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import { i18n } from '../i18n/index.js';
// Enhance existing native inputs, including schema-generated forms. Keeping the
// original input preserves Vue models, browser validity and local date strings.
const host = shallowRef('body');
const target = shallowRef(null), panel = ref(null), position = ref({}), month = ref(0), year = ref(2026);
const selected = ref(''), cursor = ref(''), cleared = ref(false), error = ref('');
const clock = reactive({hour:'09', minute:'00', second:'00'});
const locale = computed(() => i18n.locale.value || 'en');
const t = (en, fr) => String(locale.value).startsWith('fr') ? fr : en;
const pad = n => String(n).padStart(2, '0');
const dateString = d => `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function localDate(value) { const [y,m,d] = value.split('-').map(Number); const result = new Date(0); result.setFullYear(y,m-1,d); result.setHours(12,0,0,0); return result; }
const today = dateString(new Date());
const hasTime = computed(() => target.value?.type === 'datetime-local');
const showSeconds = computed(() => target.value?.step === 'any' || (Number(target.value?.step || 60) % 60 !== 0) || (target.value?.value.split('T')[1]?.split(':').length || 0) > 2);
const secondStep = computed(() => Number(target.value?.step) > 0 && Number(target.value.step) < 1 ? Number(target.value.step) : 1);
const timeUnits = computed(() => [{key:'hour',label:t('Hour','Heure'),max:23},{key:'minute',label:t('Minute','Minute'),max:59}, ...(showSeconds.value ? [{key:'second',label:t('Second','Seconde'),max:59.999}] : [])]);
function formatUnit(key) {if(clock[key] !== '' && Number.isFinite(Number(clock[key]))) clock[key] = pad(clock[key]);}
function adjustTime(unit, direction) {
  const limit = unit.key === 'hour' ? 24 : 60;
  const step = unit.key === 'second' ? secondStep.value : 1;
  clock[unit.key] = pad(Number(((Number(clock[unit.key] || 0) + direction * step + limit) % limit).toFixed(3)));
  error.value = '';
}
function clearDraft() { selected.value='';cleared.value=true;error.value=''; }

const months = computed(() => Array.from({length:12},(_,m)=> new Intl.DateTimeFormat(locale.value,{month:'long'}).format(new Date(2024,m,1))));
const weekdays = computed(() => Array.from({length:7},(_,i)=> new Intl.DateTimeFormat(locale.value,{weekday:'short'}).format(new Date(2024,0,1+i))));
function dateAllowed(value) {
  return (!target.value?.min || value >= target.value.min.slice(0,10)) && (!target.value?.max || value <= target.value.max.slice(0,10));
}
const days = computed(() => {
  const start=localDate(`${year.value || 2026}-${pad(month.value+1)}-01`);
  start.setDate(start.getDate()-((start.getDay()+6)%7));
  return Array.from({length:42},(_,i)=>{
    const d=new Date(start);d.setDate(start.getDate()+i);const value=dateString(d);
    return {value,number:d.getDate(),outside:d.getMonth()!==month.value,disabled:!dateAllowed(value),label:new Intl.DateTimeFormat(locale.value,{dateStyle:'full'}).format(d)};
  });
});
const focusDate = computed(() => days.value.some(day => day.value === cursor.value && !day.disabled) ? cursor.value : days.value.find(day => !day.outside && !day.disabled)?.value);
function showMonth(value) { const d=localDate(value);month.value=d.getMonth();year.value=d.getFullYear(); }
function moveMonth(delta) { const d=localDate(`${year.value}-${pad(month.value+1)}-01`);d.setMonth(d.getMonth()+delta);if(d.getFullYear()<1 || d.getFullYear()>9999)return;showMonth(dateString(d));cursor.value=dateString(d); }
function place() {
  if(!target.value?.isConnected){close(false);return;}
  const r=target.value.getBoundingClientRect(), width=Math.min(340,window.innerWidth-24), height=panel.value?.offsetHeight || 390;
  const top=r.bottom+8+height<=innerHeight-12 ? r.bottom+8 : Math.max(12,r.top-height-8);
  position.value={left:`${Math.max(12,Math.min(r.left,innerWidth-width-12))}px`,top:`${top}px`,width:`${width}px`,maxHeight:`${innerHeight-24}px`};
}
async function open(input) {
  if(target.value || input.disabled || input.readOnly)return;
  host.value=input.closest('dialog, [role=dialog]') || document.body;
  target.value=input;selected.value=input.value.slice(0,10);cleared.value=false;
  const parts=(input.value.split('T')[1] || '09:00').split(':');
  clock.hour=parts[0];clock.minute=parts[1];clock.second=parts[2] || '00';error.value='';
  cursor.value=selected.value || today;
  if(input.min && cursor.value<input.min.slice(0,10))cursor.value=input.min.slice(0,10);
  if(input.max && cursor.value>input.max.slice(0,10))cursor.value=input.max.slice(0,10);
  showMonth(cursor.value);place();await nextTick();panel.value?.showPopover();place();
  panel.value?.querySelector(`[data-date="${cursor.value}"]`)?.focus({preventScroll:true});
}
function close(restore=true) {const input=target.value;target.value=null;if(restore && input?.isConnected)input.focus({preventScroll:true});}
function commit(value) {
  const input=target.value;if(!input?.isConnected)return close(false);
  // Check constraints without touching the live model until the choice is valid.
  const probe=input.cloneNode();probe.value=value;
  if(!probe.checkValidity()){error.value=probe.validationMessage;return;}
  input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close();
}
function choose(value) {if(!dateAllowed(value))return;selected.value=value;cursor.value=value;cleared.value=false;showMonth(value);error.value='';}
function apply() {
  if(cleared.value) return commit('');
  if(!selected.value){error.value=t('Choose a date.','Choisissez une date.');return;}
  if(!hasTime.value) return commit(selected.value);
  if(timeUnits.value.some(unit=>clock[unit.key] === '' || !Number.isFinite(Number(clock[unit.key])) || Number(clock[unit.key])<0 || Number(clock[unit.key])>unit.max || (unit.key !== 'second' && !Number.isInteger(Number(clock[unit.key]))))) {
    error.value=t('Enter a valid time.','Saisissez une heure valide.');return;
  }
  const seconds = Number(clock.second);
  const secondText = pad(Math.floor(seconds)) + (seconds % 1 ? String(seconds).slice(String(seconds).indexOf('.')) : '');
  commit(`${selected.value}T${pad(Number(clock.hour))}:${pad(Number(clock.minute))}${showSeconds.value ? ':'+secondText : ''}`);
}
async function navigate(event,day) {
  const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
  if(delta===undefined)return;event.preventDefault();const d=localDate(day.value);d.setDate(d.getDate()+delta);const value=dateString(d);if(!dateAllowed(value))return;
  cursor.value=value;showMonth(value);await nextTick();panel.value?.querySelector(`[data-date="${value}"]`)?.focus();
}
function onPanelKey(event) {if(event.key==='Enter' && event.target.tagName==='INPUT'){event.preventDefault();event.stopPropagation();}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();}}
function isDateInput(el) {return el instanceof HTMLInputElement && ['date','datetime-local'].includes(el.type);}
function onClick(event) {
  if(panel.value?.contains(event.target))return;
  if(target.value){event.preventDefault();event.stopImmediatePropagation();return;}
  if(isDateInput(event.target)){event.preventDefault();open(event.target);}
}
function onKey(event) {
  if(target.value && event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();return;}
  if(target.value && event.key==='Tab') {
    const items=[...panel.value.querySelectorAll('button, input, select')].filter(el=>!el.disabled && el.tabIndex>=0);
    const first=items[0], last=items.at(-1);
    if(!panel.value.contains(document.activeElement) || (event.shiftKey && document.activeElement===first) || (!event.shiftKey && document.activeElement===last)) {
      event.preventDefault();(event.shiftKey ? last : first)?.focus();
    }
    return;
  }
  if(isDateInput(event.target) && (event.key==='F4' || (event.altKey && event.key==='ArrowDown'))){event.preventDefault();open(event.target);}
}
function onFocus(event) {
  if(target.value && panel.value?.matches(':popover-open') && !panel.value.contains(event.target)) panel.value.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
onMounted(()=>{document.addEventListener('focusin',onFocus);document.addEventListener('click',onClick,true);document.addEventListener('keydown',onKey,true);window.addEventListener('resize',place);document.addEventListener('scroll',place,true);});
onBeforeUnmount(()=>{document.removeEventListener('focusin',onFocus);document.removeEventListener('click',onClick,true);document.removeEventListener('keydown',onKey,true);window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);});
</script>

<style>
.bz-calendar {position:fixed;margin:0;inset:auto;z-index:2147483000;box-sizing:border-box;padding:16px;border:1px solid var(--bz-border-strong);border-radius:var(--bz-r-lg);background:var(--bz-panel);color:var(--bz-fg);font:14px/1.4 var(--bz-font-body);box-shadow:0 12px 36px #0003;overflow:auto;}
.bz-calendar header,.bz-calendar footer {display:flex;align-items:center;gap:6px;}
.bz-calendar header {margin-bottom:16px;}
.bz-calendar header select {flex:1;min-width:0;text-transform:capitalize;}
.bz-calendar header input {width:76px;}
.bz-calendar :is(input,select) {box-sizing:border-box;min-height:36px;border:1px solid var(--bz-border);border-radius:var(--bz-r-sm);background:var(--bz-canvas);color:var(--bz-fg);padding:6px;font:inherit;}
.bz-calendar button {display:flex;align-items:center;justify-content:center;min-width:32px;min-height:36px;padding:6px;border:1px solid transparent;border-radius:var(--bz-r-sm);background:transparent;color:var(--bz-fg);font:inherit;cursor:pointer;}
.bz-calendar button:hover:not(:disabled) {background:var(--bz-raised);border-color:var(--bz-border-strong);}
.bz-calendar button:focus-visible {outline:0;border-color:var(--bz-accent);}
.bz-calendar button:disabled {opacity:.35;cursor:default;}
.bz-calendar__week,.bz-calendar__days {display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;}
.bz-calendar__week {text-align:center;font-size:11px;color:var(--bz-fg-mid);margin-bottom:8px;}
.bz-calendar__days button.is-outside {color:var(--bz-fg-mid);}
.bz-calendar__days button[aria-current=date] {border-color:var(--bz-border-strong);}
.bz-calendar button[aria-selected=true],.bz-calendar button.is-primary {background:var(--bz-accent-soft);border-color:var(--bz-accent);color:var(--bz-fg);}
.bz-calendar__time {margin-top:16px;padding-top:16px;border-top:1px solid var(--bz-border);}
.bz-calendar__time-title {display:flex;align-items:center;gap:8px;color:var(--bz-fg);font-size:13px;margin-bottom:12px;}
.bz-calendar__time-title .material-symbols-outlined {font-size:18px;color:var(--bz-fg-mid);}
.bz-calendar__time-title small {margin-left:auto;color:var(--bz-fg-mid);font-size:11px;}
.bz-calendar__time-fields {display:flex;gap:12px;}
.bz-calendar__time-unit {flex:1;min-width:0;display:grid;gap:6px;}
.bz-calendar__time-unit > span {font-size:11px;color:var(--bz-fg-mid);}
.bz-calendar__time-control {display:flex;align-items:center;background:var(--bz-canvas);border:1px solid var(--bz-border);border-radius:var(--bz-r-sm);overflow:hidden;}
.bz-calendar__time-control:focus-within {border-color:var(--bz-accent);}
.bz-calendar .bz-calendar__time-control input {width:100%;min-width:0;padding:10px;border:0;background:transparent;text-align:center;font-size:22px;font-variant-numeric:tabular-nums;appearance:textfield;}
.bz-calendar__time-control input::-webkit-inner-spin-button,.bz-calendar__time-control input::-webkit-outer-spin-button {appearance:none;margin:0;}
.bz-calendar .bz-calendar__time-control button {min-height:24px;height:24px;min-width:30px;padding:0;border:0;border-radius:0;}
.bz-calendar__time-control button .material-symbols-outlined {font-size:18px;}
.bz-calendar__error {color:var(--bz-danger);margin:10px 0;}
.bz-calendar footer {border-top:1px solid var(--bz-border);margin-top:14px;padding-top:10px;font-size:12px;}
.bz-calendar footer > span {flex:1;}
</style>
