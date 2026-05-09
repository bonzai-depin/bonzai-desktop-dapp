<template>
  <div class="models__activity--payouts">
    <!-- Loading State -->
    <div v-if="isLoadingSettings" class="loading-container">
      <div class="loading-spinner"></div>
      <p class="loading-text">Loading network settings...</p>
    </div>

    <div v-else class="panel bz-net-shell">
      <!-- Left rail — section navigation. Anchor-based so we don't
           have to reshape the existing 11-section template. -->
      <nav class="bz-net-rail" aria-label="Network settings sections">
        <p class="bz-eyebrow bz-net-rail__head">Network</p>
        <ul class="bz-net-rail__list">
          <li v-for="s in sections" :key="s.id">
            <button
              class="bz-net-rail__btn"
              :class="{ 'bz-net-rail__btn--active': activeSection === s.id }"
              @click="goToSection(s.id)"
            >
              <span class="bz-net-rail__dot"></span>
              <span>{{ s.label }}</span>
            </button>
          </li>
        </ul>
      </nav>

      <div class="bz-net-pane" ref="paneEl">
      <!-- Network Mode Selector -->
      <div class="network-mode-section">
        <h2 id="net-mode" class="section-title">
          Network Mode
        </h2>

        <div class="control mb-5 has-text-left mode-selector">
          <input
            v-model="networkMode"
            value="local"
            id="mode_local"
            type="radio"
            name="networkMode"
          />
          <label for="mode_local" class="radio mr-3">
            <span
              class="material-symbols-outlined"
              style="font-size: 32px !important"
            >
              wifi_off
            </span>
            Local
          </label>

          <input
            v-model="networkMode"
            value="consumer"
            id="mode_consumer"
            type="radio"
            name="networkMode"
          />
          <label for="mode_consumer" class="radio mr-3">
            <span
              class="material-symbols-outlined"
              style="font-size: 32px !important"
            >
              cloud_download
            </span>
            Consumer
          </label>

          <input
            v-model="networkMode"
            value="provider"
            id="mode_provider"
            type="radio"
            name="networkMode"
          />
          <label for="mode_provider" class="radio mr-3">
            <span
              class="material-symbols-outlined"
              style="font-size: 32px !important"
            >
              cloud_upload
            </span>
            Provider
          </label>
        </div>

        <!-- Mode Descriptions -->
        <div class="mode-description mb-5">
          <div v-if="networkMode === 'local'" class="description-card">
            <span class="material-symbols-outlined">info</span>
            <div>
              <strong>Local Mode</strong>
              <p>
                All generation runs on your device. Fully offline, maximum
                privacy.
              </p>
            </div>
          </div>
          <div
            v-else-if="networkMode === 'consumer'"
            class="description-card consumer"
          >
            <span class="material-symbols-outlined">info</span>
            <div>
              <strong>Consumer Mode</strong>
              <p>
                All generation requests are offloaded to remote BonzAI
                providers. Pay for completed requests with USDC.
              </p>
            </div>
          </div>
          <div
            v-else-if="networkMode === 'provider'"
            class="description-card provider"
          >
            <span class="material-symbols-outlined">info</span>
            <div>
              <strong>Provider Mode</strong>
              <p>
                Run generation locally and serve remote requests from other
                users. Earn USDC or ETH for each completed request.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Node Status (consumer + provider) -->
      <div class="status-section mt-5" v-if="networkMode === 'consumer' || networkMode === 'provider'">
        <h2 id="net-status" class="section-title">
          Node Status
        </h2>
        <div class="status-panel mt-3 mb-3" :class="{ online: p2pStatus.started, offline: !p2pStatus.started }">
          <div class="status-row">
            <span class="status-label">Status</span>
            <span class="status-value">
              <span class="status-indicator" :class="{ online: p2pStatus.started }"></span>
              {{ p2pStatus.started ? "Online" : "Offline" }}
            </span>
          </div>
          <template v-if="p2pStatus.started">
            <hr />
            <div class="status-row">
              <span class="status-label">Peer ID</span>
              <span class="status-value peer-id" @click="copyPeerId">
                {{ truncatedPeerId }}
                <span class="material-symbols-outlined copy-icon">content_copy</span>
              </span>
            </div>
            <hr />
            <div class="status-row">
              <span class="status-label">Connected Peers</span>
              <span class="status-value">{{ p2pStatus.connectedPeers || 0 }}</span>
            </div>
            <hr />
            <div class="status-row">
              <span class="status-label">NAT Status</span>
              <span class="status-value" :class="natStatusClass">
                <span class="material-symbols-outlined mr-1">
                  {{ p2pStatus.natStatus === "public" ? "public" : p2pStatus.natStatus === "relayed" ? "sync_alt" : "help" }}
                </span>
                {{ formatNatStatus(p2pStatus.natStatus) }}
              </span>
            </div>
          </template>
        </div>
        <div class="control-buttons mb-3">
          <button v-if="!p2pStatus.started" class="button is-success is-medium" @click="startP2P" :disabled="isStarting">
            <span v-if="isStarting" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">play_arrow</span>
            {{ isStarting ? "Starting..." : "Start Node" }}
          </button>
          <button v-else class="button is-danger is-medium" @click="stopP2P" :disabled="isStopping">
            <span v-if="isStopping" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">stop</span>
            {{ isStopping ? "Stopping..." : "Stop Node" }}
          </button>
          <button class="button is-warning is-medium ml-2" @click="refreshStatus" :disabled="isRefreshing">
            <span class="material-symbols-outlined" :class="{ spinning: isRefreshing }">refresh</span>
          </button>
        </div>
      </div>

      <!-- Network Address Translation (provider mode, below Node Status) -->
      <div class="mt-5 mb-5" v-if="networkMode === 'provider'">
        <h2 id="net-nat" class="section-title">Network Address Translation</h2>
        <div class="orchestration-controls mt-4">
          <div class="orchestration-label">Act as Relay</div>
          <div class="orchestration-toggle-row">
            <div class="orchestration-status-info">
              <span class="material-symbols-outlined mr-2" :class="enableRelay ? 'icon-success' : 'icon-muted'">
                {{ enableRelay ? "check_circle" : "cancel" }}
              </span>
              <span>
                {{ enableRelay ? "Enabled — helping peers behind NAT connect" : "Disabled" }}
                <span v-if="p2pStatus.natStatus !== 'public'" style="opacity: 0.5"> (requires public IP)</span>
              </span>
            </div>
            <button
              class="button is-small"
              :class="enableRelay ? 'is-danger' : 'is-success'"
              :disabled="p2pStatus.natStatus !== 'public'"
              @click="enableRelay = !enableRelay"
            >
              {{ enableRelay ? "Disable" : "Enable" }}
            </button>
          </div>
        </div>
        <div v-if="enableRelay" class="orchestration-controls mt-3">
          <div class="orchestration-label">Relay Fee — {{ relayFee }}%</div>
          <input type="range" class="pipeline-slider" min="1" max="10" step="1" v-model.number="relayFee" />
          <div class="slider-labels">
            <span>1%</span>
            <span class="bz-mono" style="color: var(--bz-fg)">{{ relayFee }}%</span>
            <span>10%</span>
          </div>
        </div>
      </div>

      <!-- LAN Providers (auto-discovered via mDNS, free) -->
      <div class="consumer-section mt-5" v-if="networkMode === 'consumer' && lanProviders.length > 0">
        <h2 id="net-local-providers" class="section-title">
          <span class="material-symbols-outlined mr-2" style="vertical-align: middle">wifi</span>
          Local Network Providers
        </h2>

        <div class="description-card pipeline">
          <span class="material-symbols-outlined">info</span>
          <div>
            <strong>Free LAN Inference</strong>
            <p>
              These providers were auto-discovered on your local network via mDNS.
              All inference is free — no payment, no on-chain registration required.
              Supports all pipelines: LLM, image, audio, video, music, and vision.
            </p>
          </div>
        </div>

        <div class="provider-cards mt-4">
          <div
            v-for="provider in lanProviders"
            :key="provider.peerId"
            class="provider-card"
            :class="{ selected: isProviderSelected(provider.peerId) }"
            @click="selectProvider(provider)"
          >
            <div class="provider-header">
              <span class="material-symbols-outlined provider-icon" style="color: #39d582">wifi</span>
              <div class="provider-info">
                <span class="provider-id">
                  {{ provider.lanAddress || truncateId(provider.peerId) }}
                </span>
                <span class="provider-status online">Online</span>
              </div>
              <div style="margin-left: auto; display: flex; gap: 6px; align-items: center">
                <span v-if="provider.latencyMs" class="tag is-dark" :title="provider.latencyMs + 'ms'">
                  {{ provider.latencyMs }}ms
                </span>
                <span class="tag is-success">LAN</span>
                <span class="tag is-info">FREE</span>
              </div>
            </div>
            <div class="provider-pricing">
              <div class="price-row" v-if="provider.version">
                <span>Version:</span>
                <span>v{{ provider.version }}</span>
              </div>
              <div class="price-row">
                <span>Peer ID:</span>
                <span>{{ truncateId(provider.peerId) }}</span>
              </div>
            </div>
            <div class="provider-pipelines" v-if="provider.availableModels?.length">
              <span
                v-for="m in provider.availableModels.slice(0, 4)"
                :key="m"
                class="pipeline-tag"
                style="font-size: 10px"
              >
                {{ m.replace('.gguf', '') }}
              </span>
              <span v-if="provider.availableModels.length > 4" class="more-tag">
                +{{ provider.availableModels.length - 4 }}
              </span>
            </div>
            <div class="provider-pipelines" v-if="provider.readyPipelines?.length || provider.pipelines?.length">
              <span
                v-for="p in (provider.readyPipelines || provider.pipelines || []).slice(0, 8)"
                :key="p"
                class="pipeline-tag"
                :class="{ ready: provider.readyPipelines?.includes(p) }"
              >
                {{ p }}
              </span>
              <span v-if="(provider.readyPipelines || provider.pipelines || []).length > 8" class="more-tag">
                +{{ (provider.readyPipelines || provider.pipelines || []).length - 8 }}
              </span>
            </div>
            <div v-if="isProviderSelected(provider.peerId)" class="provider-selected-badge">
              <span class="material-symbols-outlined mr-1" style="font-size: 14px">check_circle</span>
              Selected
            </div>
          </div>
        </div>
      </div>

      <hr v-if="networkMode === 'consumer'" />

      <!-- Consumer Mode: Remote Provider Selection -->
      <div class="consumer-section mt-5" v-if="networkMode === 'consumer'">
        <h2 id="net-remote-providers" class="section-title">
          Remote Providers
        </h2>

        <div class="provider-list">
          <div v-if="availableProviders.length === 0" class="no-providers">
            <span class="material-symbols-outlined is-size-1 mb-5">search_off</span>
            <p>
              No providers found in the registry. Please check back later or switch to
              Local Mode.
            </p>
            <hr />
            <button
              class="button is-warning is-medium mt-3"
              @click="refreshProviders"
              :disabled="isRefreshingProviders"
            >
              <span
                class="material-symbols-outlined mr-2 is-size-3"
                :class="{ spinning: isRefreshingProviders }"
              >
                refresh
              </span>
              Refresh Providers
            </button>
          </div>

          <div v-else class="provider-cards">
            <div
              v-for="provider in availableProviders"
              :key="provider.peerId"
              class="provider-card"
              :class="{
                selected: isProviderSelected(provider.peerId),
              }"
              @click="selectProvider(provider)"
            >
              <div class="provider-header">
                <span class="material-symbols-outlined provider-icon">dns</span>
                <div class="provider-info">
                  <span class="provider-id">
                    {{ truncateId(provider.peerId) }}
                  </span>
                  <span
                    class="provider-status"
                    :class="{ online: provider.online }"
                  >
                    {{ provider.online ? "Online" : "Offline" }}
                  </span>
                </div>
              </div>
              <div class="provider-pricing">
                <div class="price-row" v-if="provider.pricing?.llm">
                  <span>Chat:</span>
                  <span>{{ provider.pricing.llm }} {{ provider.currency || 'ETH' }}/1K tokens</span>
                </div>
                <div class="price-row" v-if="provider.pricing?.image">
                  <span>Image:</span>
                  <span>{{ provider.pricing.image }} {{ provider.currency || 'ETH' }}/image</span>
                </div>
                <div class="price-row" v-if="provider.pricing?.audio">
                  <span>Audio:</span>
                  <span>{{ provider.pricing.audio }} {{ provider.currency || 'ETH' }}/sec</span>
                </div>
                <div class="price-row" v-if="provider.pricing?.video">
                  <span>Video:</span>
                  <span>{{ provider.pricing.video }} {{ provider.currency || 'ETH' }}/sec</span>
                </div>
              </div>
              <div class="provider-pipelines" v-if="provider.pipelines?.length">
                <span
                  v-for="p in provider.pipelines.slice(0, 4)"
                  :key="p"
                  class="pipeline-tag"
                >
                  {{ p }}
                </span>
                <span v-if="provider.pipelines.length > 4" class="more-tag">
                  +{{ provider.pipelines.length - 4 }}
                </span>
              </div>

              <!-- Historical Performance -->
              <div class="provider-performance" v-if="getProviderHistory(provider.peerId)">
                <div class="performance-header">
                  <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle">speed</span>
                  Historical Performance
                  <span class="has-text-grey-light">({{ getProviderHistory(provider.peerId).totalGenerations }} runs)</span>
                </div>
                <div class="performance-metrics">
                  <span v-if="getProviderHistory(provider.peerId).text.count > 0" class="perf-metric">
                    <span class="material-symbols-outlined" style="font-size: 12px">chat</span>
                    {{ getProviderHistory(provider.peerId).text.avgTokPerSec.toFixed(1) }} tok/s
                  </span>
                  <span v-if="getProviderHistory(provider.peerId).image.count > 0" class="perf-metric">
                    <span class="material-symbols-outlined" style="font-size: 12px">image</span>
                    {{ getProviderHistory(provider.peerId).image.avgElapsed.toFixed(1) }}s
                  </span>
                  <span v-if="getProviderHistory(provider.peerId).video.count > 0" class="perf-metric">
                    <span class="material-symbols-outlined" style="font-size: 12px">movie</span>
                    {{ getProviderHistory(provider.peerId).video.avgElapsed.toFixed(1) }}s
                  </span>
                  <span v-if="getProviderHistory(provider.peerId).audio.count > 0" class="perf-metric">
                    <span class="material-symbols-outlined" style="font-size: 12px">headphones</span>
                    {{ getProviderHistory(provider.peerId).audio.avgElapsed.toFixed(1) }}s
                  </span>
                </div>
                <div class="performance-hw" v-if="getProviderHistory(provider.peerId).hardware">
                  <span class="has-text-grey-light" style="font-size: 0.7rem">
                    {{ getProviderHistory(provider.peerId).hardware.gpu }} / {{ (getProviderHistory(provider.peerId).hardware.ram / 1024 ** 3).toFixed(0) }}GB
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="selected-provider-info mt-4" v-if="selectedProviders.length > 0">
          <div class="notification is-success is-light">
            <span class="material-symbols-outlined mr-2">check_circle</span>
            {{ selectedProviders.length }} provider{{ selectedProviders.length > 1 ? 's' : '' }} selected.
            Inference requests will be routed to {{ selectedProviders.length > 1 ? 'a random provider' : 'this provider' }}.
          </div>
        </div>
      </div>

      <hr v-if="networkMode === 'consumer'" />

      <!-- Private Networking (Consumer Mode — after providers) -->
      <div class="pipeline-section mt-5 mb-5" v-if="networkMode === 'consumer'">
        <h2 id="net-privacy" class="section-title">Private Networking</h2>
        <div class="description-card pipeline">
          <span class="material-symbols-outlined">lock</span>
          <div>
            <strong>Structural Privacy Through Pipeline Parallelism</strong>
            <p>Split LLM inference across multiple peers so no single peer sees your prompt or output. Your device keeps the tokenizer, embedding, first and last transformer layers locally. Remote peers only process opaque activation tensors.</p>
          </div>
        </div>
        <div class="orchestration-controls mt-4">
          <div class="orchestration-label">Private Mode</div>
          <div class="orchestration-toggle-row">
            <div class="orchestration-status-info">
              <span class="material-symbols-outlined mr-2" :class="pipelineEnabled ? 'icon-success' : 'icon-muted'">{{ pipelineEnabled ? "check_circle" : "cancel" }}</span>
              <span>{{ pipelineEnabled ? "Enabled — providers never see your conversation" : "Disabled — providers see all requests and responses" }}</span>
            </div>
            <button class="button is-small" :class="pipelineEnabled ? 'is-danger' : 'is-success'" @click="pipelineEnabled = !pipelineEnabled">{{ pipelineEnabled ? "Disable" : "Enable" }}</button>
          </div>
        </div>
        <template v-if="pipelineEnabled">
          <div class="orchestration-controls mt-3">
            <div class="orchestration-label">Self Service</div>
            <div class="orchestration-toggle-row">
              <div class="orchestration-status-info">
                <span class="material-symbols-outlined mr-2" :class="pipelineLocalTest ? 'icon-success' : 'icon-muted'">{{ pipelineLocalTest ? "check_circle" : "cancel" }}</span>
                <span>{{ pipelineLocalTest ? "Running private inference on this machine" : "Requires remote providers" }}</span>
              </div>
              <button class="button is-small" :class="pipelineLocalTest ? 'is-danger' : 'is-success'" @click="pipelineLocalTest = !pipelineLocalTest">{{ pipelineLocalTest ? "Stop" : "Start" }}</button>
            </div>
            <div v-if="pipelineLocalTestStatus" class="mt-2">
              <span class="tag" :class="pipelineLocalTestStatus === 'running' ? 'is-success' : pipelineLocalTestStatus === 'starting' ? 'is-warning' : 'is-danger'" style="white-space: normal; height: auto; max-width: 100%">
                <span class="material-symbols-outlined mr-1" style="font-size: 14px">{{ pipelineLocalTestStatus === 'running' ? 'check_circle' : pipelineLocalTestStatus === 'starting' ? 'hourglass_empty' : 'error' }}</span>
                {{ pipelineLocalTestStatus }}
              </span>
            </div>
          </div>
          <div class="orchestration-controls mt-3">
            <div class="orchestration-label">Privacy Level — {{ pipelineLocalProportion }}%</div>
            <input type="range" class="pipeline-slider" min="25" max="75" step="5" v-model.number="pipelineLocalProportion" />
            <div class="slider-labels"><span>25% — Faster</span><span class="bz-mono" style="color: var(--bz-fg)">{{ pipelineLocalProportion }}%</span><span>75% — More Private</span></div>
          </div>
          <div class="orchestration-controls mt-3">
            <div class="orchestration-label">Extra Privacy <span class="material-symbols-outlined ml-1 info-tooltip" style="font-size: 16px; vertical-align: middle; cursor: help" title="Adds calibrated noise to activation tensors. Makes model inversion attacks infeasible.">info</span></div>
            <div class="orchestration-toggle-row">
              <div class="orchestration-status-info">
                <span class="material-symbols-outlined mr-2" :class="pipelineDPEnabled ? 'icon-success' : 'icon-muted'">{{ pipelineDPEnabled ? "check_circle" : "cancel" }}</span>
                <span>{{ pipelineDPEnabled ? "Enabled" : "Disabled" }}</span>
              </div>
              <button class="button is-small" :class="pipelineDPEnabled ? 'is-danger' : 'is-success'" @click="pipelineDPEnabled = !pipelineDPEnabled">{{ pipelineDPEnabled ? "Disable" : "Enable" }}</button>
            </div>
            <template v-if="pipelineDPEnabled">
              <div class="mt-3">
                <div class="orchestration-label">Privacy Budget (ε) — {{ pipelineEpsilon }}</div>
                <input type="range" class="pipeline-slider" min="2" max="16" step="1" v-model.number="pipelineEpsilon" />
                <div class="slider-labels"><span>ε = 2 — Strong Privacy</span><span class="bz-mono" style="color: var(--bz-fg)">ε = {{ pipelineEpsilon }}</span><span>ε = 16 — High Quality</span></div>
              </div>
            </template>
          </div>
        </template>
        <PipelineStatus class="mt-4" />
      </div>

      <hr v-if="networkMode === 'consumer' || networkMode === 'provider'" />

      <!-- Agentic Orchestration (consumer + provider) -->
      <div class="orchestration-section mt-5 mb-5" v-if="networkMode === 'consumer' || networkMode === 'provider'">
        <h2 id="net-orchestration" class="section-title">Agentic Orchestration</h2>
        <div class="description-card orchestration">
          <span class="material-symbols-outlined">info</span>
          <div>
            <strong>Multi-Channel Smart Agent</strong>
            <p>Connect BonzAI to agentic orchestration platforms via an OpenAI-compatible API on port 3002. Orchestrate media generation and companion interactions from your messaging applications (WhatsApp, Telegram, Discord) through OpenClaw or Hermes.</p>
          </div>
        </div>
        <div class="orchestration-controls mt-4">
          <div class="orchestration-label">OpenClaw</div>
          <div v-if="!openclawInstalled" class="orchestration-status not-installed"><span class="material-symbols-outlined mr-2">info</span><span>Not installed</span></div>
          <div v-else class="orchestration-toggle-row">
            <div class="orchestration-status-info">
              <span class="material-symbols-outlined mr-2" :class="openclawEnabled ? 'icon-success' : 'icon-muted'">{{ openclawEnabled ? "check_circle" : "cancel" }}</span>
              <span>{{ openclawEnabled ? "Enabled" : "Disabled" }}</span>
            </div>
            <button class="button is-small" :class="openclawEnabled ? 'is-danger' : 'is-success'" :disabled="openclawToggling" @click="toggleOpenClaw">
              <span v-if="openclawToggling" class="material-symbols-outlined mr-1 spinning">progress_activity</span>
              {{ openclawEnabled ? "Disable" : "Enable" }}
            </button>
          </div>
        </div>
        <div class="orchestration-controls mt-3">
          <div class="orchestration-label">Hermes</div>
          <div v-if="!hermesInstalled" class="orchestration-status not-installed"><span class="material-symbols-outlined mr-2">info</span><span>Not installed</span></div>
          <div v-else class="orchestration-toggle-row">
            <div class="orchestration-status-info">
              <span class="material-symbols-outlined mr-2" :class="hermesEnabled ? 'icon-success' : 'icon-muted'">{{ hermesEnabled ? "check_circle" : "cancel" }}</span>
              <span>{{ hermesEnabled ? "Enabled" : "Disabled" }}</span>
            </div>
            <button class="button is-small" :class="hermesEnabled ? 'is-danger' : 'is-success'" :disabled="hermesToggling" @click="toggleHermes">
              <span v-if="hermesToggling" class="material-symbols-outlined mr-1 spinning">progress_activity</span>
              {{ hermesEnabled ? "Disable" : "Enable" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Provider Settings (when in provider mode) -->
      <hr v-if="networkMode === 'provider' && p2pStatus.started" />

      <div
        class="provider-section mt-5"
        v-if="networkMode === 'provider' && p2pStatus.started"
      >
        <h2 id="net-pricing" class="section-title">
          Pricing
        </h2>

        <div class="control mb-4 has-text-left mode-selector">
          <input v-model="pricingCurrency" value="FREE" id="currency_free" type="radio" name="pricingCurrency" />
          <label for="currency_free" class="radio mr-3">
            <span class="material-symbols-outlined" style="font-size: 32px !important">money_off</span>
            Free
          </label>

          <input v-model="pricingCurrency" value="ETH" id="currency_eth" type="radio" name="pricingCurrency" />
          <label for="currency_eth" class="radio mr-3">
            <span class="material-symbols-outlined" style="font-size: 32px !important">currency_exchange</span>
            ETH
          </label>

          <input v-model="pricingCurrency" value="USDC" id="currency_usdc" type="radio" name="pricingCurrency" />
          <label for="currency_usdc" class="radio mr-3">
            <span class="material-symbols-outlined" style="font-size: 32px !important">paid</span>
            USDC
          </label>
        </div>

        <div v-if="pricingCurrency !== 'FREE'" class="pricing-grid" lang="en">
          <!-- LLM -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">chat</span>
              <span class="pricing-name">Chat</span>
            </div>
            <div class="pricing-input">
              <input
                type="text" inputmode="decimal" pattern="[0-9.]*"
                class="input"
                v-model.number="pipelinePricing.llm"
                placeholder="0.0001"
              />
              <span class="pricing-unit">{{ pricingCurrency }} / 1K tokens</span>
            </div>
          </div>

          <!-- Image -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">image</span>
              <span class="pricing-name">Image</span>
            </div>
            <div class="pricing-input">
              <input
                type="text" inputmode="decimal" pattern="[0-9.]*"
                class="input"
                v-model.number="pipelinePricing.image"
                placeholder="0.01"
              />
              <span class="pricing-unit">{{ pricingCurrency }} / image</span>
            </div>
          </div>

          <!-- Audio (TTS) -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">record_voice_over</span>
              <span class="pricing-name">Audio</span>
            </div>
            <div class="pricing-input">
              <input
                type="text" inputmode="decimal" pattern="[0-9.]*"
                class="input"
                v-model.number="pipelinePricing.audio"
                placeholder="0.001"
              />
              <span class="pricing-unit">{{ pricingCurrency }} / second</span>
            </div>
          </div>

          <!-- Music -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">music_note</span>
              <span class="pricing-name">Music</span>
            </div>
            <div class="pricing-input">
              <input
                type="text" inputmode="decimal" pattern="[0-9.]*"
                class="input"
                v-model.number="pipelinePricing.music"
                placeholder="0.05"
              />
              <span class="pricing-unit">{{ pricingCurrency }} / second</span>
            </div>
          </div>

          <!-- Video -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">movie</span>
              <span class="pricing-name">Video</span>
            </div>
            <div class="pricing-input">
              <input
                type="text" inputmode="decimal" pattern="[0-9.]*"
                class="input"
                v-model.number="pipelinePricing.video"
                placeholder="0.10"
              />
              <span class="pricing-unit">{{ pricingCurrency }} / second</span>
            </div>
          </div>

          <!-- Vision -->
          <div class="pricing-item">
            <div class="pricing-header">
              <span class="material-symbols-outlined">visibility</span>
              <span class="pricing-name">Vision</span>
            </div>
            <div class="pricing-input">
              <input
                type="text" inputmode="decimal" pattern="[0-9.]*"
                class="input"
                v-model.number="pipelinePricing.vision"
                placeholder="0.005"
              />
              <span class="pricing-unit">{{ pricingCurrency }} / image</span>
            </div>
          </div>

          <!-- Companions removed — billed per content type consumed -->
        </div>

        <!-- Companions removed — billed per content type consumed -->
      </div>

      <hr />

      <!-- Network Test -->
      <div class="test-section mt-5">
        <h2 id="net-self-test" class="section-title">
          Network Test
        </h2>

        <div class="test-panel">
          <button
            class="button is-success is-medium"
            @click="runSelfTest"
            :disabled="isSelfTesting"
          >
            <span v-if="isSelfTesting" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">monitor_heart</span>
            {{ isSelfTesting ? "Testing..." : "Run" }}
          </button>

          <div v-if="selfTestResults" class="self-test-results mt-4">
            <!-- Orchestration Gateway (Port 3002) — HTTP entry point for
                 OpenClaw/Hermes. Always up when the app runs; "active" only
                 when the user has enabled at least one orchestrator. This
                 tests the gateway itself, not the LLM behind it. -->
            <div class="test-result-row" :class="{ success: selfTestResults.openclaw?.ok, error: !selfTestResults.openclaw?.ok && selfTestResults.openclaw?.error !== 'No orchestrator enabled', warning: selfTestResults.openclaw?.error === 'No orchestrator enabled' }">
              <span class="material-symbols-outlined mr-2 test-icon" :class="selfTestResults.openclaw?.ok ? 'icon-success' : selfTestResults.openclaw?.error === 'No orchestrator enabled' ? 'icon-warning' : 'icon-error'">
                {{ selfTestResults.openclaw?.ok ? "check_circle" : selfTestResults.openclaw?.error === "No orchestrator enabled" ? "info" : "error" }}
              </span>
              <div class="test-result-content">
                <strong>Orchestration Gateway (Port 3002)</strong>
                <span class="test-result-detail">
                  {{ selfTestResults.openclaw?.ok ? (selfTestResults.openclaw?.detail || 'OpenClaw / Hermes HTTP') : selfTestResults.openclaw?.error || 'Not responding' }}
                </span>
              </div>
            </div>

            <!-- LLM Runtime (llama-server subprocess) — separate from the
                 gateway. Loads on demand when the user picks a model. -->
            <div class="test-result-row" :class="{ success: selfTestResults.llama?.ok, warning: !selfTestResults.llama?.ok && selfTestResults.llama?.error === 'No model loaded', error: !selfTestResults.llama?.ok && selfTestResults.llama?.error !== 'No model loaded' }">
              <span class="material-symbols-outlined mr-2 test-icon" :class="selfTestResults.llama?.ok ? 'icon-success' : selfTestResults.llama?.error === 'No model loaded' ? 'icon-warning' : 'icon-error'">
                {{ selfTestResults.llama?.ok ? 'check_circle' : selfTestResults.llama?.error === 'No model loaded' ? 'info' : 'error' }}
              </span>
              <div class="test-result-content">
                <strong>LLM Runtime (llama-server)</strong>
                <span class="test-result-detail">
                  <template v-if="selfTestResults.llama?.ok">
                    {{ selfTestResults.llama.modelName }} on :{{ selfTestResults.llama.port }}{{ selfTestResults.llama.rpcPeers?.length ? ` · ${selfTestResults.llama.rpcPeers.length} RPC peer(s)` : '' }}
                  </template>
                  <template v-else>
                    {{ selfTestResults.llama?.error || 'Not running' }}
                  </template>
                </span>
              </div>
            </div>

            <!-- Other Endpoints (Port 65000) -->
            <div class="test-result-row" :class="{ success: selfTestResults.flask?.ok, error: !selfTestResults.flask?.ok }">
              <span class="material-symbols-outlined mr-2 test-icon" :class="selfTestResults.flask?.ok ? 'icon-success' : 'icon-error'">
                {{ selfTestResults.flask?.ok ? "check_circle" : "error" }}
              </span>
              <div class="test-result-content">
                <strong>Other Endpoints (Port 65000)</strong>
                <span class="test-result-detail">
                  {{ selfTestResults.flask?.ok ? 'Image, audio, video, vision' : selfTestResults.flask?.error || 'Not responding' }}
                </span>
                <div v-if="selfTestResults.flask?.pipelines?.length" class="pipeline-tags">
                  <span v-for="p in selfTestResults.flask.pipelines" :key="p" class="pipeline-tag">{{ p }}</span>
                </div>
              </div>
            </div>

            <!-- P2P Node -->
            <div class="test-result-row" :class="{ success: selfTestResults.p2p?.ok, error: !selfTestResults.p2p?.ok }">
              <span class="material-symbols-outlined mr-2 test-icon" :class="selfTestResults.p2p?.ok ? 'icon-success' : 'icon-error'">
                {{ selfTestResults.p2p?.ok ? "check_circle" : "error" }}
              </span>
              <div class="test-result-content">
                <strong>Peer-to-Peer Node</strong>
                <span class="test-result-detail">
                  {{ selfTestResults.p2p?.ok ? `Peer ID: ${truncatedPeerId}` : selfTestResults.p2p?.error || "Not started" }}
                </span>
              </div>
            </div>

            <!-- Overall Status -->
            <div class="overall-status mt-3" :class="{ ready: selfTestResults.ready, 'not-ready': !selfTestResults.ready }">
              <span class="material-symbols-outlined mr-2 test-icon" :class="selfTestResults.ready ? 'icon-success' : 'icon-warning'">
                {{ selfTestResults.ready ? "rocket_launch" : "warning" }}
              </span>
              <span class="has-text-white" v-if="selfTestResults.ready">
                {{ networkMode === 'consumer' ? 'Ready to consume inference!' : 'Ready to serve inference!' }}
              </span>
              <span v-else>
                {{ selfTestResults.readyMessage || "Some services need attention" }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Peer Connection Test -->
      <div class="test-section" v-if="p2pStatus.started">
        <hr />
        <h2 id="net-peer-test" class="section-title mt-5">
          Peer Connection Test
        </h2>

        <div class="test-panel">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input
                type="text"
                class="input is-large"
                v-model="testPeerId"
                placeholder="Enter peer ID to test connection (12D3KooW...)"
              />
            </div>
            <div class="control">
              <button
                class="button is-success is-large"
                @click="testConnection"
                :disabled="!testPeerId || isTesting"
                style="box-shadow: none"
              >
                <span v-if="isTesting" class="loader mr-2"></span>
                <span class="material-symbols-outlined">
                  {{ isTesting ? "hourglass_empty" : "cable" }}
                </span>
              </button>
            </div>
          </div>

          <div
            v-if="testResult"
            class="test-result mt-3"
            :class="{ success: testResult.ok, error: !testResult.ok }"
          >
            <span class="material-symbols-outlined mr-2">
              {{ testResult.ok ? "check_circle" : "error" }}
            </span>
            <span v-if="testResult.ok">
              Connected! Peer supports {{ testResult.pipelines?.length || 0 }} pipelines
            </span>
            <span v-else>
              {{ testResult.error || "Connection failed" }}
            </span>
          </div>
        </div>
      </div>

      <!-- Appearance — theme picker. Always visible regardless of
           network mode; lives in the rail under "Appearance". -->
      <hr />
      <div class="theme-section mt-5" id="net-appearance">
        <h2 class="section-title">Appearance</h2>
        <p class="has-text-grey is-size-7 mb-4">
          Same components, different palette. Pick the theme that suits
          your eyes — it persists across launches.
        </p>
        <div class="bz-theme-grid">
          <button
            v-for="t in themeOptions"
            :key="t.id"
            type="button"
            class="bz-theme-card"
            :class="{ 'bz-theme-card--active': themeService.state.current === t.id }"
            @click="themeService.set(t.id)"
          >
            <span class="bz-theme-card__swatch">
              <span :style="{ background: t.swatch[0] }"></span>
              <span :style="{ background: t.swatch[1] }"></span>
              <span :style="{ background: t.swatch[2] }"></span>
            </span>
            <span class="bz-theme-card__title">{{ t.name }}</span>
            <span class="bz-theme-card__blurb bz-meta">{{ t.blurb }}</span>
          </button>
        </div>
      </div>

      <!-- ServiceTime / MintPool rewards (provider-only) -->
      <hr v-if="networkMode === 'provider'" />
      <div
        class="service-time-section mt-5"
        v-if="networkMode === 'provider'"
      >
        <h2 id="net-service-time" class="section-title">
          Service Time
        </h2>
        <p class="has-text-grey is-size-7 mb-3">
          Seconds you've served as a shard provider, queued for submission
          to <code>BonzaiServiceTime</code> on Arbitrum. Rewards land at
          epoch close from the relevant MintPool's provider-side share.
        </p>

        <div v-if="!serviceTimeReady" class="notification is-warning is-light">
          <strong>Pending audit deploy.</strong>
          The on-chain BonzaiServiceTime address isn't populated yet.
          Sessions still accumulate locally — they'll submit when the
          contract goes live and the address lands in <code>web3.config.js</code>.
        </div>

        <div v-if="serviceTimePending && serviceTimePending.rows > 0" class="pending-summary mt-3">
          <div class="pending-row">
            <strong>{{ serviceTimePending.rows }} sessions</strong>
            <span class="ml-2 has-text-grey">({{ (serviceTimePending.bytes / 1024).toFixed(1) }} KB ledger)</span>
          </div>
          <ul class="pipeline-list mt-2">
            <li
              v-for="(secs, pid) in serviceTimePending.pendingSeconds"
              :key="pid"
              class="pipeline-row"
            >
              <span class="pipeline-name">{{ pipelineLabel(pid) }}</span>
              <span class="pipeline-seconds">{{ formatSeconds(secs) }}</span>
            </li>
          </ul>
        </div>
        <div v-else class="has-text-grey is-italic mt-2">
          No pending service-time rows.
        </div>

        <div class="mt-4 buttons">
          <button
            class="button is-info"
            :disabled="!serviceTimeReady || serviceTimeFlushing || !serviceTimePending?.rows"
            @click="flushServiceTime"
            :title="serviceTimeEligibility?.ok ? 'Submit pending seconds to Arbitrum' : (serviceTimeEligibility?.balance >= 0n ? 'Need 1000 BONZAI on Arbitrum to submit' : 'Connect wallet to check eligibility')"
          >
            <span class="material-symbols-outlined mr-2">cloud_upload</span>
            <span v-if="serviceTimeFlushing">Submitting…</span>
            <span v-else>Submit Pending</span>
          </button>
          <button
            class="button is-light"
            @click="refreshServiceTime"
            :disabled="serviceTimeFlushing"
          >
            <span class="material-symbols-outlined mr-2">refresh</span>
            Refresh
          </button>
        </div>

        <div v-if="serviceTimeFlushResult" class="mt-3 notification is-success is-light">
          Submitted {{ serviceTimeFlushResult.rowsSubmitted }} rows · tx
          <code>{{ serviceTimeFlushResult.txHash?.slice(0, 10) }}…</code>
        </div>
        <div v-if="serviceTimeFlushError" class="mt-3 notification is-danger is-light">
          {{ serviceTimeFlushError }}
        </div>
      </div>
      </div><!-- /.bz-net-pane -->
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { getProviderPerformanceStats } from "../stores/inferenceStore.js";
import PipelineStatus from "./PipelineStatus.vue";
import {
  isConfigured as serviceTimeIsConfigured,
  getPendingSummary as serviceTimeGetPending,
  flushPending as serviceTimeFlush,
  checkEligibility as serviceTimeCheckEligibility,
} from "../services/serviceTime.service.js";
import { themeService } from "../services/theme.service.js";

const themeOptions = themeService.list();

// ─── Section rail navigation ───────────────────────────────────
//
// 11 sections, anchored by id on each <h2>. The rail is a vertical
// list of buttons that scrollIntoView() the corresponding section,
// and an IntersectionObserver keeps the active item in sync as the
// user scrolls the pane manually.
//
// `visible` predicates mirror the v-if guards on each section's
// parent so the rail only lists targets that actually exist in the
// DOM — clicking a rail item that points at a hidden section was
// silently broken before.
const _allSections = [
  { id: "net-mode",             label: "Mode",            visible: () => true },
  { id: "net-status",           label: "Node Status",     visible: () => networkMode.value === "consumer" || networkMode.value === "provider" },
  { id: "net-nat",              label: "NAT",             visible: () => networkMode.value === "provider" },
  { id: "net-local-providers",  label: "Local Providers", visible: () => networkMode.value === "consumer" && lanProviders.value && lanProviders.value.length > 0 },
  { id: "net-remote-providers", label: "Remote Providers",visible: () => networkMode.value === "consumer" },
  { id: "net-privacy",          label: "Privacy",         visible: () => networkMode.value === "consumer" },
  { id: "net-orchestration",    label: "Orchestration",   visible: () => networkMode.value === "consumer" || networkMode.value === "provider" },
  { id: "net-pricing",          label: "Pricing",         visible: () => networkMode.value === "provider" && p2pStatus.value?.started },
  { id: "net-self-test",        label: "Self-Test",       visible: () => p2pStatus.value?.started },
  { id: "net-peer-test",        label: "Peer Test",       visible: () => p2pStatus.value?.started },
  { id: "net-service-time",     label: "Service Time",    visible: () => networkMode.value === "provider" },
  { id: "net-appearance",       label: "Appearance",      visible: () => true },
];
const sections = computed(() => _allSections.filter((s) => s.visible()));
const activeSection = ref("net-mode");
const paneEl = ref(null);
let _sectionObserver = null;

function goToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  activeSection.value = id;
}

// State
const isLoadingSettings = ref(true);
const networkMode = ref("local");
const p2pStatus = ref({
  started: false,
  peerId: null,
  multiaddrs: [],
  connectedPeers: 0,
  relayConnections: 0,
  natStatus: "unknown",
  isUsingRelay: false,
});

const isStarting = ref(false);
const isStopping = ref(false);
const isRefreshing = ref(false);
const isTesting = ref(false);
const isSelfTesting = ref(false);

// Consumer mode state
const availableProviders = ref([]);
const selectedProviders = ref([]); // Array of selected provider objects
const isRefreshingProviders = ref(false);
const providerHistory = ref({});

// LAN providers (auto-discovered via mDNS, free)
const lanProviders = ref([]);
let lanPollInterval = null;
const pollLANProviders = async () => {
  try {
    const res = await window.electronAPI.p2pLANPeers?.();
    if (res?.ok) lanProviders.value = res.peers;
  } catch {}
};

// Pipeline privacy settings (consumer mode)
const pipelineEnabled = ref(false);
const pipelineLocalTest = ref(false);
const pipelineLocalTestStatus = ref(null);
const pipelineLocalProportion = ref(25);
const pipelineDPEnabled = ref(false);
const pipelineEpsilon = ref(8);

// Shard provider toggle (provider mode)
const shardProviderEnabled = ref(false);

watch(shardProviderEnabled, async (enabled) => {
  if (enabled) {
    const res = await window.electronAPI.p2pShardStart({ port: 50052 });
    if (!res.ok) {
      console.error("[Pipeline] Failed to start rpc-server:", res.error);
      shardProviderEnabled.value = false;
    }
  } else {
    await window.electronAPI.p2pShardStop();
  }
});

// Local test mode: start/stop rpc-server on same machine for testing
watch(pipelineLocalTest, async (enabled) => {
  if (enabled) {
    pipelineLocalTestStatus.value = 'starting';
    const res = await window.electronAPI.p2pShardStart({ port: 50052 });
    if (res.ok) {
      pipelineLocalTestStatus.value = 'running';
      await window.electronAPI.store.set("p2p.pipeline.localTest", true);
    } else {
      pipelineLocalTestStatus.value = res.error || 'failed';
      pipelineLocalTest.value = false;
    }
  } else {
    await window.electronAPI.p2pShardStop();
    pipelineLocalTestStatus.value = null;
    await window.electronAPI.store.set("p2p.pipeline.localTest", false);
  }
});

// Persist pipeline settings
watch(pipelineEnabled, async (v) => {
  await window.electronAPI.store.set("p2p.pipeline.enabled", v);
  // Refresh the bottom bar's pipeline tag without waiting for next swap.
  await window.electronAPI.broadcastModelState?.();
  if (!v) {
    // End pipeline session when disabled
    if (window.electronAPI.p2pPipelineCancel) {
      await window.electronAPI.p2pPipelineCancel();
    }
  }
});
watch(pipelineLocalProportion, (v) => window.electronAPI.store.set("p2p.pipeline.localProportion", v));
watch(pipelineDPEnabled, (v) => window.electronAPI.store.set("p2p.pipeline.dpEnabled", v));
watch(pipelineEpsilon, (v) => window.electronAPI.store.set("p2p.pipeline.epsilon", v));

const loadProviderHistory = () => {
  providerHistory.value = getProviderPerformanceStats();
};

const getProviderHistory = (peerId) => providerHistory.value[peerId] || null;

// OpenClaw integration state
const openclawInstalled = ref(false);
const openclawEnabled = ref(false);
const openclawToggling = ref(false);

const checkOpenClawStatus = async () => {
  try {
    openclawInstalled.value = await window.electronAPI.openclawIsInstalled();
    if (openclawInstalled.value) {
      openclawEnabled.value = await window.electronAPI.openclawGetEnabled();
    }
  } catch (e) {
    console.error("[NetworkSettings] Failed to check OpenClaw status:", e);
  }
};

const toggleOpenClaw = async () => {
  openclawToggling.value = true;
  try {
    const newState = !openclawEnabled.value;
    const result = await window.electronAPI.openclawSetEnabled(newState);
    if (!result.error) {
      openclawEnabled.value = newState;
    } else {
      console.error("[NetworkSettings] Failed to toggle OpenClaw:", result.error);
    }
  } catch (e) {
    console.error("[NetworkSettings] Failed to toggle OpenClaw:", e);
  } finally {
    openclawToggling.value = false;
  }
};

// Hermes Agent integration state
const hermesInstalled = ref(false);
const hermesEnabled = ref(false);
const hermesToggling = ref(false);

const checkHermesStatus = async () => {
  try {
    hermesInstalled.value = await window.electronAPI.hermesIsInstalled();
    if (hermesInstalled.value) {
      hermesEnabled.value = await window.electronAPI.hermesGetEnabled();
    }
  } catch (e) {
    console.error("[NetworkSettings] Failed to check Hermes status:", e);
  }
};

const toggleHermes = async () => {
  hermesToggling.value = true;
  try {
    const newState = !hermesEnabled.value;
    const result = await window.electronAPI.hermesSetEnabled(newState);
    if (!result.error) {
      hermesEnabled.value = newState;
    } else {
      console.error("[NetworkSettings] Failed to toggle Hermes:", result.error);
    }
  } catch (e) {
    console.error("[NetworkSettings] Failed to toggle Hermes:", e);
  } finally {
    hermesToggling.value = false;
  }
};

// Payment currency (ETH or USDC)
const pricingCurrency = ref("FREE");

// Per-pipeline pricing
const pipelinePricing = ref({
  llm: 0.0001, // per 1K tokens
  image: 0.01, // per image
  audio: 0.001, // per second
  music: 0.05, // per second
  video: 0.1, // per second
  vision: 0.005, // per image
  companions: 0.02, // per message (includes LLM + optional media)
});

const selfTestResults = ref(null);
const enableRelay = ref(false);
const relayFee = ref(5);

const testPeerId = ref("");
const testResult = ref(null);

// ─── ServiceTime / MintPool rewards (provider only) ───────────────────
//
// State driven by:
//   - serviceTime.isConfigured()      → contract address present in web3.config.js
//   - serviceTime.getPendingSummary() → reads NDJSON ledger via IPC
//   - serviceTime.checkEligibility()  → on-chain BONZAI balance >= LVL1
//   - serviceTime.flushPending()      → tx + truncate
const serviceTimeReady = ref(false);
const serviceTimePending = ref(null);   // { pendingSeconds, rows, bytes } or null
const serviceTimeEligibility = ref(null); // { ok, configured, balance, threshold } or null
const serviceTimeFlushing = ref(false);
const serviceTimeFlushResult = ref(null); // last { rowsSubmitted, txHash }
const serviceTimeFlushError = ref(null);

// pipelineId → human label, mirrors p2p.contract.service.js PIPELINE_CATEGORY_IDS
const PIPELINE_LABELS = {
  0: "LLM",
  1: "Image (Turbo)",
  2: "Image (Quality)",
  3: "Image (Standard)",
  6: "Audio (Turbo)",
  7: "Audio (Quality)",
  8: "Music",
  9: "Video",
  10: "Vision",
  11: "Pipeline Shard",
};
const pipelineLabel = (pid) => PIPELINE_LABELS[pid] ?? `Pipeline #${pid}`;
const formatSeconds = (s) => {
  const n = Number(s) || 0;
  if (n < 60) return `${n.toFixed(1)}s`;
  if (n < 3600) return `${(n / 60).toFixed(1)}m`;
  return `${(n / 3600).toFixed(2)}h`;
};

const refreshServiceTime = async () => {
  serviceTimeReady.value = serviceTimeIsConfigured();
  try {
    serviceTimePending.value = await serviceTimeGetPending();
  } catch (e) {
    serviceTimePending.value = null;
  }
  // Eligibility only makes sense when the contract is live; otherwise
  // we'd surface a wrong "below threshold" error before the deploy.
  if (serviceTimeReady.value) {
    try {
      serviceTimeEligibility.value = await serviceTimeCheckEligibility();
    } catch (e) {
      serviceTimeEligibility.value = null;
    }
  } else {
    serviceTimeEligibility.value = null;
  }
};

const flushServiceTime = async () => {
  serviceTimeFlushError.value = null;
  serviceTimeFlushResult.value = null;
  serviceTimeFlushing.value = true;
  try {
    const result = await serviceTimeFlush();
    if (result.skipped) {
      serviceTimeFlushError.value = `Skipped: ${result.skipped}`;
    } else {
      serviceTimeFlushResult.value = result;
      // Reload pending — successful flush truncates the ledger.
      await refreshServiceTime();
    }
  } catch (e) {
    serviceTimeFlushError.value = e?.message || String(e);
  } finally {
    serviceTimeFlushing.value = false;
  }
};

// Auto-refresh while the user is on the panel — rows accumulate as the
// shard worker writes the ledger. 10s cadence is enough; the wall-clock
// granularity for a session is typically minutes.
let _serviceTimePoll = null;
watch(networkMode, (v) => {
  if (v === "provider") {
    refreshServiceTime();
    if (!_serviceTimePoll) {
      _serviceTimePoll = setInterval(refreshServiceTime, 10_000);
    }
  } else {
    if (_serviceTimePoll) { clearInterval(_serviceTimePoll); _serviceTimePoll = null; }
  }
}, { immediate: true });
onUnmounted(() => {
  if (_serviceTimePoll) { clearInterval(_serviceTimePoll); _serviceTimePoll = null; }
});

let statusInterval = null;

// Computed
const truncatedPeerId = computed(() => {
  const id = p2pStatus.value.peerId;
  if (!id) return "";
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
});

const natStatusClass = computed(() => ({
  "nat-public": p2pStatus.value.natStatus === "public",
  "nat-relayed": p2pStatus.value.natStatus === "relayed",
  "nat-unknown": p2pStatus.value.natStatus === "unknown",
}));

// Methods
const formatNatStatus = (status) => {
  const labels = {
    public: "Public IP",
    relayed: "Using Relay",
    unknown: "Unknown",
  };
  return labels[status] || status;
};

const copyPeerId = () => {
  if (p2pStatus.value.peerId) {
    navigator.clipboard.writeText(p2pStatus.value.peerId);
  }
};

const refreshStatus = async () => {
  isRefreshing.value = true;
  try {
    const status = await window.electronAPI.p2pStatus();
    if (status.ok) {
      p2pStatus.value = { ...status, started: status.started };
    }
  } catch (err) {
    console.error("[NetworkSettings] Failed to get status:", err);
  } finally {
    isRefreshing.value = false;
  }
};

const startP2P = async () => {
  isStarting.value = true;
  testResult.value = null;

  try {
    const result = await window.electronAPI.p2pStart({
      listenPort: 4002,
      enableRelay: enableRelay.value,
      bootstrapNodes: [], // Will come from contract in Phase 2
    });

    if (result.ok) {
      console.log("[NetworkSettings] P2P node started:", result.peerId);
      await refreshStatus();

      // Provider mode: auto-start rpc-server for pipeline shard serving
      if (networkMode.value === 'provider') {
        console.log("[NetworkSettings] Provider mode — starting rpc-server for shard serving...");
        const shardRes = await window.electronAPI.p2pShardStart({ port: 50052 });
        if (shardRes.ok) {
          shardProviderEnabled.value = true;
          console.log("[NetworkSettings] rpc-server started on :50052");
        } else {
          console.warn("[NetworkSettings] rpc-server failed:", shardRes.error);
        }
      }

      // Save pipeline pricing and currency
      await window.electronAPI.store.set(
        "p2p.pipelinePricing",
        JSON.stringify(pipelinePricing.value),
      );
      await window.electronAPI.store.set("p2p.pricingCurrency", pricingCurrency.value);
      await window.electronAPI.store.set("p2p.enableRelay", enableRelay.value);
      await window.electronAPI.store.set("p2p.relayFee", relayFee.value);
    } else {
      console.error("[NetworkSettings] Failed to start P2P:", result.error);
    }
  } catch (err) {
    console.error("[NetworkSettings] Error starting P2P:", err);
  } finally {
    isStarting.value = false;
  }
};

const stopP2P = async () => {
  isStopping.value = true;

  try {
    // Stop rpc-server if running
    if (shardProviderEnabled.value) {
      await window.electronAPI.p2pShardStop();
      shardProviderEnabled.value = false;
    }
    await window.electronAPI.p2pStop();
    console.log("[NetworkSettings] P2P node stopped");
    p2pStatus.value = {
      started: false,
      peerId: null,
      multiaddrs: [],
      connectedPeers: 0,
      relayConnections: 0,
      natStatus: "unknown",
      isUsingRelay: false,
    };
  } catch (err) {
    console.error("[NetworkSettings] Error stopping P2P:", err);
  } finally {
    isStopping.value = false;
  }
};

const testConnection = async () => {
  if (!testPeerId.value) return;

  isTesting.value = true;
  testResult.value = null;

  try {
    const result = await window.electronAPI.p2pHealth(testPeerId.value);
    testResult.value = result;
  } catch (err) {
    testResult.value = { ok: false, error: err.message };
  } finally {
    isTesting.value = false;
  }
};

// Consumer mode functions
const truncateId = (id) => {
  if (!id) return "";
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
};

const refreshProviders = async () => {
  isRefreshingProviders.value = true;
  try {
    // TODO: Fetch from smart contract registry
    // For now, simulate with mock data
    const result = (await window.electronAPI.p2pGetProviders?.()) || {
      providers: [],
    };
    availableProviders.value = result.providers || [];
  } catch (err) {
    console.error("[NetworkSettings] Failed to fetch providers:", err);
    availableProviders.value = [];
  } finally {
    isRefreshingProviders.value = false;
  }
};

const isProviderSelected = (peerId) => {
  return selectedProviders.value.some(p => p.peerId === peerId);
};

const selectProvider = async (provider) => {
  const idx = selectedProviders.value.findIndex(p => p.peerId === provider.peerId);
  if (idx >= 0) {
    // Deselect
    selectedProviders.value.splice(idx, 1);
  } else {
    // Add to selection
    selectedProviders.value.push(provider);
  }
  // Persist
  await window.electronAPI.store.set(
    "p2p.selectedProviders",
    JSON.stringify(selectedProviders.value),
  );
};

const runSelfTest = async () => {
  isSelfTesting.value = true;
  selfTestResults.value = null;

  const results = {
    flask: { ok: false, error: null, pipelines: [] },
    openclaw: { ok: false, error: null, detail: null },
    llama: { ok: false, error: null, modelName: null, port: null, rpcPeers: [] },
    p2p: { ok: false, error: null },
    ready: false,
    readyMessage: "",
  };

  // Test 1: Flask Server (port 65000) — image/audio/video/vision
  try {
    const flaskResponse = await fetch("http://127.0.0.1:65000/audio/info", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (flaskResponse.ok) {
      const data = await flaskResponse.json();
      results.flask.ok = true;
      results.flask.pipelines = Object.keys(data.pipelines || {});
    } else {
      results.flask.error = `HTTP ${flaskResponse.status}`;
    }
  } catch (err) {
    results.flask.error = err.message?.includes("fetch")
      ? "Server not running"
      : err.message;
  }

  // Test 2: Orchestration Gateway (port 3002) — OpenClaw/Hermes HTTP entry.
  // This is always up when the app is running; it is the Node HTTP server
  // baked into the main process, independent of llama-server. We only
  // surface it as "active" if the user has enabled at least one orchestrator.
  try {
    const ocEnabled = await window.electronAPI.openclawGetEnabled();
    const hermEnabled = await window.electronAPI.hermesGetEnabled();
    if (ocEnabled || hermEnabled) {
      const orchResponse = await fetch("http://127.0.0.1:3002/health", {
        method: "GET",
      });
      if (orchResponse.ok) {
        results.openclaw.ok = true;
        results.openclaw.detail = [ocEnabled && "OpenClaw", hermEnabled && "Hermes"].filter(Boolean).join(" + ");
      } else {
        results.openclaw.error = `HTTP ${orchResponse.status}`;
      }
    } else {
      results.openclaw.error = "No orchestrator enabled";
    }
  } catch (err) {
    results.openclaw.error = err.message?.includes("fetch")
      ? "Server not running"
      : err.message;
  }

  // Test 3: LLM runtime — the llama-server subprocess. Separate from the
  // gateway above: the gateway proxies to this subprocess, so a "gateway up
  // but LLM down" state is real and needs to be reported honestly.
  try {
    const status = await window.electronAPI.llamaRuntimeStatus();
    if (status.running) {
      results.llama.ok = true;
      results.llama.modelName = status.modelName;
      results.llama.port = status.port;
      results.llama.rpcPeers = status.rpcPeers || [];
    } else {
      results.llama.error = "No model loaded";
    }
  } catch (err) {
    results.llama.error = err.message;
  }

  // Test 4: P2P Node
  try {
    const status = await window.electronAPI.p2pStatus();
    if (status.ok && status.started) {
      results.p2p.ok = true;
    } else {
      results.p2p.error = "P2P node not started";
    }
  } catch (err) {
    results.p2p.error = err.message;
  }

  // Determine overall readiness. LLM runtime is NOT required for boot — the
  // app is usable without a model loaded (models load on demand). Only hard
  // requirements: Flask server + P2P node.
  const issues = [];
  if (!results.flask.ok) issues.push("Flask server");
  if (!results.p2p.ok) issues.push("P2P node");

  if (issues.length === 0) {
    results.ready = true;
  } else {
    results.readyMessage = `Start: ${issues.join(", ")}`;
  }

  selfTestResults.value = results;
  isSelfTesting.value = false;
};

// Load saved settings
const loadSettings = async () => {
  isLoadingSettings.value = true;
  try {
    const savedMode = await window.electronAPI.store.get(
      "p2p.networkMode",
      "local",
    );
    const savedPricing = await window.electronAPI.store.get(
      "p2p.pipelinePricing",
      null,
    );
    const savedRelay = await window.electronAPI.store.get(
      "p2p.enableRelay",
      false,
    );
    const savedRelayFee = await window.electronAPI.store.get("p2p.relayFee", 5);
    const savedCurrency = await window.electronAPI.store.get("p2p.pricingCurrency", "FREE");
    const savedProviders = await window.electronAPI.store.get(
      "p2p.selectedProviders",
      null,
    );

    networkMode.value = savedMode;
    pricingCurrency.value = savedCurrency;

    // Load pipeline pricing (merge with defaults to handle new pipelines)
    if (savedPricing) {
      try {
        const parsed = JSON.parse(savedPricing);
        pipelinePricing.value = { ...pipelinePricing.value, ...parsed };
      } catch (e) {
        console.warn("[NetworkSettings] Failed to parse saved pricing:", e);
      }
    }

    // Load selected providers for consumer mode
    if (savedProviders) {
      try {
        selectedProviders.value = typeof savedProviders === 'string' ? JSON.parse(savedProviders) : savedProviders;
      } catch (e) {
        console.warn("[NetworkSettings] Failed to parse saved provider:", e);
      }
    }

    enableRelay.value = savedRelay;
    relayFee.value = savedRelayFee;

    // Load pipeline privacy settings
    pipelineEnabled.value = await window.electronAPI.store.get("p2p.pipeline.enabled", false);
    pipelineLocalProportion.value = await window.electronAPI.store.get("p2p.pipeline.localProportion", 25);
    pipelineDPEnabled.value = await window.electronAPI.store.get("p2p.pipeline.dpEnabled", false);
    pipelineEpsilon.value = await window.electronAPI.store.get("p2p.pipeline.epsilon", 8);
  } catch (err) {
    console.error("[NetworkSettings] Failed to load settings:", err);
  } finally {
    isLoadingSettings.value = false;
  }
};

// Save network mode when changed
watch(networkMode, async (newMode) => {
  await window.electronAPI.store.set("p2p.networkMode", newMode);
  // Refresh the bottom bar's pipeline tag without waiting for next swap.
  await window.electronAPI.broadcastModelState?.();

  // End pipeline session when leaving consumer mode
  if (newMode !== 'consumer' && window.electronAPI.p2pPipelineCancel) {
    await window.electronAPI.p2pPipelineCancel();
  }

  if (newMode === 'local' && p2pStatus.value.started) {
    await stopP2P();
  }

  // Auto-start P2P when switching to consumer or provider mode
  if ((newMode === 'consumer' || newMode === 'provider') && !p2pStatus.value.started) {
    await startP2P();
  }

  // Refresh providers when switching to consumer mode
  if (newMode === 'consumer') {
    await refreshProviders();
  }
});

// Lifecycle
onMounted(async () => {
  await loadSettings();
  await refreshStatus();
  await checkOpenClawStatus();
  await checkHermesStatus();
  loadProviderHistory();

  // Refresh providers if in consumer mode
  if (networkMode.value === "consumer") {
    await refreshProviders();
  }

  // Poll LAN peers and status
  pollLANProviders();
  lanPollInterval = setInterval(pollLANProviders, 10000);

  // Listen for real-time LAN peer discovery notifications
  if (window.electronAPI?.onLANPeerDiscovered) {
    lanPeerCleanup = window.electronAPI.onLANPeerDiscovered((_event, data) => {
      console.log('[NetworkSettings] LAN peer discovered:', data.lanIP);
      pollLANProviders(); // Immediately refresh LAN list
    });
  }

  statusInterval = setInterval(() => {
    if (p2pStatus.value.started) {
      refreshStatus();
    }
  }, 10000);

  // IntersectionObserver wires the rail's active state to the user's
  // scroll position. We watch each section heading; the first one
  // crossing the top quarter of the pane wins. Margins keep the
  // active highlight from flickering on small scroll deltas.
  const targets = sections
    .map((s) => document.getElementById(s.id))
    .filter(Boolean);
  if (targets.length && "IntersectionObserver" in window) {
    _sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeSection.value = entry.target.id;
          }
        }
      },
      {
        root: paneEl.value || null,
        rootMargin: "-15% 0px -65% 0px",
        threshold: 0,
      },
    );
    for (const t of targets) _sectionObserver.observe(t);
  }
});

