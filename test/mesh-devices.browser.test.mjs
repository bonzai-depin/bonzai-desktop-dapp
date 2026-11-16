import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
const shots = process.env.BONZAI_UI_SHOTS;

test('first run links a nearby device with a code and recommends a larger pooled model', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html data-theme="warm"><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body><div id="fixture"></div></body></html>');
    await page.evaluate(async () => {
      // A laptop that finds one unlinked BonzAI device on its network.
      const view = { ok: true, started: true, self: { peerId: 'self', name: 'Laptop', memBudget: 16 * 0.7e9, persistentIdentity: true }, devices: [], nearby: 1, invitation: null, settings: { sharing: true, pooling: 'auto', name: '' }, pool: { active: false, devices: [] }, pooledBudget: 16 * 0.7e9 };
      window.meshCalls = [];
      window.electronAPI = {
        systemInformation: async () => ({ platform: 'darwin', gpu: 'Apple M2', memBudget: 16 * 0.7e9 }),
        p2pStatus: async () => ({ ok: true, started: true, connectedPeers: 1, lanPeers: 1 }),
        store: { get: async (_key, fallback) => fallback },
        mesh: {
          state: async () => structuredClone(view),
          invite: async () => { view.invitation = { code: 'K7QM-3XWD', expiresAt: Date.now() + 300000 }; return { ok: true, invitation: view.invitation }; },
          cancelInvite: async () => { view.invitation = null; return { ok: true }; },
          join: async (code) => {
            window.meshCalls.push(code);
            if (code.replace(/[^a-z0-9]/gi, '').toUpperCase() !== 'K7QM3XWD') return { ok: false, error: 'invalid_code' };
            view.devices = [{ peerId: 'studio', name: 'Mac Studio', memBudget: 96e9, online: true, sharing: true }];
            view.nearby = 0; view.pooledBudget = 16 * 0.7e9 + 96e9 * 0.85;
            return { ok: true, device: view.devices[0] };
          },
          unlink: async () => { view.devices = []; view.nearby = 1; view.pooledBudget = 16 * 0.7e9; return { ok: true }; },
          updateSettings: async patch => { Object.assign(view.settings, patch); return { ok: true, settings: view.settings }; },
        },
      };
      localStorage.removeItem('bonzai.preferredLlm');
      const { createApp } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Welcome } = await import('/src/components/FirstRunWelcome.vue');
      const { default: meshStore } = await import('/src/stores/meshStore.js');
      await meshStore.refresh();
      const app = createApp(Welcome, { onComplete: mode => { window.completed = mode; } });
      app.config.globalProperties.$ui = text => text; app.mount('#fixture');
    });

    // Alone, a 16 GB laptop gets the 9B model; the nearby device is announced but shares nothing.
    await page.getByText('Qwen3.5 9B', { exact: false }).first().waitFor();
    await page.getByText('BonzAI found on 1 nearby device').waitFor();
    assert.equal(await page.locator('.mesh-devices__list li').count(), 0);
    if (shots) await page.screenshot({ path: `${shots}/welcome-mesh-before.png`, fullPage: false });

    // This device can show a code for the other one to type.
    await page.getByRole('button', { name: 'Show a code' }).click();
    await page.getByText('K7QM-3XWD').waitFor();
    if (shots) await page.locator('.mesh-devices').screenshot({ path: `${shots}/welcome-mesh-code.png` });
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Or type the code shown there. A wrong code explains itself and links nothing.
    await page.getByRole('button', { name: 'Enter a code' }).click();
    const input = page.getByLabel('Code shown on your other device');
    assert.equal(await input.evaluate(element => element === document.activeElement), true);
    await input.fill('AAAA-AAAA');
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await page.getByRole('alert').getByText('That code did not match').waitFor();
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('.mesh-devices__list li').count(), 0);

    await input.fill('k7qm-3xwd');
    await page.keyboard.press('Enter');
    await page.getByText('Mac Studio').waitFor();
    await page.getByText('93 GB combined').waitFor();
    // The recommendation now uses the pool, and still names the standalone choice.
    await page.getByText('With your linked devices').waitFor();
    await page.getByText('Qwen3.5 27B', { exact: false }).first().waitFor();
    await page.getByText('On this device alone: Qwen3.5 9B', { exact: false }).waitFor();
    if (shots) await page.screenshot({ path: `${shots}/welcome-mesh-linked.png` });

    for (const theme of ['warm', 'light']) for (const width of [1280, 800, 390]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${theme} ${width}px overflows`);
      const unlink = await page.getByRole('button', { name: 'Unlink Mac Studio' }).boundingBox();
      assert.ok(unlink.width >= 36 && unlink.height >= 36);
      if (shots) await page.locator('.mesh-devices').screenshot({ path: `${shots}/welcome-mesh-${theme}-${width}.png` });
    }

    // Unlinking returns to the standalone recommendation.
    await page.getByRole('button', { name: 'Unlink Mac Studio' }).click();
    await page.getByText('Selected for your device').waitFor();
    assert.equal(await page.locator('.mesh-devices__list li').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.meshCalls), ['AAAA-AAAA', 'k7qm-3xwd']);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
