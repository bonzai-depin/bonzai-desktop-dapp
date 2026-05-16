#!/usr/bin/env python3
"""
Migrate Generative3D.vue template from Bulma to BonzAI design system.
Operates ONLY inside <template> to avoid corrupting <script> strings.
"""

import re
import sys
from pathlib import Path

FILE = Path("src/components/Generative3D.vue")
content = FILE.read_text()

# Split into template and rest
tmpl_match = re.search(r'(<template>)(.*?)(</template>)', content, re.DOTALL)
if not tmpl_match:
    raise ValueError("No <template> found")

prefix = content[:tmpl_match.start()]
template = tmpl_match.group(2)
suffix = content[tmpl_match.end():]

# ── helpers ──────────────────────────────────────────────────────────
def div_balance(text):
    t = text
    t = re.sub(r'<!--.*?-->', '', t, flags=re.DOTALL)
    opens = len(re.findall(r'<div\b[^>]*>', t))
    closes = len(re.findall(r'</div>', t))
    self_closing = len(re.findall(r'<div\b[^>]*?/>', t))
    return opens, closes, self_closing

START_NET = div_balance(template)[0] - div_balance(template)[1] - div_balance(template)[2]
print(f"Start net: {START_NET}")

def check_balance(t, label):
    o, c, s = div_balance(t)
    net = o - c - s
    if net != START_NET:
        print(f"❌ IMBALANCE after {label}: open={o} close={c} self={s} net={net} (expected {START_NET})")
        sys.exit(1)
    print(f"✅ OK after {label}: open={o} close={c} net={net}")

# ═══════════════════════════════════════════════════════════════════════
# PHASE 1: Pure class replacements (no structural changes = safe)
# ═══════════════════════════════════════════════════════════════════════