let lanPeerCleanup = null;

onUnmounted(() => {
  if (statusInterval) clearInterval(statusInterval);
  if (lanPollInterval) clearInterval(lanPollInterval);
  if (lanPeerCleanup) lanPeerCleanup();
  if (_sectionObserver) { _sectionObserver.disconnect(); _sectionObserver = null; }
});
</script>

<style scoped>
/* BonzAI Design System - Matches Access Level Modal */
:root {
  --bonzai-bg-dark: #0a0a0f;
  --bonzai-bg-card: rgba(20, 20, 30, 0.92);
  --bonzai-green: #10b981;
  --bonzai-green-glow: rgba(16, 185, 129, 0.3);
  --bonzai-purple: #8b5cf6;
  --bonzai-text: #f0f0f5;
  --bonzai-text-muted: rgba(240, 240, 245, 0.7);
  --bonzai-border: var(--bz-border);
  --bonzai-radius: 12px;
}

/* Loading State */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--bz-border);
  border-top-color: var(--bonzai-green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  margin-top: 16px;
  color: var(--bz-fg-mid);
  font-size: 1rem;
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

.network-settings {
  padding: 24px;
  overflow-y: auto;
  background: transparent;
  color: var(--bz-fg);
}

.panel {
  max-width: 800px;
  margin: 0 auto;
}

.panel-header {
  margin-bottom: 24px;
  text-align: center;
}

.panel-header .subtitle {
  color: var(--bz-fg-mid);
  font-size: 1rem;
  line-height: 1.5;
}

/* Section heading — carries the BRAND VOICE (Fira Sans Condensed
   Black Italic). Section titles are exactly where the brand cadence
   belongs; the class name is preserved so the existing 11 template
   references continue to work unchanged. Composes with .bz-h2 sizing
   from tokens.css. */
.section-title {
  font-family: 'Fira Sans Condensed', sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: var(--bz-size-h2);
  line-height: var(--bz-line-tight);
  letter-spacing: -0.005em;
  color: var(--bz-fg);
  margin: 0 0 var(--bz-space-4) 0;
  /* Rail anchor-jumps land here; offset so the heading isn't flush
     against the pane top when the user clicks a rail button. */
  scroll-margin-top: var(--bz-space-5);
}

/* Inline icon next to a section title remains the original emerald
   accent — the icon names the section's territory (security, network,
   pipeline, etc.). Sized to match the heading's optical line. */
.section-title .material-symbols-outlined {
  color: var(--bz-emerald-500);
  font-size: 24px;
  vertical-align: -0.15em;
  margin-right: var(--bz-space-2);
}

/* Network Mode Selector - Generative Style */
.network-mode-section {
  margin-bottom: 32px;
}

.mode-selector input[type="radio"] {
  display: none;
}

.mode-selector input[type="radio"] + label {
  padding: 8px 16px 12px;
  color: var(--bz-fg-faint) !important;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.mode-selector input[type="radio"] + label:hover {
  color: var(--bz-fg-mid) !important;
  border-color: var(--bz-fg-low);
}

.mode-selector input[type="radio"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: var(--bz-purple-soft) !important;
  backdrop-filter: blur(64px) !important;
}

.mode-selector input[type="radio"] + label .material-symbols-outlined {
  color: inherit;
}

/* Mode Descriptions */
.mode-description {
  margin-top: 16px;
}

.description-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--bz-canvas);
  border: 1px solid var(--bonzai-border);
  border-radius: 10px;
}

