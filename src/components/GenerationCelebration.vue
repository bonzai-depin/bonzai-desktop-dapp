<template>
  <Teleport to="body">
    <Transition name="creation-reveal">
      <div v-if="show" class="creation-reveal" @click="$emit('dismiss')">
        <img class="creation-reveal__art" src="../assets/bonzai-knowledge/create.webp" alt="" />
        <div class="creation-reveal__veil"></div>
        <button class="bz-iconbtn creation-reveal__close" aria-label="Dismiss completion" @click.stop="$emit('dismiss')"><span class="material-symbols-outlined">close</span></button>
        <div class="creation-reveal__message" role="status" aria-live="polite">
          <span class="creation-reveal__seal material-symbols-outlined" aria-hidden="true">done</span>
          <span class="bz-meta">BonzAI</span>
          <h2>{{ title }}</h2><p>{{ description }}</p>
          <span class="creation-reveal__line" aria-hidden="true"></span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
const props = defineProps({show:Boolean,title:String,description:String});
const emit = defineEmits(['dismiss']);
const escape = event => { if (props.show && event.key === 'Escape') { event.stopImmediatePropagation(); emit('dismiss'); } };
onMounted(()=>window.addEventListener('keydown',escape,true));
onBeforeUnmount(()=>window.removeEventListener('keydown',escape,true));
</script>
<style scoped>
.creation-reveal{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;isolation:isolate;color:var(--bz-fg);background:var(--bz-canvas);cursor:pointer}
.creation-reveal__art,.creation-reveal__veil{position:absolute;inset:0;width:100%;height:100%;z-index:-1}.creation-reveal__art{object-fit:cover;object-position:center;opacity:.44;animation:art-arrive 4s ease-out both}.creation-reveal__veil{background:linear-gradient(0deg,var(--bz-canvas),color-mix(in srgb,var(--bz-canvas) 30%,transparent),var(--bz-canvas));}
.creation-reveal__close{position:absolute;right:32px;top:32px;background:var(--bz-panel)}.creation-reveal__message{display:grid;justify-items:center;text-align:center;padding:32px;max-width:900px;gap:18px;animation:message-arrive .65s ease-out both}.creation-reveal__message h2{font:900 italic clamp(36px,5vw,72px)/1.1 var(--bz-font-metric);margin:0;text-wrap:balance}.creation-reveal__message p{font-size:18px;margin:0}.creation-reveal__seal{display:grid;place-items:center;width:72px;height:72px;border:2px solid var(--bz-accent);border-radius:50%;color:var(--bz-accent);font-size:36px}.creation-reveal__line{width:120px;height:2px;background:var(--bz-accent);margin-top:16px;transform-origin:left;animation:reveal-time 4s linear both}
.creation-reveal-enter-active,.creation-reveal-leave-active{transition:opacity .5s ease}.creation-reveal-enter-from,.creation-reveal-leave-to{opacity:0}
@keyframes art-arrive{from{transform:scale(1.06)}to{transform:scale(1)}}@keyframes message-arrive{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes reveal-time{to{transform:scaleX(0)}}
@media(prefers-reduced-motion:reduce){.creation-reveal *{animation:none!important}.creation-reveal-enter-active,.creation-reveal-leave-active{transition:none}}
</style>
