import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;

async function mountWorkflowTeam(page, { holdCatalog = false } = {}) {
  // Mount only the view in an isolated browser. All reads are fixtures, writes
  // and inference throw, and requests outside the renderer origin are blocked.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  await page.route('**/src/components/SmartAgent.vue*', route => route.fulfill({
    contentType: 'text/javascript', body: `export default { render() { throw new Error('This fixture must not start the workflow runtime'); } };`,
  }));
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent(`<html data-theme="waveform"><head>
    <link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css">
    <link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fields.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css">
    <style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}</style>
    </head><body><div id="app"></div></body></html>`);
  await page.evaluate(async ({ holdCatalog }) => {
    const fixture = window.workflowScopeFixture = { prohibitedCalls: [] };
    const workflowId = 'meditation-forge-v1.0.0', companyId = 'workflow-scope-fixture';
    const agents = [{ id: 'meditation-worker', name: 'Meditation worker', assignedWorkflowIds: [workflowId] }];
    const prohibited = name => () => { fixture.prohibitedCalls.push(name); throw new Error(`This fixture must not call ${name}`); };
    window.electronAPI = {
      store: { get: async () => [] },
      db: {
        companions: { list: async () => agents },
        teams: { list: async () => [], directory: async () => [], onChanged: () => () => {} },
        issues: { create: prohibited('issues.create'), update: prohibited('issues.update'), saveWorkflowResult: prohibited('issues.saveWorkflowResult'), reviewWorkflowResult: prohibited('issues.reviewWorkflowResult') },
      },
      localExecutionStatus: async () => ({ loaded: 0, loading: 0, activeRequests: 0, activityComplete: true, observedAt: Date.now() }),
      checkModel: async () => true,
      onDownloadProgress: () => () => {},
      downloadModel: prohibited('downloadModel'), ensureModel: prohibited('ensureModel'),
      loadModel: prohibited('loadModel'), inferenceRequest: prohibited('inferenceRequest'),
    };
    const { createApp, h, reactive } = await import('/node_modules/.vite/deps/vue.js');
    const { skillService } = await import('/src/services/skill.service.js');
    fixture.availableSkill = { id: workflowId, name: 'Meditation Forge', description: 'Create a guided meditation.', inputs: {}, execution: { type: 'custom', entrypoint: 'MeditationForgeSkill' } };
    fixture.catalog = [fixture.availableSkill];
    if (holdCatalog) fixture.catalogReady = new Promise(resolve => { fixture.releaseCatalog = resolve; });
    skillService.initializeSkills = async () => { if (fixture.catalogReady) await fixture.catalogReady; };
    skillService.getAllSkills = () => fixture.catalog;
    const { listAllLLMs } = await import('/src/skills/flagship.js');
    const model = listAllLLMs().find(item => !item.draft && item.filename && item.url);
    const { default: View } = await import('/src/components/company/CompanyDashboard.vue');
    const { default: store } = await import('/src/stores/companyStore.js');
    const { makeCharter } = await import('/src/services/company/charter.js');
    const { buildWorkspaceBlueprint } = await import('/src/services/company/workspaceBlueprints.js');
    const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
    i18n.setLocale('en');
    store.refreshActive = async () => {};
    store.tickRoleNow = prohibited('tickRoleNow');
    store.pause = prohibited('pause'); store.resume = prohibited('resume');
    const charter = reactive(makeCharter({
      id: companyId, name: 'UGC · Meditation Forge',
      roles: { CEO: { companion: 'meditation-worker', llm: model.key } },
      workspace: buildWorkspaceBlueprint({ executionWorkflowId: workflowId }),
    }));
    const workflowStep = (status, output) => ({ id: 'workflow-step', status, action: { type: 'runWorkflow', workflowId }, ...(output ? { output } : {}) });
    const task = (id, title, createdBy, goalId, status, step) => ({
      id, companyId, title, createdBy, goalId, status, priority: 'normal', assigneeRole: 'CEO', assigneeCompanion: 'meditation-worker',
      labels: [], createdAt: 1, updatedAt: 1, execution: { steps: [step] },
    });
    const state = reactive({
      ...store.state, audit: [], approvals: [],
      goals: [
        ...Array.from({ length: 25 }, (_, index) => ({ id: `earlier-goal-${index}`, companyId, title: `Earlier autonomous setup ${index}`, createdBy: 'ceo', status: 'active', updatedAt: 100 + index })),
        { id: 'readiness-goal', companyId, title: 'Verify team readiness for new execution', createdBy: 'ceo', status: 'active', updatedAt: 1000 },
        { id: 'initialization-goal', companyId, title: `Initialize workflow ${workflowId}`, createdBy: 'ceo', status: 'active', updatedAt: 1001 },
        { id: 'owner-goal', companyId, title: 'Owner requested evening meditation', createdBy: 'user', status: 'active', updatedAt: 1 },
      ],
      issues: [
        task('owner-brief', 'Evening meditation brief', 'user', null, 'blocked', workflowStep('requires_input')),
        task('owner-delegated', 'Prepare the owner requested script', 'ceo', 'owner-goal', 'blocked', workflowStep('requires_input')),
        task('owner-older', 'Record the owner requested narration', 'user', 'owner-goal', 'open', workflowStep('planned')),
        task('owner-orphan', 'Preserve my imported meditation task', 'user', 'missing-parent-goal', 'blocked', workflowStep('requires_input')),
        task('owner-completed', 'Approved morning meditation', 'user', null, 'done', workflowStep('completed')),
        task('legacy-grants', 'Read the current status of the Grants team to confirm availability', 'ceo', 'readiness-goal', 'blocked', { id: 'record-step', status: 'unknown', action: { type: 'records.snapshot', input: { input: '{kind: workOrder|customerInvoice|supplierInvoice|partsRequest, id: existing owned record ID}' } } }),
        task('legacy-maintenance', 'Read the current status of the Maintenance team to confirm availability', 'ceo', 'readiness-goal', 'blocked', { id: 'team-step', status: 'unknown', action: { type: 'team.reply' } }),
        task('legacy-activation', `Propose the activation parameters for ${workflowId}`, 'ceo', 'initialization-goal', 'blocked', workflowStep('failed', { status: 'requires_input' })),
        task('legacy-configuration', 'Amend the system configuration to enable input collection for the new workflow', 'ceo', 'initialization-goal', 'blocked', workflowStep('failed', { status: 'requires_input' })),
        task('legacy-queued', 'Earlier queued setup', 'ceo', 'initialization-goal', 'open', workflowStep('planned')),
        task('legacy-resumable', 'Earlier paused setup', 'ceo', 'initialization-goal', 'blocked', workflowStep('planned')),
        task('legacy-finished', 'Earlier completed setup', 'ceo', 'initialization-goal', 'done', workflowStep('completed')),
      ],
      catalog: [{ id: 'meditation-result', companyId, title: 'Approved morning narration', pipeline: 'audio', meta: { workflowId, issueId: 'owner-completed' } }],
    });
    fixture.charter = charter; fixture.state = state;
    fixture.app = createApp({ render: () => h(View, { charter, state, initialView: 'studio' }) }).use(createI18nPlugin());
    fixture.app.mount('#app');
  }, { holdCatalog });
  if (holdCatalog) await page.locator('.workflow-studio__loading').waitFor();
  else await page.locator('.workflow-studio__brief').getByRole('heading', { name: 'Meditation Forge', exact: true }).waitFor();
}

