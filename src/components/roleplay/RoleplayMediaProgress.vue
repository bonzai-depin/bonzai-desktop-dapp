<template>
  <section class="roleplay-media-progress" aria-label="Reply media progress" aria-live="polite">
    <header><strong>{{ message.mediaStatus || 'Preparing your reply' }}</strong><time class="bz-metric" aria-label="Elapsed time">{{ elapsed }}</time></header>
    <ul><li v-for="item in items" :key="item.key"><span class="material-symbols-outlined" aria-hidden="true">{{ item.done ? 'check_circle' : item.icon }}</span><strong>{{ item.label }}</strong><span>{{ item.done ? 'Ready' : message.activeMedia === item.key ? 'In progress' : 'Waiting for its turn' }}</span></li></ul>
    <p>Your reply appears as each part is ready. You can browse other views while it finishes.</p>
  </section>
</template>
<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue';
const props=defineProps({message:{type:Object,required:true}});
const now=ref(Date.now());let timer;
onMounted(()=>{timer=setInterval(()=>now.value=Date.now(),1000)});onBeforeUnmount(()=>clearInterval(timer));
const elapsed=computed(()=>{const seconds=Math.max(0,Math.floor((now.value-(props.message.ts||now.value))/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`});
const items=computed(()=>[{key:'audio',label:'Voice',icon:'graphic_eq',flag:'generatingAudio'},{key:'image',label:'Image',icon:'image',flag:'generatingImage'},{key:'video',label:'Video',icon:'movie',flag:'generatingVideo'}].filter(item=>props.message[item.flag]||props.message[item.key]).map(item=>({...item,done:!!props.message[item.key]})));
</script>
<style scoped>
.roleplay-media-progress{padding:18px;margin-top:16px;border:1px solid var(--bz-border-brand);border-radius:var(--bz-r-md);background:var(--bz-panel);color:var(--bz-fg)}header{display:flex;align-items:center;justify-content:space-between;gap:16px}header strong{font-size:14px}time{font-size:22px;white-space:nowrap}ul{list-style:none;padding:0;margin:16px 0;display:grid;gap:10px}li{display:flex;align-items:center;gap:10px;font-size:13px}li>span:last-child{margin-left:auto;color:var(--bz-fg-mid)}li>.material-symbols-outlined{color:var(--bz-accent)}p{margin:0;font-size:12px;color:var(--bz-fg-mid);line-height:1.5}
</style>
