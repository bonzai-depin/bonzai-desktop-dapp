#!/usr/bin/env python3
"""
Careful Bulma → BZ conversion for GenerativeAudio.vue using exact file reads.
"""
import re

path = "/Users/wilhempujar/Development/bonzai-desktop-dapp/src/components/GenerativeAudio.vue"
with open(path, "r") as f:
    content = f.read()

original = content
changes = 0

def rep(old, new, label):
    global content, changes
    if old in content:
        content = content.replace(old, new, 1)
        changes += 1
        print(f"  OK: {label}")
        return True
    else:
        print(f"  MISS: {label}")
        return False

# ── 1. TOP STRUCTURE ─────────────────────────────────────────────────────────
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

# ── 2. GENERATION PROGRESS (Bulma notification) ───────────────────────────────
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

# ── 3. INNER WRAPPER (models__activity--payouts + columns + column is-12) ────
rep(
    '''          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">''',
    '''          <div class="bz-audio__card">''',
    "inner wrapper"
)

# ── 4. MODE TOGGLES (radio buttons + language select wrapper) ─────────────────
# The inner replacement replaces the radio-based toggle + language select div
# with ModeChipBar + bz-audio__lang-select
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

# ── 5. VOICE GENDER SELECTOR ──────────────────────────────────────────────────
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

# ── 6. ACCESS REQUIREMENTS mt-5 ───────────────────────────────────────────────
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

# ── 7. MUSIC MODE mb-4 ────────────────────────────────────────────────────────
rep(
    '''                <div v-if="mode === 'music'" class="mb-4">''',
    '''                <div v-if="mode === 'music'" style="margin-bottom: 1rem;">''',
    "music mb-4"
)

# ── 8. LYRICS THEME INPUT (Song Concept) ──────────────────────────────────────
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

# ── 8b. CLOSE SONG CONCEPT (strip select wrapper, fix error) ─────────────────
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

# ── 9. LYRICS TEXTAREA (strip field/control/is-small, convert tags) ───────────
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

# ── 10. GENERATION SETTINGS SECTION ───────────────────────────────────────────
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
    "gen settings"
)

# ── 11. PARAM VALUES (is-size-3 → inline) ─────────────────────────────────────
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

# ── 12. KEY SELECT (strip Bulma wrapper/classes) ──────────────────────────────
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

# ── 13. TIME SIGNATURE SELECT ─────────────────────────────────────────────────
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

# ── 14. ADVANCED PARAMS mt-3 ──────────────────────────────────────────────────
rep(
    '''                    <!-- Advanced Parameters -->
                    <div class="params-grid mt-3 advanced-params">''',
    '''                    <!-- Advanced Parameters -->
                    <div class="params-grid advanced-params" style="margin-top: 0.75rem;">''',
    "advanced params"
)

# ── 15. SEED INPUT (strip is-small) ───────────────────────────────────────────
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

# ── 16. param-label mb-2 ──────────────────────────────────────────────────────
rep('class="param-label mb-2"', 'class="param-label" style="margin-bottom: 0.5rem;"', "param-label mb-2")

# ── 17. DIMENSION SELECTOR HEADERS ────────────────────────────────────────────
for dim_name in ['Genre', 'Mood', 'Instruments', 'Vocals', 'Production']:
    rep(
        f'''                      <h3
                        class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left"
                      >
                        {dim_name}
                      </h3>''',
        f'''                      <h3
                        class="fira-sans-condensed-black-italic"
                        style="font-size: 2rem; color: white; text-align: left;"
                      >
                        {dim_name}
                      </h3>''',
        f"dim header {dim_name}"
    )

# ── 18. DIMENSION TAGS GENRE ──────────────────────────────────────────────────
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

# ── 19. DIMENSION TAGS MOOD ───────────────────────────────────────────────────
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

# ── 20. DIMENSION TAGS INSTRUMENTS ────────────────────────────────────────────
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

# ── 21. DIMENSION TAGS VOCALS ─────────────────────────────────────────────────
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

# ── 22. DIMENSION TAGS PRODUCTION ─────────────────────────────────────────────
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

# ── 23. READY? SECTION ────────────────────────────────────────────────────────
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

