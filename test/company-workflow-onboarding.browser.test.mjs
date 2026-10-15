import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
const meditation = { id: 'meditation-forge-v1.0.0', name: 'Meditation Forge', execution: { type: 'custom' }, inputs: { intention: { label: 'Intention' }, duration: { label: 'Minutes' } } };
async function prepare(page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  await page.route('**/src/services/agentWorkflows.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('export async function getAvailableAgentWorkflows() {', 'export async function getAvailableAgentWorkflows() { return window.fixture.catalog;') });
  });
  await page.route('**/src/stores/companyStore.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + '\ncompanyStore.formFromTemplate=async(...args)=>{window.fixture.saved=args;return {id:"created-workflow"};};\ncompanyStore.createGoalForCompany=async()=>{};companyStore.createConnectorForCompany=async()=>{};' });
  });
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html data-theme="bonzai"><head><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><style>*{box-sizing:border-box}body{margin:0;background:var(--bz-canvas);color:var(--bz-fg)}</style></head><body><div id="app"></div></body></html>');
  await page.evaluate(catalog => { window.fixture = { catalog: [catalog], navigation: [] }; window.electronAPI = { store: { get: async () => [] }, db: { issues: { onChanged: () => () => {} } } }; }, meditation);
}
async function mount(page, name, props = {}) {
  await page.evaluate(async ({ name, props }) => {
    const { createApp } = await import('/node_modules/.vite/deps/vue.js');
    const { default: View } = await import(`/src/components/company/${name}.vue`);
    const { createI18nPlugin } = await import('/src/i18n/index.js');
    window.fixture.app = createApp(View, { ...props, onDone: id => fixture.created = id, onTemplates: id => fixture.navigation.push(id || 'all') }).use(createI18nPlugin());
    fixture.app.mount('#app');
  }, { name, props });
}
test('personal workflow setup needs no business identity and keeps the promised outputs visible', { skip: !url, timeout: 45000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } }); await prepare(page);
    await mount(page, 'CompanyIntakeWizard', { initialTemplateId: meditation.id });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await page.getByLabel('Workspace name (optional)', { exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isEnabled(), true);
    assert.equal(await page.getByLabel('Business name *', { exact: true }).count(), 0);
    assert.equal(await page.locator('.connector-section').count(), 0);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByText('Guided narration', { exact: true }).waitFor();
    assert.equal(await page.locator('.demo-row').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, JSON.stringify(await page.locator('body').evaluate(el => [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => [e.tagName,e.className,e.getBoundingClientRect().width]).slice(0,10))));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: '/tmp/bonzai-personal-workflow-setup.png', fullPage: true });
    for (const locale of ['fr', 'es', 'ja', 'ko', 'zh', 'ru', 'en']) {
      await page.evaluate(async locale => { const { i18n } = await import('/src/i18n/index.js'); i18n.setLocale(locale); await (await import('/node_modules/.vite/deps/vue.js')).nextTick(); await document.fonts.ready; }, locale);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${locale} must fit at 390px`);
      const footer = await page.locator('.wiz__actions').boundingBox();
      const button = await page.locator('.wiz__actions-right .bz-btn').boundingBox();
      assert.ok(button.height < 90, `${locale} primary action must remain compact`);
      assert.ok(button.x >= footer.x && button.x + button.width <= footer.x + footer.width, `${locale} action remains within modal`);
    }

    await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
    await page.waitForFunction(() => fixture.created === 'created-workflow');
    const [template, answers, options] = await page.evaluate(() => fixture.saved);
    assert.equal(template, 'business_ops_team');
    assert.equal(answers.businessName, 'Meditation Forge');
    assert.equal(answers.executionWorkflowId, meditation.id);
    assert.equal(options.name, 'Meditation Forge');
    assert.deepEqual(options.initialGoals, []);
    assert.deepEqual(options.connectorKinds, []);
    assert.equal(options.demoMode, false);
  } finally { await browser.close(); }
});
test('operational workflow setup still requires company context and preserves its domain', { skip: !url, timeout: 45000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await prepare(page);
    await mount(page, 'CompanyIntakeWizard', { initialTemplateId: 'hvac_gmao' });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
    await page.getByLabel('Business name *', { exact: true }).fill('CFE');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
    await page.waitForFunction(() => fixture.created === 'created-workflow');
    const [template, answers] = await page.evaluate(() => fixture.saved);
    assert.equal(template, 'hvac_residential');
    assert.equal(answers.businessName, 'CFE');
    assert.equal(answers.workspaceProfile, 'hvac');
    assert.equal(answers.executionWorkflowId, undefined);
  } finally { await browser.close(); }
});
test('first visit and help explain personal outcomes without inventing an operational team', { skip: !url, timeout: 45000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } }); await prepare(page);
    await mount(page, 'CompanyConversationOnboarding');
    const meditationCard = page.locator('.workflow-start__examples button').filter({ hasText: 'Meditation Forge' });
    await meditationCard.click();
    assert.deepEqual(await page.evaluate(() => fixture.navigation), [meditation.id]);
    assert.equal(await page.evaluate(() => fixture.saved), undefined, 'Browsing a workflow must not form a business reporting team');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: '/tmp/bonzai-workflow-start.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, JSON.stringify(await page.locator('body').evaluate(el => [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => [e.tagName,e.className,e.getBoundingClientRect().width]).slice(0,10))));
    await page.evaluate(() => fixture.app.unmount());
    await mount(page, 'CompanyGettingStarted', { charter: { id: 'personal', name: 'Quiet evenings', workspace: { executionWorkflowId: meditation.id } } });
    await page.getByText('Guided narration', { exact: true }).waitFor();
    assert.equal(await page.getByText('Your first business outcome', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Can the team turn files and emails into work?', { exact: true }).count(), 0);
    await page.getByText('What is Review for?', { exact: true }).click();
    await page.getByText('Review brings together actions needing your permission and task results ready to inspect. It is not an email inbox.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, JSON.stringify(await page.locator('body').evaluate(el => [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => [e.tagName,e.className,e.getBoundingClientRect().width]).slice(0,10))));
  } finally { await browser.close(); }
});
