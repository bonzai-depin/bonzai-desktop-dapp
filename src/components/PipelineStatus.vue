<template>
  <div class="pipeline-status" v-if="session.active">
    <div class="pipeline-header">
      <span class="material-symbols-outlined mr-2" style="vertical-align: middle; color: #39d582">
        lock
      </span>
      <span class="fira-sans-condensed-black-italic has-text-white">Private Pipeline</span>
      <span class="tag is-success is-light ml-2">{{ session.status }}</span>
      <span class="tag is-info is-light ml-2" v-if="session.requestCount">
        {{ session.requestCount }} request{{ session.requestCount > 1 ? 's' : '' }}
      </span>
    </div>

    <div class="pipeline-details mt-3">
      <div class="pipeline-stat">
        <span class="stat-label">Peers</span>
        <span class="stat-value fira-sans-condensed-black-italic">
          {{ session.privacyAudit?.localTest ? 'local test' : session.peersUsed }}
        </span>
      </div>
      <div class="pipeline-stat">
        <span class="stat-label">Layers</span>
        <span class="stat-value fira-sans-condensed-black-italic">
          {{ session.privacyAudit?.localLayers || '?' }} local / {{ session.privacyAudit?.remoteLayers || '?' }} remote
        </span>
      </div>
      <div class="pipeline-stat">
        <span class="stat-label">Split</span>
        <span class="stat-value fira-sans-condensed-black-italic">
          {{ session.privacyAudit?.tensorSplit || '--' }}
        </span>
      </div>
    </div>

    <!-- Privacy Audit -->
    <div class="privacy-audit mt-4" v-if="session.privacyAudit && showAudit">
      <div class="audit-section">
        <h4 class="audit-title">
          <span class="material-symbols-outlined mr-1" style="font-size: 16px; color: #39d582">verified_user</span>
          What stays on your device
        </h4>
        <ul class="audit-list safe">
          <li v-for="item in session.privacyAudit.whatClientKeeps" :key="item">
            <span class="material-symbols-outlined" style="font-size: 14px">check</span>
            {{ item }}
          </li>
        </ul>
      </div>

      <div class="audit-section mt-3">
        <h4 class="audit-title">
          <span class="material-symbols-outlined mr-1" style="font-size: 16px; color: #f0ad4e">visibility</span>
          What the remote peer sees
        </h4>
        <ul class="audit-list neutral">
          <li v-for="item in session.privacyAudit.whatPeerSees" :key="item">
            <span class="material-symbols-outlined" style="font-size: 14px">remove</span>
            {{ item }}
          </li>
        </ul>
      </div>

      <div class="audit-section mt-3">
        <h4 class="audit-title">
          <span class="material-symbols-outlined mr-1" style="font-size: 16px; color: #39d582">shield</span>
          What the remote peer NEVER sees
        </h4>
        <ul class="audit-list protected">
          <li v-for="item in session.privacyAudit.whatPeerNeverSees" :key="item">
            <span class="material-symbols-outlined" style="font-size: 14px">block</span>
            {{ item }}
          </li>
        </ul>
      </div>
    </div>

    <!-- Status Message -->
    <div class="pipeline-message mt-2" v-if="statusMessage">
      <span class="is-size-7" style="opacity: 0.7">{{ statusMessage }}</span>
    </div>

    <div class="mt-3" style="display: flex; gap: 8px">
      <button
        class="button is-small"
        :class="showAudit ? 'is-info' : 'is-info is-light'"
        @click="showAudit = !showAudit"
      >
        <span class="material-symbols-outlined mr-1" style="font-size: 16px">policy</span>
        {{ showAudit ? 'Hide' : 'Show' }} Privacy Audit
      </button>
      <button
        class="button is-danger is-small"
        @click="cancel"
        :disabled="cancelling"
      >
        <span class="material-symbols-outlined mr-1" style="font-size: 16px">cancel</span>
        {{ cancelling ? 'Stopping...' : 'Stop Pipeline' }}
      </button>
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
const cancelling = ref(false);
const showAudit = ref(false);
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

async function cancel() {
  cancelling.value = true;
  try {
    await window.electronAPI.p2pPipelineCancel();
  } catch {}
  cancelling.value = false;
  session.active = false;
}

onMounted(() => {
  pollStatus();
  pollInterval = setInterval(pollStatus, 2000);
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
.pipeline-status {
  background: rgba(57, 213, 130, 0.08);
  border: 1px solid rgba(57, 213, 130, 0.25);
  border-radius: 12px;
  padding: 1em;
  margin-bottom: 1em;
}

.pipeline-header {
  display: flex;
  align-items: center;
  font-size: 1rem;
}

.pipeline-details {
  display: flex;
  gap: 1.5em;
  flex-wrap: wrap;
}

.pipeline-stat {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 1rem;
  color: #fff;
}

.privacy-audit {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 0.75em;
}

.audit-section {
  padding: 0;
}

.audit-title {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  margin: 0 0 0.4em 0;
}

.audit-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.audit-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  padding: 2px 0;
}

.audit-list.safe li {
  color: rgba(57, 213, 130, 0.85);
}

.audit-list.neutral li {
  color: rgba(240, 173, 78, 0.85);
}

.audit-list.protected li {
  color: rgba(57, 213, 130, 0.7);
}

.pipeline-message {
  min-height: 1.2em;
}
</style>
