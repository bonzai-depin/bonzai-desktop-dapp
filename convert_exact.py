#!/usr/bin/env python3
"""
Careful Bulma → BZ conversion using exact text from the file.
"""
path = "/Users/wilhempujar/Development/bonzai-desktop-dapp/src/components/GenerativeAudio.vue"
with open(path, "r") as f:
    content = f.read()

original = content
changes = 0

def rep(old, new, label):
    global content, changes
    if old in content:
        content = content.replace(old, new)
        changes += 1
        print(f"OK: {label}")
    else:
        print(f"MISS: {label}")

# ── 1. Top structure ────────────────────────────────────────────────────────
rep(
    '''    <div class="models__deployment-install">
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
          </div>''',
    '''    <div class="bz-audio-workspace">
      <div class="bz-audio__head">
        <div>
          <span class="bz-eyebrow">Generate</span>
          <h1 class="bz-h1">
            <span class="material-symbols-outlined" style="font-size:28px!important;color:var(--bz-purple-300)">graphic_eq</span>
            Generative Audio
          </h1>
        </div>
      </div>''',
    "top structure"
)

# ── 2. Generation progress ──────────────────────────────────────────────────
rep(
    '''          <!-- GENERATION PROGRESS -->
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
          </div>''',
    '''          <!-- GENERATION PROGRESS -->
          <div v-if="generation.active" class="bz-genprogress">
            <div class="bz-genprogress__row">
              <span class="bz-shout bz-genprogress__label">Synthesising…</span>
              <span class="bz-mono bz-genprogress__pct">{{ Math.round(generation.pct) }}%</span>
            </div>
            <BonzaiPulse variant="bar" :percent="Math.max(0, Math.min(100, generation.pct))" />
          </div>''',
    "generation progress"
)

# ── 3. Inner wrapper ────────────────────────────────────────────────────────
rep(
    '''          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">''',
    '''          <div class="bz-audio__card">''',
    "inner wrapper"
)

# ── 4. Mode toggles ─────────────────────────────────────────────────────────
rep(
    '''                <!-- MODE TOGGLES (TTS vs Clone) -->
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
                </div>''',
    '''                <!-- MODE TOGGLES (TTS vs Clone vs Music) -->
                <ModeChipBar
                  v-model="mode"
                  :items="[
                    { value: 'tts', label: 'Text to Speech', icon: 'record_voice_over' },
                    { value: 'clone', label: 'Voice Clone', icon: 'genetics' },
                    { value: 'music', label: 'Music', icon: 'music_note' },
                  ]"
                />

                <!-- LANGUAGE SELECTOR (hidden for music mode) -->
                <div v-if="mode !== 'music'" class="bz-audio__lang-select">
                  <select v-model="language">
                    <option v-for="(name, code) in languages" :key="code" :value="code">
                      {{ languageFlags[code] }} {{ name }}
                    </option>
                  </select>
                </div>''',
    "mode toggles"
)

# ── 5. Voice gender ─────────────────────────────────────────────────────────
rep(
    '''                <!-- VOICE GENDER SELECTOR (TTS mode only) -->
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
                </div>''',
    '''                <!-- VOICE GENDER SELECTOR (TTS mode only) -->
                <div v-if="mode === 'tts'" class="bz-audio__modes">
                  <span class="bz-eyebrow" style="margin-right:8px">Voice</span>
                  <ModeChipBar
                    v-model="voiceGender"
                    :items="[
                      { value: 'female', label: 'Female', icon: 'female' },
                      { value: 'male', label: 'Male', icon: 'male' },
                    ]"
                    compact
                  />
                </div>''',
    "voice gender"
)

# ── 6. AccessRequirements mt-5 ──────────────────────────────────────────────
rep(
    '''                <AccessRequirements
                  ref="accessRef"
                  level="LVL2"
                  @access-changed="onAccessChanged"
                  class="mt-5"
                />''',
    '''                <AccessRequirements
                  ref="accessRef"
                  level="LVL2"
                  @access-changed="onAccessChanged"
                  style="margin-top: 1.25rem;"
                />''',
    "access mt-5"
)

# ── 7. Music mode mb-4 wrapper ──────────────────────────────────────────────
rep(
    '''                <div v-if="mode === 'music'" class="mb-4">''',
    '''                <div v-if="mode === 'music'" style="margin-bottom: 1rem;">''',
    "music mb-4"
)

