<template>
  <article class="model-artifact">
    <header>
      <span class="model-artifact__icon material-symbols-outlined" aria-hidden="true">{{ artifact.operation === 'abliteration' ? 'lock_open' : 'model_training' }}</span>
      <div class="model-artifact__identity"><span class="model-artifact__kind">{{ artifact.contentLabel }} · {{ artifact.formatLabel }}</span><h4>{{ name }}</h4><p>{{ model.method ? model.method.charAt(0).toUpperCase() + model.method.slice(1) : 'Custom training' }}<span v-if="model.quantization"> · {{ model.quantization }}</span><span v-if="model.nft?.tokenId"> · Tokenized</span></p></div>
      <time>{{ date }}</time>
    </header>
    <div class="model-artifact__actions"><slot name="actions" /></div>
    <slot />
  </article>
</template>
<script setup>
const props=defineProps({model:{type:Object,required:true},artifact:{type:Object,required:true},name:String,date:String})
</script>
<style scoped>
.model-artifact { min-width:0; background:var(--bz-card); border:1px solid var(--bz-border); border-radius:var(--bz-r); padding:24px; display:flex; flex-direction:column; gap:20px; }
.model-artifact header { display:flex; align-items:center; gap:16px; min-width:0; }.model-artifact__icon { display:grid; place-items:center; width:48px; height:48px; flex-shrink:0; border:1px solid var(--bz-border); border-radius:12px; color:var(--bz-accent); font-size:24px; }
.model-artifact__identity { min-width:0; flex:1; }.model-artifact__kind { font-size:12px; color:var(--bz-fg-mid); }.model-artifact h4 { font-family:var(--bz-font-metric); font-size:26px; line-height:1.25; color:var(--bz-fg); margin:6px 0; overflow-wrap:anywhere; }.model-artifact p { font-size:13px; color:var(--bz-fg-mid); margin:0; }.model-artifact time { font-size:12px; color:var(--bz-fg-mid); align-self:flex-start; white-space:nowrap; }
.model-artifact__actions { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }.model-artifact__actions :deep(.bz-btn) { margin:0; }
@media(max-width:600px) { .model-artifact { padding:18px; }.model-artifact header { flex-wrap:wrap; }.model-artifact time { width:100%; padding-left:64px; }.model-artifact h4 { font-size:23px; } }
</style>
