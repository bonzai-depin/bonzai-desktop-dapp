<template>
  <button type="button" class="roleplay-history-toggle" role="switch" :aria-checked="modelValue" :aria-label="$ui('Include roleplay')" @click="$emit('update:modelValue', !modelValue)">
    <span class="material-symbols-outlined" aria-hidden="true">theater_comedy</span>
    <span>{{ $ui('Include roleplay') }}</span><span class="roleplay-history-toggle__track"><span /></span>
  </button>
</template>
<script setup>
defineProps({ modelValue: Boolean });
defineEmits(['update:modelValue']);
</script>
<style scoped>
.roleplay-history-toggle{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--bz-border);border-radius:var(--bz-r-pill);background:var(--bz-panel);color:var(--bz-fg);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.roleplay-history-toggle> .material-symbols-outlined{font-size:18px;color:var(--bz-accent)}
.roleplay-history-toggle__track{width:30px;height:18px;border-radius:20px;background:var(--bz-border-strong);padding:3px;box-sizing:border-box}
.roleplay-history-toggle__track>span{display:block;width:12px;height:12px;border-radius:50%;background:var(--bz-fg);transition:transform .15s}
[aria-checked=true] .roleplay-history-toggle__track{background:var(--bz-accent)}
[aria-checked=true] .roleplay-history-toggle__track>span{transform:translateX(12px);background:var(--bz-canvas)}
.roleplay-history-toggle:focus-visible{outline:2px solid var(--bz-accent);outline-offset:3px}
@media(prefers-reduced-motion:reduce){.roleplay-history-toggle__track>span{transition:none}}
</style>