class_replacements = [
    (r'class="notification is-danger mb-4 p-5"', 'class="bz-notice bz-notice--danger"'),
    (r'class="notification is-info mb-4 p-5"', 'class="bz-notice bz-notice--info"'),
    (r'<div class="level mb-4 mt-5" v-if="objectInferences.length > 0">',
     '<div class="bz-3d__history-head" v-if="objectInferences.length > 0">'),
    (r'<div class="level-left">\s*<div class="level-item">',
     '<div class="bz-3d__history-title">'),
    (r'</div>\s*</div>\s*<div class="level-right">',
     '</div>\n            <div class="bz-3d__history-actions">'),
    (r'<div class="level-item buttons">',
     '<div class="bz-3d__history-actions">'),
    (r'<button\s*\n?\s*class="button is-warning is-small"\s*\n?\s*@click="importHistory\(\)"',
     '<button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="importHistory()"'),
    (r'<button\s*\n?\s*class="button is-warning is-small ml-4"\s*\n?\s*@click="exportHistory\(\)"',
     '<button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="exportHistory()"'),
    (r'<button\s*\n?\s*class="button is-danger is-small ml-4"\s*\n?\s*@click="clearHistory\(\)"',
     '<button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="clearHistory()"'),
    (r'<button\s*\n?\s*class="button is-warning mt-3 is-large"\s*\n?\s*@click="downloadAllModels"',
     '<button type="button" class="bz-btn bz-btn--primary" @click="downloadAllModels"'),
    (r'<button\s*\n?\s*disabled\s*\n?\s*class="button is-loading is-info is-small mr-2 p-4"\s*\n?\s*></button>',
     '<span class="material-symbols-outlined bz-spin">progress_activity</span>'),
    (r'<button\s*\n?\s*class="button is-medium is-success copy is-pulled-left p-0 pl-1 pr-1 mr-3"',
     '<button type="button" class="bz-btn bz-btn--ghost bz-btn--sm"'),
    (r'<button\s*\n?\s*class="button is-medium is-warning ml-2 is-pulled-left mr-3"\s*\n?\s*@click="openMint',
     '<button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="openMint'),
    (r'<button\s*\n?\s*v-if="item.success"\s*\n?\s*class="button is-medium is-warning ml-2 is-pulled-left mr-3"',
     '<button type="button" v-if="item.success" class="bz-btn bz-btn--ghost bz-btn--sm"'),
    (r'<button\s*\n?\s*class="button is-medium is-warning ml-2 is-pulled-left mr-3"\s*\n?\s*@click="regenerateFromInference',
     '<button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="regenerateFromInference'),
    (r'<button\s*\n?\s*class="button is-medium is-danger is-pulled-right p-0 pl-1 pr-1"',
     '<button type="button" class="bz-btn bz-btn--ghost bz-btn--sm"'),
    (r'<button\s*\n?\s*class="button is-info"\s*\n?\s*@click="downloadScreenshot',
     '<button type="button" class="bz-btn bz-btn--primary" @click="downloadScreenshot'),
    (r'<button class="button is-success ml-2" @click="downloadAllScreenshots">',
     '<button type="button" class="bz-btn bz-btn--primary" @click="downloadAllScreenshots">'),
    (r'class="input is-large is-fullwidth"', 'class="bz-input bz-input--lg"'),
    (r'class="input is-medium"', 'class="bz-input"'),
    (r'<button\s*\n?\s*class="button chat is-loading is-outlined is-info is-large is-fullwidth"\s*\n?\s*v-if="isLoading"\s*\n?\s*></button>',
     '<div v-if="isLoading" class="bz-generating" style="height:2px;margin-top:var(--bz-space-3)"></div>'),
    (r'class="fira-sans-condensed-black-italic is-size-2"', 'class="bz-h1"'),
    (r'class="fira-sans-condensed-black-italic is-size-4"', 'class="bz-h2"'),
    (r'class="fira-sans-condensed-black-italic is-pulled-right is-size-1"', 'class="bz-data"'),
    (r'class="fira-sans-condensed-black-italic has-text-white is-size-2"', 'class="bz-h2"'),
    (r'class="is-size-7 columns"', 'class="bz-3d__task-row"'),
    (r'class="column has-text-left"', 'class="bz-3d__task-name"'),
    (r'class="column is-2 fira-sans-condensed-black-italic has-text-right"', 'class="bz-3d__task-pct bz-data"'),
    (r'class="examples-panel models__activity--payouts"', 'class="bz-3d__examples"'),
    (r'class="refine-section mt-3"', 'class="bz-3d__refine"'),
    (r'class="field has-addons"', 'class="bz-3d__refine-row"'),
    (r'class="control is-expanded"', 'class="bz-3d__refine-input"'),
    (r'class="control"\s*>\s*<button\s*\n?\s*class="button is-medium is-success"',
     'class="bz-3d__refine-action">\n                      <button type="button" class="bz-btn bz-btn--primary"'),
]

for old, new in class_replacements:
    if re.search(old, template):
        template = re.sub(old, new, template)
        print(f"  ✓ {old[:50]}...")
    else:
        print(f"  ⚠ Not found: {old[:50]}...")

check_balance(template, "phase-1 class replacements")

# ═══════════════════════════════════════════════════════════════════════
# PHASE 2: Remove outer columns/column wrappers
# ═══════════════════════════════════════════════════════════════════════

old_outer = '    <div class="models__deployment-install">\n      <div class="columns">\n        <div class="column is-12">'
new_outer = '    <div class="bz-3d-workspace models__deployment-install">'

if old_outer in template:
    template = template.replace(old_outer, new_outer)
    print("  ✓ Removed outer columns wrapper (open)")
else:
    print("  ⚠ Outer open wrapper not found")

old_outer_close = '        </div>\n      </div>\n    </div>'
new_outer_close = '    </div>'

if old_outer_close in template:
    template = template.replace(old_outer_close, new_outer_close)
    print("  ✓ Removed outer columns wrapper (close)")
else:
    print("  ⚠ Outer close wrapper not found")

check_balance(template, "phase-2 outer wrappers")

# ═══════════════════════════════════════════════════════════════════════
# PHASE 3: Remove inner models__activity--payouts columns/column
# ═══════════════════════════════════════════════════════════════════════

old_inner = '          <div class="models__activity--payouts">\n            <div class="columns">\n              <div class="column is-12">'
new_inner = '          <div class="bz-3d__panel">'