# ── 8. Orphan button fragment ───────────────────────────────────────────────
rep(
    '''                        </button>
                            class="material-symbols-outlined mr-1"
                            style="font-size: 16px"
                          >
                            auto_awesome
                          </span>
                          <span>Generate</span>
                        </button>''',
    '''                        </button>''',
    "orphan button"
)

# ── 9. Song Concept field ───────────────────────────────────────────────────
rep(
    '''                    <!-- Lyrics Theme Input (for LLM generation) -->
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
                            >''',
    '''                    <!-- Lyrics Theme Input (for LLM generation) -->
                    <div style="text-align: left;">
                      <label
                        class="fira-sans-condensed-black-italic"
                        style="color: white; font-size: 2rem;"
                      >
                        Song Concept
                      </label>
                      <div class="lyrics-gen-row" style="margin-top: 0.75rem;">
                        <input
                          class="input"
                          type="text"
                          v-model="lyricsTheme"
                          placeholder="e.g. summer road trip"
                          @keyup.enter="generateLyrics"
                        />

                        <div
                          class="vocal-lang-row"
                          style="display: flex; align-items: center; gap: 8px; margin-left: auto;"
                        >
                          <select
                            v-model="musicVocalLanguage"
                            style="height: 50px; background: var(--bz-border); color: var(--bz-fg); border: 1px solid var(--bz-fg-faint); padding: 0 8px; border-radius: 4px;"
                          >''',
    "song concept"
)

# ── 10. Close language row ──────────────────────────────────────────────────
rep(
    '''                            </select>
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
                          class="bz-btn bz-btn--ghost"
                          :disabled="isGeneratingLyrics || !lyricsTheme.trim() || !lyricsModelReady"
                          @click.prevent="generateLyrics"
                          :title="
                            !lyricsModelReady
                              ? 'Download Qwen3.5 4B from the Chat tab first'
                              : 'Generate lyrics using Qwen3.5 4B'
                          "
                        >
                          <span class="material-symbols-outlined">auto_fix</span>
                          <span v-if="!isGeneratingLyrics">Generate</span>
                          <span v-else>Generating…</span>
                        </button>
                      </div>
                      <p v-if="lyricsError" class="help is-danger mt-2">
                        {{ lyricsError }}
                      </p>
                    </div>''',
    '''                            </select>
                          <input
                            v-if="musicVocalLanguage === 'other'"
                            class="input custom-language-input"
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
                          class="bz-btn bz-btn--ghost"
                          :disabled="isGeneratingLyrics || !lyricsTheme.trim() || !lyricsModelReady"
                          @click.prevent="generateLyrics"
                          :title="
                            !lyricsModelReady
                              ? 'Download Qwen3.5 4B from the Chat tab first'
                              : 'Generate lyrics using Qwen3.5 4B'
                          "
                        >
                          <span class="material-symbols-outlined">auto_fix</span>
                          <span v-if="!isGeneratingLyrics">Generate</span>
                          <span v-else>Generating…</span>
                        </button>
                      </div>
                      <p v-if="lyricsError" class="bz-notice bz-notice--danger" style="font-size: 0.85rem; margin-top: 0.5rem;">
                        {{ lyricsError }}
                      </p>
                    </div>''',
    "close song concept"
)

