<template>
  <div class="bz-tab-shell">
    <div class="models__deployment-install bz-page-content">
      <div class="columns">
        <div class="column is-12">
          <header class="bz-screen-header bz-page-header">
            <div class="bz-screen-titleblock">
              <p class="bz-eyebrow">{{ $t('create.eyebrow') }}</p>
                <h1 class="bz-h1 fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined bz-title-icon"
                    aria-hidden="true"
                  >
                    graphic_eq
                  </span>
                  {{ $t('create.audioTitle') }}
                </h1>
            </div>
          </header>

          <!-- GENERATION PROGRESS -->
          <div
            v-if="generation.active"
            class="audio-progress-card"
          >
            <div class="audio-progress-card__head">
              <span class="audio-progress-card__title audio-progress-card__title--pill fira-sans-condensed-black-italic">
                <BonzaiPulse variant="dot" />
                Crafting...
              </span>
              <span class="audio-progress-card__pct fira-sans-condensed-black-italic">
                {{ Math.round(generation.pct) }}%
              </span>
            </div>
            <BonzaiPulse variant="bar" :percent="Math.max(0, Math.min(100, generation.pct))" />
          </div>

          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <!-- MODE TOGGLES (TTS vs Clone) -->
                <div class="audio-control-row">
                  <ModeChipBar
                    v-model="mode"
                    :items="audioModeItems"
                    compact
                  />

                  <!-- LANGUAGE SELECTOR (hidden for music mode) -->
                  <div
                    v-if="mode !== 'music'"
                    class="bz-select audio-language-select"
                  >
                    <select v-model="language" :aria-label="$t('audio.language')" data-i18n-skip>
                      <option
                        v-for="(name, code) in localizedLanguages"
                        :key="code"
                        :value="code"
                      >
                        {{ languageFlags[code] }} {{ name }}
                      </option>
                    </select>
                  </div>
                </div>

                <!-- VOICE GENDER SELECTOR (TTS mode only) -->
                <div v-if="mode === 'tts'" class="audio-control-row audio-control-row--compact">
                  <ModeChipBar
                    v-model="voiceGender"
                    :items="voiceGenderItems"
                    compact
                  />
                </div>

                <!-- ACCESS REQUIREMENTS -->
                <p v-if="remoteMedia" class="bz-eyebrow">OpenRouter · {{ remoteInference.mediaModels?.speech }}</p>
          <AccessRequirements v-if="!remoteMedia"
                  ref="accessRef"
                  level="LVL2"
                  @access-changed="onAccessChanged"
                  class="mt-5"
                />

                <DownloadRequirement v-if="mode === 'music' && !lyricsModelReady"
                  category="text" :items="[{ category: 'text', size: '5.97 GB' }]"
                  :active="lyricsDownloading" :progress="lyricsDownloadProgress"
                  :error="lyricsDownloadError" title="Lyrics writer" @download="downloadLyricsModel" />
                <!-- MUSIC MODE INPUTS -->
                <div v-if="mode === 'music'" class="music-workspace mb-4">
                  <div class="audio-control-row music-mode-controls">
                    <button type="button" class="bz-btn bz-btn--ghost" :aria-pressed="!musicAdvanced" @click="musicAdvanced = false">{{ $t('rcWorkflows.simple') }}</button>
                    <button type="button" class="bz-btn bz-btn--ghost" :aria-pressed="musicAdvanced" @click="musicAdvanced = true">{{ $t('rcWorkflows.advanced') }}</button>
                  </div>
                  <!-- ═══════════════════════════════════════════════════════════
                       SECTION 1: LYRICS GENERATION
                       ═══════════════════════════════════════════════════════════ -->
                  <div class="music-section music-section--lyrics">
                    <!-- Lyrics Theme Input (for LLM generation) -->
                    <div class="field has-text-left">
                      <label
                        class="audio-field-label fira-sans-condensed-black-italic"
                       for="audio-lyricsTheme">
                        Song Concept
                      </label>
                      <div class="lyrics-gen-row mt-3">
                        <input id="audio-lyricsTheme"
                          class="bz-field-input"
                          type="text"
                          v-model="lyricsTheme"
                          placeholder="e.g. summer road trip"
                          @keyup.enter="generateLyrics"
                        />

                        <div
                          class="vocal-lang-row"
                        >
                          <div class="bz-select">
                            <select
                              v-model="musicVocalLanguage"
                              :aria-label="$t('audio.language')"
                            >
                              <option value="en">🇺🇸 English</option>
                              <option value="zh">🇨🇳 Chinese</option>
                              <option value="ja">🇯🇵 Japanese</option>
                              <option value="ko">🇰🇷 Korean</option>
                              <option value="es">🇪🇸 Spanish</option>
                              <option value="fr">🇫🇷 French</option>
                              <option value="de">🇩🇪 German</option>
                              <option value="it">🇮🇹 Italian</option>
                              <option value="pt">🇧🇷 Portuguese</option>
                              <option value="ru">🇷🇺 Russian</option>
                              <option value="other">🌐 Other...</option>
                            </select>
                          </div>
                          <input
                            v-if="musicVocalLanguage === 'other'"
                            class="input is-dark is-medium custom-language-input skill-float-right"
                            type="text"
                            v-model="customVocalLanguage"
                            :aria-label="$t('audio.language')"
                            placeholder="e.g. Creole, Swahili, Hindi..."
                            style="
                              height: 50px;
                              border-color: var(--bz-fg);
                              border-left: none;
                            "
                          />
                        </div>
                        <button
                          class="bz-btn bz-btn--ghost"
                          :class="{ 'bz-btn--running': isGeneratingLyrics }"
                          :disabled="isGeneratingLyrics || !lyricsTheme.trim() || !lyricsModelReady"
                          @click.prevent="generateLyrics"
                          :title="
                            !lyricsModelReady
                              ? 'Download the lyrics writer above first'
                              : lyricsTheme.trim()
                                ? 'Generate lyrics using Qwen3.5 9B MTP'
                                : 'Enter a theme first'
                          "
                        >
                          <span
                            class="material-symbols-outlined mr-1"
                            style="font-size: 16px"
                          >
                            auto_awesome
                          </span>
                          <span>{{ $t("rcWorkflows.draftLyrics") }}</span>
                        </button>
                      </div>
                      <p v-if="lyricsError" class="help is-danger mt-2">
                        {{ lyricsError }}
                      </p>
                    </div>
                    <hr />
                    <!-- Lyrics Textarea -->
                    <div class="field mt-2 has-text-left">
                      <label class="audio-field-label fira-sans-condensed-black-italic" for="audio-musicLyrics">
                        Lyrics
                      </label>
                      <div class="control mt-3">
                        <textarea id="audio-musicLyrics"
                          class="bz-field-textarea"
                          v-model="musicLyrics"
                          placeholder="[intro]&#10;(instrumental)&#10;&#10;[verse]&#10;Walking through the city lights&#10;Everything feels so alive tonight&#10;Stars above are shining bright&#10;&#10;[chorus]&#10;We're on fire, burning bright&#10;Dancing through the neon night&#10;Nothing's gonna stop us now&#10;&#10;[bridge]&#10;When the world falls down around us&#10;We'll rise up from the ground&#10;&#10;[outro]&#10;(fade out)"
                          rows="8"
                        ></textarea>
                      </div>
                      <div class="structure-tags-help mt-2">
                        <span class="help-label">Structure Tags:</span>
                        <button type="button"
                          class="skill-chip is-clickable mr-1"
                          @click="insertTag('[intro]')"
                        >
                          [intro]
                        </button>
                        <button type="button"
                          class="skill-chip is-clickable mr-1"
                          @click="insertTag('[verse]')"
                        >
                          [verse]
                        </button>
                        <button type="button"
                          class="skill-chip is-clickable mr-1"
                          @click="insertTag('[chorus]')"
                        >
                          [chorus]
                        </button>
                        <button type="button"
                          class="skill-chip is-clickable mr-1"
                          @click="insertTag('[bridge]')"
                        >
                          [bridge]
                        </button>
                        <button type="button"
                          class="skill-chip is-clickable mr-1"
                          @click="insertTag('[outro]')"
                        >
                          [outro]
                        </button>
                        <button type="button"
                          class="skill-chip is-clickable mr-1"
                          @click="insertTag('[instrumental]')"
                        >
                          [instrumental]
                        </button>
                        <button type="button"
                          class="skill-chip is-clickable mr-1"
                          @click="insertTag('[build]')"
                        >
                          [build]
                        </button>
                        <button type="button"
                          class="skill-chip is-clickable mr-1"
                          @click="insertTag('[drop]')"
                        >
                          [drop]
                        </button>
                        <button type="button"
                          class="skill-chip is-clickable"
                          @click="insertTag('[breakdown]')"
                        >
                          [breakdown]
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- ═══════════════════════════════════════════════════════════
                       SECTION 3: INFERENCE PARAMETERS
                       ═══════════════════════════════════════════════════════════ -->
                  <div class="music-section music-section--settings has-text-left">
                    <label
                      class="audio-field-label fira-sans-condensed-black-italic"
                    >
                      Generation Settings
                    </label>
                    <!-- Basic Parameters (always visible) -->
                    <div class="params-grid mt-5">
                      <!-- Duration -->
                      <div class="param-item">
                        <label class="param-label" for="audio-musicDuration">
                          <span class="material-symbols-outlined">timer</span>
                          Duration
                          <span
                            class="param-value fira-sans-condensed-black-italic is-size-3"
                            style="text-transform: none"
                          >
                            {{ musicDuration }}s
                          </span>
                        </label>
                        <div class="param-control">
                          <input id="audio-musicDuration"
                            type="range"
                            v-model.number="musicDuration"
                            @input="durationFromLyrics = false"
                            min="10"
                            max="300"
                            step="10"
                            class="slider"
                          />
                        </div>
                      </div>


                      <!-- BPM -->
                      <div class="param-item">
                        <label class="param-label" for="audio-musicBPM">
                          <span class="material-symbols-outlined">speed</span>
                          BPM
                          <span
                            class="param-value fira-sans-condensed-black-italic is-size-3"
                            style="text-transform: none"
                          >
                            {{ musicBPM }}
                          </span>
                        </label>
                        <div class="param-control">
                          <input id="audio-musicBPM"
                            type="range"
                            v-model.number="musicBPM"
                            min="40"
                            max="200"
                            step="1"
                            class="slider"
                          />
                        </div>
                      </div>

                      <!-- Key -->
                      <div class="param-item">
                        <label class="param-label mb-2" for="audio-musicKey">
                          <span class="material-symbols-outlined">
                            music_note
                          </span>
                          Key
                        </label>
                        <div class="param-control select-control">
                          <select id="audio-musicKey"
                            v-model="musicKey"
                            class="select is-small is-dark"
                          >
                            <option value="">Auto</option>
                            <option v-for="k in keyOptions" :key="k" :value="k">
                              {{ k }}
                            </option>
                          </select>
                        </div>
                      </div>

                      <!-- Time Signature -->
                      <div class="param-item">
                        <label class="param-label mb-2" for="audio-musicTimeSignature">
                          <span class="material-symbols-outlined">
                            grid_4x4
                          </span>
                          Time Sig
                        </label>
                        <div class="param-control select-control">
                          <select id="audio-musicTimeSignature"
                            v-model="musicTimeSignature"
                            class="select is-small is-dark"
                          >
                            <option value="4/4">4/4</option>
                            <option value="3/4">3/4</option>
                            <option value="6/8">6/8</option>
                            <option value="2/4">2/4</option>
                          </select>
                        </div>
                      </div>
                    </div>

                      <p v-if="durationFromLyrics" class="music-duration-estimate">{{ $ui('Estimated from lyrics and BPM') }} · {{ lyricsDurationEstimate }}s<span v-if="lyricsDurationEstimate > 300"> · {{ $ui('Track limit: 300s. Shorten the lyrics or increase BPM.') }}</span></p>

                    <!-- Advanced Parameters -->
                    <div v-if="musicAdvanced" class="params-grid mt-3 advanced-params">
                      <!-- Inference Steps -->
                      <div class="param-item">
                        <label class="param-label" for="audio-musicSteps">
                          <span class="material-symbols-outlined">repeat</span>
                          Steps
                        </label>
                        <div class="param-control">
                          <input id="audio-musicSteps"
                            type="range"
                            v-model.number="musicSteps"
                            :min="1"
                            :max="32"
                            step="1"
                            class="slider"
                          />
                          <span class="param-value">{{ musicSteps }}</span>
                        </div>
                        <p class="param-help">
                          1-4: fastest, 6-8: best quality
                        </p>
                      </div>

                      <!-- Guidance Scale -->
                      <div class="param-item">
                        <label class="param-label" for="audio-musicGuidance">
                          <span class="material-symbols-outlined">
                            linear_scale
                          </span>
                          Guidance
                        </label>
                        <div class="param-control">
                          <input id="audio-musicGuidance"
                            type="range"
                            v-model.number="musicGuidance"
                            min="1"
                            max="20"
                            step="0.5"
                            class="slider"
                          />
                          <span class="param-value">{{ musicGuidance }}</span>
                        </div>
                        <p class="param-help">
                          Higher = more adherent to prompt
                        </p>
                      </div>

                      <!-- Seed -->
                      <div class="param-item">
                        <label class="param-label" for="audio-musicSeed">
                          <span class="material-symbols-outlined">casino</span>
                          Seed
                        </label>
                        <div class="param-control">
                          <input id="audio-musicSeed"
                            type="number"
                            v-model.number="musicSeed"
                            min="-1"
                            class="input is-small"
                            placeholder="-1 for random"
                          />
                        </div>
                        <p class="param-help">
                          -1 = random, or set for reproducibility
                        </p>
                      </div>

                      <!-- Shift -->
                      <div class="param-item">
                        <label class="param-label" for="audio-musicShift">
                          <span class="material-symbols-outlined">
                            swap_horiz
                          </span>
                          Shift
                        </label>
                        <div class="param-control">
                          <input id="audio-musicShift"
                            type="range"
                            v-model.number="musicShift"
                            min="1"
                            max="10"
                            step="0.5"
                            class="slider"
                          />
                          <span class="param-value">{{ musicShift }}</span>
                        </div>
                        <p class="param-help">
                          Noise schedule shift (default: 3)
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- ═══════════════════════════════════════════════════════════
                       SECTION 2: CAPTION / STYLE DESCRIPTION
                       ═══════════════════════════════════════════════════════════ -->
                  <div v-if="musicAdvanced" class="music-section music-section--palette">
                    <!-- Dimension Selectors -->
                    <div class="dimension-selectors">
                      <!-- Genre -->
                      <h3
                        class="audio-field-label fira-sans-condensed-black-italic"
                      >
                        Genre
                      </h3>
                      <div class="dimension-row">
                        <div class="dimension-tags">
                          <button type="button"
                            v-for="g in genreOptions"
                            :key="g"
                            class="tag skill-chip is-clickable"
                            :class="
                              selectedGenres.includes(g) ? 'is-info' : 'is-dark'
                            "
                            @click="toggleDimension('genre', g)"
                          >
                            {{ g }}
                          </button>
                        </div>
                      </div>
                      <hr />

                      <!-- Mood -->
                      <h3
                        class="audio-field-label fira-sans-condensed-black-italic"
                      >
                        Mood
                      </h3>
                      <div class="dimension-row">
                        <div class="dimension-tags">
                          <button type="button"
                            v-for="m in moodOptions"
                            :key="m"
                            class="tag skill-chip is-clickable"
                            :class="
                              selectedMoods.includes(m)
                                ? 'is-warning'
                                : 'is-dark'
                            "
                            @click="toggleDimension('mood', m)"
                          >
                            {{ m }}
                          </button>
                        </div>
                      </div>
                      <hr />
                      <!-- Instruments -->
                      <h3
                        class="audio-field-label fira-sans-condensed-black-italic"
                      >
                        Instruments
                      </h3>
                      <div class="dimension-row">
                        <div class="dimension-tags">
                          <button type="button"
                            v-for="i in instrumentOptions"
                            :key="i"
                            class="tag skill-chip is-clickable"
                            :class="
                              selectedInstruments.includes(i)
                                ? 'is-success'
                                : 'is-dark'
                            "
                            @click="toggleDimension('instrument', i)"
                          >
                            {{ i }}
                          </button>
                        </div>
                      </div>
                      <hr />

                      <!-- Vocals -->
                      <h3
                        class="audio-field-label fira-sans-condensed-black-italic"
                      >
                        Vocals
                      </h3>
                      <div class="dimension-row" v-if="!musicInstrumental">
                        <div class="dimension-tags">
                          <button type="button"
                            v-for="v in vocalOptions"
                            :key="v"
                            class="tag skill-chip is-clickable"
                            :class="
                              selectedVocals.includes(v) ? 'is-link' : 'is-dark'
                            "
                            @click="toggleDimension('vocal', v)"
                          >
                            {{ v }}
                          </button>
                        </div>
                      </div>
                      <hr />
                      <!-- Production -->
                      <h3
                        class="audio-field-label fira-sans-condensed-black-italic"
                      >
                        Production
                      </h3>
                      <div class="dimension-row">
                        <div class="dimension-tags">
                          <button type="button"
                            v-for="p in productionOptions"
                            :key="p"
                            class="tag skill-chip is-clickable"
                            :class="
                              selectedProduction.includes(p)
                                ? 'is-primary'
                                : 'is-dark'
                            "
                            @click="toggleDimension('production', p)"
                          >
                            {{ p }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    class="music-section music-section--direction has-text-left"
                  >
                    <span
                      id="audio-direction-label"
                      class="audio-panel-title fira-sans-condensed-black-italic"
                      style="width: auto !important"
                    >
                      Direction
                    </span>
                    <div class="control mt-5">
                      <textarea
                        class="bz-field-textarea"
                        v-model="musicCaption"
                        aria-labelledby="audio-direction-label"
                        placeholder="pop rock, energetic, electric guitar, drums, male vocals, polished production, 120 BPM"
                        rows="2"
                        style="resize: none"
                      ></textarea>
                    </div>
                  </div>

                  <!-- Generate controls -->
                  <div
                    class="music-generate-bar generate-row"
                  >
                    <input
                      type="checkbox"
                      v-model="musicOffload"
                      id="music_offload"
                      class="music-toggle"
                    />
                    <label for="music_offload" class="mr-2">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        memory
                      </span>
                      Save Memory
                    </label>
                    <button
                      class="bz-btn bz-btn--primary fira-sans-condensed-black-italic generate-music-btn"
                      :class="{ 'bz-btn--running': isLoading }"
                      :disabled="
                        isLoading ||
                        !canGenerateWithAccess ||
                        (!musicCaption.trim() && selectedGenres.length === 0)
                      "
                      @click="generateMusic"
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">
                        graphic_eq
                      </span>
                      <span>Generate track</span>
                    </button>
                  </div>
                </div>

                <!-- VOICE CLONE FILE INPUT -->
                <div v-if="mode === 'clone'">
                  <div class="file skill-fullwidth is-medium mb-3">
                    <label class="file-label">
                      <input
                        class="file-input"
                        type="file"
                        accept="audio/*"
                        @change="handleSynthesisFile"
                      />
                      <span class="file-cta">
                        <span class="file-icon">
                          <span class="material-symbols-outlined">
                            upload_file
                          </span>
                        </span>
                        <span class="file-label">Reference Voice (5-10s)</span>
                      </span>
                      <span class="file-name">
                        {{ synthesisFileName || "No file selected" }}
                      </span>
                    </label>
                  </div>
                  <!-- Reference Transcript Input -->
                  <div v-if="synthesisBase64" class="field">
                    <label class="audio-field-label fira-sans-condensed-black-italic">
                      <span
                        class="material-symbols-outlined mr-1"
                        style="font-size: 18px; vertical-align: middle"
                      >
                        subtitles
                      </span>
                      Reference Transcript
                      <span class="bz-meta">
                        (type exactly what is said in the audio)
                      </span>
                    </label>
                    <div class="control">
                      <textarea
                        class="bz-field-textarea"
                        v-model="referenceTranscript"
                        placeholder="Enter the exact words spoken in your reference audio..."
                        rows="2"
                      ></textarea>
                    </div>
                    <p class="help has-text-grey-light">
                      For best results, provide an accurate transcription of
                      your reference audio.
                    </p>
                  </div>
                </div>

                <DownloadRequirement category="audio"
                  v-if="!remoteMedia && ((showUpdateCTA && readiness.currentMode === mode) || downloads.active)"
                  :items="[...readiness.repoDetails, ...readiness.ggufNames]"
                  :active="downloads.active"
                  cancellable
                  :cancelling="isCancellingDownloads"
                  @cancel="cancelCurrentPipeline"
                  :progress="downloads.total_progress || downloads.progress || 0"
                  :tasks="downloadTaskList"
                  :disabled="readiness.authRequired"
                  :error="readiness.authRequired ? $t('rcDownloads.authRequired') : downloads.status === 'failed' ? $t('rcDownloads.downloadFailed') : ''"
                  @download="prefetchForMode"
                />

                <!-- GENERATION ERROR -->
                <div
                  v-else-if="generation.error"
                  class="audio-notice audio-notice--danger"
                >
                  <div class="audio-notice__body">
                    <strong class="audio-notice__title fira-sans-condensed-black-italic">Generation failed</strong>
                    <span>{{ generation.error }}</span>
                  </div>
                </div>

                <!-- PROMPT — Milestone 6 unified <GenerativeInput>.
                     Hidden in music mode where the dedicated lyrics
                     editor + explicit Generate button take over. -->
                <GenerativeInput
                  v-if="mode !== 'music'"
                  v-model="form.prompt"
                  :placeholder="promptPlaceholder"
                  submit-label="Generate"
                  running-label="Synthesising"
                  :running="isLoading"
                  :disabled="!canGenerateWithAccess"
                  shortcut-hint="⌘⏎"
                  @submit="sendMessage(form.prompt)"
                />

                <hr class="mt-5" />

                <!-- GENERATION HISTORY HEADER -->
                <div class="level pt-5 mt-5 audio-history-head">
                  <div class="level-left">
                    <div class="level-item">
                      <h2 class="bz-h2 fira-sans-condensed-black-italic">
                        <span class="material-symbols-outlined bz-section-icon">
                          history
                        </span>
                        Generation History
                      </h2>
                    </div>
                  </div>
                  <div class="level-right">
                    <div class="level-item buttons">
                      <RoleplayHistoryToggle v-model="includeRoleplay" />
<button
                        type="button"
                        class="bz-iconbtn"
                        title="Import history"
                        aria-label="Import history"
                        @click="importHistory()"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">
                          upload
                        </span>
                      </button>
                      <button
                        type="button"
                        class="bz-iconbtn"
                        title="Export history"
                        aria-label="Export history"
                        @click="exportHistory()"
                        :disabled="inferences.length === 0"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">
                          download
                        </span>
                      </button>
                      <button
                        type="button"
                        class="bz-iconbtn bz-iconbtn--danger"
                        title="Clear history"
                        aria-label="Clear history"
                        @click="clearHistory()"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">
                          ink_eraser
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- RESULTS -->
                <ol class="chat" v-if="reversedInferences.length">
                  <li
                    v-for="(inference, displayIndex) in paginatedInferences"
                    :key="inference.id || inference._originalIndex"
                    class="history-item"
                    :style="{
                      animationDelay: `${Math.min(displayIndex * 50, 500)}ms`,
                    }"
                  >
                    <div class="question">
                      <div class="audio-meta">
                        <span class="skill-chip">
                          {{
                            languageFlags[inference.language] ||
                            inference.language
                          }}
                        </span>
                        <span v-if="inference.isMusic" class="skill-chip skill-chip--warning ml-2">
                          <span class="material-symbols-outlined is-size-6 mr-1">music_note</span>
                          Music
                        </span>
                        <span v-else-if="inference.hasClone" class="skill-chip skill-chip--info ml-2">
                          <span class="material-symbols-outlined is-size-6 mr-1">genetics</span>
                          Clone
                        </span>
                        <span v-else class="skill-chip skill-chip--success ml-2">
                          <span class="material-symbols-outlined is-size-6 mr-1">record_voice_over</span>
                          TTS
                        </span>
                        <span v-if="inference.networkMode && inference.networkMode !== 'local'" class="skill-chip ml-2" :class="inference.networkMode === 'private' ? 'skill-chip--success' : 'skill-chip--info'">
                          <span class="material-symbols-outlined is-size-6 mr-1">{{ inference.networkMode === 'private' ? 'lock' : 'cloud' }}</span>
                          {{ inference.networkMode === 'private' ? 'Private' : 'Remote' }}
                        </span>
                      </div>
                      <!-- Audio Player -->
                      <div
                        class="audio-container"
                        v-if="inference?.answer?.data?.audio_path"
                      >
                        <div class="audio-wave-card">
                          <button
                            type="button"
                            class="audio-wave-button"
                            :aria-label="activeAudioId === audioElementId(inference) ? 'Pause audio' : 'Play audio'"
                            @click="toggleAudioPlayback(inference)"
                          >
                            <span class="material-symbols-outlined" aria-hidden="true">
                              {{ activeAudioId === audioElementId(inference) ? "pause" : "play_arrow" }}
                            </span>
                          </button>
                          <div class="audio-wave-body">
                            <BonzaiWaveform
                              variant="player"
                              :active="activeAudioId === audioElementId(inference)"
                              :progress="audioProgress[audioElementId(inference)] || 0"
                              :bars="inference.isMusic ? 96 : 64"
                              :height="64"
                            />
                          </div>
                        </div>
                        <audio
                          :ref="(el) => setAudioRef(audioElementId(inference), el)"
                          :src="inference.answer.data.audio_url || fileUrl(inference.answer.data.audio_path)"
                          class="audio-player-native"
                          preload="metadata"
                          @timeupdate="(event) => onAudioTimeUpdate(inference, event)"
                          @ended="onAudioEnded(inference)"
                          @pause="onAudioPaused(inference)"
                        >
                          Your browser does not support the audio element.
                        </audio>
                        <div v-if="inference.songName" class="song-name">
                          {{ inference.songName }}
                        </div>
                      </div>
                      <hr />
                      <p class="prompt-text mt-3">
                        {{ inference.question }}
                      </p>

                      <hr />
                      <GenerativeActions
                        :actions="actionsFor(inference)"
                        @action="(id) => handleAction(id, inference)"
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
        {{ pendingDelete.all ? 'Clear audio history?' : 'Delete this audio?' }}
      </span>
      <button type="button" class="bz-image-delete-toast__ghost" @click="dismissDeleteToast">
        Cancel
      </button>
      <button type="button" class="bz-image-delete-toast__danger" @click="confirmDeleteAudio">
        {{ pendingDelete.all ? 'Clear' : 'Delete' }}
      </button>
    </div>
  </Transition>
  </Teleport>
