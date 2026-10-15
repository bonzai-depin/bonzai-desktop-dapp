<template>
  <div class="live-streamer-skill">
    <div class="broadcast-wall">
      <div class="broadcast-monitor">
        <div class="broadcast-monitor-bg" :style="previewBgStyle"></div>
        <div class="broadcast-monitor-overlay"></div>
        <div class="broadcast-monitor-body">
          <span class="broadcast-state-dot" :class="{ 'is-live': isLive }"></span>
          <strong>{{ isLive ? 'LIVE' : 'OFFLINE' }}</strong>
          <span>{{ currentGeneration?.type || lastOutput?.type || 'standby' }}</span>
        </div>
      </div>
      <div class="broadcast-wall-metrics">
        <div><span>Queue</span><strong>{{ queue.length }}</strong></div>
        <div><span>Chat</span><strong>{{ chatConnected ? chatPlatform : 'Off' }}</strong></div>
        <div><span>OBS</span><strong>{{ obsConnected ? 'Linked' : 'Off' }}</strong></div>
        <div><span>Revenue</span><strong>{{ stats.revenue }}</strong></div>
      </div>
    </div>

    <!-- Tab Selector (radio pill style) -->
    <div class="broadcast-command-deck skill-panel">
      <div class="columns">
        <div class="column is-12">
          <span class="category-selector">
            <template v-for="tab in tabs" :key="tab.id">
              <input
                type="radio"
                name="live_tab"
                :id="'live_tab_' + tab.id"
                :value="tab.id"
                :checked="activeTab === tab.id"
                @change="activeTab = tab.id"
              />
              <label :for="'live_tab_' + tab.id" class="radio category">
                <span class="material-symbols-outlined" style="font-size: 18px">{{ tab.icon }}</span>
                {{ tab.label }}
              </label>
            </template>
          </span>
        </div>
      </div>

      <!-- Connection Status -->
      <div class="bz-card-shell config-card mt-5 has-text-left" :class="{ 'is-live': isLive }">
        <div class="columns is-mobile is-vcentered">
          <div class="column is-narrow">
            <span class="material-symbols-outlined" style="font-size: 24px">
              {{ isLive ? 'sensors' : 'sensors_off' }}
            </span>
          </div>
          <div class="column">
            <h4 class="fira-sans-condensed-black-italic is-size-5 mb-1">
              {{ isLive ? 'LIVE' : 'Offline' }}
            </h4>
            <div class="tags">
              <span class="skill-chip" :class="chatConnected ? 'skill-chip--success' : 'skill-chip--muted'">
                <span class="material-symbols-outlined" style="font-size: 14px">forum</span>
                {{ chatConnected ? chatPlatform : 'Chat' }}
              </span>
              <span class="skill-chip" :class="obsConnected ? 'skill-chip--success' : 'skill-chip--muted'">
                <span class="material-symbols-outlined" style="font-size: 14px">cast</span>
                OBS
              </span>
              <span class="skill-chip">
                <span class="material-symbols-outlined" style="font-size: 14px">queue</span>
                {{ queue.length }} queued
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- Controls -->
    <div class="broadcast-control-strip skill-panel mt-5">
      <div class="columns is-vcentered is-centered">
        <div class="column is-narrow">
          <div class="buttons is-centered">
            <button
              v-if="!isLive"
              class="bz-btn bz-btn--agent-cta bz-btn--lg"
              :disabled="chatConnecting"
              :class="{ 'bz-btn--running': chatConnecting }"
              @click="connectChat"
            >
              <span class="material-symbols-outlined">play_arrow</span>
              Go Live
            </button>
            <template v-else>
              <button
                class="bz-btn bz-btn--lg"
                :class="isPaused ? 'bz-btn--agent-cta' : 'bz-btn--agent-cta'"
                @click="togglePause"
              >
                <span class="material-symbols-outlined">{{ isPaused ? 'play_arrow' : 'pause' }}</span>
                {{ isPaused ? 'Resume' : 'Pause' }}
              </button>
              <button class="bz-btn bz-btn--ghost bz-btn--lg" @click="skipCurrent" :disabled="!currentGeneration">
                <span class="material-symbols-outlined">skip_next</span>
                Skip
              </button>
              <button class="bz-btn bz-btn--destructive bz-btn--lg" @click="disconnectChat">
                <span class="material-symbols-outlined">stop</span>
                End Stream
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ SETUP TAB ═══ -->
    <div v-if="activeTab === 'setup'" class="broadcast-tab-panel broadcast-setup skill-panel mt-4 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        Chat Platform
      </h2>
      <span class="category-selector">
        <template v-for="p in platforms" :key="p.id">
          <input
            type="radio"
            name="chat_platform"
            :id="'platform_' + p.id"
            :value="p.id"
            :checked="chatPlatform === p.id"
            :disabled="p.unavailable || chatConnected"
            @change="chatPlatform = p.id"
          />
          <label :for="'platform_' + p.id" class="radio category">
            <span class="material-symbols-outlined" style="font-size: 18px">{{ p.icon }}</span>
            {{ p.label }}
          </label>
        </template>
      </span>

      <!-- Twitch -->
      <div v-if="chatPlatform === 'twitch'" class="bz-card-shell config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">Twitch Configuration</h4>
        <div class="field">
          <label class="label has-text-white">Channel Name</label>
          <div class="control has-icons-left">
            <input v-model="twitchChannel" type="text" class="skill-input" placeholder="your_channel" />
            <span class="icon is-left"><span class="material-symbols-outlined">tag</span></span>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-white">OAuth Token</label>
          <div class="control has-icons-left">
            <input v-model="twitchToken" type="password" class="skill-input" placeholder="oauth:xxxxxxxxx" />
            <span class="icon is-left"><span class="material-symbols-outlined">key</span></span>
          </div>
          <p class="help">Get your token from <a href="https://twitchapps.com/tmi/" target="_blank" class="has-text-info">twitchapps.com/tmi</a></p>
        </div>
      </div>

      <!-- YouTube -->
      <div v-if="chatPlatform === 'youtube'" class="bz-card-shell config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">YouTube Configuration</h4>
        <div class="field">
          <label class="label has-text-white">Live Stream ID</label>
          <div class="control has-icons-left">
            <input v-model="youtubeStreamId" type="text" class="skill-input" placeholder="Video ID" />
            <span class="icon is-left"><span class="material-symbols-outlined">live_tv</span></span>
          </div>
        </div>
      </div>

      <!-- Discord -->
      <div v-if="chatPlatform === 'discord'" class="bz-card-shell config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">Discord Configuration</h4>
        <div class="field">
          <label class="label has-text-white">Bot Token</label>
          <div class="control has-icons-left">
            <input v-model="discordToken" type="password" class="skill-input" placeholder="Bot token" />
            <span class="icon is-left"><span class="material-symbols-outlined">smart_toy</span></span>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-white">Channel ID</label>
          <div class="control has-icons-left">
            <input v-model="discordChannelId" type="text" class="skill-input" placeholder="Channel ID" />
            <span class="icon is-left"><span class="material-symbols-outlined">tag</span></span>
          </div>
        </div>
      </div>

      <!-- TikTok -->
      <div v-if="chatPlatform === 'tiktok'" class="bz-card-shell config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">TikTok Live Configuration</h4>
        <div class="field">
          <label class="label has-text-white">TikTok Username</label>
          <div class="control has-icons-left">
            <input v-model="tiktokUsername" type="text" class="skill-input" placeholder="@your_username" />
            <span class="icon is-left"><span class="material-symbols-outlined">person</span></span>
          </div>
          <p class="help">Your TikTok username (without @). You must be live for BonzAI to connect.</p>
        </div>
      </div>

      <!-- Kick -->
      <div v-if="chatPlatform === 'kick'" class="bz-card-shell config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">Kick Configuration</h4>
        <div class="field">
          <label class="label has-text-white">Channel Slug</label>
          <div class="control has-icons-left">
            <input v-model="kickChannel" type="text" class="skill-input" placeholder="your_channel" />
            <span class="icon is-left"><span class="material-symbols-outlined">tag</span></span>
          </div>
        </div>
      </div>

      <hr />

      <!-- OBS -->
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        OBS Studio
      </h2>
      <div class="bz-card-shell config-card has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">WebSocket Connection</h4>
        <div class="field">
          <label class="label has-text-white">URL</label>
          <div class="control has-icons-left">
            <input v-model="obsUrl" type="text" class="skill-input" placeholder="ws://127.0.0.1:4455" />
            <span class="icon is-left"><span class="material-symbols-outlined">dns</span></span>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-white">Password</label>
          <div class="control has-icons-left">
            <input v-model="obsPassword" type="password" class="skill-input" placeholder="Optional" />
            <span class="icon is-left"><span class="material-symbols-outlined">password</span></span>
          </div>
        </div>
        <button
          class="bz-btn bz-btn--agent-cta mt-3"
          @click="connectOBS"
          :disabled="obsConnecting"
          :class="{ 'bz-btn--running': obsConnecting }"
        >
          <span class="material-symbols-outlined">cast_connected</span>
          {{ obsConnected ? 'Reconnect' : 'Connect OBS' }}
        </button>
      </div>

      <!-- Source Mapping -->
      <div v-if="obsConnected" class="bz-card-shell config-card mt-4 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-5 mb-3">Source Mapping</h4>
        <p class="help mb-3">Map generation types to OBS source names.</p>
        <div v-for="mapping in sourceMappings" :key="mapping.type" class="field is-horizontal mb-2">
          <div class="field-label is-normal" style="flex: 0 0 130px">
            <label class="label has-text-white" style="font-size: 13px">
              <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle">{{ mapping.icon }}</span>
              {{ mapping.label }}
            </label>
          </div>
          <div class="field-body">
            <div class="field">
              <div class="control">
                <input v-model="mapping.sourceName" type="text" class="skill-input skill-input--sm" :placeholder="'OBS source for ' + mapping.label" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ QUEUE TAB ═══ -->
    <div v-if="activeTab === 'queue'" class="broadcast-tab-panel broadcast-queue skill-panel mt-4 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        Generation Queue
        <span class="skill-chip ml-3" style="vertical-align: middle">{{ queue.length }}</span>
      </h2>

      <div v-if="queue.length === 0" class="skill-card has-text-centered">
        <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.15">hourglass_empty</span>
        <p class="has-text-grey mt-2">Queue is empty</p>
      </div>

      <div v-for="(item, index) in queue" :key="item.id" class="queue-card">
        <div class="queue-card-left">
          <span class="queue-pos fira-sans-condensed-black-italic">#{{ index + 1 }}</span>
          <span class="platform-badge" :class="item.platform">{{ item.platform }}</span>
          <strong class="has-text-white">{{ item.user }}</strong>
          <span class="skill-chip ml-2">{{ item.type }}</span>
        </div>
        <div class="queue-card-prompt">{{ item.prompt }}</div>
        <BzCloseButton size="sm" aria-label="Remove" @click="removeFromQueue(index)" />
      </div>

      <button v-if="queue.length > 0" class="bz-btn bz-btn--destructive mt-4" @click="clearQueue">
        <span class="material-symbols-outlined">delete_sweep</span>
        Clear Queue
      </button>
    </div>

    <!-- ═══ MODERATION TAB ═══ -->
    <div v-if="activeTab === 'moderation'" class="broadcast-tab-panel broadcast-moderation skill-panel mt-4 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        Content Moderation
      </h2>

      <!-- NSFW Filter -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Sensitive keyword filter</h3>
      <p class="help">Blocks explicit keywords in requests. This does not inspect generated images or replace stream moderation.</p>
      <span class="category-selector" style="grid-template-columns: repeat(2, 1fr); max-width: 300px">
        <input type="radio" name="nsfw" id="nsfw_on" :checked="nsfwFilter" @change="nsfwFilter = true" />
        <label for="nsfw_on" class="radio category">
          <span class="material-symbols-outlined" style="font-size: 18px">shield</span>
          Enabled
        </label>
        <input type="radio" name="nsfw" id="nsfw_off" :checked="!nsfwFilter" @change="nsfwFilter = false" />
        <label for="nsfw_off" class="radio category">
          <span class="material-symbols-outlined" style="font-size: 18px">shield_lock</span>
          Disabled
        </label>
      </span>

      <hr />

      <!-- Cooldown -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Per-User Cooldown</h3>
      <div class="field has-addons">
        <div class="control">
          <input v-model.number="cooldownSeconds" type="number" class="skill-input" min="0" max="600" style="width: 100px" />
        </div>
        <div class="control">
          <a class="skill-unit">seconds</a>
        </div>
      </div>

      <hr />

      <!-- Keyword Blocklist -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Keyword Blocklist</h3>
      <textarea v-model="blocklist" class="textarea config-input" rows="4" placeholder="One blocked word or phrase per line"></textarea>

      <hr />

      <!-- Banned Users -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Banned Users</h3>
      <div v-if="bannedUsers.length === 0" class="help">No banned users</div>
      <div class="tags">
        <span v-for="(user, i) in bannedUsers" :key="user" class="skill-chip skill-chip--danger">
          {{ user }}
          <button class="delete bz-btn--sm" @click="bannedUsers.splice(i, 1)"></button>
        </span>
      </div>
      <div class="field has-addons mt-3">
        <div class="control">
          <input v-model="banInput" type="text" class="skill-input" placeholder="@username" @keyup.enter="banUser" />
        </div>
        <div class="control">
          <button class="bz-btn bz-btn--destructive" @click="banUser">Ban</button>
        </div>
      </div>
    </div>

    <!-- ═══ SETTINGS TAB ═══ -->
    <div v-if="activeTab === 'settings'" class="broadcast-tab-panel broadcast-settings skill-panel mt-4 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        Stream Settings
      </h2>

      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Stream Companion</h3>
      <p class="help">Companion moderation and chat replies are not available yet. Use the queue controls and keyword filters below.</p>
      <hr />

      <!-- Poll Duration -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Poll Duration</h3>
      <div class="field has-addons">
        <div class="control">
          <input v-model.number="pollDuration" type="number" class="skill-input" min="10" max="300" style="width: 100px" />
        </div>
        <div class="control">
          <a class="skill-unit">seconds</a>
        </div>
      </div>

      <hr />

      <!-- Max Queue -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Max Queue Size</h3>
      <div class="field has-addons">
        <div class="control">
          <input v-model.number="maxQueueSize" type="number" class="skill-input" min="1" max="100" style="width: 100px" />
        </div>
        <div class="control">
          <a class="skill-unit">prompts</a>
        </div>
      </div>

      <hr />

      <!-- Monetization -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Fan Payments</h3>
      <span class="category-selector" style="grid-template-columns: repeat(2, 1fr); max-width: 300px">
        <input type="radio" name="monetization" id="monetization_free" :checked="!monetizationEnabled" @change="monetizationEnabled = false" />
        <label for="monetization_free" class="radio category">Free</label>
        <input type="radio" name="monetization" id="monetization_paid" :checked="monetizationEnabled" disabled />
        <label for="monetization_paid" class="radio category">Paid · unavailable</label>
      </span>

      <p class="help mt-3">{{ $ui('Paid requests are not available. Select Free to accept audience requests.') }}</p>

      <hr />

      <!-- Content Types -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Enabled Content Types</h3>
      <span class="category-selector">
        <template v-for="ct in contentTypes" :key="ct.id">
          <input
            type="checkbox"
            :id="'ct_' + ct.id"
            :checked="enabledTypes.includes(ct.id)"
            @change="toggleContentType(ct.id)"
          />
          <label :for="'ct_' + ct.id" class="radio category">
            <span class="material-symbols-outlined" style="font-size: 18px">{{ ct.icon }}</span>
            {{ ct.label }}
          </label>
        </template>
      </span>
    </div>

    <!-- ═══ STATS TAB ═══ -->
    <div v-if="activeTab === 'stats'" class="broadcast-tab-panel broadcast-stats skill-panel mt-4 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        Stream Statistics
      </h2>

      <div class="columns is-multiline">
        <div class="column is-3-desktop is-6-mobile" v-for="stat in statCards" :key="stat.label">
          <div class="skill-card has-text-centered">
            <p class="fira-sans-condensed-black-italic is-size-2" :class="stat.color">{{ stat.value }}</p>
            <p class="is-size-7 has-text-grey" style="text-transform: uppercase; letter-spacing: 1px">{{ stat.label }}</p>
          </div>
        </div>
      </div>

      <!-- Generation Breakdown -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mt-5 mb-3">
        Generation Breakdown
      </h3>
      <table class="skill-table skill-fullwidth">
        <tbody>
          <tr v-for="ct in contentTypes" :key="ct.id" style="border-color: rgba(255,255,255,0.06)">
            <td style="color: rgba(255,255,255,0.6)">
              <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle">{{ ct.icon }}</span>
              {{ ct.label }}
            </td>
            <td class="has-text-right fira-sans-condensed-black-italic has-text-white">{{ stats.byType[ct.id] || 0 }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Activity Log -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mt-5 mb-3">
        Recent Activity
      </h3>
      <div v-if="activityLog.length === 0" class="help">No activity yet</div>
      <div class="activity-log">
        <div v-for="entry in activityLog.slice(-20).reverse()" :key="entry.id" class="activity-row">
          <span class="has-text-grey" style="font-size: 11px; min-width: 65px">{{ formatTime(entry.timestamp) }}</span>
          <span class="platform-badge" :class="entry.platform">{{ entry.platform }}</span>
          <strong class="has-text-white" style="font-size: 13px">{{ entry.user }}</strong>
          <span class="has-text-grey-light" style="font-size: 13px">{{ entry.action }}</span>
        </div>
      </div>
    </div>

    <!-- ═══ STICKY PiP PREVIEW (bottom-right) ═══ -->
    <div class="pip-container mb-5 pr-5" :class="{ 'is-active': isLive || lastOutput || currentGeneration }">
      <div class="pip-display">
        <div class="pip-bg" :style="previewBgStyle">
          <div class="pip-overlay"></div>
        </div>
        <div class="pip-content">
          <!-- Idle -->
          <div v-if="!lastOutput && !currentGeneration" class="pip-idle">
            <span class="material-symbols-outlined" style="font-size: 36px; color: rgba(255,255,255,0.2)">live_tv</span>
          </div>
          <!-- Generating -->
          <div v-else-if="currentGeneration" class="pip-idle">
            <span class="material-symbols-outlined rotating" style="font-size: 28px; color: white">progress_activity</span>
            <p style="font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 4px">{{ currentGeneration.type }}</p>
          </div>
          <!-- Image -->
          <img v-else-if="lastOutput?.type === 'image'" :src="lastOutput.data" alt="" class="pip-image" />
          <!-- Media -->
          <div v-else class="pip-idle">
            <span class="material-symbols-outlined" style="font-size: 28px; color: var(--bz-fg-low)">
              {{ lastOutput?.type === 'audio' ? 'headphones' : lastOutput?.type === 'music' ? 'music_note' : 'movie' }}
            </span>
          </div>
        </div>
        <!-- Live badge -->
        <div v-if="isLive" class="pip-live-badge">
          <span class="pip-live-dot"></span> LIVE
        </div>
        <!-- Attribution -->
        <div v-if="lastOutput" class="pip-attribution">
          <span class="platform-badge" :class="lastOutput.platform" style="font-size: 8px; padding: 1px 5px">{{ lastOutput.platform }}</span>
          <span style="font-size: 10px; color: rgba(255,255,255,0.6)">{{ lastOutput.user }}</span>
        </div>
      </div>

      <!-- Poll (below PiP) -->
      <div v-if="activePoll" class="pip-poll">
        <div class="poll-header fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined" style="font-size: 14px">ballot</span>
          {{ activePoll.remaining }}s
        </div>
        <div class="poll-option">
          <div class="poll-fill" :style="{ width: pollPercentA + '%' }"></div>
          <span class="poll-text">A: {{ activePoll.optionA }}</span>
          <span class="poll-count">{{ activePoll.votesA }}</span>
        </div>
        <div class="poll-option option-b">
          <div class="poll-fill fill-b" :style="{ width: pollPercentB + '%' }"></div>
          <span class="poll-text">B: {{ activePoll.optionB }}</span>
          <span class="poll-count">{{ activePoll.votesB }}</span>
        </div>
      </div>
    </div>

    <!-- Status Toast -->
    <Transition name="fade">
      <div v-if="statusMessage" class="stream-toast" :class="statusType">
        <span class="material-symbols-outlined" style="font-size: 16px">
          {{ statusType === 'success' ? 'check_circle' : statusType === 'error' ? 'error' : 'info' }}
        </span>
        {{ statusMessage }}
      </div>
    </Transition>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import BzCloseButton from '../BzCloseButton.vue';

const API_BASE = window.electronAPI?.env?.API_BASE || `http://127.0.0.1:${window.BONZAI_SERVER_PORT || 65000}`;

export default {
  name: 'LiveStreamerSkill',
  components: { BzCloseButton },
  props: {
    skill: { type: Object, default: null },
    modelAvailable: { type: [Function, Boolean], default: true },
  },
  emits: ['status-update', 'result-created', 'model-requirements-change'],
  setup(props, { emit }) {
    // ═══ TABS ═══
    const tabs = [
      { id: 'setup', label: 'Setup', icon: 'settings' },
      { id: 'queue', label: 'Queue', icon: 'queue' },
      { id: 'moderation', label: 'Moderation', icon: 'shield' },
      { id: 'settings', label: 'Settings', icon: 'tune' },
      { id: 'stats', label: 'Stats', icon: 'bar_chart' },
    ];
    const activeTab = ref('setup');

    // ═══ CONNECTION STATE ═══
    const chatPlatform = ref('twitch');
    const chatConnected = ref(false);
    const chatConnecting = ref(false);
    const obsConnected = ref(false);
    const obsConnecting = ref(false);
    const isLive = ref(false);

    const twitchChannel = ref('');
    const twitchToken = ref('');
    const youtubeStreamId = ref('');
    const discordToken = ref('');
    const discordChannelId = ref('');
    const kickChannel = ref('');
    const obsUrl = ref('ws://127.0.0.1:4455');
    const obsPassword = ref('');

    const platforms = [
      { id: 'twitch', label: 'Twitch', icon: 'live_tv' },
      { id: 'youtube', label: 'YouTube · unavailable', icon: 'smart_display', unavailable: true },
      { id: 'tiktok', label: 'TikTok', icon: 'music_video' },
      { id: 'kick', label: 'Kick · unavailable', icon: 'sports_esports', unavailable: true },
      { id: 'discord', label: 'Discord · unavailable', icon: 'forum', unavailable: true },
    ];
    const tiktokUsername = ref('');

    // ═══ OBS SOURCE MAPPING ═══
    const sourceMappings = reactive([
      { type: 'image', label: 'Image', icon: 'image', sourceName: '' },
      { type: 'audio', label: 'Speech', icon: 'record_voice_over', sourceName: '' },
      { type: 'music', label: 'Music', icon: 'music_note', sourceName: '' },
      { type: 'video', label: 'Video', icon: 'movie', sourceName: '' },
    ]);

    // ═══ QUEUE ═══
    const queue = ref([]);
    const currentGeneration = ref(null);
    const lastOutput = ref(null);
    const isPaused = ref(false);

    // ═══ POLL ═══
    const activePoll = ref(null);
    const pollDuration = ref(30);
    const pollPercentA = computed(() => {
      if (!activePoll.value) return 0;
      const total = activePoll.value.votesA + activePoll.value.votesB;
      return total === 0 ? 50 : Math.round((activePoll.value.votesA / total) * 100);
    });
    const pollPercentB = computed(() => activePoll.value ? 100 - pollPercentA.value : 0);

    // ═══ MODERATION ═══
    const cooldownSeconds = ref(30);
    const nsfwFilter = ref(true);
    const blocklist = ref('');
    const bannedUsers = ref([]);
    const banInput = ref('');

    // ═══ IMAGE SRC HELPER ═══
    function getImageSrc(image) {
      if (!image) return '';
      if (image.startsWith('data:')) return image;
      if (image.startsWith('http')) return image;
      if (image.startsWith('/assets/') || image.startsWith('/src/assets/') || image.startsWith('./assets/')) return image;
      if (image.startsWith('/')) {
        const port = window.BONZAI_SERVER_PORT || 65000;
        return `http://localhost:${port}/media/stream?path=${encodeURIComponent(image)}`;
      }
      return `data:image/png;base64,${image}`;
    }

    // ═══ COMPANIONS ═══
    const companions = ref([]);
    const selectedCompanionId = ref(null);
    const selectedCompanion = computed(() => companions.value.find(c => c.id === selectedCompanionId.value) || null);

    async function loadCompanions() {
      try {
        const stored = await window.electronAPI?.store?.get('roleplayCompanions', null);
        if (stored && stored.length > 0) {
          companions.value = stored;
        }
      } catch { /* */ }
    }

    // ═══ MONETIZATION ═══
    const monetizationEnabled = ref(false);
    const generationPrices = reactive({
      image: 0.50,
      audio: 0.50,
      music: 1.50,
      video: 2.50,
      '3d': 1.50,
    });
    // Fan wallets: platform:username → { walletId, address }
    const fanWallets = reactive(new Map());

    async function loadFanWallets() {
      try {
        const saved = await window.electronAPI?.store?.get('live-streamer-fan-wallets', null);
        if (saved) {
          for (const [k, v] of Object.entries(saved)) fanWallets.set(k, v);
        }
      } catch { /* */ }
    }

    async function saveFanWallets() {
      try {
        await window.electronAPI?.store?.set('live-streamer-fan-wallets', Object.fromEntries(fanWallets));
      } catch { /* */ }
    }

    /**
     * Look up a fan's wallet address by their chat username.
     * Fans register their wallet + username on bonzai.sh/link.
     * The mapping is stored locally (synced when fan types !bonzai commands).
     */
    function getFanWallet(user, platform) {
      const key = `${platform}:${user.toLowerCase()}`;
      return fanWallets.get(key) || null;
    }

    // Paid stream requests require a configured, atomic settlement flow.
    // Never charge two transfers or silently process paid requests for free.
    async function chargeFan(user, platform) {
      if (!monetizationEnabled.value) return true;
      logActivity(user, platform, 'Paid requests are unavailable. Switch to free mode to continue.');
      showStatus('Paid requests are unavailable. Switch to free mode to continue.', 'error');
      return false;
    }

    // ═══ SETTINGS ═══
    const companionEnabled = computed(() => !!selectedCompanionId.value);
    const maxQueueSize = ref(20);
    const contentTypes = [
      { id: 'image', label: 'Image', icon: 'image' },
      { id: 'audio', label: 'Speech', icon: 'record_voice_over' },
      { id: 'music', label: 'Music', icon: 'music_note' },
      { id: 'video', label: 'Video', icon: 'movie' },
    ];
    const enabledTypes = ref(['image', 'audio', 'music', 'video']);
    watch(enabledTypes, types => emit('model-requirements-change', {
      workflowId: 'live-streaming-v1.0.0',
      keys: types.map(type => ({ image: 'image_turbo', audio: 'audio_turbo', music: 'music_fast', video: 'video_fast' })[type]).filter(Boolean),
    }), { immediate: true, deep: true });
    const streamerWallet = ref('');

    async function saveStreamerWallet() {
      await window.electronAPI?.store?.set('live-streamer-wallet', streamerWallet.value || null);
    }

    // ═══ STATS ═══
    const stats = reactive({ totalGenerations: 0, uniqueViewers: 0, mints: 0, revenue: '0', byType: {} });
    const activityLog = ref([]);
    const statCards = computed(() => [
      { label: 'Generations', value: stats.totalGenerations, color: 'has-text-white' },
      { label: 'Unique Viewers', value: stats.uniqueViewers, color: 'has-text-info' },
      { label: 'Pending requests', value: queue.value.length, color: 'has-text-success' },
      { label: 'Generation revenue', value: stats.revenue + ' USDC', color: 'has-text-warning' },
    ]);

    // ═══ DISPLAY ═══
    const previewBgStyle = computed(() => {
      if (lastOutput.value?.type === 'image' && lastOutput.value?.data) {
        return { backgroundImage: `url(${getImageSrc(lastOutput.value.data)})`, backgroundSize: 'cover', backgroundPosition: 'center' };
      }
      return {};
    });

    // ═══ STATUS ═══
    const statusMessage = ref('');
    const statusType = ref('info');
    let statusTimeout = null;
    function showStatus(message, type = 'info') {
      statusMessage.value = message;
      statusType.value = type;
      if (statusTimeout) clearTimeout(statusTimeout);
      statusTimeout = setTimeout(() => { statusMessage.value = ''; }, 4000);
    }

    // ═══ CHAT CONNECTION ═══
    let chatClient = null;

    async function connectChat() {
      chatConnecting.value = true;
      emit('status-update', `Connecting to ${chatPlatform.value}...`);
      try {
        if (chatPlatform.value === 'twitch') {
          if (!twitchChannel.value || !twitchToken.value) { showStatus('Enter channel name and OAuth token', 'error'); return; }
          const tmi = await import('tmi.js');
          chatClient = new tmi.default.Client({
            channels: [twitchChannel.value],
            identity: { username: twitchChannel.value, password: twitchToken.value },
          });
          chatClient.on('message', (channel, tags, message, self) => {
            if (self) return;
            handleChatMessage(tags.username || tags['display-name'], message, 'twitch', tags.mod === true || tags.badges?.broadcaster === '1');
          });
          await chatClient.connect();

        } else if (chatPlatform.value === 'tiktok') {
          const username = tiktokUsername.value.replace('@', '').trim();
          if (!username) { showStatus('Enter your TikTok username', 'error'); return; }
          const { WebcastPushConnection } = await import('tiktok-live-connector');
          chatClient = new WebcastPushConnection(username);
          chatClient.on('chat', (data) => {
            handleChatMessage(data.uniqueId || data.nickname, data.comment, 'tiktok', String(data.uniqueId || '').toLowerCase() === username.toLowerCase());
          });
          chatClient.on('gift', (data) => {
            logActivity(data.uniqueId || data.nickname, 'tiktok', `sent ${data.giftName} x${data.repeatCount}`);
          });
          chatClient.on('disconnected', () => {
            chatConnected.value = false;
            isLive.value = false;
            showStatus('TikTok Live disconnected', 'info');
          });
          await chatClient.connect();

        } else {
          showStatus(`${chatPlatform.value} integration coming soon`, 'info');
          return;
        }
        chatConnected.value = true;
        isLive.value = true;
        isPaused.value = false;
        processQueue();
        showStatus(`Connected to ${chatPlatform.value}!`, 'success');
        logActivity('system', chatPlatform.value, `Connected to ${chatPlatform.value}`);
        saveConfig();
      } catch (err) {
        showStatus(err.message, 'error');
      } finally {
        chatConnecting.value = false;
        emit('status-update', '');
      }
    }

    function disconnectChat() {
      isPaused.value = true;
      if (currentGeneration.value) currentGeneration.value.discarded = true;
      queue.value = [];
      if (pollTimer) clearInterval(pollTimer);
      activePoll.value = null;
      if (chatClient?.disconnect) chatClient.disconnect();
      chatClient = null;
      chatConnected.value = false;
      isLive.value = false;
      showStatus('Stream ended', 'info');
    }

    // ═══ OBS CONNECTION ═══
    let obsWs = null;
    async function connectOBS() {
      obsConnecting.value = true;
      try {
        const OBSWebSocket = (await import('obs-websocket-js')).default;
        obsWs = new OBSWebSocket();
        await obsWs.connect(obsUrl.value, obsPassword.value || undefined);
        obsConnected.value = true;
        showStatus('Connected to OBS Studio!', 'success');
        logActivity('system', 'obs', 'Connected to OBS Studio');
        saveConfig();
      } catch (err) {
        showStatus(`OBS: ${err.message}`, 'error');
      } finally {
        obsConnecting.value = false;
      }
    }

    // ═══ CHAT MESSAGE HANDLER ═══
    const userCooldowns = new Map();
    const viewerSet = new Set();

    async function handleChatMessage(user, message, platform, moderator = false) {
      if (!user || typeof message !== 'string' || bannedUsers.value.includes(user.toLowerCase())) return;
      const msg = message.trim();
      if (msg.startsWith('!bl ')) { if (moderator) handleStreamerCommand(msg.slice(4).trim()); return; }
      if (msg.startsWith('!vote ') && activePoll.value) {
        const vote = msg.slice(6).trim().toUpperCase();
        if (vote === 'A' || vote === '1') activePoll.value.votesA++;
        else if (vote === 'B' || vote === '2') activePoll.value.votesB++;
        return;
      }
      if (msg.startsWith('!poll ')) {
        if (!moderator) return;
        const parts = msg.slice(6).split(/\s+vs\s+/i);
        if (parts.length === 2) startPoll(parts[0].trim(), parts[1].trim(), user, platform);
        return;
      }
      if (msg === '!level' || msg === '!mint') { logActivity(user, platform, 'This command is not available in live streaming.'); return; }

      // Balance check — fans manage wallets at bonzai.sh/link
      if (msg === '!balance' || msg === '!link' || msg === '!wallet') {
        const wallet = getFanWallet(user, platform);
        if (wallet?.address) {
          logActivity(user, platform, `wallet: ${wallet.address.slice(0, 10)}...`);
        } else {
          logActivity(user, platform, 'no wallet — visit bonzai.sh/link');
        }
        return;
      }

      if (!msg.startsWith('!bonzai ')) return;
      if (bannedUsers.value.includes(user.toLowerCase())) return;
      const now = Date.now();
      const lastUse = userCooldowns.get(user.toLowerCase()) || 0;
      if (now - lastUse < cooldownSeconds.value * 1000) return;
      userCooldowns.set(user.toLowerCase(), now);

      const cmd = msg.slice(8).trim();
      let type = null, prompt = cmd;
      if (cmd.startsWith('draw ')) { type = 'image'; prompt = cmd.slice(5); }
      else if (cmd.startsWith('say ')) { type = 'audio'; prompt = cmd.slice(4); }
      else if (cmd.startsWith('song ')) { type = 'music'; prompt = cmd.slice(5); }
      else if (cmd.startsWith('clip ')) { type = 'video'; prompt = cmd.slice(5); }
      if (!type || !prompt.trim()) return; // Unknown or empty request

      if (!enabledTypes.value.includes(type)) return;
      const blocked = blocklist.value.split('\n').filter(w => w.trim());
      if (nsfwFilter.value) blocked.push('porn', 'nude', 'naked', 'sexual', 'explicit', 'nudité', 'pornographique');
      if (blocked.some(w => prompt.toLowerCase().includes(w.trim().toLowerCase()))) return;
      if (queue.value.length >= maxQueueSize.value) return;

      // Charge fan if monetization is enabled
      const paid = await chargeFan(user, platform, type);
      if (!paid) return;

      queue.value.push({ id: Date.now() + Math.random(), user, platform, type, prompt, timestamp: Date.now() });
      logActivity(user, platform, `queued ${type}: "${prompt.slice(0, 50)}"`);
      if (!viewerSet.has(user.toLowerCase())) { viewerSet.add(user.toLowerCase()); stats.uniqueViewers = viewerSet.size; }
      processQueue();
    }

    function handleStreamerCommand(cmd) {
      if (cmd === 'pause') { isPaused.value = true; showStatus('Paused', 'info'); }
      else if (cmd === 'resume') { isPaused.value = false; showStatus('Resumed', 'success'); processQueue(); }
      else if (cmd === 'skip') skipCurrent();
      else if (cmd.startsWith('ban ')) bannedUsers.value.push(cmd.slice(4).replace('@', '').toLowerCase());
      else if (cmd.startsWith('cooldown ')) cooldownSeconds.value = parseInt(cmd.slice(9)) || 30;
    }

    // ═══ QUEUE PROCESSING ═══
    let isProcessing = false;
    async function processQueue() {
      if (isProcessing || isPaused.value || !isLive.value || queue.value.length === 0) return;
      isProcessing = true;
      const item = queue.value.shift();
      currentGeneration.value = item;
      try {
        emit('status-update', `Generating ${item.type} for ${item.user}...`);
        let result = null;
        if (item.type === 'image') result = await generateImage(item.prompt);
        else if (item.type === 'audio') result = await generateAudio(item.prompt);
        else if (item.type === 'music') result = await generateMusic(item.prompt);
        else if (item.type === 'video') result = await generateVideo(item.prompt);

        if (!result) throw new Error('The model returned no media.');
        if (item.discarded || !isLive.value) return;
        if (result) {
          lastOutput.value = { id: item.id, type: item.type, data: result, user: item.user, platform: item.platform, prompt: item.prompt };
          emit('result-created', lastOutput.value);
          if (obsConnected.value) await pushToOBS(item.type, result);
          stats.totalGenerations++;
          stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
          logActivity(item.user, item.platform, `generated ${item.type}`);
        }
      } catch (err) {
        logActivity(item.user, item.platform, `failed: ${err.message}`);
      } finally {
        currentGeneration.value = null;
        isProcessing = false;
        emit('status-update', '');
        if (queue.value.length > 0 && !isPaused.value) setTimeout(processQueue, 500);
      }
    }

    // ═══ GENERATION FUNCTIONS ═══
    async function requestMedia(endpoint, body, type) {
      const res = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.status === 202) throw new Error('Required models are not ready. Download them before retrying this request.');
      if (!res.ok || data.error || data.success === false) throw new Error(data.error || `${type}: ${res.status}`);
      if (data[`${type}_path`]) return data[`${type}_path`];
      if (data[`${type}_base64`]) {
        const mime = { image: 'image/png', audio: 'audio/wav', video: 'video/mp4' }[type];
        return `data:${mime};base64,${data[`${type}_base64`].replace(/^data:[^,]+,/, '')}`;
      }
      throw new Error(`The ${type} model returned no media.`);
    }
    async function generateImage(prompt) {
      return requestMedia('/image/turbo', { prompt, width: 1024, height: 1024 }, 'image');
    }
    async function generateAudio(text) {
      return requestMedia('/audio/turbo', { prompt: text, voice: 'af_heart' }, 'audio');
    }
    async function generateMusic(prompt) {
      let style = 'pop', bpm = 120;
      const m = prompt.match(/^\[([^\]]+)\]\s*/);
      if (m) { const parts = m[1].split(/\s+/); style = parts[0] || style; bpm = parseInt(parts[1]) || bpm; prompt = prompt.slice(m[0].length); }
      return requestMedia('/audio/music', { prompt, tags: style, bpm, duration: 30 }, 'audio');
    }
    async function generateVideo(prompt) {
      return requestMedia('/video', { mode: 't2v', prompt, width: 768, height: 480, frames: 97, frame_rate: 24, steps: 8, guidance_scale: 1 }, 'video');
    }

    // ═══ OBS BRIDGE ═══
    async function pushToOBS(type, data) {
      if (!obsWs) return;
      const mapping = sourceMappings.find(m => m.type === type);
      if (!mapping?.sourceName) return;
      try {
        if (data.startsWith('data:')) {
          const mime = data.slice(5, data.indexOf(';'));
          const ext = { 'image/png': 'png', 'audio/wav': 'wav', 'video/mp4': 'mp4' }[mime];
          const saved = ext && await window.electronAPI?.db?.blobs?.write(data.split(',')[1], ext, { source: 'stream', mimeType: mime });
          if (!saved?.path) throw new Error('The media could not be prepared for OBS.');
          data = saved.path;
        }
        if (type === 'image') await obsWs.call('SetInputSettings', { inputName: mapping.sourceName, inputSettings: { file: data } });
        else if (['audio', 'music', 'video'].includes(type)) await obsWs.call('SetInputSettings', { inputName: mapping.sourceName, inputSettings: { local_file: data, is_local_file: true } });
      } catch (err) { showStatus(`Media saved, but OBS was not updated: ${err.message}`, 'error'); logActivity('system', 'obs', `Delivery failed: ${err.message}`); }
    }

    // ═══ POLL ═══
    let pollTimer = null;
    function startPoll(optionA, optionB, user, platform) {
      if (activePoll.value) return;
      activePoll.value = { optionA, optionB, votesA: 0, votesB: 0, remaining: pollDuration.value, startedBy: user };
      logActivity(user, platform, `started poll: "${optionA}" vs "${optionB}"`);
      pollTimer = setInterval(() => {
        if (!activePoll.value) { clearInterval(pollTimer); return; }
        activePoll.value.remaining--;
        if (activePoll.value.remaining <= 0) {
          clearInterval(pollTimer);
          const winner = activePoll.value.votesA >= activePoll.value.votesB ? activePoll.value.optionA : activePoll.value.optionB;
          logActivity('system', platform, `poll won: "${winner}"`);
          queue.value.push({ id: Date.now(), user: `Poll (${user})`, platform, type: 'image', prompt: winner, timestamp: Date.now() });
          activePoll.value = null;
          processQueue();
        }
      }, 1000);
    }

    // ═══ HELPERS ═══
    function skipCurrent() { if (!currentGeneration.value) return; currentGeneration.value.discarded = true; showStatus('This result will be discarded. The next request starts when generation finishes.', 'info'); }
    function togglePause() { isPaused.value = !isPaused.value; if (!isPaused.value) processQueue(); }
    function clearQueue() { queue.value = []; showStatus('Queue cleared', 'info'); }
    function removeFromQueue(index) { queue.value.splice(index, 1); }
    function toggleContentType(id) { const idx = enabledTypes.value.indexOf(id); if (idx >= 0) enabledTypes.value.splice(idx, 1); else enabledTypes.value.push(id); }
    function banUser() { const u = banInput.value.trim().replace('@', '').toLowerCase(); if (u && !bannedUsers.value.includes(u)) { bannedUsers.value.push(u); banInput.value = ''; } }
    function logActivity(user, platform, action) { activityLog.value.push({ id: Date.now() + Math.random(), user, platform, action, timestamp: Date.now() }); }
    function formatTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

    // ═══ PERSISTENCE ═══
    async function saveConfig() {
      try { await window.electronAPI?.store?.set('live-streamer', { chatPlatform: chatPlatform.value, twitchChannel: twitchChannel.value, tiktokUsername: tiktokUsername.value, obsUrl: obsUrl.value, cooldownSeconds: cooldownSeconds.value, nsfwFilter: nsfwFilter.value, blocklist: blocklist.value, bannedUsers: bannedUsers.value, selectedCompanionId: selectedCompanionId.value, pollDuration: pollDuration.value, maxQueueSize: maxQueueSize.value, enabledTypes: enabledTypes.value, monetizationEnabled: monetizationEnabled.value, generationPrices: { ...generationPrices }, sourceMappings: sourceMappings.map(m => ({ type: m.type, sourceName: m.sourceName })) }); } catch { /* */ }
    }
    async function loadConfig() {
      try {
        const c = await window.electronAPI?.store?.get('live-streamer', null);
        if (!c) return;
        if (platforms.some(platform => platform.id === c.chatPlatform && !platform.unavailable)) chatPlatform.value = c.chatPlatform;
        if (c.twitchChannel) twitchChannel.value = c.twitchChannel;
        if (c.tiktokUsername) tiktokUsername.value = c.tiktokUsername;
        if (c.obsUrl) obsUrl.value = c.obsUrl;
        if (c.cooldownSeconds != null) cooldownSeconds.value = c.cooldownSeconds;
        if (c.nsfwFilter != null) nsfwFilter.value = c.nsfwFilter;
        if (c.blocklist) blocklist.value = c.blocklist;
        if (c.bannedUsers) bannedUsers.value = c.bannedUsers;
        if (c.selectedCompanionId) selectedCompanionId.value = c.selectedCompanionId;
        if (c.pollDuration) pollDuration.value = c.pollDuration;
        if (c.maxQueueSize) maxQueueSize.value = c.maxQueueSize;
        if (Array.isArray(c.enabledTypes)) enabledTypes.value = c.enabledTypes.filter(id => contentTypes.some(type => type.id === id));
        if (c.monetizationEnabled === true) { monetizationEnabled.value = true; showStatus('Paid requests are unavailable. Switch to free mode to continue.', 'error'); }
        if (c.generationPrices) Object.assign(generationPrices, c.generationPrices);
        if (c.sourceMappings) for (const s of c.sourceMappings) { const m = sourceMappings.find(x => x.type === s.type); if (m) m.sourceName = s.sourceName; }
      } catch { /* */ }
    }

    onMounted(async () => {
      loadCompanions();
      loadConfig();
      loadFanWallets();
      const savedWallet = await window.electronAPI?.store?.get('live-streamer-wallet', null);
      if (savedWallet) streamerWallet.value = savedWallet;
    });
    onUnmounted(() => {
      isPaused.value = true;
      isLive.value = false;
      if (currentGeneration.value) currentGeneration.value.discarded = true;
      if (chatClient?.disconnect) chatClient.disconnect();
      if (obsWs?.disconnect) obsWs.disconnect();
      if (pollTimer) clearInterval(pollTimer);
      if (statusTimeout) clearTimeout(statusTimeout);
    });

    return {
      tabs, activeTab,
      chatPlatform, chatConnected, chatConnecting, obsConnected, obsConnecting, isLive,
      platforms, twitchChannel, twitchToken, tiktokUsername, youtubeStreamId, discordToken, discordChannelId, kickChannel,
      obsUrl, obsPassword, sourceMappings, connectChat, disconnectChat, connectOBS,
      queue, currentGeneration, lastOutput, isPaused, skipCurrent, togglePause, clearQueue, removeFromQueue,
      activePoll, pollDuration, pollPercentA, pollPercentB,
      cooldownSeconds, nsfwFilter, blocklist, bannedUsers, banInput, banUser,
      companions, selectedCompanionId, selectedCompanion, companionEnabled, getImageSrc,
      monetizationEnabled, generationPrices, streamerWallet, saveStreamerWallet,
      maxQueueSize, contentTypes, enabledTypes, toggleContentType,
      stats, statCards, activityLog, formatTime, previewBgStyle,
      statusMessage, statusType,
    };
  },
};
</script>

