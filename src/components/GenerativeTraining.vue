<template>
  <div class="bz-train" :class="`bz-train--${mode}`">
    <!-- Header -->
    <header class="bz-train__header bz-train__hero">
      <div class="bz-train__hero-copy">
        <span class="bz-eyebrow">{{ mode === 'uncensor' ? 'Model behavior' : 'Training studio' }}</span>
        <h1 class="bz-train__title fira-sans-condensed-black-italic">{{ modeTitle }}</h1>
        <p class="bz-train__subtitle">{{ modeSubtitle }}</p>
      </div>
      <div class="bz-train__hero-stats" aria-label="Training mode capabilities">
        <span>{{ mode === 'uncensor' ? 'Abliteration' : 'LoRA' }}</span>
        <span>Local</span>
      </div>
    </header>

    <div class="bz-train__quick-steps" aria-label="Workflow overview">
      <article v-for="step in modeSteps" :key="step.label" class="bz-train__quick-step">
        <span class="material-symbols-outlined" aria-hidden="true">{{ step.icon }}</span>
        <div>
          <strong class="fira-sans-condensed-black-italic">{{ step.label }}</strong>
          <small>{{ step.copy }}</small>
        </div>
      </article>
    </div>

    <!-- Access gate -->
    <AccessRequirements level="LVL6" />

    <!-- ============================================================ -->
    <!-- TUNE MODE                                                    -->
    <!-- ============================================================ -->
    <div v-if="mode === 'tune'" class="bz-train__body">

      <!-- Step 1: Import Dataset -->
      <section class="bz-train__section">
        <h3 class="bz-train__section-title">
          <span class="bz-train__step-num">1</span>
          Import Dataset
        </h3>
        <div
          class="bz-train__dropzone"
          :class="{ 'is-dragover': isDragOver, 'has-data': jsonlRows.length > 0 }"
          @dragover.prevent="isDragOver = true"
          @dragleave="isDragOver = false"
          @drop.prevent="onDrop"
        >
          <template v-if="jsonlRows.length === 0">
            <span class="material-symbols-outlined bz-train__dropzone-icon">upload_file</span>
            <p class="bz-train__dropzone-label">Drop a <strong>JSONL</strong> dataset or <strong>BonzAI contribution pack</strong></p>
            <p class="bz-train__dropzone-hint">BonzAI+ packs keep provenance, permissions, quality, and revenue metadata attached.</p>
            <input
              type="file"
              accept=".jsonl,.json,.txt,.md,.bonzai-contribution-pack"
              class="bz-train__dropzone-input"
              @change="onFileSelect"
            />
          </template>
          <template v-else>
            <div class="bz-train__jsonl-preview">
              <div class="bz-train__jsonl-meta">
                <span class="skill-chip skill-chip--brand">
                  <span class="material-symbols-outlined" style="font-size:14px">description</span>
                  {{ jsonlFileName }}
                </span>
                <span class="skill-chip skill-chip--success">{{ jsonlRows.length }} rows</span>
                <span class="skill-chip skill-chip--info">{{ detectedType }} dataset</span>
                <span v-if="hasContributionPack" class="skill-chip skill-chip--brand">Contribution Pack</span>
                <span v-if="hasContributionPack && contributionSummary?.averageQuality !== null" class="skill-chip skill-chip--muted">
                  Quality {{ contributionSummary.averageQuality }}/100
                </span>
                <button class="bz-iconbtn" style="margin-left:auto" @click="clearJsonl" title="Clear">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
              <div class="bz-train__jsonl-table-wrap">
                <table class="bz-train__jsonl-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th v-for="col in jsonlColumns" :key="col">{{ col }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in jsonlPreview" :key="i">
                      <td class="bz-mono">{{ i + 1 }}</td>
                      <td v-for="col in jsonlColumns" :key="col" :title="cellValue(row[col])">
                        {{ truncate(cellValue(row[col]), 80) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="jsonlRows.length > 5" class="bz-train__jsonl-more">
                …and {{ jsonlRows.length - 5 }} more rows
              </p>
              <div v-if="hasContributionPack" class="bz-train__contribution">
                <div class="bz-train__contribution-head">
                  <div>
                    <span class="bz-eyebrow">Contribution Studio</span>
                    <h4 class="bz-train__contribution-title">Proof-of-Contribution import</h4>
                  </div>
                  <div class="bz-train__contribution-actions">
                    <span class="skill-chip skill-chip--brand">{{ contributionSummary.source }}</span>
                    <button
                      class="bz-btn bz-btn--ghost bz-btn--sm"
                      :disabled="contributionPublish.active || !canPublishContributionPack"
                      :title="canPublishContributionPack ? 'Publish contribution pack' : 'Contribution registries are not configured'"
                      @click="publishContributionPack"
                    >
                      {{ contributionPublish.active ? 'Publishing...' : 'Publish' }}
                    </button>
                  </div>
                </div>
                <div class="bz-train__contribution-grid">
                  <div class="bz-train__contribution-stat">
                    <span class="bz-mono">{{ contributionSummary.recordCount }}</span>
                    <small>usable records</small>
                  </div>
                  <div class="bz-train__contribution-stat">
                    <span class="bz-mono">{{ contributionSummary.publishable }}</span>
                    <small>publishable</small>
                  </div>
                  <div class="bz-train__contribution-stat">
                    <span class="bz-mono">{{ contributionSummary.royaltyBearing }}</span>
                    <small>royalty-bearing</small>
                  </div>
                  <div class="bz-train__contribution-stat">
                    <span class="bz-mono">{{ formatPercent(contributionSummary.trainingAllowed, contributionSummary.recordCount) }}</span>
                    <small>training allowed</small>
                  </div>
                  <div class="bz-train__contribution-stat">
                    <span class="bz-mono">{{ contributionSummary.dataOwnerCount || 0 }}</span>
                    <small>data owners</small>
                  </div>
                </div>
                <div class="bz-train__contribution-kinds">
                  <span
                    v-for="(count, kind) in contributionSummary.byKind"
                    :key="kind"
                    class="skill-chip skill-chip--muted"
                  >
                    {{ contributionKindLabel(kind) }} · {{ count }}
                  </span>
                </div>
                <div v-if="contributionRevenuePlan?.participants?.length" class="bz-train__contribution-alert is-success">
                  Downstream fine-tune revenue plan: {{ contributionRevenuePlan.participants.length }} data owner{{ contributionRevenuePlan.participants.length === 1 ? '' : 's' }} weighted by contribution quality.
                </div>
                <div v-if="contributionErrors.length" class="bz-train__contribution-alert is-error">
                  <span v-for="error in contributionErrors" :key="error">{{ error }}</span>
                </div>
                <div v-if="contributionWarnings.length" class="bz-train__contribution-alert">
                  <span v-for="warning in contributionWarnings" :key="warning">{{ warning }}</span>
                </div>
                <div v-if="contributionPublish.error" class="bz-train__contribution-alert is-error">
                  {{ contributionPublish.error }}
                </div>
                <div v-if="contributionPublish.result" class="bz-train__contribution-alert is-success">
                  Published dataset {{ contributionPublish.result.datasetId }}.
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>

      <section v-if="ledgerPreview.length" class="bz-train__section bz-train__ledger">
        <div class="bz-train__section-header">
          <h3 class="bz-train__section-title">
            <span class="bz-train__step-num">◎</span>
            Local Contribution Ledger
          </h3>
        </div>
        <div class="bz-train__ledger-list">
          <div v-for="entry in ledgerPreview" :key="entry.id" class="bz-train__ledger-row">
            <div>
              <span class="bz-train__ledger-file">{{ entry.fileName }}</span>
              <span class="bz-train__ledger-meta">
                {{ entry.recordCount }} records · {{ entry.datasetType }} · {{ entry.status.replace('_', ' ') }}
              </span>
            </div>
            <span class="bz-mono bz-train__ledger-quality">
              {{ entry.averageQuality !== null ? entry.averageQuality + '/100' : 'unscored' }}
            </span>
          </div>
        </div>
      </section>

      <!-- Step 2: Choose Target -->
      <section class="bz-train__section">
        <h3 class="bz-train__section-title">
          <span class="bz-train__step-num">2</span>
          Choose Target
        </h3>
        <div class="bz-train__targets">
          <button
            v-for="t in targets" :key="t.key"
            class="bz-train__target-card"
            :class="{ 'is-selected': selectedTarget === t.key }"
            @click="selectedTarget = t.key"
          >
            <span class="material-symbols-outlined bz-train__target-icon">{{ t.icon }}</span>
            <span class="bz-train__target-name">{{ t.name }}</span>
            <span class="bz-train__target-model">{{ t.model }}</span>
            <span class="bz-train__target-desc">{{ t.desc }}</span>
          </button>
        </div>
      </section>

      <!-- Step 3: Configure -->
      <section class="bz-train__section" v-if="selectedTarget">
        <h3 class="bz-train__section-title">
          <span class="bz-train__step-num">3</span>
          Configure
        </h3>

        <!-- Model picker for text -->
        <div v-if="selectedTarget === 'text'" class="bz-train__config-group">
          <label class="bz-train__label">Base Model</label>
          <div class="bz-train__model-pills">
            <button
              v-for="m in llmModels" :key="m.key"
              class="bz-train__model-pill"
              :class="{ 'is-selected': tuneConfig.base_model === m.key }"
              @click="tuneConfig.base_model = m.key"
            >
              {{ m.name }}
            </button>
          </div>
        </div>

        <!-- Model picker for audio -->
        <div v-if="selectedTarget === 'audio'" class="bz-train__config-group">
          <label class="bz-train__label">Base Model</label>
          <div class="bz-train__model-pills">
            <button
              v-for="m in audioModels" :key="m.key"
              class="bz-train__model-pill"
              :class="{ 'is-selected': tuneConfig.base_model === m.key }"
              @click="tuneConfig.base_model = m.key"
            >
              {{ m.name }}
            </button>
          </div>
        </div>

        <!-- Instance prompt for image -->
        <div v-if="selectedTarget === 'image'" class="bz-train__config-group">
          <label class="bz-train__label">Base Model</label>
          <div class="bz-train__model-pills">
            <button
              v-for="m in imageModels" :key="m.key"
              class="bz-train__model-pill"
              :class="{ 'is-selected': tuneConfig.base_model === m.key }"
              @click="tuneConfig.base_model = m.key"
            >
              {{ m.name }}
            </button>
          </div>
        </div>

        <div v-if="selectedTarget === 'image'" class="bz-train__config-group">
          <label class="bz-train__label">Instance Prompt</label>
          <input
            v-model="tuneConfig.instance_prompt"
            class="bz-train__input"
            placeholder="e.g. a photo of sks person"
          />
        </div>

        <!-- Shared LoRA config -->
        <div class="bz-train__config-grid">
          <div class="bz-train__config-group">
            <label class="bz-train__label">LoRA Rank</label>
            <select v-model.number="tuneConfig.lora_rank" class="bz-train__select">
              <option :value="4">4</option><option :value="8">8</option>
              <option :value="16">16</option><option :value="32">32</option>
              <option :value="64">64</option><option :value="128">128</option>
            </select>
          </div>
          <div class="bz-train__config-group">
            <label class="bz-train__label">Learning Rate</label>
            <select v-model="tuneConfig.learning_rate" class="bz-train__select">
              <option value="1e-5">1e-5</option>
              <option value="5e-5">5e-5</option>
              <option value="1e-4">1e-4</option>
              <option value="2e-4">2e-4</option>
            </select>
          </div>
          <div class="bz-train__config-group">
            <label class="bz-train__label">Epochs</label>
            <div class="bz-train__slider-row">
              <input type="range" min="1" max="10" v-model.number="tuneConfig.epochs" class="bz-train__slider" />
              <span class="bz-mono bz-train__slider-val">{{ tuneConfig.epochs }}</span>
            </div>
          </div>
          <div class="bz-train__config-group">
            <label class="bz-train__label">Batch Size</label>
            <select v-model.number="tuneConfig.batch_size" class="bz-train__select">
              <option :value="1">1</option><option :value="2">2</option>
              <option :value="4">4</option><option :value="8">8</option>
            </select>
          </div>
        </div>

        <!-- Options -->
        <div class="bz-train__options">
          <label class="bz-train__checkbox">
            <input type="checkbox" v-model="tuneConfig.use_4bit" />
            <span>4-bit quantization (QLoRA, CUDA only)</span>
          </label>
          <label class="bz-train__checkbox">
            <input type="checkbox" v-model="tuneConfig.uncensor" />
            <span>Uncensor (remove refusal patterns)</span>
          </label>
        </div>
      </section>

      <!-- Start Button -->
      <div class="bz-train__actions" v-if="selectedTarget && jsonlRows.length > 0">
        <button
          class="bz-btn bz-btn--primary bz-btn--lg"
          :disabled="training.active || (selectedTarget === 'image' && !tuneConfig.instance_prompt)"
          @click="startTuneTraining"
        >
          <span class="material-symbols-outlined" style="font-size:18px">play_arrow</span>
          {{ training.active ? 'Training…' : 'Start Training' }}
        </button>
      </div>

      <!-- Training Progress -->
      <div v-if="training.active" class="bz-train__progress-card">
        <div class="bz-train__progress-header">
          <span class="bz-train__progress-stage">{{ stageLabel(training.stage) }}</span>
          <span class="bz-mono">{{ training.pct }}%</span>
        </div>
        <div class="bz-train__progress-bar">
          <div class="bz-train__progress-fill" :style="{ width: training.pct + '%' }" />
        </div>
        <div class="bz-train__progress-detail" v-if="training.epoch > 0">
          Epoch {{ training.epoch }} / {{ training.total_epochs }}
          <template v-if="training.loss !== null"> · Loss: {{ training.loss.toFixed(4) }}</template>
          <template v-if="training.eta"> · ETA: {{ training.eta }}</template>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- UNCENSOR MODE                                                -->
    <!-- ============================================================ -->
    <div v-if="mode === 'uncensor'" class="bz-train__body">

      <!-- Model Selector -->
      <section class="bz-train__section">
        <h3 class="bz-train__section-title">Select Model</h3>
        <div class="bz-train__ablit-grid">
          <button
            v-for="m in ablitModels" :key="m.key"
            class="bz-train__ablit-card"
            :class="{ 'is-selected': ablitConfig.base_model === m.key }"
            @click="ablitConfig.base_model = m.key"
          >
            <span class="bz-train__ablit-name">{{ m.name }}</span>
            <span class="bz-train__ablit-repo bz-mono">{{ m.repo }}</span>
          </button>
        </div>
      </section>

      <!-- Method + Quantization -->
      <section class="bz-train__section" v-if="ablitConfig.base_model">
        <div class="bz-train__config-row">
          <div class="bz-train__config-group">
            <label class="bz-train__label">Method</label>
            <div class="bz-train__chips">
              <button
                v-for="m in ablitMethods" :key="m.value"
                class="bz-train__chip"
                :class="{ 'is-selected': ablitConfig.method === m.value }"
                @click="ablitConfig.method = m.value"
              >
                {{ m.label }}
              </button>
            </div>
          </div>
          <div class="bz-train__config-group">
            <label class="bz-train__label">Quantization</label>
            <div class="bz-train__chips">
              <button
                v-for="q in ablitQuants" :key="q"
                class="bz-train__chip"
                :class="{ 'is-selected': ablitConfig.quantization === q }"
                @click="ablitConfig.quantization = q"
              >
                {{ q }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Pipeline Visualization -->
      <section v-if="ablPipeline.active || ablPipeline.completed" class="bz-train__section bz-train__pipeline-section">
        <h3 class="bz-train__section-title">Abliteration Pipeline</h3>
        <div class="bz-train__stages">
          <div
            v-for="(s, i) in pipelineStages" :key="s.key"
            class="bz-train__stage"
            :class="{
              'is-running': ablPipeline.currentStage === s.key && ablPipeline.active,
              'is-done': ablPipeline.completedStages.has(s.key),
              'is-error': ablPipeline.errorStage === s.key,
            }"
          >
            <div class="bz-train__stage-dot">
              <span v-if="ablPipeline.completedStages.has(s.key)" class="material-symbols-outlined">check</span>
              <span v-else-if="ablPipeline.currentStage === s.key && ablPipeline.active" class="bz-train__stage-spinner" />
              <span v-else-if="ablPipeline.errorStage === s.key" class="material-symbols-outlined">error</span>
              <span v-else class="bz-train__stage-num">{{ i + 1 }}</span>
            </div>
            <span class="bz-train__stage-name">{{ s.name }}</span>
            <span class="bz-train__stage-desc">{{ s.desc }}</span>
          </div>
        </div>
        <!-- Stage detail -->
        <div v-if="ablPipeline.detail" class="bz-train__stage-detail">
          <span class="material-symbols-outlined" style="font-size:16px">info</span>
          {{ ablPipeline.detail }}
        </div>
      </section>

      <!-- Quality Metrics Dashboard -->
      <section v-if="ablPipeline.metrics" class="bz-train__section bz-train__metrics-section">
        <h3 class="bz-train__section-title">Quality Report</h3>
        <div class="bz-train__metric-grid">
          <div class="bz-train__metric-card">
            <span class="bz-train__metric-value" :class="metricClass('refusal_rate', ablPipeline.metrics.refusal_rate)">
              {{ ablPipeline.metrics.refusal_rate !== undefined ? (ablPipeline.metrics.refusal_rate * 100).toFixed(1) + '%' : '—' }}
            </span>
            <span class="bz-train__metric-label">Refusal Rate</span>
            <span class="bz-train__metric-hint">Lower = more uncensored</span>
          </div>
          <div class="bz-train__metric-card">
            <span class="bz-train__metric-value">
              {{ ablPipeline.metrics.perplexity !== undefined ? formatPerplexity(ablPipeline.metrics.perplexity) : '—' }}
            </span>
            <span class="bz-train__metric-label">Perplexity</span>
            <span class="bz-train__metric-hint">Lower = better</span>
          </div>
          <div class="bz-train__metric-card">
            <span class="bz-train__metric-value" :class="metricClass('coherence', ablPipeline.metrics.coherence)">
              {{ ablPipeline.metrics.coherence !== undefined ? (ablPipeline.metrics.coherence * 100).toFixed(0) + '%' : '—' }}
            </span>
            <span class="bz-train__metric-label">Coherence</span>
            <span class="bz-train__metric-hint">Higher = better</span>
          </div>
          <div class="bz-train__metric-card">
            <span class="bz-train__metric-value">
              {{ ablPipeline.metrics.kl_divergence !== undefined ? ablPipeline.metrics.kl_divergence.toFixed(3) : '—' }}
            </span>
            <span class="bz-train__metric-label">KL Divergence</span>
            <span class="bz-train__metric-hint">Lower = less drift</span>
          </div>
          <div class="bz-train__metric-card">
            <span class="bz-train__metric-value">
              <span
                class="bz-train__spectral-badge"
                :class="{
                  'is-green': ablPipeline.metrics.spectral_certification === 'GREEN',
                  'is-yellow': ablPipeline.metrics.spectral_certification === 'YELLOW',
                  'is-red': ablPipeline.metrics.spectral_certification === 'RED',
                }"
              >{{ ablPipeline.metrics.spectral_certification || '—' }}</span>
            </span>
            <span class="bz-train__metric-label">Spectral Cert.</span>
            <span class="bz-train__metric-hint">GREEN = certified</span>
          </div>
          <div class="bz-train__metric-card">
            <span class="bz-train__metric-value">
              {{ ablPipeline.metrics.degenerate_count !== undefined ? ablPipeline.metrics.degenerate_count : '—' }}
            </span>
            <span class="bz-train__metric-label">Degenerate</span>
            <span class="bz-train__metric-hint">Count of broken outputs</span>
          </div>
        </div>
      </section>

      <!-- Start Button -->
      <div class="bz-train__actions" v-if="ablitConfig.base_model">
        <button
          class="bz-btn bz-btn--primary bz-btn--lg"
          :disabled="ablPipeline.active"
          @click="startAbliteration"
        >
          <span class="material-symbols-outlined" style="font-size:18px">science</span>
          {{ ablPipeline.active ? 'Abliterating…' : 'Abliterate' }}
        </button>
      </div>

      <!-- Abliteration Progress -->
      <div v-if="ablPipeline.active" class="bz-train__progress-card">
        <div class="bz-train__progress-header">
          <span class="bz-train__progress-stage">{{ stageLabel(ablPipeline.stage) }}</span>
          <span class="bz-mono">{{ ablPipeline.pct }}%</span>
        </div>
        <div class="bz-train__progress-bar">
          <div class="bz-train__progress-fill" :style="{ width: ablPipeline.pct + '%' }" />
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- SHARED: Error Banner                                         -->
    <!-- ============================================================ -->
    <div v-if="training.error || ablPipeline.error" class="bz-notice bz-notice--danger" style="margin-top:var(--bz-space-3)">
      <span class="material-symbols-outlined bz-notice__icon">error</span>
      <span>{{ training.error || ablPipeline.error }}</span>
      <button class="bz-iconbtn bz-iconbtn--sm" @click="training.error = ''; ablPipeline.error = ''">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <!-- ============================================================ -->
    <!-- SHARED: Trained Models Gallery                               -->
    <!-- ============================================================ -->
    <section class="bz-train__section bz-train__models-section">
      <div class="bz-train__section-header">
        <h3 class="bz-train__section-title">Trained Models</h3>
        <button class="bz-iconbtn" @click="loadTrainedModels" title="Refresh">
          <span class="material-symbols-outlined">refresh</span>
        </button>
      </div>
      <div v-if="trainedModels.length === 0" class="bz-train__empty">
        <span class="material-symbols-outlined" style="font-size:32px;color:var(--bz-fg-faint)">inventory_2</span>
        <p>No trained models yet. Start a training run above.</p>
      </div>
      <div v-else class="bz-train__model-list">
        <div v-for="m in trainedModels" :key="m.id" class="bz-train__model-card">
          <div class="bz-train__model-card-top">
            <span class="skill-chip" :class="modelTypeChip(m.type)">{{ modelTypeLabel(m.type) }}</span>
            <span class="bz-train__model-date bz-mono">{{ formatDate(m.created_at) }}</span>
          </div>
          <div class="bz-train__model-card-body">
            <span class="bz-train__model-name">{{ m.base_model || m.filename || m.id }}</span>
            <span v-if="m.final_loss" class="bz-train__model-loss">Loss: {{ m.final_loss.toFixed(4) }}</span>
            <span v-if="m.nft?.tokenId" class="skill-chip skill-chip--success">
              NFT #{{ m.nft.tokenId }}
            </span>
            <span v-if="m.fineTuneToken?.tokenAddress" class="skill-chip skill-chip--brand">
              ${{ m.fineTuneToken.symbol || 'MODEL' }}
            </span>
            <span v-if="m.modelRegistry?.modelId" class="skill-chip skill-chip--success">
              Registry
            </span>
            <span v-if="m.revenueRoute?.assetId" class="skill-chip skill-chip--brand">
              Route
            </span>
            <span v-if="m.origin_record_count" class="skill-chip skill-chip--brand">
              {{ m.origin_record_count }} origin{{ m.origin_record_count === 1 ? '' : 's' }}
            </span>
            <span v-if="m.data_owner_wallets?.length" class="skill-chip skill-chip--success">
              {{ m.data_owner_wallets.length }} data owner{{ m.data_owner_wallets.length === 1 ? '' : 's' }}
            </span>
            <span v-if="m.filename" class="bz-mono" style="font-size:11px;color:var(--bz-fg-low)">{{ m.filename }}</span>
          </div>
          <div class="bz-train__model-card-actions">
            <button class="bz-btn bz-btn--primary bz-btn--sm" @click="mintModel(m)">
              <span class="material-symbols-outlined" style="font-size:14px">token</span> Mint
            </button>
            <button
              v-if="m.validation?.status !== 'passed'"
              class="bz-btn bz-btn--ghost bz-btn--sm"
              :disabled="modelValidation.loading && modelValidation.activeModelId === m.id"
              @click="validateModelForIssuance(m)"
            >
              <span class="material-symbols-outlined" style="font-size:14px">verified</span>
              {{ modelValidation.loading && modelValidation.activeModelId === m.id ? 'Testing...' : 'Test model' }}
            </button>
            <button
              v-if="m.validation?.status === 'passed' && m.nft?.tokenId && !m.fineTuneToken?.tokenAddress"
              class="bz-btn bz-btn--ghost bz-btn--sm"
              :disabled="!fineTuneTokenConfigured"
              @click="prepareTokenLaunch(m)"
            >
              <span class="material-symbols-outlined" style="font-size:14px">rocket_launch</span> Token
            </button>
            <button
              v-if="m.nft?.tokenId && !m.modelRegistry?.modelId"
              class="bz-btn bz-btn--ghost bz-btn--sm"
              :disabled="!modelRegistryReady() || modelRegistryPublish.loading"
              :title="modelRegistryReady() ? 'Publish trained model to the model registry' : 'Model registry is not configured'"
              @click="publishTrainedModel(m)"
            >
              <span class="material-symbols-outlined" style="font-size:14px">public</span>
              {{ modelRegistryPublish.activeModelId === m.id && modelRegistryPublish.loading ? 'Publishing...' : 'Registry' }}
            </button>
            <button
              v-if="m.nft?.tokenId && !m.revenueRoute?.assetId"
              class="bz-btn bz-btn--ghost bz-btn--sm"
              :disabled="!bonzaiRevenueRouterService.isConfigured() || revenueRoutePublish.loading"
              :title="bonzaiRevenueRouterService.isConfigured() ? 'Register contributor revenue route' : 'Revenue router is not configured'"
              @click="publishModelRevenueRoute(m)"
            >
              <span class="material-symbols-outlined" style="font-size:14px">account_balance</span>
              {{ revenueRoutePublish.activeModelId === m.id && revenueRoutePublish.loading ? 'Routing...' : 'Route' }}
            </button>
            <button
              v-if="m.model_provenance || m.provenance_schema"
              class="bz-btn bz-btn--ghost bz-btn--sm"
              @click="copyModelProvenance(m)"
            >
              <span class="material-symbols-outlined" style="font-size:14px">account_tree</span> Provenance
            </button>
            <button class="bz-btn bz-btn--ghost bz-btn--sm" @click="exportModel(m)">
              <span class="material-symbols-outlined" style="font-size:14px">download</span> Export
            </button>
            <button class="bz-iconbtn bz-iconbtn--sm" style="margin-left:auto" @click="deleteModel(m.id)" title="Delete">
              <span class="material-symbols-outlined" style="font-size:16px">delete</span>
            </button>
          </div>
          <div v-if="modelValidation.activeModelId === m.id && modelValidation.error" class="bz-train__contribution-alert is-error">
            {{ modelValidation.error }}
          </div>
          <div v-if="tokenLaunch.activeModelId === m.id" class="bz-train__token-launch">
            <div class="bz-train__token-grid">
              <input v-model="tokenLaunch.name" class="bz-train__input" placeholder="Token name" />
              <input v-model="tokenLaunch.symbol" class="bz-train__input" placeholder="Symbol" maxlength="12" />
              <input v-model="tokenLaunch.ethAmount" class="bz-train__input" placeholder="ETH liquidity" />
              <textarea v-model="tokenLaunch.description" class="bz-train__input bz-train__token-description" placeholder="What makes this model useful"></textarea>
              <input v-model="tokenLaunch.image" class="bz-train__input" placeholder="Token image URL or data URL" />
              <label class="bz-btn bz-btn--ghost bz-btn--sm bz-train__upload">
                Upload image
                <input type="file" accept="image/*" @change="handleTokenImage" />
              </label>
            </div>
            <div class="bz-train__token-profile-actions">
              <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="tokenLaunch.generating" @click="generateTokenProfile(m)">
                {{ tokenLaunch.generating ? 'Generating identity...' : 'Generate identity' }}
              </button>
              <span class="skill-chip skill-chip--success">Validated {{ shortHash(m.validation?.hash) }}</span>
            </div>
            <p class="bz-train__token-note">
              Revenue route is attached from {{ m.data_owner_wallets?.length || 0 }} data owner{{ (m.data_owner_wallets?.length || 0) === 1 ? '' : 's' }} and this model's provenance manifest.
            </p>
            <div v-if="tokenLaunch.error" class="bz-train__contribution-alert is-error">{{ tokenLaunch.error }}</div>
            <div class="bz-train__token-actions">
              <button class="bz-btn bz-btn--primary bz-btn--sm" :disabled="tokenLaunch.loading" @click="launchModelToken(m)">
                {{ tokenLaunch.loading ? 'Launching...' : `Launch ${m.type === 'abliteration' ? 'abliterated' : 'fine-tune'} token` }}
              </button>
              <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="tokenLaunch.loading" @click="cancelTokenLaunch">
                Cancel
              </button>
            </div>
          </div>
          <div
            v-if="modelRegistryPublish.activeModelId === m.id && modelRegistryPublish.error"
            class="bz-train__contribution-alert is-error"
          >
            {{ modelRegistryPublish.error }}
          </div>
          <div
            v-if="revenueRoutePublish.activeModelId === m.id && revenueRoutePublish.error"
            class="bz-train__contribution-alert is-error"
          >
            {{ revenueRoutePublish.error }}
          </div>
        </div>
      </div>
    </section>

    <!-- Mint Modal -->
    <MintModal
      v-if="showMintModal"
      :visible="showMintModal"
      v-bind="mintTarget"
      @close="showMintModal = false"
      @minted="onMintComplete"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import axios from 'axios'
import { io } from 'socket.io-client'
import AccessRequirements from './AccessRequirements.vue'
import MintModal from './MintModal.vue'
import { useBonzaiWeb3 } from '../composables/useBonzaiWeb3.js'
import {
  appendContributionLedgerEntry,
  buildTrainingProvenanceManifest,
  loadContributionLedger,
  parseDatasetText,
  updateContributionLedgerEntry,
} from '../services/contribution.service.js'
import {
  contributionEconomyReady,
  modelRegistryReady,
  publishDatasetFromRows,
  publishModelFromProvenance,
} from '../services/contributionRegistry.service.js'
import { fineTuneTokenService } from '../services/fineTuneToken.service.js'
import { bonzaiRevenueRouterService } from '../services/bonzaiRevenueRouter.service.js'
import { i18n } from '../i18n/index.js'

/* ── Props ─────────────────────────────────────────────────────── */
const props = defineProps({
  mode: { type: String, default: 'tune' },           // 'tune' | 'uncensor'
  initialTab: { type: String, default: '' },          // legacy compat
  fixedTab: { type: Boolean, default: false },        // legacy compat
})


const modeTitle = computed(() => props.mode === 'uncensor' ? 'Uncensor' : 'Tune')
const modeSubtitle = computed(() => props.mode === 'uncensor'
  ? 'Remove refusal behavior and verify the result.'
  : 'Train local adapters from your data.'
)
const modeSteps = computed(() => props.mode === 'uncensor'
  ? [
      { icon: 'travel_explore', label: 'Probe', copy: 'Find refusal circuits.' },
      { icon: 'content_cut', label: 'Excise', copy: 'Remove the behavior vector.' },
      { icon: 'verified', label: 'Verify', copy: 'Check coherence before export.' },
    ]
  : [
      { icon: 'dataset', label: 'Import', copy: 'Load data with provenance.' },
      { icon: 'tune', label: 'Train', copy: 'Create a local adapter.' },
      { icon: 'account_tree', label: 'Route', copy: 'Attach contributors and revenue.' },
    ])

/* ── API base ──────────────────────────────────────────────────── */
const API_BASE = import.meta.env.VITE_API_BASE
  || window.electronAPI?.env?.API_BASE
  || 'http://127.0.0.1:65000'
const { walletAddress } = useBonzaiWeb3()

/* ── Tune state ────────────────────────────────────────────────── */
const jsonlRows = ref([])
const jsonlColumns = ref([])
const jsonlFileName = ref('')
const isDragOver = ref(false)
const selectedTarget = ref(null)
const contributionPack = ref(null)
const contributionLedger = ref([])
const activeContributionLedgerId = ref('')
const contributionPublish = reactive({
  active: false,
  error: '',
  result: null,
})

const targets = [
  { key: 'text',  name: 'Text',  icon: 'chat',         model: 'Qwen 3.5 / 3.6',  desc: 'LoRA fine-tune LLMs for custom behavior' },
  { key: 'image', name: 'Image', icon: 'image',         model: 'Z-Image Turbo',    desc: 'LoRA fine-tune diffusion for custom styles' },
  { key: 'audio', name: 'Audio', icon: 'graphic_eq',    model: 'Qwen TTS / ACE-Step', desc: 'Voice LoRA or music LoRA adapters' },
  { key: 'video', name: 'Video', icon: 'movie',         model: 'Wan 2.2 I2V',      desc: 'Video LoRA for motion and style' },
]

const llmModels = [
  { key: 'qwen3_5_0_8b', name: 'Qwen3.5 0.8B' },
  { key: 'qwen_3_6_27b', name: 'Qwen3.6 27B' },
]

const audioModels = [
  { key: 'qwen-tts', name: 'Qwen TTS Voice' },
  { key: 'ace-step', name: 'ACE-Step Music' },
]

const imageModels = [
  { key: 'z-image-turbo', name: 'Z-Image Turbo' },
  { key: 'sdxl-base-1.0', name: 'SDXL 1.0' },
]

const tuneConfig = reactive({
  base_model: 'qwen3_5_0_8b',
  lora_rank: 16,
  learning_rate: '2e-4',
  epochs: 3,
  batch_size: 4,
  use_4bit: true,
  uncensor: false,
  instance_prompt: '',
})

/* ── Uncensor state ────────────────────────────────────────────── */
const ablitModels = ref([])
const ablitConfig = reactive({
  base_model: '',
  method: 'advanced',
  quantization: 'Q4_K_M',
})

const ablitMethods = [
  { value: 'basic',     label: 'Basic' },
  { value: 'advanced',  label: 'Advanced' },
  { value: 'nuclear',   label: 'Nuclear' },
  { value: 'informed',  label: 'Informed' },
]

const ablitQuants = ['Q2_K', 'Q3_K_M', 'Q4_K_M', 'Q5_K_M', 'Q8_0', 'F16']

const pipelineStages = [
  { key: 'summon',  name: 'SUMMON',  desc: 'Loading model into memory' },
  { key: 'probe',   name: 'PROBE',   desc: 'Probing refusal circuits' },
  { key: 'distill', name: 'DISTILL', desc: 'Extracting refusal subspace via SVD' },
  { key: 'excise',  name: 'EXCISE',  desc: 'Excising refusal directions from weights' },
  { key: 'verify',  name: 'VERIFY',  desc: 'Verifying coherence and quality' },
  { key: 'rebirth', name: 'REBIRTH', desc: 'Saving the liberated model' },
]

/* ── Training progress ─────────────────────────────────────────── */
const training = reactive({
  active: false, type: '', id: '', stage: '', pct: 0,
  epoch: 0, total_epochs: 0, loss: null, eta: '', error: '',
})

const ablPipeline = reactive({
  active: false, completed: false, stage: '', pct: 0, detail: '',
  currentStage: '', completedStages: new Set(), errorStage: '', error: '',
  metrics: null,
})

/* ── Trained models ────────────────────────────────────────────── */
const trainedModels = ref([])
const showMintModal = ref(false)
const mintTarget = ref(null)
const modelEconomy = ref({})
const tokenLaunch = reactive({
  activeModelId: '',
  name: '',
  symbol: '',
  ethAmount: '0.01',
  loading: false,
  error: '',
  result: null,
  description: '',
  image: '',
  generating: false,
})
const modelValidation = reactive({ activeModelId: '', loading: false, error: '' })
const modelRegistryPublish = reactive({
  activeModelId: '',
  loading: false,
  error: '',
})
const revenueRoutePublish = reactive({
  activeModelId: '',
  loading: false,
  error: '',
})

/* ── Computed ──────────────────────────────────────────────────── */
const detectedType = computed(() => {
  if (jsonlRows.value.length === 0) return 'unknown'
  const first = jsonlRows.value[0]
  if (first.kind?.includes('audio')) return 'audio'
  if (first.kind?.includes('image')) return 'image'
  if (first.kind?.includes('video')) return 'video'
  if (first.audio || first.audio_url || first.waveform) return 'audio'
  if (first.image || first.image_url || first.image_base64) return 'image'
  if (first.video || first.video_url || first.frames) return 'video'
  return 'text'
})

const jsonlPreview = computed(() => jsonlRows.value.slice(0, 5))
const hasContributionPack = computed(() => !!contributionPack.value)
const contributionSummary = computed(() => contributionPack.value?.summary || null)
const contributionWarnings = computed(() => contributionPack.value?.validation?.warnings || [])
const contributionErrors = computed(() => contributionPack.value?.validation?.errors || [])
const contributionRevenuePlan = computed(() => contributionPack.value?.revenuePlan || null)
const ledgerPreview = computed(() => contributionLedger.value.slice(0, 3))
const canPublishContributionPack = computed(() => hasContributionPack.value && jsonlRows.value.length > 0 && contributionEconomyReady())
const fineTuneTokenConfigured = fineTuneTokenService.isConfigured

const MODEL_ECONOMY_KEY = 'bonzai-trained-model-economy-v1'

function loadModelEconomy() {
  try {
    const raw = window.localStorage?.getItem(MODEL_ECONOMY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveModelEconomy(next = modelEconomy.value) {
  modelEconomy.value = next
  try {
    window.localStorage?.setItem(MODEL_ECONOMY_KEY, JSON.stringify(next))
  } catch { /* local persistence is best-effort */ }
}

function applyModelEconomy(models) {
  return models.map(model => ({
    ...model,
    ...(model.economy || {}),
    ...(modelEconomy.value[model.id] || {}),
  }))
}

async function persistModelEconomy(modelId, patch) {
  try {
    await axios.post(`${API_BASE}/training/models/${modelId}/economy`, patch)
  } catch (err) {
    console.warn('[Training] Failed to persist model economy state', err)
  }
}

function updateModelEconomy(modelId, patch, { syncServer = true } = {}) {
  if (!modelId) return
  const next = {
    ...modelEconomy.value,
    [modelId]: {
      ...(modelEconomy.value[modelId] || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  }
  saveModelEconomy(next)
  trainedModels.value = applyModelEconomy(trainedModels.value)
  if (syncServer) {
    void persistModelEconomy(modelId, patch)
  }
}

function tokenDefaults(model) {
  const base = String(model.base_model || model.filename || model.id || 'model')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
  const words = base.split(/\s+/).filter(Boolean)
  const symbol = (`BZ${words.map(word => word[0]).join('') || 'MODEL'}`).slice(0, 10).toUpperCase()
  return {
    name: `BonzAI Fine-Tune: ${base.slice(0, 42) || model.id}`,
    symbol,
  }
}

/* ── JSONL Import ──────────────────────────────────────────────── */
function onDrop(e) {
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) parseDatasetFile(file)
}

function onFileSelect(e) {
  const file = e.target?.files?.[0]
  if (file) parseDatasetFile(file)
}

function parseDatasetFile(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target.result
    const parsed = parseDatasetText(text, file.name)
    if (parsed.rows.length === 0) return
    jsonlRows.value = parsed.rows
    jsonlColumns.value = parsed.columns
    jsonlFileName.value = file.name
    contributionPack.value = parsed.contributionPack
    activeContributionLedgerId.value = ''

    if (parsed.contributionPack) {
      const entry = appendContributionLedgerEntry(parsed.contributionPack, detectedType.value)
      activeContributionLedgerId.value = entry.id
      contributionLedger.value = loadContributionLedger()
    }
  }
  reader.readAsText(file)
}

function clearJsonl() {
  jsonlRows.value = []
  jsonlColumns.value = []
  jsonlFileName.value = ''
  contributionPack.value = null
  activeContributionLedgerId.value = ''
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

function cellValue(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value || '')
}

function formatPercent(value, total) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function contributionKindLabel(kind) {
  return String(kind || '').replace('dataset_', '')
}

async function publishContributionPack() {
  if (!hasContributionPack.value || contributionPublish.active) return

  contributionPublish.active = true
  contributionPublish.error = ''
  contributionPublish.result = null

  try {
    if (!contributionEconomyReady()) {
      throw new Error('Contribution registries are not configured yet.')
    }

    const result = await publishDatasetFromRows(jsonlRows.value, {
      packMetadataURI: contributionSummary.value?.packId ? `bonzai-pack://${contributionSummary.value.packId}` : '',
      datasetMetadataURI: contributionSummary.value?.packId ? `bonzai-dataset://${contributionSummary.value.packId}` : '',
      commercialAllowed: contributionSummary.value?.commercialAllowed > 0,
      royaltyBearing: contributionSummary.value?.royaltyBearing > 0,
    })
    contributionPublish.result = result

    if (activeContributionLedgerId.value) {
      updateContributionLedgerEntry(activeContributionLedgerId.value, {
        status: 'published',
        registryDatasetId: result.datasetId,
        registryTxHash: result.txHash,
      })
      contributionLedger.value = loadContributionLedger()
    }
  } catch (err) {
    contributionPublish.error = err.message || 'Contribution publishing failed'
  } finally {
    contributionPublish.active = false
  }
}

/* ── Training ──────────────────────────────────────────────────── */
let socket = null

function setupSocket() {
  socket = io(`${API_BASE}/training`, { transports: ['websocket'] })

  socket.on('training_progress', (data) => {
    // Abliteration pipeline stages
    if (['summon', 'probe', 'distill', 'excise', 'verify', 'rebirth'].includes(data.stage)) {
      ablPipeline.stage = data.stage
      ablPipeline.pct = data.progress || 0
      ablPipeline.detail = data.detail || ''
      ablPipeline.currentStage = data.stage
      // Mark completed stages
      const stageOrder = ['summon', 'probe', 'distill', 'excise', 'verify', 'rebirth']
      const idx = stageOrder.indexOf(data.stage)
      for (let i = 0; i < idx; i++) {
        ablPipeline.completedStages.add(stageOrder[i])
      }
      // Capture quality metrics from VERIFY done
      if (data.quality_metrics) {
        ablPipeline.metrics = data.quality_metrics
      }
      return
    }
    // Standard training progress
    training.stage = data.stage || ''
    training.pct = data.progress || 0
    training.epoch = data.epoch || 0
    training.total_epochs = data.total_epochs || 0
    training.loss = data.loss
    training.eta = data.eta || ''
  })

  socket.on('training_complete', (data) => {
    if (data.type === 'abliteration') {
      ablPipeline.active = false
      ablPipeline.completed = true
      ablPipeline.pct = 100
      pipelineStages.forEach(s => ablPipeline.completedStages.add(s.key))
      if (data.quality_metrics) {
        ablPipeline.metrics = data.quality_metrics
      }
    } else {
      training.active = false
      training.pct = 100
    }
    loadTrainedModels()
  })

  socket.on('training_error', (data) => {
    if (ablPipeline.active) {
      ablPipeline.active = false
      ablPipeline.error = data.error || 'Abliteration failed'
      ablPipeline.errorStage = ablPipeline.currentStage
    } else {
      training.active = false
      training.error = data.error || 'Training failed'
    }
  })
}

async function startTuneTraining() {
  if (!jsonlRows.value.length) return

  training.active = true
  training.error = ''
  training.pct = 0
  training.epoch = 0

  try {
    // Build dataset from JSONL
    const datasetName = `tune-${Date.now()}`
    const trainingConfig = {
      target: selectedTarget.value,
      ...tuneConfig,
      learning_rate: parseFloat(tuneConfig.learning_rate),
    }
    const trainingProvenance = buildTrainingProvenanceManifest({
      rows: jsonlRows.value,
      contributionPack: contributionPack.value,
      datasetType: detectedType.value,
      datasetName,
      trainerWallet: walletAddress.value || null,
      trainingConfig,
    })
    const jsonlContent = jsonlRows.value.map(r => JSON.stringify(r)).join('\n')
    const blob = new Blob([jsonlContent], { type: 'application/jsonl' })
    const base64 = await blobToBase64(blob)

    const dsResp = await axios.post(`${API_BASE}/training/datasets`, {
      name: datasetName,
      type: detectedType.value,
      files: [{ filename: jsonlFileName.value || 'data.jsonl', content_base64: base64 }],
      provenance: trainingProvenance,
    })

    if (!dsResp.data?.dataset?.id) throw new Error('Failed to create dataset')
    const datasetId = dsResp.data.dataset.id
    if (activeContributionLedgerId.value) {
      updateContributionLedgerEntry(activeContributionLedgerId.value, {
        datasetId,
        datasetType: detectedType.value,
        trainingProvenance,
        dataOwnerCount: trainingProvenance.dataset.dataOwnerWallets.length,
        contributionIds: trainingProvenance.dataset.contributionIds,
        status: 'dataset_created',
      })
      contributionLedger.value = loadContributionLedger()
    }

    // Pick endpoint
    const endpointMap = { text: 'llm', image: 'sdxl', audio: 'audio', video: 'video' }
    const endpoint = endpointMap[detectedType.value] || 'llm'

    const payload = {
      dataset_id: datasetId,
      ...tuneConfig,
      learning_rate: parseFloat(tuneConfig.learning_rate),
      training_provenance: trainingProvenance,
    }
    if (detectedType.value === 'image' && !tuneConfig.instance_prompt) {
      throw new Error('Instance prompt is required for image training')
    }

    const resp = await axios.post(`${API_BASE}/training/${endpoint}/start`, payload)
    if (resp.status !== 202) throw new Error(resp.data?.error || 'Failed to start training')
    training.id = resp.data.training_id
    if (activeContributionLedgerId.value) {
      updateContributionLedgerEntry(activeContributionLedgerId.value, {
        trainingId: training.id,
        trainingProvenance,
        status: 'training_started',
      })
      contributionLedger.value = loadContributionLedger()
    }
  } catch (err) {
    training.active = false
    training.error = err.message
  }
}

async function startAbliteration() {
  if (!ablitConfig.base_model) return

  ablPipeline.active = true
  ablPipeline.completed = false
  ablPipeline.error = ''
  ablPipeline.pct = 0
  ablPipeline.detail = ''
  ablPipeline.currentStage = ''
  ablPipeline.completedStages = new Set()
  ablPipeline.errorStage = ''
  ablPipeline.metrics = null

  try {
    const resp = await axios.post(`${API_BASE}/training/abliterate/start`, {
      base_model: ablitConfig.base_model,
      method: ablitConfig.method,
      quantization: ablitConfig.quantization,
    })
    if (resp.status !== 202) throw new Error(resp.data?.error || 'Failed to start abliteration')
  } catch (err) {
    ablPipeline.active = false
    ablPipeline.error = err.message
  }
}

/* ── Data loading ──────────────────────────────────────────────── */
async function loadTrainedModels() {
  try {
    const resp = await axios.get(`${API_BASE}/training/models`)
    trainedModels.value = applyModelEconomy(resp.data?.models || [])
  } catch { /* silent */ }
}

async function loadAblitModels() {
  try {
    const resp = await axios.get(`${API_BASE}/training/info`)
    ablitModels.value = resp.data?.abliteration_models || []
  } catch { /* silent */ }
}

/* ── Model actions ─────────────────────────────────────────────── */
function registryDatasetIdsForModel(provenance) {
  const contributionIds = new Set((provenance?.dataset?.contributionIds || []).map(String))
  const ids = new Set()
  contributionLedger.value.forEach(entry => {
    const entryIds = entry.contributionIds || []
    const matchesContribution = entryIds.some(id => contributionIds.has(String(id)))
    if ((matchesContribution || !contributionIds.size) && /^0x[a-fA-F0-9]{64}$/.test(String(entry.registryDatasetId || ''))) {
      ids.add(entry.registryDatasetId)
    }
  })
  return [...ids]
}

async function exportModel(model) {
  try {
    const resp = await axios.post(`${API_BASE}/training/models/${model.id}/export`)
    if (window.electronAPI?.saveModel && resp.data?.model_path) {
      await window.electronAPI.saveModel(model.filename || model.id, resp.data.model_path)
    }
  } catch { /* silent */ }
}

async function modelProvenance(model) {
  if (model?.model_provenance) return model.model_provenance
  try {
    const resp = await axios.get(`${API_BASE}/training/models/${model.id}/provenance`)
    return resp.data?.provenance || null
  } catch {
    return null
  }
}

async function mintModel(model) {
  const provenance = await modelProvenance(model)
  const dataOwners = provenance?.dataset?.dataOwnerWallets || model.data_owner_wallets || []
  const payload = {
    model,
    provenance,
    mintedAt: new Date().toISOString(),
  }
  mintTarget.value = {
    inferenceType: 'training',
    inferenceId: model.id,
    content: JSON.stringify(payload, null, 2),
    contentType: 'application/json',
    prompt: `BonzAI fine-tuned model: ${model.base_model || model.filename || model.id}`,
    generation: {
      type: 'fine-tuned-model',
      model: model.base_model || model.filename || model.id,
      timestamp: model.created_at ? new Date(model.created_at).getTime() : Date.now(),
      modelProvenance: provenance,
      contributionParents: provenance?.dataset?.contributionIds || model.contribution_ids || [],
      dataOwnerWallets: dataOwners,
      safety: { nsfw: false },
    },
  }
  showMintModal.value = true
}

function prepareTokenLaunch(model) {
  if (model.validation?.status !== 'passed') return
  const defaults = tokenDefaults(model)
  tokenLaunch.activeModelId = model.id
  tokenLaunch.name = defaults.name
  tokenLaunch.symbol = defaults.symbol
  tokenLaunch.ethAmount = tokenLaunch.ethAmount || '0.01'
  tokenLaunch.loading = false
  tokenLaunch.error = ''
  tokenLaunch.result = null
  tokenLaunch.description = model.tokenProfile?.description || ''
  tokenLaunch.image = model.tokenProfile?.image || ''
}

function cancelTokenLaunch() {
  tokenLaunch.activeModelId = ''
  tokenLaunch.error = ''
  tokenLaunch.result = null
}

async function launchModelToken(model) {
  if (!model?.nft?.tokenId) {
    tokenLaunch.error = 'Mint this trained model before launching a fine-tune token.'
    return
  }
  if (!fineTuneTokenConfigured.value) {
    tokenLaunch.error = 'Fine-tune token factory is not configured.'
    return
  }
  if (model.validation?.status !== 'passed' || !model.validation?.hash) {
    tokenLaunch.error = 'Test and validate this model before token issuance.'
    return
  }

  tokenLaunch.loading = true
  tokenLaunch.error = ''
  tokenLaunch.result = null
  try {
    const provenance = await modelProvenance(model)
    const result = await fineTuneTokenService.launchFineTuneToken(
      model.nft.tokenId,
      tokenLaunch.name.trim(),
      tokenLaunch.symbol.trim().toUpperCase(),
      model.nft.metadataUrl || model.nft.contentUrl || `bonzai-model://${model.id}`,
      tokenLaunch.ethAmount,
      {
        modelProvenance: provenance,
        revenuePlan: provenance?.attribution?.revenuePlan || null,
        validation: model.validation,
        validationHash: model.validation.hash,
        modelKind: model.type === 'abliteration' ? 'abliterated' : 'fine_tuned',
        profile: { description: tokenLaunch.description.trim(), image: tokenLaunch.image },
      },
    )
    if (!result?.success) throw new Error(result?.error || 'Fine-tune token launch failed')
    tokenLaunch.result = result
    updateModelEconomy(model.id, {
      fineTuneToken: {
        tokenAddress: result.tokenAddress,
        poolId: result.poolId,
        symbol: result.symbol,
        txHash: result.txHash,
        ethLiquidity: result.ethLiquidity,
        modelMetadataHash: result.modelMetadataHash,
        contributionRouting: result.contributionRouting,
        modelKind: result.modelKind,
        profile: result.profile,
        validationHash: result.validationHash,
        launchedAt: new Date().toISOString(),
      },
    })
    if (bonzaiRevenueRouterService.isConfigured() && result.poolId) {
      const route = await bonzaiRevenueRouterService.registerModelRevenueRoute(
        { ...model, fineTuneToken: { poolId: result.poolId } },
        provenance,
        result.poolId,
      )
      updateModelEconomy(model.id, {
        revenueRoute: {
          assetId: route.assetId,
          txHash: route.txHash,
          participants: route.participants,
          registeredAt: new Date().toISOString(),
        },
      })
    }
    tokenLaunch.activeModelId = ''
  } catch (err) {
    tokenLaunch.error = err.message || 'Fine-tune token launch failed'
  } finally {
    tokenLaunch.loading = false
  }
}

async function validateModelForIssuance(model) {
  modelValidation.activeModelId = model.id
  modelValidation.loading = true
  modelValidation.error = ''
  try {
    const resp = await axios.post(`${API_BASE}/training/models/${model.id}/validate`)
    const validation = resp.data?.validation
    if (!validation || validation.status !== 'passed') throw new Error('Model validation did not pass')
    model.validation = validation
    updateModelEconomy(model.id, { validation })
  } catch (err) {
    modelValidation.error = err.response?.data?.validation?.errors?.join('. ') || err.message || 'Model validation failed'
  } finally {
    modelValidation.loading = false
  }
}

async function generateTokenProfile(model) {
  tokenLaunch.generating = true
  tokenLaunch.error = ''
  try {
    const kind = model.type === 'abliteration' ? 'abliterated local language model' : 'locally fine-tuned AI model'
    const raw = await window.electronAPI.chat(
      `Return JSON only with name, ticker, description, and imagePrompt for a token representing this ${kind}. Base model: ${model.base_model || model.filename || model.id}. Description must be concrete, under 240 characters. Ticker must be 3-10 uppercase letters.`,
      { maxTokens: 320, temperature: 0.7 },
    )
    const match = String(raw?.text || raw || '').match(/\{[\s\S]*\}/)
    const generated = match ? JSON.parse(match[0]) : {}
    tokenLaunch.name = generated.name || tokenLaunch.name
    tokenLaunch.symbol = String(generated.ticker || tokenLaunch.symbol).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
    tokenLaunch.description = generated.description || tokenLaunch.description
    if (generated.imagePrompt && window.electronAPI?.inferenceRequest) {
      const imageResult = await window.electronAPI.inferenceRequest('image_turbo', {
        prompt: `${generated.imagePrompt}. Square token identity image, no text, no logo, clean central subject.`,
        width: 512,
        height: 512,
      })
      const value = imageResult?.result?.image_base64 || imageResult?.result?.image || imageResult?.image_base64
      if (value) tokenLaunch.image = String(value).startsWith('data:') ? value : `data:image/png;base64,${value}`
    }
    await updateModelEconomy(model.id, { tokenProfile: {
      name: tokenLaunch.name, symbol: tokenLaunch.symbol, description: tokenLaunch.description, image: tokenLaunch.image,
    } })
  } catch (err) {
    tokenLaunch.error = err.message || 'Could not generate the model identity.'
  } finally {
    tokenLaunch.generating = false
  }
}

function handleTokenImage(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { tokenLaunch.image = String(reader.result || '') }
  reader.readAsDataURL(file)
}

function shortHash(value) {
  const text = String(value || '')
  return text.length > 12 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text
}

async function publishTrainedModel(model) {
  if (!model?.nft?.tokenId) {
    modelRegistryPublish.activeModelId = model.id
    modelRegistryPublish.error = 'Mint this trained model before publishing it to the registry.'
    return
  }
  if (!modelRegistryReady()) {
    modelRegistryPublish.activeModelId = model.id
    modelRegistryPublish.error = 'Model registry is not configured.'
    return
  }

  modelRegistryPublish.activeModelId = model.id
  modelRegistryPublish.loading = true
  modelRegistryPublish.error = ''

  try {
    const provenance = await modelProvenance(model)
    const result = await publishModelFromProvenance(model, provenance, {
      datasetIds: registryDatasetIdsForModel(provenance),
      metadataURI: model.nft.metadataUrl || model.nft.contentUrl || `bonzai-model://${model.id}`,
    })
    updateModelEconomy(model.id, {
      modelRegistry: {
        modelId: result.modelId,
        txHash: result.txHash,
        metadataURI: result.metadataURI,
        datasetIds: result.datasetIds,
        evaluationIds: result.evaluationIds,
        revenueRecipient: result.revenueRecipient,
        publishedAt: new Date().toISOString(),
      },
    })
    modelRegistryPublish.activeModelId = ''
  } catch (err) {
    modelRegistryPublish.error = err.message || 'Model registry publishing failed'
  } finally {
    modelRegistryPublish.loading = false
  }
}

async function publishModelRevenueRoute(model) {
  if (!model?.nft?.tokenId) {
    revenueRoutePublish.activeModelId = model.id
    revenueRoutePublish.error = 'Mint this trained model before registering a revenue route.'
    return
  }
  if (!bonzaiRevenueRouterService.isConfigured()) {
    revenueRoutePublish.activeModelId = model.id
    revenueRoutePublish.error = 'Revenue router is not configured.'
    return
  }

  revenueRoutePublish.activeModelId = model.id
  revenueRoutePublish.loading = true
  revenueRoutePublish.error = ''

  try {
    const provenance = await modelProvenance(model)
    const result = await bonzaiRevenueRouterService.registerModelRevenueRoute(model, provenance)
    updateModelEconomy(model.id, {
      revenueRoute: {
        assetId: result.assetId,
        txHash: result.txHash,
        participants: result.participants,
        registeredAt: new Date().toISOString(),
      },
    })
    revenueRoutePublish.activeModelId = ''
  } catch (err) {
    revenueRoutePublish.error = err.message || 'Revenue route registration failed'
  } finally {
    revenueRoutePublish.loading = false
  }
}

async function copyModelProvenance(model) {
  const provenance = await modelProvenance(model)
  if (!provenance) return
  const text = JSON.stringify(provenance, null, 2)
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    console.info('[Training] Model provenance:', provenance)
  }
}

async function deleteModel(id) {
  try {
    await axios.delete(`${API_BASE}/training/models/${id}`)
    await loadTrainedModels()
  } catch { /* silent */ }
}

function onMintComplete(result) {
  if (mintTarget.value?.inferenceId && result) {
    const id = mintTarget.value.inferenceId
    updateModelEconomy(id, { nft: result })
  }
  showMintModal.value = false
}

/* ── Helpers ───────────────────────────────────────────────────── */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function stageLabel(stage) {
  const labels = {
    loading_dataset: 'Loading Dataset', loading_model: 'Loading Model',
    configuring_lora: 'Configuring LoRA', preparing_data: 'Preparing Data',
    training: 'Training', saving: 'Saving',
    loading_images: 'Loading Images', loading_data: 'Loading Data',
    encoding_latents: 'Encoding Latents', preparing_audio_lora: 'Preparing Audio LoRA',
    summon: 'SUMMON', probe: 'PROBE', distill: 'DISTILL',
    excise: 'EXCISE', verify: 'VERIFY', rebirth: 'REBIRTH',
    converting: 'Converting', quantizing: 'Quantizing',
    abliteration: 'Abliterating',
  }
  return labels[stage] || stage || 'Processing'
}

function modelTypeLabel(type) {
  if (type?.includes('llm')) return 'Text'
  if (type?.includes('sdxl') || type?.includes('image')) return 'Image'
  if (type?.includes('audio')) return 'Audio'
  if (type?.includes('video')) return 'Video'
  if (type?.includes('ablit')) return 'Ablit'
  return type || 'Model'
}

function modelTypeChip(type) {
  const label = modelTypeLabel(type)
  const map = { Text: 'skill-chip--brand', Image: 'skill-chip--info', Audio: 'skill-chip--warning', Video: 'skill-chip--success', Ablit: 'skill-chip--danger' }
  return map[label] || 'skill-chip--muted'
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(i18n.state.locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatPerplexity(val) {
  if (val > 1000) return (val / 1000).toFixed(1) + 'K'
  if (val > 100) return val.toFixed(0)
  return val.toFixed(1)
}

function metricClass(key, val) {
  if (val === undefined || val === null) return ''
  if (key === 'refusal_rate') return val < 0.1 ? 'is-good' : val < 0.5 ? 'is-warn' : 'is-bad'
  if (key === 'coherence') return val > 0.8 ? 'is-good' : val > 0.5 ? 'is-warn' : 'is-bad'
  return ''
}

/* ── Watch target → update base_model ──────────────────────────── */
watch(selectedTarget, (t) => {
  if (t === 'text') tuneConfig.base_model = 'qwen3_5_0_8b'
  else if (t === 'image') tuneConfig.base_model = 'z-image-turbo'
  else if (t === 'audio') tuneConfig.base_model = 'qwen-tts'
  else if (t === 'video') tuneConfig.base_model = 'wan-2.2'
})

/* ── Lifecycle ─────────────────────────────────────────────────── */
onMounted(() => {
  setupSocket()
  modelEconomy.value = loadModelEconomy()
  contributionLedger.value = loadContributionLedger()
  loadTrainedModels()
  loadAblitModels()
})

onBeforeUnmount(() => {
  if (socket) socket.disconnect()
})
</script>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────── */
.bz-train {
  position: relative;
  min-height: 100%;
  padding: var(--bz-space-5) var(--bz-space-5) var(--bz-space-8);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

.bz-train__orb {
  position: fixed;
  top: 20%;
  right: -120px;
  width: 400px;
  height: 400px;
  pointer-events: none;
  z-index: 0;
}
.bz-train__orb::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, var(--bz-purple-glow) 0%, transparent 70%);
  animation: bz-orb-drift 12s ease-in-out infinite alternate;
  opacity: 0.35;
}

.bz-train__body {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  position: relative;
  z-index: 1;
}

/* ── Header ──────────────────────────────────────────────────── */
.bz-train__header {
  position: relative;
  z-index: 1;
  margin-bottom: var(--bz-space-2);
}
.bz-train__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--bz-space-4);
  padding-bottom: var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
}
.bz-train__hero-copy {
  min-width: 0;
}
.bz-train__title {
  margin: 0;
  color: var(--bz-fg) !important;
  -webkit-text-fill-color: var(--bz-fg) !important;
  background: none !important;
  font-size: var(--bz-size-h1);
  line-height: var(--bz-line-tight);
  letter-spacing: 0;
}
.bz-train__hero-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--bz-space-2);
}
.bz-train__hero-stats span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-ui);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.bz-train__subtitle {
  margin: var(--bz-space-1) 0 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-body);
  max-width: none;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bz-train__quick-steps {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border-bottom: 1px solid var(--bz-border);
}
.bz-train__quick-step {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bz-space-2);
  align-items: start;
  padding: var(--bz-space-3) var(--bz-space-4);
  border-right: 1px solid var(--bz-border);
  background: transparent;
}
.bz-train__quick-step:last-child { border-right: 0; }
.bz-train__quick-step .material-symbols-outlined {
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
  font-size: 21px;
}
.bz-train__quick-step strong,
.bz-train__quick-step small {
  display: block;
}
.bz-train__quick-step strong {
  color: var(--bz-fg);
  font-size: 16px;
  line-height: 1;
}
.bz-train__quick-step small {
  margin-top: 4px;
  color: var(--bz-fg-low);
  font-size: 12px;
  line-height: 1.25;
}