# ── 24. GENERATE ROW (open) ───────────────────────────────────────────────────
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

# ── 25. GENERATE ROW (close select wrapper) ───────────────────────────────────
rep(
    '''                        <option value="quality">Quality (v1.5 XL)</option>
                      </select>
                    </div>''',
    '''                        <option value="quality">Quality (v1.5 XL)</option>
                    </select>''',
    "generate row close"
)

# ── 26. SAVE MEMORY LABEL mr-2 ────────────────────────────────────────────────
rep(
    '''                    <label for="music_offload" class="mr-2">''',
    '''                    <label for="music_offload" style="margin-right: 0.5rem;">''',
    "save memory mr-2"
)

# ── 27. VOICE CLONE FILE INPUT ────────────────────────────────────────────────
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

# ── 28. REMOVE DUPLICATE GENERATION ERROR / DOWNLOAD BLOCKS ───────────────────
rep(
    '''                <!-- GENERATION ERROR -->
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
                >''',
    '''                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads && downloads.active"
                  class="bz-notice bz-notice--info"
                  style="margin-bottom: 1.25rem"
                >''',
    "convert download progress open"
)

# ── 29. DOWNLOAD PROGRESS INTERIOR ────────────────────────────────────────────
rep(
    '''                  <p class="mb-2">
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
    '''                  <p style="margin-bottom: 0.5rem;">
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
    "download progress interior"
)

# ── 30. HR mt-5 ───────────────────────────────────────────────────────────────
rep('''                <hr class="mt-5" />''', '''                <hr style="margin-top: 1.25rem;" />''', "hr mt-5")

