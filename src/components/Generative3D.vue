<template>
  <div class="background"></div>

  <div class="bz-tab-shell">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12">
          <header class="bz-screen-header">
            <div class="bz-screen-titleblock">
              <p class="bz-eyebrow">{{ $t('create.eyebrow') }}</p>
                <h1 class="bz-h1 fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined bz-title-icon"
                    aria-hidden="true"
                  >
                    3d_rotation
                  </span>
                  {{ $t('create.threeTitle') }}
                </h1>
            </div>
            <div class="bz-screen-actions">
                <button v-if="workspaceTab==='generate' && creationMode==='level' && lastGeneratedCode" type="button" class="bz-btn bz-btn--primary" :disabled="editorBusy" @click="openLevelEditor"><span class="material-symbols-outlined" aria-hidden="true">edit</span>{{ $t('levelEditor.open') }}</button>
                <button
                  v-if="workspaceTab === 'generate'"
                  class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
                  @click="showExamples = !showExamples"
                  title="View examples"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    {{ showExamples ? "visibility_off" : "lightbulb" }}
                  </span>
                  {{ showExamples ? "Hide" : "Examples" }}
                </button>
                <button
                  v-if="workspaceTab === 'generate'"
                  class="bz-btn bz-btn--agent-cta fira-sans-condensed-black-italic"
                  :disabled="isLoading || !lastGeneratedCode"
                  @click="clearScene"
                  title="Clear scene"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    delete_sweep
                  </span>
                  Clear
                </button>
            </div>
          </header>

          <nav class="three-workspace-tabs" aria-label="3D workspace">
            <button
              v-for="tab in workspaceTabs"
              :key="tab.id"
              type="button"
              :class="{ 'is-active': workspaceTab === tab.id }"
              :aria-current="workspaceTab === tab.id ? 'page' : undefined"
              :disabled="editorBusy"
              @click="setWorkspaceTab(tab.id)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">{{ tab.icon }}</span>
              {{ tab.label }}
            </button>
          </nav>

          <ExampleLibrary v-if="showExamples && workspaceTab === 'generate'" :initial-kind="creationMode" @select="useExample" />
          <div class="three-controls-layout" v-if="workspaceTab === 'generate'">
          <div class="models__activity--payouts">
          <!-- GENERATION PROGRESS -->
          <div v-if="isLoading && workspaceTab === 'generate'" class="three-progress-card">
            <div class="three-progress-card__head">
              <div>
                <span class="three-progress-card__title fira-sans-condensed-black-italic">
                  <BonzaiPulse variant="dot" />
                  {{ stream.phase || 'Initializing' }}
                </span>
                <p v-if="stream.subtitle" class="three-progress-card__subtitle">
                  {{ stream.subtitle }}
                </p>
              </div>
              <span class="three-progress-card__pct fira-sans-condensed-black-italic">
                {{ streamProgress }}%
              </span>
            </div>
            <BonzaiPulse variant="bar" :percent="streamProgress" />
            <div class="three-progress-card__meta">
              <span>
                  {{ stream.tokenCount }} / {{ stream.maxTokens }} tokens
              </span>
              <span
                  :title="stream.tokenCount === 0
                    ? 'Computing attention over the system prompt before generation starts'
                    : 'True generation rate (excludes prefill)'"
                >
                  <template v-if="stream.tokenCount === 0">
                    warming up…
                  </template>
                  <template v-else>
                    {{ stream.tokensPerSec || '–' }} tok/s
                  </template>
              </span>
              <span>
                  {{ Math.round(stream.elapsedMs / 1000) }}s
              </span>
              <span
                  v-if="stream.prefillMs > 200"
                  title="Time the model spent computing attention over the prompt before the first token streamed back"
                >
                  prefill {{ (stream.prefillMs / 1000).toFixed(1) }}s
              </span>
            </div>

            <div class="three-progress-card__tip" :title="stream.tip">
              <BonzaiPulse variant="dot" />
              <span>
                {{ stream.tip || 'Preparing the 3D scene...' }}
              </span>
            </div>

            <div v-if="stream.preview" class="three-progress-card__preview">
              <div class="three-progress-card__preview-header">
                <span class="material-symbols-outlined" aria-hidden="true">terminal</span>
                <span>Live blueprint feed</span>
              </div>
              <pre
                ref="streamPreviewEl"
                class="three-progress-card__preview-body"
              >{{ stream.preview }}<span class="three-progress-card__cursor">▌</span></pre>
            </div>
          </div>


            <div class="columns">
              <div class="column is-12">
                <DownloadRequirement category="3d"
                  v-if="needsDownload || downloads.active"
                  :items="missingRequiredModels"
                  :active="downloads.active"
                  cancellable
                  :cancelling="isCancellingDownloads"
                  @cancel="cancelActiveDownloads"
                  :progress="downloads.total_progress || downloads.progress || 0"
                  :tasks="downloadTaskList"
                  :error="downloads.status === 'failed' ? $t('rcDownloads.downloadFailed') : ''"
                  @download="downloadAllModels"
                />

                <div class="bz-3d-mode" role="group" aria-label="Creation type">
                  <button
                    type="button"
                    :class="{ 'is-selected': creationMode === 'object' }"
                    :aria-pressed="creationMode === 'object'"
                    @click="creationMode = 'object'"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">deployed_code</span>
                    Object
                  </button>
                  <button
                    type="button"
                    :class="{ 'is-selected': creationMode === 'level' }"
                    :aria-pressed="creationMode === 'level'"
                    @click="creationMode = 'level'; objectInputMode = 'prompt'"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">landscape</span>
                    Level
                  </button>
                  <button type="button" :class="{ 'is-selected': creationMode === 'game' }" :aria-pressed="creationMode === 'game'" @click="creationMode = 'game'; objectInputMode = 'prompt'">
                    <span class="material-symbols-outlined" aria-hidden="true">sports_esports</span> Game
                  </button>
                </div>

                <div v-if="creationMode === 'object'" class="object-input-mode" role="group" aria-label="Object input">
                  <button type="button" :class="{ 'is-selected': objectInputMode === 'prompt' }" :aria-pressed="objectInputMode === 'prompt'" @click="objectInputMode = 'prompt'; removeReferenceImage()">
                    <span class="material-symbols-outlined">text_fields</span>Prompt
                  </button>
                  <button type="button" :class="{ 'is-selected': objectInputMode === 'image' }" :aria-pressed="objectInputMode === 'image'" @click="objectInputMode = 'image'">
                    <span class="material-symbols-outlined">add_photo_alternate</span>Prompt + image
                  </button>
                </div>

                <div v-if="creationMode === 'object' && objectInputMode === 'image'" class="bz-3d-reference">
                  <label v-if="!referenceImage" class="bz-3d-reference__picker">
                    <input type="file" accept="image/*" @change="onReferenceImagePicked" />
                    <span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span>
                    <span>
                      <strong>Reference image</strong>
                      <small>Use one isolated object with a clear silhouette.</small>
                    </span>
                  </label>
                  <div v-else class="bz-3d-reference__preview">
                    <img :src="referenceImage.dataUrl" alt="3D reconstruction reference" />
                    <span class="bz-3d-reference__name">{{ referenceImage.name }}</span>
                    <BzCloseButton
                      size="sm"
                      aria-label="Remove reference image"
                      @click="removeReferenceImage"
                    />
                  </div>
                </div>

                <GenerativeInput
                  v-model="form.prompt"
                  :min-height="64"
                  :max-height="96"
                  :placeholder="creationMode === 'game' ? 'Describe the game loop, controls and objective...' : creationMode === 'level'
                      ? 'Describe a traversable environment or level...'
                    : objectInputMode === 'image'
                      ? 'Describe how the object should be reconstructed or styled...'
                      : 'Describe a 3D object...'"
                  :submit-label="creationMode === 'game' ? 'Generate game' : creationMode === 'level' ? 'Generate level' : objectInputMode === 'image' ? 'Reconstruct object' : 'Generate object'"
                  running-label="Building"
                  :running="isLoading"
                  :disabled="!canSubmitWithAccess || !isModel"
                  shortcut-hint="⌘⏎"
                  @submit="onSubmit"
                />

                <!-- REFINE MODE -->
                <div
                  v-if="lastGeneratedCode && !isLoading"
                  class="refine-section mt-3"
                >
                  <div class="field has-addons">
                    <div class="control is-expanded">
                      <input
                        class="bz-field-input"
                        v-model="refinePrompt"
                        placeholder="Refine: make it taller, add fire particles, change material to ice..."
                        :disabled="isLoading"
                        @keydown.enter.exact.prevent="onRefine"
                      />
                    </div>
                    <div class="control">
                      <button
                        class="bz-btn bz-btn--success fira-sans-condensed-black-italic"
                        @click="onRefine"
                        :disabled="isLoading || !refinePrompt.trim()"
                      >
                        <span class="material-symbols-outlined mr-1">tune</span>
                        Refine
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ENVIRONMENT CONTROLS -->
          <section v-if="workspaceTab === 'generate'" class="bz-3d-advanced mt-5" aria-label="Scene controls">
            <div class="environment-controls bz-3d-environment">
            <div class="bz-3d-control-group">
              <div class="bz-3d-control-head"><span class="material-symbols-outlined">view_in_ar</span><span>Presentation</span></div>
              <div class="bz-3d-selector" role="group" aria-label="Presentation">
                <button v-for="mode in ['studio', 'environment']" :key="mode" type="button" class="bz-3d-option" :class="{ 'is-selected': presentation === mode }" :aria-pressed="presentation === mode" @click="presentation = mode">
                  {{ mode === 'studio' ? 'Studio' : 'Environment' }}
                </button>
              </div>
            </div>
            <div class="bz-3d-control-group bz-3d-control-group--lighting">
              <div class="bz-3d-control-head">
                <span class="material-symbols-outlined">wb_sunny</span>
                <span>Lighting</span>
              </div>
              <div class="bz-3d-selector" role="group" aria-label="Lighting preset">
                <button
                  v-for="preset in lightingPresets"
                  :key="preset.id"
                  class="bz-3d-option"
                  :class="{ 'is-selected': currentTime === preset.id }"
                  :aria-pressed="currentTime === preset.id"
                  @click="setTimeOfDay(preset.id)"
                  :title="preset.label"
                >
                  <span class="material-symbols-outlined">{{ preset.class }}</span>
                  <span>{{ preset.label }}</span>
                </button>
              </div>
            </div>

            <div class="bz-3d-control-group bz-3d-control-group--weather">
              <div class="bz-3d-control-head">
                <span class="material-symbols-outlined">cloud</span>
                <span>Weather</span>
              </div>
              <div class="bz-3d-selector" role="group" aria-label="Weather preset">
                <button
                  v-for="weather in weatherOptions"
                  :key="weather.id"
                  class="bz-3d-option"
                  :class="{ 'is-selected': currentWeather === weather.id }"
                  :aria-pressed="currentWeather === weather.id"
                  @click="presentation = 'environment'; setWeather(weather.id)"
                  :title="weather.label"
                >
                  <span class="material-symbols-outlined">{{ weather.class }}</span>
                  <span>{{ weather.label }}</span>
                </button>
              </div>
            </div>

            <div class="bz-3d-control-group bz-3d-control-group--performance">
              <div class="bz-3d-control-head">
                <span class="material-symbols-outlined">speed</span>
                <span>Performance</span>
              </div>
              <div class="bz-3d-selector" role="group" aria-label="Performance preset">
                <button
                  v-for="preset in performancePresets"
                  :key="preset.id"
                  class="bz-3d-option"
                  :class="{ 'is-selected': currentPerformance === preset.id }"
                  :aria-pressed="currentPerformance === preset.id"
                  @click="setPerformance(preset.id)"
                  :title="preset.label"
                >
                  <span class="material-symbols-outlined">{{ preset.class }}</span>
                  <span>{{ preset.label }}</span>
                </button>
              </div>
            </div>
            </div>
          </section>

          </div>
          <!-- VIEWER -->
          <div class="viewer-container" :class="{ 'is-build': workspaceTab === 'build' }">
            <section v-if="workspaceTab === 'build' && buildEditorReady && !isPlaytesting" class="build-director" aria-label="Level editor" @click.stop>
              <div class="build-director__levels">
                <input v-model="gameProject.title" :disabled="editorBusy" class="build-director__title" aria-label="Game title" placeholder="Untitled game" />
                <div class="build-level-tabs" role="tablist" aria-label="Levels">
                  <button v-for="(level, index) in orderedProjectLevels" :key="level.id" type="button" :class="{ 'is-active': forgeLevelId === level.id }" :disabled="editorBusy" @click="selectBuildLevel(level.id)">
                    <span class="build-level-tabs__index">{{ index + 1 }}</span>{{ level.title }}
                  </button>
                  <button class="build-level-tabs__add" type="button" title="Generate a level" :disabled="editorBusy" @click="createLevelFromBuild"><span class="material-symbols-outlined" aria-hidden="true">add</span></button>
                </div>
                <div v-if="activeLevel" class="build-director__order build-director__actions">
                  <button type="button" title="Move level earlier" :disabled="editorBusy" @click="moveActiveLevel(-1)"><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span></button>
                  <button type="button" title="Move level later" :disabled="editorBusy" @click="moveActiveLevel(1)"><span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
                  <button type="button" title="Remove level" :disabled="editorBusy" @click="removeActiveLevel"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
                  <button class="build-action" type="button" :disabled="editorBusy || !canTokenizeProject" @click="startPlaytest"><span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>Playtest</button>
                  <button class="build-action is-publish" type="button" :disabled="editorBusy || !canTokenizeProject" @click="tokenizeGameProject"><span class="material-symbols-outlined" aria-hidden="true">publish</span>Publish</button>
                </div>
              </div>
              <details class="build-gameplay"><summary>{{ $t('levelEditor.gameplay') }}</summary>
              <div v-if="activeLevel" class="build-marker-fields">
                <fieldset v-for="type in ['start','finish']" :key="type" :disabled="editorBusy">
                  <legend>{{ $t(`levelEditor.${type}`) }}</legend>
                  <label v-for="axis in ['x','y','z']" :key="axis">{{ axis.toUpperCase() }}<input type="number" step="0.25" :aria-label="`${$t(`levelEditor.${type}`)} ${axis.toUpperCase()}`" :value="(type==='start'?activeLevel.entry:activeLevel.exits[0]?.position)?.[axis] || 0" @change="commitLevelMarker(type,axis,$event.target.value)" /></label>
                </fieldset>
              </div>
              <form class="gameplay-command" @submit.prevent="updateGameplayWithAI">
                <span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
                <textarea v-model="gameplayInstruction" rows="1" :disabled="gameplayUpdating" placeholder="Describe the game rules, challenge, or change you want..." aria-label="Describe gameplay"></textarea>
                <button type="submit" :disabled="gameplayUpdating || !gameplayInstruction.trim()">
                  <BonzaiPulse v-if="gameplayUpdating" variant="dot" />
                  <span v-else class="material-symbols-outlined">arrow_upward</span>
                  <span>{{ gameplayUpdating ? 'Designing' : 'Apply' }}</span>
                </button>
              </form>
              <div v-if="activeLevel" class="clear-conditions">
                <span class="clear-conditions__label">Clear when</span>
                <button v-for="condition in activeLevel.clearConditions || []" :key="condition.id" type="button" :title="`Remove: ${condition.label}`" @click="deleteClearCondition(condition.id)">
                  <span class="material-symbols-outlined" aria-hidden="true">{{ clearConditionIcon(condition.type) }}</span>
                  {{ condition.label }}
                  <span class="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
                <span v-if="!activeLevel.clearConditions?.length" class="clear-conditions__empty">Ask BonzAI to define the win condition.</span>
                <span v-else-if="activeLevel.clearConditions.length > 1" class="clear-conditions__mode">{{ activeLevel.clearMode === 'any' ? 'Any' : 'All' }}</span>
              </div>
              <div class="gameplay-suggestions" aria-label="Gameplay suggestions">
                <button v-for="suggestion in gameplaySuggestions" :key="suggestion" type="button" @click="gameplayInstruction = suggestion">{{ suggestion }}</button>
              </div>
              </details>
            </section>
            <section v-if="workspaceTab === 'build' && !buildEditorReady" class="build-workflow" aria-label="Start game build" @click.stop>
              <div class="level-entry">
                <h2 class="bz-h2">{{ $t('levelEditor.chooseLevel') }}</h2>
                <div class="build-workflow__levels">
                  <button v-for="level in historyLevelLibrary" :key="level.libraryId" type="button" @click="useBuildAsset(level)"><img v-if="level.thumbnail" :src="level.thumbnail" alt=""/><span>{{level.title}}</span></button>
                </div>
                <button class="bz-btn bz-btn--primary" type="button" @click="createLevelFromBuild">{{ $t('levelEditor.newLevel') }}</button>
              </div>
            </section>
            <div v-if="workspaceTab === 'build' && isPlaytesting" class="playtest-bar" @click.stop>
              <button type="button" @click="stopPlaytest"><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>Edit</button>
              <strong>{{ gameProject.title }}</strong>
              <select v-model="agentCompanionId" aria-label="Companion player"><option v-for="companion in agentCompanions" :key="companion.id" :value="companion.id">{{ companion.name }}</option></select>
              <button type="button" @click="startCompanionPlay"><span class="material-symbols-outlined" aria-hidden="true">smart_toy</span>Let {{ agentCompanionName }} play</button>
            </div>
            <div
              class="viewer-wrapper"
              :class="{ 'is-drop-target': workspaceTab === 'build' && draggedObjectId, 'has-builder': workspaceTab === 'build' }"
              @dragover.prevent
              @drop.prevent="dropObjectOnMap"
              @click="handleBuildCanvasClick"
            >
              <ThreeViewer
                ref="threeViewer"
                :edit-mode="workspaceTab==='build' && !isPlaytesting"
                :enablePhysics="enablePhysics"
                :initial-time-of-day="currentTime"
                :initial-weather="currentWeather"
                :presentation="workspaceTab === 'build' || creationMode !== 'object' ? 'environment' : presentation"
                @generation-success="handleSuccess"
                @generation-error="handleError"
              />
              <p v-if="workspaceTab === 'build' && projectStatus" class="build-status">{{ projectStatus }}</p>
            </div>

          </div>
          <DownloadRequirement v-if="workspaceTab==='build' && buildEditorReady && !isPlaytesting && (needsDownload || downloads.active)"
            category="3d" :items="missingRequiredModels" :active="downloads.active" cancellable
            :cancelling="isCancellingDownloads" @cancel="cancelActiveDownloads"
            :progress="downloads.total_progress || downloads.progress || 0" :tasks="downloadTaskList"
            :error="downloads.status === 'failed' ? $t('rcDownloads.downloadFailed') : ''" @download="downloadAllModels" />
          <LevelEditor v-if="workspaceTab==='build' && buildEditorReady && !isPlaytesting" ref="levelEditor"
            :viewer="threeViewer" :revision="editorRevision" :assets="buildObjectLibrary" :busy="editorBusy"
            :model-ready="!needsDownload && !downloads.active"
            :generating="editingBusy" @cancel-generation="cancelLevelRegeneration"
            :can-undo="editUndo.length>0" :can-redo="editRedo.length>0" :message="projectStatus"
            @selection="selectedPlacementId=$event?.target?.placementId || ''" @transform="commitLevelTransform"
            @place="placeEditorAsset" @regenerate="regenerateLevelSelection" @save="saveEditedLevel"
            @undo="undoLevelEdit" @redo="redoLevelEdit">
            <template #selection>
              <details v-if="selectedPlacement" class="build-gameplay"><summary>{{ $t('levelEditor.gameplay') }}</summary>
                <label class="build-field"><span>{{ $t('levelEditor.role') }}</span><select :value="selectedPlacement.role" :disabled="editorBusy" @change="commitSelectedPlacement($event.target.value)"><option v-for="role in objectRoles" :key="role.id" :value="role.id">{{role.label}}</option></select></label>
                <label class="build-field"><span>{{ $t('levelEditor.interaction') }}</span><select v-model="interactionType" :disabled="editorBusy"><option v-for="type in ['activates','damages','unlocks','collects']" :key="type" :value="type">{{ $t(`levelEditor.${type}`) }}</option></select></label>
                <label class="build-field"><span>{{ $t('levelEditor.target') }}</span><select v-model="interactionTargetId" :disabled="editorBusy"><option value="">{{ $t('levelEditor.select') }}</option><option v-for="placement in activeLevelPlacements.filter(item=>item.id!==selectedPlacementId)" :key="placement.id" :value="placement.id">{{ placementLabel(placement) }}</option></select></label>
                <button type="button" class="bz-btn bz-btn--ghost" :disabled="editorBusy || !interactionTargetId" @click="addForgeInteraction">{{ $t('levelEditor.link') }}</button>
                <p v-for="interaction in selectedPlacementInteractions" :key="interaction.id">{{ $t(`levelEditor.${interaction.type}`) }} · {{ placementLabelById(interaction.targetPlacementId) }}</p>

              </details>
              <button v-if="selectedPlacement" type="button" class="bz-btn bz-btn--ghost" :disabled="editorBusy" @click="deleteSelectedPlacement">{{ $t('levelEditor.remove') }}</button>
            </template>
          </LevelEditor>

          <!-- GENERATION HISTORY HEADER -->
          <div v-if="objectInferences.length > 0 && workspaceTab === 'generate'" class="level mb-4 mt-5">
            <div class="level-left">
              <div class="level-item">
                <h2
                  class="bz-h2 fira-sans-condensed-black-italic"
                >
                  <span class="material-symbols-outlined bz-section-icon">
                    history
                  </span>
                  Generation History
                </h2>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item buttons">
                <button
                  type="button"
                  class="bz-iconbtn"
                  title="Import history"
                  aria-label="Import history"
                  @click="importHistory()"
                >
                  <span class="material-symbols-outlined">upload</span>
                </button>
                <button
                  type="button"
                  class="bz-iconbtn"
                  title="Export history"
                  aria-label="Export history"
                  @click="exportHistory()"
                  :disabled="objectInferences.length === 0"
                >
                  <span class="material-symbols-outlined">download</span>
                </button>
                <button
                  type="button"
                  class="bz-iconbtn bz-iconbtn--danger"
                  title="Clear history"
                  aria-label="Clear history"
                  @click="clearHistory()"
                >
                  <span class="material-symbols-outlined">ink_eraser</span>
                </button>
              </div>
            </div>
          </div>

          <p v-if="glbExportStatus" class="mb-4" role="status">{{ glbExportStatus }}</p>

          <!-- History -->
          <div v-if="objectInferences.length > 0 && workspaceTab === 'generate'">
            <ol class="chat">
              <li
                v-for="(item, displayIndex) in paginatedInferences"
                :key="item.id"
                class="history-item"
                :style="{
                  animationDelay: `${Math.min(displayIndex * 50, 500)}ms`,
                }"
              >
                <div class="question">
                  <div class="three-history-preview">
                    <img
                      v-if="historyThumbnail(item)"
                      :src="historyThumbnail(item)"
                      :alt="item.screenshots?.[0]?.label || item.prompt || '3D object preview'"
                    />
                    <div v-else class="three-history-preview__empty">
                      <span class="material-symbols-outlined" aria-hidden="true">3d_rotation</span>
                    </div>
                  </div>
                  <div class="history-header">
                    <span class="answer__model">
                      <span class="material-symbols-outlined mr-2">neurology</span>
                      {{ item.model || 'three-js' }}
                      <span v-if="item.tokensPerSecond" class="answer__tps">
                        @ {{ item.tokensPerSecond }} tok/s
                      </span>
                    </span>
                    <span class="history-meta fira-sans-condensed-black-italic">
                      {{ formatHistoryDate(item.timestamp || item.createdAt) }}
                    </span>
                  </div>

                  <!-- Multi-angle Screenshots Preview -->
                  <div
                    v-if="item.screenshots && item.screenshots.length > 0"
                    class="screenshots-preview"
                  >
                    <div class="screenshots-grid">
                      <div
                        v-for="(shot, shotIdx) in item.screenshots"
                        :key="shotIdx"
                        class="screenshot-thumb"
                        @click="openScreenshotModal(item, shotIdx)"
                        :title="shot.label || shot.name"
                      >
                        <img
                          :src="shot.dataUrl"
                          :alt="shot.label || shot.name"
                        />
                        <span class="screenshot-label">
                          {{ shot.label || shot.name }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p v-if="item.qualityStatus" class="mb-2" role="status">
                    {{ item.qualityStatus === 'reviewed' ? 'Visual review passed' : item.qualityStatus === 'needs-refinement' ? 'Draft · review suggestions' : 'Draft · not visually reviewed' }}
                  </p>
                  <details v-if="item.assemblyReport?.errors?.length || item.fidelityReview?.defects?.length || item.fidelityReview?.passes?.some(pass => pass.verdict === 'correction-failed')" class="mb-3">
                    <summary>{{ 'Review details' }}</summary>
                    <ul class="mt-2 pl-5">
                      <li v-for="(issue, idx) in (item.assemblyReport?.errors || [])" :key="'assembly-' + idx">{{ issue }}</li>
                      <li v-for="(defect, idx) in (item.fidelityReview?.defects || [])" :key="idx">{{ defect }}</li>
                      <li v-for="(pass, idx) in (item.fidelityReview?.passes || []).filter(pass => pass.verdict === 'correction-failed')" :key="'failure-' + idx">{{ 'Automatic correction could not be applied.' }} {{ pass.raw }}</li>
                    </ul>
                  </details>
                  <div v-if="!item.success" class="error-note">
                    <span class="material-symbols-outlined mr-1">error</span>
                    {{ item.notes }}
                  </div>
                  <hr />
                  <GenerativeActions
                    :actions="actionsFor(item)"
                    @action="(id) => handleAction(id, item)"
                  />
                </div>
              </li>
            </ol>
            <!-- LAZY LOAD SENTINEL -->
            <div
              ref="loadMoreSentinel"
              v-if="hasMore"
              class="load-more-sentinel has-text-centered p-4"
            >
              <span v-if="isLoadingMore" class="has-text-grey">
                Loading more...
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Screenshot Modal -->
  <div
    v-if="screenshotModal.visible"
    class="screenshot-modal-overlay"
    @click.self="closeScreenshotModal"
  >
    <div class="screenshot-modal">
      <BzCloseButton class="screenshot-modal-close" size="md" aria-label="Close screenshot" @click="closeScreenshotModal" />
      <div class="screenshot-modal-header">
        <h3 class="fira-sans-condensed-black-italic">
          {{ screenshotModal.currentShot?.label || "Screenshot" }}
        </h3>
        <div class="screenshot-modal-nav">
          <button
            class="nav-btn"
            :disabled="screenshotModal.currentIndex <= 0"
            @click="navigateScreenshot(-1)"
          >
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <span class="nav-indicator">
            {{ screenshotModal.currentIndex + 1 }} /
            {{ screenshotModal.shots?.length || 0 }}
          </span>
          <button
            class="nav-btn"
            :disabled="
              screenshotModal.currentIndex >=
              (screenshotModal.shots?.length || 1) - 1
            "
            @click="navigateScreenshot(1)"
          >
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>
      <div class="screenshot-modal-content">
        <img
          v-if="screenshotModal.currentShot"
          :src="screenshotModal.currentShot.dataUrl"
          :alt="screenshotModal.currentShot.label"
        />
      </div>
      <div class="screenshot-modal-footer">
        <button
          class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
          @click="downloadScreenshot(screenshotModal.currentShot)"
        >
          <span class="material-symbols-outlined mr-1">download</span>
          Download
        </button>
        <button class="bz-btn bz-btn--primary fira-sans-condensed-black-italic" @click="downloadAllScreenshots">
          <span class="material-symbols-outlined mr-1">folder_zip</span>
          Download All
        </button>
      </div>
    </div>
  </div>

  <!-- Mint Modal -->
  <MintModal
    v-if="mintTarget"
    :visible="!!mintTarget"
    v-bind="mintTarget"
    @close="mintTarget = null"
    @minted="onMinted"
  />

  <Teleport to="body">
    <div v-if="pendingDelete" class="bz-confirmation-backdrop" aria-hidden="true"></div>
    <Transition name="bz-image-toast">
    <div
      v-if="pendingDelete"
      class="bz-image-delete-toast"
      role="status"
      aria-live="polite"
    >
      <span class="material-symbols-outlined" aria-hidden="true">delete</span>
      <span class="bz-image-delete-toast__body">
        {{ pendingDelete.scene ? $t('rc.creation.clearSceneConfirm') : pendingDelete.all ? 'Clear 3D history?' : 'Delete this object?' }}
      </span>
      <button type="button" class="bz-image-delete-toast__ghost" @click="dismissDeleteToast">
        Cancel
      </button>
      <button type="button" class="bz-image-delete-toast__danger" @click="confirmDeleteObject">
        {{ pendingDelete.scene || pendingDelete.all ? $t('common.clear') : $t('common.delete') }}
      </button>
    </div>
  </Transition>
  </Teleport>
</template>

<script>
import { reportOperation } from "../stores/activityStore.js";
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import ThreeViewer from "./ThreeViewer.vue";
import { useI18n } from "../i18n/index.js";
import LevelEditor from './gen3d/LevelEditor.vue';
import { compileLevelPreview, setLevelPartEdit, sourceForBuilder, assetBuilder } from './gen3d/levelEditing.js';
import { recordedMintGeneration } from "../services/mintValidation.js";
import MintModal from "./MintModal.vue";
import ExampleLibrary from "./gen3d/ExampleLibrary.vue";
import { parse as parseJavaScript } from 'acorn';
import { requestAssemblyPlan, repairAssembly, assemblyInstructions, inspectAssembly } from './gen3d/assemblyContract.js';
import { aggregateViewReviews, resizeReviewImage, visualReviewPrompt, parseVisualReview, passesVisualReview, reviewSceneQuality } from "./gen3d/visualQuality.js";
import { renderWithRecovery, awaitSceneConstruction } from "./gen3d/runtimeRecovery.js";
import { exportCodeGLB, GLB_MIME } from "./gen3d/glbExport.js";
import BonzaiPulse from "./BonzaiPulse.vue";
import { cancelLocalDownloads } from '../services/downloadCancellation.js';
import DownloadRequirement from "./DownloadRequirement.vue";
import BzCloseButton from "./BzCloseButton.vue";
import GenerativeInput from "./generative/GenerativeInput.vue";
import GenerativeActions from "./generative/GenerativeActions.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { fetchNFT3DCode } from "../services/contentNFT.service.js";
import { inspector as generationInspector } from "../services/generationInspector.service.js";
import { resolveLLM } from "../skills/flagship.js";
import { DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER } from "../config/modelDefaults.js";
import { validateGeneratedGameCode } from "./gen3d/gameRuntime.js";
import {
  applyGameplayPatch,
  addInteraction,
  addLevel,
  addObjectAsset,
  buildGameCollectibleManifest,
  compileGameProject,
  importLevelSnapshot,
  createGameProject,
  moveLevel,
  placeObject,
  removePlacement,
  removeClearCondition,
  removeLevel,
  setLevelMarker,
  updatePlacement,
  validateGameProject,
} from "./gen3d/gameProject.js";
import { routeFlaskRequest } from "../services/inferenceRouter.service.js";
import useClipboard from "vue-clipboard3";
import axios from "axios";
import { io } from "socket.io-client";
import {
  addObjectInference,
  loadObjectInferences,
  removeObjectInference,
  clearObjectInferences,
  inferenceStore,
} from "../stores/inferenceStore";

// Bounded runtime API references, selected by subject rather than whole-file keyword overlap.
import { sceneDesignSignature } from './gen3d/designSignature.js';
import { createCreativeDirection, creativeDirectionPrompt } from './gen3d/creativeDirection.js';
import { validateSceneBody, sceneContract, buildScenePrompt, buildSceneRevision, selectThreeReferences, buildSceneRepair, applySceneEdits } from './gen3d/generationContract.js';
const skillFiles = import.meta.glob('../skills/threejs/*/CHEATSHEET.md', { as: 'raw', eager: true });

// Server URL for downloads
const SERVER_URL =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${SERVER_URL}/downloads`;

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function loadGameProjectDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem("bonzai-game-project") || "null");
    return saved?.schema === "bonzai.game-project" ? saved : createGameProject();
  } catch {
    return createGameProject();
  }
}

function parseGameplayPatch(text) {
  const source = String(text || "").replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model returned no gameplay update");
  return JSON.parse(source.slice(start, end + 1));
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (defined outside setup for cleanliness)
// ═══════════════════════════════════════════════════════════════════════════

function indent(text, spaces = 4) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

export function normalizeLLMCode(code) {
  let out = String(code);
  // Reopening history must normalize the authored body, not redeclare the host
  // (notably its seeded Math). Keep the same seed and source across round trips.
  if (/^\s*export default async function generate\(params\)/.test(out)) {
    const savedBody=out.match(/^[ \t]*\/\/ ── USER CODE START ──\r?\n([\s\S]*?)^[ \t]*\/\/ ── USER CODE END ──/m);
    if(savedBody)out=savedBody[1].replace(/^  /gm,'').trim();
  }

  // STEP 0: Strip reasoning/thinking tags (Qwen 3.5, GLM, Nanbeige, etc.)
  out = out.replace(/<think>[\s\S]*?<\/think>\s*/gi, "");
  out = out.replace(/<\|thinking\|>[\s\S]*?<\|\/thinking\|>\s*/gi, "");
  out = out.replace(/<think>[\s\S]*$/gi, ""); // unclosed <think> tag
  out = out.replace(/<\|thinking\|>[\s\S]*$/gi, ""); // unclosed thinking tag
  // Strip any /nothink or /think directives echoed back by the model
  out = out.replace(/^\s*\/no?think\s*/i, "");

  out = out.trim();

  // STEP 1: Extract code from markdown fences (handles text before/after fences)
  const fenceMatch = out.match(/```(?:javascript|js|typescript|ts)?\s*\n([\s\S]*?)```/i);
  if (fenceMatch) {
    out = fenceMatch[1];
  } else {
    // Fallback: strip fences at boundaries only
    out = out.replace(/^```(?:javascript|js|typescript|ts)?[\r\n]*/gi, "");
    out = out.replace(/[\r\n]*```\s*$/gi, "");
  }
  out = out.trim();

  if (out.startsWith("{") && out.includes('"code"')) {
    const codeMatch = out.match(/"code"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);
    if (codeMatch) {
      out = codeMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .trim();
    }
  }

  // STEP 2: Remove LLM preamble
  out = out.replace(
    /^(Here'?s?|This is|Below is|The following)[^:]*:\s*/gi,
    "",
  );
  out = out.replace(/^(I'll|Let me|I will|I've)[^.]*\.\s*/gi, "");
  out = out.replace(/^(Sure|Of course|Certainly)[^.]*\.\s*/gi, "");
  out = out.replace(
    /\n\s*(This code|The above|This creates|Note:|Explanation:)[\s\S]*$/gi,
    "",
  );

  // STEP 3: Remove module syntax (the LLM sometimes adds these)
  out = out.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*/g, "");
  out = out.replace(
    /export\s+default\s+async\s+function\s*\w*\s*\([^)]*\)\s*\{/g,
    "",
  );
  out = out.replace(/export\s+default\s+function\s*\w*\s*\([^)]*\)\s*\{/g, "");
  out = out.replace(/async\s+function\s+generate\s*\([^)]*\)\s*\{/g, "");
  out = out.replace(/function\s+generate\s*\([^)]*\)\s*\{/g, "");
  out = out.replace(/export\s+default\s+/g, "");
  out = out.replace(/return\s+root\s*;?\s*$/gm, "");

  // STEP 3.4: Correct common LLM typos of pre-declared API functions.
  // The model occasionally scrambles function name word order or drops
  // a prefix. Each entry maps a typo variant → canonical name. Match
  // uses word boundaries + lookahead for `(` so we only hit call sites,
  // not substrings inside identifiers like `prevSetObjectInfo`.
  const API_TYPO_FIXES = [
    // setObjectInfo
    [/\bobjectSetInfo\s*\(/g, "setObjectInfo("],
    [/\bsetObjectinfo\s*\(/g, "setObjectInfo("],
    [/\bsetobjectInfo\s*\(/g, "setObjectInfo("],
    [/\bSetObjectInfo\s*\(/g, "setObjectInfo("],
    [/\bsetObject\s*\(/g,     "setObjectInfo("],
    [/\bsetSceneInfo\s*\(/g,  "setObjectInfo("],
    // addUpdateCallback
    [/\baddUpdateCall\s*\(/g,      "addUpdateCallback("],
    [/\bregisterUpdate\s*\(/g,     "addUpdateCallback("],
    [/\bonUpdate\s*\(/g,           "addUpdateCallback("],
    [/\bonFrameUpdate\s*\(/g,      "addUpdateCallback("],
    // Post FX setters — mostly forget the "set" prefix.
    [/\bsetFilmgrain\s*\(/g, "setFilmGrain("],
    [/\bsetDof\s*\(/g,       "setDoF("],
    [/\bsetLensflare\s*\(/g, "setLensFlare("],
    [/\bsetChroma\s*\(/g,    "setChromatic("],
    [/\bsetAo\s*\(/g,        "setAO("],
  ];
  for (const [re, replacement] of API_TYPO_FIXES) {
    out = out.replace(re, replacement);
  }

  // STEP 3.4b: Fix the "const NAMESPACE.Member = ..." anti-pattern.
  // The codegen sometimes treats engine namespaces (MAT, TEX, FLUID, …)
  // as if they were writable namespaces it could declare into:
  //
  //   const MAT.PolishedBrass = new THREE.MeshPhysicalMaterial({...});
  //   const TEX.Custom = TEX.stone(...);
  //
  // That's a JS syntax error — `const` requires a bare identifier, not
  // a member expression — and produces the misleading "Identifier 'MAT'
  // has already been declared" message because the parser bails after
  // reading `const MAT` and seeing the `.`. Strip the `const` so the
  // assignment becomes a plain property write (the engine namespaces
  // are object refs and accept new properties).
  //
  // This rewrite intentionally runs BEFORE the wrapper-reserved
  // stripper below so the namespace identifier survives intact.
  const NAMESPACE_NAMES = "MAT|TEX|SHADER|FLUID|H|helpers|P|CELESTIAL|FX|GAME";
  out = out.replace(
    new RegExp(`\\b(?:const|let|var)\\s+(${NAMESPACE_NAMES})\\.(\\w+)\\s*=`, "g"),
    "$1.$2 =",
  );

  // STEP 3.5: Strip ALL declarations of wrapper-reserved variables.
  // The wrapper already declares these — any LLM redeclaration (via params, window,
  // require, destructuring, new, literal, or anything else) causes runtime errors.
  // One comprehensive pass instead of pattern-specific regexes.

  // First: strip any destructuring from params/window (catches all shapes).
  // The `(?!\.)` lookahead prevents partial matches on `params._engine`,
  // which would otherwise leave `._engine;` as an orphan expression.
  out = out.replace(/(?:const|let|var)\s*\{[^}]*\}\s*=\s*(?:params|window)(?!\s*\.)\s*;?\s*/g, "");

  // Strip individual declarations of reserved names — regardless of RHS.
  // The RHS may be a multi-line arrow / function expression, so we need
  // a brace-balancing walker instead of a one-line regex. Previous regex
  // `[^;\\n]*;?` matched only the first line of `const setObjectInfo =
  // (info) => {` and left the body `{ window.__sceneInfo = info; };`
  // dangling — that orphan block was the source of "Illegal return
  // statement" on module import.
  const WRAPPER_RESERVED = [
    "THREE", "scene", "camera", "root", "H", "helpers", "MAT", "TEX",
    "SHADER", "FLUID", "P", "CELESTIAL", "FX", "GAME",
    "addUpdateCallback", "setObjectInfo", "physics", "CANNON",
  ];
  const stripReservedDecl = (src, name) => {
    const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`, "g");
    let result = "";
    let cursor = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const startIdx = m.index;
      const afterEq = m.index + m[0].length;
      // Find end of declaration: scan forward, balancing braces.
      // End condition: top-level ';' or newline AFTER all braces close.
      let i = afterEq;
      let depth = 0;
      let inStr = null; // quote char if inside a string
      while (i < src.length) {
        const ch = src[i];
        if (inStr) {
          if (ch === "\\") { i += 2; continue; }
          if (ch === inStr) inStr = null;
          i++; continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; i++; continue; }
        if (ch === "{" || ch === "(" || ch === "[") { depth++; i++; continue; }
        if (ch === "}" || ch === ")" || ch === "]") { depth--; i++; continue; }
        if (depth === 0 && (ch === ";" || ch === "\n")) { i++; break; }
        i++;
      }
      result += src.slice(cursor, startIdx);
      cursor = i;
    }
    result += src.slice(cursor);
    return result;
  };
  for (const name of WRAPPER_RESERVED) {
    out = stripReservedDecl(out, name);
  }
  // Also strip root.name assignment (wrapper sets it)
  out = out.replace(/root\.name\s*=\s*['"][^'"]*['"]\s*;?\s*/g, "");

  // STEP 3.6: Collapse duplicate top-level `const/let/var NAME = ...`
  // declarations. The LLM "thinks out loud" mid-code — re-declaring the
  // same variable (e.g. lathe profile) multiple times while working
  // through variants at the module's top level.
  //
  // CRITICAL: only strip duplicates that share MODULE TOP-LEVEL scope
  // (brace depth 0). Block-scoped bindings inside `for` loop headers
  // (`for (let i = 0; ...)`) or different loop bodies that happen to
  // share a name like `const angle` / `const spout` are legal JS —
  // they live in separate block scopes and must NOT be stripped.
  //
  // Uses the same brace-balancing walker as stripReservedDecl so
  // multi-line RHS values (arrow functions, object literals,
  // Vector2(...) arrays) are caught as single ranges.
  {
    // Pre-compute the nesting depth at every index so we can cheaply
    // test whether a match is at top-level.
    const depths = new Int32Array(out.length + 1);
    {
      let d = 0, inStr = null;
      for (let i = 0; i < out.length; i++) {
        depths[i] = d;
        const ch = out[i];
        if (inStr) {
          if (ch === "\\") { i++; continue; }
          if (ch === inStr) inStr = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
        if (ch === "{" || ch === "(" || ch === "[") d++;
        else if (ch === "}" || ch === ")" || ch === "]") d--;
      }
      depths[out.length] = d;
    }

    const declRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
    const occurrences = new Map();
    let m;
    while ((m = declRe.exec(out)) !== null) {
      // Only consider top-level declarations (depth 0 at the keyword).
      if (depths[m.index] !== 0) continue;
      const name = m[1];
      const startIdx = m.index;
      const afterEq = m.index + m[0].length;
      // Walk forward balancing braces until we hit top-level ; or \n.
      let i = afterEq;
      let depth = 0;
      let inStr = null;
      while (i < out.length) {
        const ch = out[i];
        if (inStr) {
          if (ch === "\\") { i += 2; continue; }
          if (ch === inStr) inStr = null;
          i++; continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; i++; continue; }
        if (ch === "{" || ch === "(" || ch === "[") { depth++; i++; continue; }
        if (ch === "}" || ch === ")" || ch === "]") { depth--; i++; continue; }
        if (depth === 0 && (ch === ";" || ch === "\n")) { i++; break; }
        i++;
      }
      if (!occurrences.has(name)) occurrences.set(name, []);
      occurrences.get(name).push({ start: startIdx, end: i });
    }
    const toComment = [];
    for (const [name, ranges] of occurrences) {
      if (ranges.length < 2) continue;
      for (let k = 0; k < ranges.length - 1; k++) toComment.push(ranges[k]);
    }
    toComment.sort((a, b) => b.start - a.start);
    for (const r of toComment) {
      const block = out.slice(r.start, r.end);
      const firstLine = block.split("\n", 1)[0].slice(0, 90);
      out = out.slice(0, r.start) +
            `// (removed duplicate declaration: ${firstLine.replace(/\s+/g, ' ')}…)` +
            out.slice(r.end);
    }
  }

  // STEP 4: Fix MAT/TEX/H redeclarations
  // Strip full MAT/TEX/H object redefinitions (LLM sometimes redefines the entire library)
  out = out.replace(/(?:const|let|var)?\s*MAT\s*=\s*\{[\s\S]*?\n\s*\};\s*/g, "");
  out = out.replace(/(?:const|let|var)?\s*TEX\s*=\s*\{[\s\S]*?\n\s*\};\s*/g, "");
  // Strip everything before setObjectInfo if it starts with orphaned object properties
  // (LLM sometimes generates partial object literals like "bubbles: function() {...}")
  const setObjIdx = out.indexOf("setObjectInfo");
  if (setObjIdx > 0) {
    const before = out.slice(0, setObjIdx);
    // If the code before setObjectInfo has orphaned "key: function" or "key: value," patterns
    // but no proper variable declarations, it's garbage from an object literal
    if (/^\s*\w+\s*:\s*(?:function|\{|new\s)/.test(before.trim()) && !/(?:const|let|var)\s/.test(before)) {
      out = out.slice(setObjIdx);
    }
  }
  // Animations are NOW allowed — the engine's shader ticker and physics loop
  // depend on addUpdateCallback, and user scenes (orreries, fountains, etc.)
  // are much livelier with them on. We no longer regex-strip these calls;
  // the earlier non-greedy strip was the root cause of the fountain scene
  // failing (nested `.forEach(c => { ... })` inside an addUpdateCallback
  // tripped the regex and left orphan `});` fragments behind).

  const threeClasses = [
    "BoxGeometry",
    "SphereGeometry",
    "CylinderGeometry",
    "ConeGeometry",
    "TorusGeometry",
    "PlaneGeometry",
    "CircleGeometry",
    "RingGeometry",
    "OctahedronGeometry",
    "IcosahedronGeometry",
    "TorusKnotGeometry",
    "TubeGeometry",
    "ExtrudeGeometry",
    "LatheGeometry",
    "ShapeGeometry",
    "BufferGeometry",
    "EdgesGeometry",
    "MeshPhysicalMaterial",
    "MeshStandardMaterial",
    "MeshBasicMaterial",
    "MeshLambertMaterial",
    "MeshPhongMaterial",
    "MeshToonMaterial",
    "PointsMaterial",
    "ShaderMaterial",
    "SpriteMaterial",
    "LineBasicMaterial",
    "PointLight",
    "DirectionalLight",
    "AmbientLight",
    "SpotLight",
    "HemisphereLight",
    "Group",
    "Mesh",
    "InstancedMesh",
    "Points",
    "Sprite",
    "Object3D",
    "Line",
    "LineSegments",
    "Vector2",
    "Vector3",
    "Vector4",
    "Color",
    "Quaternion",
    "Euler",
    "Matrix4",
    "Box3",
    "Float32BufferAttribute",
    "BufferAttribute",
    "CanvasTexture",
    "TextureLoader",
    "Shape",
    "Path",
    "CatmullRomCurve3",
  ];

  threeClasses.forEach((cls) => {
    out = out.replace(
      new RegExp(`\\bnew\\s+(?!THREE\\.)${cls}\\b`, "g"),
      `new THREE.${cls}`,
    );
  });

  // STEP 5: Fix common mistakes
  out = out.replace(/scene\.add\s*\(\s*(?!root)(\w+)\s*\)/g, "root.add($1)");
  out = out.replace(/\bhelpers\./g, "H.");
  out = out.replace(/params\.H\./g, "H.");
  out = out.replace(/params\.TEX/g, "TEX");
  out = out.replace(/params\.MAT/g, "MAT");

  // STEP 5.1: Strip LLM redeclarations of pre-injected identifiers.
  // Models frequently open the scene with something like
  //   `const { THREE, scene, root, MAT, TEX, SHADER, FLUID, H, P, addUpdateCallback } = this;`
  // or standalone `const THREE = params.THREE;` — both throw
  // "Identifier 'X' has already been declared" once we inline into the
  // wrapper, because the wrapper already hoists every one of those names.
  // Kill any destructure or const whose left-hand side contains a protected
  // identifier.
  const PROTECTED = [
    'THREE', 'scene', 'camera', 'renderer', 'root',
    'H', 'helpers', 'MAT', 'TEX', 'SHADER', 'FLUID', 'P', 'CELESTIAL', 'FX', 'GAME',
    'addUpdateCallback', 'removeUpdateCallback', 'setObjectInfo',
    'setFilmGrain', 'setScreenDroplets',
    'setChromatic', 'setDoF', 'setColorGrade', 'setLensFlare', 'setUnderwater', 'setEnvironment',
    'setAO', 'setBloom',
    'params',
  ];
  const protectedRE = new RegExp(`\\b(${PROTECTED.join('|')})\\b`);
  // Destructuring: const { THREE, scene, ... } = anything;
  out = out.replace(
    /(?:const|let|var)\s*\{[^}]*\}\s*=\s*[^;]+;?/g,
    (match) => (protectedRE.test(match) ? `// (removed redeclaration: ${match.replace(/\s+/g, ' ').slice(0, 80)}…)` : match)
  );
  // Single-binding: const THREE = something;
  for (const name of PROTECTED) {
    const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*[^;]+;?`, 'g');
    out = out.replace(re, `// (removed redeclaration of ${name})`);
  }
  // `this.X` references on a module-scope wrapper point at nothing useful —
  // swap them for the local identifier since it's already in scope.
  out = out.replace(/\bthis\.(THREE|scene|camera|renderer|root|H|helpers|MAT|TEX|SHADER|FLUID|P|GAME|addUpdateCallback|setObjectInfo)\b/g, '$1');

  // STEP 5.5: Remove stray export statements (e.g. "export { root }")
  out = out.replace(/export\s*\{[^}]*\}\s*;?\s*/g, "");
  out = out.replace(/export\s+\w+\s*;?\s*$/gm, "");

  // STEP 5.6: Remove scene-level lights the LLM shouldn't add (scene already has lighting)
  out = out.replace(/(?:const|let|var)\s+\w*[Aa]mbient\w*\s*=\s*new\s+THREE\.AmbientLight\([^)]*\)\s*;?/g, "// (ambient light removed — scene has lighting)");
  out = out.replace(/(?:const|let|var)\s+\w*[Dd]irectional\w*\s*=\s*new\s+THREE\.DirectionalLight\([^)]*\)\s*;?/g, "// (directional light removed — scene has lighting)");
  out = out.replace(/root\.add\s*\(\s*\w*[Aa]mbient\w*\s*\)\s*;?/g, "");
  out = out.replace(/root\.add\s*\(\s*\w*[Dd]irectional\w*\s*\)\s*;?/g, "");
  // Also catch inline: root.add(new THREE.AmbientLight(...))
  out = out.replace(/root\.add\s*\(\s*new\s+THREE\.AmbientLight\([^)]*\)\s*\)\s*;?/g, "");
  out = out.replace(/root\.add\s*\(\s*new\s+THREE\.DirectionalLight\([^)]*\)\s*\)\s*;?/g, "");

  // Let the JavaScript parser diagnose incomplete output; braces in strings,
  // comments and shader literals must never be treated as program structure.

  // STEP 6.5: Fix common LLM code errors

  // Fix: new THREE.Mesh(new THREE.Group()...) — Group is not geometry.
  // Replace with just the Group approach: create group, add children, root.add(group)
  out = out.replace(
    /new\s+THREE\.Mesh\s*\(\s*new\s+THREE\.Group\(\)[^)]*\)/g,
    "new THREE.Group()",
  );

  // Fix: H.bubbles/dust/sparks/smoke called inside addUpdateCallback — these create
  // particle systems and should be called once, not every frame.
  // Extract H.xxx() calls from inside addUpdateCallback and move before it.
  const updateCallbackMatch = out.match(
    /addUpdateCallback\s*\(\s*\(\s*\{[^}]*\}\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*;?/,
  );
  if (updateCallbackMatch) {
    const callbackBody = updateCallbackMatch[1];
    const helperCallPattern = /\s*(?:const\s+\w+\s*=\s*)?H\.(dust|bubbles|sparks|smoke)\s*\([^)]*\)\s*;?/g;
    const helperCalls = callbackBody.match(helperCallPattern);
    if (helperCalls) {
      // Remove from callback body
      let cleanedBody = callbackBody.replace(helperCallPattern, "");
      // Reconstruct the addUpdateCallback
      const fullMatch = updateCallbackMatch[0];
      const cleanedCallback = fullMatch.replace(callbackBody, cleanedBody);
      // Insert helper calls before the addUpdateCallback
      const helperBlock = helperCalls
        .map((c) => c.trim())
        .filter(Boolean)
        .join("\n");
      out = out.replace(fullMatch, helperBlock + "\n" + cleanedCallback);
    }
  }

  // STEP 7: Clean up
  out = out.trim();
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/^\s*try\s*\{\s*\n?/, "");
  out = out.replace(/\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?\}\s*$/, "");

  // STEP 8: Wrap in module structure with pre-built material library
  // No try/catch here — errors must propagate so applyModuleCode can report them.
  // ThreeViewer.applyModuleCode has its own error handling for real execution.
  return awaitSceneConstruction(`
export default async function generate(params) {
  const THREE = params.THREE;
  const Math = params.sceneMath || globalThis.Math;
  const scene = params.scene;
  const root = new THREE.Group();
  root.name = "GeneratedObject";
  root.userData.generationContract = 2;
  const addUpdateCallback = params.addUpdateCallback;
  const setObjectInfo = params.setObjectInfo;
  // Post-FX toggles — defensive no-ops if the host doesn't provide them
  // so generated code never throws for optional effects.
  const setFilmGrain      = params.setFilmGrain      || (() => {});
  const setScreenDroplets = params.setScreenDroplets || (() => {});
  const setChromatic      = params.setChromatic      || (() => {});
  const setDoF            = params.setDoF            || (() => {});
  const setColorGrade     = params.setColorGrade     || (() => {});
  const setLensFlare      = params.setLensFlare      || (() => {});
  const setUnderwater     = params.setUnderwater     || (() => {});
  const setEnvironment    = params.setEnvironment    || (async () => {});
  const setAO             = params.setAO             || (() => {});
  const setBloom          = params.setBloom          || (() => {});
  // setHeightFog is intentionally NOT exposed here. Weather (fog, rain,
  // lightning, lens droplets) is scene-level state owned by the viewer;
  // generated scenes inherit whatever the user selected in the weather
  // panel rather than forcing their own atmosphere.
  const helpers = params.helpers;
  const H = helpers;

  // Engine libraries (rendering plus GAME runtime) — injected
  // by ThreeViewer via ctx._engine so they share the same update loop the
  // helpers use.
  const { MAT, TEX, SHADER, FLUID, P, CELESTIAL, FX, GAME } = params._engine;
  params.MAT = MAT; params.TEX = TEX; params.SHADER = SHADER;
  params.FLUID = FLUID; params.P = P; params.CELESTIAL = CELESTIAL; params.FX = FX; params.GAME = GAME;
  params.H = H; params.helpers = H;

  // ── USER CODE START ──
${indent(out, 2)}
  // ── USER CODE END ──

  scene.add(root);
  return root;
}
`);
}