.description-card .material-symbols-outlined {
  color: var(--bz-fg-low);
  font-size: 24px;
  flex-shrink: 0;
}

.description-card strong {
  color: var(--bz-fg);
  display: block;
  margin-bottom: 4px;
}

.description-card p {
  color: var(--bz-fg-mid);
  font-size: 0.9rem;
  margin: 0;
  line-height: 1.5;
}

.description-card.consumer {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.08);
}

.description-card.consumer .material-symbols-outlined {
  color: #3b82f6;
}

.description-card.provider {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.08);
}

.description-card.provider .material-symbols-outlined {
  color: var(--bonzai-green);
}

/* Currency Selector */
.pricing-currency-selector {
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--bz-canvas);
  border: 1px dashed var(--bonzai-border);
}

.currency-toggle {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 4px;
}

.currency-toggle .button {
  box-shadow: none;
  min-width: 60px;
}

/* Agentic Orchestration Section */
.description-card.orchestration {
  border-color: rgba(168, 85, 247, 0.3);
  background: rgba(168, 85, 247, 0.08);
}

.description-card.orchestration .material-symbols-outlined {
  color: #a855f7;
}

.description-card.pipeline {
  border-color: rgba(57, 213, 130, 0.3);
  background: rgba(57, 213, 130, 0.08);
}

