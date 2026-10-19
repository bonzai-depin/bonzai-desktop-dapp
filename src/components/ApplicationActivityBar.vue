<template>
  <section data-i18n-skip ref="bar" class="app-activity" :class="{ 'is-starting': serverLoading }" :aria-label="$ui('Activity')" @keydown.esc="closePanel">
    <div class="app-activity__strip">
      <button class="app-activity__overview" :aria-label="$ui('Activity')" :aria-expanded="open" aria-controls="application-activity-panel" @click="open = !open"><span class="material-symbols-outlined" aria-hidden="true">{{ attention.length ? 'notifications_active' : active.length ? 'graphic_eq' : 'check_circle' }}</span><span>{{ $ui('Activity') }}</span><strong v-if="active.length">{{ active.length }}</strong></button>
      <div ref="lane" class="app-activity__lane">
        <button v-for="op in visible" :key="op.id" class="app-activity__chip" :class="{ 'is-server-loading': op.id === 'server' && op.status === 'running', 'is-running': op.status === 'running' }" :title="title(op)" @click="select(op)">
          <span class="material-symbols-outlined" :class="{ 'is-warning': needsAttention(op) }" aria-hidden="true">{{ icon(op) }}</span>
          <span v-if="op.status === 'running'" class="app-activity__running-dot" aria-hidden="true" />
          <span class="app-activity__chip-title">{{ title(op) }}</span>
          <span v-if="elapsed(op)" class="app-activity__chip-elapsed">{{ elapsed(op) }}</span>
          <span class="app-activity__chip-stage">{{ $ui(stage(op)) }}</span>
          <span v-if="op.progress != null && op.status === 'running'" class="app-activity__pct bz-metric">{{ Math.round(op.progress) }}%</span>
        </button>
        <span v-if="!visible.length" class="app-activity__quiet">{{ $ui(attention.length ? 'Needs attention' : queued.length ? 'Queued' : 'Ready') }}<span v-if="monitoring.length"> · {{ monitoring.length }} {{ $ui('Monitoring') }}</span></span>
      </div>
      <div class="app-activity__controls">
        <button v-if="heartbeat" class="app-activity__heartbeat" :class="{ 'is-enabled': skills.autonomousMode }" :title="`${heartbeat.title} · ${heartbeat.stage}`" :aria-label="`Heartbeat · ${heartbeat.title} · ${heartbeat.stage}`" @click="select(heartbeat)"><span class="material-symbols-outlined" aria-hidden="true">{{ skills.isGeneratingAutonomous ? 'autorenew' : 'favorite' }}</span><span>Heartbeat</span><span class="heartbeat-summary">{{ heartbeat.stage }}</span></button>
        <button v-if="active.length > capacity" class="app-activity__summary" @click="open = true">+{{ active.length - capacity }}</button>
        <button v-if="queued.length" class="app-activity__summary" @click="activeFilter = 'queued'; open = true">{{ queued.length }} <span>{{ $ui('Queued') }}</span></button>
        <button v-if="attention.length" class="app-activity__summary is-warning" :aria-label="$ui('Needs attention')" @click="select(attention[0])"><span class="material-symbols-outlined" aria-hidden="true">error_outline</span>{{ attention.length }}</button>
        <button ref="toggle" class="bz-iconbtn" :aria-label="$ui('Activity')" :aria-expanded="open" aria-controls="application-activity-panel" @click="open = !open"><span class="material-symbols-outlined" aria-hidden="true">view_list</span></button>
      </div>
    </div>
    <div v-if="serverLoading" class="app-activity__startup" role="progressbar" :aria-label="$ui('Starting BonzAI')" :aria-valuetext="$ui(stage(serverLoading))" aria-busy="true"><span /></div>
    <section v-if="open" id="application-activity-panel" class="app-activity__panel" :aria-label="$ui('Activity')">
      <header><h2>{{ $ui('Activity') }}</h2><button class="bz-iconbtn" :aria-label="$ui('Close')" @click="closePanel"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></header>
      <nav class="activity-filters" :aria-label="$ui('Activity')"><button v-for="filter in filters" :key="filter.id" :aria-pressed="activeFilter === filter.id" @click="activeFilter = filter.id">{{ $ui(filter.label) }}<span>{{ filter.count }}</span></button></nav>
      <button v-if="finished.length" class="bz-btn bz-btn--ghost bz-btn--sm activity-clear" @click="finished.forEach(dismiss)">{{ $ui('Clear finished') }}</button>
      <p v-if="!filteredGroups.length && rows.length" class="app-activity__empty">{{ $ui('No operations in this category') }}</p>
      <p v-if="!rows.length" class="app-activity__empty">{{ $ui('No operations running') }}</p>
      <div v-for="group in filteredGroups" :key="group.label" class="app-activity__group">
        <h3>{{ $ui(group.label) }} <span>{{ group.items.length }}</span></h3>
        <article v-for="op in group.items" :key="op.id" :data-operation-id="op.id" class="app-activity__item" :class="{'is-selected':selected === op.id}">
          <div class="app-activity__item-heading"><span class="material-symbols-outlined" :class="{'is-warning':needsAttention(op)}" aria-hidden="true">{{ icon(op) }}</span><div><strong>{{ title(op) }}</strong><p>{{ $ui(op.location || '') }}<span v-if="op.subtitle"> · {{ op.subtitle }}</span></p></div><span class="app-activity__elapsed">{{ elapsed(op) }}</span></div>
          <div class="app-activity__stage"><span>{{ $ui(stage(op)) }}</span><span v-if="op.step != null && op.total">{{ op.step }} / {{ op.total }}</span></div>
          <progress v-if="op.status==='running' && op.progress != null" :value="op.progress" max="100" :aria-label="title(op)" />
          <p v-if="op.approvals" class="app-activity__error">{{ op.approvals }} · {{ $ui('Awaiting review') }}</p>
          <p v-if="op.error" class="app-activity__error">{{ op.error }}</p>
          <div v-if="op.id === 'roleplay:away'" class="heartbeat-settings">
            <label v-for="field in heartbeatFields" :key="field.key">{{ field.label }}<select :value="skills.autonomousConfig[field.key]" :disabled="skills.autonomousMode || skills.isGeneratingAutonomous" @change="changeHeartbeat(field.key, $event)"><option v-for="value in field.values" :key="value" :value="value">{{ value }} {{ field.key === 'maxMessages' ? 'updates' : 'min' }}</option></select></label>
            <p>Private conversation updates. BonzAI must stay open and the device awake. Pause to change the schedule.</p>
          </div>
          <div class="app-activity__actions">
            <button v-if="op.teamId" class="bz-btn bz-btn--ghost bz-btn--sm" @click="navigate(op)">{{ $ui('Open team') }}</button>
            <button v-else-if="op.mode" class="bz-btn bz-btn--ghost bz-btn--sm" @click="navigate(op)">{{ $ui(op.mode==='roleplay'?'Open conversation':'Open') }}</button>
            <button v-if="op.id === 'roleplay:away' && skills.autonomousMode" class="bz-btn bz-btn--ghost bz-btn--sm" @click="skills.toggleAutonomousMode(false)">{{ $ui('Pause heartbeat') }}</button>
            <button v-if="op.id === 'roleplay:away' && !skills.autonomousMode" class="bz-btn bz-btn--primary bz-btn--sm" :disabled="skills.isGeneratingAutonomous" @click="skills.toggleAutonomousMode(true, { resume: true })">{{ skills.autonomousMessageCount >= skills.autonomousConfig.maxMessages ? 'Start new cycle' : 'Resume heartbeat' }}</button>
            <button v-if="op.id==='server' && server.canRetry" class="bz-btn bz-btn--primary bz-btn--sm" @click="$emit('retry-server')">{{ $ui('Retry') }}</button>
            <button v-if="isTerminal(op.status)" class="bz-iconbtn" :aria-label="$ui('Dismiss')" @click="dismiss(op)"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import activity, { reportOperation, dismissOperation, startActivityTracking } from '../stores/activityStore.js';
