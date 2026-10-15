<template>
  <div class="company-team-status" :aria-label="$ui('Workspace status')">
    <span class="company-team-status__health" :title="$ui(health.detail)"><i :class="`is-${health.level}`"></i>{{ $ui(health.label) }}</span>
    <span class="company-team-status__members"><b class="bz-metric">{{ members }}</b> {{ $ui(members === 1 ? 'member' : 'members') }}</span>
    <button type="button" class="bz-iconbtn" :title="$ui(playing ? 'Pause automation' : 'Resume automation')" :aria-label="$ui(playing ? 'Pause automation' : 'Resume automation')" @click="$emit('toggle-execution')"><span class="material-symbols-outlined" aria-hidden="true">{{ playing ? 'pause' : 'play_arrow' }}</span></button>
    <slot />
    <button type="button" class="bz-iconbtn" :title="$ui(fullscreen ? 'Exit full screen' : 'Full screen')" :aria-label="$ui(fullscreen ? 'Exit full screen' : 'Full screen')" @click="$emit('toggle-fullscreen')"><span class="material-symbols-outlined" aria-hidden="true">{{ fullscreen ? 'fullscreen_exit' : 'fullscreen' }}</span></button>
  </div>
</template>
<script setup>
defineProps({ health: { type: Object, required: true }, members: Number, playing: Boolean, fullscreen: Boolean });
defineEmits(['toggle-execution', 'toggle-fullscreen']);
</script>
<style scoped>
.company-team-status { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: var(--bz-space-2); min-width: 0; }
.company-team-status > span { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding-inline: var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); white-space: nowrap; }
.company-team-status i { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: var(--bz-warning); }
.company-team-status i.is-healthy, .company-team-status i.is-running { background: var(--bz-success); }
.company-team-status i.is-error { background: var(--bz-danger); }
.company-team-status button { flex-shrink: 0; }
@media (max-width: 520px) { .company-team-status > .company-team-status__members { display: none; } }
</style>
