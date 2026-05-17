<template>
  <div class="background"></div>
  <div class="bz-tab-shell">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12 p-5">
          <header class="bz-screen-header">
            <div class="bz-screen-titleblock">
              <p class="bz-eyebrow">Train</p>
              <h1 class="bz-h1 fira-sans-condensed-black-italic">
                <span class="material-symbols-outlined bz-title-icon" aria-hidden="true">chat</span>
                Chat Training
              </h1>
            </div>
          </header>

          <!-- TRAINING PROGRESS -->
          <div
            v-if="training.active"
            class="training-progress-card"
          >
            <div class="training-progress-card__head">
              <span class="training-progress-card__title fira-sans-condensed-black-italic">
                <BonzaiPulse variant="dot" />
                Crafting...
              </span>
              <span class="training-progress-card__pct fira-sans-condensed-black-italic">
                {{ Math.round(training.pct) }}%
              </span>
            </div>
            <BonzaiPulse variant="bar" :percent="Math.max(0, Math.min(100, training.pct))" />
          </div>

          <!-- ACCESS REQUIREMENTS -->
          <AccessRequirements
            ref="accessRef"
            level="LVL6"
            @access-changed="onAccessChanged"
          />

          <!-- ═══════════════════════════════════════════════════════════ -->
          <!-- MAIN TABS: Dataset / Run                                   -->
          <!-- ═══════════════════════════════════════════════════════════ -->
          <ModeChipBar
            v-model="activeTab"
            :items="trainingTabs"
            class="training-tabs"
          />

          <section class="training-rhythm">
            <article v-for="card in trainingStats" :key="card.label" class="training-rhythm__card">
              <span class="material-symbols-outlined" aria-hidden="true">{{ card.icon }}</span>
              <strong class="fira-sans-condensed-black-italic">{{ card.value }}</strong>
              <span>{{ card.label }}</span>
            </article>
          </section>

          <section class="stake-train">
            <div class="stake-train__head">
              <div>
                <p class="bz-eyebrow">Stake-to-train</p>
                <h2 class="bz-h2 fira-sans-condensed-black-italic">Dataset Vault</h2>
              </div>
              <div class="stake-targets" role="group" aria-label="Training target">
                <button
                  v-for="target in trainTargets"
                  :key="target.id"
                  class="stake-target"
                  :class="{ 'is-selected': stake.target === target.id }"
                  @click="stake.target = target.id"
                >
                  <span class="material-symbols-outlined">{{ target.icon }}</span>
                  {{ target.label }}
                </button>
              </div>
            </div>

            <div class="stake-summary">
              <div>
                <strong>{{ stakedItems.length }}</strong>
                <span>staked collectibles</span>
              </div>
              <div>
                <strong>{{ stakeTypeCounts.text }}</strong>
                <span>text</span>
              </div>
              <div>
                <strong>{{ stakeTypeCounts.image }}</strong>
                <span>image</span>
              </div>
              <div>
                <strong>{{ stakeTypeCounts.audio }}</strong>
                <span>audio</span>
              </div>
              <button class="bz-btn bz-btn--primary fira-sans-condensed-black-italic" :disabled="!stakedItems.length" @click="createDatasetFromStake">
                <span class="material-symbols-outlined">dataset_linked</span>
                Build dataset
              </button>
            </div>

            <div class="stake-pool">
              <button
                v-for="item in stakeableCollectibles"
                :key="item.id"
                class="stake-item"
                :class="{ 'is-staked': stake.selectedIds.has(item.id) }"
                @click="toggleStake(item)"
              >
                <span class="material-symbols-outlined">{{ stakeIcon(item.type) }}</span>
                <span>{{ item.question || item.prompt || item.type }}</span>
                <small>{{ item.type }}</small>
              </button>
              <p v-if="!stakeableCollectibles.length" class="training-empty-note">
                No text, image, or audio collectibles yet. Generate or mint content, then stake it into a training dataset here.
              </p>
            </div>
          </section>

          <!-- ═══════════════════════════════════════════════════════════ -->
          <!-- DATASET TAB                                                -->
          <!-- ═══════════════════════════════════════════════════════════ -->
          <div v-if="activeTab === 'dataset'">
            <!-- DATASET STUDIO -->
            <div class="models__activity--payouts mb-5">
              <h3 class="bz-h2 fira-sans-condensed-black-italic mb-3 has-text-left">
                Dataset Studio
              </h3>
              <p class="training-copy has-text-left">
                Write examples that teach tone, format, procedures, and domain knowledge. Each saved entry becomes one JSONL training sample.
              </p>
              <hr />

              <div class="studio-layout">
                <!-- LEFT: Entry list -->
                <div class="studio-sidebar has-text-left">
                  <div class="studio-example-list">
                    <div
                      v-for="ex in studioTextExamples"
                      :key="ex.id"
                      class="studio-example-item"
                      :class="{ 'is-active': studio.selected?.id === ex.id }"
                      @click="studioSelect(ex)"
                    >
                      <span class="studio-example-title">
                        {{ studioItemLabel(ex) }}
                      </span>
                    </div>
                    <div
                      v-if="studioTextExamples.length === 0"
                      class="training-empty-note"
                    >
                      No chat examples yet. Add one and teach the model how to answer.
                    </div>
                  </div>

                  <button
                    class="bz-btn bz-btn--primary fira-sans-condensed-black-italic skill-fullwidth mt-3"
                    @click="studioAddNew"
                  >
                    <span class="material-symbols-outlined mr-1">add</span>
                    Add Example
                  </button>
                </div>

                <!-- RIGHT: Editor -->
                <div class="studio-main has-text-left">
                  <div v-if="studio.selected" class="studio-preview">
                    <!-- Mode toggle -->
                    <div v-if="false" class="control mb-3 has-text-left studio-mode-toggle">
                      <input
                        v-model="studio.editMode"
                        value="game"
                        id="studio_mode_game"
                        type="radio"
                        name="studioMode"
                      />
                      <label for="studio_mode_game" class="radio mr-3">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 18px !important"
                        >
                          sports_esports
                        </span>
                        Game
                      </label>
                      <input
                        v-model="studio.editMode"
                        value="text"
                        id="studio_mode_text"
                        type="radio"
                        name="studioMode"
                      />
                      <label for="studio_mode_text" class="radio">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 18px !important"
                        >
                          article
                        </span>
                        Text
                      </label>
                    </div>

                    <!-- Tier dropdown (game mode only) -->
                    <div v-if="false" class="field mb-3">
                      <label
                        class="label is-small fira-sans-condensed-black-italic"
                      >
                        TIER
                      </label>
                      <div class="studio-tier-select">
                        <select v-model.number="studio.editTier">
                          <option
                            v-for="t in GAME_TIERS"
                            :key="t.id"
                            :value="t.id"
                          >
                            {{ t.id }}. {{ t.name }} — {{ t.desc }}
                          </option>
                        </select>
                      </div>
                    </div>

                    <!-- Game mode: 3 textareas + libraries -->
                    <div v-if="false">
                      <div class="field mb-3 fira-sans-condensed-black-italic">
                        <label class="label is-small">HTML</label>
                        <textarea
                          v-model="studio.editHtml"
                          class="studio-code-area"
                          spellcheck="false"
                          placeholder="HTML markup..."
                          rows="6"
                        ></textarea>
                      </div>
                      <div class="field mb-3">
                        <label
                          class="label is-small fira-sans-condensed-black-italic"
                        >
                          CSS
                        </label>
                        <textarea
                          v-model="studio.editCss"
                          class="studio-code-area"
                          spellcheck="false"
                          placeholder="CSS styles..."
                          rows="6"
                        ></textarea>
                      </div>
                      <div class="field mb-3">
                        <label class="label is-small">JS</label>
                        <textarea
                          v-model="studio.editJs"
                          class="studio-code-area"
                          spellcheck="false"
                          placeholder="JavaScript code..."
                          rows="6"
                        ></textarea>
                      </div>

                      <!-- Libraries -->
                      <div class="field mb-3">
                        <label
                          class="label is-small fira-sans-condensed-black-italic"
                        >
                          LIBRARIES
                        </label>
                        <div
                          class="studio-lib-tags"
                          v-if="studio.editLibraries.length"
                        >
                          <span
                            v-for="(lib, idx) in studio.editLibraries"
                            :key="idx"
                            class="studio-lib-tag"
                          >
                            {{ lib }}
                            <button
                              class="delete is-small"
                              @click="studioRemoveLib(idx)"
                            ></button>
                          </span>
                        </div>
                        <div class="studio-lib-input-row">
                          <input
                            v-model="studio.newLibInput"
                            class="input is-small"
                            type="text"
                            placeholder="e.g. three.js, cannon-es, gsap"
                            @keydown.enter.prevent="studioAddLib"
                          />
                        </div>
                      </div>
                    </div>

                    <!-- Text mode: 1 large textarea -->
                    <div>
                      <div class="field mb-3">
                        <label
                          class="label is-small fira-sans-condensed-black-italic"
                        >
                          TEXT
                        </label>
                        <textarea
                          v-model="studio.editText"
                          class="studio-code-area"
                          spellcheck="false"
                          placeholder="Example:\nUser: Explain our refund policy in one paragraph.\nAssistant: Refunds are available within 14 days when..."
                          rows="16"
                        ></textarea>
                      </div>
                    </div>

                    <div class="field mb-3 mt-4">
                      <label
                        class="label is-small fira-sans-condensed-black-italic"
                      >
                        INSTRUCTION / BEHAVIOR
                      </label>
                      <div class="studio-describe-row">
                        <textarea
                          v-model="studio.editDescription"
                          class="studio-description-area"
                          placeholder="What should the model learn from this example?"
                          rows="3"
                        ></textarea>
                      </div>
                    </div>

                    <div class="studio-actions">
                      <button
                        class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic studio-describe-btn"
                        @click="studioDescribe"
                        :disabled="studio.describing || !studioHasContent"
                      >
                        <span
                          v-if="studio.describing"
                          class="loader mr-1"
                        ></span>
                        Draft Instruction
                      </button>
                      <button
                        class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
                        @click="studioSave"
                      >
                        Save Example
                      </button>
                      <button
                        class="bz-iconbtn bz-iconbtn--danger"
                        @click="studioDelete"
                      >
                        <span class="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>

                  <div v-else class="studio-empty has-text-white">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 128px"
                    >
                      dataset
                    </span>
                    <p class="bz-meta mt-2">Select or add an example.</p>
                  </div>
                </div>
              </div>

              <!-- Bottom bar -->
              <div class="studio-bottom-bar mt-4">
                <span
                  class="is-size-1 has-text-white fira-sans-condensed-black-italic"
                >
                  {{ studioTextExamples.length }} examples
                </span>
                <button
                  class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
                  @click="studioExport"
                  :disabled="studioTextExamples.length === 0"
                >
                  <span class="material-symbols-outlined mr-2">download</span>
                  Export JSONL
                </button>
                <button
                  class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
                  @click="studioCreateDataset"
                  :disabled="studioTextExamples.length === 0 || creatingDataset"
                >
                  <span class="material-symbols-outlined mr-2">dataset</span>
                  Create LLM Dataset
                </button>
              </div>
            </div>

            <!-- UPLOAD DATASET -->
            <div class="models__activity--payouts mb-5">
              <div class="buttons mb-3">
                <button
                  class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
                  @click="showCreateDataset = true"
                >
                  <span class="material-symbols-outlined mr-1">add</span>
                  Create Dataset
                </button>
                <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="loadDatasets">
                  <span class="material-symbols-outlined mr-1">refresh</span>
                  Refresh
                </button>
              </div>
              <hr />

              <!-- Dataset List -->
              <div v-if="datasets.length" class="dataset-list">
                <div v-for="ds in datasets" :key="ds.id" class="dataset-item">
                  <div class="dataset-info">
                    <span class="material-symbols-outlined mr-2">
                      {{ ds.type === "text" ? "description" : "photo_library" }}
                    </span>
                    <div>
                      <strong>{{ ds.name }}</strong>
                      <p class="is-size-7 has-text-grey-light">
                        {{ ds.num_files || ds.num_examples || "?" }}
                        {{ ds.type === "text" ? "examples" : "files" }} •
                        {{ ds.type }}
                      </p>
                    </div>
                  </div>
                  <button
                    class="bz-iconbtn bz-iconbtn--danger"
                    @click.stop="deleteDataset(ds.id)"
                    title="Delete dataset"
                  >
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
              <div v-else class="bz-notice bz-notice--info is-size-6 p-3">
                No LLM datasets yet. Create one from the studio above or upload text files.
              </div>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════ -->
          <!-- RUN TAB                                                    -->
          <!-- ═══════════════════════════════════════════════════════════ -->
          <div v-if="activeTab === 'run'">
            <div class="models__activity--payouts mb-5">
              <!-- TRAINING TYPE SELECTION -->
              <div v-if="false" class="control mb-5 has-text-left">
                <input
                  v-model="trainingType"
                  :value="'llm'"
                  id="type_llm"
                  type="radio"
                  name="trainingType"
                  checked
                  :disabled="!hasAccess"
                />
                <label for="type_llm" class="radio mr-3">
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 32px !important"
                  >
                    chat
                  </span>
                  Chat Model
                  <span class="skill-chip skill-chip--info ml-1">LLaMa</span>
                </label>
                <input
                  v-model="trainingType"
                  :value="'sdxl'"
                  id="type_sdxl"
                  type="radio"
                  name="trainingType"
                  :disabled="!hasAccess"
                />
                <label for="type_sdxl" class="radio">
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 32px !important"
                  >
                    image
                  </span>
                  Image Model
                  <span class="skill-chip skill-chip--warning ml-1">SDXL</span>
                </label>
              </div>

              <!-- DATASET PICKER -->
              <div class="field has-text-left mb-5">
                <label class="label fira-sans-condensed-black-italic is-size-5">
                  <span
                    class="material-symbols-outlined mr-1"
                    style="vertical-align: middle"
                  >
                    dataset
                  </span>
                  Training Dataset
                </label>
                <div v-if="filteredDatasets.length" class="dataset-list">
                  <div
                    v-for="ds in filteredDatasets"
                    :key="ds.id"
                    class="dataset-item"
                    :class="{ 'is-selected': selectedDataset?.id === ds.id }"
                    @click="selectedDataset = ds"
                  >
                    <div class="dataset-info">
                      <span class="material-symbols-outlined mr-2">
                        {{
                          ds.type === "text" ? "description" : "photo_library"
                        }}
                      </span>
                      <div>
                        <strong>{{ ds.name }}</strong>
                        <p class="is-size-7 has-text-grey-light">
                          {{ ds.num_files || ds.num_examples || "?" }}
                          {{ ds.type === "text" ? "examples" : "files" }} •
                          {{ ds.type }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="has-text-grey-light is-size-6 p-3">
                  No text datasets found.
                  <a
                    @click.prevent="activeTab = 'dataset'"
                    class="has-text-info"
                    style="cursor: pointer"
                  >
                    Go to Dataset tab
                  </a>
                  to create one.
                </div>
              </div>
            </div>

            <!-- LLM TRAINING CONFIGURATION -->
            <div
              v-if="trainingType === 'llm'"
              class="models__activity--payouts mb-5"
            >
              <h3 class="fira-sans-condensed-black-italic is-size-3 mb-3">
                <span class="material-symbols-outlined mr-2 is-size-2">
                  tune
                </span>
                LoRA Configuration
              </h3>

              <div class="field has-text-left mt-5">
                <label class="label fira-sans-condensed-black-italic is-size-5">
                  Base Model
                </label>
                <div class="select skill-fullwidth is-medium mb-5 is-large">
                  <select v-model="llmConfig.base_model">
                    <option value="llama-3.2-1b">LLaMa 3.2 1B (Fastest)</option>
                    <option value="llama-3.2-3b">
                      LLaMa 3.2 3B (Balanced)
                    </option>
                    <option value="llama-3.1-8b">
                      LLaMa 3.1 8B (Best Quality)
                    </option>
                  </select>
                </div>
              </div>

              <div class="columns has-text-left mb-5">
                <div class="column">
                  <div class="field">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      Epochs: {{ llmConfig.epochs }}
                    </label>
                    <input
                      class="slider skill-fullwidth p-4"
                      type="range"
                      v-model.number="llmConfig.epochs"
                      min="1"
                      max="10"
                      step="1"
                    />
                  </div>
                </div>
                <div class="column">
                  <div class="field">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      Batch Size
                    </label>
                    <div class="select skill-fullwidth is-large">
                      <select v-model.number="llmConfig.batch_size">
                        <option :value="1">1 (Low VRAM)</option>
                        <option :value="2">2</option>
                        <option :value="4">4 (Default)</option>
                        <option :value="8">8 (High VRAM)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div class="columns has-text-left mb-5">
                <div class="column">
                  <div class="field">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      LoRA Rank: {{ llmConfig.lora_r }}
                    </label>
                    <input
                      class="slider skill-fullwidth p-4"
                      type="range"
                      v-model.number="llmConfig.lora_r"
                      min="4"
                      max="64"
                      step="4"
                    />
                  </div>
                </div>
                <div class="column">
                  <div class="field">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      LoRA Alpha: {{ llmConfig.lora_alpha }}
                    </label>
                    <input
                      class="slider skill-fullwidth p-4"
                      type="range"
                      v-model.number="llmConfig.lora_alpha"
                      min="8"
                      max="128"
                      step="8"
                    />
                  </div>
                </div>
              </div>

              <div class="field has-text-left">
                <label class="label fira-sans-condensed-black-italic is-size-5">
                  Learning Rate
                </label>
                <input
                  class="input is-large"
                  type="number"
                  v-model.number="llmConfig.learning_rate"
                  step="0.00001"
                />
              </div>

              <div class="field mt-5">
                <label class="checkbox fira-sans-condensed-black-italic">
                  <input
                    class="mr-2"
                    type="checkbox"
                    v-model="llmConfig.use_4bit"
                  />
                  4-bit Quantization
                </label>
              </div>
            </div>

            <!-- SDXL TRAINING CONFIGURATION -->
            <div
              v-if="false"
              class="models__activity--payouts mb-5 has-text-left"
            >
              <h3 class="fira-sans-condensed-black-italic is-size-3 mb-3">
                <span class="material-symbols-outlined is-size-2 mr-2">
                  tune
                </span>
                LoRA Configuration
              </h3>

              <div class="field mb-5 mt-5">
                <label class="label fira-sans-condensed-black-italic is-size-5">
                  Instance Prompt
                  <span class="has-text-danger">*</span>
                </label>
                <input
                  class="input is-large"
                  type="text"
                  v-model="sdxlConfig.instance_prompt"
                  placeholder="A photo of sks person"
                />
                <p class="help">
                  Use a unique token like "sks" to identify your subject.
                </p>
              </div>

              <div class="field mb-5">
                <label class="label fira-sans-condensed-black-italic is-size-5">
                  Class Prompt (Optional)
                </label>
                <input
                  class="input is-large"
                  type="text"
                  v-model="sdxlConfig.class_prompt"
                  placeholder="A photo of a person"
                />
                <p class="help">
                  General class description for prior preservation.
                </p>
              </div>

              <div class="columns">
                <div class="column">
                  <div class="field">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      Training Steps: {{ sdxlConfig.epochs }}
                    </label>
                    <input
                      class="slider skill-fullwidth p-4"
                      type="range"
                      v-model.number="sdxlConfig.epochs"
                      min="100"
                      max="2000"
                      step="100"
                    />
                  </div>
                </div>
                <div class="column">
                  <div class="field mb-5">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      Resolution
                    </label>
                    <div class="select skill-fullwidth is-large">
                      <select v-model.number="sdxlConfig.resolution">
                        <option :value="512">512 (Fast)</option>
                        <option :value="768">768</option>
                        <option :value="1024">1024 (Best)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div class="columns">
                <div class="column">
                  <div class="field">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      LoRA Rank: {{ sdxlConfig.lora_rank }}
                    </label>
                    <input
                      class="slider skill-fullwidth p-4"
                      type="range"
                      v-model.number="sdxlConfig.lora_rank"
                      min="4"
                      max="128"
                      step="4"
                    />
                  </div>
                </div>
                <div class="column">
                  <div class="field">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      Learning Rate
                    </label>
                    <input
                      class="input is-large"
                      type="number"
                      v-model.number="sdxlConfig.learning_rate"
                      step="0.00001"
                    />
                  </div>
                </div>
              </div>

              <div class="field fira-sans-condensed-black-italic is-size-5">
                <label class="checkbox">
                  <input
                    type="checkbox"
                    v-model="sdxlConfig.use_8bit_adam"
                    class="mr-2"
                  />
                  Use 8-bit Adam
                </label>
              </div>
            </div>

            <div class="models__activity--payouts">
              <!-- START TRAINING BUTTON -->
              <button
                class="bz-btn bz-btn--primary bz-btn--lg fira-sans-condensed-black-italic"
                @click="startTraining"
                :disabled="!canStartTraining || training.active"
              >
                <span class="material-symbols-outlined mr-2 is-size-2">
                  exercise
                </span>
                Start Chat Fine-tune
              </button>
            </div>

            <!-- TRAINED MODELS -->
            <div
              v-if="trainedModels.length"
              class="bz-notice bz-notice--success mb-5 mt-5"
            >
              <h3 class="fira-sans-condensed-black-italic is-size-4 mb-3">
                <span class="material-symbols-outlined mr-2">verified</span>
                Trained Models
              </h3>
              <div
                v-for="model in trainedModels"
                :key="model.id"
                class="trained-model-item"
              >
                <div class="model-info">
                  <span class="skill-chip mr-2">
                    {{ model.type === "llm_lora" ? "🧠 LLM" : "🎨 SDXL" }}
                  </span>
                  <div>
                    <strong>{{ model.id }}</strong>
                    <p class="is-size-7">
                      {{ model.base_model }} • Loss:
                      {{ model.final_loss?.toFixed(4) }}
                    </p>
                    <input
                      v-model="model.hf_repo"
                      class="input is-small mt-1"
                      type="text"
                      placeholder="HuggingFace repo (e.g. username/model-name)"
                      style="max-width: 320px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: var(--bz-fg); font-size: 11px;"
                    />
                  </div>
                </div>
                <div class="buttons">
                  <button
                    class="bz-btn bz-btn--sm is-info"
                    @click="exportModel(model)"
                    title="Export model"
                  >
                    <span class="material-symbols-outlined">download</span>
                  </button>
                  <button
                    class="bz-btn bz-btn--sm is-warning"
                    @click="mintModelNFT(model)"
                    title="Mint as NFT"
                  >
                    <span class="material-symbols-outlined">token</span>
                  </button>
                  <button
                    class="bz-btn bz-btn--sm is-link"
                    @click="launchModelToken(model)"
                    :disabled="!model.contentTokenId"
                    :title="model.contentTokenId ? 'Issue ERC-20 Token' : 'Mint as NFT first'"
                  >
                    <span class="material-symbols-outlined">currency_exchange</span>
                  </button>
                  <button
                    class="bz-btn bz-btn--sm is-danger"
                    @click="deleteModel(model.id)"
                    title="Delete model"
                  >
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- TRAINING ERROR -->
            <div
              v-if="training.error"
              class="bz-notice bz-notice--danger"
              style="margin-bottom: 1rem"
            >
              <strong>Training failed:</strong>
              {{ training.error }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE DATASET MODAL (LVL Style - Purple) -->
    <div
      v-if="showCreateDataset"
      class="dataset-modal-overlay"
      @click.self="showCreateDataset = false"
    >
      <div class="dataset-modal">
        <div class="has-text-right">
          <BzCloseButton size="md" aria-label="Close" @click="showCreateDataset = false" />
        </div>

        <div class="dataset-modal-header has-text-center">
          <span class="material-symbols-outlined is-size-1">dataset</span>
          <h2 class="fira-sans-condensed-black-italic is-size-3">
            Create Training Dataset
          </h2>
        </div>

        <div class="dataset-modal-body has-text-left">
          <!-- Dataset Type Preview -->
          <div class="dataset-type-preview">
            <div class="dataset-modal-status mb-4">
              <span
                class="dataset-status-pill fira-sans-condensed-black-italic is-size-5"
              >
                {{
                  "TEXT DATASET"
                }}
              </span>
            </div>
            <div class="dataset-type-tags">
              <span class="dataset-tag fira-sans-condensed-black-italic">
                LLM
              </span>
              <span
                v-if="newDataset.files.length"
                class="dataset-tag dataset-tag--count fira-sans-condensed-black-italic"
              >
                {{ newDataset.files.length }} files
              </span>
            </div>
          </div>

          <!-- Form Section -->
          <div class="dataset-form-section">
            <div class="dataset-field mb-5">
              <label class="dataset-label fira-sans-condensed-black-italic">
                Dataset Name
              </label>
              <input
                class="dataset-input"
                type="text"
                v-model="newDataset.name"
                placeholder="My Training Dataset"
              />
            </div>

            <div class="dataset-field mb-5">
              <label class="dataset-label fira-sans-condensed-black-italic">
                Dataset Type
              </label>
              <div class="dataset-static-type">Text for chat fine-tuning</div>
            </div>

            <div class="dataset-field">
              <label class="dataset-label fira-sans-condensed-black-italic">
                Upload
                Text Files
              </label>
              <div class="dataset-upload-zone">
                <input
                  class="file-input"
                  type="file"
                  :accept="
                    '.txt,.md,.json,.jsonl'
                  "
                  multiple
                  @change="handleDatasetFiles"
                  id="dataset-file-input"
                />
                <label for="dataset-file-input" class="dataset-upload-label">
                  <span class="material-symbols-outlined is-size-2">
                    upload_file
                  </span>
                  <span class="fira-sans-condensed-black-italic">
                    Click to select
                    text files
                  </span>
                  <span class="dataset-upload-hint">
                    {{
                      "Supports .txt, .md, .json, .jsonl"
                    }}
                  </span>
                </label>
              </div>
            </div>

            <!-- Selected Files Preview -->
            <div v-if="newDataset.files.length" class="dataset-files-preview">
              <label class="dataset-label fira-sans-condensed-black-italic">
                Selected Files
              </label>
              <div class="dataset-file-tags">
                <span
                  v-for="(file, idx) in newDataset.files"
                  :key="idx"
                  class="dataset-file-tag"
                >
                  {{ file.name }}
                  <button
                    class="delete is-small"
                    @click="removeDatasetFile(idx)"
                  ></button>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="dataset-modal-footer mb-5">
          <button
            class="bz-btn bz-btn--primary dataset-primary-btn fira-sans-condensed-black-italic"
            @click="createDataset"
            :disabled="
              !newDataset.name || !newDataset.files.length || creatingDataset
            "
          >
            <span v-if="creatingDataset" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">add_circle</span>
            Create Dataset
          </button>
          <button
            class="bz-btn bz-btn--destructive is-medium"
            @click="showCreateDataset = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Mint Modal -->
  <MintModal
    v-if="mintTarget"
    :visible="showMintModal"
    :inference-type="mintTarget.inferenceType"
    :inference-id="mintTarget.inferenceId"
    :content="mintTarget.content"
    :content-type="mintTarget.contentType"
    :prompt="mintTarget.prompt"
    :generation="mintTarget.generation"
    @close="showMintModal = false"
    @minted="onMintComplete"
  />

  <!-- Token Launch Modal -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="showTokenLaunchModal"
        class="token-launch-overlay"
        @click.self="!isLaunchingToken && (showTokenLaunchModal = false)"
      >
        <div class="token-launch-modal">
          <div class="token-launch-header p-5">
            <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white">
              <span class="material-symbols-outlined mr-2 is-size-2">currency_exchange</span>
              Issue Model Token
            </h2>
            <BzCloseButton size="md" aria-label="Close" @click="showTokenLaunchModal = false" />
          </div>

          <div class="token-launch-body p-5">
            <div v-if="!tokenLaunchResult?.success">
              <p class="has-text-white-ter mb-4" style="font-size: 13px;">
                Launch an ERC-20 token for your fine-tuned model on Base.
                96% of supply goes to Uniswap V2 LP (burned), 4% to you.
              </p>

              <div class="field mb-4">
                <label class="label" style="color: var(--bz-fg-mid); font-size: 12px;">Token Name</label>
                <input v-model="tokenName" class="input" type="text" maxlength="64"
                  style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: var(--bz-fg);" />
              </div>

              <div class="field mb-4">
                <label class="label" style="color: var(--bz-fg-mid); font-size: 12px;">Token Symbol</label>
                <input v-model="tokenSymbol" class="input" type="text" maxlength="10"
                  style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: var(--bz-fg); text-transform: uppercase;" />
              </div>

              <div class="field mb-5">
                <label class="label" style="color: var(--bz-fg-mid); font-size: 12px;">ETH for Liquidity</label>
                <input v-model="tokenEthAmount" class="input" type="number" step="0.001" min="0.01"
                  style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: var(--bz-fg);" />
                <p class="help" style="color: rgba(255,255,255,0.4);">Min 0.01 ETH. LP tokens are burned (unruggable).</p>
              </div>

              <div v-if="tokenLaunchResult?.error" class="bz-notice bz-notice--danger mb-4">
                {{ tokenLaunchResult.error }}
              </div>

              <div class="has-text-centered">
                <button
                  class="bz-btn bz-btn--primary is-large"
                  @click="executeTokenLaunch"
                  :disabled="isLaunchingToken || !tokenName || !tokenSymbol"
                  :class="{ 'bz-btn--running': isLaunchingToken }"
                >
                  <span class="material-symbols-outlined mr-2">rocket_launch</span>
                  Launch Token
                </button>
              </div>
            </div>

            <!-- Success -->
            <div v-else class="has-text-centered">
              <span class="material-symbols-outlined" style="font-size: 48px; color: var(--bz-emerald-500);">check_circle</span>
              <h3 class="has-text-white mt-3 mb-4">Token Launched!</h3>
              <div style="text-align: left;" class="mb-4">
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
                  <span style="color: var(--bz-fg-low); font-size: 12px;">Symbol</span>
                  <span class="has-text-white" style="font-size: 13px; font-weight: 600;">${{ tokenLaunchResult.symbol }}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
                  <span style="color: var(--bz-fg-low); font-size: 12px;">Token</span>
                  <a :href="`https://basescan.org/token/${tokenLaunchResult.tokenAddress}`" target="_blank"
                    style="color: var(--bz-info); font-size: 12px; font-family: monospace;">
                    {{ tokenLaunchResult.tokenAddress?.slice(0, 10) }}...
                  </a>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                  <span style="color: var(--bz-fg-low); font-size: 12px;">Trade</span>
                  <a :href="`https://app.uniswap.org/swap?chain=base&outputCurrency=${tokenLaunchResult.tokenAddress}`"
                    target="_blank" style="color: var(--bz-info); font-size: 12px;">
                    Uniswap
                    <span class="material-symbols-outlined" style="font-size: 12px;">open_in_new</span>
                  </a>
                </div>
              </div>
              <button class="bz-btn bz-btn--success skill-fullwidth" @click="showTokenLaunchModal = false">Done</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import {
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import { v4 as uuid } from "uuid";
import axios from "axios";
import { io } from "socket.io-client";
import AccessRequirements from "./AccessRequirements.vue";
import MintModal from "./MintModal.vue";
import BonzaiPulse from "./BonzaiPulse.vue";
import BzCloseButton from "./BzCloseButton.vue";
import ModeChipBar from "./generative/ModeChipBar.vue";
import { fineTuneTokenService } from "../services/fineTuneToken.service.js";
import { allInferences } from "../stores/inferenceStore.js";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_TRAINING = `${API_BASE}/training`;

export default {
  name: "GenerativeTraining",
  components: { AccessRequirements, MintModal, BonzaiPulse, BzCloseButton, ModeChipBar },
  setup() {
    // Main tabs
    const activeTab = ref("dataset");
    const trainingTabs = [
      { value: "dataset", label: "Dataset", icon: "dataset" },
      { value: "run", label: "Fine-tune", icon: "model_training" },
    ];
    const trainTargets = [
      { id: "qwen-0.8b", label: "Qwen 0.8B", icon: "chat" },
      { id: "sdxl", label: "SDXL", icon: "image" },
      { id: "ace-step", label: "ACE-Step", icon: "graphic_eq" },
    ];
    const stake = reactive({
      target: "qwen-0.8b",
      selectedIds: new Set(),
    });

    // Training type selection
    const trainingType = ref("llm"); // production path: chat/LLM fine-tuning

    // Datasets
    const datasets = ref([]);
    const selectedDataset = ref(null);
    const showCreateDataset = ref(false);
    const creatingDataset = ref(false);
    const newDataset = reactive({
      name: "",
      type: "text",
      files: [],
      fileContents: [],
    });

    // Trained models
    const trainedModels = ref([]);

    // LLM Config
    const llmConfig = reactive({
      base_model: "llama-3.2-1b",
      epochs: 3,
      batch_size: 4,
      learning_rate: 0.0002,
      lora_r: 16,
      lora_alpha: 32,
      use_4bit: true,
      max_seq_length: 2048,
    });

    // SDXL Config
    const sdxlConfig = reactive({
      instance_prompt: "",
      class_prompt: "",
      epochs: 500,
      batch_size: 1,
      learning_rate: 0.0001,
      lora_rank: 32,
      resolution: 1024,
      use_8bit_adam: true,
    });

    // Training state
    const training = reactive({
      active: false,
      type: null,
      id: null,
      stage: "",
      pct: 0,
      epoch: 0,
      total_epochs: 0,
      loss: null,
      eta: null,
      error: null,
    });

    // ─────────────────────────────────────────────────────────────
    // Dataset Studio
    // ─────────────────────────────────────────────────────────────
    // Game tier definitions (imported concept — keep in sync with dataset-studio.js)
    const GAME_TIERS = [
      {
        id: 1,
        name: "Primitives",
        desc: "Scene setup, camera, renderer, basic meshes, lighting",
      },
      {
        id: 2,
        name: "Materials & Shaders",
        desc: "PBR materials, custom ShaderMaterial, GLSL, post-processing",
      },
      {
        id: 3,
        name: "Geometry & Terrain",
        desc: "Procedural geometry, heightmaps, infinite terrain, LOD",
      },
      {
        id: 4,
        name: "Models & Assets",
        desc: "GLTF/GLB loading, Blender workflow, animations, textures",
      },
      {
        id: 5,
        name: "Physics",
        desc: "Cannon-es/Rapier integration, collision, rigid bodies, vehicles",
      },
      {
        id: 6,
        name: "Controls & Input",
        desc: "FPS/orbit/pointer-lock, keyboard, gamepad, mobile touch",
      },
      {
        id: 7,
        name: "Animation & Particles",
        desc: "Skeletal animation, tweens (GSAP), particle systems, trails",
      },
      {
        id: 8,
        name: "Game Systems",
        desc: "State machines, entity component, inventory, health, scoring",
      },
      {
        id: 9,
        name: "UI & Audio",
        desc: "HUD overlays, menus, spatial audio, CSS3D",
      },
      {
        id: 10,
        name: "Full Games",
        desc: "Complete mini-games combining 3+ tiers above",
      },
    ];

    const studio = reactive({
      examples: [],
      selected: null,
      editMode: "text",
      editTier: 1,
      editHtml: "",
      editCss: "",
      editJs: "",
      editText: "",
      editDescription: "",
      editLibraries: [],
      newLibInput: "",
      describing: false,
    });

    // Access control
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (access) => {
      hasAccess.value = access;
    };

    // Socket
    const trainingSocket = ref(null);

    // Computed
    const filteredDatasets = computed(() => {
      return datasets.value.filter((ds) => ds.type === "text");
    });

    const studioTextExamples = computed(() => {
      return studio.examples.filter((ex) => (ex.mode || "text") === "text");
    });

    const trainingStats = computed(() => {
      const activeModels = trainedModels.value.filter((m) => m.type === "llm_lora").length;
      return [
        { icon: "deployed_code", value: String(stakedItems.value.length), label: "staked items" },
        { icon: "dataset", value: String(filteredDatasets.value.length), label: "LLM datasets" },
        { icon: "model_training", value: String(activeModels), label: "fine-tunes" },
      ];
    });

    const stakeableCollectibles = computed(() =>
      allInferences.value
        .filter((item) => ["text", "image", "audio"].includes(item.type))
        .slice(0, 18)
    );
    const stakedItems = computed(() =>
      stakeableCollectibles.value.filter((item) => stake.selectedIds.has(item.id))
    );
    const stakeTypeCounts = computed(() =>
      stakedItems.value.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, { text: 0, image: 0, audio: 0 })
    );

    const canStartTraining = computed(() => {
      if (!hasAccess.value) return false;
      if (!selectedDataset.value) return false;
      if (trainingType.value === "sdxl" && !sdxlConfig.instance_prompt)
        return false;
      return true;
    });

    function stakeIcon(type) {
      return type === "image" ? "image" : type === "audio" ? "graphic_eq" : "article";
    }

    function toggleStake(item) {
      if (stake.selectedIds.has(item.id)) stake.selectedIds.delete(item.id);
      else stake.selectedIds.add(item.id);
    }

    function createDatasetFromStake() {
      const items = stakedItems.value;
      if (!items.length) return;
      const name = `Staked ${stake.target} dataset ${new Date().toLocaleDateString()}`;
      const samples = items.map((item) => ({
        id: item.id,
        type: item.type,
        prompt: item.question || "",
        answer: item.answer || null,
        model: item.model || item.pipeline || "",
        nft: item.nft || null,
        metadata: {
          createdAt: item.createdAt,
          hardware: item.hardware || null,
          elapsed: item.elapsed || null,
          tokensPerSecond: item.tokensPerSecond || null,
          source: item.source || null,
          networkMode: item.networkMode || null,
        },
      }));
      const ds = {
        id: uuid(),
        name,
        type: stake.target === "qwen-0.8b" ? "text" : stake.target,
        target_model: stake.target,
        source: "stake-to-train",
        num_examples: samples.length,
        samples,
        created_at: new Date().toISOString(),
      };
      datasets.value = [ds, ...datasets.value];
      selectedDataset.value = ds;
      activeTab.value = "run";
    }

    // Socket setup
    const setupTrainingSocket = () => {
      trainingSocket.value = io(WS_TRAINING, {
        transports: ["polling", "websocket"],
        forceNew: true,
      });

      trainingSocket.value.on("connect", () => {
        console.log("[training] Socket connected");
      });

      trainingSocket.value.on("training_progress", (data) => {
        if (training.id && data.training_id !== training.id) return;

        training.epoch = data.epoch || 0;
        training.total_epochs = data.total_epochs || 0;
        training.loss = data.loss;
        training.pct = data.progress || 0;
        training.stage = data.stage || "training";
        training.eta = data.eta;
      });

      trainingSocket.value.on("training_complete", async (data) => {
        if (training.id && data.training_id !== training.id) return;

        training.active = false;
        training.pct = 100;
        training.stage = "complete";

        // Reload trained models
        await loadTrainedModels();
      });

      trainingSocket.value.on("training_error", (data) => {
        if (training.id && data.training_id !== training.id) return;

        training.active = false;
        training.error = data.error || "Unknown error";
      });
    };

    // API calls
    const loadDatasets = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/training/datasets`);
        datasets.value = data.datasets || [];
      } catch (e) {
        console.error("Failed to load datasets:", e);
      }
    };

    const loadTrainedModels = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/training/models`);
        trainedModels.value = data.models || [];
      } catch (e) {
        console.error("Failed to load trained models:", e);
      }
    };

    const handleDatasetFiles = async (event) => {
      const files = Array.from(event.target.files || []);
      newDataset.files = files;
      newDataset.fileContents = [];

      for (const file of files) {
        const reader = new FileReader();
        const content = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.readAsDataURL(file);
        });
        newDataset.fileContents.push({
          filename: file.name,
          content_base64: content,
        });
      }
    };

    const removeDatasetFile = (idx) => {
      newDataset.files.splice(idx, 1);
      newDataset.fileContents.splice(idx, 1);
    };

    const createDataset = async () => {
      if (!newDataset.name || !newDataset.fileContents.length) return;

      creatingDataset.value = true;
      try {
        const { data } = await axios.post(`${API_BASE}/training/datasets`, {
          name: newDataset.name,
          type: "text",
          files: newDataset.fileContents,
        });

        if (data.ok) {
          datasets.value.push(data.dataset);
          selectedDataset.value = data.dataset;
          showCreateDataset.value = false;

          // Reset form
          newDataset.name = "";
          newDataset.files = [];
          newDataset.fileContents = [];
        }
      } catch (e) {
        console.error("Failed to create dataset:", e);
        alert(
          "Failed to create dataset: " + (e.response?.data?.error || e.message),
        );
      } finally {
        creatingDataset.value = false;
      }
    };

    const deleteDataset = async (datasetId) => {
      if (!confirm("Delete this dataset?")) return;

      try {
        await axios.delete(`${API_BASE}/training/datasets/${datasetId}`);
        datasets.value = datasets.value.filter((d) => d.id !== datasetId);
        if (selectedDataset.value?.id === datasetId) {
          selectedDataset.value = null;
        }
      } catch (e) {
        console.error("Failed to delete dataset:", e);
      }
    };

    const startTraining = async () => {
      if (!canStartTraining.value) return;

      training.active = true;
      training.type = trainingType.value;
      training.error = null;
      training.pct = 0;
      training.stage = "initializing";

      const endpoint =
        trainingType.value === "llm"
          ? `${API_BASE}/training/llm/start`
          : `${API_BASE}/training/sdxl/start`;

      const payload =
        trainingType.value === "llm"
          ? {
              dataset_id: selectedDataset.value.id,
              ...llmConfig,
            }
          : {
              dataset_id: selectedDataset.value.id,
              ...sdxlConfig,
            };

      try {
        const { data, status } = await axios.post(endpoint, payload, {
          validateStatus: () => true,
        });

        if (status === 202) {
          training.id = data.training_id;
          training.total_epochs =
            trainingType.value === "llm" ? llmConfig.epochs : sdxlConfig.epochs;
        } else {
          training.active = false;
          training.error = data.error || `Failed to start training (${status})`;
        }
      } catch (e) {
        training.active = false;
        training.error = e.message || "Network error";
      }
    };

    const exportModel = async (model) => {
      try {
        const { data } = await axios.post(
          `${API_BASE}/training/models/${model.id}/export`,
        );

        if (data.model_path) {
          const result = await window.electronAPI?.saveModel?.(
            `bonzai_${model.type}_${model.id}.zip`,
            data.model_path,
          );

          if (result?.success) {
            alert(`Model exported to: ${result.path}`);
          }
        }
      } catch (e) {
        console.error("Export failed:", e);
        alert("Export failed: " + e.message);
      }
    };

    const deleteModel = async (modelId) => {
      if (!confirm("Delete this trained model?")) return;

      try {
        await axios.delete(`${API_BASE}/training/models/${modelId}`);
        trainedModels.value = trainedModels.value.filter(
          (m) => m.id !== modelId,
        );
      } catch (e) {
        console.error("Failed to delete model:", e);
      }
    };

    // ─────────────────────────────────────────────────────────────
    // NFT Minting
    // ─────────────────────────────────────────────────────────────
    const showMintModal = ref(false);
    const mintTarget = ref(null);

    const mintModelNFT = async (model) => {
      const modelLabel = model.type === 'llm_lora' ? 'LLM' : 'SDXL';
      mintTarget.value = {
        inferenceType: 'training',
        inferenceId: model.id,
        content: JSON.stringify({
          id: model.id,
          type: model.type,
          base_model: model.base_model,
          final_loss: model.final_loss,
          dataset_id: model.dataset_id,
          created_at: model.created_at,
          hf_repo: model.hf_repo || null,
        }),
        contentType: 'application/json',
        prompt: `Fine-tuned ${modelLabel} model: ${model.id}`,
        generation: {
          type: 'training',
          model: model.base_model,
          timestamp: Date.now(),
          hfRepo: model.hf_repo || null,
        },
      };
      showMintModal.value = true;
    };

    const onMintComplete = (result) => {
      // Store contentTokenId on the model for token issuance
      if (result.tokenId && mintTarget.value) {
        const model = trainedModels.value.find(m => m.id === mintTarget.value.inferenceId);
        if (model) {
          model.contentTokenId = result.tokenId;
          model.ipfsHash = result.transactionId;
        }
      }
    };

    // ─────────────────────────────────────────────────────────────
    // Token Issuance (ERC-20 for fine-tuned models)
    // ─────────────────────────────────────────────────────────────
    const showTokenLaunchModal = ref(false);
    const tokenLaunchTarget = ref(null);
    const tokenName = ref('');
    const tokenSymbol = ref('');
    const tokenEthAmount = ref('0.01');
    const isLaunchingToken = ref(false);
    const tokenLaunchResult = ref(null);

    const launchModelToken = (model) => {
      if (!model.contentTokenId) {
        alert('Mint this model as an NFT first before issuing a token.');
        return;
      }
      tokenLaunchTarget.value = model;
      tokenName.value = `BonzAI Fine-Tune: ${model.id}`;
      tokenSymbol.value = `BZ${model.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase()}`;
      tokenLaunchResult.value = null;
      showTokenLaunchModal.value = true;
    };

    const executeTokenLaunch = async () => {
      if (!tokenLaunchTarget.value) return;
      isLaunchingToken.value = true;
      tokenLaunchResult.value = null;

      try {
        const result = await fineTuneTokenService.launchFineTuneToken(
          tokenLaunchTarget.value.contentTokenId,
          tokenName.value,
          tokenSymbol.value,
          tokenLaunchTarget.value.ipfsHash || '',
          tokenEthAmount.value,
        );

        tokenLaunchResult.value = result;
        if (result.success) {
          tokenLaunchTarget.value.tokenAddress = result.tokenAddress;
          tokenLaunchTarget.value.pairAddress = result.pairAddress;
        }
      } catch (e) {
        tokenLaunchResult.value = { success: false, error: e.message };
      } finally {
        isLaunchingToken.value = false;
      }
    };

    // Watch training type to update dataset type for new datasets
    watch(trainingType, (newType) => {
      newDataset.type = newType === "llm" ? "text" : "image";
    });

    // (studio.selected synced via studioSelect method)

    // ─────────────────────────────────────────────────────────────
    // Studio methods
    // ─────────────────────────────────────────────────────────────
    const loadStudioExamples = async () => {
      try {
        const res = await window.electronAPI?.synthExamplesList();
        if (res?.ok) {
          studio.examples = res.examples;
        }
      } catch (e) {
        console.error("[Studio] Failed to load examples:", e);
      }
    };

    const studioHasContent = computed(() => {
      if (studio.editMode === "text") {
        return !!(studio.editText && studio.editText.trim());
      }
      // game mode
      return !!(
        (studio.editHtml && studio.editHtml.trim()) ||
        (studio.editCss && studio.editCss.trim()) ||
        (studio.editJs && studio.editJs.trim())
      );
    });

    const studioItemLabel = (ex) => {
      const tierBadge = ex.mode !== "text" && ex.tier ? `[T${ex.tier}] ` : "";
      if (ex.description && ex.description.trim()) {
        return tierBadge + ex.description.substring(0, 36);
      }
      // Fallback: first 36 chars of content
      if (ex.mode === "text" && ex.text) {
        return ex.text.substring(0, 40) || "Empty";
      }
      const code = ex.js || ex.html || ex.css || "";
      return tierBadge + (code.substring(0, 36) || "Empty");
    };

    const studioSelect = (ex) => {
      studio.selected = ex;
      studio.editMode = ex.mode || "game";
      studio.editTier = ex.tier || 1;
      studio.editHtml = ex.html || "";
      studio.editCss = ex.css || "";
      studio.editJs = ex.js || "";
      studio.editText = ex.text || "";
      studio.editDescription = ex.description || "";
      studio.editLibraries = ex.libraries ? [...ex.libraries] : [];
      studio.newLibInput = "";
    };

    const studioAddNew = () => {
      const newEx = {
        id: uuid(),
        mode: "text",
        html: "",
        css: "",
        js: "",
        text: "",
        description: "",
        libraries: [],
        createdAt: new Date().toISOString(),
      };
      studio.examples.unshift(newEx);
      studioSelect(newEx);
    };

    const studioSave = async () => {
      if (!studio.selected) return;
      studio.selected.mode = studio.editMode;
      if (studio.editMode !== "text") {
        studio.selected.tier = studio.editTier;
      }
      studio.selected.html = studio.editHtml;
      studio.selected.css = studio.editCss;
      studio.selected.js = studio.editJs;
      studio.selected.text = studio.editText;
      studio.selected.description = studio.editDescription;
      studio.selected.libraries = [...studio.editLibraries];
      await window.electronAPI?.synthExampleSave(
        JSON.parse(JSON.stringify(studio.selected)),
      );
      await loadStudioExamples();
    };

    const studioDelete = async () => {
      if (!studio.selected) return;
      if (!confirm("Delete this example?")) return;
      await window.electronAPI?.synthExampleDelete(studio.selected.id);
      studio.selected = null;
      studio.editMode = "text";
      studio.editTier = 1;
      studio.editHtml = "";
      studio.editCss = "";
      studio.editJs = "";
      studio.editText = "";
      studio.editDescription = "";
      studio.editLibraries = [];
      studio.newLibInput = "";
      await loadStudioExamples();
    };

    const studioDescribe = async () => {
      if (!studioHasContent.value) return;
      studio.describing = true;
      try {
        const res = await window.electronAPI?.synthDescribe({
          mode: studio.editMode,
          tier: studio.editTier,
          html: studio.editHtml,
          css: studio.editCss,
          js: studio.editJs,
          text: studio.editText,
        });
        if (res?.ok) {
          studio.editDescription = res.description;
          // Merge auto-detected libraries (don't lose manually added ones)
          if (res.libraries && res.libraries.length > 0) {
            const existing = new Set(
              studio.editLibraries.map((l) => l.toLowerCase()),
            );
            for (const lib of res.libraries) {
              if (!existing.has(lib.toLowerCase())) {
                studio.editLibraries.push(lib);
                existing.add(lib.toLowerCase());
              }
            }
          }
        } else {
          alert("Describe failed: " + (res?.error || "Unknown error"));
        }
      } catch (e) {
        alert("Describe failed: " + e.message);
      } finally {
        studio.describing = false;
      }
    };

    const studioAddLib = () => {
      const lib = studio.newLibInput.trim();
      if (!lib) return;
      const exists = studio.editLibraries.some(
        (l) => l.toLowerCase() === lib.toLowerCase(),
      );
      if (!exists) {
        studio.editLibraries.push(lib);
      }
      studio.newLibInput = "";
    };

    const studioRemoveLib = (idx) => {
      studio.editLibraries.splice(idx, 1);
    };

    const studioExport = async () => {
      const name = prompt("Dataset name:", "Dataset Studio Export");
      if (!name) return;
      try {
        const res = await window.electronAPI?.synthExport({ name });
        if (res?.ok) {
          alert(
            `Dataset exported!\n\n${res.metadata.num_examples} examples\nPath: ${res.path}`,
          );
          await loadDatasets();
        } else {
          alert("Export failed: " + (res?.error || "Unknown"));
        }
      } catch (e) {
        alert("Export failed: " + e.message);
      }
    };

    const base64FromString = (value) => {
      const bytes = new TextEncoder().encode(value);
      let binary = "";
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      return btoa(binary);
    };

    const studioCreateDataset = async () => {
      if (!studioTextExamples.value.length) return;
      const fallback = `chat-dataset-${new Date().toISOString().slice(0, 10)}`;
      const name = prompt("Dataset name:", fallback);
      if (!name) return;

      creatingDataset.value = true;
      try {
        await studioSave();
        const lines = studioTextExamples.value
          .map((ex) => {
            const text = [
              ex.description ? `Instruction: ${ex.description}` : "",
              ex.text || "",
            ].filter(Boolean).join("\n\n").trim();
            return text ? JSON.stringify({ text }) : "";
          })
          .filter(Boolean)
          .join("\n");

        const { data } = await axios.post(`${API_BASE}/training/datasets`, {
          name,
          type: "text",
          files: [
            {
              filename: `${name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase() || "dataset"}.jsonl`,
              content_base64: base64FromString(lines),
            },
          ],
        });

        if (data.ok) {
          datasets.value.push(data.dataset);
          selectedDataset.value = data.dataset;
          activeTab.value = "run";
        }
      } catch (e) {
        console.error("Failed to create studio dataset:", e);
        alert("Failed to create dataset: " + (e.response?.data?.error || e.message));
      } finally {
        creatingDataset.value = false;
      }
    };

    // Lifecycle
    onMounted(async () => {
      setupTrainingSocket();
      await loadDatasets();
      await loadTrainedModels();
      await loadStudioExamples();
    });

    onBeforeUnmount(() => {
      if (trainingSocket.value?.connected) {
        trainingSocket.value.disconnect();
      }
    });

    return {
      activeTab,
      trainingTabs,
      trainTargets,
      stake,
      stakeableCollectibles,
      stakedItems,
      stakeTypeCounts,
      stakeIcon,
      toggleStake,
      createDatasetFromStake,
      trainingType,
      datasets,
      filteredDatasets,
      selectedDataset,
      showCreateDataset,
      creatingDataset,
      newDataset,
      trainedModels,
      llmConfig,
      sdxlConfig,
      training,
      trainingStats,
      canStartTraining,
      loadDatasets,
      handleDatasetFiles,
      removeDatasetFile,
      createDataset,
      deleteDataset,
      startTraining,
      exportModel,
      deleteModel,
      mintModelNFT,
      showMintModal,
      mintTarget,
      onMintComplete,
      // Token issuance
      showTokenLaunchModal,
      tokenLaunchTarget,
      tokenName,
      tokenSymbol,
      tokenEthAmount,
      isLaunchingToken,
      tokenLaunchResult,
      launchModelToken,
      executeTokenLaunch,
      // Access control
      accessRef,
      hasAccess,
      onAccessChanged,
      // Studio
      GAME_TIERS,
      studio,
      studioTextExamples,
      studioHasContent,
      studioItemLabel,
      studioSelect,
      studioAddNew,
      studioSave,
      studioDelete,
      studioDescribe,
      studioAddLib,
      studioRemoveLib,
      studioExport,
      studioCreateDataset,
    };
  },
};
</script>