/* ── Sections ────────────────────────────────────────────────── */
.bz-train__section {
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  padding: var(--bz-space-4);
  position: relative;
  z-index: 1;
}
.bz-train__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.bz-train__section-title {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  font-family: var(--bz-font-body);
  font-size: 17px;
  font-weight: 400;
  color: var(--bz-fg);
  margin: 0 0 var(--bz-space-3);
}
.bz-train__section-header .bz-train__section-title {
  margin: 0;
}
.bz-train__step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

/* ── Dropzone ────────────────────────────────────────────────── */
.bz-train__dropzone {
  position: relative;
  border: 2px dashed var(--bz-border-strong);
  border-radius: var(--bz-r);
  padding: var(--bz-space-5) var(--bz-space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bz-space-2);
  cursor: pointer;
  transition: border-color var(--bz-dur-fast) var(--bz-ease-out),
              background var(--bz-dur-fast) var(--bz-ease-out);
  min-height: 160px;
}
.bz-train__dropzone:hover,
.bz-train__dropzone.is-dragover {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
}
.bz-train__dropzone.has-data {
  border-style: solid;
  border-color: var(--bz-border);
  cursor: default;
  padding: var(--bz-space-3);
  align-items: stretch;
}
.bz-train__dropzone-icon {
  font-size: 40px;
  color: var(--bz-fg-low);
}
.bz-train__dropzone-label {
  font-size: var(--bz-size-body);
  color: var(--bz-fg-mid);
}
.bz-train__dropzone-hint {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-faint);
}
.bz-train__dropzone-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

