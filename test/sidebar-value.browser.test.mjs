import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('sidebar compact preference persists and the recorded token count is labeled tokens saved', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => {
      localStorage.setItem('bonzai.onboarding.v4.completed', 'true');
      window.electronAPI = { usage: { getLifetimeTokens: async () => 2000000, onLifetimeTokensChanged: () => () => {} } };
    });
    await page.goto(url);
    const sidebar = page.locator('.bz-sidebar');
    const counter = sidebar.getByLabel('Tokens saved', { exact: true });
    await counter.getByText('2M', { exact: true }).waitFor();
    assert.equal(await sidebar.locator('.bz-sidebar__serve').count(), 0);
    assert.equal(await sidebar.getByText(/Estimated savings|USD|comparison rate/).count(), 0);
    await sidebar.getByRole('button', { name: 'Compact sidebar', exact: true }).click();
    assert.equal(Math.round((await sidebar.boundingBox()).width), 88);
    await page.reload();
    await sidebar.getByRole('button', { name: 'Expand sidebar', exact: true }).waitFor();
    assert.equal(Math.round((await sidebar.boundingBox()).width), 88);
    await sidebar.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    assert.equal(Math.round((await sidebar.boundingBox()).width), 240);
    await counter.getByText('2M', { exact: true }).waitFor();
    await page.setViewportSize({ width: 800, height: 900 });
    assert.equal(Math.round((await sidebar.boundingBox()).width), 240, 'Explicit expanded preference overrides automatic compact mode');
  } finally { await browser.close(); }
});

test('mesh mode and popover update immediately and stale polling cannot revert them', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => localStorage.setItem('bonzai.onboarding.v4.completed', 'true'));
    await page.goto(url);
    const mesh = page.locator('.mesh-presence');
    await mesh.getByRole('button', { name: 'Private Mode', exact: true }).click();
    await mesh.getByRole('heading', { name: 'Private Mode', exact: true }).waitFor();
    assert.equal(await mesh.locator('.mesh-presence__privacy').count(), 0);
    assert.equal(await mesh.locator('.mesh-presence__trigger > .material-symbols-outlined').innerText(), 'sensors');
    await mesh.getByText('on local network', { exact: false }).waitFor();
    await page.evaluate(async () => {
      const resource = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/stores/meshStore.js');
      const { default: store } = await import(resource.name);
      window.__meshTestStore = store;
      let finish;
      window.electronAPI = { p2pStatus: async () => ({ ok: true, started: true }), store: { get: () => new Promise(resolve => { finish = resolve; }) } };
      const pending = store.refresh();
      store.setMode('consumer');
      finish('local');
      await pending;
    });
    await mesh.getByRole('heading', { name: 'Consumer Mode', exact: true }).waitFor();
    await mesh.getByRole('button', { name: 'Consumer Mode', exact: true }).waitFor();
    await page.evaluate(() => window.__meshTestStore.setMode('provider'));
    await mesh.getByRole('heading', { name: 'Provider Mode', exact: true }).waitFor();
    const font = await mesh.locator('.mesh-presence__stats strong').first().evaluate(el => getComputedStyle(el).fontFamily);
    assert.match(font, /Fira Sans Condensed/);
    assert.equal(await page.locator('.bz-sidebar__logo').evaluate(img => img.complete && img.naturalWidth > 0), true);
  } finally { await browser.close(); }
});
