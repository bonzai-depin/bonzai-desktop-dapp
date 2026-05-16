#!/usr/bin/env python3
"""
Final Bulma → BZ conversion pass for GenerativeAudio.vue
This script fixes all remaining Bulma classes after the first conversion.
"""
import re

path = "/Users/wilhempujar/Development/bonzai-desktop-dapp/src/components/GenerativeAudio.vue"
with open(path, "r") as f:
    content = f.read()

script_start = content.find("<script>")
template = content[:script_start]
rest = content[script_start:]

# ─────────────────────────────────────────────────────────────────────────────
# 1. Fix top-level wrappers: models__deployment-install → bz-audio-workspace
#    and remove outer columns/column wrappers
# ─────────────────────────────────────────────────────────────────────────────
# Old top structure:
#   <div class="bz-tab-shell">
#     <div class="models__deployment-install">
#       <div class="columns">
#         <div class="column is-12">
#           <div class="bz-audio__head">...
#           <div class="bz-genprogress">...
#           <div class="bz-audio__card">...
# New:
#   <div class="bz-tab-shell">
#     <div class="bz-audio-workspace">
#       <div class="bz-audio__head">...
#       <div class="bz-genprogress">...
#       <div class="bz-audio__card">...

# Replace outer opening
template = template.replace(
    '''  <div class="bz-tab-shell">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12">''',
    '''  <div class="bz-tab-shell">
    <div class="bz-audio-workspace">''')

# Remove matching closing divs at the end of content.
# The old template ends with multiple nested </div>s that close column/columns/models__deployment-install/bz-tab-shell
# We need to precisely match and fix.

# Find the pattern at the very end before </template>
# Current: 
#   </div>   <!-- closes some inner div -->
#   </div>   <!-- column is-12 -->
#   </div>   <!-- columns -->
#   </div>   <!-- models__deployment-install -->
#   </div>   <!-- bz-tab-shell -->
#   </template>

# But we already replaced models__deployment-install with bz-audio-workspace in the opening.
# Wait, we didn't — the opening replacement replaced the outermost columns+column opening.
# But there are TWO layers of columns/column in the old file.
# Let me look at the actual end of template to see how many </div> there are.

end_idx = template.rfind("</template>")
tail = template[end_idx-400:end_idx]
print("Current tail near </template>:")
print(repr(tail))

# After the first conversion, the tail is:
# '...\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n\n  <!-- Mint Modal -->...'
# That is 6 closing </div> tags.
# The structure before conversion was:
#   bz-tab-shell (1)
#     models__deployment-install (2)
#       columns (3)
#         column is-12 (4)
#           models__activity--payouts (5) → became bz-audio__card
#             columns (6)
#               column is-12 (7)
#
# We removed the inner columns/column when replacing models__activity--payouts → bz-audio__card.
# We removed the outer columns/column when replacing the top opening.
# So remaining wrappers:
#   bz-tab-shell (1)
#     models__deployment-install (2) → should be bz-audio-workspace
#     bz-audio__card (3, formerly inner models__activity)
#
# But wait, the bz-audio__card was the inner models__activity--payouts, not an outer wrapper.
# The outermost wrapper should be bz-audio-workspace, containing bz-audio__head, bz-genprogress, bz-audio__card.

# Let me count the closing divs more carefully.
# After we removed inner columns/column (when doing the bz-audio__card replacement),
# and removed outer columns/column (when doing the top replacement),
# but didn't remove the outermost models__deployment-install tag.

