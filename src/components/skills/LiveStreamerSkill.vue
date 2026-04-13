<template>
  <div class="live-streamer-skill">
    <!-- Skill Header -->
    <div class="models__activity--payouts mb-4 has-text-left">
      <div class="columns is-vcentered">
        <div class="column">
          <h3 class="skill-name is-size-1 fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined mr-2" style="font-size: 48px; color: var(--bulma-primary)">
              videocam
            </span>
            {{ skill?.name || 'Live Streaming Playground' }}
          </h3>
          <p class="skill-description is-size-5 mt-3">
            {{ skill?.description || 'Connect your stream chat to BonzAI. Viewers generate AI content live on stream.' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Tab Selector (radio pill style) -->
    <div class="models__activity--payouts pt-5 pb-5" style="position: relative; bottom: -40px; z-index: 11">
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
              <label :for="'live_tab_' + tab.id" class="radio category pt-3 pb-3">
                <span class="material-symbols-outlined mr-1" style="font-size: 18px">{{ tab.icon }}</span>
                {{ tab.label }}
              </label>
            </template>
          </span>
        </div>
      </div>

      <!-- Connection Status -->
      <div class="notification config-card mt-5 has-text-left" :class="{ 'is-live': isLive }">
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
              <span class="tag" :class="chatConnected ? 'is-success' : 'is-dark'">
                <span class="material-symbols-outlined mr-1" style="font-size: 14px">forum</span>
                {{ chatConnected ? chatPlatform : 'Chat' }}
              </span>
              <span class="tag" :class="obsConnected ? 'is-success' : 'is-dark'">
                <span class="material-symbols-outlined mr-1" style="font-size: 14px">cast</span>
                OBS
              </span>
              <span class="tag is-dark">
                <span class="material-symbols-outlined mr-1" style="font-size: 14px">queue</span>
                {{ queue.length }} queued
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <hr />

    <!-- Controls -->
    <div class="models__activity--payouts mt-5">
      <div class="columns is-vcentered is-centered">
        <div class="column is-narrow">
          <div class="buttons is-centered">
            <button
              v-if="!isLive"
              class="button is-success is-large"
              :disabled="chatConnecting"
              :class="{ 'is-loading': chatConnecting }"
              @click="connectChat"
            >
              <span class="material-symbols-outlined mr-2">play_arrow</span>
              Go Live
            </button>
            <template v-else>
              <button
                class="button is-large"
                :class="isPaused ? 'is-success' : 'is-warning'"
                @click="isPaused = !isPaused"
              >
                <span class="material-symbols-outlined mr-2">{{ isPaused ? 'play_arrow' : 'pause' }}</span>
                {{ isPaused ? 'Resume' : 'Pause' }}
              </button>
              <button class="button is-dark is-large" @click="skipCurrent" :disabled="!currentGeneration">
                <span class="material-symbols-outlined mr-2">skip_next</span>
                Skip
              </button>
              <button class="button is-danger is-large" @click="disconnectChat">
                <span class="material-symbols-outlined mr-2">stop</span>
                End Stream
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ SETUP TAB ═══ -->
    <div v-if="activeTab === 'setup'" class="models__activity--payouts mt-4 has-text-left">
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
            @change="chatPlatform = p.id"
          />
          <label :for="'platform_' + p.id" class="radio category pt-3 pb-3">
            <span class="material-symbols-outlined mr-1" style="font-size: 18px">{{ p.icon }}</span>
            {{ p.label }}
          </label>
        </template>
      </span>

      <!-- Twitch -->
      <div v-if="chatPlatform === 'twitch'" class="notification config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">Twitch Configuration</h4>
        <div class="field">
          <label class="label has-text-white">Channel Name</label>
          <div class="control has-icons-left">
            <input v-model="twitchChannel" type="text" class="input config-input" placeholder="your_channel" />
            <span class="icon is-left"><span class="material-symbols-outlined">tag</span></span>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-white">OAuth Token</label>
          <div class="control has-icons-left">
            <input v-model="twitchToken" type="password" class="input config-input" placeholder="oauth:xxxxxxxxx" />
            <span class="icon is-left"><span class="material-symbols-outlined">key</span></span>
          </div>
          <p class="help">Get your token from <a href="https://twitchapps.com/tmi/" target="_blank" class="has-text-info">twitchapps.com/tmi</a></p>
        </div>
      </div>

      <!-- YouTube -->
      <div v-if="chatPlatform === 'youtube'" class="notification config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">YouTube Configuration</h4>
        <div class="field">
          <label class="label has-text-white">Live Stream ID</label>
          <div class="control has-icons-left">
            <input v-model="youtubeStreamId" type="text" class="input config-input" placeholder="Video ID" />
            <span class="icon is-left"><span class="material-symbols-outlined">live_tv</span></span>
          </div>
        </div>
      </div>

      <!-- Discord -->
      <div v-if="chatPlatform === 'discord'" class="notification config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">Discord Configuration</h4>
        <div class="field">
          <label class="label has-text-white">Bot Token</label>
          <div class="control has-icons-left">
            <input v-model="discordToken" type="password" class="input config-input" placeholder="Bot token" />
            <span class="icon is-left"><span class="material-symbols-outlined">smart_toy</span></span>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-white">Channel ID</label>
          <div class="control has-icons-left">
            <input v-model="discordChannelId" type="text" class="input config-input" placeholder="Channel ID" />
            <span class="icon is-left"><span class="material-symbols-outlined">tag</span></span>
          </div>
        </div>
      </div>

      <!-- TikTok -->
      <div v-if="chatPlatform === 'tiktok'" class="notification config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">TikTok Live Configuration</h4>
        <div class="field">
          <label class="label has-text-white">TikTok Username</label>
          <div class="control has-icons-left">
            <input v-model="tiktokUsername" type="text" class="input config-input" placeholder="@your_username" />
            <span class="icon is-left"><span class="material-symbols-outlined">person</span></span>
          </div>
          <p class="help">Your TikTok username (without @). You must be live for BonzAI to connect.</p>
        </div>
      </div>

      <!-- Kick -->
      <div v-if="chatPlatform === 'kick'" class="notification config-card mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">Kick Configuration</h4>
        <div class="field">
          <label class="label has-text-white">Channel Slug</label>
          <div class="control has-icons-left">
            <input v-model="kickChannel" type="text" class="input config-input" placeholder="your_channel" />
            <span class="icon is-left"><span class="material-symbols-outlined">tag</span></span>
          </div>
        </div>
      </div>

      <hr />

      <!-- OBS -->
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        OBS Studio
      </h2>
      <div class="notification config-card has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-4 mb-3">WebSocket Connection</h4>
        <div class="field">
          <label class="label has-text-white">URL</label>
          <div class="control has-icons-left">
            <input v-model="obsUrl" type="text" class="input config-input" placeholder="ws://127.0.0.1:4455" />
            <span class="icon is-left"><span class="material-symbols-outlined">dns</span></span>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-white">Password</label>
          <div class="control has-icons-left">
            <input v-model="obsPassword" type="password" class="input config-input" placeholder="Optional" />
            <span class="icon is-left"><span class="material-symbols-outlined">password</span></span>
          </div>
        </div>
        <button
          class="button is-success mt-3"
          @click="connectOBS"
          :disabled="obsConnecting"
          :class="{ 'is-loading': obsConnecting }"
        >
          <span class="material-symbols-outlined mr-2">cast_connected</span>
          {{ obsConnected ? 'Reconnect' : 'Connect OBS' }}
        </button>
      </div>

      <!-- Source Mapping -->
      <div v-if="obsConnected" class="notification config-card mt-4 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-5 mb-3">Source Mapping</h4>
        <p class="help mb-3">Map generation types to OBS source names.</p>
        <div v-for="mapping in sourceMappings" :key="mapping.type" class="field is-horizontal mb-2">
          <div class="field-label is-normal" style="flex: 0 0 130px">
            <label class="label has-text-white" style="font-size: 13px">
              <span class="material-symbols-outlined mr-1" style="font-size: 16px; vertical-align: middle">{{ mapping.icon }}</span>
              {{ mapping.label }}
            </label>
          </div>
          <div class="field-body">
            <div class="field">
              <div class="control">
                <input v-model="mapping.sourceName" type="text" class="input config-input is-small" :placeholder="'OBS source for ' + mapping.label" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ QUEUE TAB ═══ -->
    <div v-if="activeTab === 'queue'" class="models__activity--payouts mt-4 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        Generation Queue
        <span class="tag is-dark ml-3" style="vertical-align: middle">{{ queue.length }}</span>
      </h2>

      <div v-if="queue.length === 0" class="notification is-dark has-text-centered">
        <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.15">hourglass_empty</span>
        <p class="has-text-grey mt-2">Queue is empty</p>
      </div>

      <div v-for="(item, index) in queue" :key="item.id" class="queue-card">
        <div class="queue-card-left">
          <span class="queue-pos fira-sans-condensed-black-italic">#{{ index + 1 }}</span>
          <span class="platform-badge" :class="item.platform">{{ item.platform }}</span>
          <strong class="has-text-white">{{ item.user }}</strong>
          <span class="tag is-dark ml-2">{{ item.type }}</span>
        </div>
        <div class="queue-card-prompt">{{ item.prompt }}</div>
        <button class="delete" @click="removeFromQueue(index)" title="Remove"></button>
      </div>

      <button v-if="queue.length > 0" class="button is-danger mt-4" @click="clearQueue">
        <span class="material-symbols-outlined mr-2">delete_sweep</span>
        Clear Queue
      </button>
    </div>

    <!-- ═══ MODERATION TAB ═══ -->
    <div v-if="activeTab === 'moderation'" class="models__activity--payouts mt-4 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        Content Moderation
      </h2>

      <!-- NSFW Filter -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">NSFW Filter</h3>
      <span class="category-selector" style="grid-template-columns: repeat(2, 1fr); max-width: 300px">
        <input type="radio" name="nsfw" id="nsfw_on" :checked="nsfwFilter" @change="nsfwFilter = true" />
        <label for="nsfw_on" class="radio category pt-3 pb-3">
          <span class="material-symbols-outlined mr-1" style="font-size: 18px">shield</span>
          Enabled
        </label>
        <input type="radio" name="nsfw" id="nsfw_off" :checked="!nsfwFilter" @change="nsfwFilter = false" />
        <label for="nsfw_off" class="radio category pt-3 pb-3">
          <span class="material-symbols-outlined mr-1" style="font-size: 18px">shield_lock</span>
          Disabled
        </label>
      </span>

      <hr />

      <!-- Cooldown -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Per-User Cooldown</h3>
      <div class="field has-addons">
        <div class="control">
          <input v-model.number="cooldownSeconds" type="number" class="input config-input" min="0" max="600" style="width: 100px" />
        </div>
        <div class="control">
          <a class="button is-static">seconds</a>
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
        <span v-for="(user, i) in bannedUsers" :key="user" class="tag is-danger is-medium">
          {{ user }}
          <button class="delete is-small" @click="bannedUsers.splice(i, 1)"></button>
        </span>
      </div>
      <div class="field has-addons mt-3">
        <div class="control">
          <input v-model="banInput" type="text" class="input config-input" placeholder="@username" @keyup.enter="banUser" />
        </div>
        <div class="control">
          <button class="button is-danger" @click="banUser">Ban</button>
        </div>
      </div>
    </div>

    <!-- ═══ SETTINGS TAB ═══ -->
    <div v-if="activeTab === 'settings'" class="models__activity--payouts mt-4 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        Stream Settings
      </h2>

      <!-- Companion Bot -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Stream Companion</h3>
      <p class="has-text-white mb-3" style="font-size: 13px; opacity: 0.7">Select a companion to attend chat as your stream bot. The companion's persona will be used for moderation and @mentions.</p>

      <div v-if="companions.length === 0" class="notification config-card has-text-left">
        <p style="font-size: 13px; color: rgba(255,255,255,0.5)">
          <span class="material-symbols-outlined mr-1" style="font-size: 16px; vertical-align: middle">info</span>
          No companions found. Create one in the Roleplay tab first.
        </p>
      </div>

      <span v-else class="category-selector companion-selector" style="grid-template-columns: repeat(3, 1fr)">
        <!-- None option -->
        <input
          type="radio"
          name="stream_companion"
          id="companion_none"
          :checked="!selectedCompanionId"
          @change="selectedCompanionId = null"
        />
        <label for="companion_none" class="radio category pt-3 pb-3">
          <span class="material-symbols-outlined mr-1" style="font-size: 18px">block</span>
          None
        </label>
        <!-- Companion options -->
        <template v-for="comp in companions" :key="comp.id">
          <input
            type="radio"
            name="stream_companion"
            :id="'companion_' + comp.id"
            :checked="selectedCompanionId === comp.id"
            @change="selectedCompanionId = comp.id"
          />
          <label :for="'companion_' + comp.id" class="radio category pt-3 pb-3">
            <img
              v-if="comp.image"
              :src="getImageSrc(comp.image)"
              class="companion-avatar-mini"
              :alt="comp.name"
            />
            <span class="material-symbols-outlined mr-1" v-else style="font-size: 18px">
              {{ comp.gender === 'female' ? 'female' : comp.gender === 'male' ? 'male' : 'smart_toy' }}
            </span>
            {{ comp.name }}
          </label>
        </template>
      </span>

      <!-- Selected companion info -->
      <div v-if="selectedCompanion" class="notification config-card mt-4 has-text-left">
        <div style="display: flex; align-items: center; gap: 12px">
          <img
            v-if="selectedCompanion.image"
            :src="getImageSrc(selectedCompanion.image)"
            class="companion-avatar-preview"
            :alt="selectedCompanion.name"
          />
          <div>
            <h4 class="fira-sans-condensed-black-italic is-size-5 mb-1">{{ selectedCompanion.name }}</h4>
            <p style="font-size: 12px; color: rgba(255,255,255,0.5)">
              {{ selectedCompanion.personality?.slice(0, 120) || selectedCompanion.description?.slice(0, 120) || 'No description' }}
            </p>
            <div class="tags mt-2">
              <span v-if="selectedCompanion.isNFT" class="tag is-success is-light">NFT</span>
              <span v-if="selectedCompanion.agentWallet" class="tag is-info is-light">Agent Wallet</span>
            </div>
          </div>
        </div>
      </div>

      <hr />

      <!-- Poll Duration -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Poll Duration</h3>
      <div class="field has-addons">
        <div class="control">
          <input v-model.number="pollDuration" type="number" class="input config-input" min="10" max="300" style="width: 100px" />
        </div>
        <div class="control">
          <a class="button is-static">seconds</a>
        </div>
      </div>

      <hr />

      <!-- Max Queue -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Max Queue Size</h3>
      <div class="field has-addons">
        <div class="control">
          <input v-model.number="maxQueueSize" type="number" class="input config-input" min="1" max="100" style="width: 100px" />
        </div>
        <div class="control">
          <a class="button is-static">prompts</a>
        </div>
      </div>

      <hr />

      <!-- Monetization -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">Fan Payments</h3>
      <span class="category-selector" style="grid-template-columns: repeat(2, 1fr); max-width: 300px">
        <input type="radio" name="monetization" id="monetization_free" :checked="!monetizationEnabled" @change="monetizationEnabled = false" />
        <label for="monetization_free" class="radio category pt-3 pb-3">Free</label>
        <input type="radio" name="monetization" id="monetization_paid" :checked="monetizationEnabled" @change="monetizationEnabled = true" />
        <label for="monetization_paid" class="radio category pt-3 pb-3">Paid (USDC)</label>
      </span>

      <div v-if="monetizationEnabled" class="notification config-card mt-4 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-5 mb-3">Price Per Generation (USDC)</h4>
        <div v-for="ct in contentTypes" :key="ct.id" class="field is-horizontal mb-2">
          <div class="field-label is-normal" style="flex: 0 0 100px">
            <label class="label has-text-white" style="font-size: 13px">
              <span class="material-symbols-outlined mr-1" style="font-size: 16px; vertical-align: middle">{{ ct.icon }}</span>
              {{ ct.label }}
            </label>
          </div>
          <div class="field-body">
            <div class="field has-addons">
              <div class="control">
                <input v-model.number="generationPrices[ct.id]" type="number" class="input config-input is-small" step="0.01" min="0" style="width: 90px" />
              </div>
              <div class="control">
                <a class="button is-static is-small">USDC</a>
              </div>
            </div>
          </div>
        </div>
        <p class="help mt-3">80% to you, 20% to BonzAI treasury. Fans type <code>!link</code> in chat to connect their wallet.</p>
        <hr />
        <h4 class="fira-sans-condensed-black-italic is-size-5 mb-3">Your Payout Wallet</h4>
        <div class="field">
          <div class="control">
            <input v-model="streamerWallet" type="text" class="input config-input" placeholder="0x... (Base address for receiving 80% of fan payments)" @change="saveStreamerWallet" />
          </div>
          <p class="help mt-2">Your wallet on Base to receive streamer share. Leave empty to use your connected wallet.</p>
        </div>
      </div>

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
          <label :for="'ct_' + ct.id" class="radio category pt-3 pb-3">
            <span class="material-symbols-outlined mr-1" style="font-size: 18px">{{ ct.icon }}</span>
            {{ ct.label }}
          </label>
        </template>
      </span>
    </div>

    <!-- ═══ STATS TAB ═══ -->
    <div v-if="activeTab === 'stats'" class="models__activity--payouts mt-4 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-4">
        Stream Statistics
      </h2>

      <div class="columns is-multiline">
        <div class="column is-3-desktop is-6-mobile" v-for="stat in statCards" :key="stat.label">
          <div class="notification is-dark has-text-centered">
            <p class="fira-sans-condensed-black-italic is-size-2" :class="stat.color">{{ stat.value }}</p>
            <p class="is-size-7 has-text-grey" style="text-transform: uppercase; letter-spacing: 1px">{{ stat.label }}</p>
          </div>
        </div>
      </div>

      <!-- Generation Breakdown -->
      <h3 class="fira-sans-condensed-black-italic is-size-5 has-text-white mt-5 mb-3">
        Generation Breakdown
      </h3>
      <table class="table is-fullwidth" style="background: transparent">
        <tbody>
          <tr v-for="ct in contentTypes" :key="ct.id" style="border-color: rgba(255,255,255,0.06)">
            <td style="color: rgba(255,255,255,0.6)">
              <span class="material-symbols-outlined mr-1" style="font-size: 16px; vertical-align: middle">{{ ct.icon }}</span>
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
            <span class="material-symbols-outlined" style="font-size: 28px; color: rgba(255,255,255,0.5)">
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
          <span class="material-symbols-outlined mr-1" style="font-size: 14px">ballot</span>
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
        <span class="material-symbols-outlined mr-1" style="font-size: 16px">
          {{ statusType === 'success' ? 'check_circle' : statusType === 'error' ? 'error' : 'info' }}
        </span>
        {{ statusMessage }}
      </div>
    </Transition>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';

export default {
  name: 'LiveStreamerSkill',
  props: {
    skill: { type: Object, default: null },
    modelAvailable: { type: [Function, Boolean], default: true },
  },
  emits: ['status-update'],
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
      { id: 'youtube', label: 'YouTube', icon: 'smart_display' },
      { id: 'tiktok', label: 'TikTok', icon: 'music_video' },
      { id: 'kick', label: 'Kick', icon: 'sports_esports' },
      { id: 'discord', label: 'Discord', icon: 'forum' },
    ];
    const tiktokUsername = ref('');

    // ═══ OBS SOURCE MAPPING ═══
    const sourceMappings = reactive([
      { type: 'image', label: 'Image', icon: 'image', sourceName: '' },
      { type: 'audio', label: 'Speech', icon: 'record_voice_over', sourceName: '' },
      { type: 'music', label: 'Music', icon: 'music_note', sourceName: '' },
      { type: 'video', label: 'Video', icon: 'movie', sourceName: '' },
      { type: '3d', label: '3D', icon: '3d_rotation', sourceName: '' },
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

    /**
     * Charge a fan for generation via USDC transferFrom.
     * Non-custodial: the fan pre-approved USDC spending on bonzai.sh/link.
     * The streamer's wallet calls transferFrom to pull USDC from the fan.
     * @returns {Promise<boolean>} true if payment succeeded
     */
    async function chargeFan(user, platform, contentType) {
      if (!monetizationEnabled.value) return true; // Free mode

      const price = generationPrices[contentType] || 0;
      if (price <= 0) return true;

      const fanWallet = getFanWallet(user, platform);
      if (!fanWallet?.address) {
        logActivity(user, platform, 'no wallet linked — visit bonzai.sh/link');
        return false;
      }

      const priceUsdc = Math.round(price * 1_000_000);
      const streamerShare = Math.round(priceUsdc * 0.8);
      const treasuryShare = priceUsdc - streamerShare;

      // Get streamer wallet (connected wallet or configured payout address)
      let streamerAddress = await window.electronAPI?.store?.get('live-streamer-wallet', null);
      if (!streamerAddress) {
        try {
          const { web3Service } = await import('../../services/web3.service.js');
          streamerAddress = web3Service.state.walletAddress;
        } catch { /* */ }
      }
      if (!streamerAddress) {
        logActivity('system', platform, 'No wallet connected — generation is free');
        return true;
      }

      const TREASURY = '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89';
      const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

      try {
        // Use the streamer's signer to call transferFrom on the fan's approved USDC
        const { web3Service } = await import('../../services/web3.service.js');
        const signer = await web3Service.getSigner();
        const { ethers } = await import('ethers');
        const usdc = new ethers.Contract(USDC_BASE, [
          'function transferFrom(address from, address to, uint256 amount) returns (bool)',
        ], signer);

        // 80% to streamer
        const tx1 = await usdc.transferFrom(fanWallet.address, streamerAddress, streamerShare);
        await tx1.wait();

        // 20% to treasury
        const tx2 = await usdc.transferFrom(fanWallet.address, TREASURY, treasuryShare);
        await tx2.wait();

        stats.revenue = (parseFloat(stats.revenue) + price).toFixed(2);
        logActivity(user, platform, `paid $${price.toFixed(2)} USDC`);
        return true;
      } catch (err) {
        logActivity(user, platform, `payment failed: ${err.message}`);
        return false;
      }
    }

    // ═══ SETTINGS ═══
    const companionEnabled = computed(() => !!selectedCompanionId.value);
    const maxQueueSize = ref(20);
    const contentTypes = [
      { id: 'image', label: 'Image', icon: 'image' },
      { id: 'audio', label: 'Speech', icon: 'record_voice_over' },
      { id: 'music', label: 'Music', icon: 'music_note' },
      { id: 'video', label: 'Video', icon: 'movie' },
      { id: '3d', label: '3D', icon: '3d_rotation' },
    ];
    const enabledTypes = ref(['image', 'audio', 'music', 'video', '3d']);
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
      { label: 'NFTs Minted', value: stats.mints, color: 'has-text-success' },
      { label: 'Mint Revenue', value: stats.revenue + ' ETH', color: 'has-text-warning' },
    ]);

    // ═══ DISPLAY ═══
    const previewBgStyle = computed(() => {
      if (lastOutput.value?.type === 'image' && lastOutput.value?.data) {
        return { backgroundImage: `url(${lastOutput.value.data})`, backgroundSize: 'cover', backgroundPosition: 'center' };
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
            handleChatMessage(tags['display-name'] || tags.username, message, 'twitch');
          });
          await chatClient.connect();

        } else if (chatPlatform.value === 'tiktok') {
          const username = tiktokUsername.value.replace('@', '').trim();
          if (!username) { showStatus('Enter your TikTok username', 'error'); return; }
          const { WebcastPushConnection } = await import('tiktok-live-connector');
          chatClient = new WebcastPushConnection(username);
          chatClient.on('chat', (data) => {
            handleChatMessage(data.uniqueId || data.nickname, data.comment, 'tiktok');
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

    async function handleChatMessage(user, message, platform) {
      const msg = message.trim();
      if (msg.startsWith('!bl ')) { handleStreamerCommand(msg.slice(4).trim()); return; }
      if (msg.startsWith('!vote ') && activePoll.value) {
        const vote = msg.slice(6).trim().toUpperCase();
        if (vote === 'A' || vote === '1') activePoll.value.votesA++;
        else if (vote === 'B' || vote === '2') activePoll.value.votesB++;
        return;
      }
      if (msg.startsWith('!poll ')) {
        const parts = msg.slice(6).split(/\s+vs\s+/i);
        if (parts.length === 2) startPoll(parts[0].trim(), parts[1].trim(), user, platform);
        return;
      }
      if (msg === '!level' || msg === '!mint') { logActivity(user, platform, msg.slice(1)); return; }

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
      else if (cmd.startsWith('3d ')) { type = '3d'; prompt = cmd.slice(3); }
      if (!type) return; // Unknown command

      if (!enabledTypes.value.includes(type)) return;
      const blocked = blocklist.value.split('\n').filter(w => w.trim());
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
      if (isProcessing || isPaused.value || queue.value.length === 0) return;
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

        if (result) {
          lastOutput.value = { type: item.type, data: result, user: item.user, platform: item.platform, prompt: item.prompt };
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
    async function generateImage(prompt) {
      const res = await fetch('http://127.0.0.1:65000/image/turbo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, width: 1024, height: 1024 }) });
      if (!res.ok) throw new Error(`Image: ${res.status}`);
      const data = await res.json();
      return data.image_base64 ? `data:image/png;base64,${data.image_base64}` : data.image_path;
    }
    async function generateAudio(text) {
      const res = await fetch('http://127.0.0.1:65000/audio/turbo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: 'af_heart' }) });
      if (!res.ok) throw new Error(`Audio: ${res.status}`);
      const data = await res.json();
      return data.audio_path || data.audio_base64;
    }
    async function generateMusic(prompt) {
      let style = 'pop', bpm = 120;
      const m = prompt.match(/^\[([^\]]+)\]\s*/);
      if (m) { const parts = m[1].split(/\s+/); style = parts[0] || style; bpm = parseInt(parts[1]) || bpm; prompt = prompt.slice(m[0].length); }
      const res = await fetch('http://127.0.0.1:65000/audio/music', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, tags: style, bpm, duration: 30 }) });
      if (!res.ok) throw new Error(`Music: ${res.status}`);
      return (await res.json()).audio_path;
    }
    async function generateVideo(prompt) {
      const res = await fetch('http://127.0.0.1:65000/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, width: 768, height: 480, num_frames: 81, fps: 24 }) });
      if (!res.ok) throw new Error(`Video: ${res.status}`);
      return (await res.json()).video_path;
    }

    // ═══ OBS BRIDGE ═══
    async function pushToOBS(type, data) {
      if (!obsWs) return;
      const mapping = sourceMappings.find(m => m.type === type);
      if (!mapping?.sourceName) return;
      try {
        if (type === 'image') await obsWs.call('SetInputSettings', { inputName: mapping.sourceName, inputSettings: { file: data } });
        else if (['audio', 'music', 'video'].includes(type)) await obsWs.call('SetInputSettings', { inputName: mapping.sourceName, inputSettings: { local_file: data, is_local_file: true } });
      } catch (err) { console.warn('[LiveStreamer] OBS push failed:', err.message); }
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
    function skipCurrent() { currentGeneration.value = null; showStatus('Skipped', 'info'); }
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
        if (c.chatPlatform) chatPlatform.value = c.chatPlatform;
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
        if (c.enabledTypes) enabledTypes.value = c.enabledTypes;
        if (c.monetizationEnabled != null) monetizationEnabled.value = c.monetizationEnabled;
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
      queue, currentGeneration, lastOutput, isPaused, skipCurrent, clearQueue, removeFromQueue,
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
    rgba(255, 255, 255, 1),
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
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  backdrop-filter: blur(32px);
}

.category-selector input[type='radio'] + label.radio.category:hover,
.category-selector input[type='checkbox'] + label.radio.category:hover {
  background: rgba(241, 70, 104, 0.15);
  border-color: rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.8);
}

.category-selector input[type='radio']:checked + label.radio.category,
.category-selector input[type='checkbox']:checked + label.radio.category {
  color: rgba(255, 255, 255, 1);
  border: 1px solid rgba(255, 255, 255, 1);
  background: rgba(241, 70, 104, 0.25);
  backdrop-filter: blur(64px);
}

/* ═══ Common Styles (matches Meditation Forge) ═══ */
.models__activity--payouts {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
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
  color: rgba(255, 255, 255, 0.8);
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
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
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
  color: rgba(255,255,255,0.7);
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
  color: white;
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
  backdrop-filter: blur(16px);
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
.platform-badge.youtube { background: rgba(255, 0, 0, 0.2); color: #ff6b6b; }
.platform-badge.tiktok { background: rgba(255, 0, 80, 0.2); color: #ff4081; }
.platform-badge.kick { background: rgba(83, 252, 24, 0.2); color: #53fc18; }
.platform-badge.discord { background: rgba(88, 101, 242, 0.25); color: #7289da; }
.platform-badge.obs { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); }
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
  border: 2px solid rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
}

/* ═══ Poll ═══ */
.poll-header {
  font-size: 12px;
  color: #ffe08a;
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
  color: rgba(255,255,255,0.8);
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

.queue-pos { font-size: 13px; color: rgba(255,255,255,0.3); }

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
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  backdrop-filter: blur(32px);
  color: rgba(255, 255, 255, 0.8) !important;
}

.config-card.is-live {
  border-color: rgba(72, 199, 142, 0.3) !important;
  background: rgba(72, 199, 142, 0.06) !important;
}

.config-card h4 {
  color: #fff;
}

.config-card .label {
  color: rgba(255, 255, 255, 0.6) !important;
  font-size: 13px;
}

.config-card .help {
  color: rgba(255, 255, 255, 0.35);
}

.config-card .help a {
  color: #3e8ed0;
}

/* ═══ Config Inputs ═══ */
.config-input {
  background: rgba(255,255,255,0.06) !important;
  border-color: rgba(255,255,255,0.12) !important;
  color: #fff !important;
}

.config-input:focus {
  border-color: rgba(241, 70, 104, 0.5) !important;
  box-shadow: none !important;
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

.stream-toast.success { background: rgba(72, 199, 142, 0.15); border: 1px solid rgba(72, 199, 142, 0.3); color: #48c78e; }
.stream-toast.error { background: rgba(241, 70, 104, 0.15); border: 1px solid rgba(241, 70, 104, 0.3); color: #f14668; }
.stream-toast.info { background: rgba(62, 142, 208, 0.15); border: 1px solid rgba(62, 142, 208, 0.3); color: #3e8ed0; }

/* ═══ Animations ═══ */
.rotating { animation: rotate 1s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