/* ── JSONL Preview ───────────────────────────────────────────── */
.bz-train__jsonl-preview {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}
.bz-train__jsonl-meta {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
}
.bz-train__jsonl-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}
.bz-train__jsonl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--bz-size-meta);
  font-family: var(--bz-font-body);
}
.bz-train__jsonl-table th {
  background: var(--bz-raised);
  color: var(--bz-fg-mid);
  font-weight: 500;
  text-align: left;
  padding: var(--bz-space-1) var(--bz-space-2);
  white-space: nowrap;
  border-bottom: 1px solid var(--bz-border);
}
.bz-train__jsonl-table td {
  padding: var(--bz-space-1) var(--bz-space-2);
  border-bottom: 1px solid var(--bz-border);
  color: var(--bz-fg);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bz-train__jsonl-table tr:last-child td {
  border-bottom: none;
}
.bz-train__jsonl-more {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-low);
  text-align: center;
}
.bz-train__contribution {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}
.bz-train__contribution-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.bz-train__contribution-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}
.bz-train__contribution-title {
  margin: 2px 0 0;
  color: var(--bz-fg);
  font-size: var(--bz-size-body);
  font-weight: 500;
}
.bz-train__contribution-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bz-space-2);
}
.bz-train__contribution-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--bz-space-2);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}
.bz-train__contribution-stat span {
  color: var(--bz-fg);
  font-size: var(--bz-size-body);
}
.bz-train__contribution-stat small {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
}
.bz-train__contribution-kinds {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-1);
}
.bz-train__contribution-alert {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-1);
  padding: var(--bz-space-2);
  background: var(--bz-warning-soft);
  border: 1px solid var(--bz-warning);
  border-radius: var(--bz-r-sm);
  color: var(--bz-warning);
  font-size: var(--bz-size-meta);
  line-height: 1.45;
}
.bz-train__contribution-alert.is-error {
  background: var(--bz-danger-soft);
  border-color: var(--bz-danger);
  color: var(--bz-danger);
}
.bz-train__contribution-alert.is-success {
  background: var(--bz-emerald-soft);
  border-color: var(--bz-emerald-500);
  color: var(--bz-emerald-300);
}
.bz-train__ledger {
  padding-top: var(--bz-space-3);
}
.bz-train__ledger-list {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}
.bz-train__ledger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  padding: var(--bz-space-2);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}
.bz-train__ledger-file {
  display: block;
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
  font-weight: 500;
}
.bz-train__ledger-meta {
  display: block;
  margin-top: 2px;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
}
.bz-train__ledger-quality {
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  white-space: nowrap;
}

