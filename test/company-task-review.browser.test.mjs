import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('outcome review requires evidence, keeps exact task identity and surfaces persistence errors', { skip: !url, timeout: 45000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0;background:var(--bz-canvas)"><div id="fixture"></div></body></html>');
    await page.evaluate(async () => {
      const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Review } = await import('/src/components/company/CompanyTaskReview.vue');
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      window.reviewFixture = { failed: true, calls: [], saved: false };
      window.electronAPI = { db: { issues: { reconcileExecution: async (...args) => { window.reviewFixture.calls.push(args); if (window.reviewFixture.failed) throw new Error('Fixture storage unavailable'); } } } };
      const issue = { id: 'fixture-task', title: 'Prepare the approved maintenance invoice', lastError: 'Execution was interrupted. Verify the saved receipt.', assigneeRole: 'BillingController', execution: { version: 1, steps: [{ id: 'invoice', status: 'unknown', action: { type: 'gmao.saveInvoice', workOrderId: 'fixture-work-order' }, output: { id: 'fixture-invoice', status: 'draft', totalCents: 21000 } }] } };
      createApp({ setup() { const open = ref(true); return () => open.value ? h(Review, { companyId: 'fixture-company', issue, onClose: () => open.value = false, onSaved: () => window.reviewFixture.saved = true }) : h('p', 'Review saved'); } }).use(createI18nPlugin(i18n)).mount('#fixture');
    });
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('combobox').first().inputValue(), 'invoice');
    assert.equal(await page.getByRole('button', { name: 'Save review' }).isDisabled(), true);
    await page.getByText('Saved inputs and result', { exact: true }).click();
    assert.match(await page.locator('pre').innerText(), /fixture-invoice/);
    for (const theme of ['default', 'light']) for (const width of [1280, 360]) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth), `${theme}/${width} fits`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 1280) await page.screenshot({ path: `/tmp/bonzai-company-review-${theme}.png` });
    }
    await page.getByRole('textbox').fill('Verified invoice draft INV-FIX in the local maintenance register.');
    await page.getByRole('button', { name: 'Save review' }).click();
    await page.getByRole('alert').filter({ hasText: 'Fixture storage unavailable' }).waitFor();
    assert.equal(await page.evaluate(() => window.reviewFixture.saved), false);
    await page.evaluate(() => window.reviewFixture.failed = false);
    await page.getByRole('button', { name: 'Save review' }).click();
    await page.getByText('Review saved', { exact: true }).waitFor();
    const calls = await page.evaluate(() => window.reviewFixture.calls);
    assert.deepEqual(calls[1], ['fixture-company', 'fixture-task', 'invoice', { decision: 'completed', evidence: 'Verified invoice draft INV-FIX in the local maintenance register.' }]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