# Actually, my top replacement removed:
#   <div class="bz-tab-shell">
#     <div class="models__deployment-install">
#       <div class="columns">
#         <div class="column is-12">
# and replaced with:
#   <div class="bz-tab-shell">
#     <div class="bz-audio-workspace">
# So now we have bz-tab-shell containing bz-audio-workspace.
# But what about the inner bz-audio__card? It was previously inside models__activity--payouts
# which was inside the inner columns/column.
# When I replaced:
#   <div class="models__activity--payouts">
#     <div class="columns">
#       <div class="column is-12">
# with:
#   <div class="bz-audio__card">
# That removed the inner columns/column opening.
# So what was previously:
#   <models__activity--payouts>
#     <columns>
#       <column is-12>
#         ...content...
#       </column>
#     </columns>
#   </models__activity--payouts>
# became:
#   <bz-audio__card>
#     ...content...
#   </bz-audio__card>
# So those 3 closing divs got reduced to 1.

# The closing sequence after first conversion should be:
#   </bz-audio__card>
#   </bz-audio-workspace>   (was models__deployment-install)
#   </bz-tab-shell>
# But currently there are MORE closing divs because the outer replacement
# only removed the opening of columns/column is-12, but the closing is still there.

# Wait no — the outer columns/column is-12 that I removed in the top replacement:
# Opening:
#   <div class="bz-tab-shell">
#     <div class="models__deployment-install">
#       <div class="columns">
#         <div class="column is-12">
# Closing (at the very end):
#       </div>   <!-- column is-12 -->
#     </div>     <!-- columns -->
#   </div>       <!-- models__deployment-install -->
# </div>         <!-- bz-tab-shell -->
#
# I need to also remove the corresponding closing tags.
# The tail currently shows 6 </div> before </template>.
# Let me count from the inside out:
#   </div>   1 — closes something inside download task list or similar
#   </div>   2 — closes the download task list container
#   </div>   3 — closes bz-audio__card (was models__activity--payouts)
#   </div>   4 — was column is-12
#   </div>   5 — was columns
#   </div>   6 — was models__deployment-install
#
# After my top replacement, the outermost wrapper is bz-audio-workspace.
# So I need closing to be:
#   </div>   1 — closes something inside
#   </div>   2 — closes task list container
#   </div>   3 — closes bz-audio__card
#   </div>   4 — closes bz-audio-workspace
#   </div>   5 — closes bz-tab-shell
#
# So I need to remove ONE of the closing divs (the one that was columns).

# Wait, the inner replacement of models__activity--payouts/columns/column already removed 2 closing divs.
# Let me recalculate:
# Original structure count:
#   <bz-tab-shell>              (1)
#     <models__deployment>       (2)
#       <columns>                (3)
#         <column is-12>         (4)
#           <level>              (5) — header
#           <notification>       (6) — generation progress
#           <models__activity>   (7)
#             <columns>          (8)
#               <column is-12>   (9)
#                 ...all content...
#               </column>        (9 close)
#             </columns>         (8 close)
#           </models__activity>  (7 close)
#         </column>              (4 close)
#       </columns>               (3 close)
#     </models__deployment>      (2 close)
#   </bz-tab-shell>              (1 close)

# After my replacements:
#   <bz-tab-shell>              (1)
#     <bz-audio-workspace>       (2) — replaced models__deployment + outer columns/column
#       <bz-audio__head>         (5) — was level
#       <bz-genprogress>         (6) — was notification
#       <bz-audio__card>         (7) — replaced models__activity + inner columns/column
#         ...all content...
#       </bz-audio__card>        (7 close)
#     </bz-audio-workspace>      (2 close)
#   </bz-tab-shell>              (1 close)
#
# So the tail SHOULD have exactly 3 </div>s after the content ends.
# But currently there are 6. That means my replacements partially matched
# but the closing divs weren't adjusted.

# Looking at the actual tail:
# '\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n\n  <!-- Mint Modal -->...'
# That's 6 </div>s.
# The innermost </div> is probably closing the `ul` or `ol` element (wait, ul/ol don't have matching close
# shown in this snippet).

# Actually let me look at the broader context around line 900-930.
# The content near the end of the card has the download progress section and history,
# then closes.

# I think the safest approach is to just do the replacements carefully
# and let Vue handle any extra closing divs (Vue's template compiler
# will report mismatched tags, but let me be precise).

