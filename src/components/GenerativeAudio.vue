<template>
  <div class="background"></div>
  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12">
          <div class="level">
            <div class="level-left">
              <div class="level-item">
                <h1 class="fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined mr-2"
                    style="font-size: 92px !important"
                  >
                    graphic_eq
                  </span>
                  Generative Audio
                </h1>
              </div>
            </div>
          </div>

          <!-- GENERATION PROGRESS -->
          <div
            v-if="generation.active"
            class="generation notification is-info"
            style="margin-bottom: 1rem"
          >
            <p class="mb-2">
              <span class="fira-sans-condensed-black-italic is-size-4">
                <button
                  disabled
                  class="button is-loading is-info is-small mr-2 p-4"
                ></button>
                Crafting...
              </span>
              <span
                class="fira-sans-condensed-black-italic is-pulled-right is-size-4"
              >
                {{ Math.round(generation.pct) }}%
              </span>
            </p>
            <progress
              class="progress is-success"
              :value="Math.max(0, Math.min(100, generation.pct))"
              max="100"
            >
              {{ Math.round(generation.pct) }}%
            </progress>
          </div>

          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <!-- MODE TOGGLES (TTS vs Clone) -->
                <div class="control mb-4 has-text-left">
                  <input
                    v-model="mode"
                    :value="'tts'"
                    id="mode_tts"
                    type="radio"
                    name="mode"
                    :checked="mode === 'tts'"
                  />
                  <label for="mode_tts" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      record_voice_over
                    </span>
                    Text to Speech
                  </label>

                  <input
                    v-model="mode"
                    :value="'clone'"
                    id="mode_clone"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_clone" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      genetics
                    </span>
                    Voice Clone
                  </label>

                  <input
                    v-model="mode"
                    :value="'music'"
                    id="mode_music"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_music" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      music_note
                    </span>
                    Music
                  </label>

                  <!-- LANGUAGE SELECTOR (hidden for music mode) -->
                  <div
                    v-if="mode !== 'music'"
                    class="select is-dark is-pulled-right"
                  >
                    <select v-model="language">
                      <option
                        v-for="(name, code) in languages"
                        :key="code"
                        :value="code"
                      >
                        {{ languageFlags[code] }} {{ name }}
                      </option>
                    </select>
                  </div>
                </div>

                <!-- VOICE GENDER SELECTOR (TTS mode only) -->
                <div v-if="mode === 'tts'" class="control mb-4 has-text-left">
                  <input
                    v-model="voiceGender"
                    value="female"
                    id="gender_female"
                    type="radio"
                    name="gender"
                  />
                  <label for="gender_female" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 24px !important"
                    >
                      female
                    </span>
                    Female
                  </label>

                  <input
                    v-model="voiceGender"
                    value="male"
                    id="gender_male"
                    type="radio"
                    name="gender"
                  />
                  <label for="gender_male" class="radio">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 24px !important"
                    >
                      male
                    </span>
                    Male
                  </label>
                </div>

                <!-- ACCESS REQUIREMENTS -->
                <AccessRequirements
                  ref="accessRef"
                  level="LVL2"
                  @access-changed="onAccessChanged"
                  class="mt-5"
                />

                <!-- MUSIC MODE INPUTS -->
                <div v-if="mode === 'music'" class="mb-4">
                  <!-- ═══════════════════════════════════════════════════════════
                       SECTION 1: LYRICS GENERATION
                       ═══════════════════════════════════════════════════════════ -->
                  <div class="music-section">
                    <!-- Lyrics Theme Input (for LLM generation) -->
                    <div class="field has-text-left">
                      <label
                        class="has-text-white fira-sans-condensed-black-italic is-size-3"
                      >
                        Song Concept
                      </label>
                      <div class="lyrics-gen-row mt-3">
                        <input
                          class="input is-medium"
                          type="text"
                          v-model="lyricsTheme"
                          placeholder="e.g. summer road trip"
                          @keyup.enter="generateLyrics"
                        />

                        <div
                          class="is-pulled-right has-text-white vocal-lang-row"
                        >
                          <div class="select is-dark is-size-5">
                            <select
                              v-model="musicVocalLanguage"
                              style="height: 50px; border-color: #fff"
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
                            class="input is-dark is-medium custom-language-input is-pulled-right"
                            type="text"
                            v-model="customVocalLanguage"
                            placeholder="e.g. Creole, Swahili, Hindi..."
                            style="
                              height: 50px;
                              border-color: #fff;
                              border-left: none;
                            "
                          />
                        </div>
                        <button
                          class="button is-medium is-info"
                          :class="{ 'is-loading': isGeneratingLyrics }"
                          :disabled="isGeneratingLyrics || !lyricsTheme.trim()"
                          @click.prevent="generateLyrics"
                          :title="
                            lyricsTheme.trim()
                              ? 'Generate lyrics using local LLM'
                              : 'Enter a theme first'
                          "
                        >
                          <span
                            class="material-symbols-outlined mr-1"
                            style="font-size: 16px"
                          >
                            auto_awesome
                          </span>
                          <span>Generate</span>
                        </button>
                      </div>
                      <p v-if="lyricsError" class="help is-danger mt-2">
                        {{ lyricsError }}
                      </p>
                    </div>
                    <hr />
                    <!-- Lyrics Textarea -->
                    <div class="field mt-2 has-text-left">
                      <label
                        class="has-text-white fira-sans-condensed-black-italic is-size-3"
                      >
                        Lyrics
                      </label>
                      <div class="control mt-3">
                        <textarea
                          class="textarea is-small"
                          v-model="musicLyrics"
                          placeholder="[intro]&#10;(instrumental)&#10;&#10;[verse]&#10;Walking through the city lights&#10;Everything feels so alive tonight&#10;Stars above are shining bright&#10;&#10;[chorus]&#10;We're on fire, burning bright&#10;Dancing through the neon night&#10;Nothing's gonna stop us now&#10;&#10;[bridge]&#10;When the world falls down around us&#10;We'll rise up from the ground&#10;&#10;[outro]&#10;(fade out)"
                          rows="8"
                        ></textarea>
                      </div>
                      <div class="structure-tags-help mt-2">
                        <span class="help-label">Structure Tags:</span>
                        <span
                          class="tag is-small is-dark is-clickable mr-1"
                          @click="insertTag('[intro]')"
                        >
                          [intro]
                        </span>
                        <span
                          class="tag is-small is-dark is-clickable mr-1"
                          @click="insertTag('[verse]')"
                        >
                          [verse]
                        </span>
                        <span
                          class="tag is-small is-dark is-clickable mr-1"
                          @click="insertTag('[chorus]')"
                        >
                          [chorus]
                        </span>
                        <span
                          class="tag is-small is-dark is-clickable mr-1"
                          @click="insertTag('[bridge]')"
                        >
                          [bridge]
                        </span>
                        <span
                          class="tag is-small is-dark is-clickable mr-1"
                          @click="insertTag('[outro]')"
                        >
                          [outro]
                        </span>
                        <span
                          class="tag is-small is-dark is-clickable mr-1"
                          @click="insertTag('[instrumental]')"
                        >
                          [instrumental]
                        </span>
                        <span
                          class="tag is-small is-dark is-clickable mr-1"
                          @click="insertTag('[build]')"
                        >
                          [build]
                        </span>
                        <span
                          class="tag is-small is-dark is-clickable mr-1"
                          @click="insertTag('[drop]')"
                        >
                          [drop]
                        </span>
                        <span
                          class="tag is-small is-dark is-clickable"
                          @click="insertTag('[breakdown]')"
                        >
                          [breakdown]
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- ═══════════════════════════════════════════════════════════
                       SECTION 3: INFERENCE PARAMETERS
                       ═══════════════════════════════════════════════════════════ -->
                  <div class="music-section mt-4 has-text-left">
                    <label
                      class="has-text-white fira-sans-condensed-black-italic is-size-3"
                    >
                      Generation Settings
                    </label>
                    <!-- Basic Parameters (always visible) -->
                    <div class="params-grid mt-5">
                      <!-- Duration -->
                      <div class="param-item">
                        <label class="param-label">
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
                          <input
                            type="range"
                            v-model.number="musicDuration"
                            min="10"
                            max="300"
                            step="10"
                            class="slider"
                          />
                        </div>
                      </div>

                      <!-- BPM -->
                      <div class="param-item">
                        <label class="param-label">
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
                          <input
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
                        <label class="param-label mb-2">
                          <span class="material-symbols-outlined">
                            music_note
                          </span>
                          Key
                        </label>
                        <div class="param-control select-control">
                          <select
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
                        <label class="param-label mb-2">
                          <span class="material-symbols-outlined">
                            grid_4x4
                          </span>
                          Time Sig
                        </label>
                        <div class="param-control select-control">
                          <select
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

                    <!-- Advanced Parameters -->
                    <div class="params-grid mt-3 advanced-params">
                      <!-- Inference Steps -->
                      <div class="param-item">
                        <label class="param-label">
                          <span class="material-symbols-outlined">repeat</span>
                          Steps
                        </label>
                        <div class="param-control">
                          <input
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
                        <label class="param-label">
                          <span class="material-symbols-outlined">
                            linear_scale
                          </span>
                          Guidance
                        </label>
                        <div class="param-control">
                          <input
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
                        <label class="param-label">
                          <span class="material-symbols-outlined">casino</span>
                          Seed
                        </label>
                        <div class="param-control">
                          <input
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
                        <label class="param-label">
                          <span class="material-symbols-outlined">
                            swap_horiz
                          </span>
                          Shift
                        </label>
                        <div class="param-control">
                          <input
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
                          Noise schedule shift (default: 4)
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- ═══════════════════════════════════════════════════════════
                       SECTION 2: CAPTION / STYLE DESCRIPTION
                       ═══════════════════════════════════════════════════════════ -->
                  <div class="music-section mt-4">
                    <!-- Dimension Selectors -->
                    <div class="dimension-selectors">
                      <!-- Genre -->
                      <h3
                        class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left"
                      >
                        Genre
                      </h3>
                      <div class="dimension-row">
                        <div class="dimension-tags">
                          <span
                            v-for="g in genreOptions"
                            :key="g"
                            class="tag is-small is-clickable"
                            :class="
                              selectedGenres.includes(g) ? 'is-info' : 'is-dark'
                            "
                            @click="toggleDimension('genre', g)"
                          >
                            {{ g }}
                          </span>
                        </div>
                      </div>
                      <hr />

                      <!-- Mood -->
                      <h3
                        class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left"
                      >
                        Mood
                      </h3>
                      <div class="dimension-row">
                        <div class="dimension-tags">
                          <span
                            v-for="m in moodOptions"
                            :key="m"
                            class="tag is-small is-clickable"
                            :class="
                              selectedMoods.includes(m)
                                ? 'is-warning'
                                : 'is-dark'
                            "
                            @click="toggleDimension('mood', m)"
                          >
                            {{ m }}
                          </span>
                        </div>
                      </div>
                      <hr />
                      <!-- Instruments -->
                      <h3
                        class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left"
                      >
                        Instruments
                      </h3>
                      <div class="dimension-row">
                        <div class="dimension-tags">
                          <span
                            v-for="i in instrumentOptions"
                            :key="i"
                            class="tag is-small is-clickable"
                            :class="
                              selectedInstruments.includes(i)
                                ? 'is-success'
                                : 'is-dark'
                            "
                            @click="toggleDimension('instrument', i)"
                          >
                            {{ i }}
                          </span>
                        </div>
                      </div>
                      <hr />

                      <!-- Vocals -->
                      <h3
                        class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left"
                      >
                        Vocals
                      </h3>
                      <div class="dimension-row" v-if="!musicInstrumental">
                        <div class="dimension-tags">
                          <span
                            v-for="v in vocalOptions"
                            :key="v"
                            class="tag is-small is-clickable"
                            :class="
                              selectedVocals.includes(v) ? 'is-link' : 'is-dark'
                            "
                            @click="toggleDimension('vocal', v)"
                          >
                            {{ v }}
                          </span>
                        </div>
                      </div>
                      <hr />
                      <!-- Production -->
                      <h3
                        class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left"
                      >
                        Production
                      </h3>
                      <div class="dimension-row">
                        <div class="dimension-tags">
                          <span
                            v-for="p in productionOptions"
                            :key="p"
                            class="tag is-small is-clickable"
                            :class="
                              selectedProduction.includes(p)
                                ? 'is-primary'
                                : 'is-dark'
                            "
                            @click="toggleDimension('production', p)"
                          >
                            {{ p }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    class="music-section mt-4 models__activity--payouts has-text-left"
                  >
                    <span
                      class="fira-sans-condensed-black-italic has-text-brand is-size-1"
                      style="width: auto !important"
                    >
                      Ready ?
                    </span>
                    <div class="control mt-5">
                      <textarea
                        class="textarea is-large"
                        v-model="musicCaption"
                        placeholder="pop rock, energetic, electric guitar, drums, male vocals, polished production, 120 BPM"
                        rows="2"
                        style="resize: none"
                      ></textarea>
                    </div>
                  </div>

                  <!-- Generate Button & Semantic Toggle -->
                  <div
                    class="music-section mt-4 models__activity--payouts generate-row"
                  >
                    <div class="select is-dark">
                      <select
                        v-model="musicQuality"
                        style="height: 52px; position: relative; top: -6px"
                      >
                        <option value="fast">Fast (v1.5)</option>
                        <option value="quality">Quality (v1.5 XL)</option>
                      </select>
                    </div>

                    <input
                      type="checkbox"
                      v-model="musicSemantic"
                      id="music_semantic"
                      class="music-toggle"
                    />
                    <label for="music_semantic">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        neurology
                      </span>
                      Semantic
                    </label>

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
                      class="button is-warning is-medium generate-music-btn"
                      style="margin-left: auto"
                      :class="{ 'is-loading': isLoading }"
                      :disabled="
                        isLoading ||
                        !canGenerateWithAccess ||
                        (!musicCaption.trim() && selectedGenres.length === 0)
                      "
                      @click="generateMusic"
                    >
                      <span class="material-symbols-outlined mr-2 is-size-1">
                        graphic_eq
                      </span>
                      <span>Make Music</span>
                    </button>
                  </div>
                </div>

                <!-- VOICE CLONE FILE INPUT -->
                <div v-if="mode === 'clone'">
                  <div class="file is-fullwidth is-medium mb-3">
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
                    <label class="label has-text-white has-text-left is-size-6">
                      <span
                        class="material-symbols-outlined mr-1"
                        style="font-size: 18px; vertical-align: middle"
                      >
                        subtitles
                      </span>
                      Reference Transcript
                      <span class="has-text-grey-light is-size-7 ml-2">
                        (type exactly what is said in the audio)
                      </span>
                    </label>
                    <div class="control">
                      <textarea
                        class="textarea"
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

                <!-- READINESS CTA -->
                <div
                  v-if="showUpdateCTA && readiness.currentMode == mode"
                  class="notification is-danger mb-6 mt-6 p-6"
                  style="margin-bottom: 1rem"
                >
                  <p class="mb-2">
                    <strong class="fira-sans-condensed-black-italic is-size-2">
                      Download Required
                    </strong>
                    <span v-if="readiness.missingRepos.length">
                      <ul style="margin-top: 0.5rem; text-transform: lowercase">
                        <li v-for="d in readiness.repoDetails" :key="d.repo">
                          <span
                            class="material-symbols-outlined is-size-3 mr-1"
                          >
                            deployed_code
                          </span>
                          {{ d.repo }}
                        </li>
                      </ul>
                    </span>

                    <span v-if="readiness.missingGguf">
                      <ul style="margin-top: 0.5rem; text-transform: lowercase">
                        <li v-for="gguf in readiness.ggufNames" :key="gguf">
                          <span
                            class="material-symbols-outlined is-size-3 mr-1"
                          >
                            deployed_code
                          </span>
                          {{ gguf }}
                        </li>
                      </ul>
                    </span>

                    <span v-if="readiness.notes.length">
                      <br />
                      Notes:
                      <ul style="margin-top: 0.5rem">
                        <li v-for="(n, i) in readiness.notes" :key="i">
                          • {{ n }}
                        </li>
                      </ul>
                    </span>
                  </p>
                  <hr />
                  <div class="buttons">
                    <button
                      class="button is-warning mr-5 is-large"
                      @click="prefetchForMode"
                      :disabled="downloads.active || readiness.authRequired"
                      title="(Re)download required files"
                    >
                      <span class="material-symbols-outlined mr-1">
                        download
                      </span>
                      Download Now
                    </button>
                  </div>
                </div>

                <!-- GENERATION ERROR -->
                <div
                  v-else-if="generation.error"
                  class="notification is-danger"
                  style="margin-bottom: 1rem"
                >
                  <strong>Generation failed.</strong>
                  {{ generation.error }}
                </div>

                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads && downloads.active"
                  class="notification is-info p-6"
                  style="margin-bottom: 1.25rem"
                >
                  <p class="mb-2">
                    <span class="fira-sans-condensed-black-italic is-size-4">
                      Downloading
                      <button
                        disabled
                        class="button is-loading is-info is-small mr-2 p-4"
                      ></button>
                    </span>
                    <span
                      class="fira-sans-condensed-black-italic is-pulled-right is-size-1"
                    >
                      {{ Math.round(downloads.total_progress || 0) }}%
                    </span>
                  </p>
                  <progress
                    class="progress is-success is-large"
                    :value="downloads.progress || 0"
                    max="100"
                  >
                    {{ Math.round(downloads.progress || 0) }}%
                  </progress>
                  <div
                    v-if="downloadTaskList.length"
                    style="max-height: 180px; overflow: auto"
                  >
                    <ul>
                      <li
                        v-for="t in downloadTaskList"
                        :key="t.task_id"
                        class="is-size-7 columns"
                        style="text-transform: lowercase"
                      >
                        <div class="column has-text-left">
                          <span class="material-symbols-outlined is-size-6">
                            deployed_code
                          </span>
                          {{ t.filename }} —
                          <span class="fira-sans-condensed-black-italic">
                            {{ t.status }}
                          </span>
                        </div>
                        <div
                          class="column is-2 fira-sans-condensed-black-italic has-text-right"
                        >
                          {{ Math.round(t.progress || 0) }}%
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- PROMPT (hidden for music mode - uses explicit generate button) -->
                <form v-if="mode !== 'music'" ref="promptForm" @submit.prevent>
                  <input
                    ref="promptInput"
                    class="input is-large is-fullwidth"
                    type="text"
                    :placeholder="promptPlaceholder"
                    v-model="form.prompt"
                    @keyup.enter="
                      canGenerateWithAccess && sendMessage(form.prompt)
                    "
                    :disabled="isLoading || !canGenerateWithAccess"
                  />
                  <button
                    class="button chat is-loading is-outlined is-info is-large is-fullwidth"
                    v-if="isLoading"
                  ></button>
                </form>

                <hr class="mt-5" />

                <!-- GENERATION HISTORY HEADER -->
                <div class="level pt-5 mt-5">
                  <div class="level-left">
                    <div class="level-item">
                      <h2
                        class="fira-sans-condensed-black-italic has-text-white is-size-1"
                      >
                        <span class="material-symbols-outlined is-size-1 mr-2">
                          history
                        </span>
                        Generation History
                      </h2>
                    </div>
                  </div>
                  <div class="level-right">
                    <div class="level-item buttons">
                      <button
                        class="button is-warning is-small"
                        @click="importHistory()"
                      >
                        <span class="material-symbols-outlined mr-2">
                          upload
                        </span>
                        Import
                      </button>
                      <button
                        class="button is-warning is-small ml-4"
                        @click="exportHistory()"
                        :disabled="inferences.length === 0"
                      >
                        <span class="material-symbols-outlined mr-2">
                          download
                        </span>
                        Export
                      </button>
                      <button
                        class="button is-danger is-small ml-4"
                        @click="clearHistory()"
                      >
                        <span class="material-symbols-outlined mr-2">
                          ink_eraser
                        </span>
                        Clear
                      </button>
                    </div>
                  </div>
                </div>

                <!-- RESULTS -->
                <ol class="chat" v-if="inferences.length">
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
                        <span class="tag is-dark">
                          {{
                            languageFlags[inference.language] ||
                            inference.language
                          }}
                        </span>
                        <span
                          v-if="inference.hasClone"
                          class="tag is-dark ml-2"
                        >
                          <span class="material-symbols-outlined is-size-6">
                            genetics
                          </span>
                        </span>
                      </div>
                      <!-- Audio Player -->
                      <div
                        class="audio-container"
                        v-if="inference?.answer?.data?.audio_path"
                      >
                        <audio
                          controls
                          :src="fileUrl(inference.answer.data.audio_path)"
                          class="audio-player"
                          preload="metadata"
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

                      <button
                        class="button is-medium is-success copy is-pulled-right ml-5 mr-0 p-0 pl-1 pr-4"
                        @click="downloadAudio(inference._originalIndex)"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          save
                        </span>
                        Download
                      </button>
                      <button
                        class="button is-medium is-danger is-pulled-right ml-2 p-0 pl-1 pr-1"
                        @click="removeInference(inference._originalIndex)"
                        title="Remove this result"
                      >
                        <span class="material-symbols-outlined is-size-2">
                          delete
                        </span>
                      </button>
                      <button
                        class="button is-medium is-success copy is-pulled-left p-0 pl-1 pr-1"
                        @click="restoreFromHistory(inference)"
                        title="Restore all parameters from this generation"
                      >
                        <span class="material-symbols-outlined is-size-2">
                          content_copy
                        </span>
                      </button>
                      <button
                        class="button is-medium is-warning copy is-pulled-left ml-5 pl-2"
                        @click="openMint(inference)"
                        :disabled="!!inference.nft"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          {{ inference.nft ? "check_circle" : "token" }}
                        </span>
                        {{ inference.nft ? "Minted" : "Mint" }}
                      </button>
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
</template>

<script>
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
import MintModal from "./MintModal.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { addAudioInference } from "../stores/inferenceStore.js";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${API_BASE}/downloads`;
const WS_GEN = `${API_BASE}/generation`;

export default {
  name: "GenerativeAudio",
  components: {
    AccessRequirements,
    MintModal,
  },
  setup() {
    // ------------ NFT Minting ---------
    const mintTarget = ref(null);

    const openMint = async (inference) => {
      // Prefer MP3 for minting (smaller, universally playable)
      const mp3Path = inference.answer?.data?.audio_path_mp3;
      const wavPath = inference.answer?.data?.audio_path;
      const audioPath = mp3Path || wavPath;
      const isMp3 = !!mp3Path;
      let content = null;
      if (audioPath && window.electronAPI?.readFileAsBase64) {
        try {
          content = await window.electronAPI.readFileAsBase64(audioPath);
        } catch (e) {
          console.warn("[GenerativeAudio] Could not read audio file:", e);
        }
      }
      mintTarget.value = {
        inferenceType: "audio",
        inferenceId: inference.id,
        content,
        contentType: isMp3 ? "audio/mpeg" : "audio/wav",
        prompt: inference.question,
        generation: {
          type: inference.isMusic
            ? "music"
            : inference.hasClone
              ? "voice-clone"
              : "text-to-speech",
          model: inference.model || "kokoro",
          timestamp: inference.timestamp,
          elapsedMs: inference.elapsedMs || null,
        },
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
    const mode = ref("tts"); // 'tts', 'clone', or 'music'
    const language = ref("en");
    const exaggerationPct = ref(50); // 0-100 -> maps to 0.0-1.0

    // Music mode refs
    const musicLyrics = ref("");
    const musicDuration = ref(60);
    const musicCaption = ref("");
    const lyricsTheme = ref("");
    const musicInstrumental = ref(false);
    const musicBPM = ref(120);
    const musicKey = ref("");
    const musicTimeSignature = ref("4/4");
    const musicSteps = ref(8);
    const musicGuidance = ref(7.0);
    const musicSeed = ref(-1);
    const musicShift = ref(4.0);
    const musicQuality = ref("fast"); // "fast" (v1.5 turbo 2B) or "quality" (v1.5 XL turbo 4B)
    const musicSemantic = ref(false); // Use 5Hz LLM for semantic audio codes
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
        .filter((item) => item && item.answer?.data?.audio_path);

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
      () => displayedCount.value < inferences.value.length,
    );

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          inferences.value.length,
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
      return canGenerate.value && hasAccess.value;
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
      if (!readiness.ok || readiness.authRequired || generation.active)
        return false;
      // Clone mode requires voice reference AND transcript
      if (
        mode.value === "clone" &&
        (!synthesisBase64.value || !referenceTranscript.value.trim())
      )
        return false;
      // Music mode requires either caption or prompt
      if (
        mode.value === "music" &&
        !musicCaption.value.trim() &&
        !form.prompt.trim()
      )
        return false;
      return true;
    });

    const promptPlaceholder = computed(() => {
      if (mode.value === "music") {
        return "Quick style override (optional - use dimension selectors above for full control)...";
      }
      if (mode.value === "clone") {
        if (!synthesisBase64.value) {
          return "Upload a reference audio file first...";
        }
        if (!referenceTranscript.value.trim()) {
          return "Enter the transcript of your reference audio above...";
        }
        return `Enter text in ${languages[language.value]} to speak in the cloned voice...`;
      }
      return `Enter text in ${languages[language.value]} to convert to speech...`;
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
      if (mode.value === "music") {
        buildCaptionFromSelections();
      }
    });

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

    // Default LLM for lyrics generation — small and fast
    const LYRICS_LLM = {
      modelname: "Qwen3.5 0.8B",
      filename: "qwen3.5-0.8b-q4_k_m.gguf",
      url: "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
      filesizeBytes: 0.6e9,
      parameters: 800000000,
      context: 131072,
    };

    const ensureLLMLoaded = async () => {
      if (!window.electronAPI?.loadModel) {
        throw new Error("LLM API not available");
      }

      // Check if a model is already loaded
      const modelInfo = await window.electronAPI.getModelInfo?.();
      if (modelInfo?.loaded) {
        console.log(
          "[GenerativeAudio] LLM already loaded:",
          modelInfo.modelName || "unknown",
        );
        return;
      }

      // Load the default LLM
      console.log("[GenerativeAudio] Loading LLM for lyrics generation...");
      await window.electronAPI.loadModel(LYRICS_LLM);
      console.log("[GenerativeAudio] LLM loaded successfully");
    };

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
        // Ensure LLM is loaded before generating
        await ensureLLMLoaded();

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

CRITICAL FORMATTING RULES:
1. Use structure tags on their own line: [intro], [verse], [pre-chorus], [chorus], [bridge], [outro], [instrumental], [build], [drop], [breakdown]
2. Keep lines to 6-10 syllables each (this is crucial for the music model)
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

Remember: 6-10 syllables per line, use all appropriate structure tags. Write in ${targetLang}.`;

        const fullPrompt = `${systemPrompt}\n\n${userMsg}`;

        // Use the local LLM via Electron IPC (node-llama-cpp)
        const result = await window.electronAPI.chat(fullPrompt);

        if (result && typeof result === "string") {
          musicLyrics.value = result.trim();
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
          musicLyrics.value = params.lyrics || "";
          lyricsTheme.value = params.lyricsTheme || "";
          musicDuration.value = params.duration || 60;
          musicBPM.value = params.bpm || 120;
          musicKey.value = params.key || "";
          musicTimeSignature.value = params.timeSignature || "4/4";
          musicSteps.value = params.steps || 8;
          musicGuidance.value = params.guidance || 7.0;
          musicSeed.value = params.seed || -1;
          musicShift.value = params.shift || 4.0;
          musicQuality.value = params.quality || "fast";
          musicSemantic.value = params.semantic || false;
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
    // Use Qwen TTS for both modes (design for TTS, clone for voice cloning)
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

    const applyPipelineUpdate = (p) => {
      if (!p) return;
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
      "qwen3_tts_clone",
      "audio_quality_design",
      "qwen3_tts_design",
      "audio_quality_persona",
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
      if (!downloads.pipelineId) return;
      try {
        const { status } = await axios.post(
          `${API_BASE}/downloads/cancel/${downloads.pipelineId}`,
          {},
          { validateStatus: () => true },
        );
        if (status === 200) {
          downloads.status = "cancelled";
          downloads.active = false;
        }
      } catch {}
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
      // Check for missing GGUFs from gguf_status (legacy) or required_files (new)
      const ggufs = Array.isArray(data?.gguf_status) ? data.gguf_status : [];
      const requiredFiles = Array.isArray(data?.required_files)
        ? data.required_files
        : [];
      const missG = ggufs.filter((g) => g && g.configured && !g.exists);
      const missReq = requiredFiles.filter((f) => f && !f.ok && !f.exists);
      const allMissing = [...missG, ...missReq];
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
    const sendMessage = async (prompt) => {
      if (!prompt) return;
      if (!canGenerateWithAccess.value) return;

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
            : musicLyrics.value.trim() || undefined,
          quality: musicQuality.value,
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
          semantic: musicSemantic.value,
          offload: musicOffload.value,
          auto_download: true,
        };
      } else if (mode.value === "clone" && synthesisBase64.value) {
        // Clone mode: use reference audio with Qwen TTS clone endpoint
        payload = {
          text: prompt,
          ref_audio_base64: synthesisBase64.value,
          ref_text: referenceTranscript.value.trim(),
          language: languages[language.value] || "English",
          auto_download: true,
        };
      } else {
        // TTS mode: use voice design with Qwen TTS design endpoint
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

      const url = `${API_BASE}${endpointForMode()}`;

      // Free GPU memory: unload local LLM + clear cached Flask models
      try {
        await window.electronAPI?.unloadModel?.();
        await fetch(`${API_BASE}/memory/clear`, { method: "POST" });
      } catch (e) {
        console.warn("[GenerativeAudio] Memory clear:", e.message);
      }

      ensureGenerationSocket();
      startGeneration("audio"); // Initialize generation state
      const _genStart = Date.now();

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
          const elapsedMs = Date.now() - _genStart;
          const newInference = {
            question: prompt,
            answer: {
              status: response.status,
              data: normalizedData,
            },
            id: uuid(),
            language: language.value,
            model:
              mode.value === "music"
                ? musicQuality.value === "quality"
                  ? "ace-step-v1.5-xl-turbo"
                  : "ace-step-v1.5-turbo"
                : "qwen3-tts",
            hasClone: mode.value === "clone",
            isMusic: mode.value === "music",
            voiceGender: voiceGender.value,
            elapsedMs,
            // Store all music parameters for restoration
            ...(mode.value === "music" && {
              songName: songName.value.trim() || null,
              musicParams: {
                quality: musicQuality.value,
                caption: musicCaption.value,
                lyrics: musicLyrics.value,
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

          // Update shallowRef by replacing array (triggers reactivity)
          inferences.value = [...inferences.value, newInference];
          hasCopy.value = [...hasCopy.value, false];
          persistInferences([...inferences.value]);

          // Save to unified inference store with performance metadata
          addAudioInference(prompt, audioPath, {
            pipeline:
              mode.value === "music"
                ? "music"
                : mode.value === "clone"
                  ? "audio_quality"
                  : "audio_turbo",
            elapsed: elapsedMs / 1000,
            source: "bonzai",
          });

          form.prompt = "";
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
        const headers = {};
        const res = await axios.post(url, payload, {
          headers,
          validateStatus: () => true,
        });

        if (res.status === 202) {
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
        setError("audio", res?.data?.error, res.status);
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
      if (/^https?:\/\//i.test(p)) return p;
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

    const removeInference = async (idx) => {
      if (idx < 0 || idx >= inferences.value.length) return;
      inferences.value = inferences.value.filter((_, i) => i !== idx);
      hasCopy.value = hasCopy.value.filter((_, i) => i !== idx);
      persistInferences([...inferences.value]);
    };

    const clearHistory = async () => {
      inferences.value = [];
      hasCopy.value = [];
      try {
        await window.electronAPI?.store?.set?.("audioInferences", []);
      } catch (e) {
        console.error("Failed to clear audio inferences:", e);
      }
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
    onMounted(async () => {
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
      // Note: generation socket is shared and managed by generationStore
    });

    watch(mode, () => probeCurrentMode(), { immediate: true });

    return {
      selectedModel,
      mode,
      language,
      languages,
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
      clearHistory,
      exportHistory,
      importHistory,
      prefetchForMode,
      cancelCurrentPipeline,
      retryCurrentPipeline,
      probeCurrentMode,
      handleSynthesisFile,
      fileUrl,
      // Voice gender for TTS
      voiceGender,
      // Music mode
      musicLyrics,
      musicDuration,
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
      generateMusic,
      restoreFromHistory,
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
/* Fonts imported from App.vue for offline mode */

.generation {
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1;
  opacity: 0.9;
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
  padding: 6em;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
}
.models__activity--payouts {
  padding: 4em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}
.models__activity--payouts h2 {
  font-size: 48px;
  color: #fff;
  text-align: right;
}
h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: #fff;
  text-align: right;
}
p {
  margin-bottom: 1em;
  font-size: 24px;
  color: #fff;
  text-align: justify;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
}
div.question {
  border: 1px solid rgba(255, 255, 255, 0);
  padding: 2em 2em 5em;
  margin-top: 2em !important;
  margin-bottom: 1em !important;
  font-weight: 700;
  background-color: rgba(255, 255, 255, 0.1);
  box-shadow: none;
  border-radius: 4px;
  backdrop-filter: blur(26px);
  position: relative;
}
.audio-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.audio-player {
  width: 100%;
  height: 40px;
  border-radius: 4px;
  /* background: rgba(97, 55, 142, 0.3); */
}

.audio-player::-webkit-media-controls-panel {
  /* background: rgba(97, 55, 142, 0.5); */
}

.song-name {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 4px;
}
.audio-meta {
  top: -12px;
  right: 32px;
  position: absolute;
  display: flex;
  align-items: center;
}
.prompt-text {
  font-size: 16px !important;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
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
.input,
.textarea {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: none !important;
  transition: 200ms ease-in;
}
::placeholder {
  color: rgba(255, 255, 255, 0.1) !important;
  opacity: 1 !important;
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
input[type="radio"] {
  display: none;
}
input[type="radio"] + label {
  padding: 3px 12px 9px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}
input[type="radio"] + label.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
input[type="radio"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
}

/* Music toggle checkboxes — identical to radio selectors */
input.music-toggle[type="checkbox"] {
  display: none;
}
input.music-toggle[type="checkbox"] + label {
  padding: 3px 12px 9px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}
input.music-toggle[type="checkbox"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
}
.select.is-dark select {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  height: 48px;
  color: #fff;
}
.select.is-dark select:hover {
  border-color: rgba(255, 255, 255, 0.5);
}
.file-label {
  width: 100%;
}
.file-cta,
.file-name {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
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
  background: rgba(255, 255, 255, 0.3);
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
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
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
  color: #fff;
}
.label.has-text-white {
  color: #fff !important;
}

/* Fade-in animation for history items */
.history-item {
  animation: fadeInUp 0.4s ease-out forwards;
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
  background: rgba(97, 55, 142, 0.9);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  z-index: 100;
  animation: fadeInUp 0.3s ease-out;
}

.scroll-to-top-btn:hover {
  background: rgba(97, 55, 142, 1);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 700;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
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
  color: rgba(255, 255, 255, 0.5);
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
  background: rgba(97, 55, 142, 0.6) !important;
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
  color: rgba(255, 255, 255, 0.6);
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
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);

  /* Multi-layer 3D gradient - convex rubber pad surface */

  /* Fast tactile response */
  transition: all 0.08s cubic-bezier(0.4, 0, 0.2, 1);

  /* Deep 3D box shadow stack */
  box-shadow:
    /* Inner top-left highlight (convex surface) */
    inset 3px 3px 6px rgba(255, 255, 255, 0.12),
    /* Inner bottom-right shadow (depth) */ inset -3px -3px 8px
      rgba(0, 0, 0, 0.3),
    /* Inner top edge shine */ inset 0 2px 4px rgba(255, 255, 255, 0.08),
    /* Inner bottom shadow well */ inset 0 -4px 8px rgba(0, 0, 0, 0.2),
    /* Outer elevation shadow */ 0 4px 8px rgba(0, 0, 0, 0.35),
    /* Outer soft ambient */ 0 2px 4px rgba(0, 0, 0, 0.2),
    /* Base contact shadow */ 0 1px 2px rgba(0, 0, 0, 0.15);
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
  border-left-color: rgba(255, 255, 255, 0.1);
  border-bottom-color: rgba(0, 0, 0, 0.15);
  border-right-color: rgba(0, 0, 0, 0.1);
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
    rgba(255, 255, 255, 0.05) 0%,
    transparent 40%
  );
  pointer-events: none;
}

/* Hover - subtle lift */
.dimension-tags .tag:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow:
    inset 3px 3px 6px rgba(255, 255, 255, 0.15),
    inset -3px -3px 8px rgba(0, 0, 0, 0.25),
    inset 0 2px 4px rgba(255, 255, 255, 0.1),
    inset 0 -4px 8px rgba(0, 0, 0, 0.15),
    0 8px 16px rgba(0, 0, 0, 0.4),
    0 4px 8px rgba(0, 0, 0, 0.25),
    0 2px 4px rgba(0, 0, 0, 0.15);
}

/* Active/pressed - pushed in 3D effect */
.dimension-tags .tag:active {
  transform: translateY(2px) scale(0.96);
  box-shadow:
    /* Inverted for pressed-in look */
    inset -2px -2px 4px rgba(255, 255, 255, 0.08),
    inset 4px 4px 10px rgba(0, 0, 0, 0.4),
    inset 0 4px 8px rgba(0, 0, 0, 0.3),
    0 1px 2px rgba(0, 0, 0, 0.2);
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
  color: #fff;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.6),
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
    /* Drop shadow */ 0 4px 8px rgba(0, 0, 0, 0.3);
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
    0 8px 16px rgba(0, 0, 0, 0.35);
}

/* Mood - Ableton Gold */
.dimension-tags .tag.is-warning {
  background-color: rgba(255, 195, 0, 0.55);
  border: 1px solid rgba(255, 220, 100, 0.5);
  color: #0a0a0a;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.4);
  box-shadow:
    inset 3px 3px 8px rgba(255, 245, 180, 0.35),
    inset -3px -3px 10px rgba(160, 120, 0, 0.5),
    inset 0 2px 4px rgba(255, 250, 200, 0.2),
    inset 0 -5px 10px rgba(130, 100, 0, 0.4),
    0 0 15px rgba(255, 195, 0, 0.6),
    0 0 30px rgba(255, 195, 0, 0.4),
    0 0 45px rgba(255, 195, 0, 0.25),
    0 0 60px rgba(255, 195, 0, 0.15),
    0 4px 8px rgba(0, 0, 0, 0.3);
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
    0 8px 16px rgba(0, 0, 0, 0.35);
}

/* Instruments - Ableton Cyan */
.dimension-tags .tag.is-success {
  background-color: rgba(0, 210, 211, 0.55);
  border: 1px solid rgba(100, 240, 240, 0.5);
  color: #fff;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.6),
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
    0 4px 8px rgba(0, 0, 0, 0.3);
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
    0 8px 16px rgba(0, 0, 0, 0.35);
}

/* Vocals - Ableton Pink */
.dimension-tags .tag.is-link {
  background-color: rgba(255, 100, 177, 0.55);
  border: 1px solid rgba(255, 160, 210, 0.5);
  color: #fff;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.6),
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
    0 4px 8px rgba(0, 0, 0, 0.3);
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
    0 8px 16px rgba(0, 0, 0, 0.35);
}

/* Production - Ableton Purple */
.dimension-tags .tag.is-primary {
  background-color: rgba(155, 89, 182, 0.55);
  border: 1px solid rgba(195, 150, 215, 0.5);
  color: #fff;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.6),
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
    0 4px 8px rgba(0, 0, 0, 0.3);
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
    0 8px 16px rgba(0, 0, 0, 0.35);
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
  color: rgba(255, 255, 255, 0.7);
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
  color: rgba(255, 255, 255, 0.9);
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
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
}

.param-control .input {
  font-size: 12px;
  padding: 4px 8px;
  height: 28px;
  background: rgba(50, 50, 50, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  width: 100%;
}

.param-help {
  font-size: 10px !important;
  color: rgba(255, 255, 255, 0.4) !important;
  margin: 0 !important;
  text-align: left !important;
}

.advanced-params {
  padding-top: 1rem;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}

/* Small textarea and input overrides for music mode */
.music-section .textarea.is-small {
  font-size: 13px;
  background: rgba(50, 50, 50, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  resize: vertical;
}

.music-section .input.is-small {
  font-size: 13px;
  background: rgba(50, 50, 50, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  padding-right: 80px; /* Space for the generate button */
}

.music-section .textarea.is-small::placeholder,
.music-section .input.is-small::placeholder {
  color: rgba(255, 255, 255, 0.3) !important;
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
  color: rgba(255, 255, 255, 0.6);
  padding: 0;
}

.button.is-ghost:hover {
  color: rgba(255, 255, 255, 0.9);
  background: transparent;
}

.button.is-ghost .material-symbols-outlined {
  border: none;
}
</style>
