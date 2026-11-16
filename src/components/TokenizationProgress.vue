<template>
  <ol class="tokenization-steps" aria-label="Tokenization progress">
    <li v-for="(step, index) in steps" :key="step.title" :class="{current: index === current, complete: index < current || complete, failed: failed && index === current}" :aria-current="index === current && !complete ? 'step' : undefined">
      <span class="tokenization-steps__number" aria-hidden="true"><svg v-if="index < current || complete" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4 10-10" /></svg><template v-else>{{ index + 1 }}</template></span>
      <span><strong>{{ step.title }}</strong><small>{{ failed && index === current ? 'Needs attention' : step.detail }}</small></span>
    </li>
  </ol>
</template>
<script setup>
defineProps({steps:{type:Array,required:true},current:{type:Number,default:0},complete:Boolean,failed:Boolean})
</script>
<style scoped>
.tokenization-steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:16px; list-style:none; margin:0; padding:20px 0; border-bottom:1px solid var(--bz-border); color:var(--bz-fg-mid); }
.tokenization-steps li { display:flex; gap:10px; align-items:flex-start; min-width:0; }
.tokenization-steps__number { display:grid; place-items:center; flex:0 0 28px; height:28px; border:1px solid var(--bz-border); border-radius:50%; font-family:var(--bz-font-metric); }
.tokenization-steps__number svg { width:17px; height:17px; }
.tokenization-steps strong { display:block; font-size:13px; font-weight:600; line-height:1.5; }
.tokenization-steps small { display:block; font-size:12px; line-height:1.5; margin-top:3px; }
.tokenization-steps .current { color:var(--bz-fg); }.current .tokenization-steps__number { border-color:var(--bz-accent); color:var(--bz-accent); }
.tokenization-steps .complete .tokenization-steps__number { color:var(--bz-success); border-color:var(--bz-success); }
.tokenization-steps .failed .tokenization-steps__number { color:var(--bz-danger); border-color:var(--bz-danger); }
</style>
