import { reactive } from 'vue';
export const protocolGuideState = reactive({ open: false, activity: 'mint' });
export function openProtocolGuide(activity = 'mint') {
  protocolGuideState.activity = activity;
  protocolGuideState.open = true;
  window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'economy' }));
}