/* ── Target Cards ────────────────────────────────────────────── */
.bz-train__targets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--bz-space-2);
}
.bz-train__target-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bz-space-1);
  padding: var(--bz-space-3) var(--bz-space-2);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  cursor: pointer;
  transition: all var(--bz-dur-fast) var(--bz-ease-out);
  text-align: center;
}
.bz-train__target-card:hover {
  border-color: var(--bz-purple-300);
  background: var(--bz-raised);
}
.bz-train__target-card.is-selected {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
  box-shadow: 0 0 0 1px var(--bz-purple-300);
}
.bz-train__target-icon {
  font-size: 28px;
  color: var(--bz-fg-mid);
}
.bz-train__target-card.is-selected .bz-train__target-icon {
  color: var(--bz-purple-300);
}
.bz-train__target-name {
  font-size: var(--bz-size-body);
  font-weight: 500;
  color: var(--bz-fg);
}
.bz-train__target-model {
  font-size: var(--bz-size-micro);
  color: var(--bz-fg-low);
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', monospace;
}
.bz-train__target-desc {
  font-size: var(--bz-size-micro);
  color: var(--bz-fg-faint);
  line-height: 1.4;
}

/* ── Config ──────────────────────────────────────────────────── */
.bz-train__config-group {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-1);
}
.bz-train__label {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
  font-weight: 500;
}
.bz-train__config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-3);
}
.bz-train__config-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--bz-space-3);
}
.bz-train__input,
.bz-train__select {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  padding: var(--bz-space-1) var(--bz-space-2);
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  height: 36px;
  outline: none;
  transition: border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-train__input:focus,
.bz-train__select:focus {
  border-color: var(--bz-purple-300);
}
.bz-train__select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2374748a'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

/* ── Model Pills ─────────────────────────────────────────────── */
.bz-train__model-pills {
  display: flex;
  gap: var(--bz-space-1);
  flex-wrap: wrap;
}
.bz-train__model-pill {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 var(--bz-space-2);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  cursor: pointer;
  transition: all var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-train__model-pill:hover {
  border-color: var(--bz-purple-300);
}
.bz-train__model-pill.is-selected {
  background: var(--bz-purple-soft);
  border-color: var(--bz-purple-300);
  color: var(--bz-purple-300);
  font-weight: 500;
}

/* ── Slider ──────────────────────────────────────────────────── */
.bz-train__slider-row {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
}
.bz-train__slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--bz-border-strong);
  border-radius: 2px;
  outline: none;
}
.bz-train__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--bz-purple-300);
  cursor: pointer;
}
.bz-train__slider-val {
  min-width: 24px;
  text-align: right;
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
}