</template>

<script>
import { remoteMediaEnabled, remoteInference, refreshRemoteInference } from '../stores/remoteInference.js';
import { estimateLyricsDuration } from "../shared/lyricsDuration.js";
import { resolveLLM } from "../skills/flagship.js";
import { visibleText } from "../shared/visibleText.js";
import RoleplayHistoryToggle from './RoleplayHistoryToggle.vue';
import {
  ref,
  shallowRef,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import { v4 as uuid } from "uuid";
import useClipboard from "vue-clipboard3";
import axios from "axios";
import { io } from "socket.io-client";
import { useInferenceRouter } from "../composables/useInferenceRouter.js";
import {
  generationStore,
  ensureGenerationSocket,
  startGeneration,
  setBlocked,
  setError,
  stopGeneration,
  clearError,
} from "../stores/generationStore";
import AccessRequirements from "./AccessRequirements.vue";
import { recordedMintGeneration } from "../services/mintValidation.js";
import MintModal from "./MintModal.vue";
import BonzaiPulse from "./BonzaiPulse.vue";
import DownloadRequirement from "./DownloadRequirement.vue";
import { cancelLocalDownloads } from "../services/downloadCancellation.js";
import BonzaiWaveform from "./BonzaiWaveform.vue";
import GenerativeActions from "./generative/GenerativeActions.vue";
import GenerativeInput from "./generative/GenerativeInput.vue";
import ModeChipBar from "./generative/ModeChipBar.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { addAudioInference } from "../stores/inferenceStore.js";
import { inspector } from "../services/generationInspector.service.js";
import { generationElapsedMs } from "../shared/generationTiming.js";
import { useI18n } from "../i18n/index.js";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${API_BASE}/downloads`;
const WS_GEN = `${API_BASE}/generation`;

export default {
  name: "GenerativeAudio",
  components: { RoleplayHistoryToggle, DownloadRequirement,
    AccessRequirements,
    MintModal,
    BonzaiPulse,
    BonzaiWaveform,
    GenerativeActions,
    GenerativeInput,
    ModeChipBar,
  },
  setup() {
    const { inferenceRequest } = useInferenceRouter();
    refreshRemoteInference().catch(() => {});
    const remoteMedia = computed(() => remoteMediaEnabled('speech') && mode.value !== 'music');
    const { t, locale } = useI18n();
    const audioModeItems = [
      { value: "tts", label: "Text to Speech", icon: "record_voice_over" },
      { value: "clone", label: "Voice Clone", icon: "genetics" },
      { value: "music", label: "Music", icon: "music_note" },
    ];
    const voiceGenderItems = [
      { value: "female", label: "Female", icon: "female" },
      { value: "male", label: "Male", icon: "male" },
    ];

    // ------------ NFT Minting ---------
    const mintTarget = ref(null);

    let mintSelectionRequest = 0;
    const openMint = async (inference) => {
      const request = ++mintSelectionRequest;
      // Prefer MP3 for minting (smaller, universally playable)
      const mp3Path = inference.answer?.data?.audio_path_mp3;
      const wavPath = inference.answer?.data?.audio_path;
      let content = null;
      let isMp3 = false;
      for (const [path,mp3] of [[mp3Path,true],[wavPath,false]]) {
        if (!path || !window.electronAPI?.readFileAsBase64) continue;
        try { content = await window.electronAPI.readFileAsBase64(path); if(content){isMp3=mp3;break;} }
        catch { /* Try the original WAV when the optional MP3 is missing. */ }
      }
      if (request !== mintSelectionRequest) return;
      mintTarget.value = {
        inferenceType: "audio",
        inferenceId: inference.id,
        content,
        contentType: isMp3 ? "audio/mpeg" : "audio/wav",
        prompt: inference.question,
        generation: recordedMintGeneration(inference, {
          type: inference.isMusic
            ? "music"
            : inference.hasClone
              ? "voice-clone"
              : "text-to-speech",
          model: inference.model || "kokoro",
          timestamp: inference.timestamp,
          elapsedMs: inference.elapsedMs || null,
        }),
      };
    };

    const onMinted = (result) => {
      // Trigger re-render for shallowRef
      const arr = [...inferences.value];
      const inf = arr.find((i) => i.id === mintTarget.value?.inferenceId);
      if (inf) inf.nft = result;
      inferences.value = arr;
      mintTarget.value = null;
    };

    // ------------ basic state -------------
    const selectedModel = ref("multilingual");
    const musicAdvanced = ref(false);
    const mode = ref("tts"); // 'tts', 'clone', or 'music'
    const language = ref("en");
    const exaggerationPct = ref(50); // 0-100 -> maps to 0.0-1.0
    const pendingDelete = ref(null);
    let pendingDeleteTimer = null;
    const activeAudioId = ref(null);
    const audioProgress = ref({});
    const audioElements = new Map();

    const audioElementId = (inference) =>
      String(inference?.id || inference?._originalIndex || "");
    const setAudioRef = (id, el) => {
      if (!id) return;
      if (el) audioElements.set(id, el);
      else audioElements.delete(id);
    };
    const pauseOtherAudio = (id) => {
      audioElements.forEach((audio, audioId) => {
        if (audioId !== id && !audio.paused) audio.pause();
      });
    };
    const toggleAudioPlayback = async (inference) => {
      const id = audioElementId(inference);
      const audio = audioElements.get(id);
      if (!audio) return;
      if (!audio.paused) {
        audio.pause();
        activeAudioId.value = null;
        return;
      }
      pauseOtherAudio(id);
      activeAudioId.value = id;
      try {
        await audio.play();
      } catch (e) {
        activeAudioId.value = null;
        console.warn("[GenerativeAudio] Playback failed:", e?.message || e);
      }
    };
    const onAudioTimeUpdate = (inference, event) => {
      const id = audioElementId(inference);
      const audio = event?.target;
      const duration = audio?.duration || 0;
      audioProgress.value = {
        ...audioProgress.value,
        [id]: duration > 0 ? Math.min(1, audio.currentTime / duration) : 0,
      };
    };
    const onAudioEnded = (inference) => {
      const id = audioElementId(inference);
      activeAudioId.value = activeAudioId.value === id ? null : activeAudioId.value;
      audioProgress.value = { ...audioProgress.value, [id]: 0 };
    };
    const onAudioPaused = (inference) => {
      const id = audioElementId(inference);
      if (activeAudioId.value === id) activeAudioId.value = null;
    };

    // Music mode refs
    const musicLyrics = ref("");
    const musicDuration = ref(60);
    const lyricsDurationEstimate = ref(0);
    const durationFromLyrics = ref(false);
    const updateLyricsDuration = () => {
      lyricsDurationEstimate.value = estimateLyricsDuration(musicLyrics.value, musicBPM.value, Number(musicTimeSignature.value.split("/")[0]) * 4 / Number(musicTimeSignature.value.split("/")[1]));
      musicDuration.value = Math.max(10, Math.min(300, Math.ceil(lyricsDurationEstimate.value / 10) * 10));
    };
    const musicCaption = ref("");
    const lyricsTheme = ref("");
    const musicInstrumental = ref(false);
    const musicBPM = ref(120);
    const musicKey = ref("");
    const musicTimeSignature = ref("4/4");
    const musicSteps = ref(8);
    const musicGuidance = ref(7.0);
    const musicSeed = ref(-1);
    const musicShift = ref(3.0);
    const musicQuality = ref("quality"); // Backward-compatible state; XL Turbo is now the only backend.
    const musicSemantic = ref(false); // Backward-compatible state; Diffusers is DiT-only.
    const musicOffload = ref(false); // CPU offload (disabled by default for speed)
    const musicVocalLanguage = ref("en");
    const customVocalLanguage = ref("");
    const songName = ref("");
    const isGeneratingLyrics = ref(false);

    // Dimension selection state
    const selectedGenres = ref([]);
    const selectedMoods = ref([]);
    const selectedInstruments = ref([]);
    const selectedVocals = ref([]);
    const selectedProduction = ref([]);

    // Dimension options
    const genreOptions = [
      "pop",
      "rock",
      "hip-hop",
      "r&b",
      "jazz",
      "classical",
      "electronic",
      "country",
      "folk",
      "metal",
      "punk",
      "indie",
      "soul",
      "blues",
      "reggae",
      "latin",
      "k-pop",
      "j-pop",
      "edm",
      "house",
      "techno",
      "ambient",
      "lo-fi",
      "trap",
      "drill",
    ];
    const moodOptions = [
      "energetic",
      "melancholic",
      "uplifting",
      "dark",
      "romantic",
      "aggressive",
      "chill",
      "dreamy",
      "nostalgic",
      "triumphant",
      "mysterious",
      "playful",
      "intense",
      "peaceful",
      "rebellious",
    ];
    const instrumentOptions = [
      "piano",
      "guitar",
      "drums",
      "bass",
      "synth",
      "strings",
      "brass",
      "saxophone",
      "violin",
      "flute",
      "808",
      "orchestra",
      "acoustic guitar",
      "electric guitar",
      "organ",
      "harp",
    ];
    const vocalOptions = [
      "male vocals",
      "female vocals",
      "duet",
      "choir",
      "rap",
      "falsetto",
      "deep voice",
      "soft voice",
      "powerful vocals",
      "whisper",
      "harmonies",
      "auto-tune",
    ];
    const productionOptions = [
      "polished",
      "lo-fi",
      "raw",
      "cinematic",
      "minimal",
      "layered",
      "reverb-heavy",
      "punchy",
      "warm",
      "crisp",
      "vintage",
      "modern",
      "live recording",
    ];
    const keyOptions = [
      "C major",
      "C minor",
      "D major",
      "D minor",
      "E major",
      "E minor",
      "F major",
      "F minor",
      "G major",
      "G minor",
      "A major",
      "A minor",
      "B major",
      "B minor",
      "C# major",
      "C# minor",
      "Eb major",
      "Eb minor",
      "F# major",
      "F# minor",
      "Ab major",
      "Ab minor",
      "Bb major",
      "Bb minor",
    ];
    const isLoading = ref(false);
    const form = reactive({ prompt: "" });
    // Use shallowRef for inferences — avoids Vue Proxy wrapping that
    // breaks Electron IPC structured clone serialization on persist.
    const includeRoleplay = ref(localStorage.getItem('bonzai:history:roleplay') !== 'false');
    watch(includeRoleplay, value => { localStorage.setItem('bonzai:history:roleplay', String(value)); displayedCount.value = 12; });
    const inferences = shallowRef([]);
    const hasCopy = shallowRef([]);
    const promptInput = ref(null);

    // Debounce persistence to avoid excessive writes
    let _persistTimer = null;
    const persistInferences = (data) => {
      clearTimeout(_persistTimer);
      _persistTimer = setTimeout(async () => {
        try {
          await window.electronAPI?.store?.set?.(
            "audioInferences",
            JSON.parse(JSON.stringify(data)),
          );
        } catch (e) {
          console.error("[GenerativeAudio] Failed to persist inferences:", e);
        }
      }, 500);
    };

    // ------------ lazy loading pagination ----------------
    const ITEMS_PER_PAGE = 10;
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);

    // Get audio path from any format
    const getAudioPath = (item) => {
      // Component format: answer.data.audio_path
      if (item.answer?.data?.audio_path) return item.answer.data.audio_path;
      // Unified store format: audioPath
      if (item.audioPath) return item.audioPath;
      // Direct properties
      if (item.audio_path) return item.audio_path;
      if (item.data?.audio_path) return item.data.audio_path;
      return null;
    };

    // Normalize inference to component format
    const normalizeInference = (item) => {
      const audioPath = getAudioPath(item);
      if (!audioPath) return null;

      // Already in component format with valid data
      if (item.answer?.data?.audio_path) {
        return item;
      }

      // Convert any other format to component format
      return {
        ...item,
        question: item.prompt || item.question || "",
        answer: {
          status: item.answer?.status || 200,
          data: {
            audio_path: audioPath,
            ...(item.answer?.data || {}),
          },
        },
      };
    };

    // Reversed inferences (most recent first) with original index
    // Normalize data structure for compatibility
    const reversedInferences = computed(() => {
      const normalized = inferences.value
        .map((item, idx) => {
          const norm = normalizeInference(item);
          if (!norm) {
            console.warn("[GenerativeAudio] Skipping invalid inference:", item);
            return null;
          }
          return {
            ...norm,
            _originalIndex: idx,
          };
        })
        .filter((item) => item && (includeRoleplay.value || item.source !== 'roleplay') && item.answer?.data?.audio_path);

      console.log(
        `[GenerativeAudio] ${inferences.value.length} total, ${normalized.length} valid`,
      );
      return normalized.reverse();
    });

    // Displayed inferences (lazy loaded subset)
    const paginatedInferences = computed(() => {
      return reversedInferences.value.slice(0, displayedCount.value);
    });

    // Check if there are more items to load
    const hasMore = computed(
      () => displayedCount.value < reversedInferences.value.length,
    );

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          reversedInferences.value.length,
        );
        isLoadingMore.value = false;
      }, 100);
    };

    // Reset to initial count when new inference is added
    const resetToFirstPage = () => {
      displayedCount.value = ITEMS_PER_PAGE;
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

    // ------------ access control -----------
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (val) => {
      hasAccess.value = val;
    };
    const canGenerateWithAccess = computed(() => {
      return canGenerate.value && (remoteMedia.value || hasAccess.value);
    });

    // Supported languages (23 languages) - for Multilingual model
    const languages = {
      ar: "Arabic",
      da: "Danish",
      de: "German",
      el: "Greek",
      en: "English",
      es: "Spanish",
      fi: "Finnish",
      fr: "French",
      he: "Hebrew",
      hi: "Hindi",
      it: "Italian",
      ja: "Japanese",
      ko: "Korean",
      ms: "Malay",
      nl: "Dutch",
      no: "Norwegian",
      pl: "Polish",
      pt: "Portuguese",
      ru: "Russian",
      sv: "Swedish",
      sw: "Swahili",
      tr: "Turkish",
      zh: "Chinese",
    };

    const localizedLanguages = computed(() => {
      const names = new Intl.DisplayNames([locale.value], { type: "language" });
      return Object.fromEntries(Object.keys(languages).map((code) => [code, names.of(code)]));
    });

    const languageFlags = {
      ar: "🇸🇦",
      da: "🇩🇰",
      de: "🇩🇪",
      el: "🇬🇷",
      en: "🇺🇸",
      es: "🇪🇸",
      fi: "🇫🇮",
      fr: "🇫🇷",
      he: "🇮🇱",
      hi: "🇮🇳",
      it: "🇮🇹",
      ja: "🇯🇵",
      ko: "🇰🇷",
      ms: "🇲🇾",
      nl: "🇳🇱",
      no: "🇳🇴",
      pl: "🇵🇱",
      pt: "🇧🇷",
      ru: "🇷🇺",
      sv: "🇸🇪",
      sw: "🇹🇿",
      tr: "🇹🇷",
      zh: "🇨🇳",
    };

    // Voice clone reference file
    const synthesisFile = ref(null);
    const synthesisFileName = ref("");
    const synthesisBase64 = ref("");
    const referenceTranscript = ref(""); // Transcript of what the reference audio says

    // controller for abortable /plan calls
    const planReq = reactive({ controller: null, seq: 0 });

    // ------------ readiness ---------------
    const readiness = reactive({
      ok: true,
      checking: true, // Indicates initial check is in progress
      missingRepos: [],
      repoDetails: [],
      missingGguf: false,
      ggufNames: [],
      notes: [],
      authRequired: false,
      authRepos: [],
      currentMode: null,
    });

    const showUpdateCTA = computed(
      () =>
        !readiness.checking &&
        (readiness.authRequired ||
          generation.blocked ||
          !readiness.ok ||
          readiness.missingRepos.length > 0 ||
          readiness.missingGguf),
    );

    const canGenerate = computed(() => {
      if ((!remoteMedia.value && (!readiness.ok || readiness.authRequired)) || generation.value.active)
        return false;
      // Clone mode requires voice reference AND transcript
      if (
        mode.value === "clone" &&
        (!synthesisBase64.value || !referenceTranscript.value.trim())
      )
        return false;
      // Writing lyrics is optional; supplied lyrics and instrumental music
      // only require the music pipeline.
      if (mode.value === "music") {
        if (!musicCaption.value.trim() && !form.prompt.trim()) return false;
      }
      return true;
    });

    const promptPlaceholder = computed(() => {
      if (mode.value === "music") {
        return t("audio.musicOverride");
      }
      if (mode.value === "clone") {
        if (!synthesisBase64.value) {
          return t("audio.referenceFirst");
        }
        if (!referenceTranscript.value.trim()) {
          return t("audio.transcriptFirst");
        }
        return t("audio.clonePlaceholder", { language: localizedLanguages.value[language.value] });
      }
      return t("audio.speechPlaceholder", { language: localizedLanguages.value[language.value] });
    });

    // Sync main prompt input with musicCaption for music mode
    watch(
      () => form.prompt,
      (newVal) => {
        if (mode.value === "music" && newVal && !musicCaption.value) {
          // Only auto-sync if caption is empty
          musicCaption.value = newVal;
        }
      },
    );

    // ------------ BPM suggestion based on genre/mood -----
    const GENRE_BPM = {
      // Slow genres (60-90)
      classical: 70,
      jazz: 85,
      blues: 75,
      soul: 80,
      folk: 90,
      // Medium genres (90-120)
      pop: 110,
      "r&b": 95,
      rock: 115,
      indie: 105,
      country: 100,
      reggae: 90,
      latin: 105,
      // Fast genres (120-150)
      "hip-hop": 95,
      "k-pop": 125,
      "j-pop": 130,
      electronic: 128,
      house: 125,
      techno: 135,
      edm: 128,
      // Very fast genres (150+)
      metal: 140,
      punk: 160,
      "drum and bass": 175,
      hardcore: 170,
    };

    const MOOD_BPM_MODIFIER = {
      // Slower moods
      melancholic: -15,
      peaceful: -20,
      dreamy: -15,
      nostalgic: -10,
      romantic: -10,
      chill: -15,
      mysterious: -5,
      // Faster moods
      energetic: 15,
      uplifting: 10,
      aggressive: 20,
      intense: 15,
      triumphant: 10,
      rebellious: 15,
      playful: 5,
      // Neutral
      dark: 0,
    };

    const computeSuggestedBPM = () => {
      // Start with a base BPM
      let baseBPM = 120;
      let bpmSum = 0;
      let bpmCount = 0;

      // Average BPM from selected genres
      for (const genre of selectedGenres.value) {
        const genreLower = genre.toLowerCase();
        if (GENRE_BPM[genreLower]) {
          bpmSum += GENRE_BPM[genreLower];
          bpmCount++;
        }
      }

      if (bpmCount > 0) {
        baseBPM = Math.round(bpmSum / bpmCount);
      }

      // Apply mood modifiers
      let moodModifier = 0;
      for (const mood of selectedMoods.value) {
        const moodLower = mood.toLowerCase();
        if (MOOD_BPM_MODIFIER[moodLower] !== undefined) {
          moodModifier += MOOD_BPM_MODIFIER[moodLower];
        }
      }

      // Average the modifier if multiple moods
      if (selectedMoods.value.length > 0) {
        moodModifier = Math.round(moodModifier / selectedMoods.value.length);
      }

      // Apply modifier and clamp to valid range
      const finalBPM = Math.max(40, Math.min(200, baseBPM + moodModifier));
      return finalBPM;
    };

    // ------------ Dimension toggle helpers -----
    const toggleDimension = (type, value) => {
      const map = {
        genre: selectedGenres,
        mood: selectedMoods,
        instrument: selectedInstruments,
        vocal: selectedVocals,
        production: selectedProduction,
      };
      const arr = map[type];
      if (!arr) return;
      const idx = arr.value.indexOf(value);
      if (idx >= 0) {
        arr.value = arr.value.filter((v) => v !== value);
      } else {
        arr.value = [...arr.value, value];
      }

      // Auto-compute BPM when genre or mood changes
      if (type === "genre" || type === "mood") {
        musicBPM.value = computeSuggestedBPM();
      }

      // Auto-rebuild caption on any selection change
      buildCaptionFromSelections();
    };

    const buildCaptionFromSelections = () => {
      const parts = [];
      if (selectedGenres.value.length)
        parts.push(selectedGenres.value.join(", "));
      if (selectedMoods.value.length)
        parts.push(selectedMoods.value.join(", "));
      if (selectedInstruments.value.length)
        parts.push(selectedInstruments.value.join(", "));
      if (!musicInstrumental.value && selectedVocals.value.length) {
        parts.push(selectedVocals.value.join(", "));
      }
      if (selectedProduction.value.length)
        parts.push(selectedProduction.value.join(" "));
      if (musicBPM.value) parts.push(`${musicBPM.value} BPM`);
      if (musicKey.value) parts.push(musicKey.value);
      musicCaption.value = parts.join(", ");
    };

    // Watch BPM and Key changes to auto-rebuild caption
    watch(musicBPM, () => {
      if (durationFromLyrics.value) updateLyricsDuration();
      if (mode.value === "music") {
        buildCaptionFromSelections();
      }
    });

    watch(musicTimeSignature, () => { if (durationFromLyrics.value) updateLyricsDuration(); });

    watch(musicKey, () => {
      if (mode.value === "music") {
        buildCaptionFromSelections();
      }
    });

    watch(musicInstrumental, () => {
      if (mode.value === "music") {
        buildCaptionFromSelections();
      }
    });

    const insertTag = (tag) => {
      const textarea =
        document.querySelector('textarea[v-model="musicLyrics"]') ||
        document.querySelector(".music-section textarea");
      if (musicLyrics.value) {
        musicLyrics.value = musicLyrics.value + "\n\n" + tag + "\n";
      } else {
        musicLyrics.value = tag + "\n";
      }
    };

    // ------------ LLM lyrics generation -----
    const lyricsError = ref("");

    // Use the shared catalog so downloads and inference use the same artifact.
    const lyricsSpec = resolveLLM("qwen3_5_9b", "q4");
    const LYRICS_LLM = { ...lyricsSpec, modelname: lyricsSpec.name, context: 8192 };

    // Check if lyrics LLM is downloaded. Also subscribe to download progress
    // events so the readiness flag flips automatically once the user pulls
    // the file via the skill downloader.
    const lyricsModelReady = ref(false);
    const lyricsDownloading = ref(false);
    const lyricsDownloadProgress = ref(0);
    const lyricsDownloadError = ref('');
    const downloadLyricsModel = async () => {
      if (lyricsDownloading.value) return;
      lyricsDownloading.value = true;
      lyricsDownloadError.value = '';
      try {
        if (!window.electronAPI?.downloadModel) throw new Error('Model downloads require the desktop app.');
        const result = await window.electronAPI.downloadModel(LYRICS_LLM.url, LYRICS_LLM.filename);
        if (result?.error) throw new Error(result.error);
        await checkLyricsModel();
        if (!lyricsModelReady.value) throw new Error('Download did not complete. Please retry.');
      } catch (error) { lyricsDownloadError.value = error.message; }
      finally { lyricsDownloading.value = false; }
    };
    const checkLyricsModel = async () => {
      try {
        const result = await window.electronAPI?.checkModel?.(LYRICS_LLM.filename);
        lyricsModelReady.value = result === true || result?.exists === true;
      } catch { lyricsModelReady.value = false; }
    };
    checkLyricsModel();
    const unsubscribeLyricsDownload = window.electronAPI?.onDownloadProgress?.((_e, data) => {
      if (data?.filename === LYRICS_LLM.filename) lyricsDownloadProgress.value = data.percent || 0;
      if (
        data?.filename === LYRICS_LLM.filename &&
        (data.percent >= 1 || data.done === true)
      ) {
        checkLyricsModel();
      }
    });

    // Language code to full name mapping for lyrics generation
    const VOCAL_LANGUAGE_NAMES = {
      en: "English",
      zh: "Chinese (Mandarin)",
      ja: "Japanese",
      ko: "Korean",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      ru: "Russian",
    };

    const generateLyrics = async () => {
      const theme = lyricsTheme.value.trim();
      if (!theme || isGeneratingLyrics.value) return;

      // Check if LLM API is available
      if (!window.electronAPI?.loadModel || !window.electronAPI?.chat) {
        lyricsError.value =
          "Local LLM not available. Make sure you're running in the Electron app.";
        console.error("[GenerativeAudio] electronAPI not available");
        return;
      }

      lyricsError.value = "";
      isGeneratingLyrics.value = true;

      try {
        // Build context from caption/style selections
        const styleContext =
          musicCaption.value.trim() ||
          [...selectedGenres.value, ...selectedMoods.value].join(", ") ||
          "pop";

        // Determine target language
        const targetLang =
          musicVocalLanguage.value === "other"
            ? customVocalLanguage.value.trim() || "English"
            : VOCAL_LANGUAGE_NAMES[musicVocalLanguage.value] || "English";

        const languageInstruction =
          targetLang !== "English"
            ? `\n\nIMPORTANT: Write ALL lyrics in ${targetLang}. The entire song must be in ${targetLang}, not English. Use natural, native ${targetLang} phrasing and expressions.`
            : "";

        const systemPrompt = `You are a professional songwriter who writes compelling, emotionally resonant lyrics.${languageInstruction}

CRAFT REQUIREMENTS:
- Give the narrator a specific perspective, concrete sensory details, and an emotional conflict.
- Develop the story across verses; the second verse must reveal something new.
- Build a distinctive, repeatable chorus hook whose meaning deepens as the song progresses.
- Use internal rhyme, slant rhyme, and varied phrasing when natural. Avoid forced rhymes, stock imagery, and generic filler.
- Let a bridge change the perspective or stakes. Match diction, rhythmic density, and structure to the requested genre.
- Honor the user's concept, constraints, and language before generic structure suggestions.

CRITICAL FORMATTING RULES:
1. Use structure tags on their own line: [intro], [verse], [pre-chorus], [chorus], [bridge], [outro], [instrumental], [build], [drop], [breakdown]
2. Write singable phrases with consistent stress and breath length within each section. Adapt meter to the genre and language; do not force every line into the same syllable count.
3. Use natural line breaks - one phrase per line
4. Leave blank lines between sections
5. For instrumental sections, write "(instrumental)" or "(guitar solo)" etc.

STRUCTURE TAGS GUIDE:
- [intro] - Opening section, often instrumental or with sparse vocals
- [verse] - Storytelling sections, lower energy than chorus
- [pre-chorus] - Build-up section before the chorus
- [chorus] - The hook, most memorable and catchy part
- [bridge] - Contrast section, different melody/feel
- [outro] - Closing section, often fades out
- [instrumental] - Pure music break
- [build] - Tension building section (EDM/electronic)
- [drop] - High energy release after build
- [breakdown] - Stripped down section, often just beat/bass

OUTPUT ONLY THE LYRICS. No explanations, no commentary, no metadata.`;

        const userMsg = `Write lyrics in ${targetLang} for a ${styleContext} song about: ${theme}

The song should have:
- An intro (can be instrumental)
- At least 2 verses
- A memorable chorus
- Optionally a bridge
- An outro

Use singable, genre-appropriate meter and structure tags. Write in ${targetLang}.`;

        const fullPrompt = `${systemPrompt}\n\n${userMsg}`;

        // Use the local LLM via Electron IPC (node-llama-cpp)
        // Allow a complete developed song while keeping output bounded.
        const result = await window.electronAPI.chat(fullPrompt, { maxTokens: 2048, model: LYRICS_LLM, localOnly: true, isolated: true, taskLabel: 'Generating lyrics' });

        if (result && typeof result === "string") {
          musicLyrics.value = visibleText(result);
          durationFromLyrics.value = true;
          updateLyricsDuration();
        } else {
          lyricsError.value =
            "LLM returned empty response. Make sure a model is loaded.";
        }
      } catch (err) {
        console.error("[GenerativeAudio] Lyrics generation failed:", err);
        lyricsError.value =
          err?.message ||
          "Failed to generate lyrics. Check if LLM model is loaded.";
      } finally {
        isGeneratingLyrics.value = false;
      }
    };

    // ------------ generate music action -----
    const generateMusic = () => {
      // Build caption if not already set
      if (!musicCaption.value.trim() && selectedGenres.value.length > 0) {
        buildCaptionFromSelections();
      }
      // Use caption as the prompt
      const prompt =
        musicCaption.value.trim() || selectedGenres.value.join(", ");
      if (prompt) {
        sendMessage(prompt);
      }
    };

    // ------------ restore from history -----
    const restoreFromHistory = (inference) => {
      if (!inference) return;

      // Switch to the correct mode
      if (inference.isMusic) {
        mode.value = "music";

        // Restore music parameters
        const params = inference.musicParams;
        if (params) {
          songName.value = inference.songName || "";
          musicCaption.value = params.caption || "";
          musicLyrics.value = visibleText(params.lyrics);
          lyricsTheme.value = params.lyricsTheme || "";
          musicDuration.value = params.duration || 60;
          musicBPM.value = params.bpm || 120;
          musicKey.value = params.key || "";
          musicTimeSignature.value = params.timeSignature || "4/4";
          musicSteps.value = params.steps || 8;
          musicGuidance.value = params.guidance || 7.0;
          musicSeed.value = params.seed || -1;
          musicShift.value = params.shift || 3.0;
          musicQuality.value = "quality";
          musicSemantic.value = false;
          musicOffload.value = params.offload || false;
          musicInstrumental.value = params.instrumental || false;
          musicVocalLanguage.value = params.vocalLanguage || "en";
          customVocalLanguage.value = params.customVocalLanguage || "";
          selectedGenres.value = params.genres || [];
          selectedMoods.value = params.moods || [];
          selectedInstruments.value = params.instruments || [];
          selectedVocals.value = params.vocals || [];
          selectedProduction.value = params.production || [];
        }
      } else if (inference.hasClone) {
        mode.value = "clone";
        form.prompt = inference.question || "";
        language.value = inference.language || "en";
      } else {
        mode.value = "tts";
        form.prompt = inference.question || "";
        language.value = inference.language || "en";
        voiceGender.value = inference.voiceGender || "female";
      }

      // Scroll to top to see the restored parameters
      scrollToTop();
    };

    // ------------ generation --------------
    // Use shared generation store for persistent state across view navigation
    const generation = computed(() => generationStore.state.audio);

    // ------------ pipeline/endpoint maps --
    // Chatterbox V3 backs both quality TTS and voice cloning routes.
    const endpointForMode = () => {
      if (mode.value === "music") return "/audio/music";
      if (mode.value === "clone") return "/audio/quality/clone";
      return "/audio/quality/design";
    };
    const pipelineForMode = () => {
      if (mode.value === "music") return "music";
      if (mode.value === "clone") return "audio_quality_clone";
      return "audio_quality_design";
    };
    const currentPipeline = computed(() => pipelineForMode());

    // ------------ downloads state/socket --
    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0,
      total_progress: 0,
      status: "pending",
      pipeline: { tasks: {} },
      wsUrl: null,
    });

    const downloadsSocket = ref(null);
    const lastDlEventAt = ref(0);
    let httpPollTimer = null;

    const socketOpts = {
      transports: ["polling", "websocket"],
      upgrade: true,
      forceNew: true,
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 60,
      reconnectionDelay: 1000,
      path: "/socket.io",
    };

    const downloadMatchesMode = computed(() => {
      const name = downloads?.pipeline?.pipeline_name || "";
      return name.endsWith(`:${currentPipeline.value}`);
    });

    // ---- helpers to merge and compute byte-weighted progress
    const mergeTask = (dst, src) => {
      if (!dst) return { ...src };
      const out = { ...dst, ...src };
      if (typeof dst.progress === "number" && typeof src.progress === "number")
        out.progress = Math.max(dst.progress || 0, src.progress || 0);
      if (
        typeof dst.downloaded_size === "number" &&
        typeof src.downloaded_size === "number"
      )
        out.downloaded_size = Math.max(
          dst.downloaded_size || 0,
          src.downloaded_size || 0,
        );
      if (
        typeof dst.total_size === "number" &&
        typeof src.total_size === "number"
      )
        out.total_size = Math.max(dst.total_size || 0, src.total_size || 0);
      return out;
    };

    const computeTotalFromTasks = (tasksObj) => {
      const tasks = Object.values(tasksObj || {});
      if (!tasks.length) return 0;
      let totalBytes = 0,
        doneBytes = 0;
      for (const t of tasks) {
        const tot = Number(t.total_size || 0);
        const done = Number(t.downloaded_size || 0);
        if (tot > 0) {
          totalBytes += tot;
          doneBytes += Math.min(done, tot);
        }
      }
      if (totalBytes > 0) return (doneBytes / totalBytes) * 100;
      const sumPct = tasks.reduce((s, t) => s + Number(t.progress || 0), 0);
      return sumPct / tasks.length;
    };

    const trackedDownloadPipelines = new Set();
    const cancelledDownloadPipelines = new Set();
    const isCancellingDownloads = ref(false);

    const applyPipelineUpdate = (p) => {
      if (!p || isCancellingDownloads.value || cancelledDownloadPipelines.has(p.pipeline_id)) return;
      downloads.pipelineId = p.pipeline_id || downloads.pipelineId;
      downloads.status = p.status || downloads.status || "downloading";

      const existing = downloads.pipeline?.tasks || {};
      const incoming = p.tasks || {};
      const merged = { ...existing };
      for (const [tid, t] of Object.entries(incoming))
        merged[tid] = mergeTask(existing[tid], t);
      downloads.pipeline = {
        ...(downloads.pipeline || {}),
        ...p,
        tasks: merged,
      };

      const serverPct = Number(p.total_progress ?? 0);
      const tasksPct = computeTotalFromTasks(merged);
      let next =
        Number.isFinite(serverPct) && serverPct > 0 ? serverPct : tasksPct;

      const tasksList = Object.values(merged);
      const anyActive = tasksList.some((t) =>
        ["downloading", "pending"].includes(t.status),
      );
      if (anyActive) next = Math.min(next, 99.9);

      downloads.total_progress = next;
      downloads.progress = next;

      // Safety check: if all tasks are completed but status wasn't updated, force completion
      const allTasksComplete =
        tasksList.length > 0 &&
        tasksList.every((t) => t.status === "completed");
      if (allTasksComplete && downloads.status === "downloading") {
        console.log(
          "[Downloads] All tasks completed, forcing status to completed",
        );
        downloads.status = "completed";
      }

      const wasActive = downloads.active;
      downloads.active = !["completed", "failed", "cancelled"].includes(
        downloads.status,
      );

      // Immediately refresh readiness when download completes
      if (wasActive && !downloads.active && downloads.status === "completed") {
        console.log("[Downloads] Download completed, refreshing readiness");
        probeCurrentMode();
      }
    };

    // Throttle download progress updates using requestAnimationFrame
    let pendingPipelineUpdate = null;
    let rafPending = false;

    const throttledApplyPipelineUpdate = (pipeline) => {
      pendingPipelineUpdate = pipeline;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          if (pendingPipelineUpdate) {
            applyPipelineUpdate(pendingPipelineUpdate);
            pendingPipelineUpdate = null;
          }
          rafPending = false;
        });
      }
    };

    const ensureDownloadsSocket = (base = WS_DL) => {
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      downloads.wsUrl = base;
      downloadsSocket.value = io(base, socketOpts);

      downloadsSocket.value.on("connect", () => {
        if (downloads.pipelineId)
          downloadsSocket.value.emit("subscribe", {
            pipeline_id: downloads.pipelineId,
          });
      });

      downloadsSocket.value.on("download_progress", ({ pipeline }) => {
        lastDlEventAt.value = Date.now();
        if (!pipeline) return;
        throttledApplyPipelineUpdate(pipeline);
      });

      downloadsSocket.value.on("connect_error", (e) =>
        console.warn("[downloads] connect_error", e?.message || e),
      );
      downloadsSocket.value.on("error", (e) =>
        console.warn("[downloads] error", e),
      );
    };

    const kickHttpPollIfStale = (pipelineId) => {
      if (httpPollTimer) clearInterval(httpPollTimer);
      httpPollTimer = setInterval(async () => {
        const idleMs = Date.now() - lastDlEventAt.value;
        if (idleMs < 1500) return;
        try {
          const { data } = await axios.get(
            `${API_BASE}/downloads/status/${pipelineId}`,
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

    const connectAndSubscribe = (pipelineId, websocketUrl) => {
      if (!pipelineId) return;
      trackedDownloadPipelines.add(pipelineId);
      cancelledDownloadPipelines.delete(pipelineId);
      ensureDownloadsSocket(websocketUrl || WS_DL);
      downloads.active = true;
      downloads.pipelineId = pipelineId;
      downloads.status = downloads.status || "downloading";
      try {
        downloadsSocket.value.emit("subscribe", { pipeline_id: pipelineId });
      } catch {}
      kickHttpPollIfStale(pipelineId);
    };

    const startDownloadTracking = (pipelineId, websocketUrl) => {
      connectAndSubscribe(pipelineId, websocketUrl);
      const t = setInterval(async () => {
        if (!downloads.active && downloads.status !== "failed") {
          clearInterval(t);
          await probeCurrentMode();
        }
        if (downloads.status === "failed") clearInterval(t);
      }, 1000);
    };

    // Pipeline names relevant to this view
    const AUDIO_PIPELINES = [
      "audio_turbo",
      "kokoro",
      "audio_quality_clone",
      "chatterbox_clone",
      "qwen3_tts_clone",
      "audio_quality_design",
      "chatterbox_design",
      "qwen3_tts_design",
      "audio_quality_persona",
      "chatterbox_persona",
      "qwen3_tts_persona",
      "music",
      "ace_step",
    ];

    const isRelevantPipeline = (pipelineName) => {
      return AUDIO_PIPELINES.some(
        (p) => pipelineName === p || pipelineName?.startsWith(p),
      );
    };

    const resumeActiveDownloadIfAny = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/downloads/list`);
        const active = (data?.pipelines || []).filter(
          (p) =>
            ["pending", "downloading", "retrying", "waiting_retry"].includes(
              p.status,
            ) && isRelevantPipeline(p.pipeline_name),
        );
        if (!active.length) return;
        ensureDownloadsSocket();
        active.forEach((pl) => connectAndSubscribe(pl.pipeline_id));
      } catch {}
    };

    const cancelCurrentPipeline = async () => {
      if (isCancellingDownloads.value) return;
      const pipelineIds = [...trackedDownloadPipelines];
      if (!pipelineIds.length && downloads.pipelineId) pipelineIds.push(downloads.pipelineId);
      if (!pipelineIds.length) return;
      isCancellingDownloads.value = true;
      try {
        await cancelLocalDownloads({ pipelineIds, apiBase: API_BASE });
        pipelineIds.forEach(id => cancelledDownloadPipelines.add(id));
        trackedDownloadPipelines.clear();
        downloads.status = "cancelled";
        downloads.active = false;
      } catch { downloads.status = "failed"; }
      finally { isCancellingDownloads.value = false; }
    };

    const retryCurrentPipeline = async () => {
      if (!downloads.pipelineId) return;
      try {
        const { data, status } = await axios.post(
          `${API_BASE}/downloads/retry/${downloads.pipelineId}`,
          {},
          { validateStatus: () => true },
        );
        if (status === 202 && data?.pipeline_id)
          startDownloadTracking(
            data.pipeline_id,
            data.websocket_url || downloads.wsUrl || WS_DL,
          );
      } catch {}
    };

    // ------------ readiness helpers -------
    const applyPlanToReadiness = (data) => {
      const repos = Array.isArray(data?.repos) ? data.repos : [];
      const incomplete = repos.filter(
        (r) =>
          r &&
          (r.ok === false || (Number.isFinite(r.missing) && r.missing > 0)),
      );
      readiness.missingRepos = [
        ...new Set(incomplete.map((r) => r.repo).filter(Boolean)),
      ];
      readiness.repoDetails = incomplete.map((r) => ({
        repo: r.repo,
        missing: Number.isFinite(r.missing) ? r.missing : null,
        root: r.root || null,
      }));
      const requiredFiles = Array.isArray(data?.required_files)
        ? data.required_files
        : [];
      const allMissing = requiredFiles.filter((f) => f && !f.ok && !f.exists);
      readiness.missingGguf = allMissing.length > 0;
      readiness.ggufNames = allMissing.map((g) =>
        (g.path || g.name || "").split("/").pop(),
      );
      readiness.authRequired = !!data?.auth_required;
      readiness.authRepos = Array.isArray(data?.auth_repos)
        ? data.auth_repos
        : [];
      readiness.notes = Array.isArray(data?.notes) ? data.notes : [];
      const serverOk = !!data?.ok;
      readiness.ok =
        serverOk &&
        !readiness.authRequired &&
        readiness.missingRepos.length === 0 &&
        !readiness.missingGguf;
      readiness.checking = false;

      // If files are still missing after a "completed" download, reset download state
      if (!readiness.ok && downloads.status === "completed") {
        downloads.status = "pending";
        downloads.progress = 0;
        downloads.total_progress = 0;
        downloads.active = false;
        downloads.pipeline = { tasks: {} };
      }
    };

    const apply403ToReadiness = (res) => {
      readiness.authRequired = true;
      readiness.ok = false;
      readiness.checking = false;
      readiness.notes = [];
      readiness.authRepos = [];
      if (Array.isArray(res?.data?.repos)) {
        for (const r of res.data.repos) {
          if (r?.repo) readiness.authRepos.push(r.repo);
          if (r?.hint) readiness.notes.push(r.hint);
          if (r?.error && !r?.hint) readiness.notes.push(r.error);
        }
      }
      if (res?.data?.hint) readiness.notes.push(res.data.hint);
      setBlocked("audio", true);
    };

    const apply409ToReadiness = (res) => {
      readiness.ok = false;
      readiness.checking = false;
      setBlocked("audio", true);
      const rs = res?.data?.repo_status;
      if (rs?.repo) {
        const missingCount = Array.isArray(rs?.missing)
          ? rs.missing.length
          : typeof rs?.missing === "number"
            ? rs.missing
            : 1;
        const entry = {
          repo: rs.repo,
          missing: Math.max(1, missingCount),
          root: rs.root || null,
        };
        const idx = readiness.repoDetails.findIndex((x) => x.repo === rs.repo);
        if (idx >= 0) readiness.repoDetails[idx] = entry;
        else readiness.repoDetails.push(entry);
      }
      const hint = res?.data?.hint;
      if (hint) readiness.notes.push(hint);
    };

    // Cache key for plan results
    const getPlanCacheKey = (pipeline) => `planCache_audio_${pipeline}`;

    // Load cached plan result
    const loadCachedPlan = async (pipeline) => {
      try {
        const key = getPlanCacheKey(pipeline);
        const cached = await window.electronAPI?.store?.get?.(key, null);
        if (cached && cached.timestamp) {
          // Cache is valid for 24 hours
          const age = Date.now() - cached.timestamp;
          if (age < 24 * 60 * 60 * 1000) {
            return cached.data;
          }
        }
      } catch {}
      return null;
    };

    // Save plan result to cache
    const savePlanToCache = async (pipeline, data) => {
      try {
        const key = getPlanCacheKey(pipeline);
        await window.electronAPI?.store?.set?.(key, {
          timestamp: Date.now(),
          data,
        });
      } catch {}
    };

    const probeCurrentMode = async () => {
      readiness.checking = true;
      readiness.missingRepos = [];
      readiness.repoDetails = [];
      readiness.missingGguf = false;
      readiness.ggufNames = [];
      readiness.notes = [];
      readiness.authRequired = false;
      readiness.authRepos = [];
      setBlocked("audio", false);

      const pipeline = currentPipeline.value;
      readiness.currentMode = mode.value;

      try {
        planReq.controller?.abort();
      } catch {}
      const controller = new AbortController();
      planReq.controller = controller;
      const mySeq = ++planReq.seq;

      try {
        const { data, status } = await axios.post(
          `${API_BASE}/pipelines/plan`,
          { pipeline, deep_validate: true },
          {
            signal: controller.signal,
            validateStatus: () => true,
            timeout: 10000,
          },
        );

        if (mySeq !== planReq.seq) return;

        if (status >= 200 && status < 300) {
          applyPlanToReadiness(data);
          // Cache successful result for offline mode
          await savePlanToCache(pipeline, data);
        } else {
          readiness.ok = false;
          readiness.checking = false;
          readiness.notes = [`Planner returned HTTP ${status}.`];
        }
      } catch (e) {
        const aborted =
          e?.code === "ERR_CANCELED" ||
          e?.name === "CanceledError" ||
          e?.message === "canceled";
        if (!aborted) {
          // Try to use cached plan for offline mode
          const cachedPlan = await loadCachedPlan(pipeline);
          if (cachedPlan && cachedPlan.ok) {
            applyPlanToReadiness(cachedPlan);
            readiness.notes.push("Using cached status (offline mode)");
          } else {
            readiness.ok = false;
            readiness.checking = false;
            readiness.notes = [e?.message || "Network error while planning"];
          }
        }
      } finally {
        if (planReq.controller === controller) planReq.controller = null;
      }
    };

    // ------------ CTA action --------------
    const prefetchForMode = async () => {
      const pipeline = currentPipeline.value;
      try {
        const res = await axios.post(
          `${API_BASE}/pipelines/prefetch`,
          { pipeline, deep_validate: true },
          { validateStatus: () => true },
        );

        if (res.status === 202) {
          if (Array.isArray(res.data?.pipelines_started)) {
            res.data.pipelines_started.forEach(id => trackedDownloadPipelines.add(id));
          }
          const started = Array.isArray(res.data?.pipelines_started)
            ? res.data.pipelines_started
            : [];
          const pid =
            started[started.length - 1] || res.data?.pipeline_id || null;
          const ws =
            res.data?.download_websocket_url ||
            res.data?.websocket_url ||
            WS_DL;
          if (pid) startDownloadTracking(pid, ws);
          return;
        }

        if (res.status >= 200 && res.status < 300) {
          await probeCurrentMode();
          return;
        }

        if (res.status === 403) return apply403ToReadiness(res);
        if (res.status === 409) {
          apply409ToReadiness(res);
          await probeCurrentMode();
          return;
        }

        setError(
          "audio",
          res?.data?.error || `Prefetch failed (${res.status})`,
        );
      } catch (e) {
        setError("audio", e?.message || "Network error");
      }
    };

    // ------------ generation socket -------
    // Socket is managed by the shared generationStore

    // ------------ voice clone file handler
    const handleSynthesisFile = async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        synthesisFile.value = null;
        synthesisFileName.value = "";
        synthesisBase64.value = "";
        return;
      }

      synthesisFile.value = file;
      synthesisFileName.value = file.name;

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(",")[1] || result;
        synthesisBase64.value = base64;
      };
      reader.readAsDataURL(file);
    };

    // Voice gender for TTS mode
    const voiceGender = ref("female");

    // ------------ actions -----------------
    let _lastRoutingMode = 'local';

    const sendMessage = async (prompt) => {
      if (!prompt) return;
      if (!canGenerateWithAccess.value) return;
      _lastRoutingMode = 'local';

      let payload;

      if (mode.value === "music") {
        // Music mode: use ACE-Step v1.5 music generation endpoint
        // Build the prompt from caption (which is set via the main prompt input or musicCaption)
        const captionText = musicCaption.value.trim() || prompt;

        // Handle custom vocal language
        const vocalLang =
          musicVocalLanguage.value === "other"
            ? customVocalLanguage.value.trim() || "en"
            : musicVocalLanguage.value || "en";

        payload = {
          prompt: captionText,
          lyrics: musicInstrumental.value
            ? undefined
            : visibleText(musicLyrics.value) || undefined,
          quality: "quality",
          duration: musicDuration.value,
          bpm: musicBPM.value,
          keyscale: musicKey.value || undefined,
          time_signature: musicTimeSignature.value,
          steps: musicSteps.value,
          guidance_scale: musicGuidance.value,
          seed: musicSeed.value,
          shift: musicShift.value,
          instrumental: musicInstrumental.value,
          vocal_language: vocalLang,
          song_name: songName.value.trim() || undefined,
          semantic: false,
          offload: musicOffload.value,
          auto_download: true,
        };
      } else if (mode.value === "clone" && synthesisBase64.value) {
        // Clone mode: use reference audio with Chatterbox V3.
        payload = {
          text: prompt,
          ref_audio_base64: synthesisBase64.value,
          ref_text: referenceTranscript.value.trim(),
          language: languages[language.value] || "English",
          auto_download: true,
        };
      } else {
        // TTS mode: seed a reusable Chatterbox persona from the description.
        // Build voice instruction based on selected gender and language
        const genderDesc = voiceGender.value === "male" ? "Male" : "Female";
        const langName = languages[language.value] || "English";
        const instruct = `${genderDesc}, clear and natural speaking voice, ${langName} speaker, pleasant tone`;

        payload = {
          text: prompt,
          instruct,
          language: langName,
          auto_download: true,
        };
      }

      // Keep queued results tied to their submitted settings, even if the form changes.
      const submittedMode = mode.value;
      const submittedLanguage = language.value;
      const submittedVoiceGender = voiceGender.value;
      const submittedFormPrompt = form.prompt;
      const submittedMusic = {
        // Store all music parameters for restoration
        ...(mode.value === "music" && {
          songName: songName.value.trim() || null,
          musicParams: {
            quality: musicQuality.value,
            caption: musicCaption.value,
            lyrics: visibleText(musicLyrics.value),
            lyricsTheme: lyricsTheme.value,
            duration: musicDuration.value,
            bpm: musicBPM.value,
            key: musicKey.value,
            timeSignature: musicTimeSignature.value,
            steps: musicSteps.value,
            guidance: musicGuidance.value,
            seed: musicSeed.value,
            shift: musicShift.value,
            instrumental: musicInstrumental.value,
            vocalLanguage: musicVocalLanguage.value,
            customVocalLanguage: customVocalLanguage.value,
            semantic: musicSemantic.value,
            offload: musicOffload.value,
            genres: [...selectedGenres.value],
            moods: [...selectedMoods.value],
            instruments: [...selectedInstruments.value],
            vocals: [...selectedVocals.value],
            production: [...selectedProduction.value],
          },
        }),
      };

      const url = `${API_BASE}${endpointForMode()}`;

      // The device coordinator releases idle models only after this request owns the device.
      ensureGenerationSocket();
      startGeneration("audio"); // Initialize generation state
      const _genStart = performance.now();

      const onSuccess = async (response) => {
        // Check for audio_path in response data
        const audioPath =
          response?.data?.audio_path ||
          response?.data?.path ||
          response?.data?.output_path;
        if (audioPath) {
          // Normalize the data structure
          const normalizedData = {
            ...response.data,
            audio_path: audioPath,
          };

          // Only store serializable data - axios response contains non-serializable properties
          // Build inference record with all parameters for restoration
          const elapsedMs = Math.round(performance.now() - _genStart);
          const newInference = {
            question: prompt,
            answer: {
              status: response.status,
              data: normalizedData,
            },
            id: uuid(),
            language: submittedLanguage,
            model: response.data.model || (
              submittedMode === "music"
                ? "ace-step-v1.5-xl-turbo-diffusers"
                : "chatterbox-multilingual-v3"),
            hasClone: submittedMode === "clone",
            isMusic: submittedMode === "music",
            voiceGender: submittedVoiceGender,
            elapsedMs,
            ...submittedMusic,
            networkMode: _lastRoutingMode,
          };

          // Update shallowRef by replacing array (triggers reactivity)
          inferences.value = [...inferences.value, newInference];
          hasCopy.value = [...hasCopy.value, false];
          persistInferences([...inferences.value]);

          // Save to unified inference store with performance metadata
          addAudioInference(prompt, audioPath, {
            pipeline:
              submittedMode === "music"
                ? "music"
                : submittedMode === "clone"
                  ? "audio_quality"
                  : "audio_turbo",
            elapsed: elapsedMs / 1000,
            source: response.data.metadata?.source || "bonzai",
            model: response.data.model, usage: response.data.metadata?.usage,
            networkMode: _lastRoutingMode,
          });

          if (form.prompt === submittedFormPrompt) form.prompt = "";
          // Reset to first page to show the new result
          resetToFirstPage();
        } else {
          console.warn(
            "[GenerativeAudio] No audio path in response:",
            response?.data,
          );
        }
      };

      await requestWithDownloadTracking(url, payload, onSuccess);
    };

    // ------------ request wrapper ---------
    const requestWithDownloadTracking = async (url, payload, onSuccess) => {
      try {
        isLoading.value = true;

        // Route through unified inference handler
        if (payload.pipeline) {
          const routed = await inferenceRequest(payload.pipeline, payload);
          if (routed?.ok && routed.remote && routed.result) {
            _lastRoutingMode = routed.pipeline ? 'private' : 'remote';
            setBlocked("audio", false);
            stopGeneration("audio");
            await onSuccess({ status: 200, data: routed.result });
            return;
          }
        }

        const headers = {};
        const res = await axios.post(url, payload, {
          headers,
          validateStatus: () => true,
        });

        if (res.status === 202) {
          if (Array.isArray(res.data?.pipelines_started)) {
            res.data.pipelines_started.forEach(id => trackedDownloadPipelines.add(id));
          }
          const pid =
            res.data?.pipeline_id ||
            (Array.isArray(res.data?.pipelines_started) &&
              res.data.pipelines_started.slice(-1)[0]) ||
            null;
          const ws =
            res.data?.download_websocket_url ||
            res.data?.websocket_url ||
            WS_DL;
          if (pid) startDownloadTracking(pid, ws);
          // Don't stop generation yet - download tracking will handle it
          return;
        }

        if (res.status >= 200 && res.status < 300) {
          setBlocked("audio", false);
          stopGeneration("audio"); // Stop generation state on success
          await onSuccess(res);
          return;
        }

        if (res.status === 403) {
          stopGeneration("audio");
          return apply403ToReadiness(res);
        }
        if (res.status === 409) {
          stopGeneration("audio");
          apply409ToReadiness(res);
          await probeCurrentMode();
          return;
        }

        stopGeneration("audio");
        if (res.data?.code === 'insufficient_memory') {
          setError("audio", "Not enough free memory for this music request. Close other apps or try a shorter track.");
        } else {
          setError("audio", res?.data?.error, res.status);
        }
      } catch (err) {
        stopGeneration("audio");
        setError("audio", err?.message || "Network error");
      } finally {
        isLoading.value = false;
      }
    };

    // ------------ utils -------------------
    const { toClipboard } = useClipboard();
    const copy = async (txt) => {
      try {
        await toClipboard(txt);
      } catch {}
    };

    // Set copy state for an index (works with shallowRef)
    const setCopied = (index) => {
      const newHasCopy = [...hasCopy.value];
      newHasCopy[index] = true;
      hasCopy.value = newHasCopy;
      setTimeout(() => {
        const reset = [...hasCopy.value];
        reset[index] = false;
        hasCopy.value = reset;
      }, 2000);
    };

    // Convert local path to streaming URL
    const fileUrl = (p) => {
      if (!p) return "";
      if (/^(?:https?:|bonzai-blob:|data:|file:)/i.test(p)) return p;
      return `${API_BASE}/media/stream?path=${encodeURIComponent(p)}`;
    };

    const downloadAudio = async (idx) => {
      const path = inferences.value[idx]?.answer?.data?.audio_path;
      if (!path) return;
      const defaultName =
        path.split("/").pop() || `bonzai-audio-${Date.now()}.wav`;
      const result = await window.electronAPI?.saveAudio?.(defaultName, path);
      if (!result?.success)
        console.error("Save cancelled or failed", result?.error);
    };

    const openInspector = (inference) => {
      if (!inference) return;
      const data = inference.answer?.data || {};
      const audioPath = data.audio_path_mp3 || data.audio_path || "";
      const promptText = inference.question || data.prompt || "";
      const isMusic = !!inference.isMusic;
      const isClone = !!inference.hasClone;

      inspector.show({
        id: inference.id,
        kind: isMusic ? "music" : "audio",
        mediaUrl: fileUrl(audioPath),
        prompt: promptText,
        model: inference.model || data.model || (isMusic ? "ACE-Step" : isClone ? "Chatterbox V3" : "Kokoro"),
        modelId: inference.pipeline || data.pipeline || (isMusic ? "music" : isClone ? "audio_quality" : "audio_turbo"),
        status: inference.error ? "Error" : "Complete",
        errorMessage: inference.errorMessage || inference.error || "",
        networkMode: inference.networkMode || "local",
        peerId: inference.peerId,
        mintState: inference.nft || null,
        ts: inference.timestamp || inference.ts,
        createdAt: inference.createdAt,
        elapsedMs: generationElapsedMs(inference),
        extra: {
          mode: isMusic ? "Music" : isClone ? "Voice clone" : "Text to speech",
          language: languages[inference.language] || inference.language || language.value,
          voice: inference.voiceGender || inference.gender || voiceGender.value,
          duration: inference.duration ? `${inference.duration}s` : "",
          sampleRate: inference.sampleRate || data.sample_rate || "",
          audioPath,
          songName: inference.songName || data.song_name || "",
        },
      });
    };

    const removeInference = async (idx) => {
      if (idx < 0 || idx >= inferences.value.length) return;
      inferences.value = inferences.value.filter((_, i) => i !== idx);
      hasCopy.value = hasCopy.value.filter((_, i) => i !== idx);
      persistInferences([...inferences.value]);
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

    const requestDeleteAudio = (inference) => {
      if (!inference) return;
      clearDeleteToastTimer();
      pendingDelete.value = {
        id: inference.id,
        index: inference._originalIndex,
        all: false,
      };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const requestClearHistory = () => {
      if (!inferences.value.length) return;
      clearDeleteToastTimer();
      pendingDelete.value = { all: true };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const confirmDeleteAudio = async () => {
      const pending = pendingDelete.value;
      if (!pending) return;
      dismissDeleteToast();

      if (pending.all) {
        inferences.value = [];
        hasCopy.value = [];
        try {
          await window.electronAPI?.store?.set?.("audioInferences", []);
        } catch (e) {
          console.error("Failed to clear audio inferences:", e);
        }
        return;
      }

      const idx = inferences.value.findIndex((item) => item.id === pending.id);
      await removeInference(idx >= 0 ? idx : pending.index);
    };

    // Unified action descriptors fed into <GenerativeActions>.
    // Replaces 4 inline Bulma buttons in the audio history items.
    const actionsFor = (inference) => {
      const hasAudio = !!inference?.answer?.data?.audio_path;
      const minted = !!inference?.nft;
      return [
        { id: "inspect", icon: "info", label: "", variant: "default", title: "Open inspector" },
        { id: "download", icon: "save", label: "Download", variant: "primary", disabled: !hasAudio },
        { id: "restore",  icon: "content_copy", label: "Reuse",
          title: "Restore all parameters from this generation", variant: "default" },
        ...(inference.musicParams || inference.isMusic || inference.type === 'music' || inference.mode === 'music' ? [{ id: 'music-video', icon: 'music_video', label: 'Music Video', disabled: !hasAudio }] : []),
        { id: "mint",
          icon: minted ? "check_circle" : "token",
          label: minted ? "Tokenized" : "Tokenize",
          variant: minted ? "success" : "default",
          disabled: minted },
        { id: "delete", icon: "delete", label: "Delete", variant: "destructive",
          title: "Remove this result" },
      ];
    };
    const handleAction = (id, inference) => {
      switch (id) {
        case "inspect":  openInspector(inference); break;
        case "download": downloadAudio(inference._originalIndex); break;
        case "restore":  restoreFromHistory(inference); break;
        case 'music-video': window.dispatchEvent(new CustomEvent('bonzai:run-agent-workflow', { detail: {
          skillId: 'music-video-forge-v1.0.0', inputs: { soundtrack: inference.answer.data.audio_path,
            brief: [inference.songName || inference.musicParams?.title, inference.question, inference.musicParams?.lyrics].filter(Boolean).join('\n\n') || 'Create a music video for this song.',
            duration: inference.musicParams?.duration || 30 }, sourceId: inference.id,
        } })); break;
        case "mint":     openMint(inference); break;
        case "delete":   requestDeleteAudio(inference); break;
      }
    };

    const clearHistory = async () => {
      requestClearHistory();
    };

    const exportHistory = () => {
      if (inferences.value.length === 0) return;
      const data = JSON.stringify(inferences.value, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-audio-history-${Date.now()}.json`;
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
            inferences.value = [...data, ...inferences.value];
            hasCopy.value = new Array(inferences.value.length).fill(false);
            persistInferences([...inferences.value]);
          }
        } catch (err) {
          console.error("Failed to import history:", err);
        }
      };
      input.click();
    };

    // --------- derived: stable ordered task list
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
        .sort((a, b) => {
          const sa = order[a.status] ?? 99;
          const sb = order[b.status] ?? 99;
          if (sa !== sb) return sa - sb;
          return (b.progress || 0) - (a.progress || 0);
        });
    });

    // ------------ lifecycle ----------------
    // Merge only roleplay rows so an active generation keeps its live state.
    const refreshRoleplayHistory = async () => {
      const rows = await window.electronAPI?.store?.get?.('audioInferences', []);
      if (!Array.isArray(rows)) return;
      const merged = new Map(inferences.value.map(row => [row.id, row]));
      for (const row of rows) if (row.source === 'roleplay') merged.set(row.id, row);
      inferences.value = [...merged.values()].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    };
    onMounted(async () => {
      window.addEventListener('bonzai:roleplay-history-changed', refreshRoleplayHistory);
      ensureGenerationSocket();
      await resumeActiveDownloadIfAny();
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "audioInferences",
          [],
        );
        console.log(
          "[GenerativeAudio] Loading saved inferences:",
          saved?.length || 0,
        );
        if (Array.isArray(saved) && saved.length > 0) {
          inferences.value = saved;
          hasCopy.value = new Array(saved.length).fill(false);
          console.log("[GenerativeAudio] Loaded", saved.length, "inferences");
        }
      } catch (e) {
        console.error("[GenerativeAudio] Failed to load saved inferences:", e);
      }
      await probeCurrentMode();
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
      window.removeEventListener('bonzai:roleplay-history-changed', refreshRoleplayHistory);
      unsubscribeLyricsDownload?.();
      if (downloadsSocket.value?.connected) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      if (httpPollTimer) {
        clearInterval(httpPollTimer);
        httpPollTimer = null;
      }
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
      // Note: generation socket is shared and managed by generationStore
    });

    watch(mode, () => probeCurrentMode(), { immediate: true });

    return {
      remoteMedia, remoteInference,
      includeRoleplay,
      reversedInferences,
      selectedModel,
      musicAdvanced,
      mode,
      audioModeItems,
      voiceGenderItems,
      language,
      languages,
      localizedLanguages,
      languageFlags,
      exaggerationPct,
      form,
      isLoading,
      inferences,
      hasCopy,
      // lazy loading pagination
      paginatedInferences,
      loadMoreSentinel,
      hasMore,
      isLoadingMore,
      // scroll to top
      showScrollTop,
      scrollToTop,
      synthesisFileName,
      synthesisBase64,
      referenceTranscript,
      readiness,
      canGenerate,
      canGenerateWithAccess,
      showUpdateCTA,
      promptPlaceholder,
      generation,
      downloads,
      downloadTaskList,
      downloadMatchesMode,
      promptInput,
      sendMessage,
      copy,
      setCopied,
      downloadAudio,
      removeInference,
      pendingDelete,
      dismissDeleteToast,
      confirmDeleteAudio,
      actionsFor,
      handleAction,
      clearHistory,
      exportHistory,
      importHistory,
      prefetchForMode,
      cancelCurrentPipeline,
      isCancellingDownloads,
      retryCurrentPipeline,
      probeCurrentMode,
      handleSynthesisFile,
      fileUrl,
      activeAudioId,
      audioProgress,
      audioElementId,
      setAudioRef,
      toggleAudioPlayback,
      onAudioTimeUpdate,
      onAudioEnded,
      onAudioPaused,
      // Voice gender for TTS
      voiceGender,
      // Music mode
      musicLyrics,
      musicDuration, lyricsDurationEstimate, durationFromLyrics,
      musicCaption,
      lyricsTheme,
      musicInstrumental,
      musicBPM,
      musicKey,
      musicTimeSignature,
      musicSteps,
      musicGuidance,
      musicSeed,
      musicShift,
      musicQuality,
      musicSemantic,
      musicOffload,
      musicVocalLanguage,
      customVocalLanguage,
      songName,
      isGeneratingLyrics,
      lyricsError,
      generateLyrics,
      lyricsModelReady, lyricsDownloading, lyricsDownloadProgress, lyricsDownloadError, downloadLyricsModel,
      generateMusic,
      restoreFromHistory,
      openInspector,
      // Dimension selectors
      selectedGenres,
      selectedMoods,
      selectedInstruments,
      selectedVocals,
      selectedProduction,
      genreOptions,
      moodOptions,
      instrumentOptions,
      vocalOptions,
      productionOptions,
      keyOptions,
      toggleDimension,
      buildCaptionFromSelections,
      insertTag,
      // Access control
      accessRef,
      hasAccess,
      onAccessChanged,
      canGenerateWithAccess,
      // Network modal
      requestOpenNetworkModal,
      // NFT Minting
      mintTarget,
      openMint,
      onMinted,
    };
  },
};
</script>

<style scoped>
.audio-field-label {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0 0 var(--bz-space-2);
  color: var(--bz-fg);
  font-size: var(--bz-size-h3);
  line-height: 1;
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

.audio-panel-title {
  display: inline-flex;
  color: var(--bz-fg);
  font-size: var(--bz-size-h2) !important;
  line-height: var(--bz-line-tight);
  width: auto !important;
}

.level-item.buttons {
  gap: var(--bz-space-2);
}

.audio-progress-card,
.audio-notice {
  margin-bottom: 1rem;
  padding: 14px 16px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg);
}

.audio-progress-card {
  position: sticky;
  bottom: var(--bz-space-4);
  z-index: 20;
  box-shadow: var(--bz-elev-2);
}

.audio-progress-card__head,
.audio-notice,
.audio-control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.audio-control-row {
  margin-bottom: 1rem;
}

.audio-control-row--compact {
  justify-content: flex-start;
}

.audio-progress-card__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.audio-progress-card__title--pill {
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--bz-fg) 18%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bz-panel) 82%, var(--bz-accent) 18%);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--bz-accent) 24%, transparent);
  animation: bz-progress-pill-pulse 1.8s ease-in-out infinite;
}

.audio-progress-card__pct {
  color: var(--bz-fg);
  font-family: "Fira Sans Condensed", var(--bz-font-body);
  font-weight: 900;
  font-style: italic;
  font-size: 1.45rem;
  line-height: 1;
}

.audio-progress-card :deep(.bz-pulse-wrap--bar) {
  margin-top: 12px;
}

@keyframes bz-progress-pill-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--bz-accent) 18%, transparent);
    transform: translateY(0);
  }
  50% {
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--bz-accent) 0%, transparent);
    transform: translateY(-1px);
  }
}

.audio-download-taskwrap {
  max-height: 180px;
  overflow: auto;
  margin-top: var(--bz-space-4);
}

.audio-notice--danger {
  border-color: color-mix(in srgb, var(--bz-danger) 42%, var(--bz-border));
  background: var(--bz-danger-soft);
}

.audio-notice__body {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.audio-notice__title {
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.audio-notice ul {
  margin: 0.5rem 0 0;
  padding-left: 0;
  list-style: none;
  text-transform: lowercase;
}

.bz-select select {
  min-height: 36px;
  padding: 0 34px 0 12px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-canvas);
  color: var(--bz-fg);
}

.music-mode-controls { grid-column: 1 / -1; justify-content: flex-start; }
.music-mode-controls [aria-pressed="true"] { background: var(--bz-control-selected-bg); color: var(--bz-control-selected-fg); border-color: var(--bz-control-selected-border); }
.audio-language-select {
  flex: 0 0 auto;
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
  background: url("../assets/bonzai_music.webp") no-repeat;
  background-size: cover;
  overflow: hidden;
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
.models__activity--payouts h2 {
  font-size: 48px;
  color: var(--bz-fg);
  text-align: right;
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
  box-shadow: none;
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
  box-shadow: none;
  font-weight: 400;
}
h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: var(--bz-fg);
  text-align: right;
}
p {
  margin-bottom: 1em;
  font-size: 24px;
  color: var(--bz-fg);
  text-align: justify;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
}
div.question {
  border: 1px solid var(--bz-border);
  padding: var(--bz-space-4);
  margin: 0 !important;
  font-weight: 700;
  background: var(--bz-card);
  box-shadow: none;
  border-radius: var(--bz-r);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

ol.chat {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--bz-space-4);
  list-style: none;
  padding: 0;
  margin: var(--bz-space-5) 0;
}

ol.chat .history-item {
  min-width: 0;
  animation: bz-fade-rise 360ms var(--bz-ease-out) both;
}
.audio-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.audio-wave-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: var(--bz-space-4);
  padding: var(--bz-space-3) var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel-2);
  box-shadow: var(--bz-shadow-soft);
}

.audio-wave-button {
  width: 48px;
  height: 48px;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color var(--bz-dur-fast) var(--bz-ease),
    background var(--bz-dur-fast) var(--bz-ease),
    transform var(--bz-dur-fast) var(--bz-ease);
}

.audio-wave-button:hover {
  border-color: var(--bz-accent);
  background: var(--bz-accent-soft);
  transform: translateY(-1px);
}

.audio-wave-body {
  min-width: 0;
}

.audio-player-native {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.song-name {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: var(--bz-fg-mid);
  margin-top: 4px;
}
.audio-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  min-height: 28px;
}
.prompt-text {
  font-size: 16px !important;
  color: var(--bz-fg-mid);
  display: flex;
  align-items: center;
  margin: 0 !important;
  line-height: var(--bz-line-body);
  overflow-wrap: anywhere;
}
form {
  position: relative;
}
.has-text-brand {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}
hr {
  margin: 0;
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
.input,
.textarea {
  color: var(--bz-fg);
  background: var(--bz-border);
  box-shadow: none !important;
  transition: 200ms ease-in;
}
::placeholder {
  color: var(--bz-fg-muted) !important;
  opacity: 1 !important;
}
.button.chat.bz-btn--running {
  position: absolute;
  width: 32px;
  height: 32px;
  right: 10px;
  bottom: 14px;
  border: none !important;
  box-shadow: none !important;
}
input[type="radio"] {
  display: none;
}
input[type="radio"] + label {
  padding: 3px 12px 9px;
  color: var(--bz-fg-faint) !important;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}
input[type="radio"] + label.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
input[type="radio"]:checked + label {
  color: var(--bz-fg) !important;
  border: 1px solid var(--bz-fg) !important;
  background: var(--bz-purple-soft) !important;
}

/* Music toggle checkboxes — identical to radio selectors */
input.music-toggle[type="checkbox"] {
  display: none;
}
input.music-toggle[type="checkbox"] + label {
  padding: 3px 12px 9px;
  color: var(--bz-fg-faint) !important;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}
input.music-toggle[type="checkbox"]:checked + label {
  color: var(--bz-fg) !important;
  border: 1px solid var(--bz-fg) !important;
  background: var(--bz-purple-soft) !important;
}
.select.is-dark select {
  background: var(--bz-border);
  border-color: var(--bz-fg-faint);
  height: 48px;
  color: var(--bz-fg);
}
.select.is-dark select:hover {
  border-color: var(--bz-fg-low);
}
.file-label {
  width: 100%;
}
.file-cta,
.file-name {
  background: var(--bz-border);
  border-color: var(--bz-fg-faint);
  color: var(--bz-fg);
}
.file-name {
  max-width: none;
  flex: 1;
}
.help {
  margin-top: 0.5rem;
}
.slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--bz-fg-faint);
  border-radius: 2px;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
}
.tag.is-dark {
  background: var(--bz-scrim-strong);
  color: var(--bz-fg);
}
.tag.is-warning {
  background: rgba(255, 221, 87, 0.8);
  color: #000;
}
.tag.is-clickable {
  cursor: pointer;
  transition: transform 0.1s ease;
}
.tag.is-clickable:hover {
  transform: scale(1.05);
  background: rgba(50, 50, 50, 0.8);
}
ul,
ol {
  padding: 0;
  list-style-type: none;
}
ol.chat {
  display: flex;
  flex-direction: column;
}
ol.chat li {
  position: relative;
}
.notification.is-warning.is-light {
  background: rgba(255, 221, 87, 0.15);
  color: var(--bz-fg);
}
.label.has-text-white {
  color: var(--bz-fg) !important;
}

/* Fade-in animation for history items */
.history-item {
  animation: bz-rise 0.4s ease-out forwards;
  opacity: 0;
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

/* Background animation */
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

/* ══════════════════════════════════════════════════════════════
   MUSIC MODE STYLES
   ══════════════════════════════════════════════════════════════ */

.music-section {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  padding: 1rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--bz-border);
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 700;
  font-size: 14px;
  color: var(--bz-fg);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.section-header .material-symbols-outlined {
  font-size: 20px;
  opacity: 0.8;
}

/* Lyrics generation row */
.lyrics-gen-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.lyrics-gen-row .input {
  flex: 1;
}

.lyrics-gen-row .button {
  flex-shrink: 0;
  white-space: nowrap;
}

.lyrics-gen-row .button .material-symbols-outlined {
  border: none;
}

/* Vocal language row */
.vocal-language-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.custom-language-input {
  flex: 1;
  max-width: 200px;
}

/* Generate row with semantic toggle */
.generate-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

/* Generate music button */
.generate-music-btn {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.generate-music-btn .material-symbols-outlined {
  border: none;
  font-size: 24px;
}

/* Structure tags help row */
.structure-tags-help {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.structure-tags-help .help-label {
  font-size: 11px;
  color: var(--bz-fg-low);
  margin-right: 4px;
}

.structure-tags-help .tag {
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 10px !important;
  padding: 2px 6px !important;
  height: auto !important;
}

.structure-tags-help .tag:hover {
  background: var(--bz-border-brand) !important;
  transform: scale(1.05);
}

/* Dimension selectors */
.dimension-selectors {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dimension-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.dimension-label {
  min-width: 80px;
  font-size: 11px;
  font-weight: 600;
  color: var(--bz-fg-mid);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-top: 4px;
  flex-shrink: 0;
}

/* Ableton-style MIDI controller pad grid */
.dimension-tags {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
  flex: 1;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MIDI CONTROLLER PAD - 3D rubber button with transparency
   ═══════════════════════════════════════════════════════════════════════════ */
.dimension-tags .tag {
  cursor: pointer;
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  height: auto;
  min-width: 52px;
  min-height: 52px;
  padding: 4px !important;
  margin: 0 !important;
  border-radius: 6px !important;
  font-size: 9px !important;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2px;
  line-height: 1.1;
  text-align: center;
  display: flex !important;
  align-items: center;
  justify-content: center;
  word-break: break-word;
  hyphens: auto;
  overflow: hidden;

  /* 3D perspective for depth */
  transform-style: preserve-3d;

  /* Heavy glassmorphism blur */

  /* Multi-layer 3D gradient - convex rubber pad surface */

  /* Fast tactile response */
  transition: all 0.08s cubic-bezier(0.4, 0, 0.2, 1);

  /* Deep 3D box shadow stack */
  box-shadow:
    /* Inner top-left highlight (convex surface) */
    inset 3px 3px 6px var(--bz-border-strong),
    /* Inner bottom-right shadow (depth) */ inset -3px -3px 8px
      var(--bz-scrim),
    /* Inner top edge shine */ inset 0 2px 4px var(--bz-card),
    /* Inner bottom shadow well */ inset 0 -4px 8px var(--bz-scrim-soft),
    /* Outer elevation shadow */ 0 4px 8px var(--bz-scrim),
    /* Outer soft ambient */ 0 2px 4px var(--bz-scrim-soft),
    /* Base contact shadow */ 0 1px 2px var(--bz-scrim-soft);
}

/* 3D rim highlight pseudo-element */
.dimension-tags .tag::before {
  content: "";
  position: absolute;
  inset: 2px;
  border-radius: 4px;
  background: transparent;
  border: 1px solid transparent;
  border-top-color: rgba(255, 255, 255, 0.18);
  border-left-color: var(--bz-border);
  border-bottom-color: var(--bz-scrim-soft);
  border-right-color: var(--bz-scrim-soft);
  pointer-events: none;
}

/* Inner surface detail */
.dimension-tags .tag::after {
  content: "";
  position: absolute;
  inset: 4px;
  border-radius: 3px;
  background: linear-gradient(
    180deg,
    var(--bz-canvas) 0%,
    transparent 40%
  );
  pointer-events: none;
}

/* Hover - subtle lift */
.dimension-tags .tag:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow:
    inset 3px 3px 6px var(--bz-border-strong),
    inset -3px -3px 8px var(--bz-scrim),
    inset 0 2px 4px var(--bz-border),
    inset 0 -4px 8px var(--bz-scrim-soft),
    0 8px 16px var(--bz-scrim),
    0 4px 8px var(--bz-scrim),
    0 2px 4px var(--bz-scrim-soft);
}

/* Active/pressed - pushed in 3D effect */
.dimension-tags .tag:active {
  transform: translateY(2px) scale(0.96);
  box-shadow:
    /* Inverted for pressed-in look */
    inset -2px -2px 4px var(--bz-card),
    inset 4px 4px 10px var(--bz-scrim),
    inset 0 4px 8px var(--bz-scrim),
    0 1px 2px var(--bz-scrim-soft);
}

/* ─────────────────────────────────────────────────────────────────────────────
   UNSELECTED STATE - Dark translucent rubber pad
   ───────────────────────────────────────────────────────────────────────────── */
.dimension-tags .tag.is-dark {
  background-color: rgba(25, 25, 28, 0.6);
  border: 1px solid rgba(60, 60, 65, 0.4);
  color: rgba(255, 255, 255, 0.35);
}

.dimension-tags .tag.is-dark:hover {
  background-color: rgba(40, 40, 45, 0.7);
  border-color: rgba(80, 80, 85, 0.5);
  color: rgba(255, 255, 255, 0.55);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SELECTED STATES - Glowing translucent 3D pads
   ═══════════════════════════════════════════════════════════════════════════ */

/* Genre - Ableton Coral */
.dimension-tags .tag.is-info {
  background-color: rgba(255, 94, 98, 0.55);
  border: 1px solid rgba(255, 150, 150, 0.5);
  color: var(--bz-fg);
  text-shadow:
    0 1px 3px var(--bz-scrim-deep),
    0 0 8px rgba(255, 94, 98, 0.5);
  box-shadow:
    /* 3D inner shading with color */
    inset 3px 3px 8px rgba(255, 200, 200, 0.25),
    inset -3px -3px 10px rgba(150, 30, 35, 0.5),
    inset 0 2px 4px rgba(255, 220, 220, 0.15),
    inset 0 -5px 10px rgba(120, 20, 25, 0.4),
    /* Multi-layer glow */ 0 0 15px rgba(255, 94, 98, 0.6),
    0 0 30px rgba(255, 94, 98, 0.4),
    0 0 45px rgba(255, 94, 98, 0.25),
    0 0 60px rgba(255, 94, 98, 0.15),
    /* Drop shadow */ 0 4px 8px var(--bz-scrim);
}

.dimension-tags .tag.is-info:hover {
  background-color: rgba(255, 94, 98, 0.65);
  box-shadow:
    inset 3px 3px 8px rgba(255, 210, 210, 0.3),
    inset -3px -3px 10px rgba(150, 30, 35, 0.45),
    inset 0 2px 4px rgba(255, 230, 230, 0.2),
    inset 0 -5px 10px rgba(120, 20, 25, 0.35),
    0 0 20px rgba(255, 94, 98, 0.7),
    0 0 40px rgba(255, 94, 98, 0.5),
    0 0 60px rgba(255, 94, 98, 0.3),
    0 0 80px rgba(255, 94, 98, 0.15),
    0 8px 16px var(--bz-scrim);
}

/* Mood - Ableton Gold */
.dimension-tags .tag.is-warning {
  background-color: rgba(255, 195, 0, 0.55);
  border: 1px solid rgba(255, 220, 100, 0.5);
  color: var(--bz-canvas);
  text-shadow: 0 1px 2px var(--bz-fg-low);
  box-shadow:
    inset 3px 3px 8px rgba(255, 245, 180, 0.35),
    inset -3px -3px 10px rgba(160, 120, 0, 0.5),
    inset 0 2px 4px rgba(255, 250, 200, 0.2),
    inset 0 -5px 10px rgba(130, 100, 0, 0.4),
    0 0 15px rgba(255, 195, 0, 0.6),
    0 0 30px rgba(255, 195, 0, 0.4),
    0 0 45px rgba(255, 195, 0, 0.25),
    0 0 60px rgba(255, 195, 0, 0.15),
    0 4px 8px var(--bz-scrim);
}

.dimension-tags .tag.is-warning:hover {
  background-color: rgba(255, 195, 0, 0.65);
  box-shadow:
    inset 3px 3px 8px rgba(255, 250, 200, 0.4),
    inset -3px -3px 10px rgba(160, 120, 0, 0.45),
    inset 0 2px 4px rgba(255, 255, 220, 0.25),
    inset 0 -5px 10px rgba(130, 100, 0, 0.35),
    0 0 20px rgba(255, 195, 0, 0.7),
    0 0 40px rgba(255, 195, 0, 0.5),
    0 0 60px rgba(255, 195, 0, 0.3),
    0 0 80px rgba(255, 195, 0, 0.15),
    0 8px 16px var(--bz-scrim);
}

/* Instruments - Ableton Cyan */
.dimension-tags .tag.is-success {
  background-color: rgba(0, 210, 211, 0.55);
  border: 1px solid rgba(100, 240, 240, 0.5);
  color: var(--bz-fg);
  text-shadow:
    0 1px 3px var(--bz-scrim-deep),
    0 0 8px rgba(0, 210, 211, 0.5);
  box-shadow:
    inset 3px 3px 8px rgba(180, 255, 255, 0.25),
    inset -3px -3px 10px rgba(0, 120, 125, 0.5),
    inset 0 2px 4px rgba(200, 255, 255, 0.15),
    inset 0 -5px 10px rgba(0, 100, 105, 0.4),
    0 0 15px rgba(0, 210, 211, 0.6),
    0 0 30px rgba(0, 210, 211, 0.4),
    0 0 45px rgba(0, 210, 211, 0.25),
    0 0 60px rgba(0, 210, 211, 0.15),
    0 4px 8px var(--bz-scrim);
}

.dimension-tags .tag.is-success:hover {
  background-color: rgba(0, 210, 211, 0.65);
  box-shadow:
    inset 3px 3px 8px rgba(200, 255, 255, 0.3),
    inset -3px -3px 10px rgba(0, 120, 125, 0.45),
    inset 0 2px 4px rgba(220, 255, 255, 0.2),
    inset 0 -5px 10px rgba(0, 100, 105, 0.35),
    0 0 20px rgba(0, 210, 211, 0.7),
    0 0 40px rgba(0, 210, 211, 0.5),
    0 0 60px rgba(0, 210, 211, 0.3),
    0 0 80px rgba(0, 210, 211, 0.15),
    0 8px 16px var(--bz-scrim);
}

/* Vocals - Ableton Pink */
.dimension-tags .tag.is-link {
  background-color: rgba(255, 100, 177, 0.55);
  border: 1px solid rgba(255, 160, 210, 0.5);
  color: var(--bz-fg);
  text-shadow:
    0 1px 3px var(--bz-scrim-deep),
    0 0 8px rgba(255, 100, 177, 0.5);
  box-shadow:
    inset 3px 3px 8px rgba(255, 210, 235, 0.25),
    inset -3px -3px 10px rgba(160, 40, 100, 0.5),
    inset 0 2px 4px rgba(255, 225, 245, 0.15),
    inset 0 -5px 10px rgba(130, 30, 80, 0.4),
    0 0 15px rgba(255, 100, 177, 0.6),
    0 0 30px rgba(255, 100, 177, 0.4),
    0 0 45px rgba(255, 100, 177, 0.25),
    0 0 60px rgba(255, 100, 177, 0.15),
    0 4px 8px var(--bz-scrim);
}

.dimension-tags .tag.is-link:hover {
  background-color: rgba(255, 100, 177, 0.65);
  box-shadow:
    inset 3px 3px 8px rgba(255, 225, 245, 0.3),
    inset -3px -3px 10px rgba(160, 40, 100, 0.45),
    inset 0 2px 4px rgba(255, 235, 250, 0.2),
    inset 0 -5px 10px rgba(130, 30, 80, 0.35),
    0 0 20px rgba(255, 100, 177, 0.7),
    0 0 40px rgba(255, 100, 177, 0.5),
    0 0 60px rgba(255, 100, 177, 0.3),
    0 0 80px rgba(255, 100, 177, 0.15),
    0 8px 16px var(--bz-scrim);
}

/* Production - Ableton Purple */
.dimension-tags .tag.is-primary {
  background-color: rgba(155, 89, 182, 0.55);
  border: 1px solid rgba(195, 150, 215, 0.5);
  color: var(--bz-fg);
  text-shadow:
    0 1px 3px var(--bz-scrim-deep),
    0 0 8px rgba(155, 89, 182, 0.5);
  box-shadow:
    inset 3px 3px 8px rgba(220, 195, 235, 0.25),
    inset -3px -3px 10px rgba(90, 45, 115, 0.5),
    inset 0 2px 4px rgba(235, 215, 250, 0.15),
    inset 0 -5px 10px rgba(70, 35, 95, 0.4),
    0 0 15px rgba(155, 89, 182, 0.6),
    0 0 30px rgba(155, 89, 182, 0.4),
    0 0 45px rgba(155, 89, 182, 0.25),
    0 0 60px rgba(155, 89, 182, 0.15),
    0 4px 8px var(--bz-scrim);
}

.dimension-tags .tag.is-primary:hover {
  background-color: rgba(155, 89, 182, 0.65);
  box-shadow:
    inset 3px 3px 8px rgba(230, 210, 245, 0.3),
    inset -3px -3px 10px rgba(90, 45, 115, 0.45),
    inset 0 2px 4px rgba(245, 225, 255, 0.2),
    inset 0 -5px 10px rgba(70, 35, 95, 0.35),
    0 0 20px rgba(155, 89, 182, 0.7),
    0 0 40px rgba(155, 89, 182, 0.5),
    0 0 60px rgba(155, 89, 182, 0.3),
    0 0 80px rgba(155, 89, 182, 0.15),
    0 8px 16px var(--bz-scrim);
}

/* Subtle glow pulse for selected pads */
@keyframes pad-glow-pulse {
  0%,
  100% {
    filter: brightness(1) saturate(1);
  }
  50% {
    filter: brightness(1.08) saturate(1.1);
  }
}

.dimension-tags .tag.is-info,
.dimension-tags .tag.is-warning,
.dimension-tags .tag.is-success,
.dimension-tags .tag.is-link,
.dimension-tags .tag.is-primary {
  animation: pad-glow-pulse 2.5s ease-in-out infinite;
}

/* Parameters grid */
.params-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

@media (max-width: 768px) {
  .params-grid {
    grid-template-columns: 1fr;
  }
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--bz-fg-mid);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.param-label .material-symbols-outlined {
  font-size: 14px;
  opacity: 0.7;
}

.param-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-control .slider {
  flex: 1;
  height: 4px;
}

.param-control .param-value {
  min-width: 50px;
  font-size: 12px;
  font-weight: 600;
  color: var(--bz-fg);
  text-align: right;
  font-family: "Fira Sans Condensed", sans-serif;
}

.param-control.select-control {
  flex-direction: column;
  align-items: stretch;
}

.param-control .select {
  width: 100%;
}

.param-control .select select {
  width: 100%;
  font-size: 12px;
  padding: 4px 8px;
  height: 28px;
  background: rgba(50, 50, 50, 0.6);
  border: 1px solid var(--bz-border-strong);
  color: var(--bz-fg);
}

.param-control .input {
  font-size: 12px;
  padding: 4px 8px;
  height: 28px;
  background: rgba(50, 50, 50, 0.6);
  border: 1px solid var(--bz-border-strong);
  color: var(--bz-fg);
  width: 100%;
}

.param-help {
  font-size: 10px !important;
  color: var(--bz-fg-low) !important;
  margin: 0 !important;
  text-align: left !important;
}

.advanced-params {
  padding-top: 1rem;
  border-top: 1px dashed var(--bz-border);
}

/* Small textarea and input overrides for music mode */
.music-section .textarea.is-small {
  font-size: 13px;
  background: rgba(50, 50, 50, 0.4);
  border: 1px solid var(--bz-border-strong);
  color: var(--bz-fg);
  resize: vertical;
}

.music-section .input.is-small {
  font-size: 13px;
  background: rgba(50, 50, 50, 0.4);
  border: 1px solid var(--bz-border-strong);
  color: var(--bz-fg);
  padding-right: 80px; /* Space for the generate button */
}

.music-section .textarea.is-small::placeholder,
.music-section .input.is-small::placeholder {
  color: var(--bz-fg-faint) !important;
}

.music-section .label {
  font-size: 12px !important;
  margin-bottom: 4px !important;
}

.music-section .checkbox {
  font-size: 12px;
}

.music-section .checkbox input {
  margin-right: 4px;
}

/* Ghost button for expand/collapse */
.button.is-ghost {
  background: transparent;
  border: none;
  color: var(--bz-fg-mid);
  padding: 0;
}

.button.is-ghost:hover {
  color: var(--bz-fg);
  background: transparent;
}

.button.is-ghost .material-symbols-outlined {
  border: none;
}

/* ════════════════════════════════════════════════════════════════
   Milestone 6 — canvas-first grid for audio history.
   ════════════════════════════════════════════════════════════════ */

ol.chat {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bz-space-5);
  list-style: none;
  padding: 0;
  margin: var(--bz-space-5) 0;
}
@media (min-width: 880px) {
  ol.chat { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  ol.chat .history-item:first-child { grid-column: 1 / -1; }
}

/* Music studio: restrained, composition-first layout. */
.music-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: var(--bz-space-5);
  align-items: start;
  margin-top: var(--bz-space-4);
}
.music-section {
  margin: 0 !important;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.music-section--lyrics { grid-column: 1; grid-row: 2; }
.music-section--settings { grid-column: 2; grid-row: 2; }
.music-section--palette,
.music-section--direction,
.music-generate-bar { grid-column: 1 / -1; }
.music-section hr {
  margin: var(--bz-space-4) 0;
  background: var(--bz-border);
}
.audio-field-label,
.audio-panel-title,
.music-section .section-header {
  font-family: var(--bz-font-ui) !important;
  font-size: var(--bz-size-meta) !important;
  font-style: normal !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
}
.lyrics-gen-row { align-items: stretch; }
.lyrics-gen-row .bz-field-input { min-width: 0; }
.lyrics-gen-row .bz-btn { min-width: 104px; flex-shrink: 0; }
.music-workspace select,
.music-workspace select.select.is-small.is-dark {
  min-height: 38px;
  border: 1px solid var(--bz-border) !important;
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas) !important;
  color: var(--bz-fg) !important;
}
.structure-tags-help { margin-top: var(--bz-space-3) !important; gap: var(--bz-space-1); }
.structure-tags-help .skill-chip,
.dimension-tags .tag {
  width: auto !important;
  min-width: 0 !important;
  min-height: 30px !important;
  height: 30px !important;
  aspect-ratio: auto !important;
  padding: 0 var(--bz-space-2) !important;
  border: 1px solid var(--bz-border) !important;
  border-radius: var(--bz-r-sm) !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--bz-fg-low) !important;
  font: 500 var(--bz-size-micro) var(--bz-font-ui) !important;
  letter-spacing: 0 !important;
  text-shadow: none !important;
  text-transform: none !important;
  transform: none !important;
}
.structure-tags-help .skill-chip::before,
.structure-tags-help .skill-chip::after,
.dimension-tags .tag::before,
.dimension-tags .tag::after { display: none !important; }
.structure-tags-help .skill-chip:hover,
.dimension-tags .tag:hover {
  border-color: var(--bz-border-strong) !important;
  background: var(--bz-raised) !important;
  color: var(--bz-fg) !important;
  transform: none !important;
}
.dimension-tags .tag:not(.is-dark) {
  border-color: var(--bz-purple-300) !important;
  background: var(--bz-purple-soft) !important;
  color: var(--bz-fg) !important;
}
.dimension-selectors { gap: var(--bz-space-3); }
.dimension-selectors hr { display: none; }
.dimension-row { margin-top: calc(-1 * var(--bz-space-2)); }
.dimension-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.params-grid { gap: var(--bz-space-3); }
.param-item {
  min-height: 0;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
}
.slider::-webkit-slider-thumb { background: var(--bz-purple-300); }
.advanced-params { border-top: 1px solid var(--bz-border); }
.music-generate-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3) 0 0;
  border-top: 1px solid var(--bz-border);
}
input.music-toggle[type="checkbox"] + label {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 0 var(--bz-space-3);
  border-color: var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-mid) !important;
  font: 500 var(--bz-size-meta) var(--bz-font-ui);
}
input.music-toggle[type="checkbox"] + label .material-symbols-outlined { font-size: 18px !important; }
input.music-toggle[type="checkbox"]:checked + label {
  border-color: var(--bz-purple-300) !important;
  background: var(--bz-purple-soft) !important;
  color: var(--bz-fg) !important;
}
.generate-music-btn { min-width: 156px; text-transform: none; letter-spacing: 0; }
@media (max-width: 980px) {
  .music-workspace { grid-template-columns: 1fr; }
  .music-section--lyrics,
  .music-section--settings,
  .music-section--palette,
  .music-section--direction,
  .music-generate-bar { grid-column: 1; grid-row: auto; }
}
/* The composer follows the writing order: concept, lyrics, sound, settings. */
.music-mode-controls { grid-column: 1 / -1; margin: 0; gap: 8px; }
.music-mode-controls [aria-pressed="true"] { background: var(--bz-accent-soft); border-color: var(--bz-accent); color: var(--bz-fg); }
.music-workspace .field { margin-bottom: 20px; }
.music-workspace .audio-field-label { display: block; margin-bottom: 12px; }
.music-workspace .params-grid { gap: 20px; }
.music-workspace .dimension-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.music-workspace .dimension-tags .tag { height: auto !important; min-height: 34px !important; padding: 7px 12px !important; color: var(--bz-fg-mid) !important; }
.music-workspace .lyrics-gen-row { display: flex; flex-wrap: wrap; gap: 10px; }
.music-workspace .lyrics-gen-row > input { flex: 1 1 200px; }
.music-workspace .lyrics-gen-row > select { float: none !important; max-width: 100%; height: 42px !important; border: 1px solid var(--bz-border) !important; }
.music-workspace .music-section { min-width: 0; padding: 24px; }
@media (max-width: 850px) { .music-workspace { display: flex; flex-direction: column; } .music-workspace > * { width: 100%; box-sizing: border-box; } .music-workspace .music-section { padding: 16px; } }
</style>

<style scoped>
/* Composition desk: a script channel beside the sound controls, with a shared
   transport strip. Every control still maps to an actual generation parameter. */
.music-workspace {
  display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);
  gap:0; align-items:stretch; background:var(--bz-panel);
  border:1px solid var(--bz-border); border-radius:var(--bz-r-lg);
  overflow:hidden;
}
.music-mode-controls { grid-column:1 / -1; margin:0; padding:16px 24px; border-bottom:1px solid var(--bz-border); background:var(--bz-canvas); }
.music-workspace .music-section { padding:24px; border:0; border-radius:0; background:transparent; }
.music-section--lyrics { grid-column:1; grid-row:2; border-right:1px solid var(--bz-border) !important; }
.music-section--settings { grid-column:2; grid-row:2; }
.music-workspace .audio-field-label { font-family:var(--bz-font-body); font-style:normal; font-size:14px; font-weight:600; letter-spacing:0; }
.music-workspace .params-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-top:20px !important; }
.music-workspace .param-item { min-width:0; padding:16px; background:var(--bz-canvas); border:1px solid var(--bz-border); border-radius:var(--bz-r-sm); }
.music-workspace .param-label { display:flex; align-items:center; gap:8px; color:var(--bz-fg-mid); }
.music-workspace .param-value { color:var(--bz-fg); font-variant-numeric:tabular-nums; }
.music-workspace input[type=range] { width:100%; accent-color:var(--bz-accent); cursor:pointer; }
.music-workspace textarea { min-height:220px; resize:vertical; line-height:1.6; background:var(--bz-canvas); }
.music-workspace .music-section--palette { border-top:1px solid var(--bz-border); }
.music-generate-bar { grid-column:1 / -1; margin:0 !important; padding:20px 24px; background:var(--bz-canvas); border-top:1px solid var(--bz-border); display:flex; justify-content:flex-end; align-items:center; gap:16px; flex-wrap:wrap; }
@media (max-width: 1000px) {
  .music-workspace { display:grid; grid-template-columns:1fr; }
  .music-workspace .music-section { grid-column:1; grid-row:auto; border-right:0 !important; border-bottom:1px solid var(--bz-border); }
}
@media (max-width: 520px) {
  .music-workspace .params-grid { grid-template-columns:1fr; }
  .music-workspace .music-section,.music-mode-controls,.music-generate-bar { padding:16px; }
}
</style>

<style scoped>
/* A single console: writing desk, compact channel strips and transport. */
.music-workspace { grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); }
.music-workspace .music-section--lyrics { grid-row:2 / 4; display:flex; flex-direction:column; }
.music-workspace .music-section--settings { grid-column:2; grid-row:2; padding-bottom:16px; }
.music-workspace .music-section--direction { grid-column:2; grid-row:3; padding-top:0; }
.music-workspace .music-section--direction textarea { min-height:100px; max-height:180px; }
.music-workspace .music-section--settings > .params-grid:not(.advanced-params) { grid-template-columns:repeat(4,minmax(0,1fr)); gap:0; border:1px solid var(--bz-border); border-radius:var(--bz-r-md); overflow:hidden; }
.music-workspace .music-section--settings > .params-grid:not(.advanced-params) .param-item { display:flex; flex-direction:column; gap:12px; padding:12px; border:0; border-radius:0; border-right:1px solid var(--bz-border); }
.music-workspace .music-section--settings > .params-grid:not(.advanced-params) .param-item:last-child { border-right:0; }
.music-workspace .music-section--settings > .params-grid:not(.advanced-params) .param-label { flex-wrap:wrap; align-content:flex-start; min-height:64px; font-size:12px; }
.music-workspace .music-section--settings > .params-grid:not(.advanced-params) .param-value { display:block; width:100%; font-size:24px; }
.music-workspace .music-section--settings > .params-grid:not(.advanced-params) .param-control { display:flex; justify-content:center; }
.music-workspace :is(#audio-musicDuration,#audio-musicBPM) { appearance:auto; writing-mode:vertical-lr; direction:rtl; width:24px; height:112px; margin:0; }
.music-workspace .select-control select { min-width:0; width:100%; }
.music-workspace .music-section--lyrics > .field:last-child { flex:1; display:flex; flex-direction:column; }
.music-workspace .music-section--lyrics > .field:last-child .control { flex:1; display:flex; }
.music-workspace #audio-musicLyrics { flex:1; width:100%; min-height:200px; }
.music-workspace .music-section--lyrics hr { margin:16px 0; }
.music-workspace .structure-tags-help { display:flex; gap:6px; flex-wrap:wrap; font-size:12px; }
.music-workspace .structure-tags-help .skill-chip { margin:0!important; }
@media (max-width:1200px) { .music-workspace .music-section--settings > .params-grid:not(.advanced-params) { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:1000px) {
 .music-workspace { grid-template-columns:1fr; }
 .music-workspace .music-section--lyrics,.music-workspace .music-section--settings,.music-workspace .music-section--direction { grid-column:1; grid-row:auto; }
 .music-workspace .music-section--direction { padding-top:24px; }
}
</style>
<style scoped>
.models__activity--payouts:has(.music-workspace) { background:transparent; border:0; padding:0; }
.models__activity--payouts > .columns { margin:0; }
.models__activity--payouts > .columns > .column { padding:0; }
.audio-history-head { display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }
.audio-history-head h2 { margin:0; text-align:left; }
.audio-history-head .buttons { display:flex; gap:8px; }
.music-duration-estimate { margin: 8px 0 0; color: var(--bz-text-muted); font-family: inherit; font-size: 12px; line-height: 1.5; text-align: left; }
</style>