# ── 31. HISTORY HEADER (level → bz-audio__history-head) ───────────────────────
rep(
    '''                <div class="level pt-5 mt-5">
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

# ── 32. AUDIO META TAGS (history items) ───────────────────────────────────────
# Replace audio-meta tag classes
rep(
    '''                      <div class="audio-meta">
                        <span class="tag is-dark">
                          {{
                            languageFlags[inference.language] ||
                            inference.language
                          }}
                        </span>
                        <span v-if="inference.isMusic" class="tag is-warning ml-2">
                          <span class="material-symbols-outlined is-size-6 mr-1">music_note</span>
                          Music
                        </span>
                        <span v-else-if="inference.hasClone" class="tag is-info ml-2">
                          <span class="material-symbols-outlined is-size-6 mr-1">genetics</span>
                          Clone
                        </span>
                        <span v-else class="tag is-success ml-2">
                          <span class="material-symbols-outlined is-size-6 mr-1">record_voice_over</span>
                          TTS
                        </span>''',
    '''                      <div class="bz-audio__meta">
                        <span class="bz-tag">{{
                            languageFlags[inference.language] ||
                            inference.language
                          }}</span>
                        <span v-if="inference.isMusic" class="bz-tag bz-tag--warning">
                          <span class="material-symbols-outlined" style="font-size: 14px">music_note</span>
                          Music
                        </span>
                        <span v-else-if="inference.hasClone" class="bz-tag bz-tag--info">
                          <span class="material-symbols-outlined" style="font-size: 14px">genetics</span>
                          Clone
                        </span>
                        <span v-else class="bz-tag bz-tag--success">
                          <span class="material-symbols-outlined" style="font-size: 14px">record_voice_over</span>
                          TTS
                        </span>''',
    "audio meta tags"
)

# ── 33. NETWORK MODE TAG (if present) ─────────────────────────────────────────
# Check if there's a remaining tag with network mode
if 'inference.networkMode' in content and 'tag' in content:
    rep(
        '''                        <span
                          v-if="inference.networkMode"
                          class="tag ml-2"
                          :class="inference.networkMode === 'remote' ? 'is-info' : 'is-dark'"
                        >
                          <span class="material-symbols-outlined is-size-6 mr-1">public</span>
                          {{ inference.networkMode }}
                        </span>''',
        '''                        <span v-if="inference.networkMode && inference.networkMode !== 'local'" class="bz-tag" :class="inference.networkMode === 'private' ? 'bz-tag--success' : 'bz-tag--info'">
                          <span class="material-symbols-outlined" style="font-size: 14px">{{ inference.networkMode === 'private' ? 'lock' : 'cloud' }}</span>
                          {{ inference.networkMode === 'private' ? 'Private' : 'Remote' }}
                        </span>''',
        "network mode tag"
    )

# ── 34. PROMPT TEXT mt-3 ──────────────────────────────────────────────────────
rep('<p class="prompt-text mt-3">', '<p class="prompt-text" style="margin-top: 0.75rem;">', "prompt mt-3")

# ── 35. LOAD MORE SENTINEL ────────────────────────────────────────────────────
rep(
    '''                <div
                  v-if="hasMore"
                  ref="loadMoreSentinel"
                  class="load-more-sentinel"
                >
                  <span v-if="isLoadingMore" class="has-text-grey">
                    Loading more…
                  </span>
                </div>''',
    '''                <div
                  v-if="hasMore"
                  ref="loadMoreSentinel"
                  class="load-more-sentinel"
                  style="text-align: center; padding: 1rem;"
                >
                  <span v-if="isLoadingMore" style="color: var(--bz-fg-low);">
                    Loading more…
                  </span>
                </div>''',
    "load more sentinel"
)

# ── 36. BALANCE WRAPPERS ── remove excess closing divs ────────────────────────
# After removing outer columns/column + inner columns/column, we have 4 extra </div>
# Original tail was:
#   </div>   (1)
#   </div>   (2)
#   </div>   (3)
#   </div>   (4)
#   </div>   (5)
#   </div>   (6)
#   </template>
# But we need only 3 closing divs after content closure:
#   </div>   (card content ends)
#   </div>   (bz-audio-workspace)
#   </div>   (bz-tab-shell)
#   </template>
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

# ── 37. COMPONENT IMPORTS ── add ModeChipBar and BonzaiPulse ──────────────────
if 'import ModeChipBar' not in content:
    rep(
        '''import GenerativeInput from "./generative/GenerativeInput.vue";''',
        '''import GenerativeInput from "./generative/GenerativeInput.vue";
import ModeChipBar from "./generative/ModeChipBar.vue";''',
        "ModeChipBar import"
    )

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

# ═══════════════════════════════════════════════════════════════════════════════
# STYLE SECTION
# ═══════════════════════════════════════════════════════════════════════════════

style_start = content.find("<style scoped>")
style_end = content.find("</style>") + len("</style>")
template_part = content[:style_start]
style_part = content[style_start:style_end]
script_part = content[style_end:]

# Note: content has been modified by rep() calls above, so we need to work with
# the current content variable. But style_part was captured from original.
# Actually, the rep() calls only affected the template/script portion above style_start.
# But wait, content was modified in-place by rep(). The splits need to happen on the
# CURRENT content.
style_start = content.find("<style scoped>")
style_end = content.find("</style>") + len("</style>")
template_and_script = content[:style_start]
style = content[style_start:style_end]

# S1. Replace .structure-tags-help .tag → .bz-tag
style = style.replace(
    '''.structure-tags-help .tag {
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 10px !important;
  padding: 2px 6px !important;
  height: auto !important;
}
.structure-tags-help .tag:hover {
  background: var(--bz-border-brand) !important;
  transform: scale(1.05);
}''',
    '''.structure-tags-help .bz-tag {
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 10px !important;
  padding: 2px 6px !important;
  height: auto !important;
}
.structure-tags-help .bz-tag:hover {
  background: var(--bz-border-brand) !important;
  transform: scale(1.05);
}''')

# S2. Fix base .bz-tag rule
style = style.replace(
    '''.bz-tag {
  background: var(--bz-scrim-strong);
  color: var(--bz-fg);
}''',
    '''/* Tags — design system replacements for Bulma tags */
.bz-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  padding: 2px var(--bz-space-2);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  font-size: var(--bz-size-micro);
  color: var(--bz-fg-mid);
  white-space: nowrap;
}
.bz-tag--warning {
  background: var(--bz-warning-soft);
  border-color: var(--bz-warning-soft);
  color: var(--bz-warning);
}
.bz-tag--info {
  background: var(--bz-info-soft);
  border-color: var(--bz-info-soft);
  color: var(--bz-info);
}
.bz-tag--success {
  background: var(--bz-emerald-soft);
  border-color: var(--bz-emerald-soft);
  color: var(--bz-emerald-500);
}
.bz-tag--primary {
  background: rgba(155, 89, 182, 0.55);
  border-color: rgba(195, 150, 215, 0.5);
  color: var(--bz-fg);
}
.bz-tag--accent {
  background: rgba(155, 89, 182, 0.55);
  border-color: rgba(195, 150, 215, 0.5);
  color: var(--bz-fg);
}''')

# S3. Add BZ audio workspace CSS rules
bz_audio_css = '''
/* ════════════════════════════════════════════════════════════════
   AUDIO WORKSPACE — design system migration (v2.0)
   ════════════════════════════════════════════════════════════════ */