# ── 11. Lyrics textarea section ─────────────────────────────────────────────
rep(
    '''                    <!-- Lyrics Textarea -->
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
                          placeholder="[intro]\n(instrumental)\n\n[verse]\nWalking through the city lights\nEverything feels so alive tonight\nStars above are shining bright\n\n[chorus]\nWe're on fire, burning bright\nDancing through the neon night\nNothing's gonna stop us now\n\n[bridge]\nWhen the world falls down around us\nWe'll rise up from the ground\n\n[outro]\n(fade out)"
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
                    </div>''',
    '''                    <!-- Lyrics Textarea -->
                    <div style="margin-top: 0.5rem; text-align: left;">
                      <label
                        class="fira-sans-condensed-black-italic"
                        style="color: white; font-size: 2rem;"
                      >
                        Lyrics
                      </label>
                      <div style="margin-top: 0.75rem;">
                        <textarea
                          class="textarea"
                          v-model="musicLyrics"
                          placeholder="[intro]\n(instrumental)\n\n[verse]\nWalking through the city lights\nEverything feels so alive tonight\nStars above are shining bright\n\n[chorus]\nWe're on fire, burning bright\nDancing through the neon night\nNothing's gonna stop us now\n\n[bridge]\nWhen the world falls down around us\nWe'll rise up from the ground\n\n[outro]\n(fade out)"
                          rows="8"
                        ></textarea>
                      </div>
                      <div class="structure-tags-help" style="margin-top: 0.5rem;">
                        <span class="help-label">Structure Tags:</span>
                        <span
                          class="bz-tag bz-tag--clickable"
                          style="margin-right: 4px;"
                          @click="insertTag('[intro]')"
                        >
                          [intro]
                        </span>
                        <span
                          class="bz-tag bz-tag--clickable"
                          style="margin-right: 4px;"
                          @click="insertTag('[verse]')"
                        >
                          [verse]
                        </span>
                        <span
                          class="bz-tag bz-tag--clickable"
                          style="margin-right: 4px;"
                          @click="insertTag('[chorus]')"
                        >
                          [chorus]
                        </span>
                        <span
                          class="bz-tag bz-tag--clickable"
                          style="margin-right: 4px;"
                          @click="insertTag('[bridge]')"
                        >
                          [bridge]
                        </span>
                        <span
                          class="bz-tag bz-tag--clickable"
                          style="margin-right: 4px;"
                          @click="insertTag('[outro]')"
                        >
                          [outro]
                        </span>
                        <span
                          class="bz-tag bz-tag--clickable"
                          style="margin-right: 4px;"
                          @click="insertTag('[instrumental]')"
                        >
                          [instrumental]
                        </span>
                        <span
                          class="bz-tag bz-tag--clickable"
                          style="margin-right: 4px;"
                          @click="insertTag('[build]')"
                        >
                          [build]
                        </span>
                        <span
                          class="bz-tag bz-tag--clickable"
                          style="margin-right: 4px;"
                          @click="insertTag('[drop]')"
                        >
                          [drop]
                        </span>
                        <span
                          class="bz-tag bz-tag--clickable"
                          @click="insertTag('[breakdown]')"
                        >
                          [breakdown]
                        </span>
                      </div>
                    </div>''',
    "lyrics textarea"
)

# ── 12. Generation Settings section header ──────────────────────────────────
rep(
    '''                  <div class="music-section mt-4 has-text-left">
                    <label
                      class="has-text-white fira-sans-condensed-black-italic is-size-3"
                    >
                      Generation Settings
                    </label>
                    <!-- Basic Parameters (always visible) -->
                    <div class="params-grid mt-5">''',
    '''                  <div class="music-section" style="margin-top: 1rem; text-align: left;">
                    <label
                      class="fira-sans-condensed-black-italic"
                      style="color: white; font-size: 2rem;"
                    >
                      Generation Settings
                    </label>
                    <!-- Basic Parameters (always visible) -->
                    <div class="params-grid" style="margin-top: 1.25rem;">''',
    "gen settings header"
)

# ── 13. Param values is-size-3 → inline ─────────────────────────────────────
rep(
    '''                          <span
                            class="param-value fira-sans-condensed-black-italic is-size-3"
                            style="text-transform: none"
                          >
                            {{ musicDuration }}s''',
    '''                          <span
                            class="param-value fira-sans-condensed-black-italic"
                            style="text-transform: none; font-size: 2rem;"
                          >
                            {{ musicDuration }}s''',
    "duration value"
)
rep(
    '''                          <span
                            class="param-value fira-sans-condensed-black-italic is-size-3"
                            style="text-transform: none"
                          >
                            {{ musicBPM }}''',
    '''                          <span
                            class="param-value fira-sans-condensed-black-italic"
                            style="text-transform: none; font-size: 2rem;"
                          >
                            {{ musicBPM }}''',
    "bpm value"
)

# ── 14. Key select ──────────────────────────────────────────────────────────
rep(
    '''                        <div class="param-control select-control">
                          <select
                            v-model="musicKey"
                            class="select is-small is-dark"
                          >''',
    '''                        <div class="param-control select-control">
                          <select
                            v-model="musicKey"
                            style="background: rgba(50,50,50,0.6); border: 1px solid var(--bz-border-strong); color: var(--bz-fg); padding: 4px 8px; height: 28px; font-size: 12px; width: 100%; border-radius: 4px;"
                          >''',
    "key select"
)

