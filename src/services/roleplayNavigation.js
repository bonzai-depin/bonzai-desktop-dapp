import { shallowRef } from 'vue';
export const roleplayAgent = shallowRef(null);
export function openRoleplay(agent) { roleplayAgent.value = agent; window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'roleplay' })); }