<style scoped>
/* Design-system compatibility layer for migrated skill workflow surfaces. */
.skill-panel {
  padding: var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r) !important;
  color: var(--bz-fg);
}
.skill-panel + .skill-panel,
.analysis-history .skill-panel + .skill-panel {
  margin-top: var(--bz-space-5);
}
.skill-card {
  padding: var(--bz-space-4);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
}
.skill-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-4);
}
.skill-title-icon,
.skill-name .material-symbols-outlined {
  color: var(--bz-purple-300) !important;
  font-size: 42px !important;
  line-height: 1;
}
.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  min-height: 24px;
  padding: 2px var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1.2;
}
.skill-chip--brand { background: var(--bz-purple-soft); border-color: var(--bz-border-brand); color: var(--bz-fg); }
.skill-chip--success { background: var(--bz-emerald-soft); border-color: var(--bz-emerald-500); color: var(--bz-emerald-300); }
.skill-chip--warning { background: var(--bz-warning-soft); border-color: var(--bz-warning); color: var(--bz-warning); }
.skill-chip--info { background: var(--bz-info-soft); border-color: var(--bz-info); color: var(--bz-info); }
.skill-chip--danger { background: var(--bz-danger-soft); border-color: var(--bz-danger); color: var(--bz-danger); }
.skill-input,
.config-input {
  width: 100%;
  height: 40px;
  padding: 0 var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-input--sm { height: 32px; }
.skill-input:focus,
.config-input:focus {
  outline: none;
  border-color: var(--bz-border-brand);
}
.skill-textarea {
  width: 100%;
  min-height: 120px;
  padding: var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-unit {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
  color: var(--bz-fg-low);
  pointer-events: none;
}
.skill-fullwidth { width: 100%; }
.skill-progress {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border: 0;
  border-radius: var(--bz-r-pill);
  background: var(--bz-canvas);
}
.skill-progress::-webkit-progress-value { background: var(--bz-gradient-brand); }
.bz-btn--running { opacity: 0.72; }

/* ═══ Category Selector (matches Meditation Forge) ═══ */
.category-selector {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5em;
}

hr {
  margin: 12px 0;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    var(--bz-fg),
    transparent
  );
}

@media (max-width: 768px) {
  .category-selector { grid-template-columns: repeat(2, 1fr); }
}

.category-selector input[type='radio'],
.category-selector input[type='checkbox'] {
  display: none;
}

.category-selector input[type='radio'] + label.radio.category,
.category-selector input[type='checkbox'] + label.radio.category {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  font-family: 'Fira Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  background: transparent;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  color: var(--bz-fg-faint);
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.category-selector input[type='radio'] + label.radio.category:hover,
.category-selector input[type='checkbox'] + label.radio.category:hover {
  background: var(--bz-danger-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg-mid);
}

.category-selector input[type='radio']:checked + label.radio.category,
.category-selector input[type='checkbox']:checked + label.radio.category {
  color: var(--bz-control-selected-fg);
  border: 1px solid var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}

/* ═══ Common Styles (matches Meditation Forge) ═══ */
.skill-panel {
  padding: 2em;
  border: 1px solid var(--bz-border);
  border-radius: 4px !important;
}

.skill-name {
  font-size: 1.5rem;
  margin: 0;
  font-family: 'Fira Sans Condensed', sans-serif;
  font-style: italic;
  font-weight: 900;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}

.skill-description {
  color: var(--bz-fg-mid);
  margin-bottom: 0.5em;
  text-align: left;
}

/* ═══ Sticky PiP (bottom-right) ═══ */
.pip-container {
  position: fixed;
  bottom: 80px;
  right: 20px;
  z-index: 900;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  opacity: 0.4;
  transition: opacity 0.3s ease;
}

.pip-container:hover,
.pip-container.is-active {
  opacity: 1;
}

.pip-display {
  position: relative;
  width: 240px;
  height: 160px;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(135deg, #1a0a1e 0%, #1e1030 50%, #0f1a3a 100%);
  border: 1px solid var(--bz-border-strong);
  box-shadow: 0 8px 32px var(--bz-scrim-deep);
}

.pip-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  transition: background-image 0.5s ease;
}

.pip-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.5) 100%);
}

