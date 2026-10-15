import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
async function mount(page, mixed = false) {
  const errors = []; page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/buttons.css"><style>body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}*{box-sizing:border-box}@media(max-width:600px){body{padding:12px}}</style><div id="app"></div>');
  await page.evaluate(async mixed => {
    window.hubFixture = { opened: [], briefs: [], ticks: [], refreshes: 0, browses: 0 };
    window.electronAPI = { store: { get: async () => [] }, db: { teams: { list: async () => [], directory: async () => [], onChanged: () => () => {} } } };
    const source = await (await fetch('/src/components/company/CompanyAllTeamsRoom.vue')).text();
    const runtime = source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)?.[1] || '/node_modules/.vite/deps/vue.js';
    const storeUrl = source.match(/from ["']([^"']*\/stores\/companyStore\.js[^"']*)["']/)?.[1] || '/src/stores/companyStore.js';
    const localeUrl = source.match(/from ["']([^"']*\/i18n\/index\.js[^"']*)["']/)?.[1] || '/src/i18n/index.js';
    const { createApp, h, reactive } = await import(runtime);
    const { default: store } = await import(storeUrl);
    store.createGoalForCompany = async (id, value) => { window.hubFixture.briefs.push({ id, ...value }); return { createdIssues: [{ assigneeRole: 'CEO' }] }; };
    store.tickRoleForCompany = async (id, role) => { window.hubFixture.ticks.push({ id, role }); };
    store.refreshList = async () => {};
    const { i18n, createI18nPlugin } = await import(localeUrl); i18n.setLocale('en'); window.hubFixture.locale = i18n;
    const workflowId = 'meditation-forge-v1.0.0';
    const task = (id, extra = {}) => ({ id, companyId: 'meditation', title: id, createdBy: 'user', status: 'blocked', assigneeRole: 'CEO', ...extra });
    const ready = task('Evening meditation', { goalId: 'owner', execution: { steps: [{ action: { type: 'runWorkflow', workflowId }, status: 'requires_input', output: { status: 'ready_for_review', contentIds: ['narration'] } }] } });
    const bundles = reactive([
      { company: { id: 'meditation', name: 'My evenings', status: 'active', workspace: { executionWorkflowId: workflowId } },
        issues: [ready, task('Morning brief'), task('Finished session', { status: 'done' }), task('Foreign task', { companyId: 'other' }), task('Old invented grants task', { createdBy: 'ceo', goalId: 'legacy' })],
        goals: [{ id: 'owner', title: 'Evening session', createdBy: 'user' }, { id: 'legacy', title: 'Old invented company plan', createdBy: 'ceo' }],
        approvals: [{ id: 'legacy-approval', companyId: 'meditation', issueId: 'Old invented grants task' }],
        catalog: [{ id: 'narration', companyId: 'meditation', pipeline: 'audio' }, { id: 'script', companyId: 'meditation', pipeline: 'text' }, { id: 'foreign-result', companyId: 'other', pipeline: 'text' }],
        audit: [{ id: 'saved', action: 'publishContent', kind: 'production', note: 'Evening narration saved', ts: Date.now() }, { id: 'old-audit', issueId: 'Old invented grants task', action: 'records.snapshot', note: 'Inspect Grants company', ts: Date.now() }],
      },
      { company: { id: 'comparison', name: 'Research lab', status: 'paused', workspace: { executionWorkflowId: 'mass-chat-v1.0.0' } }, issues: [], goals: [], approvals: [], catalog: [{ id: 'answers', pipeline: 'text' }], audit: [] },
    ]);
    if (mixed) bundles.push(...['Maintenance', 'Purchasing'].map(name => ({ company: { id: name.toLowerCase(), name, status: 'active', template: { id: name === 'Maintenance' ? 'hvac_gmao' : 'purchasing_team' } }, issues: [], catalog: [], approvals: [], goals: [], audit: [] })));
    window.hubFixture.bundles = bundles;
    const { default: View } = await import('/src/components/company/CompanyAllTeamsRoom.vue');
    createApp({ render: () => h(View, { bundles, onOpenTeam: (...args) => window.hubFixture.opened.push(args), onRefresh: () => window.hubFixture.refreshes++, onBrowse: () => window.hubFixture.browses++ }) }).use(createI18nPlugin()).mount('#app');
  }, mixed);
  await page.getByRole('heading', { name: 'My workflows', exact: true }).waitFor(); return errors;
}

test('personal workflow hub shows scoped tasks and saved results, routes reviews, and has no business brief', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = await mount(page);
    const cards = page.locator('.team-portfolio__card'); assert.equal(await cards.count(), 2);
    assert.deepEqual(await cards.first().locator('.team-portfolio__counts strong').allTextContents(), ['2', '1', '2']);
    assert.deepEqual(await cards.nth(1).locator('.team-portfolio__counts strong').allTextContents(), ['0', '0', '1']);
    assert.equal(await page.locator('.all-composer').count(), 0);
    assert.equal(await page.locator('.all-room__scope').count(), 0);
    assert.equal(await page.locator('.all-room__exchanges').count(), 0);
    await cards.first().getByRole('button', { name: '2 Results', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.hubFixture.opened.at(-1)), ['meditation', 'deliverables', '']);
    await page.getByRole('textbox', { name: 'Find a workflow' }).fill('model');
    assert.equal(await cards.count(), 1); assert.match(await cards.innerText(), /Research lab/);
    await page.getByRole('textbox', { name: 'Find a workflow' }).fill('nothingmatches');
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    assert.equal(await cards.count(), 2);
    await page.getByRole('button', { name: 'Open workflow · My evenings', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.hubFixture.opened.at(-1)), ['meditation', '', '']);
    await page.locator('.all-room__activity > summary').click();
    assert.equal(await page.getByText('Old invented company plan', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Inspect Grants company', { exact: true }).count(), 0);
    await page.locator('.all-message__work button').filter({ hasText: 'Evening meditation' }).click();
    assert.deepEqual(await page.evaluate(() => window.hubFixture.opened.at(-1)), ['meditation', 'approvals', 'Evening meditation']);
    await page.getByRole('button', { name: 'Explore workflows', exact: true }).click();
    assert.equal(await page.evaluate(() => window.hubFixture.browses), 1);
    for (const [width, theme, language] of [[1440, 'dark', 'en'], [1440, 'light', 'fr'], [390, 'dark', 'fr'], [390, 'light', 'fr']]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(({ theme, language }) => { document.documentElement.dataset.theme = theme; window.hubFixture.locale.setLocale(language); }, { theme, language });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}`);
      await page.screenshot({ path: `/tmp/bonzai-workflow-overview-${theme}-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a mixed hub sends shared briefs only to operational teams and disables an empty recipient set', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(); const errors = await mount(page, true);
    await page.locator('.all-room__activity > summary').click();
    assert.equal(await page.locator('.all-room__scope button').count(), 3);
    assert.doesNotMatch(await page.locator('.all-room__scope').innerText(), /My evenings|Research lab/);
    await page.getByRole('textbox', { name: 'Brief teams', exact: true }).fill('Prepare next week’s visits and parts.');
    await page.getByRole('button', { name: 'Brief teams', exact: true }).click();
    await page.waitForFunction(() => window.hubFixture.briefs.length === 2 && window.hubFixture.ticks.length === 2);
    assert.deepEqual(await page.evaluate(() => window.hubFixture.briefs.map(item => item.id).sort()), ['maintenance', 'purchasing']);
    await page.evaluate(() => { for (const bundle of window.hubFixture.bundles.filter(bundle => !bundle.company.workspace)) bundle.company.status = 'paused'; });
    await page.getByRole('textbox', { name: 'Brief teams', exact: true }).fill('No one is active.');
    assert.equal(await page.getByRole('button', { name: 'Brief teams', exact: true }).isDisabled(), true);
    await page.locator('.all-room__scope button').filter({ hasText: 'Maintenance' }).click();
    assert.equal(await page.getByRole('button', { name: 'Brief teams', exact: true }).isEnabled(), true, 'a deliberate brief can be queued to a selected paused team');
    await page.getByRole('button', { name: 'Brief teams', exact: true }).click();
    await page.waitForFunction(() => window.hubFixture.briefs.length === 3);
    assert.equal(await page.evaluate(() => window.hubFixture.ticks.length), 2, 'queueing a brief must not resume a paused team');
    await page.evaluate(() => { window.hubFixture.bundles.splice(2); });
    assert.equal(await page.locator('.all-composer').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
