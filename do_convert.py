#!/usr/bin/env python3
"""
Complete Bulma → BZ conversion for GenerativeAudio.vue
"""
import re

path = "/Users/wilhempujar/Development/bonzai-desktop-dapp/src/components/GenerativeAudio.vue"
with open(path, "r") as f:
    content = f.read()

# Save original in case we need to rollback
original = content[:]

def rep(old, new, label):
    global content
    if old in content:
        content = content.replace(old, new, 1)
        print(f"  OK: {label}")
        return True
    else:
        print(f"  MISS: {label}")
        return False

print("=== Template Conversions ===")

# 1. Top structure
rep('''    <div class="models__deployment-install">
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
"top structure")

# 2. Generation progress
rep('''          <!-- GENERATION PROGRESS -->
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
"generation progress")

# 3. Inner wrapper
rep('''          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">''',
'''          <div class="bz-audio__card">''',
"inner wrapper")

# 4. Mode toggles
rep('''                <!-- MODE TOGGLES (TTS vs Clone) -->
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
"mode toggles")

# 5. Voice gender
rep('''                <!-- VOICE GENDER SELECTOR (TTS mode only) -->
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
"voice gender")

# 6. AccessRequirements mt-5
rep('''                <AccessRequirements
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
"access mt-5")

# 7. Music mode mb-4
rep('''                <div v-if="mode === 'music'" class="mb-4">''',
'''                <div v-if="mode === 'music'" style="margin-bottom: 1rem;">''',
"music mb-4")

# 8. Song Concept
rep('''                    <!-- Lyrics Theme Input (for LLM generation) -->
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
"song concept")

# 9. Close song concept
rep('''                            </select>
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
"close song concept")

# ... I realize writing all these replacements fully in a script is
# what failed last time because the script had issues. Let me instead
# leverage the fact that the Edit tool calls work fine. I'll overwrite
# the entire file with the modified version, doing a bulk replacement
# with Python using simple string replacements.

with open(path, "w") as f:
    f.write(content)

print(f"\nWrote {path}")
print(f"Total bytes: {len(content)}")
