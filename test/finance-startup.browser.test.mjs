import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('startup overlay preserves layout and financial evidence UI works across themes and widths', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0;background:var(--bz-bg);color:var(--bz-fg)"><main id="workspace" style="padding:180px 24px 24px"><h1>Company workspace</h1><div id="finance"></div></main><div id="status"></div></body></html>');
    await page.evaluate(async () => {
      const { createApp, reactive, h } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Overlay } = await import('/src/components/ServerStatusOverlay.vue');
      const { default: Finance } = await import('/src/components/company/CompanyFinanceRecords.vue');
      window.fixture = reactive({ status: { type: 'starting', show: true }, retries: 0, saved: [] });
      const connectors = [{ id: 'stripe1', kind: 'stripe', label: 'Stripe test account', status: 'active' }];
      window.electronAPI = { companyConnector: { request: async () => ({ data: { available: [{ currency: 'eur', amount: 5000 }], pending: [] } }) }, db: { connectors: { get: async () => connectors[0], update: async () => connectors[0] }, distribution: { publish: async (id, item) => { window.fixture.saved.push(item); return { id: 'evidence1' }; } }, audit: { append: async () => ({ id: 'audit1' }) } } };
      createApp({ render: () => window.fixture.status.show ? h(Overlay, { status: window.fixture.status, description: 'Bringing local inference online.', onDismiss: () => window.fixture.status.show = false, onRetry: () => window.fixture.retries++ }) : null }).mount('#status');
      const {createI18nPlugin}=await import('/src/i18n/index.js');
      createApp(Finance, { companyId: 'company1', connectors }).use(createI18nPlugin()).mount('#finance');
    });
    await page.locator('.server-overlay').waitFor();
    for (const width of [360, 800, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['default', 'light', 'warm', 'terminal', 'trackline']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        const boxes = await page.evaluate(() => ({ overlay: document.querySelector('.server-overlay').getBoundingClientRect().toJSON(), workspace: document.querySelector('#workspace').getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth > innerWidth }));
        assert.equal(boxes.overlay.x, 0); assert.equal(boxes.overlay.width, width); assert.equal(boxes.workspace.y, 0); assert.equal(boxes.overflow, false);
      }
    }
    await page.locator('.finance-records select').first().selectOption('stripe1');
    await page.getByRole('button', { name: 'Import records' }).click();
    await page.getByText('Evidence saved in Deliverables.').waitFor();
    assert.equal(await page.evaluate(() => window.fixture.saved.length), 1);
    await page.evaluate(() => { window.fixture.status.type = 'error'; window.fixture.status.message = 'A long local engine error '.repeat(40); window.fixture.status.canRetry = true; });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.retries), 1);
    await page.screenshot({ path: '/tmp/bonzai-finance-startup.png', fullPage: true });
    await page.getByRole('button', { name: 'Dismiss server status' }).click();
    assert.equal(await page.locator('.server-overlay').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Paperasse teams are selectable and require dossier context before creating a live workspace', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    await page.route('**/src/stores/companyStore.js', route => route.fulfill({ contentType: 'application/javascript', body: `export default { formFromTemplate: async (...args) => { window.formed = args; return { id: 'company1' }; }, createConnectorForCompany: async () => {}, createGoalForCompany: async () => {} };` }));
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body><div id="wizard"></div></body></html>');
    await page.evaluate(async () => {
      const { createApp } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Wizard } = await import('/src/components/company/CompanyIntakeWizard.vue');
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      createApp(Wizard).use(createI18nPlugin(i18n)).mount('#wizard');
    });
    await page.locator('.workflow-card').filter({ hasText: 'French accounting & close' }).click();
    await page.getByRole('button', { name: /^Next/ }).click();
    assert.equal(await page.getByRole('button', { name: /^Next/ }).isDisabled(), true);
    await page.locator('#company-business-name').fill('Atelier Test');
    for (const [key, value] of Object.entries({ legalIdentity: 'Example SAS, SIREN pending', fiscalRegime: 'IS / monthly VAT', period: '2026-01-01 to 2026-01-31', evidence: 'Qonto and Stripe records; receipts to collect', reviewer: 'Company accountant' })) await page.locator(`#paperasse-${key}`).fill(value);
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.waitForFunction(() => window.formed);
    const formed = await page.evaluate(() => window.formed);
    assert.equal(formed[0], 'paperasse_accounting');
    assert.equal(formed[1].fiscalRegime, 'IS / monthly VAT');
    assert.equal(formed[2].demoMode, false);
    assert.equal(formed[2].treasury.currency, 'EUR');
    assert.ok(formed[2].connectorKinds.includes('qonto'));
  } finally { await browser.close(); }
});