/* ── Options ─────────────────────────────────────────────────── */
.bz-train__options {
  display: flex;
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-3);
  flex-wrap: wrap;
}
.bz-train__checkbox {
  display: flex;
  align-items: center;
  gap: var(--bz-space-1);
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
  cursor: pointer;
}
.bz-train__checkbox input[type="checkbox"] {
  accent-color: var(--bz-purple-300);
}

/* ── Chips ───────────────────────────────────────────────────── */
.bz-train__chips {
  display: flex;
  gap: var(--bz-space-1);
  flex-wrap: wrap;
}
.bz-train__chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 var(--bz-space-2);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-micro);
  cursor: pointer;
  transition: all var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-train__chip:hover {
  border-color: var(--bz-purple-300);
}
.bz-train__chip.is-selected {
  background: var(--bz-purple-soft);
  border-color: var(--bz-purple-300);
  color: var(--bz-purple-300);
}

/* ── Abliteration Grid ───────────────────────────────────────── */
.bz-train__ablit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--bz-space-2);
}
.bz-train__ablit-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--bz-space-2) var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  cursor: pointer;
  text-align: left;
  transition: all var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-train__ablit-card:hover {
  border-color: var(--bz-purple-300);
}
.bz-train__ablit-card.is-selected {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
}
.bz-train__ablit-name {
  font-size: var(--bz-size-body);
  font-weight: 500;
  color: var(--bz-fg);
}
.bz-train__ablit-repo {
  font-size: 11px;
  color: var(--bz-fg-low);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Pipeline Stages ─────────────────────────────────────────── */
.bz-train__stages {
  display: flex;
  gap: var(--bz-space-1);
  overflow-x: auto;
  padding-bottom: var(--bz-space-2);
}
.bz-train__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bz-space-1);
  min-width: 100px;
  padding: var(--bz-space-2);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  transition: all var(--bz-dur-base) var(--bz-ease-out);
  position: relative;
}
.bz-train__stage:not(:last-child)::after {
  content: '→';
  position: absolute;
  right: -12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--bz-fg-faint);
  font-size: 14px;
  z-index: 2;
}
.bz-train__stage.is-running {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
  animation: bz-pulse 1.5s ease-in-out infinite;
}
.bz-train__stage.is-done {
  border-color: var(--bz-emerald-500);
  background: rgba(16, 185, 129, 0.08);
}
.bz-train__stage.is-error {
  border-color: var(--bz-danger);
  background: var(--bz-danger-soft);
}
.bz-train__stage-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bz-raised);
  font-size: 12px;
  font-weight: 600;
  color: var(--bz-fg-mid);
}
.bz-train__stage.is-done .bz-train__stage-dot {
  background: var(--bz-emerald-500);
  color: white;
}
.bz-train__stage.is-running .bz-train__stage-dot {
  background: var(--bz-purple-500);
  color: white;
}
.bz-train__stage.is-error .bz-train__stage-dot {
  background: var(--bz-danger);
  color: white;
}
.bz-train__stage-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: bz-spin 0.8s linear infinite;
}
.bz-train__stage-name {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--bz-fg-mid);
}
.bz-train__stage.is-done .bz-train__stage-name { color: var(--bz-emerald-500); }
.bz-train__stage.is-running .bz-train__stage-name { color: var(--bz-purple-300); }
.bz-train__stage-desc {
  font-size: 10px;
  color: var(--bz-fg-faint);
  text-align: center;
  line-height: 1.3;
}
.bz-train__stage-detail {
  display: flex;
  align-items: center;
  gap: var(--bz-space-1);
  margin-top: var(--bz-space-2);
  padding: var(--bz-space-2);
  background: var(--bz-canvas);
  border-radius: var(--bz-r-sm);
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
}

