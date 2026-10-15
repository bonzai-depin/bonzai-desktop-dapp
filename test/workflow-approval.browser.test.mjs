import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
async function prepare(page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><style>*{box-sizing:border-box}body{margin:0;background:var(--bz-canvas);color:var(--bz-fg)}</style></head><body><div id="app"></div></body></html>');
}
test('a stale desktop bridge blocks new task generation before expensive work begins', { skip: !url, timeout: 30000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(); await prepare(page);
    await page.evaluate(async () => {
      window.fixture = { writes: 0 };
      window.electronAPI = { db: { issues: { create: async () => { fixture.writes++; throw Error('Should not create'); } } } };
      const { createApp } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Task } = await import('/src/components/company/CompanyWorkflowTask.vue');
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      createApp(Task, { charter: { id: 'team', name: 'Meditation', roles: { CEO: { companion: 'guide' } } }, roleKey: 'CEO', skill: { id: 'meditation-forge-v1.0.0', name: 'Meditation Forge', execution: { type: 'custom' } } }).use(createI18nPlugin()).mount('#app');
    });
    await page.getByRole('status').filter({ hasText: 'Task saving needs the updated desktop app.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start task', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => fixture.writes), 0);
  } finally { await browser.close(); }
});
test('broker actions approve exact arguments once and cannot claim unenforced portfolio limits', { skip: !url, timeout: 30000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } }); page.setDefaultTimeout(7000); page.on('pageerror', error => console.error('BROKER FIXTURE:', error.message)); await prepare(page);
    await page.evaluate(async () => {
      window.fixture = { calls: [], outputs: [] };
      window.electronAPI = { robinhood: {
        status: async () => ({ status: 'connected', tools: [{ name: 'place_order', classification: 'mutation', description: 'Place exactly the reviewed order' }] }),
        onState: () => () => {},
        callTool: async args => { fixture.calls.push(args); return { receipt: 'fixture-order-123' }; },
      } };
      const { createApp } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Council } = await import('/src/components/RobinhoodCouncil.vue');
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      createApp(Council, { onResultCreated: result => fixture.outputs.push(result) }).use(createI18nPlugin()).mount('#app');
    });
    const run = page.getByRole('button', { name: 'Confirm & run', exact: true });
    await run.waitFor();
    assert.equal(await run.isDisabled(), true);
    const params = page.getByRole('textbox');
    await params.fill('{"symbol":"TEST","quantity":1}');
    await page.getByRole('checkbox').check();
    assert.equal(await run.isEnabled(), true);
    await params.fill('{"symbol":"TEST","quantity":2}');
    assert.equal(await run.isDisabled(), true, 'Editing an approved order invalidates that approval');
    await page.getByRole('checkbox').check(); await run.click();
    assert.equal(await run.isDisabled(), true, 'Approval is consumed once');
    assert.deepEqual(await page.evaluate(() => fixture.calls), [{ name: 'place_order', arguments: { symbol: 'TEST', quantity: 2 }, approved: true }]);
    assert.equal(await page.evaluate(() => fixture.outputs[0].tool), 'place_order');
    assert.equal(await page.getByText('Applied before execution', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('spinbutton').count(), 0, 'Unenforced numeric controls are gone');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally { await browser.close(); }
});