<style scoped>
.models__deployment-install {
  overflow-y: auto;
  padding: var(--bz-space-5) var(--bz-space-6);
  flex: 1;
  min-height: 0;
  width: 100%;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
}

.models__deployment-install > .columns {
  display: block;
  margin: 0;
}

.models__deployment-install > .columns > .column {
  width: 100%;
  padding: 0 !important;
}

.models__activity--payouts {
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r) !important;
  background: var(--bz-card);
  width: 100%;
}

.models__activity--payouts > .columns {
  margin: 0;
}

.models__activity--payouts > .columns > .column {
  padding: 0;
}

h1.bz-h1 {
  font-size: var(--bz-size-h1) !important;
  line-height: var(--bz-line-tight);
  text-align: left;
  margin: 0;
}

.bz-screen-header .bz-title-icon {
  color: var(--bz-purple-300);
  font-size: 28px !important;
}

.bz-screen-header .bz-eyebrow {
  margin: 0;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  line-height: 1.2;
  text-align: left;
  font-weight: 400;
}

.bz-screen-header .bz-screen-subtitle {
  margin: 0;
  max-width: 60ch;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: var(--bz-line-body);
  text-align: left;
}

h2.bz-h2,
h3.bz-h2 {
  font-size: var(--bz-size-h2) !important;
  line-height: var(--bz-line-tight);
  color: var(--bz-fg);
  margin: 0;
}