.pip-content {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.pip-idle {
  text-align: center;
}

.pip-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pip-text {
  padding: 12px;
  font-size: 10px;
  color: var(--bz-fg-mid);
  line-height: 1.5;
  overflow: hidden;
}

.pip-live-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(241, 70, 104, 0.9);
  font-size: 10px;
  font-weight: 800;
  color: var(--bz-fg);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.pip-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: white;
  animation: pip-blink 1.2s ease-in-out infinite;
}

@keyframes pip-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.pip-attribution {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(0,0,0,0.6);
}

/* PiP Poll */
.pip-poll {
  width: 240px;
  background: rgba(0,0,0,0.8);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 10px 12px;
}

/* ═══ Platform Badges ═══ */
.platform-badge {
  display: inline-block;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.platform-badge.twitch { background: rgba(145, 70, 255, 0.25); color: #bf94ff; }
.platform-badge.youtube { background: rgba(255, 0, 0, 0.2); color: var(--bz-danger); }
.platform-badge.tiktok { background: rgba(255, 0, 80, 0.2); color: #ff4081; }
.platform-badge.kick { background: rgba(83, 252, 24, 0.2); color: #53fc18; }
.platform-badge.discord { background: rgba(88, 101, 242, 0.25); color: #7289da; }
.platform-badge.obs { background: rgba(255,255,255,0.1); color: var(--bz-fg-low); }
.platform-badge.system { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.35); }

/* ═══ Companion Selector ═══ */
.companion-selector input[type='radio'] + label.radio.category {
  justify-content: flex-start;
  text-align: left;
}

/* ═══ Companion Avatars ═══ */
.companion-avatar-mini {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  margin-right: 4px;
}

.companion-avatar-preview {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--bz-border-strong);
  flex-shrink: 0;
}

/* ═══ Poll ═══ */
.poll-header {
  font-size: 12px;
  color: var(--bz-warning);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}

.poll-option {
  position: relative;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255,255,255,0.05);
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  overflow: hidden;
}

.poll-fill {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: rgba(72, 199, 142, 0.2);
  border-radius: 6px;
  transition: width 0.3s;
}

.poll-fill.fill-b { background: rgba(62, 142, 208, 0.2); }

.poll-text, .poll-count {
  position: relative;
  z-index: 1;
  font-size: 12px;
  color: var(--bz-fg-mid);
}

.poll-count { color: rgba(255,255,255,0.4); }

/* ═══ Queue Cards ═══ */
.queue-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  margin-bottom: 6px;
}

.queue-card-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.queue-pos { font-size: 13px; color: var(--bz-fg-faint); }

.queue-card-prompt {
  flex: 1;
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ═══ Config Cards (transparent glass) ═══ */
.config-card {
  background: var(--bz-canvas) !important;
  border: 1px solid var(--bz-border) !important;
  color: var(--bz-fg-mid) !important;
}

.config-card.is-live {
  border-color: var(--bz-emerald-soft) !important;
  background: rgba(72, 199, 142, 0.06) !important;
}

.config-card h4 {
  color: var(--bz-fg);
}

.config-card .label {
  color: var(--bz-fg-mid) !important;
  font-size: 13px;
}

.config-card .help {
  color: var(--bz-fg-faint);
}

.config-card .help a {
  color: var(--bz-info);
}

/* ═══ Config Inputs ═══ */
.config-input {
  background: var(--bz-card) !important;
  border-color: var(--bz-border-strong) !important;
  color: var(--bz-fg) !important;
}

.config-input:focus {
  border-color: var(--bz-control-selected-border) !important;
  box-shadow: 0 0 0 2px var(--bz-purple-soft) !important;
}

/* ═══ Activity Log ═══ */
.activity-log {
  max-height: 280px;
  overflow-y: auto;
}

.activity-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.activity-log::-webkit-scrollbar { width: 4px; }
.activity-log::-webkit-scrollbar-track { background: transparent; }
.activity-log::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

/* ═══ Toast ═══ */
.stream-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  z-index: 9999;
}

.stream-toast.success { background: var(--bz-emerald-soft); border: 1px solid var(--bz-emerald-soft); color: var(--bz-emerald-500); }
.stream-toast.error { background: var(--bz-danger-soft); border: 1px solid var(--bz-danger-soft); color: var(--bz-danger); }
.stream-toast.info { background: rgba(62, 142, 208, 0.15); border: 1px solid rgba(62, 142, 208, 0.3); color: var(--bz-info); }

/* ═══ Animations ═══ */
.rotating { animation: bz-spin 1s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Agentic redesign: Broadcast Console */
.broadcast-command-deck {
  position: sticky;
  top: 0;
  z-index: 5;
  display: grid;
  gap: var(--bz-space-4);
  padding: var(--bz-space-4);
  background: color-mix(in srgb, var(--bz-panel) 86%, transparent);
  backdrop-filter: blur(18px);
}
.broadcast-command-deck .columns,
.broadcast-command-deck .column {
  margin: 0;
  padding: 0;
}
.broadcast-command-deck .category-selector {
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
}
.broadcast-command-deck .config-card {
  margin-top: var(--bz-space-4) !important;
  border-color: var(--bz-border-strong);
  background: var(--bz-canvas);
}
.broadcast-command-deck .config-card.is-live {
  border-color: var(--bz-danger);
  box-shadow: 0 0 0 1px rgba(241, 70, 104, 0.18);
}
.broadcast-control-strip {
  margin-top: var(--bz-space-4) !important;
  background: var(--bz-panel);
}
.broadcast-control-strip .columns,
.broadcast-control-strip .column,
.broadcast-control-strip .buttons {
  margin: 0;
  padding: 0;
}
.broadcast-control-strip .buttons {
  justify-content: flex-end;
}
.broadcast-tab-panel {
  background: var(--bz-panel);
}
.broadcast-setup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
  gap: var(--bz-space-4);
}
.broadcast-setup > h2,
.broadcast-setup > .category-selector,
.broadcast-setup > .config-card,
.broadcast-setup > hr {
  grid-column: 1;
}
.broadcast-setup > h2:nth-of-type(2),
.broadcast-setup > h2:nth-of-type(2) ~ .config-card {
  grid-column: 2;
}
.broadcast-setup > hr {
  display: none;
}
.broadcast-queue .queue-card,
.broadcast-stats .activity-row {
  border: 1px solid var(--bz-border);
  background: var(--bz-canvas);
}
.broadcast-moderation,
.broadcast-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(260px, 1fr));
  gap: var(--bz-space-4);
}
.broadcast-moderation > h2,
.broadcast-settings > h2,
.broadcast-settings > p,
.broadcast-settings > .category-selector.companion-selector,
.broadcast-settings > .config-card,
.broadcast-settings > hr {
  grid-column: 1 / -1;
}
.broadcast-moderation > hr,
.broadcast-settings > hr {
  display: none;
}
.broadcast-moderation > h3,
.broadcast-settings > h3 {
  margin: 0 !important;
  padding-top: var(--bz-space-3);
  border-top: 1px solid var(--bz-border);
}
.broadcast-stats .columns {
  margin: 0;
}
.broadcast-stats .column {
  padding: var(--bz-space-2);
}
@media (max-width: 1040px) {
  .broadcast-setup,
  .broadcast-moderation,
  .broadcast-settings {
    grid-template-columns: 1fr;
  }
  .broadcast-setup > h2:nth-of-type(2),
  .broadcast-setup > h2:nth-of-type(2) ~ .config-card {
    grid-column: 1;
  }
}