/* ── Metrics ─────────────────────────────────────────────────── */
.bz-train__metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--bz-space-2);
}
.bz-train__metric-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--bz-space-3) var(--bz-space-2);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  text-align: center;
}
.bz-train__metric-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--bz-fg);
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', monospace;
}
.bz-train__metric-value.is-good { color: var(--bz-emerald-500); }
.bz-train__metric-value.is-warn { color: var(--bz-warning); }
.bz-train__metric-value.is-bad { color: var(--bz-danger); }
.bz-train__metric-label {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
  font-weight: 500;
}
.bz-train__metric-hint {
  font-size: 10px;
  color: var(--bz-fg-faint);
}
.bz-train__spectral-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--bz-r-pill);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.bz-train__spectral-badge.is-green { background: rgba(16,185,129,0.15); color: var(--bz-emerald-500); }
.bz-train__spectral-badge.is-yellow { background: var(--bz-warning-soft); color: var(--bz-warning); }
.bz-train__spectral-badge.is-red { background: var(--bz-danger-soft); color: var(--bz-danger); }

/* ── Actions ─────────────────────────────────────────────────── */
.bz-train__actions {
  display: flex;
  justify-content: center;
  padding: var(--bz-space-2) 0;
  position: relative;
  z-index: 1;
}

/* ── Progress Card ───────────────────────────────────────────── */
.bz-train__progress-card {
  position: sticky;
  bottom: 0;
  z-index: 10;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  padding: var(--bz-space-3) var(--bz-space-4);
  box-shadow: var(--bz-elev-3);
}
.bz-train__progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--bz-space-2);
}
.bz-train__progress-stage {
  font-size: var(--bz-size-body);
  font-weight: 500;
  color: var(--bz-fg);
}
.bz-train__progress-bar {
  height: 4px;
  background: var(--bz-border-strong);
  border-radius: 2px;
  overflow: hidden;
}
.bz-train__progress-fill {
  height: 100%;
  background: var(--bz-gradient-brand);
  border-radius: 2px;
  transition: width var(--bz-dur-base) var(--bz-ease-out);
  position: relative;
}
.bz-train__progress-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: bz-gradient-sweep 2.4s linear infinite;
}
.bz-train__progress-detail {
  margin-top: var(--bz-space-1);
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-low);
}