function stripJSComments(code) {
  let out = "";
  let i = 0;
  let inStr = null;
  let inLine = false;
  let inBlock = false;

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += ch;
      }
      i++;
      continue;
    }

    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (inStr) {
      out += ch;
      if (ch === "\\") {
        out += next || "";
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function validateRenderableUserCode(userCode) {
  return validateSceneBody(userCode);
}

function buildReferenceFallbackCode(imageDataUrl) {
  const encodedImage = JSON.stringify(String(imageDataUrl || ""));
  return normalizeLLMCode(`
setObjectInfo({
  name: "Reference Relief",
  description: "Depth-backed reconstruction generated from the source image"
});
const texture = await new Promise((resolve, reject) => {
  new THREE.TextureLoader().load(${encodedImage}, resolve, undefined, reject);
});
texture.colorSpace = THREE.SRGBColorSpace;
texture.anisotropy = 8;
const sourceWidth = texture.image?.naturalWidth || texture.image?.width || 1;
const sourceHeight = texture.image?.naturalHeight || texture.image?.height || 1;
const aspect = Math.min(2.2, Math.max(0.48, sourceWidth / sourceHeight));
const height = aspect >= 1 ? 0.92 : Math.min(1.25, 0.92 / aspect);
const width = height * aspect;
const depth = Math.max(0.1, Math.min(width, height) * 0.14);
const body = new THREE.Mesh(
  new THREE.BoxGeometry(width, height, depth, 10, 10, 3),
  [
    new THREE.MeshPhysicalMaterial({ color: 0x24211f, roughness: 0.48, metalness: 0.15 }),
    new THREE.MeshPhysicalMaterial({ color: 0x24211f, roughness: 0.48, metalness: 0.15 }),
    new THREE.MeshPhysicalMaterial({ color: 0x37312c, roughness: 0.4, metalness: 0.12 }),
    new THREE.MeshPhysicalMaterial({ color: 0x171513, roughness: 0.58, metalness: 0.08 }),
    new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.62, metalness: 0.02 }),
    new THREE.MeshPhysicalMaterial({ color: 0x181614, roughness: 0.58, metalness: 0.08 })
  ]
);
body.position.y = height * 0.5 + 0.08;
root.add(body);
const imageFace = new THREE.Mesh(
  new THREE.PlaneGeometry(width * 0.985, height * 0.985, 18, 18),
  new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
);
imageFace.position.set(0, body.position.y, depth * 0.505 + 0.002);
root.add(imageFace);
const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(width * 0.43, width * 0.5, 0.08, 48),
  new THREE.MeshPhysicalMaterial({ color: 0x171514, roughness: 0.3, metalness: 0.62, clearcoat: 0.45 })
);
pedestal.position.y = 0.04;
root.add(pedestal);
`);
}

function stripThinkBlocks(text) {
  let out = String(text || "");
  out = out.replace(/<think>[\s\S]*?<\/think>\s*/gi, "");
  out = out.replace(/<\|thinking\|>[\s\S]*?<\|\/thinking\|>\s*/gi, "");
  out = out.replace(/<think>[\s\S]*$/gi, "");
  out = out.replace(/<\|thinking\|>[\s\S]*$/gi, "");
  return out.trim();
}

function modelFromResolved(resolved, role) {
  return {
    role,
    modelname: resolved.name,
    modeldesc: resolved.description,
    url: resolved.url,
    filename: resolved.filename,
    filesize: resolved.size,
    filesizeBytes: resolved.filesizeBytes,
    parameters: resolved.parameters,
    activeParameters: resolved.activeParameters,
    isMoE: resolved.isMoE,
    context: resolved.context,
    thinking: resolved.thinking,
    draftModel: resolved.draftModel || null,
    draftUrl: resolved.draftUrl || null,
    specType: resolved.specType || null,
    specDraftNMax: resolved.specDraftNMax || null,
    mtp: resolved.mtp || false,
  };
}

export default {
  name: "Generative3D",
  components: { LevelEditor, ExampleLibrary, DownloadRequirement, ThreeViewer, MintModal, BonzaiPulse, BzCloseButton, GenerativeInput, GenerativeActions },
  setup() {
    const {t} = useI18n();
    // ------------ NFT Minting ---------
    const mintTarget = ref(null);

    const openMint = (item) => {
      // Minting prepares a GLB and retains this source plus the interactive viewer.
      mintTarget.value = {
        inferenceType: "object",
        inferenceId: item.id,
        content: item.code,
        contentType: "application/javascript",
        prompt: item.prompt,
        generation: recordedMintGeneration(item, {
          type: `bonzai-${item.assetKind || item.mode || "object"}`,
          assetKind: item.assetKind || item.mode || "object",
          model: item.model || "",
          timestamp: item.timestamp,
          threeCode: item.code,
          projectManifest: item.projectManifest || null,
          levelProject: item.levelProject || null,
          tokensPerSecond: item.tokensPerSecond || null,
        }),
      };
    };

    const onMinted = (result) => {
      const inf = objectInferences.value.find(
        (i) => i.id === mintTarget.value?.inferenceId,
      );
      if (inf) inf.nft = result;
      if (mintTarget.value?.generation?.assetKind === "game") {
        gameProject.value.ownership ||= { collectible: null, token: null };
        gameProject.value.ownership.collectible = result;
      }
      mintTarget.value = null;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // REACTIVE STATE
    // ═══════════════════════════════════════════════════════════════════════
    const isLoading = ref(false);
    const threeViewer = ref(null);
    const lastStatus = ref("");
    const showExamples = ref(false);
    const pendingDelete = ref(null);
    let pendingDeleteTimer = null;

    // ───── Game-style loading screen state ────────────────────────────────
    // Driven by the streaming LLM call. Each phase resets these and the
    // tip rotator picks a new flavor message every few seconds while the
    // generation runs. Token count + tok/s come straight from the stream;
    // progress is estimated against the configured maxTokens for the phase.
    const stream = reactive({
      active: false,
      phase: "",          // "Designing Blueprint" | "Vibe Coding" | "Rendering" | "Refining" | "Retrying"
      subtitle: "",       // optional secondary line
      tokenCount: 0,
      maxTokens: 1,
      tokensPerSec: 0,    // TRUE generation rate (excludes prefill) — what the user wants to read
      elapsedMs: 0,
      prefillMs: 0,       // time-to-first-token; large for big prompts
      preview: "",        // last N chars of the streamed output
      tip: "",            // rotating loader tip
    });

    /**
     * Loader tips. Themed to scene/world generation, in the spirit of
     * "Calibrating polygons" / "Compiling shaders" loading screens that
     * games used to ship with. Pulled from this pool every 2.4s while
     * a generation is running.
     */
    const LOADER_TIPS = [
      "Calibrating polygons…",
      "Compiling shaders…",
      "Tessellating surfaces…",
      "Baking lightmaps…",
      "Aligning normals…",
      "Casting global illumination…",
      "Spawning particle systems…",
      "Sourcing artisanal pixels…",
      "Negotiating with the GPU…",
      "Defragmenting the matrix…",
      "Whispering to the polygons…",
      "Rendering the first triangle…",
      "Tuning the bloom shader…",
      "Folding the mesh in half…",
      "Pre-warming the raytracer…",
      "Inflating ambient occlusion…",
      "Calibrating the skybox…",
      "Polishing the bevels…",
      "Quantum-aligning vertices…",
      "Reticulating splines…",
    ];
    let _tipTimer = null;
    function _rotateTip() {
      const next = LOADER_TIPS[Math.floor(Math.random() * LOADER_TIPS.length)];
      // Avoid the immediate same tip twice in a row.
      stream.tip = next === stream.tip ? LOADER_TIPS[(LOADER_TIPS.indexOf(next) + 1) % LOADER_TIPS.length] : next;
    }
    function _startTipRotator() {
      _stopTipRotator();
      _rotateTip();
      _tipTimer = setInterval(_rotateTip, 2400);
    }
    function _stopTipRotator() {
      if (_tipTimer) {
        clearInterval(_tipTimer);
        _tipTimer = null;
      }
    }

    /**
     * Strip `<think>…</think>` blocks from a streaming preview so the
     * model's internal monologue never leaks into the loading screen
     * (matches the GenerativeText behavior). Tolerates an unterminated
     * `<think>` (live stream): we just hide everything from the open tag
     * onward until `</think>` arrives.
     */
    function _stripThinkForPreview(text) {
      if (!text) return "";
      let out = "";
      let cursor = 0;
      while (cursor < text.length) {
        const open = text.indexOf("<think>", cursor);
        if (open === -1) {
          out += text.slice(cursor);
          break;
        }
        out += text.slice(cursor, open);
        const close = text.indexOf("</think>", open + 7);
        if (close === -1) break; // mid-think, hide tail
        cursor = close + 8;
      }
      return out;
    }

    function _resetStream(phase, maxTokens, subtitle = "") {
      stream.active = true;
      stream.phase = phase;
      stream.subtitle = subtitle;
      stream.tokenCount = 0;
      stream.maxTokens = Math.max(1, maxTokens);
      stream.tokensPerSec = 0;
      stream.elapsedMs = 0;
      stream.prefillMs = 0;
      stream.preview = "";
      _startTipRotator();
    }

    function _endStream() {
      stream.active = false;
      _stopTipRotator();
    }

    /**
     * Estimated progress 0–99% (we never claim 100 until the phase ends —
     * the actual token budget is rarely hit exactly).
     */
    const streamProgress = computed(() => {
      if (!stream.active) return 0;
      const pct = Math.floor((stream.tokenCount / stream.maxTokens) * 100);
      return Math.min(99, Math.max(0, pct));
    });

    // Auto-scroll the live preview to keep the latest tokens visible.
    const streamPreviewEl = ref(null);
    watch(
      () => stream.preview,
      () => {
        nextTick(() => {
          const el = streamPreviewEl.value;
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
    );
    // Use shared inference store for 3D objects
    const objectInferences = computed(() =>
      inferenceStore.state.objectInferences.filter((item) => item?.success !== false),
    );
    const hasCopy = reactive([]);
    const enablePhysics = ref(true);
    const workspaceTab = ref("generate");
    const workspaceTabs = [
      { id: "generate", label: "Generate", icon: "auto_awesome" },
      { id: "build", label: "Build", icon: "construction" },
    ];
    const creationMode = ref("object");
    const objectInputMode = ref("prompt");
    const referenceImage = ref(null);
    const isReferenceGeneration = computed(() =>
      creationMode.value === "object" && objectInputMode.value === "image",
    );
    const effectiveCreationMode = computed(() => isReferenceGeneration.value ? "reference" : creationMode.value);
    const gameProject = ref(loadGameProjectDraft());
    const forgeLevelId = ref(gameProject.value.levelOrder?.[0] || "");
    const forgeObjectId = ref("");
    const forgePosition = reactive({ x: 0, y: 0, z: 0 });
    const forgeRole = ref("prop");
    const interactionSourceId = ref("");
    const interactionTargetId = ref("");
    const interactionType = ref("activates");
    const draggedObjectId = ref("");
    const selectedPlacementId = ref("");
    const levelEditor = ref(null);
    const editorRevision = ref(0);
    const editingBusy = ref(false);
    const buildingPreview = ref(false);
    const editUndo = ref([]), editRedo = ref([]);
    let editCancelled = false, editDisposed = false;
    const pendingPaletteItemId = ref("");
    const buildTool = ref("select");
    const buildTools = [
      { id: "select", label: "Select", icon: "near_me" },
      { id: "start", label: "Start", icon: "flag" },
      { id: "finish", label: "Finish", icon: "sports_score" },
    ];
    const gameplayInstruction = ref("");
    const gameplayUpdating = ref(false);
    const editorBusy = computed(() => editingBusy.value || buildingPreview.value || gameplayUpdating.value || isLoading.value);
    const selectedBuildLevelLibraryId = ref("");
    const selectedBuildObjectLibraryIds = ref([]);
    const buildEditorReady = ref(gameProject.value.levels.length > 0);
    const isPlaytesting = ref(false);
    const gameplaySuggestions = [
      "Collect 5 relics before time runs out",
      "Turn this into a boss level",
      "Make the crystal a speed buff",
    ];
    const objectRoles = [
      { id: "player", label: "Main character", description: "The player-controlled object and level spawn." },
      { id: "enemy", label: "Enemy", description: "Can be attacked and defeated." },
      { id: "trap", label: "Trap", description: "Damages the player on contact." },
      { id: "collectible", label: "Collectible", description: "Adds score and disappears when collected." },
      { id: "buff", label: "Buff", description: "A beneficial pickup for the player." },
      { id: "debuff", label: "Debuff", description: "A harmful pickup or contact effect." },
      { id: "checkpoint", label: "Checkpoint", description: "Stores progress and respawn position." },
      { id: "platform", label: "Platform", description: "Traversable level geometry." },
      { id: "goal", label: "Goal object", description: "An objective or destination inside the level." },
      { id: "prop", label: "Scenery", description: "Visual world-building with no default behavior." },
    ];
    const projectStatus = ref("");
    const agentCompanionId = ref("aurore");
    const agentCompanions = [
      { id: "aurore", name: "Aurore" },
      { id: "mai", name: "Mai" },
      { id: "marcus", name: "Marcus" },
      { id: "jin", name: "Jin" },
      { id: "priya", name: "Priya" },
    ];
    const projectPlacementCount = computed(() =>
      gameProject.value.levels.reduce((total, level) => total + level.placements.length, 0),
    );
    const projectVerdict = computed(() => validateGameProject(gameProject.value));
    const canTokenizeProject = computed(() => projectVerdict.value.ok);
    const agentCompanionName = computed(() =>
      agentCompanions.find((companion) => companion.id === agentCompanionId.value)?.name || "Companion",
    );
    const libraryKind = (item) => {
      const kind = String(item?.assetKind || item?.mode || "object").toLowerCase();
      if (kind === "level" || kind === "scene") return "level";
      if (kind === "game") return "game";
      return "object";
    };
    const buildLibrary = computed(() => {
      const history = objectInferences.value
        .filter((item) => String(item?.code || "").trim())
        .map((item) => ({
          libraryId: `history:${item.id}`,
          inferenceId: item.id,
          kind: libraryKind(item),
          title: item.title || item.prompt || "Untitled asset",
          code: item.code,
          thumbnail: historyThumbnail(item),
          projectManifest: item.projectManifest || null,
          levelProject: item.levelProject || null,
          source: "history",
        }));
      const inferenceIds = new Set(history.map((item) => item.inferenceId));
      const projectObjects = gameProject.value.objects
        .filter((item) => !item.sourceInferenceId || !inferenceIds.has(item.sourceInferenceId))
        .map((item) => ({
          libraryId: `project:${item.id}`,
          projectAssetId: item.id,
          kind: "object",
          elapsedMs: item.elapsedMs,
          title: item.title,
          code: item.code,
          thumbnail: item.thumbnail,
          source: "project",
        }));
      const projectLevels = gameProject.value.levels
        .filter((item) => !item.sourceInferenceId || !inferenceIds.has(item.sourceInferenceId))
        .map((item) => ({
          libraryId: `project:${item.id}`,
          projectAssetId: item.id,
          kind: "level",
          title: item.title,
          code: item.code,
          thumbnail: item.thumbnail,
          source: "project",
        }));
      return history.reverse().concat(projectObjects, projectLevels);
    });
    const buildObjectLibrary = computed(() => buildLibrary.value.filter((item) => item.kind === "object"));
    const historyLevelLibrary = computed(() => buildLibrary.value.filter((item) => item.kind === "level" && item.source === "history"));
    const historyObjectLibrary = computed(() => buildLibrary.value.filter((item) => item.kind === "object" && item.source === "history"));
    const canStartBuildWorkflow = computed(() => historyLevelLibrary.value.length > 0 && historyObjectLibrary.value.length > 0);
    const buildWorkflowComplete = computed(() =>
      selectedBuildLevelLibraryId.value &&
      selectedBuildObjectLibraryIds.value.length > 0 &&
      gameplayInstruction.value.trim(),
    );
    const orderedProjectLevels = computed(() => gameProject.value.levelOrder
      .map((levelId) => gameProject.value.levels.find((level) => level.id === levelId))
      .filter(Boolean));
    const activeLevel = computed(() => gameProject.value.levels.find((level) => level.id === forgeLevelId.value) || null);
    const activeLevelPlacements = computed(() => activeLevel.value?.placements || []);
    const selectedPlacement = computed(() => activeLevelPlacements.value.find((placement) => placement.id === selectedPlacementId.value) || null);
    const selectedPlacementAsset = computed(() => gameProject.value.objects.find((asset) => asset.id === selectedPlacement.value?.objectId) || null);
    const selectedRole = computed(() => objectRoles.find((role) => role.id === selectedPlacement.value?.role) || null);
    const selectedPlacementInteractions = computed(() => gameProject.value.gameplay.interactions.filter(
      (interaction) => interaction.sourcePlacementId === selectedPlacementId.value,
    ));
    const presentation = ref(localStorage.getItem('bonzai-3d-presentation') === 'environment' ? 'environment' : 'studio');
    watch(presentation, value => localStorage.setItem('bonzai-3d-presentation', value));
    const currentTime = ref(localStorage.getItem("bonzai-3d-time") || "day");
    const currentWeather = ref(localStorage.getItem("bonzai-3d-weather") || "sunny");
    const lightIntensity = ref(1.0);
    const loadedModelFilename = ref(null);
    const form = reactive({ prompt: "" });
    const lastGeneratedCode = ref('');
    const lastGeneratedBrief = ref('');
    const lastAssemblyContract = ref(null);
    const assertAssembly = (viewer, allowedErrors = 0) => {
      if (!lastAssemblyContract.value) return null;
      const report=inspectAssembly(viewer.scene.getObjectByName('GeneratedObject'),lastAssemblyContract.value);
      if(report.errors.length>allowedErrors){const error=new Error(report.errors.join('\n'));error.name='AssemblyValidationError';throw error;}
      return report;
    };
    const assemblyPlanningDiagnostics = ref([]);
    const planAssembly = async (brief,mode,reference='') => {
      const result=await requestAssemblyPlan({brief,mode,reference,generate:async prompt=>{
        await window.electronAPI.resetChat();
        const response=await callLLM(prompt,{maxTokens:3200,temperature:.2,thoughtTokens:0,enableThinking:false},({tokenCount,elapsedMs})=>{stream.tokenCount=tokenCount;stream.elapsedMs=elapsedMs;});
        return stripThinkBlocks(response.text);
      }});
      assemblyPlanningDiagnostics.value=result.diagnostics;
      return result.plan;
    };
    const refinePrompt = ref('');
    const downloadProgress = ref(0);
    const modelAvailability = reactive({
      planner: false,
      codegen: false,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL
    // ═══════════════════════════════════════════════════════════════════════
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (access) => {
      hasAccess.value = access;
    };

    const downloadStatus = ref("");
    const isDownloading = ref(false);

    // ═══════════════════════════════════════════════════════════════════════
    // DOWNLOADS TRACKING (matches GenerativeImage pattern)
    // ═══════════════════════════════════════════════════════════════════════
    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0,
      total_progress: 0,
      status: "pending",
      wsUrl: WS_DL,
      pipeline: { tasks: {} },
    });

    const downloadsSocket = ref(null);
    const lastDlEventAt = ref(0);
    let httpPollTimer = null;

    const socketOpts = {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000,
    };

    // Merge task data
    const mergeTask = (existing, incoming) => {
      if (!existing) return { ...incoming };
      return {
        ...existing,
        ...incoming,
        progress:
          incoming.progress !== undefined
            ? incoming.progress
            : existing.progress,
        status: incoming.status || existing.status,
      };
    };

    // Compute total progress from tasks
    const computeTotalFromTasks = (tasks) => {
      const arr = Object.values(tasks);
      if (!arr.length) return 0;
      const sum = arr.reduce((acc, t) => acc + (t.progress || 0), 0);
      return sum / arr.length;
    };

    // Apply pipeline update from server
    const applyPipelineUpdate = (p) => {
      if (!p) return;
      downloads.pipelineId = p.pipeline_id || downloads.pipelineId;
      downloads.status = p.status || downloads.status || "downloading";

      const existing = downloads.pipeline?.tasks || {};
      const incoming = p.tasks || {};
      const merged = { ...existing };
      for (const [tid, t] of Object.entries(incoming)) {
        merged[tid] = mergeTask(existing[tid], t);
      }
      downloads.pipeline = {
        ...(downloads.pipeline || {}),
        ...p,
        tasks: merged,
      };

      const serverPct = Number(p.total_progress ?? 0);
      const tasksPct = computeTotalFromTasks(merged);
      let next =
        Number.isFinite(serverPct) && serverPct > 0 ? serverPct : tasksPct;

      // Don't show 100% until every task is finished
      const allTasksComplete = Object.values(merged).every((t) =>
        ["completed", "failed", "cancelled"].includes(t.status),
      );
      const anyTaskPending = Object.values(merged).some((t) =>
        ["downloading", "pending"].includes(t.status),
      );
      if (!allTasksComplete && next >= 100) {
        next = anyTaskPending ? 99 : 100;
      }

      downloads.progress = next;
      downloads.total_progress = next;

      if (allTasksComplete && downloads.status === "downloading") {
        downloads.status = "completed";
      }

      const wasActive = downloads.active;
      downloads.active = !["completed", "failed", "cancelled"].includes(
        downloads.status,
      );

      // Refresh readiness when download completes
      if (wasActive && !downloads.active && downloads.status === "completed") {
        console.log("[Downloads] Download completed, refreshing readiness");
        refreshRequiredModelAvailability();
      }
    };

    // Ensure WebSocket connection
    const ensureDownloadsSocket = (base = WS_DL) => {
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      downloads.wsUrl = base;
      downloadsSocket.value = io(base, socketOpts);

      downloadsSocket.value.on("connect", () => {
        if (downloads.pipelineId) {
          downloadsSocket.value.emit("subscribe", {
            pipeline_id: downloads.pipelineId,
          });
        }
      });

      downloadsSocket.value.on("download_progress", ({ pipeline }) => {
        lastDlEventAt.value = Date.now();
        if (!pipeline) return;
        applyPipelineUpdate(pipeline);
      });

      downloadsSocket.value.on("disconnect", () => {
        console.warn("[Generative3D] Downloads socket disconnected");
      });
    };

    // HTTP polling fallback
    const kickHttpPollIfStale = (pipelineId) => {
      if (httpPollTimer) clearInterval(httpPollTimer);
      httpPollTimer = setInterval(async () => {
        if (Date.now() - lastDlEventAt.value < 3000) return;
        try {
          const { data } = await axios.get(
            `${SERVER_URL}/downloads/status/${pipelineId}`,
          );
          if (data) {
            applyPipelineUpdate(data);
            if (!downloads.active) {
              clearInterval(httpPollTimer);
              httpPollTimer = null;
            }
          }
        } catch {
          clearInterval(httpPollTimer);
          httpPollTimer = null;
        }
      }, 1000);
    };

    // Connect and subscribe to pipeline
    const connectAndSubscribe = (pipelineId, websocketUrl) => {
      if (!pipelineId) return;
      ensureDownloadsSocket(websocketUrl || WS_DL);
      downloads.active = true;
      downloads.pipelineId = pipelineId;
      downloads.status = downloads.status || "downloading";
      try {
        downloadsSocket.value.emit("subscribe", { pipeline_id: pipelineId });
      } catch {}
      kickHttpPollIfStale(pipelineId);
    };

    // Start download tracking
    const startDownloadTracking = (pipelineId, websocketUrl) => {
      connectAndSubscribe(pipelineId, websocketUrl);
      const t = setInterval(async () => {
        if (!downloads.active && downloads.status !== "failed") {
          clearInterval(t);
          await refreshRequiredModelAvailability();
        }
        if (downloads.status === "failed") clearInterval(t);
      }, 1000);
    };

    // Resume active download if any
    const resumeActiveDownloadIfAny = async () => {
      let hasActiveDownloads = false;

      // Check for active LLM downloads via Electron API
      try {
        const activeLLM =
          (await window.electronAPI?.getActiveDownloads?.()) || [];
        const requiredFilenames = new Set(
          requiredModelFiles.value.map((model) => model.filename),
        );
        const relevantLLM = activeLLM.filter((d) =>
          requiredFilenames.has(d.filename),
        );

        if (relevantLLM.length > 0) {
          hasActiveDownloads = true;
          downloads.active = true;
          downloads.status = "downloading";
          downloads.pipeline = downloads.pipeline || { tasks: {} };

          for (const dl of relevantLLM) {
            const taskId = `llm_${dl.filename}`;
            downloads.pipeline.tasks[taskId] = {
              task_id: taskId,
              filename: dl.filename,
              status: "downloading",
              progress: Math.round((dl.percent || 0) * 100),
            };
          }

          // Subscribe to progress updates
          window.electronAPI.onDownloadProgress((e, data) => {
            if (requiredFilenames.has(data.filename)) {
              const taskId = `llm_${data.filename}`;
              if (downloads.pipeline.tasks[taskId]) {
                downloads.pipeline.tasks[taskId].progress = Math.round(
                  data.percent * 100,
                );
                updateTotalProgress();
              }
            }
          });

          updateTotalProgress();
        }
      } catch (e) {
        console.error(
          "[Generative3D] Failed to check active LLM downloads:",
          e,
        );
      }

      if (!hasActiveDownloads) {
        downloads.active = false;
      }
    };

    // Computed: sorted task list for display
    const downloadTaskList = computed(() => {
      const tasks = downloads.pipeline?.tasks || {};
      const arr = Object.values(tasks);
      const order = {
        downloading: 0,
        pending: 1,
        completed: 2,
        failed: 3,
        cancelled: 4,
      };
      return arr
        .map((t) => ({ ...t }))
        .sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));
    });

    // Computed: needs download if either required LLM model is missing
    const needsDownload = computed(() => !isModel.value);

    let downloadRun = 0;
    const isCancellingDownloads = ref(false);
    const cancelActiveDownloads = async () => {
      isCancellingDownloads.value = true;
      downloadRun++;
      try {
        await cancelLocalDownloads({ filenames: Object.values(downloads.pipeline?.tasks || {}).filter(task => !['completed', 'failed', 'cancelled'].includes(task.status)).map(task => task.filename) });
        downloads.status = 'cancelled';
        downloads.active = false;
      } catch { downloads.status = 'failed'; }
      finally { isCancellingDownloads.value = false; }
    };
    // Download required models (LLM)
    const downloadAllModels = async () => {
      if (downloads.active || isCancellingDownloads.value) return;
      const run = ++downloadRun;

      downloads.active = true;
      downloads.status = "downloading";
      downloads.progress = 0;
      downloads.total_progress = 0;
      downloads.pipeline = { tasks: {} };

      try {
        for (const model of missingRequiredModels.value) {
          if (run !== downloadRun) return;
          const llmTaskId = `llm-${model.filename}`;
          downloads.pipeline.tasks[llmTaskId] = {
            task_id: llmTaskId,
            filename: model.filename,
            label: model.role,
            status: "downloading",
            progress: 0,
          };

          const llmProgressHandler = (e, data) => {
            if (run === downloadRun && data.filename === model.filename) {
              const pct = Math.round(data.percent * 100);
              downloads.pipeline.tasks[llmTaskId].progress = pct;
              updateTotalProgress();
            }
          };
          window.electronAPI.onDownloadProgress(llmProgressHandler);

          const success = await window.electronAPI.downloadModel(
            model.url,
            model.filename,
          );

          if (run !== downloadRun) return;
          if (success) {
            downloads.pipeline.tasks[llmTaskId].status = "completed";
            downloads.pipeline.tasks[llmTaskId].progress = 100;
            for (const role of model.roles || [model.role]) {
              modelAvailability[role.toLowerCase()] = true;
            }
          } else {
            downloads.pipeline.tasks[llmTaskId].status = "failed";
          }
          updateTotalProgress();
        }

        if (isModel.value) {
          downloads.status = "completed";
          downloads.progress = 100;
          downloads.total_progress = 100;
        } else {
          downloads.status = "failed";
        }
      } catch (e) {
        if (run !== downloadRun) return;
        console.error("Download error:", e);
        downloads.status = "failed";
      } finally {
        if (run !== downloadRun) return;
        if (downloads.status === "completed") {
          await new Promise((r) => setTimeout(r, 1500));
        }
        downloads.active = false;
      }
    };

    // Helper to update total progress from all tasks
    const updateTotalProgress = () => {
      const tasks = Object.values(downloads.pipeline?.tasks || {});
      if (!tasks.length) return;
      const sum = tasks.reduce((acc, t) => acc + (t.progress || 0), 0);
      const pct = sum / tasks.length;
      downloads.progress = pct;
      downloads.total_progress = pct;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LAZY LOADING PAGINATION
    // ═══════════════════════════════════════════════════════════════════════
    const ITEMS_PER_PAGE = 10;
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);

    // Reversed inferences (most recent first) with original index
    const reversedInferences = computed(() => {
      return objectInferences.value
        .map((item, idx) => ({
          ...item,
          _originalIndex: idx,
        }))
        .reverse();
    });

    // Displayed inferences (lazy loaded subset)
    const paginatedInferences = computed(() => {
      return reversedInferences.value.slice(0, displayedCount.value);
    });

    // Check if there are more items to load
    const hasMore = computed(
      () => displayedCount.value < objectInferences.value.length,
    );

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          objectInferences.value.length,
        );
        isLoadingMore.value = false;
      }, 100);
    };

    // Intersection Observer for infinite scroll
    let scrollObserver = null;
    const setupScrollObserver = () => {
      if (scrollObserver) scrollObserver.disconnect();
      if (!loadMoreSentinel.value) return;

      // Use the scroll container as root for proper intersection detection
      const root =
        scrollContainer.value ||
        document.querySelector(".models__deployment-install");
      scrollObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore.value) {
            loadMore();
          }
        },
        { root, rootMargin: "100px" },
      );
      scrollObserver.observe(loadMoreSentinel.value);
    };

    // Scroll to top handler
    const scrollToTop = () => {
      const container =
        scrollContainer.value ||
        document.querySelector(".models__deployment-install");
      if (container) {
        container.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    // Handle scroll to show/hide scroll-to-top button (throttled)
    let scrollRafId = null;
    const handleScroll = (e) => {
      if (scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        const scrollTop = e.target?.scrollTop || 0;
        showScrollTop.value = scrollTop > 400;
        scrollRafId = null;
      });
    };

    // ═══════════════════════════════════════════════════════════════════════
    // SCREENSHOT MODAL
    // ═══════════════════════════════════════════════════════════════════════
    const screenshotModal = reactive({
      visible: false,
      shots: [],
      currentIndex: 0,
      currentShot: null,
      inferenceId: null,
    });

    const openScreenshotModal = (item, index) => {
      screenshotModal.shots = item.screenshots || [];
      screenshotModal.currentIndex = index;
      screenshotModal.currentShot = screenshotModal.shots[index] || null;
      screenshotModal.inferenceId = item.id;
      screenshotModal.visible = true;
    };

    const closeScreenshotModal = () => {
      screenshotModal.visible = false;
    };

    const navigateScreenshot = (direction) => {
      const newIndex = screenshotModal.currentIndex + direction;
      if (newIndex >= 0 && newIndex < screenshotModal.shots.length) {
        screenshotModal.currentIndex = newIndex;
        screenshotModal.currentShot = screenshotModal.shots[newIndex];
      }
    };

    const downloadScreenshot = (shot) => {
      if (!shot?.dataUrl) return;
      const link = document.createElement("a");
      link.href = shot.dataUrl;
      link.download = `3d-object-${shot.name || "screenshot"}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const downloadAllScreenshots = () => {
      screenshotModal.shots.forEach((shot, idx) => {
        setTimeout(() => downloadScreenshot(shot), idx * 200);
      });
    };

    const canSubmitWithAccess = computed(() => {
      return (
        (form.prompt.trim() || (isReferenceGeneration.value && referenceImage.value)) &&
        !isLoading.value &&
        isModel.value
      );
    });

    const onReferenceImagePicked = (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        lastStatus.value = "Please choose an image file";
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || "");
        try {
          const image = await loadBrowserImage(dataUrl);
          if (image.width < 256 || image.height < 256) {
            lastStatus.value = "Reference image must be at least 256 x 256";
            return;
          }
          referenceImage.value = {
            name: file.name,
            mime: file.type || "image/png",
            width: image.width,
            height: image.height,
            dataUrl,
          };
        } catch {
          lastStatus.value = "Could not decode the reference image";
        }
      };
      reader.onerror = () => {
        lastStatus.value = "Could not read the reference image";
      };
      reader.readAsDataURL(file);
      event.target.value = "";
    };

    const removeReferenceImage = () => {
      referenceImage.value = null;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // STATIC DATA
    // ═══════════════════════════════════════════════════════════════════════
    const lightingPresets = ref([
      { id: "sunrise", label: "Sunrise", icon: "🌅", class: "wb_twilight" },
      { id: "day", label: "Day", icon: "☀️", class: "wb_sunny" },
      { id: "afternoon", label: "Afternoon", icon: "🌤️", class: "wb_sunny" },
      { id: "sunset", label: "Sunset", icon: "🌇", class: "wb_twilight" },
      { id: "night", label: "Night", icon: "🌙", class: "moon_stars" },
    ]);

    const weatherOptions = ref([
      { id: "sunny", label: "Clear", icon: "☀️", class: "wb_sunny" },
      { id: "cloudy", label: "Clouds", icon: "☁️", class: "cloud" },
      { id: "rainy", label: "Rain", icon: "🌧️", class: "rainy" },
      { id: "stormy", label: "Storm", icon: "🌧️", class: "rainy" },
      { id: "snowy", label: "Snow", icon: "❄️", class: "weather_snowy" },
      { id: "blizzard", label: "Blizzard", icon: "❄️", class: "weather_snowy" },
      { id: "foggy", label: "Fog", icon: "🌫️", class: "foggy" },
    ]);

    // Performance tiers — engine-level quality preset. Dials pixel ratio,
    // N8AO, SMAA, bloom kernel, DoF gating, shadow map size, and BVH
    // auto-build threshold.
    const performancePresets = ref([
      { id: "low",    label: "Low",    class: "battery_android_full" },
      { id: "medium", label: "Medium", class: "speed" },
      { id: "high",   label: "High",   class: "bolt" },
      { id: "ultra",  label: "Ultra",  class: "diamond" },
    ]);
    const currentPerformance = ref("high");

    // 3D model split:
    // - Planner rewrites the prompt into a geometric blueprint.
    // - Codegen writes the actual Three.js object.
    const plannerModel = computed(() =>
      modelFromResolved(resolveLLM(DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER), "Planner"),
    );
    const codeModel = computed(() =>
      modelFromResolved(resolveLLM(DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER), "Codegen"),
    );
    const requiredModels = computed(() => [plannerModel.value, codeModel.value]);
    const requiredModelFiles = computed(() => {
      const byFilename = new Map();
      for (const model of requiredModels.value) {
        const existing = byFilename.get(model.filename);
        if (existing) {
          existing.roles.push(model.role);
          existing.role = existing.roles.join(" + ");
        } else {
          byFilename.set(model.filename, { ...model, roles: [model.role] });
        }
      }
      return [...byFilename.values()];
    });

    const reasoningEnabled = ref(false);

    const currentModel = computed(() => codeModel.value);
    const missingRequiredModels = computed(() =>
      requiredModelFiles.value.filter((model) =>
        model.roles.some((role) => !modelAvailability[role.toLowerCase()]),
      ),
    );
    const isModel = computed(() => missingRequiredModels.value.length === 0);

    // ═══════════════════════════════════════════════════════════════════════
    // PROMPT BUILDERS
    // ═══════════════════════════════════════════════════════════════════════
    const waitForVisionDownload = async (pipelineId) => {
      const deadline = Date.now() + 30 * 60 * 1000;
      startDownloadTracking(pipelineId);
      while (Date.now() < deadline) {
        const { data } = await axios.get(
          `${SERVER_URL}/downloads/status/${pipelineId}`,
          { timeout: 15000 },
        );
        applyPipelineUpdate(data);
        if (data?.status === "completed") return;
        if (data?.status === "failed" || data?.status === "cancelled") {
          const failedTask = Object.values(data?.tasks || {}).find(
            (task) => task.status === "failed",
          );
          throw new Error(
            failedTask?.error_message ||
              `Vision model download ${data.status}. Retry the model download.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Vision model download timed out after 30 minutes.");
    };

    const visionResponseText = (result) => {
      const body = result?.data || result?.result || result;
      return body?.response || body?.text || body?.analysis || "";
    };

    const runVisionAnalysis = async (imageDataUrl, prompt, maxTokens = 1400, { localReview = false } = {}) => {
      if (localReview) imageDataUrl = await resizeReviewImage(imageDataUrl);
      const payload = {
        image_base64: String(imageDataUrl).replace(/^data:image\/[^;]+;base64,/, ""),
        prompt,
        max_tokens: maxTokens,
        auto_download: !localReview,
        ...(localReview ? { review: true } : {}),
      };
      if (localReview) {
        // Use the shared local vision pool directly; no Flask startup, remote
        // routing or implicit model download is needed for quality review.
        if (window.electronAPI?.analyzeLocalImage) {
          const result=await window.electronAPI.analyzeLocalImage(payload);
          if(result?.error)throw new Error(result.error);
          const response=typeof result==='string'?result:visionResponseText(result);
          if(!response)throw new Error("Local visual review returned no assessment");
          return response;
        }
        const { data } = await axios.post("http://127.0.0.1:3002/api/vision/analyze", payload, { timeout: 600000 });
        if (data?.error) throw new Error(data.error);
        const response = visionResponseText(data);
        if (!response) throw new Error("Local visual review returned no assessment");
        return response;
      }
      const requestVision = async () => {
        const routed = await routeFlaskRequest("/vision/analyze", payload);
        return routed.handled
          ? routed.result
          : (
              await axios.post(`${SERVER_URL}/vision/analyze`, payload, {
                timeout: 600000,
              })
            ).data;
      };

      let result = await requestVision();
      if (result?.error) throw new Error(result.error);
      if (!visionResponseText(result) && result?.pipeline_id) {
        lastStatus.value = "Downloading vision model...";
        _resetStream(
          "Preparing Vision",
          1,
          "Downloading and validating the image analysis model.",
        );
        await waitForVisionDownload(result.pipeline_id);
        payload.auto_download = false;
        result = await requestVision();
      }

      if (result?.error) throw new Error(result.error);
      const response = visionResponseText(result);
      if (!response) throw new Error("Vision model returned no reconstruction analysis");
      return String(response).trim();
    };

    const analyzeReferenceFor3D = (imageDataUrl, instruction) =>
      runVisionAnalysis(
        imageDataUrl,
        `Analyze the single visible subject for procedural Three.js reconstruction.
User intent: ${instruction || "faithful real-time browser reconstruction"}

Report only observable evidence. Cover:
1. suitability: pass, conditional, or reject, with occlusion and hidden-side uncertainty;
2. camera/view angle and silhouette;
3. macro dimensions normalized to total height 1.0;
4. every visible component from largest to smallest, with parent attachment, position, rotation, dimensions, and best geometry primitive or profile;
5. material regions with approximate hex colors, metalness, roughness, transmission, clearcoat and emissive evidence;
6. repeated details, openings, bevels, seams, fasteners, decals and surface wear;
7. identity-critical features that must survive simplification;
8. suggested pivots, sockets and colliders.

Use exact 3D vocabulary. Do not invent unseen details. This analysis will be passed to a code-generating LLM.`,
        900,
      );

    const loadBrowserImage = (src) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });

    const makeReferenceComparison = async (referenceDataUrl, renderDataUrl) => {
      const [reference, render] = await Promise.all([
        loadBrowserImage(referenceDataUrl),
        loadBrowserImage(renderDataUrl),
      ]);
      const width = 1600;
      const height = 800;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#11141d";
      context.fillRect(0, 0, width, height);
      const drawContain = (image, x, w) => {
        const scale = Math.min(w / image.width, height / image.height);
        const dw = image.width * scale;
        const dh = image.height * scale;
        context.drawImage(image, x + (w - dw) / 2, (height - dh) / 2, dw, dh);
      };
      drawContain(reference, 0, width / 2);
      drawContain(render, width / 2, width / 2);
      context.fillStyle = "rgba(17,20,29,0.9)";
      context.fillRect(0, 0, width, 40);
      context.fillStyle = "#f0f0f5";
      context.font = "18px sans-serif";
      context.fillText("REFERENCE", 20, 27);
      context.fillText("BONZAI RENDER", width / 2 + 20, 27);
      return canvas.toDataURL("image/jpeg", 0.9);
    };

    // PROMPT ENHANCER — decompose vague descriptions into geometric blueprints
    // ═══════════════════════════════════════════════════════════════════════
    const buildEnhancePrompt = (userText, referenceAnalysis = "") => {
      if (isReferenceGeneration.value) {
        return `/no_think
You are a procedural 3D reconstruction architect. Convert visual evidence into a compact, implementation-ready ASSEMBLY BLUEPRINT. Do not write code or a thinking process.

USER INTENT: "${userText || "Faithfully reconstruct the reference object"}"

VISION EVIDENCE:
${referenceAnalysis}

Resolve the evidence into a parent-child component hierarchy with normalized dimensions, transforms, geometry strategies, material parameters, attachment points, repetition systems and identity-critical details. Use y=0 as ground and total height 0.3-1.5 units. Preserve silhouette and proportions above decorative atmosphere. Mark uncertain hidden geometry as inferred and use the simplest symmetric continuation supported by evidence. Do not redesign, embellish or add unrelated effects.

FORMAT: 350-650 words of dense structured prose with explicit component names and numeric measurements. No markdown, no code, no <think>.`;
      }
      if (creationMode.value === "game") {
        return `/no_think
You are a game director and systems designer. Return a compact GAME BLUEPRINT for the request below. Do not write code or a thinking process.

GAME: "${userText}"

Define: genre and camera; player fantasy and controls; one complete gameplay loop; world layout; actors and hazards; a measurable primary objective; scoring, health and fail state; feedback and atmosphere. Scope the result to a polished five-minute playable vertical slice. Every mechanic must be implementable with Three.js, Rapier and BonzAI GAME APIs. Preserve the user's premise exactly.

FORMAT: 180-280 words, dense prose, no markdown, no bullets, no <think>.`;
      }
      if (creationMode.value === 'level') {
        return `/no_think
Plan this Three.js environment in 350-550 words: ${userText}
Specify world-scale dimensions in metres and an authored, finished environment. Plan foreground/midground/background, walkable routes, entrances, vertical changes and sightlines to distinct landmarks. For each landmark define its silhouette, secondary construction (thickness, supports, openings, bevels, trims) and a few meaningful close-up details. Plan terrain transitions and grounded props instead of a flat plane with scattered placeholder primitives. Provide physical material values, texture tiling in metres and relief scales; await MAT.scanned supplies bundled 2K photographic PBR across masonry, wood, metal, cloth, leather, stone, terrain and more, while MAT.surface provides procedural stone/concrete/wood/metal/fabric/ground/sand PBR, and H.bevelBox provides reusable bevelled geometry. H.bevelPanel(contour,{depth,bevel,holes}) builds real openings; H.latheProfile([[radius,height],...]) builds turned sections; H.worldUV(geometry,tileSizeInMetres) gives consistent texture scale across differently sized modules. Use instancing and shared modules to keep detail within 160 draw calls/600k triangles. Identify coplanar surfaces and avoid z-fighting. Preserve the user's theme and an explicitly minimal/low-poly style. Do not shrink a level to a 1.5-unit object or add unrequested gameplay. Output only a concrete construction plan.`;
      }
      return `/no_think
You are a procedural 3D production designer. Plan the exact asset below before implementation.
BRIEF: ${userText}
Return a structured assembly plan of 350-550 words with these sections:
First identify the object's operating principle and indispensable components. Choose one coherent mechanism consistent with the request; never combine incompatible mechanisms just to add details. For example, a battery lantern needs a compact battery base, a visible LED/light chamber and protective glazing; a fuel lantern needs a reservoir below a burner and a clear chimney, not a solid opaque cylinder through the illuminated chamber. Keep variations subordinate to function and recognizability.
1. Silhouette and dimensions: proportions, ground y=0, longest dimension about 1.5 normalized scene units (not a claim about real-world size).
2. Named parts: resolve actual cross-sections and negative spaces, not a stack of rough placeholders. Give a compact part table with parent, geometry strategy (lathe profile, bevelled extrusion, tube, instancing, custom mesh), dimensions, position and exact attachment/contact points.
State material families only in this plan; do not invent scanned material IDs. The coding step receives the actual catalogue shortlist.
3. Materials: For realistic surfaces use await MAT.scanned(id,{normalStrength:.5,aoIntensity:.65}); the runtime supplies a relevant shortlist from its extensive local photographic PBR catalogue. Plan metre-based UVs and use untinted scanned albedo. Other materials: physical palette, roughness, metalness, transparent thickness, procedural texture scale and small surface details. MAT.surface(kind,{color,repeat,relief,seed}) supplies matched local color/bump/roughness maps for stone, concrete, wood, metal, fabric, ground and sand. H.bevelBox supplies rounded boxes, H.latheProfile takes [radius,height] arrays for hollow/turned cross-sections, H.bevelPanel takes [x,y] contours and holes for bevelled plates/arches, and H.worldUV bakes metre-based texture coordinates; use shaped profiles for identity-critical forms. Specify where these actually improve construction. No emission unless the material emits light.
4. Motion and interaction: only when appropriate to the subject; specify how moving parts remain connected. Water has visible flow, contained surfaces and realistic landing points.
5. Construction checks: list visible acceptance criteria and exact contact points for the code generator to verify. Distinctive construction details, repeated geometry to instance, essential engine techniques and sensible laptop performance budget.
Prioritize faithful geometry, restrained materials and a readable silhouette. No mandatory magical decoration or post effects. Explicit user instructions override all inferred choices. Output the plan only, not code or reasoning.`;
    };

    // ═══════════════════════════════════════════════════════════════════════
    const buildObjectPrompt = (userText, originalBrief = userText, variation = "") => {
      const skillsContext = selectThreeReferences(`${originalBrief}\n${userText}`, skillFiles);

      const gameContract = creationMode.value === "game" ? `

═══ GAMEPLAY CONTRACT ═══
This is a PLAYABLE GAME, not a diorama. Build the complete world under root, then:
- Create exactly one session with GAME.create({ title, genre, state, objectives }).
- Build each playable environment as its own THREE.Group and register it with game.level(id, group, { entry }).
- Multi-level games must call game.goToLevel(id) and use level-change triggers instead of keeping every level visible.
- Register a visible player with game.player(playerMesh, { speed, cameraOffset }).
- Register enemies, collectibles and goal zones with game.actor() and game.trigger().
- Implement interaction, damage, collection, scoring and enemy behavior through actor update functions and game events.
- Include an explicit win condition and fail state. Start with game.start().
- Use GAME input actions only. Do not add DOM listeners, requestAnimationFrame, HTML or a second render loop.
- Keep the game immediately playable with WASD/arrows, Shift and E/Space.
- The visual bar remains identical to a hero scene: authored materials, atmospheric depth, animation, lighting and post effects.

Core API:
const game = GAME.create({title, genre?, state?, objectives:[{id,type:'collect|score|defeat|reach|survive|custom',label,target,tag?,trigger?}]});
game.player(object,{speed?,sprintMultiplier?,cameraOffset?,update?});
game.level(id,object,{entry?}); game.goToLevel(id);
game.actor(id,object,{tags?,health?,radius?,score?,update?});
game.trigger(id,object,{radius?,once?,onEnter?});
game.collect(id,amount?,tag?); game.damage(id,amount,source?); game.score(amount,reason?);
game.on(event,handler); game.emit(event,detail?); game.checkpoint(id); game.restore(id);
game.agent({companionId,damage?}); game.stopAgent();
game.input.down(action); game.input.pressed(action); game.start();
` : "";
      const reconstructionContract = isReferenceGeneration.value ? `

═══ RECONSTRUCTION CONTRACT ═══
This is reference reconstruction, not concept art.
- Match the supplied blueprint's silhouette, proportions, view angle and material boundaries.
- Build a named parent-child hierarchy. Every visible component in the blueprint must exist.
- Use primitives only where they preserve form. Use Shape+ExtrudeGeometry, LatheGeometry, TubeGeometry or custom BufferGeometry for identity-critical profiles.
- Add bevels, seams, fasteners and repeated details explicitly or through instancing.
- Use measured dimensions and attachment contact. No floating parts.
- Keep hidden faces conservative and symmetric unless the evidence says otherwise.
- Set root.userData.sculptRuntime = { nodes, sockets, colliders } with named maps.
- Do not add unrelated particles, fantasy effects, pedestals or ornaments merely to satisfy visual richness.
- Material fidelity and readable geometry take precedence over cinematic decoration.
` : "";

      if (isReferenceGeneration.value) {
        return `You are an expert procedural Three.js reconstruction engineer.

CRITICAL: Output ONLY raw JavaScript. No reasoning, prose, markdown fences, imports or requestAnimationFrame. Start with setObjectInfo().

ORIGINAL BRIEF:
${originalBrief}

RECONSTRUCTION BLUEPRINT:
${userText}
${reconstructionContract}

${sceneContract('object')}

Implementation requirements:
1. Establish a nodes object and build the complete named component hierarchy.
2. Match every numeric transform and material boundary in the blueprint.
3. Prefer ExtrudeGeometry, LatheGeometry, TubeGeometry, Shape holes, instancing and custom BufferGeometry when primitives cannot preserve the silhouette.
4. Use MeshPhysicalMaterial for measured PBR properties when a MAT preset is not a close match.
5. Add only evidence-backed texture, wear, seams, fasteners and decals.
6. Attach every child physically to its parent. Ground the object at y=0.
7. Add sockets and simple collider descriptors for movable or interactive parts.
8. Set root.userData.sculptRuntime = { nodes, sockets, colliders }.
9. Use the existing neutral presentation. Add animation or FX only when visible evidence or user intent requires it.
10. Keep total object height between 0.3 and 1.5 units and return a valid root.

Relevant Three.js references:
${skillsContext}

OUTPUT RAW JAVASCRIPT:`;
      }

      return buildScenePrompt({ mode: creationMode.value, brief: originalBrief || userText, plan: userText, references: skillsContext, variation, gameContract: gameContract + (creationMode.value === 'level' ? "\nLEVEL OVERRIDE: Use world-scale dimensions in metres. Set root.userData.worldScale = true. Build a traversable environment, not a miniature object; include the requested terrain and architecture." : "") });
    };

    const buildRefinePrompt = (existingCode, instruction) => {
      return buildSceneRevision({ mode: creationMode.value, code: existingCode, instruction, references: selectThreeReferences(instruction, skillFiles) });
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LLM
    // ═══════════════════════════════════════════════════════════════════════
    /**
     * Streaming LLM call — tokens arrive over IPC in real time, the
     * loading screen updates as they land. Falls back to the legacy
     * non-streaming path if the renderer doesn't expose chatStream.
     *
     * Caller-supplied `onProgress({text, tokenCount, elapsedMs})` is
     * invoked on every chunk; the 3D pipeline uses it to feed the
     * game-style loading screen with a live preview + tok/s readout.
     */
    const callLLM = async (prompt, options = {}, onProgress) => {
      const canStream =
        typeof window?.electronAPI?.chatStream === "function" &&
        typeof window?.electronAPI?.onChatToken === "function";

      const extraOpts = { isolated: true };
      if (window.electronAPI.completionBudget) {
        const budget = await window.electronAPI.completionBudget(prompt, options.maxTokens || 2048);
        if (options.maxTokens >= 8192 && budget.maxTokens < 4096) throw new Error(`Only ${budget.maxTokens} output tokens fit in the loaded ${budget.context}-token context. Try a shorter scene description or a smaller model.`);
        options = { ...options, maxTokens: budget.maxTokens };
        stream.maxTokens = budget.maxTokens;
      }
      if (options.maxTokens) extraOpts.maxTokens = options.maxTokens;
      if (options.temperature !== undefined) extraOpts.temperature = options.temperature;
      if (options.thoughtTokens !== undefined) extraOpts.thoughtTokens = options.thoughtTokens;
      if (typeof options.enableThinking === "boolean") extraOpts.enableThinking = options.enableThinking;

      if (!canStream) {
        // Legacy non-streaming path (left in place so callers without
        // streaming support still work).
        if (!window.electronAPI?.chat) throw new Error("Chat API not available");
        const response = await Promise.race([
          window.electronAPI.chat(prompt, { ...extraOpts, returnMetadata: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3600000)),
        ]);
        if (!response) throw new Error("Empty response from LLM");
        if (typeof response === "object" && response.text !== undefined) return response;
        return { text: String(response), tokenCount: 0, elapsedMs: 0 };
      }

      // Streaming path
      let fullText = "";
      let tokenCount = 0;
      const startedAt = performance.now();
      // Time-to-first-token marks the prefill boundary. Everything before
      // it = attention compute over the prompt; after = pure generation.
      // Splitting them is the only honest way to display tok/s — if a
      // 30B model takes 60s to chew through 10K tokens of system prompt
      // and then generates 5K tokens at 10 tok/s, the naïve "total /
      // elapsed" rate reads as 4.5 tok/s which is misleading.
      let firstTokenAt = 0;

      const unsubscribe = window.electronAPI.onChatToken((chunk) => {
        if (typeof chunk !== "string" || chunk.length === 0) return;
        if (firstTokenAt === 0) firstTokenAt = performance.now();
        tokenCount++;
        fullText += chunk;
        const now = performance.now();
        const elapsedMs = now - startedAt;
        const prefillMs = firstTokenAt - startedAt;
        const genMs = now - firstTokenAt;
        try {
          onProgress?.({
            text: fullText,
            tokenCount,
            elapsedMs,
            prefillMs,
            genMs,
          });
        } catch (e) {
          console.warn("[3D] stream onProgress threw:", e);
        }
      });

      try {
        const result = await window.electronAPI.chatStream(prompt, extraOpts);
        // chatStream returns the assistant text — prefer it over our
        // accumulated buffer in case the IPC ordering ever drops a chunk.
        if (typeof result === "string" && result.length >= fullText.length) {
          fullText = result;
        }
      } finally {
        unsubscribe();
      }

      const finishedAt = performance.now();
      return {
        text: fullText,
        tokenCount,
        elapsedMs: finishedAt - startedAt,
        prefillMs: firstTokenAt > 0 ? firstTokenAt - startedAt : 0,
        genMs: firstTokenAt > 0 ? finishedAt - firstTokenAt : 0,
      };
    };

    // ═══════════════════════════════════════════════════════════════════════
    // UI ACTIONS
    // ═══════════════════════════════════════════════════════════════════════
    const setTimeOfDay = (time) => {
      currentTime.value = time;
      localStorage.setItem("bonzai-3d-time", time);
      threeViewer.value?.setTimeOfDay(time);
    };

    const setPerformance = (level) => {
      currentPerformance.value = level;
      threeViewer.value?.setRenderQuality(level);
    };
    const setWeather = (weather) => {
      currentWeather.value = weather;
      localStorage.setItem("bonzai-3d-weather", weather);
      threeViewer.value?.setWeather(weather);
    };

    const setLightIntensity = (intensity) => {
      lightIntensity.value = intensity;
      threeViewer.value?.setLightIntensity(intensity);
    };

    const restoreViewerEnvironmentControls = () => {
      const viewer = threeViewer.value;
      if (!viewer) return;
      viewer.setTimeOfDay(currentTime.value);
      viewer.setWeather(currentWeather.value);
      viewer.setRenderQuality(currentPerformance.value);
      viewer.setLightIntensity(lightIntensity.value);
    };

    const waitForViewerReady = async (timeoutMs = 5000) => {
      const start = performance.now();
      while (performance.now() - start < timeoutMs) {
        const viewer = threeViewer.value;
        if (
          viewer?.isReady &&
          viewer?.scene &&
          viewer?.renderer &&
          viewer?._sceneObjects?.get?.("ground")
        ) {
          return viewer;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return threeViewer.value;
    };

    const clearScene = () => {
      if (!lastGeneratedCode.value || isLoading.value) return;
      clearDeleteToastTimer();
      pendingDelete.value = { scene: true };
    };

    const saveCurrentAsset = async (kind) => {
      if (!lastGeneratedCode.value) return;
      const snapshot = await captureViewerSnapshot(kind === "level" ? "Level" : "Object");
      const title = form.prompt.trim() || `${kind === "level" ? "Level" : "Object"} ${
        kind === "level" ? gameProject.value.levels.length + 1 : gameProject.value.objects.length + 1
      }`;
      if (kind === "level") {
        const level = addLevel(gameProject.value, {
          title,
          code: lastGeneratedCode.value,
          thumbnail: snapshot?.dataUrl || "",
        });
        forgeLevelId.value = level.id;
      } else {
        const asset = addObjectAsset(gameProject.value, {
          title,
          code: lastGeneratedCode.value,
          source: isReferenceGeneration.value ? "image" : "text",
          thumbnail: snapshot?.dataUrl || "",
        });
        forgeObjectId.value = asset.id;
      }
      projectStatus.value = `${title} added to ${gameProject.value.title}`;
    };

    const materializeBuildAsset = (item) => {
      if (item.kind === "game") {
        if (!item.projectManifest) throw new Error("This game history entry has no editable manifest.");
        const manifest = structuredClone(item.projectManifest);
        gameProject.value = {
          schema: manifest.schema,
          version: manifest.version,
          id: manifest.projectId,
          title: manifest.title,
          description: manifest.description || "",
          objects: manifest.objects || [],
          levels: manifest.levels || [],
          levelOrder: manifest.levelOrder || [],
          gameplay: manifest.gameplay,
          ownership: { collectible: null, token: null },
          createdAt: manifest.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        forgeLevelId.value = gameProject.value.levelOrder[0] || "";
        return gameProject.value;
      }
      if (item.kind === "level") {
        const existing = item.projectAssetId
          ? gameProject.value.levels.find((level) => level.id === item.projectAssetId)
          : gameProject.value.levels.find((level) => level.sourceInferenceId === item.inferenceId);
        if (existing) return existing;
        if(item.levelProject) return importLevelSnapshot(gameProject.value,item.levelProject,{sourceInferenceId:item.inferenceId||'',thumbnail:item.thumbnail});
        return addLevel(gameProject.value, {
          title: item.title,
          code: item.code,
          sourceInferenceId: item.inferenceId || "",
          thumbnail: item.thumbnail,
        });
      }
      const existing = item.projectAssetId
        ? gameProject.value.objects.find((asset) => asset.id === item.projectAssetId)
        : gameProject.value.objects.find((asset) => asset.sourceInferenceId === item.inferenceId);
      if (existing) return existing;
      return addObjectAsset(gameProject.value, {
        title: item.title,
        code: item.code,
        source: "history",
        sourceInferenceId: item.inferenceId || "",
        thumbnail: item.thumbnail,
      });
    };

    const useBuildAsset = async (item) => {
      try {
        const asset = materializeBuildAsset(item);
        if (item.kind === "game") {
          buildEditorReady.value = true;
          workspaceTab.value = "build";
          await previewLevelEditor(false);
          projectStatus.value = `${gameProject.value.title} opened from history.`;
          return;
        }
        if (item.kind === "level") {
          forgeLevelId.value = asset.id;
          buildEditorReady.value = true;
          workspaceTab.value = "build";
          await previewLevelEditor(false);
          projectStatus.value = `${asset.title} is now the active level.`;
          return;
        }
        forgeObjectId.value = asset.id;
        projectStatus.value = `${asset.title} selected. Drag it onto the level to place it.`;
      } catch (error) {
        projectStatus.value = error.message;
      }
    };

    const useBuildStarter = (example) => {
      creationMode.value = "level";
      form.prompt = example.prompt;
      workspaceTab.value = "generate";
      showExamples.value = false;
      nextTick(() => scrollToTop());
    };

    const createLevelFromBuild = () => {
      creationMode.value = "level";
      form.prompt = "";
      workspaceTab.value = "generate";
      nextTick(() => scrollToTop());
    };

    const createObjectFromBuild = () => {
      creationMode.value = "object";
      form.prompt = "";
      workspaceTab.value = "generate";
      nextTick(() => scrollToTop());
    };

    const selectBuildLevel = async (levelId) => {
      forgeLevelId.value = levelId;
      selectedPlacementId.value = "";
      buildTool.value = "select";
      try {
        editUndo.value=[]; editRedo.value=[];
        buildEditorReady.value=true;
        await previewLevelEditor(false);
        workspaceTab.value = "build";
        projectStatus.value = t('levelEditor.ready');
      } catch (error) {
        const level = gameProject.value.levels.find((candidate) => candidate.id === levelId);
        if (level?.code) await threeViewer.value?.applyModuleCode(normalizeLLMCode(level.code), "replace", {kind: "level"});
        projectStatus.value = `Level opened. ${error.message}`;
      }
    };

    const moveActiveLevel = (direction) => {
      moveLevel(gameProject.value, forgeLevelId.value, direction);
    };

    const selectPaletteAsset = (item) => {
      try {
        const asset = materializeBuildAsset(item);
        forgeObjectId.value = asset.id;
        pendingPaletteItemId.value = item.libraryId;
        buildTool.value = "select";
        projectStatus.value = `${asset.title} selected. Click the level or drag it to place copies.`;
      } catch (error) {
        projectStatus.value = error.message;
      }
    };

    const formatVector = (value = {}) => ["x", "y", "z"]
      .map((axis) => Number(value[axis] || 0).toFixed(1))
      .join(", ");

    const placementLabel = (placement) => {
      const asset = gameProject.value.objects.find((candidate) => candidate.id === placement?.objectId);
      return `${asset?.title || "Object"} (${placement?.role || "prop"})`;
    };
    const placementLabelById = (placementId) => placementLabel(
      gameProject.value.levels.flatMap((level) => level.placements).find((placement) => placement.id === placementId),
    );

    const placeBuildLibraryItem = async (item, position) => {
      const asset = materializeBuildAsset(item);
      const placement = placeObject(gameProject.value, forgeLevelId.value, asset.id, {
        position,
        role: forgeRole.value,
      });
      forgeObjectId.value = asset.id;
      selectedPlacementId.value = placement.id;
      Object.assign(forgePosition, position);
      await previewGameProject();
      workspaceTab.value = "build";
      projectStatus.value = `${placementLabel(placement)} placed at ${formatVector(position)}.`;
      return placement;
    };

    const handleBuildCanvasClick = async (event) => {
      if (workspaceTab.value !== "build" || buildEditorReady.value) return;
      if (!activeLevel.value) {
        projectStatus.value = "Choose a level first.";
        return;
      }
      try {
        const position = threeViewer.value?.screenToGroundPosition(event.clientX, event.clientY);
        if (buildTool.value === "select") {
          const item = buildObjectLibrary.value.find((candidate) => candidate.libraryId === pendingPaletteItemId.value);
          if (item) await placeBuildLibraryItem(item, position);
          return;
        }
        setLevelMarker(gameProject.value, activeLevel.value.id, buildTool.value, position);
        const marker = buildTool.value;
        buildTool.value = "select";
        await previewGameProject();
        workspaceTab.value = "build";
        projectStatus.value = `${marker === "start" ? "Start" : "Finish"} placed at ${formatVector(position)}.`;
      } catch (error) {
        projectStatus.value = error.message;
      }
    };

    const commitSelectedPlacement = async role => {
      if (!selectedPlacement.value || !activeLevel.value) return;
      const id=selectedPlacement.value.id;
      await editLevel((project,level)=>updatePlacement(project,level.id,id,{role}));
    };

    const deleteSelectedPlacement = async () => {
      if (!selectedPlacement.value || !activeLevel.value) return;
      const id=selectedPlacement.value.id;
      await editLevel((project,level)=>removePlacement(project,level.id,id));
    };

    const placeForgeObject = () => {
      try {
        placeObject(gameProject.value, forgeLevelId.value, forgeObjectId.value, {
          position: forgePosition,
          role: forgeRole.value,
        });
        projectStatus.value = "Object placed. Its transform is now part of the game manifest.";
      } catch (error) {
        projectStatus.value = error.message;
      }
    };

    const beginObjectDrag = (asset, event) => {
      draggedObjectId.value = asset.id;
      forgeObjectId.value = asset.id;
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-bonzai-object", asset.id);
      event.dataTransfer.setData("text/plain", asset.id);
    };

    const beginHistoryDrag = (asset, event) => {
      draggedObjectId.value = asset.libraryId;
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-bonzai-asset", asset.libraryId);
      event.dataTransfer.setData("text/plain", asset.libraryId);
    };

    const dropObjectOnMap = async (event) => {
      if (buildEditorReady.value) return;
      const libraryId = event.dataTransfer.getData("application/x-bonzai-asset") || event.dataTransfer.getData("text/plain");
      const libraryItem = buildLibrary.value.find((item) => item.libraryId === libraryId);
      let objectId = event.dataTransfer.getData("application/x-bonzai-object");
      draggedObjectId.value = "";
      if (libraryItem?.kind === "game") {
        await useBuildAsset(libraryItem);
        return;
      }
      if (libraryItem?.kind === "level") {
        await useBuildAsset(libraryItem);
        return;
      }
      if (!forgeLevelId.value) {
        projectStatus.value = "Choose a level before placing objects.";
        return;
      }
      if (libraryItem) objectId = materializeBuildAsset(libraryItem).id;
      if (!objectId) return;
      try {
        const position = threeViewer.value?.screenToGroundPosition(event.clientX, event.clientY);
        if (!position) throw new Error("3D viewer is not ready");
        if (libraryItem) await placeBuildLibraryItem(libraryItem, position);
        else {
          const projectItem = buildObjectLibrary.value.find((item) => item.projectAssetId === objectId);
          if (projectItem) await placeBuildLibraryItem(projectItem, position);
        }
      } catch (error) {
        projectStatus.value = `Placement could not render: ${error.message}`;
      }
    };

    const addForgeInteraction = () => {
      try {
        addInteraction(gameProject.value, {
          sourcePlacementId: selectedPlacementId.value,
          targetPlacementId: interactionTargetId.value,
          type: interactionType.value,
        });
        interactionTargetId.value = "";
        projectStatus.value = "Interaction added.";
      } catch (error) {
        projectStatus.value = error.message;
      }
    };

    const clearConditionIcon = (type) => ({
      collect: "diamond",
      defeat: "swords",
      reach: "location_on",
      survive: "timer",
      score: "trophy",
      custom: "bolt",
    }[type] || "check_circle");

    const deleteClearCondition = (conditionId) => {
      if (!activeLevel.value) return;
      try {
        removeClearCondition(gameProject.value, activeLevel.value.id, conditionId);
        projectStatus.value = "Clear condition removed.";
      } catch (error) {
        projectStatus.value = error.message;
      }
    };

    const toggleBuildObject = (libraryId) => {
      const selected = selectedBuildObjectLibraryIds.value;
      selectedBuildObjectLibraryIds.value = selected.includes(libraryId)
        ? selected.filter((id) => id !== libraryId)
        : [...selected, libraryId];
    };

    const startBuildWorkflow = async () => {
      if (!buildWorkflowComplete.value) return;
      try {
        const levelItem = historyLevelLibrary.value.find((item) => item.libraryId === selectedBuildLevelLibraryId.value);
        if (!levelItem) throw new Error("Select a level from history");
        const level = materializeBuildAsset(levelItem);
        forgeLevelId.value = level.id;
        const objectItems = selectedBuildObjectLibraryIds.value
          .map((libraryId) => historyObjectLibrary.value.find((item) => item.libraryId === libraryId))
          .filter(Boolean);
        const spacing = 2.5;
        objectItems.forEach((item, index) => {
          const asset = materializeBuildAsset(item);
          if (!level.placements.some((placement) => placement.objectId === asset.id)) {
            placeObject(gameProject.value, level.id, asset.id, {
              position: { x: (index - (objectItems.length - 1) / 2) * spacing, y: 0, z: 0 },
              role: "prop",
            });
          }
        });
        const applied = await updateGameplayWithAI();
        if (applied) buildEditorReady.value = true;
      } catch (error) {
        projectStatus.value = error.message;
      }
    };

    const updateGameplayWithAI = async () => {
      const instruction = gameplayInstruction.value.trim();
      if (!instruction || gameplayUpdating.value) return;
      gameplayUpdating.value = true;
      projectStatus.value = "BonzAI is directing the gameplay...";
      try {
        await loadModelForGeneration(codeModel.value);
        await window.electronAPI?.resetChat?.();
        const projectContext = {
          title: gameProject.value.title,
          premise: gameProject.value.gameplay.premise,
          activeLevelId: activeLevel.value?.id || null,
          levels: orderedProjectLevels.value.map((level) => ({
            id: level.id,
            title: level.title,
            clearMode: level.clearMode || "all",
            clearConditions: level.clearConditions || [],
            placements: (level.placements || []).map((placement) => ({
              id: placement.id,
              asset: gameProject.value.objects.find((asset) => asset.id === placement.objectId)?.title || "Object",
              role: placement.role,
              tags: placement.tags || [],
              settings: placement.settings || {},
            })),
          })),
          interactions: gameProject.value.gameplay.interactions || [],
        };
        const result = await callLLM(`You are BonzAI's game director. Convert the user's instruction into a safe structured gameplay patch.

USER INSTRUCTION:
${instruction}

CURRENT PROJECT:
${JSON.stringify(projectContext, null, 2)}

Return only one JSON object with this optional shape:
{
  "premise": "short player-facing premise",
  "levelUpdates": [{
    "levelId": "an existing level id",
    "title": "optional concise title",
    "clearMode": "all or any",
    "clearConditions": [{
      "type": "collect, defeat, reach, survive, score, or custom",
      "label": "short clear instruction",
      "target": 1,
      "tag": "matching placement role or tag when relevant",
      "targetPlacementId": "existing placement id for reach when relevant",
      "event": "event name for custom only"
    }]
  }],
  "placementUpdates": [{ "placementId": "existing id", "role": "player, enemy, trap, collectible, buff, debuff, checkpoint, platform, goal, or prop", "tags": ["short-tag"], "settings": {} }],
  "interactions": [{ "sourcePlacementId": "existing id", "targetPlacementId": "existing id", "type": "activates, damages, unlocks, or collects", "amount": 1 }]
}

Only reference IDs present in CURRENT PROJECT. Preserve unrelated levels and placements by omitting them. A reach condition must name a targetPlacementId. Prefer clear, playable rules over prose.`, {
          maxTokens: 2048,
          temperature: 0.2,
          thoughtTokens: 0,
          enableThinking: false,
        });
        const patch = parseGameplayPatch(result.text);
        applyGameplayPatch(gameProject.value, patch);
        gameplayInstruction.value = "";
        const verdict = validateGameProject(gameProject.value);
        if (verdict.ok) await previewLevelEditor();
        else projectStatus.value = `Gameplay updated. ${verdict.errors[0]}`;
        return true;
      } catch (error) {
        projectStatus.value = `Gameplay update failed: ${error.message}`;
        return false;
      } finally {
        gameplayUpdating.value = false;
      }
    };

    const removeActiveLevel = async () => {
      if(editorBusy.value)return;
      if (!activeLevel.value) return;
      const currentIndex = gameProject.value.levelOrder.indexOf(activeLevel.value.id);
      removeLevel(gameProject.value, activeLevel.value.id);
      forgeLevelId.value = gameProject.value.levelOrder[Math.max(0, currentIndex - 1)] || "";
      selectedPlacementId.value = "";
      if (!gameProject.value.levels.length) buildEditorReady.value = false;
      else await selectBuildLevel(forgeLevelId.value);
    };

    const startPlaytest = async () => {
      try {
        await previewGameProject();
        isPlaytesting.value = true;
      } catch {
        // Project status explains which level is incomplete.
      }
    };

    const stopPlaytest = () => {
      isPlaytesting.value = false;
      selectBuildLevel(forgeLevelId.value);
    };

    const startCompanionPlay = async () => {
      try {
        await previewGameProject();
        threeViewer.value?.startAgenticPlay(agentCompanionId.value);
        projectStatus.value = `${agentCompanionName.value} is now playing autonomously.`;
      } catch (error) {
        projectStatus.value = error.message;
      }
    };

    const cloneProject = project => JSON.parse(JSON.stringify(project));
    const previewLevelEditor = async (preserveCamera = true, project = gameProject.value) => {
      buildingPreview.value=true;
      try {
        const viewer=await waitForViewerReady();
        if(!viewer) throw new Error('3D viewer is not ready');
        const view=preserveCamera&&viewer.isLevelScene ? {position:viewer.camera.position.clone(),target:viewer.controls.target.clone()} : null;
        levelEditor.value?.detach();
        const code=compileLevelPreview(project,forgeLevelId.value);
        await viewer.applyModuleCode(normalizeLLMCode(code),'replace',{kind:'level'});
        restoreViewerEnvironmentControls();
        if(view){viewer.camera.position.copy(view.position);viewer.controls.target.copy(view.target);viewer.controls.update();}
        lastAssemblyContract.value=null;lastGeneratedCode.value=code;lastGeneratedBrief.value=activeLevel.value?.title || '';
        editorRevision.value++;
        return code;
      } finally {buildingPreview.value=false;}
    };
    const finishLevelEdit = (before,next) => {
      next.updatedAt=Date.now();
      // Commit only after rendering succeeds. Storage errors keep the old draft.
      localStorage.setItem('bonzai-game-project',JSON.stringify(next));
      editUndo.value=[...editUndo.value.slice(-19),before];editRedo.value=[];
      gameProject.value=next;
      projectStatus.value=t('levelEditor.savedLocally');
    };
    const editLevel = async mutate => {
      if(editorBusy.value || !activeLevel.value)return;
      const before=cloneProject(gameProject.value),next=cloneProject(before);
      try {
        mutate(next,next.levels.find(level=>level.id===forgeLevelId.value));
        await previewLevelEditor(true,next);
        finishLevelEdit(before,next);
      } catch(error) {
        try{await previewLevelEditor(true,before);}catch{}
        projectStatus.value=error.message;
      }
    };
    const commitLevelTransform = selection => editLevel((project,level)=>{
      if(selection.target.placementId)updatePlacement(project,level.id,selection.target.placementId,selection.transform);
      else setLevelPartEdit(level,{target:selection.target,transform:selection.transform});
    });
    const commitLevelMarker = (type,axis,value) => editLevel((project,level)=>{
      const coordinate=Number(value);if(!Number.isFinite(coordinate))throw new Error('Invalid marker position');
      const position={x:0,y:0,z:0,...(type==='start'?level.entry:level.exits[0]?.position),[axis]:coordinate};
      setLevelMarker(project,level.id,type,position);
    });
    const placeEditorAsset = async ({asset,position}) => {
      let target;
      await editLevel((project,level)=>{
      let object=project.objects.find(item=>item.id===asset.projectAssetId || (asset.inferenceId && item.sourceInferenceId===asset.inferenceId));
      if(!object)object=addObjectAsset(project,{title:asset.title,code:asset.code,thumbnail:asset.thumbnail,sourceInferenceId:asset.inferenceId||''});
      const placement=placeObject(project,level.id,object.id,{position,role:'prop'});
      target={placementId:placement.id};
      });
      await nextTick();
      if(target)levelEditor.value?.selectTarget(target);
    };
    const travelLevelEdit = async direction => {
      if(editorBusy.value)return;
      const from=direction==='undo'?editUndo:editRedo,to=direction==='undo'?editRedo:editUndo;
      if(!from.value.length)return;
      const current=cloneProject(gameProject.value),next=cloneProject(from.value.at(-1));
      try {
        await previewLevelEditor(true,next);
        localStorage.setItem('bonzai-game-project',JSON.stringify(next));
        from.value=from.value.slice(0,-1);to.value=[...to.value,current];gameProject.value=next;
        projectStatus.value=t('levelEditor.savedLocally');
      }catch(error){try{await previewLevelEditor(true,current);}catch{}projectStatus.value=error.message;}
    };
    const undoLevelEdit=()=>travelLevelEdit('undo'),redoLevelEdit=()=>travelLevelEdit('redo');
    const openLevelEditor = async () => {
      if(editorBusy.value)return;
      if(!activeLevel.value && lastGeneratedCode.value){
        const level=addLevel(gameProject.value,{title:form.prompt||'Level',code:lastGeneratedCode.value});forgeLevelId.value=level.id;
      }
      if(!activeLevel.value)return;
      workspaceTab.value='build';buildEditorReady.value=true;
      await selectBuildLevel(forgeLevelId.value);
    };
    const saveEditedLevel = async () => {
      if(editorBusy.value||!activeLevel.value)return;
      buildingPreview.value=true;
      try {
        const code=compileLevelPreview(gameProject.value,activeLevel.value.id);
        // Gizmos and selection outlines are editor-only, never export content.
        levelEditor.value?.detach();
        const snapshot=await captureViewerSnapshot(activeLevel.value.title);
        const level=cloneProject(activeLevel.value);
        const objectIds=new Set(level.placements.map(item=>item.objectId));
        const record=await addObjectInference(level.title,normalizeLLMCode(code),{success:true,assetKind:'level',mode:'level',title:level.title,
          levelProject:{level,objects:cloneProject(gameProject.value.objects.filter(item=>objectIds.has(item.id))),interactions:cloneProject(gameProject.value.gameplay.interactions.filter(item=>level.placements.some(placement=>placement.id===item.sourcePlacementId)))},
          screenshots:snapshot?[snapshot]:[],thumbnail:snapshot?.dataUrl||'',qualityStatus:'unreviewed'});
        if(!record.persisted)throw new Error(t('levelEditor.saveFailed'));
        projectStatus.value=t('levelEditor.saved');
      }catch(error){projectStatus.value=error.message;}
      finally{buildingPreview.value=false;editorRevision.value++;}
    };
    const regenerateLevelSelection = async ({selection,prompt}) => {
      if(editorBusy.value||!selection||!prompt||!activeLevel.value)return;
      const before=cloneProject(gameProject.value),levelId=forgeLevelId.value;
      editingBusy.value=true;editCancelled=false;
      projectStatus.value=t('levelEditor.busy');
      const brief=`Replace only this selected level object: ${selection.title}. User request: ${prompt}. Its local size is ${JSON.stringify(selection.size)} metres. Build an isolated reusable object with a ground-centred pivot; the editor fits it to the previous object's bounds. Do not generate surrounding terrain, other level objects, cameras, controls or a GAME session.`;
      try {
        await loadModelForGeneration(codeModel.value);
        await window.electronAPI.resetChat();
        const output=await callLLM(buildScenePrompt({mode:'object',brief,references:selectThreeReferences(brief,skillFiles,6000),variation:`Fresh interpretation seed ${Date.now()}.`}),
          {maxTokens:8192,temperature:.65,thoughtTokens:0,enableThinking:false},({tokenCount})=>{projectStatus.value=`${t('levelEditor.busy')} ${tokenCount} tokens`;});
        if(editCancelled)throw new Error('Generation cancelled');
        const body=sourceForBuilder(normalizeLLMCode(output.text));
        const result=await renderWithRecovery({code:body,maxRepairs:2,
          render:async candidate=>{
            if(editCancelled)throw new Error('Generation cancelled');
            const verdict=validateSceneBody(candidate);if(!verdict.ok)throw new Error(verdict.reason);
            if(/\bGAME\s*\.\s*create\s*\(/.test(candidate))throw new Error('A selected object cannot start a game session');
            const next=cloneProject(before),level=next.levels.find(item=>item.id===levelId);
            if(selection.target.placementId){
              const placement=level.placements.find(item=>item.id===selection.target.placementId);
              const wrapped=`{ const replacement=new THREE.Group();\nawait (${assetBuilder(candidate)})(replacement,Math,addUpdateCallback);\nH.fitLevelReplacement(replacement,${JSON.stringify(selection.bounds)});root.add(replacement); }`;
              const asset=addObjectAsset(next,{title:prompt.slice(0,80),code:wrapped,source:'regeneration'});
              placement.objectId=asset.id;
            } else setLevelPartEdit(level,{target:selection.target,transform:selection.transform,replacement:{code:candidate,title:prompt.slice(0,80),seed:String(Date.now())}});
            await previewLevelEditor(true,next);
            return next;
          },
          repair:async ({code,error})=>{
            if(editCancelled)throw new Error('Generation cancelled');
            const repair=await callLLM(buildSceneRepair({mode:'object',code,brief,error:error.message}),{maxTokens:2048,temperature:.2,thoughtTokens:0,enableThinking:false});
            return applySceneEdits(code,stripThinkBlocks(repair.text));
          }});
        if(editCancelled)throw new Error('Generation cancelled');
        finishLevelEdit(before,result.result);
      }catch(error){
        if(!editDisposed){try{await previewLevelEditor(true,before);}catch{}projectStatus.value=editCancelled?t('levelEditor.cancelled'):error.message;}
      }finally{editingBusy.value=false;}
    };
    const cancelLevelRegeneration = async () => {
      if(!editingBusy.value)return;
      editCancelled=true;
      await window.electronAPI?.abortChatStream?.();
    };

    const previewGameProject = async () => {
      try {
        const userCode = compileGameProject(gameProject.value);
        const code = normalizeLLMCode(userCode);
        const gameVerdict = validateGeneratedGameCode(code);
        if (!gameVerdict.ok) throw new Error(gameVerdict.reason);
        await threeViewer.value?.applyModuleCode(code, "replace");
        restoreViewerEnvironmentControls();
        lastGeneratedCode.value = userCode;
        projectStatus.value = `${gameProject.value.title} is running as an ordered, playable game.`;
        return { code, userCode };
      } catch (error) {
        projectStatus.value = error.message;
        throw error;
      }
    };

    const setWorkspaceTab = async (tab) => {
      workspaceTab.value = tab;
      if (tab === "build" && activeLevel.value) {
        buildEditorReady.value=true;
        await previewLevelEditor(false);
      }
      if (tab === "play" && canTokenizeProject.value) {
        try {
          await previewGameProject();
        } catch {
          // The inline project status contains the actionable compiler error.
        }
      }
    };

    const openGameMarkets = () => {
      window.dispatchEvent(new CustomEvent("bonzai:set-mode", { detail: "markets" }));
    };

    const tokenizeGameProject = async () => {
      try {
        const { code } = await previewGameProject();
        const manifest = buildGameCollectibleManifest(gameProject.value);
        const snapshot = await captureViewerSnapshot("Game");
        const record = await addObjectInference(gameProject.value.title, code, {
          success: true,
          mode: "game",
          assetKind: "game",
          title: gameProject.value.title,
          projectManifest: manifest,
          screenshots: snapshot ? [snapshot] : [],
          thumbnail: snapshot?.dataUrl || "",
          model: currentModel.value.modelname,
        });
        openMint(record);
      } catch (error) {
        projectStatus.value = error.message;
      }
    };

    watch(
      gameProject,
      (project) => {try {localStorage.setItem("bonzai-game-project", JSON.stringify(project));} catch(error) {projectStatus.value=error.message;}},
      { deep: true },
    );

    const useExample = (example) => {
      if (example.kind) creationMode.value = example.kind;
      objectInputMode.value = "prompt";
      form.prompt = example.prompt;
      showExamples.value = false;
    };

    const { toClipboard } = useClipboard();

    const copyPrompt = async (text, index) => {
      try {
        form.prompt = text;
        await toClipboard(text);
        hasCopy[index] = true;
        setTimeout(() => (hasCopy[index] = false), 2000);
        scrollToTop();
      } catch (e) {
        console.error("Copy failed:", e);
      }
    };

    const historyThumbnail = (item) => item?.thumbnail || item?.screenshots?.[0]?.dataUrl || "";

    const handleSuccess = (data) => console.log("Generation success:", data);
    const handleError = (data) => console.error("Generation error:", data);

    const captureViewerSnapshot = async (label = "Preview") => {
      await nextTick();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return threeViewer.value?.captureSnapshot?.(label, { quality: "ultra" }) || null;
    };

    const reviewRenderedConstruction = async (viewer, userCode, brief, mode, reference = null) => {
      const initialAssemblyErrors=inspectAssembly(viewer.scene.getObjectByName('GeneratedObject'),lastAssemblyContract.value).errors.length;
      const captureReview = async (label) => {
        const hero = await captureViewerSnapshot(label);
        if (!hero) return null;
        try { return {...hero, reviewFrames:viewer.captureQualityViews(), construction:{...viewer.inspectConstruction(),assembly:inspectAssembly(viewer.scene.getObjectByName('GeneratedObject'),lastAssemblyContract.value)}}; }
        catch(error) { return {...hero,reviewFrames:[],captureError:error.message}; }
      };
      const review = async (frame) => {
        if (!frame?.dataUrl) throw new Error("No rendered image available for review");
        if(frame.reviewFrames?.length!==3)throw new Error(frame.captureError || "Three inspection views could not be captured");
        const views = frame.reviewFrames;
        const reviews = [];
        for (const view of views) {
          lastStatus.value = `Reviewing visual quality (${reviews.length + 1}/${views.length})…`;
          const image = reference ? await makeReferenceComparison(reference.dataUrl, view.dataUrl) : view.dataUrl;
          const prompt = visualReviewPrompt(brief, !!reference, mode)
            + `\nView: ${view.label}. This is one inspection angle of the same asset. Judge visible construction only; parts outside this view are not missing. A detail view is cropped intentionally.\nMeasured scene data: ${JSON.stringify(frame.construction || {})}`;
          const assessment = parseVisualReview(await runVisionAnalysis(image, prompt, 900, {localReview:true}));
          reviews.push({label:view.label,review:assessment});
          if(assessment.verdict==='unavailable')break;
        }
        return {...aggregateViewReviews(reviews),construction:frame.construction};
      };
      const quality = await reviewSceneQuality({code:userCode,snapshot:await captureReview('Preview'),review,
        onStage:(stage,attempt)=>{
          lastStatus.value=stage==='review'?'Reviewing visual quality…':`Improving construction (${attempt}/2)…`;
          _resetStream(stage==='review'?'Visual Review':'Improving Construction',4096,
            "Checking construction from multiple angles and at close range.");
        },
        refine:async(candidate,assessment)=>{
          await loadModelForGeneration(codeModel.value);
          await window.electronAPI.resetChat();
          const corrected=await callLLM(buildSceneRepair({mode,code:candidate,brief,
            error:`The code renders but the visible asset fails quality review. Fix construction before decoration. ${assemblyInstructions(lastAssemblyContract.value)} The visual review is fallible: cross-check each defect against the code and original brief; do not duplicate existing parts based on an incorrect observation. ${assessment.defects.join('; ')} Measured construction: ${JSON.stringify(assessment.construction || {})}`}),
            {maxTokens:4096,temperature:.25,thoughtTokens:0,enableThinking:false});
          return applySceneEdits(candidate,stripThinkBlocks(corrected.text));
        },
        render:async(candidate)=>{
          await viewer.applyModuleCode(normalizeLLMCode(candidate),'replace',{kind:mode});
          assertAssembly(viewer,initialAssemblyErrors);
          restoreViewerEnvironmentControls();
          return captureReview('Visual refinement');
        },
      });
      const {reviewFrames=[],construction,...hero}=quality.snapshot || {};
      return {...quality,snapshot:hero.dataUrl?hero:null,screenshots:hero.dataUrl?[hero,...reviewFrames]:[]};
    };

    const formatHistoryDate = (value) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const removeInference = async (originalIndex) => {
      await removeObjectInference(originalIndex);
    };

    const clearDeleteToastTimer = () => {
      if (!pendingDeleteTimer) return;
      window.clearTimeout(pendingDeleteTimer);
      pendingDeleteTimer = null;
    };

    const dismissDeleteToast = () => {
      clearDeleteToastTimer();
      pendingDelete.value = null;
    };

    const requestDeleteObject = (item) => {
      if (!item) return;
      clearDeleteToastTimer();
      pendingDelete.value = {
        id: item.id,
        index: item._originalIndex,
        all: false,
      };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const requestClearHistory = () => {
      if (!objectInferences.value.length) return;
      clearDeleteToastTimer();
      pendingDelete.value = { all: true };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const confirmDeleteObject = async () => {
      const pending = pendingDelete.value;
      if (!pending) return;
      dismissDeleteToast();

      if (pending.scene) {
        threeViewer.value?.clear();
        lastGeneratedCode.value = '';lastGeneratedBrief.value='';lastAssemblyContract.value=null;
        return;
      }
      if (pending.all) {
        await clearObjectInferences();
        hasCopy.length = 0;
        return;
      }

      const idx = objectInferences.value.findIndex((item) => item.id === pending.id);
      await removeInference(idx >= 0 ? idx : pending.index);
    };

    const applyInference = async (item) => {
      if (!item.code || !threeViewer.value) return;
      await initialSceneReady;
      try {
        creationMode.value = (item.assetKind || item.mode) === "game" ? "game" : ["level", "scene"].includes(item.assetKind || item.mode) ? "level" : "object";
        objectInputMode.value = item.mode === "reference" ? "image" : "prompt";
        referenceImage.value = item.mode === "reference" && item.referenceImage
          ? { ...item.referenceImage }
          : null;
        await threeViewer.value.applyModuleCode(normalizeLLMCode(item.code), "replace", {kind: item.assetKind || item.mode});
        restoreViewerEnvironmentControls();
        if (creationMode.value === 'level') {
          const asset=materializeBuildAsset({kind:'level',title:item.title||item.prompt,code:item.code,inferenceId:item.id,thumbnail:historyThumbnail(item),levelProject:item.levelProject});
          forgeLevelId.value=asset.id;
        }
        // Store for refinement
        const userCodeMatch = item.code.match(
          /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
        );
        lastGeneratedCode.value = userCodeMatch ? userCodeMatch[1].trim() : '';
        lastGeneratedBrief.value=item.prompt || '';
        lastAssemblyContract.value=item.assemblyContract || null;
      } catch (err) {
        console.error("Failed to apply inference:", err);
      }
    };

    const regenerateFromInference = async (item) => {
      if (!item.prompt) return;
      // Set the prompt from the inference
      form.prompt = item.prompt;
      creationMode.value = (item.assetKind || item.mode) === "game" ? "game" : ["level", "scene"].includes(item.assetKind || item.mode) ? "level" : "object";
      objectInputMode.value = item.mode === "reference" ? "image" : "prompt";
      referenceImage.value = item.mode === "reference" && item.referenceImage
        ? { ...item.referenceImage }
        : null;
      // Trigger generation
      await onSubmit();
    };

    const inspectInference = (item) => {
      if (!item) return;
      const screenshots = Array.isArray(item.screenshots) ? item.screenshots : [];
      generationInspector.show({
        id: item.id,
        kind: "object",
        elapsedMs: item.elapsedMs,
        mediaUrl: historyThumbnail(item),
        prompt: item.prompt || "",
        outputText: item.code || "",
        model: item.model || currentModel.value?.modelname || "three-js",
        modelId: currentModel.value?.filename || "",
        ts: item.timestamp,
        createdAt: item.createdAt,
        status: item.success === false ? "Error" : "Complete",
        errorMessage: item.success === false ? item.notes || "" : "",
        mintState: item.nft || null,
        extra: {
          ...(item.mode ? { mode: item.mode } : {}),
          ...(item.tokensPerSecond ? { tokensPerSecond: `${item.tokensPerSecond} tok/s` } : {}),
          ...(item.blueprint ? { blueprint: item.blueprint } : {}),
          ...(item.fidelityReview?.score != null
            ? { fidelity: `${Math.round(Number(item.fidelityReview.score) * 100)}%` }
            : {}),
          screenshots: String(screenshots.length),
          codeChars: String((item.code || "").length),
          snapshotQuality: screenshots[0]?.quality || (item.thumbnail ? "ultra" : ""),
        },
      });
    };

    const glbExportBusy = ref(false);
    const glbExportStatus = ref("");
    const downloadGLB = async (item) => {
      if (glbExportBusy.value) return;
      glbExportBusy.value = true;
      glbExportStatus.value = "Preparing GLB…";
      try {
        const bytes = await exportCodeGLB(item.code);
        const url = URL.createObjectURL(new Blob([bytes], { type: GLB_MIME }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `bonzai-${String(item.id || "asset").replace(/[^a-z0-9_-]/gi, "-")}.glb`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        glbExportStatus.value = "GLB exported. Runtime effects and gameplay remain in the BonzAI source.";
      } catch (error) {
        glbExportStatus.value = `GLB export failed: ${error.message}`;
      } finally { glbExportBusy.value = false; }
    };

    const actionsFor = (item) => {
      const minted = !!item?.nft;
      return [
        { id: "inspect", icon: "info", label: "", variant: "default", title: "Inspect generation metadata" },
        { id: "copy", icon: hasCopy[item._originalIndex] ? "check" : "content_copy", label: hasCopy[item._originalIndex] ? "Copied" : "Reuse", variant: "default", title: "Copy prompt into composer" },
        { id: "glb", icon: "download", label: "GLB", variant: "default", title: "Export 3D model (.glb)", disabled: glbExportBusy.value || isLoading.value || !item?.success || !item?.code },
        { id: "mint", icon: minted ? "check_circle" : "token", label: minted ? "Minted" : "Mint", variant: minted ? "success" : "default", disabled: minted },
        { id: "load", icon: "visibility", label: "Load", variant: "primary", disabled: !item?.success, title: "Load this scene" },
        { id: "retry", icon: "autorenew", label: "Retry", variant: "default", disabled: isLoading.value, title: "Regenerate with the same prompt" },
        { id: "delete", icon: "delete", label: "Delete", variant: "destructive", title: "Remove this result" },
      ];
    };

    const handleAction = (id, item) => {
      switch (id) {
        case "inspect": inspectInference(item); break;
        case "copy": copyPrompt(item.prompt, item._originalIndex); break;
        case "glb": downloadGLB(item); break;
        case "mint": openMint(item); break;
        case "load": applyInference(item); break;
        case "retry": regenerateFromInference(item); break;
        case "delete": requestDeleteObject(item); break;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // HISTORY MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════
    const clearHistory = async () => {
      requestClearHistory();
    };

    const exportHistory = () => {
      if (objectInferences.value.length === 0) return;
      const data = JSON.stringify(objectInferences.value, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-3d-history-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const importHistory = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            // Add each imported item to the store
            for (const item of data) {
              await addObjectInference(item.prompt, item.code, {
                mode: item.mode,
                screenshots: item.screenshots,
                thumbnail: item.thumbnail || item.screenshots?.[0]?.dataUrl || "",
                success: item.success,
                title: item.title,
                notes: item.notes,
              });
            }
            hasCopy.length = objectInferences.value.length;
            hasCopy.fill(false);
          }
        } catch (err) {
          console.error("Failed to import history:", err);
        }
      };
      input.click();
    };

    // ═══════════════════════════════════════════════════════════════════════
    // IMPORT FROM NFT
    // ═══════════════════════════════════════════════════════════════════════
    const importTokenId = ref("");
    const isImportingNFT = ref(false);

    const importFromNFT = async () => {
      const tokenId = importTokenId.value.trim();
      if (!tokenId || isImportingNFT.value) return;

      isImportingNFT.value = true;
      try {
        const result = await fetchNFT3DCode(tokenId);
        if (!result || !result.code) {
          console.error("[Generative3D] No 3D code found in NFT metadata");
          return;
        }

        // Save to inference store
        const record = await addObjectInference(
          result.prompt || `[NFT #${tokenId}]`,
          result.code,
          { success: true },
        );

        // Load into viewer
        if (threeViewer.value && result.code) {
          await threeViewer.value.applyModuleCode(result.code, "replace");
          restoreViewerEnvironmentControls();
          const userCodeMatch = result.code.match(
            /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
          );
          lastGeneratedCode.value = userCodeMatch ? userCodeMatch[1].trim() : "";
          lastGeneratedBrief.value=result.prompt || "";lastAssemblyContract.value=result.assemblyContract || null;
        }

        importTokenId.value = "";
      } catch (err) {
        console.error("[Generative3D] Failed to import NFT:", err);
      } finally {
        isImportingNFT.value = false;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MODEL MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════
    const isModelAvailable = async (filename) => {
      const available = await window.electronAPI?.checkModel?.(filename) ?? false;
      const matches = requiredModels.value.filter((model) => model.filename === filename);
      for (const match of matches) {
        modelAvailability[match.role.toLowerCase()] = available;
      }
      return available;
    };

    const refreshRequiredModelAvailability = async () => {
      const results = await Promise.all(
        requiredModels.value.map(async (model) => ({
          role: model.role.toLowerCase(),
          available: await window.electronAPI?.checkModel?.(model.filename) ?? false,
        })),
      );
      for (const result of results) {
        modelAvailability[result.role] = result.available;
      }
      for (const model of requiredModelFiles.value) {
        const available = await window.electronAPI?.checkModel?.(model.filename) ?? false;
        for (const role of model.roles) {
          modelAvailability[role.toLowerCase()] = available;
        }
      }
      return results.every((result) => result.available);
    };

    const downloadModel = async (url, filename) => {
      if (!url || !filename) return;

      downloadProgress.value = 0;

      window.electronAPI.onDownloadProgress((e, data) => {
        if (data.filename === filename) {
          downloadProgress.value = Math.round(data.percent * 100);
        }
      });

      const success = await window.electronAPI.downloadModel(url, filename);

      downloadProgress.value = 0;

      if (success) {
        await isModelAvailable(filename);
      }
    };

    const deleteModel = async (filename) => {
      if (!filename) return;
      const success = await window.electronAPI.deleteModel(filename);

      if (success) {
        const matches = requiredModels.value.filter((model) => model.filename === filename);
        for (const match of matches) {
          modelAvailability[match.role.toLowerCase()] = false;
        }
        if (loadedModelFilename.value === filename) {
          loadedModelFilename.value = null;
        }
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MODEL LOADING
    // ═══════════════════════════════════════════════════════════════════════
    const loadModelForGeneration = async (targetModel = codeModel.value) => {
      if (loadedModelFilename.value === targetModel.filename) {
        const runtime = await window.electronAPI.llamaRuntimeStatus?.();
        if (runtime?.running && runtime.modelName === targetModel.filename) return;
      }

      lastStatus.value = `Loading ${targetModel.role} Model...`;
      try {
        // Request at most 32K; main computes the safe allocation from actual
        // weights and attention architecture. Q8 KV leaves room for code on 32 GB Macs.
        await window.electronAPI.loadModel({
          filename: targetModel.filename,
          parameters: targetModel.parameters,
          activeParameters: targetModel.activeParameters,
          isMoE: targetModel.isMoE,
          context: Math.min(targetModel.context || 32768, 32768),
          kvCacheTypeK: 'q8_0',
          kvCacheTypeV: 'q8_0',
          parallelSlots: 1,
          filesizeBytes: targetModel.filesizeBytes,
          flashAttention: targetModel.flashAttention,
          draftModel: targetModel.draftModel || null,
          draftUrl: targetModel.draftUrl || null,
          specType: targetModel.specType || null,
          specDraftNMax: targetModel.specDraftNMax || null,
          mtp: targetModel.mtp || false,
          forceReload: true,
        });
        loadedModelFilename.value = targetModel.filename;
        lastStatus.value = "Let's go!";
      } catch (error) {
        throw new Error(`Model loading failed: ${error.message}`);
      }
    };

          const defaultCode = `export default async function generate(params) {
  const { THREE, helpers: H, setObjectInfo, addUpdateCallback,
          setColorGrade, setLensFlare, setAO, setBloom } = params;
  const { MAT, TEX, SHADER, FLUID, P, CELESTIAL, FX } = params._engine;
  const root = new THREE.Group();
  root.name = "ArcaneOrrery";

  setObjectInfo({
    title: "Arcane Orrery",
    description: "A breathing mechanical cosmos — armillary rings carry blue-marble planets around a nebula core, over a mirrored moat and granite dais and engraved brass dial, lit against a cold deep-space IBL."
  });

  // ── Scene-specific object lookdev. The viewer owns time-of-day,
  // weather, sky, clouds, and HDR environment, so this default object
  // does not call setEnvironment().
  setAO({ radius: 0.16, intensity: 1.5, falloff: 0.55, quality: "High" });
  setBloom({ intensity: 0.3, threshold: 1.2, smoothing: 0.15, radius: 0.4 });
  setColorGrade({ saturation: 1.12, contrast: 1.05 });

  // ── Physics world (Rapier) ─────────────────────────────────────────
  // P.init() auto-creates an infinite physics ground collider at y=0.
  await P.init({ gravity: -4.5 });

  // ── Stone dais ──────────────────────────────────────────────────────
  // Plain MeshPhysicalMaterial — the TCSM wet-surface variant is
  // available via SHADER.wetSurface for any LLM-generated scene that
  // wants rain reactivity, but the default orrery ships with the stock
  // PBR material because TCSM currently collides with THREE.Water's
  // internal transmission/reflection passes (the moat uses Water, and
  // those reflected passes invalidate TCSM-patched programs).
  // Load only these three local scans; share images throughout the assembly.
  const [granite, marble, basinStone] = await Promise.all([
    MAT.scanned('granite_tile',{normalStrength:.16,aoIntensity:.35,roughness:.72}),
    MAT.scanned('marble_01',{normalStrength:.08,aoIntensity:.3,roughness:.32}),
    MAT.scanned('dark_rock',{normalStrength:.25,aoIntensity:.5,roughness:.85}),
  ]);
  const gold = MAT.surface('metal',{color:0xc8a35b,metalness:1,roughness:.28,relief:.00008,repeat:[3,1]});
  const brass = MAT.surface('metal',{color:0x9c7944,metalness:1,roughness:.36,relief:.00012,repeat:[2,1]});
  const silver = MAT.surface('metal',{color:0xc5ccd2,metalness:1,roughness:.25,relief:.00008});
  const daisGeo = H.worldUV(new THREE.CylinderGeometry(0.44,0.48,0.06,96),.7);
  const daisMat = granite;
  const dais = new THREE.Mesh(daisGeo, daisMat);
  dais.position.y = -0.03;
  dais.receiveShadow = true;
  dais.castShadow = false;
  root.add(dais);

  // Gold rim inlay around the dais edge.
  const daisRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.006, 24, 128),
    gold
  );
  daisRim.rotation.x = Math.PI / 2;
  daisRim.position.y = 0.003;
  daisRim.receiveShadow = true;
  root.add(daisRim);

  // ── Water moat — AAA reflector-based water (THREE.Water under the
  // hood). The pool renders a real reflection of the scene into an RT
  // each frame, then samples a ripple normalmap to distort it.
  const moatGeo = new THREE.RingGeometry(0.50, 1.10, 128, 4);
  const moat = FLUID.oceanWater(moatGeo, {
    color: 0x183c50,              // restrained mineral-blue water
    distortionScale: 2.2,
    speed: 1.2,
    rippleDensity: 10.0,          // tight ripples on a ~2m pool
    textureWidth: 1024,
    textureHeight: 1024,
    normalMapSize: 512,
    sunDirection: new THREE.Vector3(0.3, 0.9, 0.4).normalize(),
    sunColor: 0xffffff,
  });
  moat.rotation.x = -Math.PI / 2;
  moat.position.y = 0.02;
  root.add(moat);

  // Stone floor BENEATH the water — becomes visible through the clear
  // water where the reflection fresnel fades. This is what gives the
  // pool depth.
  const poolFloor = new THREE.Mesh(
    H.worldUV(new THREE.RingGeometry(0.50,1.10,128,1),.6), basinStone
  );
  poolFloor.rotation.x = -Math.PI / 2;
  poolFloor.position.y = -0.02;
  poolFloor.receiveShadow = true;
  root.add(poolFloor);

  // Obsidian rims (outer + inner lip).
  const moatRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.10, 0.025, 24, 192),
    MAT.obsidian
  );
  moatRim.rotation.x = Math.PI / 2;
  moatRim.position.y = 0.022;
  moatRim.castShadow = true;
  root.add(moatRim);

  const moatLipInner = new THREE.Mesh(
    new THREE.TorusGeometry(0.50, 0.018, 24, 128),
    MAT.obsidian
  );
  moatLipInner.rotation.x = Math.PI / 2;
  moatLipInner.position.y = 0.022;
  moatLipInner.castShadow = true;
  root.add(moatLipInner);

  // ── Rune-engraved marble base ───────────────────────────────────────
  // Stock MeshPhysicalMaterial with the procedural runes texture. The
  // SHADER.csm pulsing-rune variant is available for LLM generations
  // (see shader cheatsheet) but kept out of the default for stability
  // with the Water-based moat reflection/transmission pipeline.
  const baseTex = TEX.runes('#1a1308', '#f5c776');
  baseTex.repeat.set(2, 1);
  const baseProfile = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.42, 0),
    new THREE.Vector2(0.42, 0.03),
    new THREE.Vector2(0.38, 0.05),
    new THREE.Vector2(0.36, 0.08),
    new THREE.Vector2(0.36, 0.14),
    new THREE.Vector2(0.34, 0.16),
    new THREE.Vector2(0.12, 0.18),
    new THREE.Vector2(0.10, 0.20),
    new THREE.Vector2(0.001, 0.20),
  ];
  const baseGeo = new THREE.LatheGeometry(baseProfile, 64);
  const baseMat = marble;
  const baseMesh = new THREE.Mesh(H.worldUV(baseGeo,.55), baseMat);
  baseMesh.castShadow = true; baseMesh.receiveShadow = true;
  root.add(baseMesh);

  // Engraving is a narrow separate band, not emission across the stone.
  const inscription = new THREE.Mesh(new THREE.CylinderGeometry(.3608,.3608,.048,128,1,true),
    new THREE.MeshStandardMaterial({map:baseTex,color:0xa58a56,metalness:.85,roughness:.42}));
  inscription.position.y=.112;inscription.name='Engraved brass collar';root.add(inscription);
  const divisions=new THREE.InstancedMesh(H.bevelBox(.002,.0015,.022,.0005),gold,60);
  const marker=new THREE.Object3D();
  for(let i=0;i<60;i++){
    const angle=i*Math.PI/30;
    marker.position.set(Math.sin(angle)*.315,.181,Math.cos(angle)*.315);
    marker.rotation.y=angle;marker.scale.set(i%5===0?1.5:1,1,i%5===0?1.3:.65);
    marker.updateMatrix();divisions.setMatrixAt(i,marker.matrix);
  }
  divisions.name='Engraved dial divisions';root.add(divisions);

  // Gold rim band around the top plate of the base.
  const rimGeo = new THREE.TorusGeometry(0.34, 0.012, 24, 128);
  const rim = new THREE.Mesh(rimGeo, gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.175;
  rim.castShadow = true;
  root.add(rim);

  // ── Rune-shard debris around the base (FX.batch = 1 draw call) ─────
  // Eighteen little obsidian tetrahedra scattered around the plinth.
  // Each catches AO where it meets the rune base, and the shared
  // purple emissive drives a subtle bloom halo across the pile.
  // FX.batch collapses all eighteen into a single BatchedMesh.
  const shardMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a2028, metalness: 0.4, roughness: 0.55,
    emissive: 0xa855f7, emissiveIntensity: 0.35,
  });
  const shards = [];
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
    const rad = 0.36 + Math.random() * 0.06;
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.009, 0), shardMat);
    m.position.set(Math.cos(ang) * rad, 0.19 + Math.random() * 0.008, Math.sin(ang) * rad);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    shards.push(m);
  }
  const shardBatch = FX.batch(shards, { material: shardMat });
  root.add(shardBatch);

  // ── Central column holding up the orrery head ──────────────────────
  // Substantial lathe profile that reaches almost up to the core — the
  // previous 0.32-unit column left a visible gap and made the head read
  // as "floating." Now the column flows from a wide decorative base at
  // y=0 to a tapered collar at y=0.50, continues as a slender brass
  // stem up to y=0.62 (where the core orb sits), with an upper capital
  // ring catching the rim of the armillary sphere.
  const columnProfile = [
    new THREE.Vector2(0.04, 0.00),
    new THREE.Vector2(0.06, 0.03),
    new THREE.Vector2(0.055, 0.10),
    new THREE.Vector2(0.045, 0.20),
    new THREE.Vector2(0.040, 0.30),
    new THREE.Vector2(0.050, 0.34),
    new THREE.Vector2(0.038, 0.38),
    new THREE.Vector2(0.030, 0.50),
    new THREE.Vector2(0.020, 0.58),
    new THREE.Vector2(0.025, 0.60),
    new THREE.Vector2(0.020, 0.62),
  ];
  const column = new THREE.Mesh(new THREE.LatheGeometry(columnProfile, 48), brass);
  column.position.y = 0.18;
  column.castShadow = true;
  root.add(column);

  // ── Central axis rod through the core ──────────────────────────────
  // The rod continues from the column's upper stem UP through the glass
  // orb and past the hologram ring. The glass orb's 0.96 transmission
  // reveals the rod passing through its interior — architecturally
  // correct for an armillary sphere and anchors the head visually.
  const axisRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.44, 20),
    brass
  );
  axisRod.position.y = 1.02;   // rod spans y = 0.80 → 1.24
  axisRod.castShadow = true;
  root.add(axisRod);

  // Gold finial cap on the upper rod tip — a classic orrery crown.
  const finialTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 20, 20),
    gold
  );
  finialTop.position.y = 1.25;
  finialTop.castShadow = true;
  root.add(finialTop);

  // ── Nebula core: BonzAI-palette inner sphere + glass orb + halo ────
  const coreY = 0.62;
  const innerCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 64, 64),
    SHADER.nebula(0x8b5cf6, 0x0a0a0f)        // BonzAI purple on near-black
  );
  innerCore.position.y = coreY;
  root.add(innerCore);

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 96, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0xf0f0ff, transmission: 0.96, ior: 1.5, roughness: 0.03,
      thickness: 0.25, clearcoat: 1.0, transparent: true,
    })
  );
  orb.position.y = coreY;
  root.add(orb);

  const coreHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 48, 48),
    SHADER.fresnel(0xa855f7, 2.5, 0.75)       // BonzAI violet glow
  );
  coreHalo.position.y = coreY;
  root.add(coreHalo);

  // NOTE: Previous builds layered a fakeGlow shell at 1.8× the core to
  // simulate bloom. The new pmndrs BloomEffect + selective threshold
  // produce real post-bloom on the nebula shader's emissive output —
  // the extra shell is redundant and was doubling the halo intensity.

  // ── Lens flare: the core IS the sun ────────────────────────────────
  // Mancini's signature flare with ghost chain + anamorphic streak,
  // projected from the core's world position each frame. Raycast
  // occlusion is on, so the orrery's rings and pedestal partially
  // occlude the flare as the camera orbits.
  setLensFlare({
    position: new THREE.Vector3(0, coreY, 0),
    strength: 0.12,
    tint: 0xc28dff,
    anamorphic: 1.0,
    occlusionTest: true,
  });

  // ── God-ray cones radiating down from the core ─────────────────────
  // Four cones tilted outward — volumetric light shafts that read as
  // magical energy lancing into the moat. Mesh-based so no post cost.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ray = FX.godRayCone({
      from: new THREE.Vector3(Math.cos(a) * 0.06, coreY - 0.02, Math.sin(a) * 0.06),
      to:   new THREE.Vector3(Math.cos(a) * 0.62, 0.08,          Math.sin(a) * 0.62),
      color: 0xa855f7,
      spread: 0.12,
      intensity: 0.45,
    });
    root.add(ray);
  }

  // ── Holographic projection ring — ektogamat recipe ────────────────
  // A thin torus hovering above the rings with hologram v2 material
  // (fresnel × scanlines × traveling signal × blink). fresnelOnly mode
  // so the body is transparent and only the rim glows, selling the
  // projection look.
  const projRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.012, 16, 128),
    SHADER.hologram(0x10b981, 60.0, {
      signalSpeed: 2.5,
      blink: 0.35,
      blinkRate: 2.0,
      fresnelOnly: true,
      additive: true,
      opacity: 0.85,
      fresnelPower: 1.8,
    })
  );
  projRing.rotation.x = Math.PI / 2;
  projRing.position.y = coreY + 0.32;
  root.add(projRing);
  addUpdateCallback(({ time }) => {
    projRing.rotation.z = time * 0.15;   // slow spin
  });

  // ── Three armillary rings — blue-marble-with-gold-veins planets ────
  // Each planet shares the same marble recipe but at different base/vein
  // tones (deep ocean to ice-blue) so they read as distinct worlds while
  // staying visually unified.
  const ringDefs = [
    { r: 0.28, mat: gold,   tiltX: 0,              tiltZ: 0,              speed: 0.45, marble: { base: '#08306a', vein: '#f5c776' }, halo: 0x4a9eff },  // deep ocean
    { r: 0.36, mat: brass,  tiltX: Math.PI / 3,    tiltZ: 0,              speed: 0.30, marble: { base: '#0a4a96', vein: '#ffd87a' }, halo: 0x5fb4ff },  // cobalt
    { r: 0.44, mat: silver, tiltX: Math.PI / 6,    tiltZ: Math.PI / 2.5,  speed: 0.20, marble: { base: '#1a6ec8', vein: '#fce37a' }, halo: 0x7ac8ff },  // sky
  ];
  const rings = [];
  for (let i = 0; i < ringDefs.length; i++) {
    const def = ringDefs[i];
    const tiltGroup = new THREE.Group();
    tiltGroup.position.y = coreY;
    tiltGroup.rotation.x = def.tiltX;
    tiltGroup.rotation.z = def.tiltZ;
    root.add(tiltGroup);

    const spinGroup = new THREE.Group();
    tiltGroup.add(spinGroup);

    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(def.r, 0.008, 16, 192),
      def.mat
    );
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.castShadow = true;
    spinGroup.add(ringMesh);

    // Share the scanned marble maps; each planet has its own blue tint.
    // Polished stone remains dielectric, with a fine clearcoat highlight.
    const planetMat = new THREE.MeshPhysicalMaterial({
      map:marble.map,normalMap:marble.normalMap,normalScale:new THREE.Vector2(.08,.08),
      roughnessMap:marble.roughnessMap,color:new THREE.Color(def.marble.base),
      metalness:0,roughness:.28,clearcoat:1,clearcoatRoughness:.12,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.032, 48, 48), planetMat);
    planet.castShadow = true;
    const planetHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.046, 24, 24),
      SHADER.fresnel(def.halo, 2.2, 0.55)
    );
    planet.add(planetHalo);
    planet.position.set(def.r, 0, 0);
    spinGroup.add(planet);

    rings.push({ tiltGroup, spinGroup, planet, speed: def.speed, phase: i * (Math.PI * 2 / 3) });
  }

  // ── Orbital animation ──────────────────────────────────────────────
  addUpdateCallback(({ time }) => {
    for (const r of rings) {
      r.spinGroup.rotation.y = time * r.speed + r.phase;
    }
    innerCore.rotation.y = time * 0.15;
    innerCore.rotation.x = time * 0.08;
    coreHalo.rotation.y = time * 0.1;
  });

  // ── Atmosphere: starfield + half-dome nebula + magic aura ─────────
  // Decorative object backdrop. The actual viewer sky, clouds, weather,
  // and HDR environment remain controlled by ThreeViewer.
  const stars = CELESTIAL.starfield({ count: 480, radius: 9, size: 12, twinkle: 0.35 });
  stars.position.y = coreY;
  root.add(stars);

  const nebulaInner = CELESTIAL.nebulaCloud({
    dome: true,
    count: 140,
    bounds: { x: 6.0, y: 4.5, z: 6.0 },
    innerRadius: 4.2,
    colorA: 0x8b5cf6,
    colorB: 0xfe2d6e,
    brightness: 0.35,
    size: 26,
  });
  nebulaInner.position.y = 0.2;
  root.add(nebulaInner);

  const nebulaOuter = CELESTIAL.nebulaCloud({
    dome: true,
    count: 90,
    bounds: { x: 9.0, y: 7.0, z: 9.0 },
    innerRadius: 6.5,
    colorA: 0x10b981,
    colorB: 0xa855f7,
    brightness: 0.25,
    size: 32,
  });
  nebulaOuter.position.y = 0.4;
  root.add(nebulaOuter);

  // Flow-field magic aura — BonzAI purple × green swirl.
  const aura = SHADER.flowParticles({
    count: 220,
    bounds: { x: 0.55, y: 0.75, z: 0.55 },
    color:  0x8b5cf6,              // purple
    color2: 0x10b981,              // green
    size: 9,
    speed: 0.25,
    swirl: 0.5,
  });
  aura.position.y = coreY;
  aura.userData.excludeFromBBox = true;
  root.add(aura);

  return root;
}`;


    // ═══════════════════════════════════════════════════════════════════════
    // DEFAULT OBJECT
    // ═══════════════════════════════════════════════════════════════════════
    let initialSceneReady = Promise.resolve();
    const loadDefaultObject = async () => {
      const viewer = await waitForViewerReady();
      if (!viewer) return;


      try {
        await viewer.applyModuleCode(defaultCode, "replace");
        restoreViewerEnvironmentControls();
      } catch (err) {
        console.error("Failed to load default object:", err);
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MAIN SUBMIT HANDLER
    const recoverGeneratedScene = async (viewer, userCode, brief) => {
      return renderWithRecovery({
        code: userCode,
        render: async (candidate) => {
          const normalized = normalizeLLMCode(candidate);
          const check = creationMode.value === 'game' ? validateGeneratedGameCode(candidate) : validateRenderableUserCode(candidate);
          if (!check.ok) throw new Error(check.reason);
          const result=await viewer.applyModuleCode(normalized, "replace", {kind: creationMode.value});
          return result;
        },
        onAttempt: ({ attempt, error }) => {
          lastStatus.value = `Repairing scene (${attempt}/3)…`;
          _resetStream(error.name==='AssemblyValidationError'?"Rebuilding Assembly":"Repairing Scene", error.name==='AssemblyValidationError'?8192:2048, "Correcting measured construction and runtime errors.");
        },
        repair: async ({ code: candidate, error, failures }) => {
          const repaired = await callLLM(buildSceneRepair({ mode: creationMode.value, code: candidate, brief,
            error: `${error.message}\nErrors encountered: ${failures.join('; ')}` }),
            { maxTokens: 2048, temperature: 0.15, thoughtTokens: 0, enableThinking: false },
            ({ tokenCount, elapsedMs }) => { stream.tokenCount = tokenCount; stream.elapsedMs = elapsedMs; });
          return applySceneEdits(candidate, stripThinkBlocks(repaired.text));
        },
      });
    };

    const improveAssembly = async (viewer,code,brief) => {
      lastStatus.value='Checking assembly…';
      return repairAssembly({code,
        validate:candidate=>{parseJavaScript(normalizeLLMCode(candidate),{ecmaVersion:'latest',sourceType:'module'});},
        repairSyntax:async(candidate,error)=>{
          await window.electronAPI.resetChat();
          const response=await callLLM(buildSceneRepair({mode:creationMode.value,code:candidate,brief,error:'Syntax validation failed before rendering: '+error.message}),{maxTokens:3072,temperature:.1,thoughtTokens:0,enableThinking:false});
          return applySceneEdits(candidate,stripThinkBlocks(response.text));
        },
        inspect:()=>inspectAssembly(viewer.scene.getObjectByName('GeneratedObject'),lastAssemblyContract.value),
        render:async candidate=>{await viewer.applyModuleCode(normalizeLLMCode(candidate),'replace',{kind:creationMode.value});restoreViewerEnvironmentControls();},
        rebuild:async report=>{
          lastStatus.value='Improving assembly…';
          _resetStream('Improving Assembly',8192,'Correcting named parts and material roles.');
          await window.electronAPI.resetChat();
          const response=await callLLM(buildScenePrompt({mode:creationMode.value,brief,plan:JSON.stringify(lastAssemblyContract.value)})+'\n'+assemblyInstructions(lastAssemblyContract.value)+'\nMeasured issues: '+report.errors.join('; ')+'\nPrevious drawable source:\n'+code+'\nReturn a complete corrected JavaScript body.',
            {maxTokens:8192,temperature:.3,thoughtTokens:0,enableThinking:false},({tokenCount,elapsedMs})=>{stream.tokenCount=tokenCount;stream.elapsedMs=elapsedMs;});
          return stripThinkBlocks(response.text).replace(/^```(?:javascript|js)?\s*/,'').replace(/\s*```$/,'');
        }
      });
    };

    const onSubmit = async () => {
      if (!form.prompt.trim() && !(isReferenceGeneration.value && referenceImage.value)) return;
      if (!canSubmitWithAccess.value) return;
      if (isReferenceGeneration.value && !referenceImage.value) {
        lastStatus.value = "Choose a reference image first";
        return;
      }

      if (!isModel.value) {
        lastStatus.value = "Please download the AI model first";
        return;
      }

      isLoading.value = true;
      const generationStarted = performance.now();
      const activityId = `3d:${crypto.randomUUID()}`;
      reportOperation({id:activityId,title:"Generating 3D",mode:"game",status:"running",stage:"Preparing",location:"3D"});
      lastStatus.value = "Preparing...";
      lastAssemblyContract.value = null;assemblyPlanningDiagnostics.value=[];
      const submittedPrompt = form.prompt.trim() ||
        (isReferenceGeneration.value ? "Faithfully reconstruct this object" : "");
      const creativeDirection = createCreativeDirection({ brief: submittedPrompt, history: objectInferences.value,
        mode: creationMode.value, reference: isReferenceGeneration.value });
      const variation = creativeDirectionPrompt(creativeDirection);
      const submittedReference = referenceImage.value
        ? { ...referenceImage.value }
        : null;
      let lastAttemptedCode = "";

      try {
        await initialSceneReady;
        const viewer = threeViewer.value;
        if (!viewer) throw new Error("Viewer not initialized");

        let draftReferenceCode = "";
        if (isReferenceGeneration.value) {
          lastStatus.value = "Preparing reconstruction...";
          draftReferenceCode = buildReferenceFallbackCode(submittedReference.dataUrl);
          await viewer.applyModuleCode(draftReferenceCode, "replace");
          restoreViewerEnvironmentControls();
        }

        // Reset chat history to free context for new generation
        await window.electronAPI.resetChat();

        console.log("═══════════════════════════════════════════════════════");
        console.log("3D CODE GENERATION");
        console.log("═══════════════════════════════════════════════════════");

        let referenceAnalysis = "";
        if (isReferenceGeneration.value) {
          lastStatus.value = "Reading reference...";
          _resetStream("Reading Reference", 1, "Mapping silhouette, materials and visible construction.");
          referenceAnalysis = await analyzeReferenceFor3D(
            submittedReference.dataUrl,
            submittedPrompt,
          );
          if (/suitability\s*[:\-]\s*reject\b/i.test(referenceAnalysis)) {
            throw new Error(
              "This image is not suitable for reliable 3D reconstruction. Use one isolated subject with less occlusion.",
            );
          }
        }

        // The vision inventory and assembly planner solve different problems:
        // one records evidence, the other resolves it into executable hierarchy.
        await loadModelForGeneration(plannerModel.value);
        lastStatus.value = "Designing blueprint...";
        const BLUEPRINT_MAX_TOKENS = 3200;
        _resetStream(
          "Designing Blueprint",
          BLUEPRINT_MAX_TOKENS,
          isReferenceGeneration.value
            ? "Resolving visual evidence into a component hierarchy."
            : "Drafting the world before we render it.",
        );
        lastAssemblyContract.value = creationMode.value === 'game' ? null : await planAssembly(submittedPrompt, creationMode.value, referenceAnalysis);
        const blueprintResult = creationMode.value !== 'game' ? {text:lastAssemblyContract.value?JSON.stringify(lastAssemblyContract.value):submittedPrompt,tokenCount:0,elapsedMs:0} : await callLLM(
          buildEnhancePrompt(submittedPrompt, referenceAnalysis) + "\n\n" + variation,
          {
            maxTokens: BLUEPRINT_MAX_TOKENS,
            temperature: 0.35,
            thoughtTokens: 0,
            enableThinking: false,
          },
          ({ text, tokenCount, elapsedMs }) => {
            const visible = _stripThinkForPreview(text);
            stream.tokenCount = tokenCount;
            stream.elapsedMs = elapsedMs;
            stream.tokensPerSec = elapsedMs > 0 ? +(tokenCount / (elapsedMs / 1000)).toFixed(1) : 0;
            stream.preview = visible.length > 600 ? "…" + visible.slice(-600) : visible;
          },
        );
        const blueprint = stripThinkBlocks(blueprintResult.text) ||
          referenceAnalysis ||
          submittedPrompt;
        console.log("Reconstruction blueprint:", blueprint);

        // Phase 2: Generate Three.js code from blueprint
        // Reset chat again — the blueprint exchange is in history and the code prompt
        // is very large (Three.js reference docs), so we need maximum context available
        await loadModelForGeneration(codeModel.value);
        await window.electronAPI.resetChat();
        lastStatus.value = isReferenceGeneration.value
          ? "Building reconstruction..."
          : "Building scene...";
        const codePrompt = buildObjectPrompt(blueprint, submittedPrompt, variation) + "\n" + assemblyInstructions(lastAssemblyContract.value);
        const codeMaxTokens = isReferenceGeneration.value ? 8192 : 16384;
        _resetStream(
          isReferenceGeneration.value ? "Building Reconstruction" : "Building Scene",
          codeMaxTokens,
          "Generating visible Three.js geometry.",
        );
        const codeResult = await callLLM(
          codePrompt,
          {
            maxTokens: codeMaxTokens,
            temperature: 0.7,
            thoughtTokens: 0,
            enableThinking: false,
          },
          ({ text, tokenCount, elapsedMs, prefillMs, genMs }) => {
            const visible = _stripThinkForPreview(text);
            stream.tokenCount = tokenCount;
            stream.elapsedMs = elapsedMs;
            stream.prefillMs = prefillMs;
            // Real generation rate excludes prefill so the readout
            // doesn't get dragged down by the system prompt.
            stream.tokensPerSec = genMs > 0 ? +(tokenCount / (genMs / 1000)).toFixed(1) : 0;
            stream.preview = visible.length > 600 ? "…" + visible.slice(-600) : visible;
          },
        );
        const codeTokS = codeResult.elapsedMs > 0
          ? ((codeResult.tokenCount / codeResult.elapsedMs) * 1000).toFixed(1)
          : null;
        console.log("Raw LLM output:", codeResult.text);
        console.log(`Code gen: ${codeResult.tokenCount} tokens in ${(codeResult.elapsedMs / 1000).toFixed(1)}s (${codeTokS || '?'} tok/s), prefill: ${((codeResult.prefillMs || 0) / 1000).toFixed(1)}s`);
        // Codegen truncation telemetry. The wrapper template already
        // provides `scene.add(root); return root;` — user code never
        // emits a `return` statement, so the only honest signal of
        // truncation is the final character. Clean ends finish on
        // `;`, `}`, or `)`. Mid-token truncation leaves an alphabetic
        // letter, comma, or open paren as the final char.
        const codeTail = codeResult.text.trim().slice(-80);
        const lastChar = codeTail.slice(-1);
        const looksTruncated = !/[;)}\]]/.test(lastChar);
        if (looksTruncated) {
          console.warn(
            `[3D] Codegen ended mid-statement at ${codeResult.tokenCount}/${codeMaxTokens} tokens ` +
            `(tail: "${codeTail.slice(-40)}"). Either the model hit its slot context cap (verify ` +
            `"-np 1" in the llama-server startup args, then restart Electron) or it emitted an ` +
            `EOG token early.`
          );
        }

        let code = normalizeLLMCode(codeResult.text);
        let userCodeMatch = code.match(
          /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
        );
        let userCode = userCodeMatch ? userCodeMatch[1].trim() : "";

        // Retry heuristic — fires when phase-2 produces anything we
        // can't safely run: empty output, or output truncated mid-code
        // (token budget ran out, context limit hit). Detected via:
        //   (a) no userCode extracted
        //   (b) userCode exists but has badly mismatched braces, which
        //       normalizeLLMCode couldn't auto-fix. Truncated output
        //       typically ends mid-expression with many more `{` than `}`.
        let renderCheck = validateRenderableUserCode(userCode);
        if (renderCheck.ok && creationMode.value === "game") {
          renderCheck = validateGeneratedGameCode(userCode);
        }
        const truncated = !renderCheck.ok;
        if (!userCode || truncated || !renderCheck.ok) {
          console.warn(
            `[3D] Phase-2 ${userCode ? (truncated ? 'produced truncated code' : renderCheck.reason) : 'produced empty code'} — retrying with terse prompt.`
          );
          lastStatus.value = "Retrying...";
          const retryMaxTokens = isReferenceGeneration.value ? 4096 : 8192;
          _resetStream("Retrying", retryMaxTokens, "First pass was invalid. Rebuilding a tighter scene.");
          await window.electronAPI.resetChat();
          const tersePrompt = codePrompt + `

RETRY: The previous output was invalid: ${renderCheck.reason || 'incomplete code'}. Produce a complete, executable implementation within the output budget. Keep the requested silhouette, material fidelity and motion. Use shared helpers to reduce code length.`;
          const retry = await callLLM(
            tersePrompt,
            { maxTokens: retryMaxTokens, temperature: 0.6, thoughtTokens: 0, enableThinking: false },
            ({ text, tokenCount, elapsedMs }) => {
              const visible = _stripThinkForPreview(text);
              stream.tokenCount = tokenCount;
              stream.elapsedMs = elapsedMs;
              stream.tokensPerSec = elapsedMs > 0 ? +(tokenCount / (elapsedMs / 1000)).toFixed(1) : 0;
              stream.preview = visible.length > 600 ? "…" + visible.slice(-600) : visible;
            },
          );
          console.log("Retry raw output:", retry.text);
          code = normalizeLLMCode(retry.text);
          userCodeMatch = code.match(
            /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
          );
          userCode = userCodeMatch ? userCodeMatch[1].trim() : "";
          renderCheck = validateRenderableUserCode(userCode);
          if (renderCheck.ok && creationMode.value === "game") {
            renderCheck = validateGeneratedGameCode(userCode);
          }
        }

        let usedReferenceFallback = false;
        if (
          isReferenceGeneration.value &&
          (!userCode || !renderCheck.ok)
        ) {
          console.warn("[3D] Reconstruction code was invalid; using visible reference relief.");
          code = draftReferenceCode;
          userCodeMatch = code.match(
            /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
          );
          userCode = userCodeMatch ? userCodeMatch[1].trim() : "";
          renderCheck = validateRenderableUserCode(userCode);
          usedReferenceFallback = true;
        }

        lastAttemptedCode = userCode;
        console.log("User code:", userCode || "(empty — LLM produced no code)");
        if (!userCode) {
          throw new Error(
            "LLM produced no usable code (thinking may have consumed all tokens). Try again.",
          );
        }
        // Runtime recovery also repairs syntax failures from the bounded retry.

        // Render
        lastStatus.value = "Rendering...";
        _resetStream("Rendering", 1, "Compiling shaders and casting first light.");
        // Rendering doesn't stream tokens — we just want the loading
        // screen to flip into "Rendering" while the GPU does its job.
        // Set a fake "almost done" progress so the bar reads right.
        stream.tokenCount = 1;
        stream.maxTokens = 1;
        try {
          await viewer.applyModuleCode(code, "replace", {kind: creationMode.value});
        } catch (renderError) {
          if (!isReferenceGeneration.value) {
            const recovered = await recoverGeneratedScene(viewer, userCode, submittedPrompt);
            userCode = recovered.code;
            code = normalizeLLMCode(userCode);
          } else {
            if (usedReferenceFallback) throw renderError;
            console.warn(
              "[3D] Generated reconstruction was not renderable; using visible reference relief.",
              renderError,
            );
            code = draftReferenceCode;
            userCodeMatch = code.match(
              /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
            );
            userCode = userCodeMatch ? userCodeMatch[1].trim() : "";
            usedReferenceFallback = true;
            await viewer.applyModuleCode(code, "replace", {kind: creationMode.value});
          }
        }
        restoreViewerEnvironmentControls();

        let designSignature = sceneDesignSignature(viewer.scene.getObjectByName('GeneratedObject'));
        const previousDesigns = objectInferences.value.filter(item => item.prompt?.trim().replace(/\s+/g, ' ').toLowerCase() === submittedPrompt.trim().replace(/\s+/g, ' ').toLowerCase()
          && item.assetKind === creationMode.value).map(item => item.designSignature).filter(Boolean);
        if (!isReferenceGeneration.value && designSignature && previousDesigns.includes(designSignature)) {
          lastStatus.value = "Exploring a new design...";
          _resetStream("New Interpretation", 2048, "The first result repeated a previous design. Exploring a different construction.");
          const revised = await callLLM(buildSceneRepair({ mode: creationMode.value, code: userCode, brief: submittedPrompt,
            error: `This repeats a previous asset's geometry and materials. Make meaningful changes to unspecified design decisions while preserving all explicit user constraints. ${variation}` }),
            { maxTokens: 2048, temperature: 0.6, thoughtTokens: 0, enableThinking: false },
            ({ tokenCount, elapsedMs }) => { stream.tokenCount = tokenCount; stream.elapsedMs = elapsedMs; });
          code = normalizeLLMCode(applySceneEdits(userCode, stripThinkBlocks(revised.text)));
          await viewer.applyModuleCode(code, "replace", {kind: creationMode.value});
          restoreViewerEnvironmentControls();
          designSignature = sceneDesignSignature(viewer.scene.getObjectByName('GeneratedObject'));
          if (previousDesigns.includes(designSignature)) throw new Error("The model repeated a previous design. Please generate another interpretation.");
          userCode = code.match(/\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/)?.[1]?.trim() || '';
        }

        if (usedReferenceFallback) lastAssemblyContract.value = null;
        if (lastAssemblyContract.value) {
          const checked = await improveAssembly(viewer,userCode,submittedPrompt);
          userCode=checked.code;code=normalizeLLMCode(userCode);
        }
        // Store for refinement
        lastGeneratedCode.value = userCode;
        lastGeneratedBrief.value = submittedPrompt;

        // Combined tok/s from both phases
        const totalTokens = (blueprintResult.tokenCount || 0) + codeResult.tokenCount;
        const totalMs = (blueprintResult.elapsedMs || 0) + codeResult.elapsedMs;
        const tokensPerSecond = totalMs > 0 ? ((totalTokens / totalMs) * 1000).toFixed(1) : null;

        lastStatus.value = "Draft rendered. Checking visual quality…";
        let snapshot = null;
        let screenshots = [];
        let fidelityReview = null;
        let qualityStatus = "unreviewed";
        if (!usedReferenceFallback && creationMode.value !== "game") {
          const quality = await reviewRenderedConstruction(viewer,userCode,submittedPrompt,creationMode.value,
            isReferenceGeneration.value ? submittedReference : null);
          userCode = quality.code;
          code = normalizeLLMCode(userCode);
          lastGeneratedCode.value = userCode;
          snapshot = quality.snapshot;
          screenshots = quality.screenshots;
          fidelityReview = {...quality.review,passes:quality.passes};
          qualityStatus = quality.status;
          designSignature = sceneDesignSignature(viewer.scene.getObjectByName("GeneratedObject"));
        } else {
          snapshot=await captureViewerSnapshot("Preview");screenshots=snapshot?[snapshot]:[];
        }
        const assemblyReport=inspectAssembly(viewer.scene.getObjectByName('GeneratedObject'),lastAssemblyContract.value);
        if(assemblyReport.errors.length)qualityStatus='needs-refinement';
        lastStatus.value = qualityStatus === "reviewed" ? "Visual review passed"
          : qualityStatus === "needs-refinement" ? "Draft saved — review suggestions available"
          : "Draft saved — visual review unavailable";
        const savedRecord = await addObjectInference(submittedPrompt, code, {
          elapsedMs: Math.round(performance.now() - generationStarted),
          success: true,
          mode: effectiveCreationMode.value,
          assetKind: isReferenceGeneration.value ? "object" : creationMode.value,
          blueprint,
          assemblyContract: lastAssemblyContract.value,
          assemblyReport,
          assemblyPlanningDiagnostics:assemblyPlanningDiagnostics.value,
          creativeDirection,
          designSignature,
          referenceAnalysis,
          referenceImage: submittedReference,
          usedReferenceFallback,
          fidelityReview,
          qualityStatus,
          visionVerified: !assemblyReport.errors.length && passesVisualReview(fidelityReview),
          tokensPerSecond,
          model: currentModel.value.modelname,
          screenshots,
          thumbnail: snapshot?.dataUrl || "",
        });
        reportOperation({id:activityId,status:"completed",stage:"Ready"});
        console.log("[3D] Inference saved to history:", savedRecord?.id);
        if (creationMode.value === "level") {
          const level = materializeBuildAsset({
            libraryId: `history:${savedRecord.id}`,
            inferenceId: savedRecord.id,
            kind: "level",
            title: submittedPrompt || `Level ${gameProject.value.levels.length + 1}`,
            code,
            thumbnail: snapshot?.dataUrl || "",
            source: "history",
          });
          forgeLevelId.value = level.id;
          projectStatus.value = `${level.title} added as level ${gameProject.value.levelOrder.length}.`;
        }
        form.prompt = "";
        if (isReferenceGeneration.value) referenceImage.value = null;
      } catch (e) {
        reportOperation({id:activityId,status:"failed",stage:"Failed",error:e.message});
        console.error("❌ Generation error:", e);
        lastStatus.value = "❌ Failed: " + e.message;
        try {
          await addObjectInference(submittedPrompt, (e.generatedCode || lastAttemptedCode) ? normalizeLLMCode(e.generatedCode || lastAttemptedCode) : "", {
            success: false,
            mode: effectiveCreationMode.value,
            referenceImage: submittedReference,
            error: e.message,
            notes: [e.message, ...(e.generationFailures || [])].join("\n"),
            model: currentModel.value?.modelname || "",
          });
        } catch (historyError) {
          console.warn("[3D] Failed to save generation error:", historyError);
        }
      } finally {
        _endStream();
        isLoading.value = false;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // REFINE HANDLER
    // ═══════════════════════════════════════════════════════════════════════
    const onRefine = async () => {
      if (!refinePrompt.value.trim() || !lastGeneratedCode.value) return;
      isLoading.value = true;
      const generationStarted = performance.now();
      const activityId = `3d:${crypto.randomUUID()}`;
      reportOperation({id:activityId,title:"Refining 3D",mode:"game",status:"running",stage:"Refining",location:"3D"});
      const previous = {code:lastGeneratedCode.value,brief:lastGeneratedBrief.value,plan:lastAssemblyContract.value};
      lastStatus.value = "Refining...";
      try {
        await loadModelForGeneration(codeModel.value);
        const viewer = threeViewer.value;
        if (!viewer) throw new Error("Viewer not initialized");

        if(lastAssemblyContract.value){
          lastStatus.value='Updating assembly plan…';
          lastAssemblyContract.value=await planAssembly(lastGeneratedBrief.value+'\nRequested revision: '+refinePrompt.value+'\nPrevious assembly: '+JSON.stringify(previous.plan)+'\nPreserve unaffected part IDs and bounds.',creationMode.value);
        }
        // Reset chat history to free context for refinement
        await window.electronAPI.resetChat();

        const prompt = buildRefinePrompt(lastGeneratedCode.value, refinePrompt.value) + "\n" + assemblyInstructions(lastAssemblyContract.value);
        const refineMaxTokens = 8192;
        _resetStream("Refining", refineMaxTokens, "Sculpting on top of the existing scene.");
        const result = await callLLM(
          prompt,
          {
            maxTokens: refineMaxTokens,
            temperature: 0.7,
            thoughtTokens: 0,
            enableThinking: false,
          },
          ({ text, tokenCount, elapsedMs, prefillMs, genMs }) => {
            const visible = _stripThinkForPreview(text);
            stream.tokenCount = tokenCount;
            stream.elapsedMs = elapsedMs;
            stream.prefillMs = prefillMs;
            // Real generation rate excludes prefill so the readout
            // doesn't get dragged down by the system prompt.
            stream.tokensPerSec = genMs > 0 ? +(tokenCount / (genMs / 1000)).toFixed(1) : 0;
            stream.preview = visible.length > 600 ? "…" + visible.slice(-600) : visible;
          },
        );
        const tokensPerSecond = result.elapsedMs > 0 ? ((result.tokenCount / result.elapsedMs) * 1000).toFixed(1) : null;
        console.log(`Refine: ${result.tokenCount} tokens in ${(result.elapsedMs / 1000).toFixed(1)}s (${tokensPerSecond || '?'} tok/s)`);

        let code = normalizeLLMCode(result.text);
        const userCodeMatch = code.match(
          /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
        );
        let refinedUserCode = userCodeMatch?.[1]?.trim() || "";
        if (!refinedUserCode) throw new Error("Refinement produced no code");
        const renderCheck = validateRenderableUserCode(refinedUserCode);
        if (!renderCheck.ok) throw new Error(`Refinement failed: ${renderCheck.reason}`);

        _resetStream("Rendering", 1, "Compiling shaders and casting first light.");
        stream.tokenCount = 1;
        stream.maxTokens = 1;
        const recovered = await recoverGeneratedScene(viewer, refinedUserCode, refinePrompt.value);
        const checked=await improveAssembly(viewer,recovered.code,`${lastGeneratedBrief.value}\nRequested revision: ${refinePrompt.value}`);
        refinedUserCode = checked.code;
        code = normalizeLLMCode(refinedUserCode);
        lastGeneratedCode.value = refinedUserCode;
        restoreViewerEnvironmentControls();
        const revisedBrief = `${lastGeneratedBrief.value}\nRequested revision: ${refinePrompt.value}`.trim();
        const quality = creationMode.value !== 'game'
          ? await reviewRenderedConstruction(viewer,refinedUserCode,revisedBrief,creationMode.value)
          : {code:refinedUserCode,status:'unreviewed',review:null,passes:[],snapshot:await captureViewerSnapshot('Preview')};
        code=normalizeLLMCode(quality.code);lastGeneratedCode.value=quality.code;lastGeneratedBrief.value=revisedBrief;
        const assemblyReport=inspectAssembly(viewer.scene.getObjectByName('GeneratedObject'),lastAssemblyContract.value);
        const snapshot=quality.snapshot;
        lastStatus.value=assemblyReport.errors.length?'Draft saved — review suggestions available':quality.status==='reviewed'?'Visual review passed':quality.status==='needs-refinement'?'Draft saved — review suggestions available':'Draft saved — visual review unavailable';
        const record=await addObjectInference(revisedBrief, code, {
          elapsedMs: Math.round(performance.now() - generationStarted),
          success: true,
          mode: effectiveCreationMode.value,
          assetKind: creationMode.value,
          qualityStatus: assemblyReport.errors.length?'needs-refinement':quality.status,
          assemblyContract: lastAssemblyContract.value,
          assemblyReport,
          assemblyPlanningDiagnostics:assemblyPlanningDiagnostics.value,
          fidelityReview: quality.review ? {...quality.review,passes:quality.passes} : null,
          visionVerified: !assemblyReport.errors.length && passesVisualReview(quality.review),
          tokensPerSecond,
          model: currentModel.value.modelname,
          screenshots: quality.screenshots || (snapshot ? [snapshot] : []),
          thumbnail: snapshot?.dataUrl || "",
        });
        if(creationMode.value==='level'){
          const level=materializeBuildAsset({kind:'level',title:record.prompt,code,inferenceId:record.id,thumbnail:snapshot?.dataUrl||''});
          forgeLevelId.value=level.id;
        }
        reportOperation({id:activityId,status:'completed',stage:'Ready'});
        refinePrompt.value = '';
      } catch (e) {
        lastAssemblyContract.value=previous.plan;lastGeneratedCode.value=previous.code;lastGeneratedBrief.value=previous.brief;
        try { await threeViewer.value.applyModuleCode(normalizeLLMCode(previous.code),'replace',{kind:creationMode.value}); restoreViewerEnvironmentControls(); }
        catch (restoreError) { console.error('Could not restore previous scene',restoreError); }
        reportOperation({id:activityId,status:"failed",stage:"Failed",error:e.message});
        console.error("Refine error:", e);
        lastStatus.value = "Refine failed: " + e.message;
      } finally {
        _endStream();
        isLoading.value = false;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════
    onMounted(async () => {
      // Load object inferences from shared store
      await loadObjectInferences();

      // Check if the required planner and codegen models are already downloaded
      await refreshRequiredModelAvailability();

      // Resume any active downloads
      resumeActiveDownloadIfAny();

      await nextTick();
      initialSceneReady = waitForViewerReady().then(() => {
        restoreViewerEnvironmentControls();
        return loadDefaultObject();
      });
      // Setup scroll observer after DOM is rendered
      setTimeout(setupScrollObserver, 100);
      // Attach scroll listener for scroll-to-top button
      const container = document.querySelector(".models__deployment-install");
      if (container) {
        scrollContainer.value = container;
        container.addEventListener("scroll", handleScroll, { passive: true });
      }
    });

    onBeforeUnmount(() => {
      editDisposed=true;
      editCancelled=true;
      if(editingBusy.value) window.electronAPI?.abortChatStream?.();
      // Cleanup scroll observer
      if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
      }
      // Cleanup scroll listener
      if (scrollContainer.value) {
        scrollContainer.value.removeEventListener("scroll", handleScroll);
      }
      clearDeleteToastTimer();
      // Cleanup downloads socket
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      // Cleanup HTTP poll timer
      if (httpPollTimer) {
        clearInterval(httpPollTimer);
        httpPollTimer = null;
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // RETURN
    // ═══════════════════════════════════════════════════════════════════════
    return {
      isLoading,
      threeViewer,
      lastStatus,
      // Game-style streaming loader
      stream,
      streamProgress,
      streamPreviewEl,
      showExamples,
      objectInferences,
      // lazy loading pagination
      paginatedInferences,
      loadMoreSentinel,
      hasMore,
      isLoadingMore,
      // scroll to top
      showScrollTop,
      scrollToTop,
      hasCopy,
      currentTime,
      presentation,
      currentWeather,
      lightIntensity,
      lightingPresets,
      weatherOptions,
      // Screenshot modal
      screenshotModal,
      openScreenshotModal,
      closeScreenshotModal,
      navigateScreenshot,
      downloadScreenshot,
      downloadAllScreenshots,
      // Bundled downloads
      needsDownload,
      isDownloading,
      downloadStatus,
      downloadAllModels,
      cancelActiveDownloads,
      isCancellingDownloads,
      downloads,
      downloadTaskList,
      form,
      workspaceTab,
      workspaceTabs,
      setWorkspaceTab,
      creationMode,
      objectInputMode,
      levelEditor, editorRevision, editorBusy, editingBusy, editUndo, editRedo, cancelLevelRegeneration,
      openLevelEditor, commitLevelTransform, commitLevelMarker, placeEditorAsset, regenerateLevelSelection, saveEditedLevel,
      undoLevelEdit, redoLevelEdit,
      gameProject,
      forgeLevelId,
      forgeObjectId,
      forgePosition,
      forgeRole,
      interactionSourceId,
      interactionTargetId,
      interactionType,
      draggedObjectId,
      buildLibrary,
      buildObjectLibrary,
      orderedProjectLevels,
      activeLevel,
      activeLevelPlacements,
      selectedPlacement,
      selectedPlacementAsset,
      selectedPlacementInteractions,
      selectedRole,
      selectedPlacementId,
      pendingPaletteItemId,
      buildTool,
      buildTools,
      gameplayInstruction,
      gameplayUpdating,
      gameplaySuggestions,
      selectedBuildLevelLibraryId,
      selectedBuildObjectLibraryIds,
      buildEditorReady,
      isPlaytesting,
      historyLevelLibrary,
      historyObjectLibrary,
      canStartBuildWorkflow,
      buildWorkflowComplete,
      objectRoles,
      projectPlacementCount,
      projectStatus,
      canTokenizeProject,
      saveCurrentAsset,
      placeForgeObject,
      beginObjectDrag,
      beginHistoryDrag,
      useBuildAsset,
      useBuildStarter,
      createLevelFromBuild,
      createObjectFromBuild,
      selectBuildLevel,
      moveActiveLevel,
      selectPaletteAsset,
      handleBuildCanvasClick,
      commitSelectedPlacement,
      deleteSelectedPlacement,
      formatVector,
      placementLabel,
      placementLabelById,
      dropObjectOnMap,
      addForgeInteraction,
      clearConditionIcon,
      deleteClearCondition,
      updateGameplayWithAI,
      toggleBuildObject,
      startBuildWorkflow,
      removeActiveLevel,
      startPlaytest,
      stopPlaytest,
      previewGameProject,
      tokenizeGameProject,
      openGameMarkets,
      agentCompanions,
      agentCompanionId,
      agentCompanionName,
      startCompanionPlay,
      referenceImage,
      onReferenceImagePicked,
      removeReferenceImage,
      enablePhysics,
      setTimeOfDay,
      setWeather,
      performancePresets,
      currentPerformance,
      setPerformance,
      setLightIntensity,
      copyPrompt,
      historyThumbnail,
      formatHistoryDate,
      clearScene,
      handleSuccess,
      handleError,
      useExample,
      removeInference,
      pendingDelete,
      dismissDeleteToast,
      confirmDeleteObject,
      actionsFor,
      handleAction,
      clearHistory,
      exportHistory,
      importHistory,
      applyInference,
      regenerateFromInference,
      onSubmit,
      // Refine mode
      lastGeneratedCode,
      refinePrompt,
      onRefine,
      // Access control
      accessRef,
      hasAccess,
      onAccessChanged,
      canSubmitWithAccess,
      // Model management
      reasoningEnabled,
      currentModel,
      missingRequiredModels,
      downloadProgress,
      isModel,
      isModelAvailable,
      downloadModel,
      deleteModel,
      // Payout history
      requestOpenNetworkModal,
      // NFT Minting
      glbExportStatus,
      mintTarget,
      openMint,
      onMinted,
      // NFT Import
      importTokenId,
      isImportingNFT,
      importFromNFT,
    };
  },
};
</script>

<style scoped>
/* Keep editing controls compact so the canvas remains in the working viewport. */
.three-controls-layout { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:16px; align-items:stretch; }
.three-controls-layout > * { min-width:0; margin:0 !important; max-height:32vh; overflow:auto; scrollbar-gutter:stable; }
.three-controls-layout .models__activity--payouts { padding:12px !important; }
.three-controls-layout :deep(.bz-gen-input) { padding:10px; gap:8px; }
.three-controls-layout :deep(textarea) { min-height:64px !important; max-height:96px; }
.three-controls-layout .environment-controls.bz-3d-environment { padding:16px !important; gap:12px; grid-template-columns:1fr; }
.three-controls-layout .bz-3d-control-group { display:grid; grid-template-columns:100px minmax(0,1fr); align-items:start; gap:10px; }
.three-controls-layout .bz-3d-control-head { font-size:11px; padding-top:10px; }
.three-controls-layout .bz-3d-option { font-size:12px; }
.three-controls-layout .bz-3d-selector { display:flex; flex-wrap:wrap; }
.three-controls-layout .bz-3d-option { min-height:34px; padding:7px 10px; flex:1 0 auto; }
.three-controls-layout + .viewer-container:not(.is-build) { height:clamp(280px,51vh,800px); aspect-ratio:auto; margin:16px 0; position:sticky; top:0; z-index:2; }
@media(max-width:760px) {
 .three-controls-layout { grid-template-columns:1fr; max-height:40vh; overflow:auto; }
 .three-controls-layout > * { max-height:none; overflow:visible; }
 .three-controls-layout .bz-3d-control-group { grid-template-columns:80px minmax(0,1fr); }
 .three-controls-layout + .viewer-container:not(.is-build) { height:42vh; min-height:240px; }
}
.three-workspace-tabs {
  position: relative;
  display: flex;
  width: 100%;
  margin: 0 0 var(--bz-space-5);
  border-bottom: 1px solid var(--bz-border);
  background: var(--bz-canvas);
}

.three-workspace-tabs button {
  position: relative;
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 0 var(--bz-space-5);
  border: 0;
  background: transparent;
  color: var(--bz-fg-low);
  font: 600 var(--bz-size-meta) var(--bz-font-ui);
  cursor: pointer;
}

.three-workspace-tabs button:hover {
  color: var(--bz-fg);
}

.three-workspace-tabs button:focus-visible {
  outline: 0;
  color: var(--bz-fg);
}

.three-workspace-tabs button.is-active {
  color: var(--bz-fg);
}

.three-workspace-tabs button.is-active::after {
  position: absolute;
  right: var(--bz-space-4);
  bottom: -1px;
  left: var(--bz-space-4);
  height: 2px;
  background: var(--bz-purple-300);
  content: "";
}

.three-workspace-tabs .material-symbols-outlined {
  font-size: 18px;
}

.world-forge {
  margin-top: var(--bz-space-6);
  padding: var(--bz-space-5) 0;
  border-top: 1px solid var(--bz-border);
  border-bottom: 1px solid var(--bz-border);
}

.world-forge__head,
.world-forge__toolbar,
.world-forge__assembly,
.world-forge__execution {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
}

.world-forge__head {
  justify-content: space-between;
  margin-bottom: var(--bz-space-4);
}

.world-forge__counts {
  display: flex;
  gap: var(--bz-space-5);
  color: var(--bz-fg-mid);
  font-size: 12px;
}

.world-forge__counts b {
  margin-right: var(--bz-space-1);
  color: var(--bz-fg);
  font-size: 18px;
}

.world-forge__toolbar,
.world-forge__assembly {
  padding: var(--bz-space-3) 0;
}

.world-forge__execution {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(160px, 220px) repeat(3, auto);
  align-items: stretch;
  padding: var(--bz-space-3) 0;
}

.world-forge__toolbar .bz-field-input,
.world-forge__execution textarea {
  flex: 1;
}

.world-forge__assembly {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) repeat(3, 72px) minmax(120px, 160px) 36px;
}

.world-forge__assembly label {
  display: grid;
  gap: var(--bz-space-1);
  color: var(--bz-fg-mid);
  font-size: 11px;
  text-transform: uppercase;
}

.world-forge__execution textarea {
  min-height: 58px;
  resize: vertical;
}

.world-forge__interaction {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 140px minmax(160px, 1fr) 36px auto;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3) 0;
}

.viewer-wrapper.is-drop-target {
  outline: 2px solid var(--bz-purple-300);
  outline-offset: -2px;
}

.viewer-wrapper.is-drop-target::after {
  position: absolute;
  z-index: 20;
  inset: var(--bz-space-4);
  display: grid;
  place-items: center;
  border: 1px dashed var(--bz-purple-100);
  border-radius: 6px;
  background: var(--bz-scrim);
  color: var(--bz-fg);
  content: "Drop to place";
  font-size: 14px;
  pointer-events: none;
}

.world-forge__status {
  margin-top: var(--bz-space-2);
  color: var(--bz-fg);
  font-size: 13px;
}

.build-dock {
  position: absolute;
  z-index: 30;
  top: var(--bz-space-3);
  bottom: var(--bz-space-3);
  left: var(--bz-space-3);
  display: flex;
  width: 264px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--bz-border-strong);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bz-panel) 94%, transparent);
  box-shadow: 0 12px 36px var(--bz-scrim);
  backdrop-filter: blur(16px);
}

.build-dock__project,
.build-dock__head,
.build-dock__footer {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-3);
}

.build-dock__project {
  border-bottom: 1px solid var(--bz-border);
}

.build-dock__project > .material-symbols-outlined {
  color: var(--bz-purple-200);
  font-size: 19px;
}

.build-dock__project input,
.build-dock__level select {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--bz-fg);
  font: 600 13px var(--bz-font-ui);
}

.build-dock__level {
  display: grid;
  gap: 4px;
  padding: var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
}

.build-dock__level label,
.build-dock__head small,
.build-dock__footer,
.build-asset small {
  color: var(--bz-fg-low);
  font-size: 10px;
}

.build-dock__level label {
  text-transform: uppercase;
}

.build-dock__head {
  justify-content: space-between;
}

.build-dock__head div {
  display: grid;
  gap: 2px;
}

.build-dock__head strong {
  font-size: 12px;
}

.build-dock__assets {
  display: grid;
  align-content: start;
  gap: 2px;
  min-height: 0;
  padding: 0 var(--bz-space-2) var(--bz-space-2);
  overflow-y: auto;
}

.build-asset {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 18px;
  align-items: center;
  gap: var(--bz-space-2);
  min-height: 52px;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--bz-fg);
  text-align: left;
  cursor: grab;
}

.build-asset:hover,
.build-asset:focus-visible {
  border-color: var(--bz-border);
  background: var(--bz-raised);
}

.build-asset img,
.build-asset > .material-symbols-outlined:first-child {
  width: 38px;
  height: 38px;
  border-radius: 3px;
  object-fit: cover;
}

.build-asset > .material-symbols-outlined:first-child {
  display: grid;
  place-items: center;
  background: var(--bz-raised);
  font-size: 18px;
}

.build-asset span:nth-child(2) {
  display: grid;
  min-width: 0;
}

.build-asset strong,
.build-asset small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.build-asset strong {
  font-size: 11px;
  font-weight: 600;
}

.build-asset__grip {
  color: var(--bz-fg-low);
  font-size: 16px;
}

.build-dock__empty {
  display: grid;
  gap: 4px;
  margin: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 11px;
  line-height: 1.5;
}

.build-dock__empty p {
  margin: var(--bz-space-2) 4px;
  color: var(--bz-fg-low);
  font: 500 10px var(--bz-font-ui);
  text-transform: uppercase;
}

.build-dock__empty button {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 0 var(--bz-space-2);
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--bz-fg-mid);
  font: 500 11px var(--bz-font-ui);
  text-align: left;
  cursor: pointer;
}

.build-dock__empty button:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.build-dock__empty .material-symbols-outlined {
  font-size: 16px;
}

.build-dock__footer {
  justify-content: space-between;
  margin-top: auto;
  border-top: 1px solid var(--bz-border);
}

.build-dock__footer b {
  color: var(--bz-fg);
}

.viewer-container.is-build {
  height: calc(100vh - 220px);
  min-height: 500px;
  max-height: 720px;
  aspect-ratio: auto;
  border: 1px solid var(--bz-border-strong);
  background: var(--bz-panel);
  box-shadow: none;
}

.viewer-wrapper.has-builder :deep(.perf-stats),
.viewer-wrapper.has-builder :deep(.controls-hint) {
  display: none;
}

.build-levels,
.build-inspector,
.build-palette,
.build-tools {
  position: absolute;
  z-index: 30;
  border: 1px solid var(--bz-border);
  background: var(--bz-panel);
}

.build-levels {
  top: var(--bz-space-3);
  bottom: 112px;
  left: var(--bz-space-3);
  display: flex;
  width: 214px;
  flex-direction: column;
  overflow: hidden;
  border-radius: 6px;
}

.build-levels__project,
.build-levels__head,
.build-levels__order {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
}

.build-levels__project {
  display: grid;
  gap: 3px;
}

.build-levels__project span,
.build-inspector__head span,
.build-field > span,
.build-transform > span {
  color: var(--bz-fg-low);
  font-size: 10px;
  text-transform: uppercase;
}

.build-levels__project input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--bz-fg);
  font: 600 13px var(--bz-font-ui);
}

.build-levels__head,
.build-levels__order {
  justify-content: space-between;
}

.build-levels__head strong {
  font-size: 12px;
}

.build-levels__list {
  display: grid;
  align-content: start;
  gap: 2px;
  min-height: 0;
  padding: var(--bz-space-2);
  overflow-y: auto;
}

.build-level {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: var(--bz-space-2);
  min-height: 48px;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--bz-fg-mid);
  text-align: left;
  cursor: pointer;
}

.build-level:hover,
.build-level.is-active {
  border-color: var(--bz-border-strong);
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.build-level.is-active {
  border-color: var(--bz-border-brand);
}

.build-level__number {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 3px;
  background: var(--bz-card);
  font: 600 11px var(--bz-font-mono);
}

.build-level > span:last-child {
  display: grid;
  min-width: 0;
}

.build-level strong,
.build-level small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.build-level strong {
  font-size: 11px;
}

.build-level small,
.build-levels__order {
  color: var(--bz-fg-low);
  font-size: 10px;
}

.build-levels__order {
  margin-top: auto;
  border-top: 1px solid var(--bz-border);
  border-bottom: 0;
}

.build-levels__empty {
  display: grid;
  gap: 4px;
  padding: var(--bz-space-2);
}

.build-levels__empty p {
  margin: 0 0 var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 11px;
}

.build-levels__empty button {
  min-height: 32px;
  padding: 0 var(--bz-space-2);
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--bz-fg-mid);
  font: 400 11px var(--bz-font-ui);
  text-align: left;
  cursor: pointer;
}

.build-levels__empty button:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.build-inspector {
  top: var(--bz-space-3);
  right: var(--bz-space-3);
  bottom: 112px;
  width: 236px;
  overflow-y: auto;
  border-radius: 6px;
}

.build-inspector__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-2);
  padding: var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
}

.build-inspector__head > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.build-inspector__head strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.build-field,
.build-transform,
.build-connections {
  display: grid;
  gap: var(--bz-space-2);
  padding: var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
}

.build-field select,
.build-connections select,
.build-transform input {
  width: 100%;
  min-height: 32px;
  border: 1px solid var(--bz-border-strong);
  border-radius: 3px;
  outline: 0;
  background: var(--bz-card);
  color: var(--bz-fg);
  font: 400 11px var(--bz-font-ui);
}

.build-role-note {
  display: grid;
  gap: 3px;
  padding: var(--bz-space-3);
  background: var(--bz-card);
}

.build-role-note strong {
  font-size: 11px;
}

.build-role-note span,
.build-inspector__hint {
  color: var(--bz-fg-low);
  font-size: 10px;
  line-height: 1.45;
}

.build-transform {
  grid-template-columns: repeat(3, 1fr);
}

.build-transform > span {
  grid-column: 1 / -1;
}

.build-transform label {
  display: grid;
  grid-template-columns: 14px 1fr;
  align-items: center;
  gap: 2px;
}

.build-transform small {
  color: var(--bz-fg-low);
  font-size: 9px;
}

.build-transform input {
  min-width: 0;
  padding: 0 4px;
  font-family: var(--bz-font-mono);
}

.build-connections > strong {
  font-size: 11px;
}

.build-connection-row {
  display: flex;
  justify-content: space-between;
  gap: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 10px;
}

.build-marker {
  display: grid;
  grid-template-columns: 12px 1fr;
  align-items: center;
  gap: var(--bz-space-2);
  width: calc(100% - 24px);
  min-height: 46px;
  margin: var(--bz-space-3) var(--bz-space-3) 0;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  background: transparent;
  color: var(--bz-fg);
  text-align: left;
  cursor: pointer;
}

.build-marker:hover {
  background: var(--bz-raised);
}

.build-marker__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bz-fg-low);
}