/* Signature upgrade: broadcast wall */
.broadcast-wall {
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(0, 1.1fr);
  gap: var(--bz-space-4);
}
.broadcast-monitor {
  position: relative;
  min-height: clamp(220px, 32vh, 360px);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  overflow: hidden;
  background: #050507;
}
.broadcast-monitor-bg,
.broadcast-monitor-overlay {
  position: absolute;
  inset: 0;
}
.broadcast-monitor-bg {
  background-size: cover;
  background-position: center;
  opacity: 0.65;
}
.broadcast-monitor-overlay {
  background:
    linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.72)),
    radial-gradient(circle at 20% 20%, rgba(241,70,104,0.2), transparent 36%);
}
.broadcast-monitor-body {
  position: relative;
  z-index: 2;
  height: 100%;
  min-height: inherit;
  padding: var(--bz-space-5);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  color: var(--bz-fg);
}
.broadcast-monitor-body strong { font-size: clamp(32px, 5vw, 64px); line-height: 0.95; }
.broadcast-monitor-body > span:last-child { color: var(--bz-fg-mid); text-transform: uppercase; letter-spacing: 0.08em; }
.broadcast-state-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--bz-fg-faint);
  margin-bottom: var(--bz-space-3);
}
.broadcast-state-dot.is-live { background: var(--bz-danger); box-shadow: 0 0 0 8px rgba(241,70,104,0.16); }
.broadcast-wall-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-3);
}
.broadcast-wall-metrics > div {
  min-height: 112px;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.broadcast-wall-metrics span {
  color: var(--bz-fg-low);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.broadcast-wall-metrics strong {
  color: var(--bz-fg);
  font-size: clamp(22px, 3vw, 36px);
  line-height: 1;
  overflow-wrap: anywhere;
}
@media (max-width: 980px) {
  .broadcast-wall { grid-template-columns: 1fr; }
}

</style>