.training-copy {
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-body);
  line-height: var(--bz-line-body);
}

.training-rhythm {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bz-space-3);
}

.training-rhythm__card {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: var(--bz-space-2) var(--bz-space-3);
  align-items: center;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
}

.training-rhythm__card .material-symbols-outlined {
  grid-row: span 2;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--bz-accent);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
}

.training-rhythm__card strong {
  color: var(--bz-fg);
  font-size: 1.6rem;
  line-height: 1;
}

.training-rhythm__card span:last-child {
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.training-empty-note {
  padding: var(--bz-space-3);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.dataset-static-type {
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
  color: var(--bz-fg);
}

@media (max-width: 900px) {
  .training-rhythm {
    grid-template-columns: 1fr;
  }
}

.training-progress-card {
  margin-bottom: 1rem;
  padding: 14px 16px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg);
}

.training-progress-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.training-progress-card__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.training-progress-card__pct {
  color: var(--bz-fg);
  font-size: 1.45rem;
  line-height: 1;
}

.training-progress-card :deep(.bz-pulse-wrap--bar) {
  margin-top: 12px;
}

.training-tabs {
  margin-bottom: var(--bz-space-5);
}

.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: url("../assets/bonzai_robots.webp") no-repeat;
  background-size: cover;  overflow: hidden;
}