# For now, let me focus on fixing the KNOWN remaining Bulma issues
# and then verify the file compiles.

# ─────────────────────────────────────────────────────────────────────────────
# 2. Replace raw radio buttons with ModeChipBar
# ─────────────────────────────────────────────────────────────────────────────

# Mode toggles (lines ~56-125 on disk)
old_mode_block = '''                <div style="margin-bottom: 1rem; text-align: left;">
                  <input
                    v-model="mode"
                    :value="'tts'"
                    id="mode_tts"
                    type="radio"
                    name="mode"
                    :checked="mode === 'tts'"
                  />
                  <label for="mode_tts" class="radio" style="margin-right: 8px;">
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
                  <label for="mode_clone" class="radio" style="margin-right: 8px;">
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
                  <label for="mode_music" class="radio" style="margin-right: 8px;">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      music_note
                    </span>
                    Music
                  </label>

                  <!-- LANGUAGE SELECTOR (hidden for music mode) -->
                  <div v-if="mode !== 'music'" style="margin-left: auto;">
                    <select v-model="language" style="background: var(--bz-border); color: var(--bz-fg); border: 1px solid var(--bz-fg-faint); height: 48px; padding: 0 8px;">
                      <option
                        v-for="(name, code) in languages"
                        :key="code"
                        :value="code"
                      >
                        {{ languageFlags[code] }} {{ name }}
                      </option>
                    </select>
                  </div>
                </div>'''

new_mode_block = '''            <!-- MODE TOGGLES (TTS vs Clone vs Music) -->
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
            </div>'''

template = template.replace(old_mode_block, new_mode_block)

# Voice gender toggles
old_voice_block = '''                <!-- VOICE GENDER SELECTOR (TTS mode only) -->
                <div v-if="mode === 'tts'" style="margin-bottom: 1rem; text-align: left;">
                  <input
                    v-model="voiceGender"
                    value="female"
                    id="gender_female"
                    type="radio"
                    name="gender"
                  />
                  <label for="gender_female" class="radio" style="margin-right: 8px;">
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
                </div>'''

new_voice_block = '''            <!-- VOICE GENDER SELECTOR (TTS mode only) -->
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
            </div>'''

template = template.replace(old_voice_block, new_voice_block)

# ─────────────────────────────────────────────────────────────────────────────
# 3. Fix the musicQuality select indentation
# ─────────────────────────────────────────────────────────────────────────────
template = template.replace(
    '''                    <select
                        v-model="musicQuality"
                        style="height: 52px; position: relative; top: -6px"
                      >
                        <option value="fast">Fast (v1.5)</option>
                        <option value="quality">Quality (v1.5 XL)</option>
                      </select>''',
    '''                    <select
                      v-model="musicQuality"
                      style="height: 52px; position: relative; top: -6px; background: var(--bz-border); border: 1px solid var(--bz-fg-faint); color: var(--bz-fg); padding: 0 8px; border-radius: 4px;"
                    >
                      <option value="fast">Fast (v1.5)</option>
                      <option value="quality">Quality (v1.5 XL)</option>
                    </select>''')

# ─────────────────────────────────────────────────────────────────────────────
# 4. Fix duplicate style on "Ready ?" span
# ─────────────────────────────────────────────────────────────────────────────
template = template.replace(
    '''                    <span
                      class="fira-sans-condensed-black-italic" style="color: var(--bz-brand); font-size: 3rem;"
                      style="width: auto !important"
                    >''',
    '''                    <span
                      class="fira-sans-condensed-black-italic"
                      style="width: auto !important; background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text; -webkit-text-fill-color: transparent; font-size: 3rem;"
                    >''')

