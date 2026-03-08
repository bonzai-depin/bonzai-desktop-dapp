<template>
  <div class="context-banner" :class="variant">
    <span v-if="icon" class="material-symbols-outlined banner-icon">{{ icon }}</span>
    <div class="banner-content">
      <slot />
    </div>
    <div v-if="$slots.action" class="banner-action">
      <slot name="action" />
    </div>
    <button
      v-if="dismissible"
      class="banner-dismiss"
      @click="$emit('dismiss')"
      title="Dismiss"
    >
      <span class="material-symbols-outlined" style="font-size: 14px">close</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  variant: {
    type: String,
    default: 'info',
    validator: (v) => ['info', 'success', 'warning', 'error'].includes(v),
  },
  icon: {
    type: String,
    default: '',
  },
  dismissible: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['dismiss']);
</script>

<style scoped>
.context-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
}

/* Info — LUKSO pink */
.context-banner.info {
  background: rgba(254, 45, 110, 0.12);
  border: 1px solid rgba(254, 45, 110, 0.35);
}

/* Success — green */
.context-banner.success {
  background: rgba(72, 199, 142, 0.12);
  border: 1px solid rgba(72, 199, 142, 0.35);
}

/* Warning — yellow */
.context-banner.warning {
  background: rgba(255, 224, 138, 0.12);
  border: 1px solid rgba(255, 224, 138, 0.35);
}

/* Error — red */
.context-banner.error {
  background: rgba(241, 70, 104, 0.12);
  border: 1px solid rgba(241, 70, 104, 0.35);
}

.banner-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.info .banner-icon { color: #fe7eb0; }
.success .banner-icon { color: #48c78e; }
.warning .banner-icon { color: #ffe08a; }
.error .banner-icon { color: #f14668; }

.banner-content {
  flex: 1;
}

.banner-action {
  flex-shrink: 0;
}

.banner-action :deep(.button) {
  font-size: 11px;
  padding: 4px 10px;
  height: auto;
}

.banner-dismiss {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 2px;
  flex-shrink: 0;
}

.banner-dismiss:hover {
  color: rgba(255, 255, 255, 0.8);
}
</style>
