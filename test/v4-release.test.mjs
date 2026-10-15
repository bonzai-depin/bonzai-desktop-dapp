import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('v4 RC metadata and first-run experience stay aligned', () => {
  const pkg = JSON.parse(read('package.json'))
  const lock = JSON.parse(read('package-lock.json'))
  const welcome = read('src/components/FirstRunWelcome.vue')

  assert.equal(pkg.version, '4.0.0-rc.1')
  assert.equal(pkg.productName, 'BonzAI v4.0.0 RC')
  assert.equal(lock.version, pkg.version)
  assert.match(welcome, /onboarding\.meshTitle/)
  assert.match(welcome, /onboarding\.audioTitle/)
  assert.match(welcome, /onboarding\.threeTitle/)
})

test('harness integration remains local-first and reversible', () => {
  const main = read('src/main.js')
  const preload = read('src/preload.js')

  assert.match(main, /listen\(OPENCLAW_API_PORT, "127\.0\.0\.1"/)
  assert.match(main, /previousModel:/)
  assert.match(main, /SKILL\.md\.disabled/)
  assert.match(main, /ipcMain\.handle\("harness-get-status"/)
  assert.doesNotMatch(main, /anthropic\/claude-sonnet-4-5/)
  assert.match(preload, /harnessGetStatus/)
  assert.match(preload, /harnessSetEnabled/)
  assert.match(preload, /harnessSync/)
})

test('bundled agent manifests describe the v4 loopback gateway', () => {
  for (const manifest of ['openclaw/SKILL.md', 'hermes/SKILL.md']) {
    const source = read(manifest)
    assert.match(source, /version: 4\.0\.0-rc\.1/)
    assert.match(source, /http:\/\/127\.0\.0\.1:3002\/health/)
    assert.match(source, /\/manifest\?agent=/)
  }
})

test('compact authentication controls retain accessible labels', () => {
  const app = read('src/App.vue')
  assert.match(app, /bz-sidebar__auth-icon/)
  assert.match(app, /bz-sidebar__auth-label/)
  assert.match(app, /:title="i18n\.t\('connection\.title'\)"/)
  assert.match(app, /\.bz-sidebar__auth-label \{ display: none; \}/)
})