.models__deployment {
  position: relative;
  background: transparent;
  padding: 0 !important;
  margin: 0 !important;
}

h1,
h3 {
  color: var(--bz-fg);
  text-align: left;
}

h1 {
  font-size: 64px;
  text-align: right;
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

.label {
  color: var(--bz-fg);
  font-weight: 600;
}

.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
}

input[type="radio"] {
  display: none;
}

input[type="radio"] + label {
  padding: 6px 16px 12px;
  color: var(--bz-fg-faint) !important;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

input[type="radio"]:checked + label {
  color: var(--bz-fg) !important;
  border: 1px solid var(--bz-fg) !important;
  background: var(--bz-purple-soft) !important;
}

.notification.is-dark {
  background: rgba(30, 30, 40, 0.8);
  border: 1px solid var(--bz-border);
}

.notification.is-warning {
  background: rgba(255, 221, 87, 0.15);
  color: var(--bz-fg);
  border: 1px solid rgba(255, 221, 87, 0.3);
}

.notification.is-success {
  background: var(--bz-emerald-soft);
  color: var(--bz-fg);
  border: 1px solid var(--bz-emerald-soft);
}

.dataset-list {
  max-height: 200px;
  overflow-y: auto;
}

.dataset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dataset-item:hover {
  background: var(--bz-border);
}

.dataset-item.is-selected {
  background: var(--bz-purple-soft);
  border-color: var(--bz-border-brand);
}

.dataset-info {
  display: flex;
  align-items: center;
}

.trained-model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
}