.description-card.pipeline .material-symbols-outlined {
  color: #39d582;
}

.control-help {
  color: var(--bz-fg-low);
  font-size: 0.8rem;
  line-height: 1.5;
  margin: 0;
}

.pipeline-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--bz-border-strong);
  outline: none;
  cursor: pointer;
}

.pipeline-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #39d582;
  border: 2px solid var(--bz-fg-faint);
  cursor: pointer;
  box-shadow: 0 2px 6px var(--bz-overlay);
}

.pipeline-slider::-webkit-slider-thumb:hover {
  background: #4de896;
  transform: scale(1.1);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 0.75rem;
  color: var(--bz-fg-low);
}

.orchestration-controls {
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--bz-canvas);
  border: 1px dashed var(--bonzai-border);
}

.orchestration-controls .button {
  box-shadow: none;
}

.orchestration-label {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--bz-fg-mid);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.orchestration-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.orchestration-status-info {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 1);
  font-weight: 700;
}

.orchestration-status.not-installed {
  display: flex;
  align-items: center;
  color: var(--bz-fg-low);
  font-size: 0.9rem;
}

.icon-muted {
  color: var(--bz-fg-faint);
}

/* Consumer Mode - Provider Selection */
.consumer-section {
  margin-bottom: 32px;
}