.build-marker__dot.is-start { background: var(--bz-emerald-500); }
.build-marker__dot.is-finish { background: var(--bz-purple-300); }

.build-marker > span:last-child {
  display: grid;
}

.build-marker strong { font-size: 11px; }
.build-marker small { color: var(--bz-fg-low); font: 10px var(--bz-font-mono); }
.build-inspector__hint { margin: var(--bz-space-4); }

.build-tools {
  top: var(--bz-space-3);
  left: 50%;
  display: flex;
  padding: 3px;
  border-radius: 5px;
  transform: translateX(-50%);
}

.build-tools button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 5px;
  padding: 0 var(--bz-space-3);
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--bz-fg-mid);
  font: 500 11px var(--bz-font-ui);
  cursor: pointer;
}

.build-tools button:hover,
.build-tools button.is-active {
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.build-tools button.is-active {
  box-shadow: inset 0 0 0 1px var(--bz-border-brand);
}

.build-tools .material-symbols-outlined { font-size: 16px; }

.build-palette {
  right: 252px;
  bottom: var(--bz-space-3);
  left: 230px;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  min-height: 88px;
  overflow: hidden;
  border-radius: 6px;
}

.build-palette__head {
  display: grid;
  align-content: center;
  gap: 3px;
  padding: var(--bz-space-3);
  border-right: 1px solid var(--bz-border);
}

.build-palette__head strong { font-size: 11px; }
.build-palette__head span { color: var(--bz-fg-low); font: 10px var(--bz-font-mono); }

.build-palette__items {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--bz-space-2);
  overflow-x: auto;
}