.bz-audio-workspace {
  position: relative;
  overflow-y: auto;
  padding: var(--bz-space-5) var(--bz-space-6);
  flex: 1;
  min-height: 0;
  width: 100%;
  background: var(--bz-scrim-strong);
}

.bz-audio__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-4);
}
.bz-audio__head h1 {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  margin: 0;
  font-size: var(--bz-size-display);
  line-height: var(--bz-line-display);
}

.bz-audio__card {
  padding: var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  margin-bottom: var(--bz-space-5);
}

/* Mode toggles */
.bz-audio__modes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bz-space-2);
  margin-bottom: var(--bz-space-4);
}

/* Language selector */
.bz-audio__lang-select select {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  padding: var(--bz-space-2) var(--bz-space-3);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  cursor: pointer;
}
.bz-audio__lang-select select:focus {
  border-color: var(--bz-border-brand);
  outline: none;
}

/* History header */
.bz-audio__history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  margin: var(--bz-space-6) 0 var(--bz-space-4);
  padding-top: var(--bz-space-4);
  border-top: 1px solid var(--bz-border);
}
.bz-audio__history-head h2 {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0;
  font-size: var(--bz-size-h2);
  line-height: var(--bz-line-tight);
}
.bz-audio__history-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
}

/* Audio meta tags */
.bz-audio__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bz-space-2);
  margin-bottom: var(--bz-space-3);
}

/* Audio player — beautiful dark player */
.audio-container {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  padding: var(--bz-space-4);
  margin-bottom: var(--bz-space-3);
}
.audio-player {
  width: 100%;
  height: 48px;
  border-radius: var(--bz-r);
}
.audio-player::-webkit-media-controls-panel {
  background: var(--bz-card);
  border-radius: var(--bz-r);
}
.audio-player::-webkit-media-controls-current-time-display,
.audio-player::-webkit-media-controls-time-remaining-display {
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-mono);
  font-size: var(--bz-size-meta);
}
.song-name {
  margin-top: var(--bz-space-2);
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
  font-style: italic;
}