# ── 15. Time signature select ───────────────────────────────────────────────
rep(
    '''                        <div class="param-control select-control">
                          <select
                            v-model="musicTimeSignature"
                            class="select is-small is-dark"
                          >''',
    '''                        <div class="param-control select-control">
                          <select
                            v-model="musicTimeSignature"
                            style="background: rgba(50,50,50,0.6); border: 1px solid var(--bz-border-strong); color: var(--bz-fg); padding: 4px 8px; height: 28px; font-size: 12px; width: 100%; border-radius: 4px;"
                          >''',
    "time sig select"
)

# ── 16. Advanced params mt-3 ────────────────────────────────────────────────
rep(
    '''                    <!-- Advanced Parameters -->
                    <div class="params-grid mt-3 advanced-params">''',
    '''                    <!-- Advanced Parameters -->
                    <div class="params-grid advanced-params" style="margin-top: 0.75rem;">''',
    "advanced params"
)

# ── 17. Seed input ──────────────────────────────────────────────────────────
rep(
    '''                          <input
                            type="number"
                            v-model.number="musicSeed"
                            min="-1"
                            class="input is-small"
                            placeholder="-1 for random"
                          />''',
    '''                          <input
                            type="number"
                            v-model.number="musicSeed"
                            min="-1"
                            class="input"
                            placeholder="-1 for random"
                            style="font-size: 12px; padding: 4px 8px; height: 28px; background: rgba(50,50,50,0.6); border: 1px solid var(--bz-border-strong); color: var(--bz-fg); width: 100%; border-radius: 4px;"
                          />''',
    "seed input"
)

# ── 18. param-label mb-2 ────────────────────────────────────────────────────
rep('class="param-label mb-2"', 'class="param-label" style="margin-bottom: 0.5rem;"', "param-label mb-2")

# ── 19. Dimension headers ───────────────────────────────────────────────────
for dim in ['Genre', 'Mood', 'Instruments', 'Vocals', 'Production']:
    rep(
        f'''                      <h3
                        class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left"
                      >
                        {dim}
                      </h3>''',
        f'''                      <h3
                        class="fira-sans-condensed-black-italic"
                        style="font-size: 2rem; color: white; text-align: left;"
                      >
                        {dim}
                      </h3>''',
        f"dim header {dim}"
    )

# ── 20. Dimension tags (Genre) ──────────────────────────────────────────────
rep(
    '''                          <span
                            v-for="g in genreOptions"
                            :key="g"
                            class="tag is-small is-clickable"
                            :class="
                              selectedGenres.includes(g) ? 'is-info' : 'is-dark'
                            "
                            @click="toggleDimension('genre', g)"
                          >
                            {{ g }}
                          </span>''',
    '''                          <span
                            v-for="g in genreOptions"
                            :key="g"
                            class="bz-tag"
                            :class="
                              selectedGenres.includes(g) ? 'bz-tag--info' : ''
                            "
                            @click="toggleDimension('genre', g)"
                          >
                            {{ g }}
                          </span>''',
    "genre tags"
)

# ── 21. Dimension tags (Mood) ───────────────────────────────────────────────
rep(
    '''                          <span
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
                          </span>''',
    '''                          <span
                            v-for="m in moodOptions"
                            :key="m"
                            class="bz-tag"
                            :class="
                              selectedMoods.includes(m) ? 'bz-tag--warning' : ''
                            "
                            @click="toggleDimension('mood', m)"
                          >
                            {{ m }}
                          </span>''',
    "mood tags"
)

# ── 22. Dimension tags (Instruments) ────────────────────────────────────────
rep(
    '''                          <span
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
                          </span>''',
    '''                          <span
                            v-for="i in instrumentOptions"
                            :key="i"
                            class="bz-tag"
                            :class="
                              selectedInstruments.includes(i) ? 'bz-tag--success' : ''
                            "
                            @click="toggleDimension('instrument', i)"
                          >
                            {{ i }}
                          </span>''',
    "instrument tags"
)

# ── 23. Dimension tags (Vocals) ─────────────────────────────────────────────
rep(
    '''                          <span
                            v-for="v in vocalOptions"
                            :key="v"
                            class="tag is-small is-clickable"
                            :class="
                              selectedVocals.includes(v) ? 'is-link' : 'is-dark'
                            "
                            @click="toggleDimension('vocal', v)"
                          >
                            {{ v }}
                          </span>''',
    '''                          <span
                            v-for="v in vocalOptions"
                            :key="v"
                            class="bz-tag"
                            :class="
                              selectedVocals.includes(v) ? 'bz-tag--primary' : ''
                            "
                            @click="toggleDimension('vocal', v)"
                          >
                            {{ v }}
                          </span>''',
    "vocal tags"
)