.build-palette__items button {
  display: grid;
  flex: 0 0 64px;
  justify-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--bz-fg-mid);
  cursor: grab;
}

.build-palette__items button:hover {
  border-color: var(--bz-border-strong);
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.build-palette__items button.is-selected {
  border-color: var(--bz-border-brand);
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.build-steps {
  display: grid;
  gap: var(--bz-space-3);
  margin: 0;
  padding: var(--bz-space-4);
  list-style: none;
}

.build-steps li {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: start;
  gap: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 10px;
  line-height: 1.4;
}

.build-steps b {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 3px;
  background: var(--bz-card);
  color: var(--bz-fg-mid);
  font: 600 10px var(--bz-font-mono);
}

.build-palette__items img,
.build-palette__items button > .material-symbols-outlined {
  width: 42px;
  height: 42px;
  border-radius: 3px;
  object-fit: cover;
}

.build-palette__items button > .material-symbols-outlined {
  display: grid;
  place-items: center;
  background: var(--bz-card);
  font-size: 18px;
}

.build-palette__items small {
  width: 56px;
  overflow: hidden;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.build-canvas-empty {
  position: absolute;
  z-index: 15;
  top: 50%;
  left: 50%;
  display: grid;
  justify-items: center;
  gap: 4px;
  color: var(--bz-fg-mid);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.build-canvas-empty strong { font-size: 14px; }
.build-canvas-empty span { color: var(--bz-fg-low); font-size: 11px; }

.build-status {
  position: absolute;
  z-index: 28;
  right: 252px;
  bottom: 112px;
  left: 230px;
  margin: 0;
  padding: 8px var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  background: var(--bz-panel);
  color: var(--bz-fg-mid);
  font-size: 10px;
  text-align: center;
  pointer-events: none;
}

.distribution {
  display: grid;
  gap: var(--bz-space-5);
}

.distribution__readiness {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-block: 1px solid var(--bz-border);
}

.distribution__readiness div {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 2px var(--bz-space-2);
  padding: var(--bz-space-4);
  border-right: 1px solid var(--bz-border);
}

.distribution__readiness div:last-child {
  border-right: 0;
}

.distribution__readiness .material-symbols-outlined {
  grid-row: 1 / 3;
  color: var(--bz-fg-low);
}

.distribution__readiness .is-ready .material-symbols-outlined {
  color: var(--bz-emerald-500);
}

.distribution__readiness small,
.distribution__actions p {
  color: var(--bz-fg-low);
}

.distribution__actions {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
}

.distribution__actions > div {
  flex: 1;
}

.distribution__actions p {
  max-width: 62ch;
  margin: 4px 0 0;
  font-size: 12px;
}

@media (max-width: 900px) {
  .world-forge__head,
  .world-forge__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .world-forge__assembly {
    grid-template-columns: 1fr 1fr;
  }

  .world-forge__execution {
    grid-template-columns: 1fr;
  }

  .world-forge__interaction {
    grid-template-columns: 1fr 1fr;
  }

  .three-workspace-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .three-workspace-tabs button {
    min-width: max-content;
    padding: 0 var(--bz-space-3);
  }

  .build-dock {
    top: var(--bz-space-2);
    bottom: var(--bz-space-2);
    left: var(--bz-space-2);
    width: min(240px, 42%);
  }

  .viewer-container.is-build {
    min-height: 560px;
  }

  .build-levels { width: 176px; }
  .build-inspector { width: 196px; }
  .build-palette { right: 212px; left: 192px; }
  .build-status { right: 212px; left: 192px; }

  .build-tools button span:last-child {
    display: none;
  }

  .distribution__readiness {
    grid-template-columns: 1fr 1fr;
  }

  .distribution__actions {
    align-items: stretch;
    flex-direction: column;
  }
}

.bz-3d-mode {
  display: inline-flex;
  margin: 0 0 var(--bz-space-3);
  padding: 3px;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: 6px;
}

.bz-3d-mode button {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  min-height: 34px;
  padding: 0 var(--bz-space-3);
  color: var(--bz-fg-mid);
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  transition:
    color var(--bz-dur-fast) var(--bz-ease-stand),
    background-color var(--bz-dur-fast) var(--bz-ease-stand);
}

.bz-3d-mode button:hover {
  color: var(--bz-fg);
  background: var(--bz-raised);
}

.bz-3d-mode button:focus-visible {
  outline: 2px solid var(--bz-purple-300);
  outline-offset: 1px;
}

.bz-3d-mode button.is-selected {
  color: var(--bz-fg);
  background: var(--bz-raised);
  box-shadow: inset 0 0 0 1px var(--bz-border-brand);
}

.bz-3d-mode .material-symbols-outlined {
  font-size: 18px;
}

.bz-3d-reference {
  margin-bottom: var(--bz-space-3);
}

.bz-3d-reference__picker {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  min-height: 76px;
  padding: var(--bz-space-3) var(--bz-space-4);
  color: var(--bz-fg-mid);
  background: var(--bz-panel);
  border: 1px dashed var(--bz-border-strong);
  border-radius: 6px;
  cursor: pointer;
  transition:
    color var(--bz-dur-fast) var(--bz-ease-stand),
    border-color var(--bz-dur-fast) var(--bz-ease-stand);
}

.bz-3d-reference__picker:hover,
.bz-3d-reference__picker:focus-within {
  color: var(--bz-fg);
  border-color: var(--bz-border-brand);
}

.bz-3d-reference__picker input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.bz-3d-reference__picker .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 26px;
}

.bz-3d-reference__picker span:last-child {
  display: grid;
  gap: var(--bz-space-1);
}

.bz-3d-reference__picker strong {
  color: var(--bz-fg);
  font-size: 14px;
}

.bz-3d-reference__picker small {
  color: var(--bz-fg-low);
  font-size: 12px;
}

.bz-3d-reference__preview {
  position: relative;
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) 36px;
  align-items: center;
  gap: var(--bz-space-3);
  min-height: 88px;
  padding: var(--bz-space-2);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: 6px;
}

.bz-3d-reference__preview img {
  width: 88px;
  height: 72px;
  object-fit: contain;
  background: var(--bz-canvas);
  border-radius: 4px;
}

.bz-3d-reference__name {
  overflow: hidden;
  color: var(--bz-fg-mid);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.three-prompt-input {
  min-height: 7rem;
}

.level-item.buttons {
  gap: var(--bz-space-2);
}

h1.bz-h1 {
  font-size: var(--bz-size-h1) !important;
  line-height: var(--bz-line-tight);
  text-align: left;
  margin: 0;
}

h2.bz-h2 {
  font-size: var(--bz-size-h2) !important;
  line-height: var(--bz-line-tight);
  text-align: left;
  margin: 0;
}

/* Fonts imported from App.vue for offline mode */
.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
  border-radius: 100%;
}
.columns {
  position: relative !important;
}
.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  left: 0;
  top: 0;
  background: url("../assets/bonzai_3d.webp") no-repeat center center;
  background-size: cover;  overflow: hidden;
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
.viewer-container {
  position: relative;
  margin: 2em 0;
  border-radius: 8px !important;
  box-shadow: 0 8px 32px var(--bz-scrim);
  aspect-ratio: 16 / 9;
  width: 100%;
}
.viewer-container.is-sell {
  max-height: 190px;
  aspect-ratio: 21 / 6;
}
.viewer-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bz-scrim-deep);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.models__deployment {
  position: relative;
  background: transparent;
  padding: 0 !important;
  margin: 0 !important;
}
.models__deployment-install {
  position: relative;
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
h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: var(--bz-fg);
}
.bz-screen-header .bz-h1 {
  font-size: var(--bz-size-h1) !important;
  line-height: var(--bz-line-tight);
  text-align: left;
}
.bz-screen-header .bz-eyebrow {
  margin: 0;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  line-height: 1.2;
  text-align: left;
  font-weight: 400;
}
.bz-screen-header .bz-title-icon {
  color: var(--bz-purple-300);
  font-size: 28px !important;
}
.bz-screen-header .bz-screen-subtitle {
  margin: 0;
  max-width: 60ch;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: var(--bz-line-body);
  text-align: left;
  font-weight: 400;
}
p {
  margin-bottom: 1em;
  font-size: 24px;
  color: var(--bz-fg);
  text-align: justify;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
}
.generation {
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1001;
  opacity: 0.95;
}
.notification {
  opacity: 0.8;
}
.environment-controls.bz-3d-environment {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.45fr);
  gap: var(--bz-space-4, 16px);
  padding: var(--bz-space-5, 20px) !important;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-lg, 8px);
  background: var(--bz-surface);
}
.bz-3d-option:focus-visible,
.example-card:focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.bz-3d-control-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3, 12px);
}
.bz-3d-control-group--performance {
  grid-column: 1 / -1;
}
.bz-3d-control-head {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2, 8px);
  color: var(--bz-fg);
  font-size: var(--bz-size-meta, 13px);
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0;
}
.bz-3d-control-head .material-symbols-outlined {
  font-size: 19px;
  color: var(--bz-accent);
}
.bz-3d-selector {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: var(--bz-space-2, 8px);
}
.bz-3d-control-group--weather .bz-3d-selector {
  grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
}
.bz-3d-control-group--performance .bz-3d-selector {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}
.bz-3d-option {
  min-width: 0;
  min-height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bz-space-2, 8px);
  padding: 10px 12px;
  color: var(--bz-fg-muted);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md, 8px);
  background: var(--bz-panel-soft, var(--bz-surface-alt));
  cursor: pointer;
  font-family: "Fira Sans", sans-serif;
  font-size: var(--bz-size-body, 14px);
  font-weight: 650;
  line-height: 1.1;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
}
.bz-3d-option:hover {
  color: var(--bz-fg);
  border-color: var(--bz-border-strong, var(--bz-accent));
  background: var(--bz-surface-raised, var(--bz-surface));
  transform: translateY(-1px);
}
.bz-3d-option.is-selected {
  color: var(--bz-control-selected-fg);
  border-color: var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}