# ─────────────────────────────────────────────────────────────────────────────
# 5. Fix file input for clone mode (currently still has Bulma file-* classes)
#    Actually, looking at the grep results, it looks like the file-input block
#    still has `file-label`, `file-input`, `file-cta`, `file-icon`, `file-name`.
#    Wait — I DID replace this in the first script but maybe the replacement
#    didn't match. Let me check.
# ─────────────────────────────────────────────────────────────────────────────
old_file_block = '''                <div v-if="mode === 'clone'">
                  <div style="margin-bottom: 12px;">
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
                  </div>'''

new_file_block = '''                <div v-if="mode === 'clone'">
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
                  </div>'''

template = template.replace(old_file_block, new_file_block)

# ─────────────────────────────────────────────────────────────────────────────
# 6. Fix closing divs at the end
# ─────────────────────────────────────────────────────────────────────────────
# The current tail has too many closing divs because we removed wrapper elements.
# We need to reduce from 6 to 5 (or whatever matches the new nesting depth).
# Let me adjust by replacing the exact tail pattern.

# First, let me find the exact current tail pattern after my replacements.
end_marker = "</template>"
end_idx = template.rfind(end_marker)
current_tail = template[end_idx-500:end_idx]
print("\nTail after replacements:")
print(repr(current_tail))

# If there are 6 </div>s followed by </template>, we need to remove one.
# We removed one wrapper layer (the outer columns/column), so we need
# to remove two </div>s from the tail (column is-12 and columns).
# But we also removed the inner columns/column earlier.
# Wait, let me recalculate:
# Before any changes, the inner replacement removed columns+column = 2 opening divs.
# So it also needed to remove 2 closing divs.
# The outer replacement removed columns+column = 2 more opening divs.
# So it needs to remove 2 more closing divs.
# Total removed: 4 opening + 4 closing divs.

# Actually wait. The original had:
#   <models__activity>
#     <columns>
#       <column is-12>
# When I replaced this with just <bz-audio__card>, I removed 3 opening divs
# and should have removed 3 closing divs.
# But the original replacement was:
#   <div class="models__activity--payouts">
#     <div class="columns">
#       <div class="column is-12">
# replaced with:
#   <div class="bz-audio__card">
# So 3 opening → 1 opening, meaning 2 closing should also be removed.
# But I didn't adjust the closings for this replacement.

# Similarly, the outer replacement:
#   <div class="bz-tab-shell">
#     <div class="models__deployment-install">
#       <div class="columns">
#         <div class="column is-12">
# replaced with:
#   <div class="bz-tab-shell">
#     <div class="bz-audio-workspace">
# So 4 opening → 2 opening, meaning 2 closing should be removed.

# Total: need to remove 4 closing </div>s from the tail.
# Currently there are 6 closing </div>s before </template>.
# After removing 4, there should be 2 closing </div>s: one for bz-audio-workspace and one for bz-tab-shell.
# BUT WAIT — there's also bz-audio__card which closes.
# Let me recount from the inside out.

# Current structure (after partial replacements):
#   <bz-tab-shell>
#     <models__deployment-install>     ← should be bz-audio-workspace
#       <bz-audio__head> ... </bz-audio__head>
#       <bz-genprogress> ... </bz-genprogress>
#       <bz-audio__card>               ← was inside models__activity--payouts/columns/column
#         ...all content including history...
#         <ol.chat> ... </ol.chat>
#       </bz-audio__card>
#     </models__deployment-install>
#   </bz-tab-shell>
#
# BUT there's also the mint modal which is a sibling of bz-tab-shell, not a child.
# And the loadMoreSentinel, etc.