# ── 24. Dimension tags (Production) ─────────────────────────────────────────
rep(
    '''                          <span
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
                          </span>''',
    '''                          <span
                            v-for="p in productionOptions"
                            :key="p"
                            class="bz-tag"
                            :class="
                              selectedProduction.includes(p) ? 'bz-tag--accent' : ''
                            "
                            @click="toggleDimension('production', p)"
                          >
                            {{ p }}
                          </span>''',
    "production tags"
)

# ── 25. Ready? section ──────────────────────────────────────────────────────
rep(
    '''                  <div
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
                  </div>''',
    '''                  <div
                    class="music-section models__activity--payouts"
                    style="margin-top: 1rem; text-align: left;"
                  >
                    <span
                      class="fira-sans-condensed-black-italic"
                      style="width: auto !important; background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text; -webkit-text-fill-color: transparent; font-size: 3rem;"
                    >
                      Ready ?
                    </span>
                    <div style="margin-top: 1.25rem;">
                      <textarea
                        class="textarea"
                        v-model="musicCaption"
                        placeholder="pop rock, energetic, electric guitar, drums, male vocals, polished production, 120 BPM"
                        rows="2"
                        style="resize: none"
                      ></textarea>
                    </div>
                  </div>''',
    "ready section"
)

# ── 26. Generate row (open) ─────────────────────────────────────────────────
rep(
    '''                  <!-- Generate Button & Semantic Toggle -->
                  <div
                    class="music-section mt-4 models__activity--payouts generate-row"
                  >
                    <div class="select is-dark">
                      <select
                        v-model="musicQuality"
                        style="height: 52px; position: relative; top: -6px"
                      >''',
    '''                  <!-- Generate Button & Semantic Toggle -->
                  <div
                    class="music-section models__activity--payouts generate-row"
                    style="margin-top: 1rem;"
                  >
                    <select
                      v-model="musicQuality"
                      style="height: 52px; position: relative; top: -6px; background: var(--bz-border); border: 1px solid var(--bz-fg-faint); color: var(--bz-fg); padding: 0 8px; border-radius: 4px;"
                    >''',
    "generate row open"
)

# ── 27. Generate row (close select) ─────────────────────────────────────────
rep(
    '''                        <option value="quality">Quality (v1.5 XL)</option>
                      </select>
                    </div>''',
    '''                        <option value="quality">Quality (v1.5 XL)</option>
                    </select>''',
    "generate row close"
)

# ── 28. Save Memory label mr-2 ──────────────────────────────────────────────
rep(
    '''                    <label for="music_offload" class="mr-2">''',
    '''                    <label for="music_offload" style="margin-right: 0.5rem;">''',
    "save memory mr-2"
)

# ── 29. Voice clone file input ──────────────────────────────────────────────
rep(
    '''                <div v-if="mode === 'clone'">
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
                </div>''',
    '''                <div v-if="mode === 'clone'">
                  <div style="margin-bottom: 0.75rem;">
                    <label style="display: flex; align-items: center; gap: 8px; width: 100%; cursor: pointer; background: var(--bz-border); border: 1px solid var(--bz-fg-faint); padding: 12px; border-radius: 4px;">
                      <input
                        type="file"
                        accept="audio/*"
                        @change="handleSynthesisFile"
                        style="display: none;"
                      />
                      <span class="material-symbols-outlined">upload_file</span>
                      <span style="flex: 1;">{{ synthesisFileName || "Reference Voice (5-10s)" }}</span>
                    </label>
                  </div>
                  <!-- Reference Transcript Input -->
                  <div v-if="synthesisBase64" style="text-align: left;">
                    <label style="color: white; font-size: 1rem; display: block; margin-bottom: 0.5rem;">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 18px; vertical-align: middle; margin-right: 4px;"
                      >
                        subtitles
                      </span>
                      Reference Transcript
                      <span style="color: var(--bz-fg-low); font-size: 0.75rem; margin-left: 0.5rem;">
                        (type exactly what is said in the audio)
                      </span>
                    </label>
                    <div>
                      <textarea
                        class="textarea"
                        v-model="referenceTranscript"
                        placeholder="Enter the exact words spoken in your reference audio..."
                        rows="2"
                      ></textarea>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--bz-fg-low); margin-top: 0.5rem;">
                      For best results, provide an accurate transcription of
                      your reference audio.
                    </p>
                  </div>
                </div>''',
    "clone file input"
)