.bz-3d-option .material-symbols-outlined {
  flex: 0 0 auto;
  font-size: 20px;
  color: currentColor;
}
.bz-3d-option span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 980px) {
  .environment-controls.bz-3d-environment {
    grid-template-columns: 1fr;
  }
}
.mode-buttons {
  display: flex;
  gap: 0.8em;
  flex-wrap: wrap;
}
.mode-btn {
  min-width: 6em;
  font-size: 1em !important;
  font-weight: 400;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px;
  color: var(--bz-fg-faint) !important;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
}
.mode-btn:hover {
  color: var(--bz-fg) !important;
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg);
}
.mode-btn.active {
  color: var(--bz-control-selected-fg) !important;
  border: 1px solid var(--bz-control-selected-border) !important;
  background: var(--bz-control-selected-bg) !important;
}
.mode-icon {
  font-size: 1.6em;
}
.mode-label {
  font-size: 0.8em;
  font-family: "Fira Sans", sans-serif;
  font-weight: 500;
  margin-top: 0.25em;
}
.mode-description {
  font-family: "Fira Sans", sans-serif;
  text-align: left !important;
}

/* Compact mode buttons */
.mode-buttons.compact {
  gap: 0.5em;
}
.mode-btn.small {
  min-width: auto;
  padding: 8px 12px;
}
.mode-btn.small .mode-icon {
  font-size: 1.2em;
}
.mode-btn.small .mode-label {
  font-size: 0.7em;
}