if old_inner in template:
    template = template.replace(old_inner, new_inner)
    print("  ✓ Removed inner panel columns (open)")
else:
    print("  ⚠ Inner panel open not found")

old_inner_close = '              </div>\n            </div>\n          </div>'
new_inner_close = '          </div>'

if old_inner_close in template:
    template = template.replace(old_inner_close, new_inner_close)
    print("  ✓ Removed inner panel columns (close)")
else:
    print("  ⚠ Inner panel close not found")

check_balance(template, "phase-3 inner panel wrappers")

# ═══════════════════════════════════════════════════════════════════════
# PHASE 4: Environment controls columns
# ═══════════════════════════════════════════════════════════════════════

old_env = '          <div class="environment-controls models__activity--payouts mt-5">\n            <div class="columns is-multiline">\n              <div class="column is-5">'
new_env = '          <div class="bz-3d__env">\n            <div class="bz-3d__env-grid">\n              <div class="bz-3d__env-col">'

if old_env in template:
    template = template.replace(old_env, new_env)
    print("  ✓ Migrated environment controls (open)")
else:
    print("  ⚠ Environment controls open not found")

old_env_mid1 = '              </div>\n              <div class="column is-7">'
new_env_mid1 = '              </div>\n              <div class="bz-3d__env-col bz-3d__env-col--wide">'

if old_env_mid1 in template:
    template = template.replace(old_env_mid1, new_env_mid1)
    print("  ✓ Migrated env mid column")
else:
    print("  ⚠ Environment mid column not found")

old_env_mid2 = '              </div>\n              <div class="column is-12">'
new_env_mid2 = '              </div>\n              <div class="bz-3d__env-col bz-3d__env-col--full">'

if old_env_mid2 in template:
    template = template.replace(old_env_mid2, new_env_mid2)
    print("  ✓ Migrated env full column")
else:
    print("  ⚠ Environment full column not found")

# Close tags for env are unchanged structurally
old_env_close = '              </div>\n            </div>\n          </div>'
if old_env_close in template:
    # Just verify it exists; no replacement needed
    print("  ✓ Environment controls close OK")
else:
    print("  ⚠ Environment controls close not found")

check_balance(template, "phase-4 environment controls")

# ═══════════════════════════════════════════════════════════════════════
# PHASE 5: Download progress inner columns
# ═══════════════════════════════════════════════════════════════════════

old_dl_cols = '''                      <li
                        v-for="t in downloadTaskList"
                        :key="t.task_id"
                        class="is-size-7 columns"
                        style="text-transform: lowercase"
                      >
                        <div class="column has-text-left">'''
new_dl_cols = '''                      <li
                        v-for="t in downloadTaskList"
                        :key="t.task_id"
                        class="bz-3d__task-row"
                      >
                        <div class="bz-3d__task-name">'''

if old_dl_cols in template:
    template = template.replace(old_dl_cols, new_dl_cols)
    print("  ✓ Migrated download task columns (open)")
else:
    print("  ⚠ Download task columns open not found")

old_dl_close = '''                        </div>
                        <div
                          class="column is-2 fira-sans-condensed-black-italic has-text-right"
                        >'''
new_dl_close = '''                        </div>
                        <div class="bz-3d__task-pct bz-data">'''

if old_dl_close in template:
    template = template.replace(old_dl_close, new_dl_close)
    print("  ✓ Migrated download task pct column")
else:
    print("  ⚠ Download task pct column not found")

check_balance(template, "phase-5 download columns")

# ═══════════════════════════════════════════════════════════════════════
# PHASE 6: Clean up orphaned Bulma utility classes
# ═══════════════════════════════════════════════════════════════════════