# ── 30. Remove duplicate GENERATION ERROR / DOWNLOAD blocks ──────────────────
rep(
    '''                <!-- GENERATION ERROR -->
                <div
                  v-else-if="generation.error"
                  class="bz-notice bz-notice--danger"
                  style="margin-bottom: 1rem"
                >
                  <span class="bz-notice__icon"><span class="material-symbols-outlined">error</span></span>
                  <div class="bz-notice__body">
                    <p class="bz-notice__title">Generation failed</p>
                    <p class="bz-notice__text">{{ generation.error }}</p>
                  </div>
                </div>

                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads && downloads.active"
                  class="bz-notice bz-notice--info"
                  style="margin-bottom: 1.25rem"
                >
                  <span class="bz-notice__icon"><span class="material-symbols-outlined">warning</span></span>
                  <div class="bz-notice__body">
                    <p class="bz-notice__title">Download Required</p>
                    <p class="bz-notice__text">Required files missing for this mode.</p>
                  </div>
                </div>

                <!-- GENERATION ERROR -->
                <div
                  v-else-if="generation.error"
                  class="bz-notice bz-notice--danger"
                  style="margin-bottom: 1rem"
                >
                  <span class="bz-notice__icon"><span class="material-symbols-outlined">error</span></span>
                  <div class="bz-notice__body">
                    <p class="bz-notice__title">Generation failed</p>
                    <p class="bz-notice__text">{{ generation.error }}</p>
                  </div>
                </div>

                <!-- DOWNLOAD PROGRESS -->''',
    '''                <!-- DOWNLOAD PROGRESS -->''',
    "duplicate blocks"
)

# ── 31. HR mt-5 ─────────────────────────────────────────────────────────────
rep('''                <hr class="mt-5" />''', '''                <hr style="margin-top: 1.25rem;" />''', "hr mt-5")

# ── 32. History header ──────────────────────────────────────────────────────
rep(
    '''                <div class="level pt-5 mt-5">
                  <div class="level-left">
                    <div class="level-item">
                      <h2 class="fira-sans-condensed-black-italic">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 36px"
                        >
                          history
                        </span>
                        Generation History
                      </h2>
                    </div>
                  </div>
                  <div class="level-right">
                    <div class="level-item">
                      <button
                        type="button"
                        class="button is-info is-small mr-2"
                        @click="importHistory()"
                      >
                        <span class="material-symbols-outlined">upload</span>
                        Import
                      </button>
                      <button
                        type="button"
                        class="button is-success is-small mr-2"
                        @click="exportHistory()"
                        :disabled="inferences.length === 0"
                      >
                        <span class="material-symbols-outlined">download</span>
                        Export
                      </button>
                      <button
                        type="button"
                        class="button is-small"
                        @click="clearHistory()"
                      >
                        <span class="material-symbols-outlined">ink_eraser</span>
                        Clear
                      </button>
                    </div>
                  </div>
                </div>''',
    '''                <!-- GENERATION HISTORY HEADER -->
                <div class="bz-audio__history-head">
                  <h2 class="fira-sans-condensed-black-italic">
                    <span class="material-symbols-outlined" style="font-size: 28px">
                      history
                    </span>
                    Generation History
                  </h2>
                  <div class="bz-audio__history-actions">
                    <button
                      type="button"
                      class="bz-btn bz-btn--ghost bz-btn--sm"
                      @click="importHistory()"
                    >
                      <span class="material-symbols-outlined">upload</span>
                      Import
                    </button>
                    <button
                      type="button"
                      class="bz-btn bz-btn--ghost bz-btn--sm"
                      @click="exportHistory()"
                      :disabled="inferences.length === 0"
                    >
                      <span class="material-symbols-outlined">download</span>
                      Export
                    </button>
                    <button
                      type="button"
                      class="bz-btn bz-btn--ghost bz-btn--sm"
                      @click="clearHistory()"
                    >
                      <span class="material-symbols-outlined">ink_eraser</span>
                      Clear
                    </button>
                  </div>
                </div>''',
    "history header"
)