.model-info {
  display: flex;
  align-items: center;
}

.slider {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 5px;
  background: var(--bz-border-strong);
  outline: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bz-purple-500);
  cursor: pointer;
}

.input,
.select select {
  background: var(--bz-border);
  border-color: var(--bz-fg-faint);
  color: var(--bz-fg);
}

.input::placeholder {
  color: var(--bz-fg-low);
}

.checkbox {
  color: var(--bz-fg);
}

.bz-modal-panel {
  background: var(--bz-card);
  color: var(--bz-fg);
}

.bz-modal-head,
.bz-modal-foot {
  background: rgba(30, 30, 40, 0.9);
  border-color: var(--bz-border);
}

.bz-modal-title {
  color: var(--bz-fg);
}

.bz-modal-body {
  background: var(--bz-card);
}

.bz-modal-body .label {
  color: var(--bz-fg);
}

.bz-modal-body .input,
.bz-modal-body .select select {
  background: var(--bz-border);
  border-color: var(--bz-fg-faint);
  color: var(--bz-fg);
}

.file-cta,
.file-name {
  background: var(--bz-border);
  border-color: var(--bz-fg-faint);
  color: var(--bz-fg);
}

.help {
  color: var(--bz-fg-mid);
}

.loader {
  width: 16px;
  height: 16px;
  border: 2px solid #fff;
  border-bottom-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: rotation 1s linear infinite;
}