.iteration-pills {
  display: flex;
  gap: 0.5em;
}
.iteration-pill {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--bz-fg-faint);
  background: transparent;
  color: var(--bz-fg-mid);
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.iteration-pill:hover {
  border-color: var(--bz-fg-mid);
  color: var(--bz-fg);
}
.iteration-pill.active {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
}

/* Strategy Info Notification */
.strategy-info {
  display: flex;
  align-items: flex-start;
  gap: 0.75em;
  padding: 1em 1.25em !important;
  background: rgba(32, 156, 238, 0.15) !important;
  border: 1px solid rgba(32, 156, 238, 0.3) !important;
}

.strategy-info .info-icon {
  font-size: 16px;
  color: var(--bz-info);
  flex-shrink: 0;
}

.strategy-info span:last-child {
  font-size: 12px;
  line-height: 1.4;
}

/* Download List */
.download-list {
  list-style: none;
  margin: 0 0 0.5rem 0;
  padding: 0;
}
.download-list li {
  display: flex;
  align-items: center;
  padding: 0.5em 0;
  border-bottom: 1px solid var(--bz-border);
}
.download-list li:last-child {
  border-bottom: none;
}
.download-list .material-symbols-outlined {
  color: var(--bz-fg-mid);
  font-size: 1.25em;
}
.download-item-name {
  flex: 1;
  font-weight: 500;
}
.download-item-size {
  color: var(--bz-fg-low);
  font-size: 0.9em;
  margin-left: 1em;
}