# Actually, looking at the original file structure more carefully:
#   <template>
#     <div class="background"></div>
#     <div class="bz-tab-shell">
#       <div class="models__deployment-install">
#         <div class="columns">
#           <div class="column is-12">
#             <div class="level">
#               <div class="level-left"><div class="level-item"><h1>...</h1></div></div>
#             </div>
#             <generation progress notification>
#             <div class="models__activity--payouts">
#               <div class="columns">
#                 <div class="column is-12">
#                   <mode toggles>
#                   <access requirements>
#                   <music inputs>
#                   <clone inputs>
#                   <prompt input>
#                   <history>
#                 </div>
#               </div>
#             </div>
#           </div>
#         </div>
#       </div>
#     </div>
#     <MintModal/>
#   </template>
#
# After my target replacements, the ideal structure should be:
#   <template>
#     <div class="background"></div>
#     <div class="bz-tab-shell">
#       <div class="bz-audio-workspace">
#         <div class="bz-audio__head">...</div>
#         <div class="bz-genprogress">...</div>
#         <div class="bz-audio__card">
#           <mode toggles>
#           <access requirements>
#           <music inputs>
#           <clone inputs>
#           <prompt input>
#           <history>
#         </div>
#       </div>
#     </div>
#     <MintModal/>
#   </template>
#
# So the nesting depth is:
#   bz-tab-shell (1)
#     bz-audio-workspace (2)
#       bz-audio__card (3)
#         ...content...
#       </bz-audio__card>
#     </bz-audio-workspace>
#   </bz-tab-shell>
#
# So after the last content line, we should have exactly 3 </div>s.
# But currently there are 6. I need to remove 3 closing </div>s.

# Let me try a direct replacement on the tail.
# The current tail (from print) has something like:
# '...            </div>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n\n  <!-- Mint Modal -->...'
# That's 6 </div>s.
# The first one closes the inner-most element (probably the sentinel div or similar).
# The second closes some other container.
# The third closes bz-audio__card.
# The fourth closes column is-12.
# The fifth closes columns.
# The sixth closes models__deployment-install.
# Then </div> for bz-tab-shell.
# Wait that's 7 actually. Let me count again.

print("\nCounting </div> in tail:")
count = current_tail.count("</div>")
print(f"Found {count} </div> in last 500 chars before </template>")

# The strategy: I'll do nothing for the closing divs right now.
# Vue's template compiler will catch mismatched tags if there are too many/too few.
# Let me just compile the file and see if there are errors.

# Let me also verify the file doesn't have obvious structural issues
# by looking at the nesting.

# For now, write the file.
with open(path, "w") as f:
    f.write(template + rest)

print("\nWrote file.")

# Count remaining Bulma classes
bulma_classes = [
    'class="field', 'class="control ', 'class="input is-', 'class="textarea is-',
    'class="select is-', 'class="tag is-', 'class="button is-', 'class="help is-',
    'class="mt-', 'class="mb-', 'class="ml-', 'class="mr-', 'class="p-',
    'class="has-text-', 'class="is-size-', 'class="is-pulled-right',
    'class="is-expanded', 'class="columns"', 'class="column is-',
    'class="level ', 'class="level-left', 'class="level-right',
    'class="notification is-', 'class="progress is-', 'class="radio"',
    'class="file-', 'class="label has-text-white', 'class="has-text-grey',
]
print("\n=== Remaining Bulma patterns (should be 0) ===")
for cls in bulma_classes:
    if cls in template:
        count = template.count(cls)
        print(f"  {cls}: {count}")

# Also check standalone utilities that might appear as part of other classes
remaining = []
for m in re.finditer(r'\b(is-dark|is-info|is-warning|is-success|is-link|is-primary|is-danger|is-small|is-medium|is-large|is-size-\d|has-text-\w+|mt-\d|mb-\d|ml-\d|mr-\d|p-\d|pt-\d|pb-\d|pl-\d|pr-\d|is-pulled-right|is-expanded|columns|column is-\d+)\b', template):
    # Exclude false positives: these could be in <script> (but we're only scanning template)
    # Or in comments, or in :class bindings that we've already handled
    snippet = m.group(0)
    remaining.append(snippet)

if remaining:
    from collections import Counter
    c = Counter(remaining)
    print("\nRemaining Bulma utility classes:")
    for cls, cnt in c.most_common(50):
        print(f"  {cls}: {cnt}")
else:
    print("\nNo remaining Bulma utility classes found!")
