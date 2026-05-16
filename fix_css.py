#!/usr/bin/env python3
"""
CSS cleanup and BZ rule additions for GenerativeAudio.vue
"""
import re

path = "/Users/wilhempujar/Development/bonzai-desktop-dapp/src/components/GenerativeAudio.vue"
with open(path, "r") as f:
    content = f.read()

style_start = content.find("<style scoped>")
style_end = content.find("</style>") + len("</style>")
style = content[style_start:style_end]

# ────────────────────────────────────────────────────────────────────────────
# 1. Replace .structure-tags-help .tag → .structure-tags-help .bz-tag
# ────────────────────────────────────────────────────────────────────────────
style = style.replace(
    """.structure-tags-help .tag {
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 10px !important;
  padding: 2px 6px !important;
  height: auto !important;
}
.structure-tags-help .tag:hover {
  background: var(--bz-border-brand) !important;
  transform: scale(1.05);
}""",
    """.structure-tags-help .bz-tag {
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 10px !important;
  padding: 2px 6px !important;
  height: auto !important;
}
.structure-tags-help .bz-tag:hover {
  background: var(--bz-border-brand) !important;
  transform: scale(1.05);
}""")

# ────────────────────────────────────────────────────────────────────────────
# 2. Fix .bz-tag duplicate base rule — keep only one clean definition
# ────────────────────────────────────────────────────────────────────────────
# Find .bz-tag {
#   background: var(--bz-scrim-strong);
#   color: var(--bz-fg);
# }
# This is from the old .tag.is-dark migration and is wrong for the new design system.
# Replace with the canonical design-system .bz-tag definition.
style = style.replace(
    """.bz-tag {
  background: var(--bz-scrim-strong);
  color: var(--bz-fg);
}""",
    """/* Tags — design system replacements for Bulma tags */
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
}""")

# ────────────────────────────────────────────────────────────────────────────
# 3. Add missing BZ audio workspace CSS rules
# ────────────────────────────────────────────────────────────────────────────
bz_audio_css = """
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

/* Audio player */
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
"""

# Insert the bz-audio rules just before /* Fade-in animation */
insert_marker = "/* Fade-in animation for history items */"
if insert_marker in style:
    style = style.replace(insert_marker, bz_audio_css + "\n" + insert_marker)

# ────────────────────────────────────────────────────────────────────────────
# 4. Remove/replace obsolete CSS rules that reference removed Bulma classes
# ────────────────────────────────────────────────────────────────────────────

# Remove .columns rule (Bulma structural class no longer in template)
style = re.sub(r'\.columns \{[^}]*\}\n?', '', style)

# Remove .models__deployment-install rule (replaced by .bz-audio-workspace)
style = re.sub(r'\.models__deployment-install \{[^}]*\}\n?', '', style)

# Remove .models__activity--payouts h2 rule (header structure now bz-audio__history-head)
style = re.sub(r'\.models__activity--payouts h2 \{[^}]*\}\n?', '', style)

# Remove .has-text-brand rule (now inline style)
style = re.sub(r'\.has-text-brand \{[^}]*\}\n?', '', style)

# Remove .button.chat.is-loading (no such element in template)
style = re.sub(r'\.button\.chat\.is-loading \{[^}]*\}\n?', '', style)

# Remove input[type="radio"] + label.is-disabled (no is-disabled class)
style = style.replace(
    """input[type="radio"] + label.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
""", "")

# Remove .select.is-dark select rules (replaced by inline styles)
style = re.sub(r'\.select\.is-dark select[^}]*\}[^}]*\}\n?', '', style)
style = re.sub(r'\.select\.is-dark select:hover[^}]*\}\n?', '', style)

# Remove .file-* rules (file upload restyled with inline styles)
style = re.sub(r'\.file-label \{[^}]*\}\n?', '', style)
style = re.sub(r'\.file-cta,\n\.file-name \{[^}]*\}\n?', '', style)
style = re.sub(r'\.file-name \{[^}]*\}\n?', '', style)

# Remove .help rule (help class no longer used)
style = re.sub(r'\.help \{[^}]*\}\n?', '', style)

# Remove .tag.is-dark, .tag.is-warning, .tag.is-clickable rules
style = re.sub(r'\.tag\.is-dark \{[^}]*\}\n?', '', style)
style = re.sub(r'\.tag\.is-warning \{[^}]*\}\n?', '', style)
style = re.sub(r'\.tag\.is-clickable \{[^}]*\}\n?', '', style)
style = re.sub(r'\.tag\.is-clickable:hover \{[^}]*\}\n?', '', style)

# Remove .notification.is-warning.is-light (no longer in template)
style = re.sub(r'\.notification\.is-warning\.is-light \{[^}]*\}\n?', '', style)

# Remove .label.has-text-white (no longer in template)
style = re.sub(r'\.label\.has-text-white \{[^}]*\}\n?', '', style)

