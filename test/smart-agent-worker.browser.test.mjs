import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('worker inbox distinguishes unverified briefs and remains usable at constrained widths', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0;padding:16px;background:var(--bz-canvas);color:var(--bz-fg)"><div id="fixture"></div></body></html>');
    await page.evaluate(async () => {
      window.workerInbox = [{ id: 'fixture', packet: { terms: { title: 'Produce a customer meditation session', outcome: 'Five minutes, French narration and a cover image. Review all deliverables before payment.' } } }];
      window.electronAPI = { store: { get: async (_, fallback) => fallback }, agentJobsInbox: async () => window.workerInbox, agentJobsDismiss: async id => { window.workerInbox = window.workerInbox.filter(item => item.id !== id); } };
      const { createApp, h, toRaw } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Panel } = await import('/src/components/SmartAgentJobsPanel.vue');
      const { web3Service } = await import('/src/services/web3.service.js');
      toRaw(web3Service.state).walletAddress = '0x0000000000000000000000000000000000000001';
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      createApp({ render: () => h(Panel, { companyId: 'fixture-company', charter: { id: 'fixture-company', roles: {} } }) }).use(createI18nPlugin(i18n)).mount('#fixture');
    });
    await page.getByText('Incoming assignments', { exact: true }).waitFor({ timeout: 10000 }).catch(async error => { console.log(await page.locator('body').innerText(), errors); throw error; });
    assert.equal(await page.getByRole('button', { name: 'Verify and import' }).isDisabled(), true);
    assert.match(await page.locator('#fixture').innerText(), /Unverified brief/);
    for (const theme of ['default', 'light']) for (const width of [1280, 360]) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width} fits`);
      if (width === 1280) await page.screenshot({ path: `/tmp/bonzai-worker-inbox-${theme}.png` });
    }
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.getByText('Incoming assignments', { exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