@keyframes rotation {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Dataset Modal (LVL Style - Purple) */
.dataset-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bz-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dataset-modal {
  width: 92%;
  max-width: 520px;
  background: #0a0a0f;
  border: 1px solid var(--bz-border);
  border-radius: 16px;
  padding: 24px;
  position: relative;
  color: var(--bz-fg);
}

.dataset-modal-header {
  text-align: center;
  margin-bottom: 18px;
}

.dataset-modal-header .material-symbols-outlined {
  color: var(--bz-purple-500);
  display: block;
  margin-bottom: 8px;
}

.dataset-modal-badge {
  display: inline-block;
  padding: 6px 16px;
  background: linear-gradient(135deg, var(--bz-purple-500) 0%, var(--bz-purple-700) 100%);
  border-radius: 20px;
  font-weight: 900;
  color: var(--bz-on-accent);
  margin-bottom: 10px;
}

.dataset-modal-header h2 {
  margin: 0;
  color: var(--bz-fg);
}

.dataset-modal-body {
  margin-bottom: 16px;
}

.dataset-type-preview {
  background: var(--bz-canvas);
  border-radius: 10px;
  padding: 1.5em;
  border: 1px solid var(--bz-purple-soft);
  margin-bottom: 16px;
  text-align: center;
}

.dataset-modal-status {
  margin-bottom: 10px;
}

.dataset-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border-radius: 999px;
  border: 2px solid rgba(147, 51, 234, 0.6);
  color: var(--bz-purple-300);
  font-size: 14px;
  font-weight: 600;
  background: rgba(147, 51, 234, 0.1);
  text-transform: uppercase;
}