# ────────────────────────────────────────────────────────────────────────────
# 5. Fix duplicate/unused .dimension-tags .bz-tag base rule
# ────────────────────────────────────────────────────────────────────────────
# There's a duplicate .dimension-tags .bz-tag rule at line ~3605 (unselected state)
# and another one at ~3492 (the main pad rule). The unselected one overrides
# the main pad rule. Let's remove the duplicate unselected state rule
# since the main rule already handles the default state.

# Actually, looking at the CSS, there are multiple .dimension-tags .bz-tag rules.
# The main one at ~3492 already defines everything.
# Then a duplicate at ~3597 that only sets background/border/color.
# Then the unselected state at ~3605.
# The unselected state is the default, so the main rule should handle it.
# But the main rule doesn't set unselected colors. Let me keep the unselected
# state but remove the exact duplicate at ~3597.

# Remove the exact duplicate: .dimension-tags .bz-tag { background-color... }
# that appears right after the ::after pseudo-element.
style = re.sub(
    r'/\* ─+\n   UNSELECTED STATE[^\n]*\n   ─+ \*/\n\.dimension-tags \.bz-tag \{\n  background-color:[^}]*\}\n\n\.dimension-tags \.bz-tag:hover \{[^}]*\}\n',
    '',
    style
)

# ────────────────────────────────────────────────────────────────────────────
# 6. Fix .dimension-tags .bz-tag.bz-tag--info duplicate for vocals
#    Vocals currently map to bz-tag--info but dimension-tags already has
#    a .bz-tag.bz-tag--info for Genre (coral). Vocals should use a unique color.
#    Since we added .bz-tag--primary above, update the CSS for vocals
#    to use the pink color that was previously is-link.
# ────────────────────────────────────────────────────────────────────────────

# Rename the second .bz-tag--info block to .bz-tag--primary
# The second occurrence in the CSS is for vocals (pink).
# Count occurrences and replace the second one.
parts = style.split('.dimension-tags .bz-tag.bz-tag--info')
if len(parts) == 3:  # split produces 3 parts for 2 occurrences
    # First part is everything before first occurrence
    # Second part is between first and second
    # Third part is after second
    # Replace the second occurrence
    style = parts[0] + '.dimension-tags .bz-tag.bz-tag--info' + parts[1] + '.dimension-tags .bz-tag.bz-tag--primary' + parts[2]

# Do the same for hover
parts = style.split('.dimension-tags .bz-tag.bz-tag--info:hover')
if len(parts) == 3:
    style = parts[0] + '.dimension-tags .bz-tag.bz-tag--info:hover' + parts[1] + '.dimension-tags .bz-tag.bz-tag--primary:hover' + parts[2]

# Also update the animation rule
style = style.replace(
    """.dimension-tags .bz-tag.bz-tag--info,
.dimension-tags .bz-tag.bz-tag--warning,
.dimension-tags .bz-tag.bz-tag--success,
.dimension-tags .bz-tag.bz-tag--info,
.dimension-tags .bz-tag.bz-tag--primary {""",
    """.dimension-tags .bz-tag.bz-tag--info,
.dimension-tags .bz-tag.bz-tag--warning,
.dimension-tags .bz-tag.bz-tag--success,
.dimension-tags .bz-tag.bz-tag--primary,
.dimension-tags .bz-tag.bz-tag--accent {""")

# ────────────────────────────────────────────────────────────────────────────
# 7. Update .models__activity--payouts rule (still used in template for Ready? section)
# ────────────────────────────────────────────────────────────────────────────
# Keep it but don't apply conflicting font sizes.

# ────────────────────────────────────────────────────────────────────────────
# 8. Remove .button.is-ghost rules (replaced by .bz-btn.bz-btn--ghost)
# ────────────────────────────────────────────────────────────────────────────
style = re.sub(
    r'/\* Ghost button[^\n]*\n\.button\.is-ghost \{[^}]*\}\n\n\.button\.is-ghost:hover \{[^}]*\}\n\n\.button\.is-ghost \.material-symbols-outlined \{[^}]*\}\n',
    '',
    style
)

# ────────────────────────────────────────────────────────────────────────────
# Write back
# ────────────────────────────────────────────────────────────────────────────
new_content = content[:style_start] + style + content[style_end:]

with open(path, "w") as f:
    f.write(new_content)

print("CSS update complete.")
print("Style section length:", len(style))

# Verify no more .tag.is-* or .button.is-* in CSS
checks = ['.tag.is-dark', '.tag.is-warning', '.tag.is-success', '.tag.is-link', '.tag.is-primary', '.tag.is-clickable', '.button.is-ghost', '.button.chat.is-loading', '.file-label', '.file-cta', '.file-name', '.select.is-dark', '.columns {', '.models__deployment-install {', '.has-text-brand {', '.notification.is-warning']
print("\n=== Obsolete CSS check ===")
for c in checks:
    if c in style:
        print(f"  STILL PRESENT: {c}")
    else:
        print(f"  OK — removed: {c}")