'''

insert_marker = "/* Fade-in animation for history items */"
if insert_marker in style:
    style = style.replace(insert_marker, bz_audio_css + insert_marker)

# S4. Remove obsolete CSS rules
style = re.sub(r'\.columns \{[^}]*\}\n?', '', style)
style = re.sub(r'\.models__deployment-install \{[^}]*\}\n?', '', style)
style = re.sub(r'\.models__activity--payouts h2 \{[^}]*\}\n?', '', style)
style = re.sub(r'\.has-text-brand \{[^}]*\}\n?', '', style)
style = re.sub(r'\.button\.chat\.is-loading \{[^}]*\}\n?', '', style)
style = style.replace('''input[type="radio"] + label.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
''', '')
style = re.sub(r'\.select\.is-dark select[^}]*\}[^}]*\}\n?', '', style)
style = re.sub(r'\.select\.is-dark select:hover[^}]*\}\n?', '', style)
style = re.sub(r'\.file-label \{[^}]*\}\n?', '', style)
style = re.sub(r'\.file-cta,\n\.file-name \{[^}]*\}\n?', '', style)
style = re.sub(r'\.file-name \{[^}]*\}\n?', '', style)
style = re.sub(r'\.help \{[^}]*\}\n?', '', style)
style = re.sub(r'\.tag\.is-dark \{[^}]*\}\n?', '', style)
style = re.sub(r'\.tag\.is-warning \{[^}]*\}\n?', '', style)
style = re.sub(r'\.tag\.is-clickable \{[^}]*\}\n?', '', style)
style = re.sub(r'\.tag\.is-clickable:hover \{[^}]*\}\n?', '', style)
style = re.sub(r'\.notification\.is-warning\.is-light \{[^}]*\}\n?', '', style)
style = re.sub(r'\.label\.has-text-white \{[^}]*\}\n?', '', style)
style = re.sub(
    r'/\* Ghost button[^\n]*\n\.button\.is-ghost \{[^}]*\}\n\n\.button\.is-ghost:hover \{[^}]*\}\n\n\.button\.is-ghost \.material-symbols-outlined \{[^}]*\}\n',
    '', style)

# S5. Remove duplicate unselected state
style = re.sub(
    r'/\* ─+\n   UNSELECTED STATE[^\n]*\n   ─+ \*/\n\.dimension-tags \.bz-tag \{\n  background-color:[^}]*\}\n\n\.dimension-tags \.bz-tag:hover \{[^}]*\}\n',
    '', style)

# S6. Rename second .bz-tag--info to .bz-tag--primary (vocals)
parts = style.split('.dimension-tags .bz-tag.bz-tag--info')
if len(parts) == 3:
    style = parts[0] + '.dimension-tags .bz-tag.bz-tag--info' + parts[1] + '.dimension-tags .bz-tag.bz-tag--primary' + parts[2]
parts = style.split('.dimension-tags .bz-tag.bz-tag--info:hover')
if len(parts) == 3:
    style = parts[0] + '.dimension-tags .bz-tag.bz-tag--info:hover' + parts[1] + '.dimension-tags .bz-tag.bz-tag--primary:hover' + parts[2]
style = style.replace(
    '''.dimension-tags .bz-tag.bz-tag--info,
.dimension-tags .bz-tag.bz-tag--warning,
.dimension-tags .bz-tag.bz-tag--success,
.dimension-tags .bz-tag.bz-tag--info,
.dimension-tags .bz-tag.bz-tag--primary''',
    '''.dimension-tags .bz-tag.bz-tag--info,
.dimension-tags .bz-tag.bz-tag--warning,
.dimension-tags .bz-tag.bz-tag--success,
.dimension-tags .bz-tag.bz-tag--primary,
.dimension-tags .bz-tag.bz-tag--accent''')

# ═══════════════════════════════════════════════════════════════════════════════
# VERIFY & WRITE
# ═══════════════════════════════════════════════════════════════════════════════
final = content[:style_start] + style + content[style_end:]

with open(path, "w") as f:
    f.write(final)

# Verify
print(f"\nTotal changes: {changes}")

# Check remaining Bulma in template
bulma_remaining = []
for ind in ['class="field', 'class="control ', 'class="input is-', 'class="textarea is-',
            'class="select is-', 'class="tag is-', 'class="button is-', 'class="help is-',
            'class="mt-', 'class="mb-', 'class="ml-', 'class="mr-', 'class="p-',
            'class="has-text-', 'class="is-size-', 'class="is-pulled-right',
            'class="is-expanded', 'class="columns"', 'class="column is-',
            'class="level ', 'class="level-left', 'class="level-right',
            'class="notification is-', 'class="progress is-', 'class="radio',
            'class="file-', 'class="label has-text-white', 'class="has-text-grey']:
    if ind in content[:content.find("<style scoped>")]:
        bulma_remaining.append(ind)

if bulma_remaining:
    print(f"\nWARNING: {len(bulma_remaining)} Bulma indicators still in template")
    for b in bulma_remaining:
        print(f"  {b}")
else:
    print("\nPASS — no Bulma indicators remain in template")

# Check div balance
template_part = content[:content.find("<script>")]
opens = template_part.count("<div")
closes = template_part.count("</div>")
print(f"Div balance: opens={opens}, closes={closes}, diff={opens-closes}")

print(f"\nWrote {len(final)} chars")
