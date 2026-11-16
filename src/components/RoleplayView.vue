<template>
  <main class="roleplay-view bz-page-content">
    <header class="bz-page-header"><div><span class="bz-title-icon material-symbols-outlined">theater_comedy</span><h1 class="bz-h1">{{ $ui('Roleplay') }}</h1></div></header>
    <RoleplayChat :skill="roleplayCompanion" :initial-companion="roleplayAgent" />
  </main>
</template>
<script setup>
import RoleplayChat from './skills/RoleplayChat.vue';
import { roleplayCompanion } from '../skills/flagship.js';
import { roleplayAgent } from '../services/roleplayNavigation.js';
</script>
<style scoped>.roleplay-view{height:100%;box-sizing:border-box;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}</style>
