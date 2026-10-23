<template>
  <section class="game-rules" aria-label="Game rules">
    <header><div><span class="game-rules__eyebrow">{{$t('levelEditor.gameplay')}}</span><h3 class="bz-h3">{{$t('levelEditor.makePlayable')}}</h3></div></header>
    <slot />
    <div class="game-rules__grid">
      <div><h4>{{$t('levelEditor.winConditions')}}</h4><div class="game-rules__presets" role="group" aria-label="Objective type"><button v-for="item in types" :key="item.id" type="button" :aria-pressed="type===item.id" :disabled="busy" @click="type=item.id"><span class="material-symbols-outlined" aria-hidden="true">{{item.icon}}</span>{{$t(`levelEditor.${item.id}Objective`)}}</button></div>
        <form @submit.prevent="add"><label v-if="type!=='reach'">{{$t(type==='survive'?'levelEditor.surviveSeconds':'levelEditor.collectCount')}}<input class="bz-input" type="number" min="1" max="9999" v-model.number="amount" required :disabled="busy" /></label><p v-else>{{$t('levelEditor.reachHint')}}</p><button class="bz-btn bz-btn--primary" :disabled="busy || !valid">{{$t('levelEditor.addObjective')}}</button></form>
        <p v-if="type==='collect'">{{$t('levelEditor.collectHint')}}</p>
        <ul class="game-rules__objectives"><li v-for="rule in level.clearConditions || []" :key="rule.id"><span class="material-symbols-outlined" aria-hidden="true">flag</span><span>{{rule.label}}</span><button class="bz-iconbtn" :disabled="busy" :aria-label="`Remove ${rule.label}`" @click="$emit('remove',rule.id)"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></li></ul>
        <p v-if="!level.clearConditions?.length">{{$t('levelEditor.noObjectives')}}</p>
        <label v-if="level.clearConditions?.length>1">{{$t('levelEditor.complete')}}<select class="bz-select" :value="level.clearMode || 'all'" :disabled="busy" @change="$emit('mode',$event.target.value)"><option value="all">{{$t('levelEditor.allObjectives')}}</option><option value="any">{{$t('levelEditor.anyObjective')}}</option></select></label>
      </div>
      <div><h4>{{$t('levelEditor.startFinish')}}</h4><p>{{$t('levelEditor.markerHint')}}</p><div class="game-rules__markers"><button v-for="marker in ['start','finish']" :key="marker" class="bz-btn bz-btn--ghost" :disabled="busy || !selection" @click="$emit('marker',marker)"><span class="material-symbols-outlined" aria-hidden="true">{{marker==='start'?'person_pin_circle':'sports_score'}}</span>{{$t(marker==='start'?'levelEditor.setStart':'levelEditor.setFinish')}}</button></div><details><summary>{{$t('levelEditor.levelSettings')}}</summary><label>{{$t('levelEditor.levelName')}}<input class="bz-input" :value="level.title" :disabled="busy" @change="$emit('rename', $event.target.value)" /></label></details><details><summary>{{$t('levelEditor.exactCoordinates')}}</summary><slot name="markers" /></details></div>
    </div>
  </section>
</template>
<script setup>
import {ref,computed} from 'vue';
const props=defineProps({level:{type:Object,required:true},busy:Boolean,selection:Object});
const emit=defineEmits(['add','remove','mode','marker','rename']);
const type=ref('reach'),amount=ref(5);
const types=[{id:'reach',label:'Reach the finish',icon:'sports_score'},{id:'collect',label:'Collect objects',icon:'diamond'},{id:'survive',label:'Survive',icon:'timer'}];
const valid=computed(()=>type.value==='reach'||Number.isInteger(amount.value)&&amount.value>0&&amount.value<=9999);
function add(){if(!valid.value)return;emit('add',{type:type.value,target:type.value==='reach'?1:amount.value,label:type.value==='reach'?'Reach the finish':type.value==='collect'?`Collect ${amount.value} objects`:`Survive ${amount.value} seconds`});}
</script>
<style scoped>
.game-rules { color: var(--bz-fg); }
.game-rules__eyebrow { text-transform: uppercase; font-size: 10px; letter-spacing: .08em; color: var(--bz-fg-mid); }
.game-rules h3 { font-family: var(--bz-font-metric); font-size: 24px; font-weight: 900; font-style: italic; margin: 5px 0 18px; }
.game-rules h4 { font-size: 13px; font-weight: 600; margin: 0 0 12px; }
.game-rules p { font-size: 12px; color: var(--bz-fg-mid); line-height: 1.5; margin: 10px 0; }
.game-rules label { display: grid; gap: 8px; font-size: 12px; color: var(--bz-fg-mid); }
.game-rules input, .game-rules select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 38px; padding: 8px 10px; border: 1px solid var(--bz-border); border-radius: 6px; background: var(--bz-bg); color: var(--bz-fg); font: inherit; }
.game-rules select { padding-right: 36px; }
.game-rules__grid { display: grid; gap: 24px; margin-top: 24px; }
.game-rules__grid>div+div { border-top: 1px solid var(--bz-border); padding-top: 20px; }
.game-rules__presets { display: grid; gap: 6px; }
.game-rules__presets button { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--bz-border); border-radius: 6px; color: var(--bz-fg); background: var(--bz-bg); cursor: pointer; font: inherit; font-size: 12px; text-align: left; }
.game-rules__presets button[aria-pressed=true] { border-color: var(--bz-accent); background: var(--bz-accent-soft); color: var(--bz-accent); }
.game-rules form { display: grid; gap: 12px; margin: 12px 0; }
.game-rules .bz-btn { font-size: 12px; min-height: 36px; padding: 8px 12px; }
.game-rules__objectives { list-style: none; padding: 0; margin: 16px 0; display: grid; gap: 8px; }
.game-rules__objectives li { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--bz-border); font-size: 12px; }
.game-rules__objectives li>span:nth-child(2) { flex: 1; overflow-wrap: anywhere; }
.game-rules details { margin-top: 12px; }
.game-rules summary { cursor: pointer; padding: 10px 0; color: var(--bz-fg-mid); font-size: 12px; }
.game-rules__markers { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.game-rules .material-symbols-outlined { font-size: 18px; font-variation-settings: 'wght' 200; }
</style>