.no-providers {
  text-align: center;
  padding: 40px 20px;
  background: var(--bz-canvas);
  border: 1px dashed var(--bonzai-border);
  border-radius: 10px;
}

.no-providers .material-symbols-outlined {
  display: block;
}

.no-providers p {
  color: var(--bz-fg-mid);
  margin: 0;
}

.provider-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.provider-card {
  background: var(--bz-canvas);
  border: 1px solid var(--bonzai-border);
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.provider-card:hover {
  border-color: var(--bz-fg-faint);
  background: var(--bz-canvas);
}

.provider-card.selected {
  border-color: var(--bonzai-green);
  background: rgba(16, 185, 129, 0.1);
}

.provider-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.provider-icon {
  font-size: 32px;
  color: var(--bz-fg-mid);
}

.provider-card.selected .provider-icon {
  color: var(--bonzai-green);
}

.provider-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.provider-id {
  color: var(--bz-fg);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.9rem;
  font-weight: 600;
}

.provider-status {
  font-size: 0.75rem;
  color: var(--bz-fg-low);
}

.provider-status.online {
  color: var(--bonzai-green);
}

.provider-pricing {
  margin-bottom: 12px;
}

.price-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  padding: 4px 0;
  color: var(--bz-fg-mid);
}

.price-row span:last-child {
  color: var(--bz-fg);
  font-family: "JetBrains Mono", monospace;
}