.dataset-type-tags {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.dataset-tag {
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--bz-card);
  color: var(--bz-fg-mid);
  font-size: 12px;
}

.dataset-tag.dataset-tag--count {
  background: rgba(16, 185, 129, 0.15);
  color: var(--bz-emerald-500);
  font-weight: 600;
}

.dataset-form-section {
  background: var(--bz-canvas);
  border-radius: 10px;
  padding: 1.5em;
  border: 1px solid var(--bz-border);
  margin-bottom: 16px;
}

.dataset-field {
  margin-bottom: 16px;
}

.dataset-field:last-child {
  margin-bottom: 0;
}

.dataset-label {
  display: block;
  color: var(--bz-fg);
  margin-bottom: 8px;
  font-size: 14px;
}

.dataset-input,
.dataset-select {
  width: 100%;
  padding: 12px 14px;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border-strong);
  border-radius: 8px;
  color: var(--bz-fg);
  font-size: 16px;
  transition: border-color 0.2s ease;
}

.dataset-input:focus,
.dataset-select:focus {
  outline: none;
  border-color: var(--bz-purple-500);
}

.dataset-input::placeholder {
  color: var(--bz-fg-low);
}

.dataset-select-wrapper {
  position: relative;
}

.dataset-select {
  appearance: none;
  cursor: pointer;
}