# Only remove classes from divs we still have (not from removed wrappers)
utility_patterns = [
    r'\s+mb-4', r'\s+mt-3', r'\s+mt-5', r'\s+p-5', r'\s+p-4',
    r'\s+pl-1', r'\s+pr-1', r'\s+mr-2', r'\s+mr-3', r'\s+ml-2', r'\s+ml-4',
    r'\s+is-pulled-left', r'\s+is-pulled-right',
    r'\s+has-text-left', r'\s+has-text-right', r'\s+has-text-centered', r'\s+has-text-white',
    r'\s+is-size-1', r'\s+is-size-2', r'\s+is-size-3', r'\s+is-size-4',
    r'\s+is-size-6', r'\s+is-size-7',
    r'\s+is-fullwidth', r'\s+is-large', r'\s+is-medium', r'\s+is-small',
    r'\s+is-loading', r'\s+is-outlined', r'\s+is-info',
    r'\s+is-success', r'\s+is-warning', r'\s+is-danger',
]

for pat in utility_patterns:
    template = re.sub(pat, '', template)

check_balance(template, "phase-6 utility cleanup")

# ═══════════════════════════════════════════════════════════════════════
# PHASE 7: Update style section with new workspace + component classes
# ═══════════════════════════════════════════════════════════════════════

new_styles = '''
/* ─── Design-system workspace ─────────────────────────────────────── */
.bz-3d-workspace {
  position: relative;
  overflow-y: auto;
  padding: var(--bz-space-5) var(--bz-space-6);
  flex: 1;
  min-height: 0;
  width: 100%;
  background: var(--bz-scrim-strong);
}

.bz-3d__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--bz-space-5);
}

.bz-3d__head-actions {
  display: flex;
  gap: var(--bz-space-3);
}

.bz-3d__panel {
  margin-top: var(--bz-space-5);
}

/* Examples */
.bz-3d__examples {
  margin-bottom: var(--bz-space-5);
  padding: var(--bz-space-4);
}

/* Refine */
.bz-3d__refine {
  margin-top: var(--bz-space-3);
  border: 1px solid var(--bz-emerald-soft);
  border-radius: var(--bz-r-sm);
  padding: var(--bz-space-3);
  background: var(--bz-emerald-soft);
}

.bz-3d__refine-row {
  display: flex;
  gap: var(--bz-space-2);
}

.bz-3d__refine-input {
  flex: 1;
}

.bz-3d__refine-action {
  flex-shrink: 0;
}

/* Environment controls */
.bz-3d__env {
  margin-top: var(--bz-space-5);
  padding: var(--bz-space-4) var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}

.bz-3d__env-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: var(--bz-space-4);
}

.bz-3d__env-col--full {
  grid-column: 1 / -1;
}

@media (max-width: 768px) {
  .bz-3d__env-grid {
    grid-template-columns: 1fr;
  }
}

/* History header */
.bz-3d__history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--bz-space-3);
  margin: var(--bz-space-5) 0 var(--bz-space-4);
}

.bz-3d__history-title {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
}

.bz-3d__history-actions {
  display: flex;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
}

/* Download tasks */
.bz-3d__task-row {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-2) 0;
  border-bottom: 1px solid var(--bz-border);
  text-transform: lowercase;
}

.bz-3d__task-row:last-child {
  border-bottom: none;
}

.bz-3d__task-name {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
}

.bz-3d__task-pct {
  flex-shrink: 0;
  min-width: 3em;
  text-align: right;
}

/* Spinning icon */
.bz-spin {
  animation: bz-spin 1.2s linear infinite;
}

/* Inputs */
.bz-input {
  width: 100%;
  padding: var(--bz-space-3) var(--bz-space-4);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  transition: border-color var(--bz-dur-fast) var(--bz-ease-stand);
}

.bz-input:focus {
  border-color: var(--bz-border-brand);
  outline: none;
}

.bz-input--lg {
  font-size: var(--bz-size-h3);
  padding: var(--bz-space-4) var(--bz-space-5);
  min-height: 5em;
}

.bz-input::placeholder {
  color: var(--bz-fg-faint);
}
'''

if '</style>' in suffix:
    suffix = suffix.replace('</style>', new_styles + '\n</style>')
    print("  ✓ Appended new styles")
else:
    print("  ⚠ No </style> found")

# Reassemble
final_content = prefix + '<template>' + template + '</template>' + suffix

# Write back
FILE.write_text(final_content)
print("\n🎉 Generative3D.vue migration complete!")