.rotating {
  animation: bz-spin 1s linear infinite;
}
@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.examples-panel {
  margin-bottom: var(--bz-space-5);
  padding: var(--bz-space-4);
}
.example-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--bz-space-3);
}
.example-card {
  min-height: 136px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  grid-template-areas:
    "icon title"
    "icon desc";
  align-content: start;
  gap: var(--bz-space-2) var(--bz-space-3);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  color: var(--bz-fg);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    transform var(--bz-dur-fast) var(--bz-ease-out),
    box-shadow var(--bz-dur-fast) var(--bz-ease-out);
}
.example-card:hover {
  background: var(--bz-raised);
  border-color: var(--bz-border-brand);
  transform: translateY(-2px);
  box-shadow: var(--bz-elev-brand);
}
.example-icon {
  grid-area: icon;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bz-border-brand);
  border-radius: var(--bz-r-sm);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
  font-size: 22px !important;
  line-height: 1;
}
.example-title {
  grid-area: title;
  margin: 0;
  color: var(--bz-fg);
  font-family: var(--bz-font-display);
  font-size: var(--bz-size-h3);
  font-weight: 400;
  line-height: var(--bz-line-tight);
}
.example-desc {
  grid-area: desc;
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: var(--bz-line-body);
}
div.question {
  height: 100%;
  border: 1px solid var(--bz-border);
  padding: var(--bz-space-3);
  margin: 0 !important;
  box-shadow: none;
  border-radius: var(--bz-r);
  background: var(--bz-card);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  overflow: hidden;
}
.history-header {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 0.75em;
  font-size: var(--bz-size-meta);
  color: var(--bz-fg);
  flex-wrap: wrap;
}
.history-icon {
  font-size: 24px;
}
.history-badge {
  padding: 3px 24px 4px 8px;
  border: 1px solid var(--bz-border-strong);
  background-color: var(--bz-border);
  border-radius: 24px;
  font-size: 22px;
  font-weight: 600;
  text-transform: uppercase;
}
.history-meta {
  margin-left: auto;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.answer__model {
  font-weight: 600;
  color: var(--bz-fg-low);
  display: flex;
  align-items: center;
}
.answer__tps {
  color: var(--bz-emerald-500);
  font-weight: 700;
  margin-left: 4px;
}
.history-prompt {
  display: none;
}

.three-history-preview {
  width: 100%;
  aspect-ratio: 16 / 10;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}

.three-history-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.three-history-preview__empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--bz-fg-low);
}