# ── 33. Download progress ───────────────────────────────────────────────────
rep(
    '''                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads && downloads.active"
                  class="bz-notice bz-notice--info"
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
                </div>''',
    '''                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads && downloads.active"
                  class="bz-notice bz-notice--info"
                  style="margin-bottom: 1.25rem"
                >
                  <p style="margin-bottom: 0.5rem;">
                    <span class="fira-sans-condensed-black-italic" style="font-size: 1.5rem;">
                      Downloading
                      <span class="material-symbols-outlined" style="vertical-align: middle; animation: spin 1s linear infinite;">refresh</span>
                    </span>
                    <span
                      class="fira-sans-condensed-black-italic"
                      style="float: right; font-size: 3rem;"
                    >
                      {{ Math.round(downloads.total_progress || 0) }}%
                    </span>
                  </p>
                  <progress
                    :value="downloads.progress || 0"
                    max="100"
                    style="width: 100%; height: 12px; border-radius: 4px; accent-color: var(--bz-emerald-500);"
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
                        style="text-transform: lowercase; font-size: 0.75rem; display: flex; justify-content: space-between;"
                      >
                        <div style="text-align: left;">
                          <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">
                            deployed_code
                          </span>
                          {{ t.filename }} —
                          <span class="fira-sans-condensed-black-italic">
                            {{ t.status }}
                          </span>
                        </div>
                        <div
                          class="fira-sans-condensed-black-italic"
                          style="text-align: right; min-width: 50px;"
                        >
                          {{ Math.round(t.progress || 0) }}%
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>''',
    "download progress"
)

# ── 34. Prompt text mt-3 ────────────────────────────────────────────────────
rep('<p class="prompt-text mt-3">', '<p class="prompt-text" style="margin-top: 0.75rem;">', "prompt mt-3")

# ── 35. Balance wrappers ────────────────────────────────────────────────────
# Remove 4 excess closing divs (2 from outer columns/column, 2 from inner)
# Need to find a tail pattern with 6 </div>s and reduce to 3 or 4
# Try removing </div></div></div> </div> patterns

# First try: the closing of column/columns/activity at the end of inner content
rep(
    '''              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Mint Modal -->''',
    '''          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Mint Modal -->''',
    "tail balance"
)

# ── 36. Component imports ───────────────────────────────────────────────────
# Add ModeChipBar import
if 'import ModeChipBar' not in content:
    rep(
        '''import GenerativeInput from "./generative/GenerativeInput.vue";''',
        '''import GenerativeInput from "./generative/GenerativeInput.vue";
import ModeChipBar from "./generative/ModeChipBar.vue";''',
        "ModeChipBar import"
    )
# Register ModeChipBar
if 'ModeChipBar,' not in content:
    rep(
        '''  components: {
    AccessRequirements,
    MintModal,
    GenerativeActions,
    GenerativeInput,
    BonzaiPulse,
  },''',
        '''  components: {
    AccessRequirements,
    MintModal,
    GenerativeActions,
    GenerativeInput,
    ModeChipBar,
    BonzaiPulse,
  },''',
        "ModeChipBar register"
    )

print(f"\nTotal replacements: {changes}")

# ── Write ───────────────────────────────────────────────────────────────────
with open(path, "w") as f:
    f.write(content)

# ── Verify ──────────────────────────────────────────────────────────────────
template_end = content.find("<script>")
template_part = content[:template_end]

bulma_checks = ['class="field', 'class="control ', 'class="input is-', 'class="textarea is-',
                'class="select is-', 'class="tag is-', 'class="button is-', 'class="help is-',
                'class="mt-', 'class="mb-', 'class="ml-', 'class="mr-', 'class="p-',
                'class="has-text-', 'class="is-size-', 'class="is-pulled-right',
                'class="is-expanded', 'class="columns"', 'class="column is-',
                'class="level ', 'class="level-left', 'class="level-right',
                'class="notification is-', 'class="progress is-', 'class="radio',
                'class="file-', 'class="label has-text-white', 'class="has-text-grey']
remaining = [c for c in bulma_checks if c in template_part]
print(f"\nRemaining Bulma: {remaining if remaining else 'NONE'}")

opens = template_part.count("<div")
closes = template_part.count("</div>")
print(f"Div balance: {opens} opens, {closes} closes, diff={opens-closes}")