.provider-selected-badge {
  display: flex;
  align-items: center;
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(16, 185, 129, 0.12);
  color: #39d582;
  font-size: 12px;
  font-weight: 600;
}

.provider-pipelines {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.more-tag {
  background: var(--bz-border);
  color: var(--bz-fg-mid);
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 999px;
}

.provider-performance {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--bz-card);
}

.performance-header {
  font-size: 0.75rem;
  color: var(--bz-fg-low);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.performance-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.perf-metric {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.8rem;
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  color: var(--bz-fg);
  background: var(--bz-canvas);
  padding: 2px 8px;
  border-radius: 6px;
}

.performance-hw {
  margin-top: 4px;
}

.selected-provider-info .notification {
  display: flex;
  align-items: center;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: var(--bonzai-green);
}

/* Status Panel */
.status-section {
  margin-bottom: 32px;
}

.status-panel {
  background: var(--bz-canvas);
  border: 1px solid var(--bonzai-border);
  border-radius: 10px;
  padding: 20px;
}

.status-panel.online {
  border-color: rgba(16, 185, 129, 0.25);
  animation: pulseGreen 2s infinite;
}

.status-panel.offline {
  border-color: rgba(241, 70, 104, 0.25);
  animation: pulseRed 2s infinite;
}

@keyframes pulseGreen {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.1);
  }
  50% {
    box-shadow: 0 0 0 64px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

@keyframes pulseRed {
  0% {
    box-shadow: 0 0 0 0 rgba(241, 70, 104, 0.1);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(241, 70, 104, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(241, 70, 104, 0);
  }
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  color: var(--bz-fg) !important;
}

.status-row:last-child {
  border-bottom: none;
}

.status-label {
  color: var(--bz-fg-mid);
}

.status-value {
  color: var(--bz-fg);
  font-weight: 500;
  display: flex;
  align-items: center;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  margin-right: 8px;
}

.status-indicator.online {
  background: var(--bonzai-green);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.peer-id {
  cursor: pointer;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.9rem;
}

.peer-id:hover .copy-icon {
  opacity: 1;
}

.copy-icon {
  font-size: 16px;
  margin-left: 8px;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.nat-public {
  color: var(--bonzai-green);
}
.nat-relayed {
  color: #f59e0b;
}
.nat-unknown {
  color: var(--bz-fg-low);
}

.multiaddrs {
  margin-top: 12px;
  padding-top: 12px;
}

.addr-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.addr {
  font-size: 0.75rem;
  color: var(--bz-fg-mid);
  background: var(--bz-overlay);
  padding: 6px 10px;
  border-radius: 6px;
  word-break: break-all;
  font-family: "JetBrains Mono", monospace;
}

.more-addrs {
  color: var(--bz-fg-low);
  font-size: 0.8rem;
}

/* Control Buttons */
.control-buttons {
  margin-top: 20px;
  display: flex;
  gap: 12px;
}

.loader {
  width: 16px;
  height: 16px;
  border: 2px solid var(--bz-fg-faint);
  border-top-color: var(--bz-fg);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

/* Provider Settings */
.provider-section {
  margin-bottom: 32px;
}

/* Pipeline Pricing Grid */
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.pricing-item {
  background: var(--bz-canvas);
  border: 1px solid var(--bonzai-border);
  border-radius: 10px;
  padding: 16px;
  transition: all 0.2s;
}

.pricing-item:hover {
  border-color: var(--bz-border-strong);
}

.pricing-item.featured {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.05);
}

.pricing-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.pricing-header .material-symbols-outlined {
  color: var(--bz-fg-mid);
  font-size: 24px;
}

.pricing-item.featured .pricing-header .material-symbols-outlined {
  color: var(--bonzai-green);
}

.pricing-name {
  color: var(--bz-fg);
  font-weight: 600;
  font-size: 1rem;
}

.pricing-badge {
  background: var(--bonzai-green);
  color: #000;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  text-transform: uppercase;
  margin-left: auto;
}

.pricing-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pricing-input .input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  font-size: 0.95rem;
}

.pricing-unit {
  color: var(--bz-fg-low);
  font-size: 0.8rem;
  white-space: nowrap;
}

.pricing-note {
  display: block;
  color: var(--bz-fg-low);
  font-size: 0.75rem;
  margin-top: 8px;
}

.setting-group {
  background: var(--bz-canvas);
  border: 1px solid var(--bonzai-border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bz-fg);
  margin-bottom: 12px;
  font-weight: 500;
}

.setting-label .material-symbols-outlined {
  color: var(--bonzai-green);
}

.setting-hint {
  color: var(--bonzai-green);
  font-size: 0.85rem;
  margin-top: 8px;
  font-weight: 500;
}

.relay-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle {
  position: relative;
  width: 48px;
  height: 26px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--bz-border);
  border-radius: 26px;
  transition: 0.3s;
}

.toggle-slider:before {
  content: "";
  position: absolute;
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle input:checked + .toggle-slider {
  background: var(--bonzai-green);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(22px);
}

.toggle input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-label {
  color: var(--bz-fg);
}

.toggle-note {
  color: var(--bz-fg-low);
  font-size: 0.85rem;
}

/* Test Section */
.test-section {
  margin-bottom: 32px;
}

.test-result {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 8px;
}

.test-result.success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: var(--bonzai-green);
}

.test-result.error {
  background: rgba(170, 170, 170, 0.12);
  border: 1px solid rgba(241, 70, 104, 0.25);
  color: var(--bz-danger);
}

.test-description {
  color: var(--bz-fg-mid);
  margin-bottom: 16px;
  font-size: 0.95rem;
  line-height: 1.5;
}

.self-test-results {
  padding-top: 16px;
}

.test-result-row {
  display: flex;
  align-items: flex-start;
  padding: 14px;
  border-radius: 10px;
  margin-bottom: 10px;
}

.test-result-row.success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.test-result-row.error {
  background: var(--bz-danger-soft);
  border: 1px solid rgba(241, 70, 104, 0.25);
}

.test-result-row .material-symbols-outlined {
  flex-shrink: 0;
  margin-top: 2px;
}

/* Test Icon Colors */
.test-icon.icon-success {
  color: #10b981 !important;
}

.test-icon.icon-error {
  color: var(--bz-danger) !important;
}

.test-icon.icon-warning {
  color: #f59e0b !important;
}

.test-result-row.warning {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
}

.test-result-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.test-result-content strong {
  color: var(--bz-fg);
}

.test-result-detail {
  color: var(--bz-fg-mid);
  font-size: 0.85rem;
}

.pipeline-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.pipeline-tag {
  background: var(--bz-card);
  color: var(--bz-fg-low);
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 999px;
  font-family: "JetBrains Mono", monospace;
  font-weight: 600;
}

.pipeline-tag.ready {
  background: rgba(16, 185, 129, 0.2);
  color: var(--bonzai-green);
}

.overall-status {
  display: flex;
  align-items: center;
  padding: 16px;
  border-radius: 10px;
  font-weight: 600;
}

.overall-status.ready {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: var(--bonzai-green);
  animation: pulseGreen 2s infinite;
}

.overall-status.not-ready {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #f59e0b;
}

/* Input styling to match modal */
.input {
  background: var(--bz-overlay);
  border: 1px solid var(--bonzai-border);
  border-radius: 8px;
  color: var(--bz-fg);
  padding: 10px 14px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: var(--bonzai-green);
}

.input::placeholder {
  color: var(--bz-fg-low);
}

/* Field addons */
.field.has-addons {
  display: flex;
}

.field.has-addons input {
  height: 58px;
}

.field.has-addons .control.is-expanded {
  flex: 1;
}

.field.has-addons .control.is-expanded .input {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.field.has-addons .control:last-child .button {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

/* ════════════════════════════════════════════════════════════════
   NETWORK SETTINGS — left rail + scrollable detail pane
   Milestone 3 layout discipline. Mirrors the rail-and-canvas
   pattern picker uses; section discovery + active state driven by
   IntersectionObserver in setup().
   ════════════════════════════════════════════════════════════════ */

.bz-net-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--bz-space-6);
  align-items: start;
  height: 100%;
  min-height: 480px;
}

/* Rail — left, sticky-ish on long pages, never the focal point. */
.bz-net-rail {
  position: sticky;
  top: var(--bz-space-4);
  align-self: start;
  padding: var(--bz-space-4) var(--bz-space-3);
  border-right: 1px solid var(--bz-border);
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}
.bz-net-rail__head {
  margin: 0 0 var(--bz-space-3) var(--bz-space-3);
  color: var(--bz-fg-low);
}
.bz-net-rail__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bz-net-rail__btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-2) var(--bz-space-3);
  background: transparent;
  border: 0;
  border-radius: var(--bz-r);
  text-align: left;
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  cursor: pointer;
  transition:
    color var(--bz-dur-fast) var(--bz-ease-out),
    background var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-net-rail__btn:hover {
  color: var(--bz-fg);
  background: var(--bz-canvas);
}
.bz-net-rail__btn--active {
  color: var(--bz-fg);
  background: var(--bz-purple-soft);
}
.bz-net-rail__btn--active .bz-net-rail__dot {
  background: var(--bz-purple-300);
  box-shadow: 0 0 0 3px var(--bz-purple-soft);
}
.bz-net-rail__dot {
  width: 6px; height: 6px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-fg-faint);
  flex-shrink: 0;
  transition: background var(--bz-dur-fast) var(--bz-ease-out);
}