import { orderOperations, terminal as isTerminal } from '../services/activity/operations.js';
import companyStore from '../stores/companyStore.js';
import * as company from '../services/company.service.js';
import { actionDisplayName } from '../services/company/actionLabels.js';
import { heartbeatActivity, heartbeatConfig } from '../services/roleplayHeartbeat.js';
import { useSkillStore } from '../stores/skillStore.js';
import { useI18n } from '../i18n/index.js';
import { operationText } from '../i18n/operations.js';
const props = defineProps({ server: {type:Object,default:()=>({})} });
const emit = defineEmits(['open-team','open-mode','open-roleplay','retry-server']);
const skills = useSkillStore();
const heartbeatFields = [{key:'idleTimeout',label:'Away after',values:[1,3,5,10,15,30,60]},{key:'messageInterval',label:'Update every',values:[5,10,15,30,60,120]},{key:'maxMessages',label:'Stop after',values:[1,3,6,12,24,48]}];
const i18n = useI18n();
const title = op => op.teamId || ['roleplay:away','workflow:active'].includes(op.id) ? op.title : operationText(op.title, i18n.state.locale);
const open=ref(false), selected=ref(null), bar=ref(null), lane=ref(null), toggle=ref(null), capacity=ref(1), now=ref(Date.now());
const teams=ref([]), snapshots=ref({}), teamError=ref('');
const heartbeat = computed(() => {
  if (!skills.autonomousSession?.companion || !skills.autonomousSession?.sessionKey) return null;
  const state = heartbeatActivity({ enabled: skills.autonomousMode, generating: skills.isGeneratingAutonomous, busy: skills.foregroundRoleplayBusy, count: skills.autonomousMessageCount, config: skills.autonomousConfig, lastActive: skills.lastActiveTime, lastRun: skills.lastHeartbeatAt, now: now.value });
  const countdown = state.remaining ? ` · ${Math.floor(state.remaining / 60)}:${String(state.remaining % 60).padStart(2, '0')}` : '';
  return { id: 'roleplay:away', title: skills.autonomousSession.companion.name || 'Roleplay', subtitle: `${skills.autonomousMessageCount} / ${skills.autonomousConfig.maxMessages} updates`, location: 'Heartbeat', status: skills.isGeneratingAutonomous ? 'running' : 'monitoring', stage: state.stage + countdown, mode: 'roleplay', updatedAt: 0 };
});
function changeHeartbeat(key, event) {
  if (skills.autonomousMode || skills.isGeneratingAutonomous) return;
  skills.autonomousConfig = heartbeatConfig({ ...skills.autonomousConfig, [key]: event.target.value });
  if (skills.autonomousSession.settings) skills.autonomousSession.settings.autonomous = { ...skills.autonomousSession.settings.autonomous, ...skills.autonomousConfig };
}
const needsAttention = op => op.approvals > 0 || ['failed','interrupted','attention'].includes(op.status);
const rows = computed(()=>{
  const operations = Object.values(activity.state.operations).filter(o=>o.title);
  const streams=Object.values(companyStore.state.activeStreams);
  const device=activity.state.device;
  if(device?.loading) operations.push({id:'device:loading',title:'Loading language model',location:'On this device',status:'running',stage:'Loading model',updatedAt:0});
  if(device?.activeRequests && !operations.some(o=>o.status==='running'&&['chat','game'].includes(o.mode)) && !streams.length && !skills.isGeneratingAutonomous && !skills.runningSkill) operations.push({id:'device:requests',title:'Language model',location:'On this device',status:'running',stage:'Working',subtitle:String(device.activeRequests),updatedAt:0});
  for(const team of teams.value){
    const snap=snapshots.value[team.id]; const stream=streams.find(s=>s.companyId===team.id);
    const health=snap?.health?.level;
    const status=teamError.value||companyStore.state.runtimeError||['error','warning'].includes(health)?'attention':stream||health==='running'?'running':snap?.approvals?'attention':'monitoring';
    if(team.status!=='active' && status==='monitoring') continue;
    operations.push({id:`team:${team.id}`,teamId:team.id,approvals:snap?.approvals||0,title:team.name,location:'Team',status,stage:teamError.value?'Execution status unavailable':stream?.action?actionDisplayName(stream.action):snap?.approvals?'Awaiting review':status==='running'?'Working':status==='attention'?'Needs attention':'Play mode · waiting for work',updatedAt:0});
  }
  if (heartbeat.value) operations.push(heartbeat.value);
  if(skills.runningSkill && !skills.isGeneratingAutonomous) operations.push({id:'workflow:active',title:skills.runningSkill.name,location:'Workflow',stage:skills.runningStatus,status:'running',mode:'agent',updatedAt:0});
  if(teamError.value&&!teams.value.length) operations.push({id:'teams:error',title:'Team activity',status:'attention',stage:'Execution status unavailable',mode:'company',updatedAt:0});
  return orderOperations(operations);
});
const active=computed(()=>rows.value.filter(o=>o.status==='running'));
const serverLoading=computed(()=>active.value.find(o=>o.id==='server'));
const queued=computed(()=>rows.value.filter(o=>o.status==='queued'));
const attention=computed(()=>rows.value.filter(needsAttention));
const monitoring=computed(()=>rows.value.filter(o=>o.status==='monitoring'));
const visible=computed(()=>{
  if(serverLoading.value) return [serverLoading.value,...active.value.filter(o=>o.id!=='server' && o.id!=='roleplay:away')].slice(0,capacity.value);
  if(active.value.length) return active.value.filter(o=>o.id!=='roleplay:away').slice(0,capacity.value);
  return rows.value.filter(o=>o.status==='completed'&&now.value-o.finishedAt<8000).slice(0,capacity.value);
});
const activeFilter=ref('all');
const finished=computed(()=>rows.value.filter(o=>['completed','cancelled'].includes(o.status)));
const filters=computed(()=>[{id:'all',label:'All',count:rows.value.length},{id:'running',label:'Running now',count:active.value.length},{id:'attention',label:'Needs attention',count:attention.value.length},{id:'queued',label:'Queued',count:queued.value.length},{id:'monitoring',label:'Monitoring',count:monitoring.value.length}]);
const groups=computed(()=>[
  {label:'Needs attention',items:attention.value},{label:'Running now',items:active.value.filter(o=>!needsAttention(o))},{label:'Queued',items:queued.value},{label:'Monitoring',items:monitoring.value},{label:'Recent activity',items:rows.value.filter(o=>['completed','cancelled'].includes(o.status))},
].filter(g=>g.items.length));
const filteredGroups=computed(()=>activeFilter.value==='all'?groups.value:groups.value.map(g=>({...g,items:g.items.filter(o=>activeFilter.value==='attention'?needsAttention(o):o.status===activeFilter.value)})).filter(g=>g.items.length));
const stage=op=>({starting:'Starting',loading:'Loading model',generating:'Generating',denoising:'Generating',finalizing:'Finalizing',saving:'Saving',encoding:'Encoding',queued:'Queued',completed:'Ready',complete:'Finalizing',failed:'Failed',cancelled:'Cancelled',downloading:'Downloading'})[op.stage]||op.stage||op.status;
const icon=op=>needsAttention(op)?'error_outline':op.status==='completed'?'check_circle':op.teamId?'groups':op.id==='server'?'memory':op.id==='roleplay:away'?'favorite':op.source==='download'?'download':({benchmark:'speed',video:'movie',music:'graphic_eq',image:'image',game:'deployed_code',chat:'chat'})[op.mode]||'auto_awesome';
const elapsed=op=>{if(!op.startedAt)return '';const seconds=Math.max(0,Math.floor(((op.finishedAt||now.value)-op.startedAt)/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
function closePanel(){open.value=false;toggle.value?.focus({preventScroll:true});}
async function select(op){selected.value=op.id;activeFilter.value='all';open.value=true;await nextTick();[...bar.value.querySelectorAll('[data-operation-id]')].find(n=>n.dataset.operationId===op.id)?.scrollIntoView({block:'nearest'});}
function navigate(op){if(op.teamId)emit('open-team',op.teamId);else if(op.mode==='roleplay')emit('open-roleplay');else emit('open-mode',op.mode);open.value=false;}
function dismiss(op){dismissOperation(op.id);}
watch(()=>({...props.server}),s=>{
  if(!s.type||s.type==='info')return;
  const status=s.type==='ready'?'completed':['error','crashed','stopped'].includes(s.type)?'failed':'running';
  const old=activity.state.operations.server;
  reportOperation({id:'server',title:'Local AI',source:'server',location:'On this device',status,stage:({starting:'Starting BonzAI',restarting:'Restarting local AI',ready:'Ready',error:'Needs attention',crashed:'Needs attention',stopped:'Stopped'})[s.type]||s.type,error:status==='failed'?s.message:null,progress:null,...(status==='running'&&isTerminal(old?.status)?{startedAt:Date.now()}:{} )});
},{immediate:true});
function outside(event){if(open.value && bar.value && !bar.value.contains(event.target)) open.value=false;}
let disposed=false,timer,clock,observer,stopTracking;
async function refreshTeams(){
 try{const records=await company.listCompanies();const values=await Promise.all(records.map(async team=>{try{const [runtime,approvals]=await Promise.all([company.getAutomationStatus(team.id),company.pendingApprovals(team.id)]);return [team.id,{...runtime,approvals:approvals.length}];}catch{return[team.id,{health:{level:'warning'}}];}}));if(!disposed){teams.value=records;snapshots.value=Object.fromEntries(values);teamError.value='';}}
 catch(e){if(!disposed)teamError.value=e.message;}
 finally{if(!disposed)timer=setTimeout(refreshTeams,5000);}
}
onMounted(()=>{document.addEventListener('pointerdown',outside);stopTracking=startActivityTracking();refreshTeams();clock=setInterval(()=>now.value=Date.now(),1000);observer=new ResizeObserver(entries=>{capacity.value=Math.max(1,Math.floor(entries[0].contentRect.width/280));});if(lane.value)observer.observe(lane.value);});
onUnmounted(()=>{document.removeEventListener('pointerdown',outside);disposed=true;clearTimeout(timer);clearInterval(clock);observer?.disconnect();stopTracking?.();});
</script>
<style scoped>
.app-activity.is-starting{flex-basis:60px;border-bottom-color:var(--bz-border)}
.app-activity__startup{position:relative;height:4px;margin-top:2px;background:var(--bz-surface);overflow:hidden;pointer-events:none}
.app-activity__startup>span{display:block;width:35%;height:100%;background:var(--bz-accent);animation:server-startup-progress 1.6s ease-in-out infinite}
.app-activity__chip.is-server-loading{background:var(--bz-surface);box-shadow:none;padding-inline:14px;font-size:14px;max-width:460px}
.app-activity__chip.is-server-loading .app-activity__chip-title{font-weight:600}
.app-activity__chip.is-server-loading .app-activity__chip-stage{color:var(--bz-fg);max-width:260px}
@keyframes server-startup-progress{from{transform:translateX(-100%)}to{transform:translateX(386%)}}
@media(prefers-reduced-motion:reduce){.app-activity__startup>span{animation:none;width:100%;opacity:.7}}

.app-activity{position:relative;z-index:100;flex:0 0 54px;width:100%;min-width:0;color:var(--bz-fg);background:var(--bz-panel);border-bottom:1px solid var(--bz-border);font-family:var(--bz-font-ui)}
.app-activity__strip{height:53px;display:flex;align-items:center;gap:12px;padding:0 20px;min-width:0}.app-activity__mark{font-size:20px;color:var(--bz-fg-mid)}.app-activity__lane{display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden}.app-activity__chip{display:flex;align-items:center;gap:8px;min-width:0;max-width:330px;flex:0 1 auto;white-space:nowrap;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}.app-activity__chip:hover{background:var(--bz-surface)}.app-activity__chip>.material-symbols-outlined{font-size:18px;color:var(--bz-accent)}.app-activity__chip-title{overflow:hidden;text-overflow:ellipsis;min-width:40px}.app-activity__chip-stage{color:var(--bz-fg-mid);max-width:140px;overflow:hidden;text-overflow:ellipsis}.app-activity__pct{font-size:15px}.app-activity__controls{display:flex;align-items:center;gap:8px;flex-shrink:0}.app-activity__summary{display:flex;align-items:center;gap:5px;white-space:nowrap;border:0;background:transparent;color:var(--bz-fg-mid);font:inherit;font-size:12px;padding:6px;cursor:pointer}.app-activity__summary .material-symbols-outlined{font-size:17px}.app-activity__quiet{font-size:12px;color:var(--bz-fg-mid);white-space:nowrap}.is-warning{color:var(--bz-warning)!important}.app-activity__panel{box-sizing:border-box;position:absolute;right:16px;top:calc(100% + 8px);width:min(440px,calc(100% - 32px));max-height:min(720px,calc(100dvh - 110px));overflow:auto;overscroll-behavior:contain;padding:20px 24px;background:var(--bz-panel);border:1px solid var(--bz-border-strong);border-radius:14px;box-shadow:var(--bz-elev-2)}.app-activity__panel header{display:flex;align-items:center;justify-content:space-between;gap:12px}.app-activity__panel h2{margin:0;font:900 italic 26px/1.2 var(--bz-font-metric)}.app-activity__group h3{display:flex;justify-content:space-between;margin:22px 0 4px;font:400 12px/1.4 var(--bz-font-ui);color:var(--bz-fg-mid)}.app-activity__item{padding:16px 0;border-bottom:1px solid var(--bz-border)}.app-activity__item.is-selected{border-bottom-color:var(--bz-accent)}.app-activity__item-heading{display:flex;align-items:center;gap:12px}.app-activity__item-heading>div{min-width:0;flex:1}.app-activity__item-heading>.material-symbols-outlined{font-size:22px;color:var(--bz-accent)}.app-activity__item strong{font-size:14px;font-weight:500;overflow-wrap:anywhere}.app-activity__item p{margin:4px 0 0;font-size:12px;color:var(--bz-fg-mid);overflow-wrap:anywhere}.app-activity__elapsed{font-size:12px;color:var(--bz-fg-mid);font-variant-numeric:tabular-nums}.app-activity__stage{display:flex;justify-content:space-between;gap:12px;margin:12px 0 8px;font-size:12px;color:var(--bz-fg-mid);overflow-wrap:anywhere}.app-activity progress{appearance:none;width:100%;height:4px;border:0;border-radius:4px;overflow:hidden;background:var(--bz-surface)}.app-activity progress::-webkit-progress-bar{background:var(--bz-surface)}.app-activity progress::-webkit-progress-value{background:var(--bz-accent)}.app-activity progress::-moz-progress-bar{background:var(--bz-accent)}.app-activity__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.app-activity__actions:empty{display:none}.app-activity__error{color:var(--bz-warning)!important}.app-activity__empty{color:var(--bz-fg-mid);padding:28px 0;font-size:13px}.app-activity button:focus-visible{outline:2px solid var(--bz-accent);outline-offset:2px}
@media(max-width:600px){.app-activity__strip{padding:0 10px;gap:6px}.app-activity__mark,.app-activity__chip-stage,.app-activity__summary>span:not(.material-symbols-outlined){display:none}.app-activity__chip{padding:7px 4px}.app-activity__chip.is-server-loading .app-activity__chip-stage{display:inline;max-width:140px}.app-activity__panel{right:8px;width:calc(100% - 16px);padding:18px}.app-activity__controls{gap:3px}}

.app-activity__chip.is-running { position: relative; background: var(--bz-accent-soft); border: 1px solid var(--bz-accent); color: var(--bz-fg); }
.app-activity__chip.is-running > .material-symbols-outlined { color: var(--bz-accent); }
.app-activity__chip.is-running .app-activity__chip-stage { color: var(--bz-fg); }
.app-activity__chip.is-running .app-activity__pct { font-size: 18px; color: var(--bz-accent); }

.app-activity__running-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bz-accent); flex-shrink: 0; animation: activity-pulse 1.5s ease-in-out infinite; }
@keyframes activity-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .app-activity__running-dot { animation: none; } }
.app-activity__overview{display:flex;align-items:center;gap:8px;flex:none;background:none;border:0;color:var(--bz-fg-mid);font:inherit;font-size:12px;cursor:pointer;padding:6px 0}.app-activity__overview .material-symbols-outlined{font-size:20px;color:var(--bz-accent)}.app-activity__overview strong{font-variant-numeric:tabular-nums;color:var(--bz-fg)}.app-activity__chip-elapsed{font-size:11px;font-variant-numeric:tabular-nums;color:var(--bz-fg-mid)}.activity-filters{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.activity-filters button{display:flex;gap:6px;align-items:center;background:transparent;color:var(--bz-fg-mid);border:1px solid var(--bz-border);border-radius:8px;padding:8px 10px;font:inherit;font-size:12px;cursor:pointer}.activity-filters button[aria-pressed=true]{background:var(--bz-accent-soft);color:var(--bz-fg);border-color:var(--bz-accent)}.activity-filters span{font-variant-numeric:tabular-nums}.activity-clear{margin-bottom:12px}@media(max-width:600px){.app-activity__overview>span:not(.material-symbols-outlined),.app-activity__chip-elapsed{display:none}}
.app-activity__heartbeat{display:flex;align-items:center;gap:6px;border:1px solid var(--bz-border);border-radius:8px;background:var(--bz-canvas);color:var(--bz-fg);font:inherit;font-size:12px;padding:7px 10px;cursor:pointer;max-width:320px;min-width:0}.app-activity__heartbeat.is-enabled{border-color:var(--bz-accent)}.app-activity__heartbeat .material-symbols-outlined{font-size:18px;color:var(--bz-accent)}.heartbeat-summary{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--bz-fg-mid)}.heartbeat-settings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.heartbeat-settings label{display:flex;flex-direction:column;gap:6px;font-size:12px}.heartbeat-settings select{width:100%;min-width:0;padding:8px 4px;border:1px solid var(--bz-border);border-radius:6px;color:var(--bz-fg);background:var(--bz-canvas);font:inherit}.heartbeat-settings p{grid-column:1/-1}.heartbeat-settings select:disabled{opacity:.65}@media(max-width:700px){.heartbeat-summary{display:none}.app-activity__heartbeat{padding:7px}.heartbeat-settings{grid-template-columns:1fr}.heartbeat-settings label{flex-direction:row;align-items:center;justify-content:space-between}.heartbeat-settings select{width:55%}}
</style>