.dataset-select option {
  background: var(--bz-card);
  color: var(--bz-fg);
}

.dataset-upload-zone {
  position: relative;
  border: 2px dashed var(--bz-purple-soft);
  border-radius: 10px;
  padding: 2em;
  text-align: center;
  transition: all 0.2s ease;
  cursor: pointer;
}

.dataset-upload-zone:hover {
  border-color: var(--bz-purple-500);
  background: rgba(147, 51, 234, 0.05);
}

.dataset-upload-zone .file-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.dataset-upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--bz-fg-mid);
  cursor: pointer;
}

.dataset-upload-label .material-symbols-outlined {
  color: var(--bz-purple-500);
}

.dataset-upload-hint {
  font-size: 12px;
  color: var(--bz-fg-low);
}

.dataset-files-preview {
  margin-top: 16px;
}

.dataset-file-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.dataset-file-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(147, 51, 234, 0.15);
  border: 1px solid rgba(147, 51, 234, 0.3);
  border-radius: 6px;
  color: var(--bz-purple-300);
  font-size: 12px;
}

.dataset-preview-box {
  background: rgba(147, 51, 234, 0.08);
  border: 1px solid var(--bz-purple-soft);
  border-radius: 10px;
  padding: 1em 1.25em;
}

.dataset-preview-box p:first-child {
  color: var(--bz-purple-500);
  margin-bottom: 8px;
  font-size: 13px;
}

.dataset-preview-text {
  color: var(--bz-fg);
  font-size: 14px;
  line-height: 1.5;
}

.dataset-preview-text strong {
  color: var(--bz-purple-300);
}

.dataset-modal-footer {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--bz-card);
}

.dataset-modal-footer .button {
  flex: 1;
  cursor: pointer;
}

.dataset-primary-btn {
  background: linear-gradient(135deg, var(--bz-purple-500) 0%, var(--bz-purple-700) 100%);
  border: none;
  color: var(--bz-on-accent);
}

.dataset-primary-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--bz-purple-300) 0%, var(--bz-purple-500) 100%);
}

.dataset-primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ──────────────────────────────────────────────────────────────
   Dataset Studio
   ────────────────────────────────────────────────────────────── */

.studio-layout {
  display: flex;
  gap: 16px;
  min-height: 400px;
}

.studio-sidebar {
  width: 240px;
  flex-shrink: 0;
}

.studio-main {
  flex: 1;
  min-width: 0;
}

.studio-example-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  background: var(--bz-scrim-soft);
}

.studio-example-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--bz-fg-mid);
  border-bottom: 1px solid var(--bz-canvas);
  transition: background 0.15s ease;
}

.tabs a {
  color: var(--bz-fg-faint);
  border-color: var(--bz-border);
}

.tabs a:hover {
  color: var(--bz-fg);
  border-color: var(--bz-fg);
}

.tabs li.is-active a {
  color: var(--bz-warning);
  border-color: var(--bz-warning);
}

.studio-example-item:hover {
  background: var(--bz-canvas);
}

.studio-example-item.is-active {
  background: var(--bz-purple-soft);
  color: var(--bz-fg);
}

.studio-example-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-mode-toggle {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--bz-card);
  margin-bottom: 12px;
}

.studio-mode-toggle input[type="radio"] + label {
  padding: 4px 12px 6px;
  font-size: 13px;
}

.studio-tier-select select {
  width: 100%;
  padding: 6px 10px;
  background: var(--bz-scrim);
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  color: var(--bz-fg-mid);
  font-size: 12px;
  cursor: pointer;
  appearance: auto;
}

.studio-tier-select select:focus {
  outline: none;
  border-color: var(--bz-purple-500);
}

.studio-tier-select select option {
  background: var(--bz-card);
  color: var(--bz-fg);
}

.studio-preview {
  padding: 12px;
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  background: var(--bz-scrim-soft);
}

.studio-code-area {
  width: 100%;
  min-height: 200px;
  background: var(--bz-scrim);
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  color: var(--bz-fg-mid);
  font-family: "SF Mono", "Fira Code", "Consolas", monospace;
  font-size: 12px;
  padding: 10px;
  resize: vertical;
  line-height: 1.5;
}

.studio-code-area:focus {
  outline: none;
  border-color: var(--bz-purple-500);
}

.studio-lib-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.studio-lib-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(147, 51, 234, 0.2);
  border: 1px solid var(--bz-purple-soft);
  border-radius: 4px;
  color: var(--bz-purple-100);
  font-size: 12px;
  font-family: "SF Mono", "Fira Code", "Consolas", monospace;
}

.studio-lib-input-row {
  display: flex;
  gap: 6px;
}

.studio-lib-input-row .input {
  flex: 1;
}

.studio-describe-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.studio-description-area {
  flex: 1;
  background: var(--bz-scrim);
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  color: var(--bz-fg-mid);
  font-size: 13px;
  padding: 10px;
  resize: vertical;
  line-height: 1.5;
}

.studio-description-area:focus {
  outline: none;
  border-color: var(--bz-purple-500);
}

.studio-describe-btn {
  flex-shrink: 0;
  align-self: flex-end;
}

.studio-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.studio-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  text-align: center;
}

.studio-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-top: 1px solid var(--bz-border);
}

.stake-train {
  margin: var(--bz-space-5) 0;
  padding: var(--bz-space-5);
  border: 1px solid var(--bz-border-brand);
  background:
    linear-gradient(135deg, var(--bz-purple-soft), transparent 55%),
    var(--bz-panel);
}
.stake-train__head,
.stake-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
}
.stake-targets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.stake-target,
.stake-item {
  border: 1px solid var(--bz-border);
  background: var(--bz-card);
  color: var(--bz-fg-mid);
  cursor: pointer;
}
.stake-target {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  font-size: var(--bz-size-meta);
}
.stake-target.is-selected,
.stake-item.is-staked {
  color: var(--bz-fg);
  border-color: var(--bz-border-brand);
  box-shadow: inset 0 0 0 1px var(--bz-border-brand);
}
.stake-summary {
  margin: var(--bz-space-4) 0;
  padding: var(--bz-space-3);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
}
.stake-summary div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stake-summary strong {
  color: var(--bz-purple-300);
  font-size: 20px;
}
.stake-summary span {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}
.stake-pool {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--bz-space-3);
}
.stake-item {
  min-height: 86px;
  display: grid;
  grid-template-columns: 24px 1fr;
  grid-template-rows: 1fr auto;
  align-items: start;
  gap: 6px var(--bz-space-2);
  padding: var(--bz-space-3);
  text-align: left;
}
.stake-item span:not(.material-symbols-outlined) {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.stake-item small {
  grid-column: 2;
  color: var(--bz-fg-low);
  text-transform: uppercase;
  font-size: var(--bz-size-micro);
}

@keyframes move {
  0% {
    transform: scale(1.1);
    transform-origin: bottom left;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1.1);
    transform-origin: bottom left;
  }
}

/* Token Launch Modal */
.token-launch-overlay {
  position: fixed;
  inset: 0;
  background: var(--bz-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10003;
}

.token-launch-modal {
  width: 90%;
  max-width: 480px;
  border: 1px solid var(--bz-border);
  border-radius: 16px;
  overflow: hidden;
}

.token-launch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--bz-scrim);
  border-bottom: 1px solid var(--bz-border);
}

.token-launch-header h2 {
  display: flex;
  align-items: center;
  margin: 0;
}

.token-launch-body {
  padding: 20px;
}

/* Fade transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