test('workflow production keeps owner requests separate from earlier automatic planning', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mountWorkflowTeam(page);
    assert.deepEqual(await page.locator('h1:visible').allTextContents(), ['Meditation Forge'], 'Production has one workflow heading');
    assert.deepEqual(await page.locator('.workflow-studio__counts dd').allTextContents(), ['1', '3', '1'], 'Only owner requests and their delegated subtasks contribute to Production counts');
    const production = page.locator('.workflow-studio');
    assert.equal(await production.getByRole('button', { name: /Prepare the owner requested script/ }).count(), 1, 'A CEO-assigned subtask of an owner goal remains requested work');
    assert.equal(await production.getByRole('button', { name: /activation parameters|system configuration|Grants team|Maintenance team/i }).count(), 0, 'Earlier automatic plans do not occupy Production');
    assert.equal(await production.locator('.workflow-studio__results li').count(), 1, 'Completed requested output remains discoverable');
    await production.getByRole('button', { name: 'All tasks', exact: true }).click();

    const backlog = page.locator('.team-backlog');
    const requestedIds = ['owner-brief', 'owner-delegated', 'owner-older', 'owner-orphan', 'owner-completed'];
    for (const id of requestedIds) await backlog.locator(`[data-issue-id="${id}"]`).waitFor();
    assert.equal(await backlog.locator('[data-issue-id^="legacy-"]').count(), 0, 'Default backlog excludes earlier automatic plans');
    assert.equal(await backlog.locator('[data-issue-id]').count(), requestedIds.length, 'More than twenty newer CEO goals cannot hide older owner work or imported tasks');
    await backlog.getByRole('button', { name: /Earlier automatic planning/ }).click();
    await backlog.getByRole('button', { name: /Load more/ }).click();
    for (const id of ['legacy-grants', 'legacy-maintenance', 'legacy-activation', 'legacy-configuration', 'legacy-queued', 'legacy-resumable', 'legacy-finished']) {
      const row = backlog.locator(`[data-issue-id="${id}"]`);
      await row.waitFor();
      assert.equal(await row.getByRole('button', { name: /\b(?:Continue|Run|Resume|Reopen|Review outcome|Review results)\b/i }).count(), 0, `${id}: earlier plans expose no execution or outcome-review action`);
    }
    assert.equal(await backlog.locator('[data-issue-id^="owner-"]').count(), 0, 'The history view is distinct from the requested backlog');
    await backlog.getByText('These earlier planner-created items are kept for reference. They will not run automatically.', { exact: true }).waitFor();
    await page.evaluate(async () => {
      const { setCompanyWorkflowHandoff } = await import('/src/services/company/workflowHandoff.js');
      setCompanyWorkflowHandoff({ companyId: window.workflowScopeFixture.charter.id, issueId: 'legacy-activation', skillId: 'meditation-forge-v1.0.0', agentId: 'meditation-worker' });
    });
    await page.getByRole('navigation', { name: 'Team workspace', exact: true }).getByRole('button', { name: 'Workflow', exact: true }).click();
    await production.waitFor({ state: 'visible' });
    assert.equal(await production.locator('.workflow-studio__runtime').count(), 0, 'A saved handoff for an earlier automatic plan cannot mount the interactive runtime');
    await production.getByRole('button', { name: 'All tasks', exact: true }).click();
    await backlog.getByRole('button', { name: /Back to requested work/ }).click();
    await backlog.locator('[data-issue-id="owner-older"]').waitFor();

    await page.setViewportSize({ width: 390, height: 900 });
    await backlog.getByRole('button', { name: 'New task', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Meditation Forge', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Start task', exact: true }).isEnabled(), true, 'Backlog opens the workflow’s native interactive task dialog');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'The native task dialog fits a constrained viewport');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await production.isVisible(), true, 'Starting a workflow brief navigates to Production');
    assert.deepEqual(await page.locator('h1:visible').allTextContents(), ['Meditation Forge']);
    assert.deepEqual(await page.evaluate(() => window.workflowScopeFixture.prohibitedCalls), [], 'Inspecting tasks and opening a brief does not execute or mutate work');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('production keeps team controls available while its workflow loads or cannot be found', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mountWorkflowTeam(page, { holdCatalog: true });
    const header = page.locator('.workflow-studio__brief');
    const assertControls = async state => {
      assert.equal(await header.getByRole('button', { name: 'Pause automation', exact: true }).isVisible(), true, `${state}: pause remains available`);
      assert.equal(await header.getByRole('button', { name: 'Full screen', exact: true }).isVisible(), true, `${state}: full screen remains available`);
      assert.equal(await header.getByRole('button', { name: 'New task', exact: true }).isDisabled(), true, `${state}: a missing workflow cannot start a task`);
      assert.equal(await page.locator('h1:visible').count(), 1, `${state}: the team still has one heading`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${state}: team controls fit at a constrained width`);
    };
    await assertControls('Loading');
    await page.evaluate(() => { window.workflowScopeFixture.catalog = []; window.workflowScopeFixture.releaseCatalog(); });
    await page.locator('.workflow-studio__notice[role="alert"]').waitFor();
    await assertControls('Unavailable');
    await page.evaluate(() => { window.workflowScopeFixture.catalog = [window.workflowScopeFixture.availableSkill]; });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.locator('.workflow-studio__counts').waitFor();
    assert.equal(await header.getByRole('button', { name: 'New task', exact: true }).isEnabled(), true, 'The task action recovers after the workflow becomes available');
    assert.deepEqual(await page.locator('h1:visible').allTextContents(), ['Meditation Forge']);
    assert.deepEqual(await page.evaluate(() => window.workflowScopeFixture.prohibitedCalls), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