/* ── Models Gallery ──────────────────────────────────────────── */
.bz-train__models-section {
  margin-top: var(--bz-space-2);
}
.bz-train__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-5);
  color: var(--bz-fg-faint);
  font-size: var(--bz-size-meta);
}
.bz-train__model-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--bz-space-2);
}
.bz-train__model-card {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  padding: var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  transition: border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-train__model-card:hover {
  border-color: var(--bz-border-strong);
}
.bz-train__model-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.bz-train__model-date {
  font-size: 11px;
  color: var(--bz-fg-faint);
}
.bz-train__model-card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bz-train__model-name {
  font-size: var(--bz-size-body);
  font-weight: 500;
  color: var(--bz-fg);
}
.bz-train__model-loss {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-low);
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', monospace;
}
.bz-train__model-card-actions {
  display: flex;
  align-items: center;
  gap: var(--bz-space-1);
  margin-top: auto;
  padding-top: var(--bz-space-2);
  border-top: 1px solid var(--bz-border);
  flex-wrap: wrap;
}
.bz-train__token-launch {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  padding-top: var(--bz-space-2);
  border-top: 1px solid var(--bz-border);
}
.bz-train__token-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(88px, 0.7fr) minmax(96px, 0.7fr);
  gap: var(--bz-space-1);
}
.bz-train__token-description {
  grid-column: 1 / -1;
  min-height: 76px;
  resize: vertical;
}
.bz-train__token-profile-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-2);
}
.bz-train__upload {
  position: relative;
  overflow: hidden;
}
.bz-train__upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.bz-train__token-note {
  margin: 0;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: 1.4;
}
.bz-train__token-actions {
  display: flex;
  gap: var(--bz-space-1);
  flex-wrap: wrap;
}

/* ── Responsive ──────────────────────────────────────────────── */
@media (max-width: 900px) {
  .bz-train__targets {
    grid-template-columns: repeat(2, 1fr);
  }
  .bz-train__config-grid {
    grid-template-columns: 1fr 1fr;
  }
  .bz-train__config-row {
    grid-template-columns: 1fr;
  }
  .bz-train__metric-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .bz-train__token-grid {
    grid-template-columns: 1fr;
  }
  .bz-train__stages {
    gap: var(--bz-space-1);
  }
  .bz-train__stage {
    min-width: 80px;
    padding: var(--bz-space-1);
  }
}
</style>