.three-history-preview__empty .material-symbols-outlined {
  font-size: 48px !important;
}

.bz-image-delete-toast {
  position: fixed;
  right: max(var(--bz-space-5), env(safe-area-inset-right));
  bottom: max(var(--bz-space-5), env(safe-area-inset-bottom));
  z-index: 80;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  max-width: min(420px, calc(100vw - 32px));
  padding: var(--bz-space-3);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  box-shadow: var(--bz-shadow-lg);
  color: var(--bz-fg);
}

.bz-image-delete-toast .material-symbols-outlined {
  font-size: 18px !important;
  color: var(--bz-danger);
}

.bz-image-delete-toast__body {
  min-width: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  white-space: nowrap;
}

.bz-image-delete-toast__ghost,
.bz-image-delete-toast__danger {
  height: 30px;
  border-radius: var(--bz-r-sm);
  padding: 0 var(--bz-space-3);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-meta);
  cursor: pointer;
}

.bz-image-delete-toast__ghost {
  background: transparent;
  border: 1px solid var(--bz-border);
  color: var(--bz-fg-mid);
}

.bz-image-delete-toast__ghost:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.bz-image-delete-toast__danger {
  background: var(--bz-danger-soft);
  border: 1px solid var(--bz-danger-soft);
  color: var(--bz-danger);
  font-weight: 700;
}

.bz-image-delete-toast__danger:hover {
  filter: brightness(1.08);
}

.bz-image-toast-enter-active,
.bz-image-toast-leave-active {
  transition:
    opacity var(--bz-dur-base) var(--bz-ease-out),
    transform var(--bz-dur-base) var(--bz-ease-out);
}

.bz-image-toast-enter-from,
.bz-image-toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.bz-image-toast-enter-to,
.bz-image-toast-leave-from {
  opacity: 1;
  transform: translateY(0);
}
.history-blueprint {
  color: rgba(150, 200, 255, 0.8);
  font-size: 13px;
  font-style: italic;
  margin: 0.25em 0 0.5em 0;
  line-height: 1.5;
  padding: 0.4em 0.6em;
  background: rgba(100, 150, 255, 0.08);
  border-radius: 4px;
  border-left: 2px solid rgba(100, 150, 255, 0.3);
}
.error-note {
  color: var(--bz-danger);
  font-size: 14px;
  display: flex;
  align-items: center;
  margin-top: 0.75em;
  padding: 0.5em;
  background: rgba(255, 107, 107, 0.1);
  border-radius: 6px;
}
form {
  position: relative;
}
hr {
  margin: 12px 0;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.015);
}
.input {
  color: var(--bz-fg);
  background: var(--bz-border);
  box-shadow: 8px 8px 0 var(--bz-purple-glow);
  border: 1px solid var(--bz-fg-faint) !important;
  transition: 200ms ease-in;
}
::placeholder {
  color: var(--bz-border) !important;
  opacity: 1 !important;
}

/* Reasoning toggle */
.reasoning-toggle {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.reasoning-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bz-border);
  border: 2px solid var(--bz-border-strong);
  color: var(--bz-fg-low);
  cursor: pointer;
  transition: all 0.2s ease;
}

.reasoning-toggle-btn:hover {
  background: var(--bz-border-strong);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg);
}

.reasoning-toggle-btn.active {
  background: rgba(32, 156, 238, 0.4);
  border-color: var(--bz-info);
  color: var(--bz-fg);
  box-shadow: 0 0 12px rgba(32, 156, 238, 0.4);
}

.reasoning-toggle-btn.active:hover {
  background: rgba(32, 156, 238, 0.55);
}

.button.chat.is-loading {
  position: absolute;
  width: 32px;
  height: 32px;
  right: 10px;
  bottom: 14px;
  border: none !important;
  box-shadow: none !important;
}
ul,
ol {
  padding: 0;
  list-style-type: none;
}
/* Canvas-first treatment — first child renders as a full-width hero,
   subsequent items wrap into a 2-column grid (50% each on desktop) so
   the action cluster on every card stays on a single line. Same shape
   GenerativeImage / Video / Audio use. */
ol.chat {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  grid-auto-rows: 1fr;
  align-items: stretch;
  gap: var(--bz-space-4);
  list-style: none;
  padding: 0;
  margin: var(--bz-space-5) 0;
}
@media (min-width: 880px) {
  ol.chat {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
ol.chat .history-item:not(:first-child) {
  width: 100%;
}
ol.chat .history-item:not(:first-child) hr {
  display: none;
}
.button.copy {
  transition: all 0.15s ease;
}
.button.copy:hover {
  transform: scale(1.05);
}
.three-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  min-width: 300px;
  min-height: 300px;
}

/* Fade-in animation for history items */
.history-item {
  display: flex;
  min-width: 0;
  animation: bz-rise 0.4s ease-out forwards;
  opacity: 0;
}

.history-item > .question {
  width: 100%;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.load-more-sentinel {
  min-height: 20px;
}

/* Scroll to top button */
.scroll-to-top-btn {
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bz-control-selected-bg);
  border: 2px solid var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px var(--bz-scrim);
  transition: all 0.2s ease;
  z-index: 100;
  animation: bz-rise 0.3s ease-out;
}

.scroll-to-top-btn:hover {
  background: var(--bz-control-selected-bg);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--bz-scrim);
}

.scroll-to-top-btn .material-symbols-outlined {
  font-size: 24px;
  border: none;
}

/* ═══════════════════════════════════════════════════════════════════════
   SCREENSHOTS PREVIEW (in history)
   ═══════════════════════════════════════════════════════════════════════ */
.screenshots-preview {
  display: none;
}

.screenshots-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.screenshot-thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.screenshot-thumb:hover {
  border-color: var(--bz-purple-500);
  transform: scale(1.05);
}

.screenshot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.screenshot-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 2px 4px;
  background: var(--bz-scrim-deep);
  color: var(--bz-fg);
  font-size: 0.65rem;
  text-align: center;
  text-transform: uppercase;
}

/* ═══════════════════════════════════════════════════════════════════════
   SCREENSHOT MODAL
   ═══════════════════════════════════════════════════════════════════════ */
.screenshot-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: bz-fade-in 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.screenshot-modal {
  background: var(--bz-card);
  border-radius: 12px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px var(--bz-scrim-strong);
  border: 1px solid var(--bz-border);
}

.screenshot-modal-close {
  position: absolute;
  top: -40px;
  right: 0;
  background: none;
  border: none;
  color: var(--bz-fg);
  cursor: pointer;
  padding: 8px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.screenshot-modal-close:hover {
  opacity: 1;
}

.screenshot-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--bz-border);
}

.screenshot-modal-header h3 {
  margin: 0;
  color: var(--bz-fg);
  font-size: 1.1rem;
}

.screenshot-modal-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-btn {
  background: var(--bz-border);
  border: none;
  color: var(--bz-fg);
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: var(--bz-purple-soft);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-indicator {
  color: var(--bz-fg-mid);
  font-size: 0.85rem;
  min-width: 50px;
  text-align: center;
}

.screenshot-modal-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  min-height: 400px;
  overflow: auto;
}

.screenshot-modal-content img {
  max-width: 100%;
  max-height: 70vh;
  border-radius: 8px;
  box-shadow: 0 4px 20px var(--bz-scrim);
}

.screenshot-modal-footer {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--bz-border);
}

.refine-section {
  border: 1px solid var(--bz-emerald-soft);
  border-radius: 6px;
  padding: 0.5rem;
  background: rgba(72, 199, 142, 0.05);
}

.refine-section .input {
  background: var(--bz-scrim);
  border-color: var(--bz-emerald-soft);
  color: var(--bz-fg);
}

.refine-section .input::placeholder {
  color: var(--bz-fg-low);
}

.three-progress-card,
.three-notice {
  position: relative;
  margin-bottom: 1rem;
  padding: 14px 16px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg);
}

.three-progress-card__head,
.three-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.three-progress-card__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.three-progress-card__subtitle {
  margin: 6px 0 0;
  color: var(--bz-muted);
  font-size: 0.9rem;
}

.three-progress-card__pct {
  color: var(--bz-fg);
  font-size: 1.45rem;
  line-height: 1;
}

.three-progress-card :deep(.bz-pulse-wrap--bar) {
  margin-top: 12px;
}

.three-progress-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 10px;
  color: var(--bz-muted);
  font-family: var(--bz-font-mono);
  font-size: 0.78rem;
}

.three-progress-card__tip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-card);
  color: var(--bz-muted);
}

.three-progress-card__preview {
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-canvas);
}

.three-progress-card__preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--bz-border);
  color: var(--bz-muted);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.three-progress-card__preview-body {
  margin: 0;
  padding: 12px;
  height: 120px;
  max-height: 120px;
  text-align: left;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-mono);
  font-size: 0.78rem;
  line-height: 1.45;
}

.three-progress-card__cursor {
  display: inline-block;
  color: var(--bz-purple-300);
  animation: bz-caret 1s steps(1) infinite;
}

.three-notice--danger {
  border-color: color-mix(in srgb, var(--bz-danger) 42%, var(--bz-border));
  background: var(--bz-danger-soft);
}

.three-notice__body {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.three-notice__title {
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.three-notice .download-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.three-notice .download-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bz-muted);
}

.three-progress-card .download-list {
  margin-top: 12px;
}

.object-input-mode {
  display: inline-flex;
  gap: 2px;
  margin: 0 0 var(--bz-space-3) var(--bz-space-3);
  padding: 2px;
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  background: var(--bz-panel);
}

.object-input-mode button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: var(--bz-space-1);
  padding: 0 var(--bz-space-3);
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--bz-fg-mid);
  font: 500 11px var(--bz-font-ui);
  cursor: pointer;
}

.object-input-mode button.is-selected {
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.object-input-mode .material-symbols-outlined {
  font-size: 15px;
}

/* Build is a canvas with an AI director, not a configuration dashboard. */
.viewer-container.is-build {
  height: calc(100vh - 220px);
  min-height: 600px;
  max-height: 780px;
  margin-top: 0;
  overflow: hidden;
  border: 1px solid var(--bz-border-strong);
  border-radius: 6px !important;
  background: var(--bz-scrim-deep);
  box-shadow: none;
}

.build-director {
  position: absolute;
  z-index: 34;
  top: 12px;
  right: 12px;
  left: 12px;
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--bz-border-strong);
  border-radius: 6px;
  background: var(--bz-panel);
  box-shadow: 0 12px 30px var(--bz-scrim);
}

.build-director__levels {
  display: grid;
  grid-template-columns: minmax(120px, 180px) minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.build-director__title {
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-right: 1px solid var(--bz-border);
  outline: 0;
  background: transparent;
  color: var(--bz-fg);
  font: 650 13px var(--bz-font-ui);
}

.build-level-tabs {
  display: flex;
  min-width: 0;
  gap: 3px;
  overflow-x: auto;
}

.build-level-tabs button,
.build-director__order button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: var(--bz-fg-mid);
  font: 550 10px var(--bz-font-ui);
  white-space: nowrap;
  cursor: pointer;
}

.build-level-tabs button:hover,
.build-level-tabs button.is-active,
.build-director__order button:hover {
  border-color: var(--bz-border-strong);
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.build-level-tabs button.is-active {
  border-color: var(--bz-border-brand);
}

.build-level-tabs__index {
  color: var(--bz-fg-low);
  font: 600 9px var(--bz-font-mono);
}

.build-level-tabs .build-level-tabs__add,
.build-director__order button {
  width: 40px;
  justify-content: center;
  padding: 0;
}

.build-level-tabs .material-symbols-outlined,
.build-director__order .material-symbols-outlined {
  font-size: 15px;
}

.build-director__order {
  display: flex;
}

.build-director__actions {
  padding-left: var(--bz-space-2);
  border-left: 1px solid var(--bz-border);
}

.build-director__order .build-action {
  width: auto;
  padding: 0 var(--bz-space-3);
  gap: var(--bz-space-1);
}

.build-director__order .build-action.is-publish {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-500);
  color: var(--bz-on-accent);
}

.build-director__order .build-action:disabled {
  opacity: 0.42;
  cursor: default;
}

.gameplay-command {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 5px 6px 5px 12px;
  border: 1px solid var(--bz-border-brand);
  border-radius: 5px;
  background: var(--bz-canvas);
}

.gameplay-command > .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 18px;
}

.gameplay-command textarea {
  width: 100%;
  min-height: 24px;
  max-height: 72px;
  resize: vertical;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--bz-fg);
  font: 500 12px/1.45 var(--bz-font-ui);
}

.build-director__title::placeholder,
.gameplay-command textarea::placeholder {
  color: var(--bz-fg-mid) !important;
  opacity: 0.78 !important;
}

.gameplay-command > button {
  display: inline-flex;
  min-width: 82px;
  height: 36px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 12px;
  border: 0;
  border-radius: 4px;
  background: var(--bz-fg);
  color: var(--bz-canvas);
  font: 650 11px var(--bz-font-ui);
  cursor: pointer;
}

.gameplay-command > button:disabled {
  opacity: 0.45;
  cursor: default;
}

.gameplay-command > button .material-symbols-outlined {
  font-size: 15px;
}

.clear-conditions,
.gameplay-suggestions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
}

.clear-conditions__label,
.clear-conditions__mode {
  flex: 0 0 auto;
  color: var(--bz-fg-low);
  font: 600 9px var(--bz-font-mono);
  text-transform: uppercase;
}

.clear-conditions button,
.gameplay-suggestions button {
  display: inline-flex;
  min-height: 26px;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid var(--bz-border);
  border-radius: 3px;
  background: transparent;
  color: var(--bz-fg-mid);
  font: 500 9px var(--bz-font-ui);
  cursor: pointer;
}

.clear-conditions button:hover,
.gameplay-suggestions button:hover {
  border-color: var(--bz-border-strong);
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.clear-conditions button .material-symbols-outlined {
  font-size: 13px;
}

.clear-conditions__empty {
  color: var(--bz-fg-low);
  font-size: 10px;
}

.gameplay-suggestions {
  padding-left: 32px;
}

.gameplay-suggestions button {
  border-color: transparent;
  color: var(--bz-fg-mid);
  font-size: 10px;
}

.viewer-container.is-build .build-inspector {
  top: 190px;
  right: 12px;
  bottom: 108px;
  width: 224px;
  border-radius: 5px;
  box-shadow: 0 12px 30px var(--bz-scrim);
}

.viewer-container.is-build .build-palette {
  right: 12px;
  bottom: 12px;
  left: 12px;
  grid-template-columns: 72px minmax(0, 1fr);
  min-height: 82px;
  border-radius: 5px;
  box-shadow: 0 12px 30px var(--bz-scrim);
}

.build-workflow {
  position: absolute;
  z-index: 35;
  inset: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr) minmax(260px, 0.9fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--bz-border-strong);
  border-radius: 6px;
  background: var(--bz-border);
  box-shadow: 0 16px 40px var(--bz-scrim);
}

.build-workflow__step {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--bz-space-3);
  padding: var(--bz-space-5);
  background: var(--bz-panel);
}

.build-workflow__step > span:first-child {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  background: var(--bz-raised);
  color: var(--bz-purple-100);
  font: 600 11px var(--bz-font-mono);
}

.build-workflow__step > strong {
  color: var(--bz-fg);
  font: 600 14px var(--bz-font-ui);
}

.build-workflow__levels,
.build-workflow__objects {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-2);
  max-height: 440px;
  overflow-y: auto;
}

.build-workflow__levels button,
.build-workflow__objects button {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  cursor: pointer;
}

.build-workflow__levels button {
  display: grid;
  gap: var(--bz-space-2);
  padding: var(--bz-space-2);
  text-align: left;
}

.build-workflow__levels button.is-selected,
.build-workflow__objects button.is-selected {
  border-color: var(--bz-purple-300);
  box-shadow: inset 0 0 0 1px var(--bz-border-brand);
}

.build-workflow__levels img,
.build-workflow__levels button > .material-symbols-outlined {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 2px;
}

.build-workflow__levels button > .material-symbols-outlined {
  display: grid;
  place-items: center;
  background: var(--bz-raised);
  font-size: 24px;
}

.build-workflow__levels small {
  overflow: hidden;
  color: var(--bz-fg-mid);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.build-workflow__objects {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.build-workflow__objects button {
  aspect-ratio: 1;
  padding: 3px;
}

.build-workflow__objects img,
.build-workflow__objects button > .material-symbols-outlined {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  object-fit: cover;
}

.build-workflow__objects button > .material-symbols-outlined {
  display: grid;
  place-items: center;
  background: var(--bz-raised);
  font-size: 20px;
}

.build-workflow__gameplay textarea {
  min-height: 132px;
  resize: vertical;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  outline: 0;
  background: var(--bz-canvas);
  color: var(--bz-fg);
  font: 400 12px/1.5 var(--bz-font-ui);
}

.build-workflow__gameplay textarea::placeholder {
  color: var(--bz-fg-low) !important;
}

.build-workflow__gameplay > button,
.build-workflow__blocked button,
.playtest-bar button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: var(--bz-space-2);
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  background: var(--bz-raised);
  color: var(--bz-fg);
  font: 600 11px var(--bz-font-ui);
  cursor: pointer;
}

.build-workflow__gameplay > button:not(:disabled) {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-500);
  color: var(--bz-on-accent);
}

.build-workflow__gameplay > button:disabled {
  color: var(--bz-fg-low);
  cursor: default;
}

.build-workflow__blocked {
  grid-column: 1 / -1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--bz-space-5);
  background: var(--bz-panel);
}

.build-workflow__blocked > strong {
  color: var(--bz-fg);
  font: 600 16px var(--bz-font-ui);
}

.build-workflow__blocked > div {
  display: flex;
  gap: var(--bz-space-2);
}

.build-workflow__blocked button.is-ready {
  border-color: var(--bz-emerald-500);
  color: var(--bz-emerald-300);
}

.playtest-bar {
  position: absolute;
  z-index: 36;
  top: 12px;
  right: 12px;
  left: 12px;
  display: grid;
  grid-template-columns: auto 1fr 160px auto;
  align-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-2);
  border: 1px solid var(--bz-border-strong);
  border-radius: 5px;
  background: var(--bz-panel);
  box-shadow: 0 12px 30px var(--bz-scrim);
}

.playtest-bar strong {
  color: var(--bz-fg);
  font: 600 13px var(--bz-font-ui);
}

.playtest-bar select {
  min-height: 38px;
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  background: var(--bz-canvas);
  color: var(--bz-fg);
}

.viewer-container.is-build .build-status {
  right: auto;
  bottom: 102px;
  left: 50%;
  max-width: min(560px, calc(100% - 280px));
  transform: translateX(-50%);
}

.build-canvas-empty button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  font: 600 11px var(--bz-font-ui);
  pointer-events: auto;
  cursor: pointer;
}

.viewer-container.is-build .build-canvas-empty strong {
  color: var(--bz-fg) !important;
}

@media (max-width: 860px) {
  .build-director__levels {
    grid-template-columns: minmax(100px, 150px) minmax(0, 1fr);
  }

  .build-director__order,
  .gameplay-suggestions {
    display: none;
  }

  .viewer-container.is-build .build-inspector {
    top: auto;
    right: 12px;
    bottom: 108px;
    left: 12px;
    width: auto;
    max-height: 210px;
  }

  .build-workflow {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .playtest-bar {
    grid-template-columns: auto 1fr;
  }
}

@keyframes bz-caret {
  50% { opacity: 0; }
}

/* Keep editing controls in document flow; the canvas is never covered by panels. */
.viewer-container.is-build {display:flex;flex-direction:column;height:auto;min-height:0;max-height:none;aspect-ratio:auto;margin:16px 0;overflow:hidden;border-radius:12px!important}
.viewer-container.is-build .build-director {position:static;border:0;border-bottom:1px solid var(--bz-border);border-radius:0;box-shadow:none;padding:14px 16px;background:var(--bz-panel)}
.build-marker-fields{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}.build-marker-fields fieldset{display:flex;gap:8px;border:0;padding:0;margin:0}.build-marker-fields legend{color:var(--bz-fg-mid);font-size:12px;margin-bottom:6px}.build-marker-fields label{display:flex;align-items:center;gap:6px;font-size:12px}.build-marker-fields input{width:64px;box-sizing:border-box;padding:8px;border:1px solid var(--bz-border);border-radius:6px;background:var(--bz-bg);color:var(--bz-fg)}
@media(max-width:860px){.viewer-container.is-build .build-director__order{display:flex;grid-column:1/-1;justify-content:flex-end}}
.viewer-container.is-build .viewer-wrapper {height:clamp(340px,54vh,720px);min-height:340px;flex:none;border-radius:0}
.viewer-container.is-build .build-workflow {position:static;display:block;border:0;border-radius:0;padding:24px;background:var(--bz-panel)}
.viewer-container.is-build:has(.build-workflow) .viewer-wrapper {display:none}
.viewer-container.is-build .build-status {display:none}
.build-gameplay summary {cursor:pointer;color:var(--bz-fg-mid);font-size:13px;padding:6px 0}.build-gameplay[open] summary {margin-bottom:8px}.level-entry{display:grid;gap:16px}.level-entry .build-workflow__levels button{display:grid;gap:8px;min-width:120px;padding:8px;border:1px solid var(--bz-border);border-radius:8px;color:var(--bz-fg);background:var(--bz-bg)}
@media(max-width:700px){.build-director__levels{flex-wrap:wrap}.viewer-container.is-build .viewer-wrapper{height:380px}.build-director__order{flex-wrap:wrap}}
</style>