/* Detail pane — single scrolling column carrying the existing
   sections unchanged. Just pushes them into the right column of
   the grid and gives them breathing room between groups. */
.bz-net-pane {
  min-width: 0;
  padding: var(--bz-space-4) var(--bz-space-5) var(--bz-space-7) 0;
}

/* Section spacing — first section flush to top, each subsequent
   one gets a generous gap so the rail's anchor jumps land on a
   clean visual break instead of mid-content. */
.bz-net-pane > * + * {
  margin-top: var(--bz-space-7);
}
.bz-net-pane > .status-section,
.bz-net-pane > .nat-section,
.bz-net-pane > .pricing-section,
.bz-net-pane > .privacy-pipeline-section,
.bz-net-pane > .orchestration-section,
.bz-net-pane > .self-test-section,
.bz-net-pane > .network-test-section,
.bz-net-pane > .service-time-section,
.bz-net-pane > .provider-section {
  scroll-margin-top: var(--bz-space-5);
}

/* Theme picker grid — Appearance section. */
.bz-theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--bz-space-3);
}
.bz-theme-card {
  text-align: left;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  padding: var(--bz-space-3) var(--bz-space-4);
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: var(--bz-space-3);
  row-gap: 4px;
  cursor: pointer;
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-theme-card:hover {
  background: var(--bz-raised);
  border-color: var(--bz-border-strong);
}
.bz-theme-card--active {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
  box-shadow: var(--bz-elev-brand);
}
.bz-theme-card__swatch {
  grid-row: 1 / span 2;
  display: inline-flex;
  flex-direction: column;
  width: 26px;
  height: 36px;
  border-radius: var(--bz-r-sm);
  overflow: hidden;
  border: 1px solid var(--bz-border);
}
.bz-theme-card__swatch > span {
  flex: 1;
  display: block;
}
.bz-theme-card__title {
  font-weight: 400;
  color: var(--bz-fg);
}
.bz-theme-card__blurb { color: var(--bz-fg-low); }

/* Mobile / narrow — collapse rail under the pane. */
@media (max-width: 880px) {
  .bz-net-shell { grid-template-columns: 1fr; }
  .bz-net-rail {
    position: static;
    border-right: 0;
    border-bottom: 1px solid var(--bz-border);
    max-height: none;
  }
  .bz-net-rail__list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--bz-space-2);
  }
  .bz-net-pane {
    padding: var(--bz-space-4) 0 var(--bz-space-7) 0;
  }
}
</style>
