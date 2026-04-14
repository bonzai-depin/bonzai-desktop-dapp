<template>
  <div class="pipeline-audit" v-if="session.active">
    <!-- Accordion Header -->
    <div class="audit-header" @click="expanded = !expanded">
      <div class="audit-header-left">
        <span class="material-symbols-outlined" style="color: #39d582; font-size: 20px">lock</span>
        <span class="fira-sans-condensed-black-italic has-text-white">Privacy Audit</span>
        <span class="audit-meta">
          {{ session.privacyAudit?.localLayers || '?' }} local / {{ session.privacyAudit?.remoteLayers || '?' }} remote layers
          &middot; split {{ session.privacyAudit?.tensorSplit || '--' }}
        </span>
      </div>
      <span class="material-symbols-outlined chevron" :class="{ open: expanded }">
        expand_more
      </span>
    </div>

    <!-- Accordion Body -->
    <div v-if="expanded" class="audit-body">
      <!-- What stays on your device -->
      <div class="audit-section safe">
        <div class="audit-section-title">
          <span class="material-symbols-outlined" style="font-size: 16px">verified_user</span>
          What stays on your device
        </div>
        <ul>
          <li v-for="item in session.privacyAudit?.whatClientKeeps" :key="item">
            <span class="material-symbols-outlined" style="font-size: 13px">check</span>
            {{ item }}
          </li>
        </ul>
      </div>

      <!-- What the remote peer sees -->
      <div class="audit-section warn">
        <div class="audit-section-title">
          <span class="material-symbols-outlined" style="font-size: 16px">visibility</span>
          What the remote peer sees
        </div>
        <ul>
          <li v-for="item in session.privacyAudit?.whatPeerSees" :key="item">
            <span class="material-symbols-outlined" style="font-size: 13px">remove</span>
            {{ item }}
          </li>
        </ul>
      </div>

      <!-- What the remote peer NEVER sees -->
      <div class="audit-section protected">
        <div class="audit-section-title">
          <span class="material-symbols-outlined" style="font-size: 16px">shield</span>
          What the remote peer never sees
        </div>
        <ul>
          <li v-for="item in session.privacyAudit?.whatPeerNeverSees" :key="item">
            <span class="material-symbols-outlined" style="font-size: 13px">block</span>
            {{ item }}
          </li>
        </ul>
      </div>

      <!-- Status line -->
      <div v-if="statusMessage" class="audit-status">{{ statusMessage }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from "vue";

const session = reactive({
  active: false,
  sessionId: null,
  status: 'idle',
  peersUsed: 0,
  requestCount: 0,
  llamaServerPort: null,
  elapsed: 0,
  tunnelStats: [],
  privacyAudit: null,
});

const statusMessage = ref('');
const expanded = ref(false);
let pollInterval = null;
let statusUnsub = null;

async function pollStatus() {
  try {
    const res = await window.electronAPI.p2pPipelineStatus();
    if (res.ok) {
      session.active = res.active;
      session.sessionId = res.sessionId;
      session.status = res.status || 'idle';
      session.peersUsed = res.peersUsed || 0;
      session.requestCount = res.requestCount || 0;
      session.llamaServerPort = res.llamaServerPort;
      session.elapsed = res.elapsed || 0;
      session.tunnelStats = res.tunnelStats || [];
      session.privacyAudit = res.privacyAudit || null;
    }
  } catch {}
}

onMounted(() => {
  pollStatus();
  pollInterval = setInterval(pollStatus, 3000);
  statusUnsub = window.electronAPI.onPipelineStatus?.((msg) => {
    statusMessage.value = msg;
  });
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
  if (statusUnsub) statusUnsub();
});
</script>

<style scoped>
.pipeline-audit {
  background: rgba(57, 213, 130, 0.06);
  border: 1px solid rgba(57, 213, 130, 0.2);
  border-radius: 10px;
  overflow: hidden;
}

.audit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.audit-header:hover {
  background: rgba(57, 213, 130, 0.04);
}

.audit-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.audit-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-left: 8px;
}

.chevron {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.4);
  transition: transform 0.2s;
}

.chevron.open {
  transform: rotate(180deg);
}

.audit-body {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.audit-section {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.15);
}

.audit-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.audit-section.safe .audit-section-title { color: rgba(57, 213, 130, 0.9); }
.audit-section.warn .audit-section-title { color: rgba(240, 173, 78, 0.9); }
.audit-section.protected .audit-section-title { color: rgba(57, 213, 130, 0.75); }

.audit-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.audit-section li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 2px 0;
}

.audit-section.safe li { color: rgba(57, 213, 130, 0.7); }
.audit-section.warn li { color: rgba(240, 173, 78, 0.7); }
.audit-section.protected li { color: rgba(57, 213, 130, 0.6); }

.audit-status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  padding-top: 4px;
}
</style>
