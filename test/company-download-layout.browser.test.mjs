import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;

async function mountTeam(page) {
  // All model operations are local mocks. Nothing in this fixture may contact
  // a model host, connector, or inference service.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent(`<html data-theme="waveform"><head>
    <link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css">
    <link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fields.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css">
    <style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}</style>
    </head><body><div id="app"></div></body></html>`);
  await page.evaluate(async () => {
    const fixture = window.teamDownloadFixture = {
      installed: new Set(), downloads: [], cancellations: [], progressListeners: new Set(), pending: new Map(),
      mode: 'hold', inferenceCalls: [],
    };
    const agents = [{ id: 'download-worker', name: 'James Whitmore', assignedWorkflowIds: ['team-download-workflow'] }];
    const forbiddenInference = name => () => { fixture.inferenceCalls.push(name); throw new Error('The download fixture must not start inference'); };
    window.electronAPI = {
      store: { get: async () => [] },
      db: { companions: { list: async () => agents }, teams: { list: async () => [], directory: async () => [], onChanged: () => () => {} } },
      localExecutionStatus: async () => ({ loaded: 0, loading: 0, activeRequests: 0, activityComplete: true, observedAt: Date.now() }),
      checkModel: async filename => fixture.installed.has(filename),
      onDownloadProgress: listener => { fixture.progressListeners.add(listener); return () => fixture.progressListeners.delete(listener); },
      downloadModel: async (downloadUrl, filename) => {
        fixture.downloads.push({ url: downloadUrl, filename });
        if (fixture.mode === 'fail') return { error: 'Fixture download failed' };
        if (fixture.mode === 'success') { fixture.installed.add(filename); return { savedPath: `/mock/models/${filename}` }; }
        return new Promise(resolve => fixture.pending.set(filename, resolve));
      },
      cancelModelDownload: async filename => {
        fixture.cancellations.push(filename);
        fixture.pending.get(filename)?.({ canceled: true });
        fixture.pending.delete(filename);
        return { canceled: true };
      },
      ensureModel: forbiddenInference('ensureModel'),
      loadModel: forbiddenInference('loadModel'),
      inferenceRequest: forbiddenInference('inferenceRequest'),
    };
    fixture.emitProgress = (filename, percent) => {
      for (const listener of fixture.progressListeners) listener({}, { filename, percent });
    };
    const { createApp, h, reactive } = await import('/node_modules/.vite/deps/vue.js');
    const { skillService } = await import('/src/services/skill.service.js');
    skillService.initializeSkills = async () => {};
    skillService.getAllSkills = () => [{
      id: 'team-download-workflow', name: 'Meditation Forge', description: 'A guided meditation ready to listen to',
      inputs: { topic: { type: 'string', label: 'Meditation topic', required: true } },
    }];
    const { listAllLLMs } = await import('/src/skills/flagship.js');
    const seen = new Set();
    // Two distinct files let the fixture prove cancellation stops the queued
    // team download without cancelling any unrelated download.
    const models = listAllLLMs().filter(model => !model.draft && model.filename && model.url && !seen.has(model.filename) && seen.add(model.filename)).slice(0, 2);
    if (models.length !== 2) throw new Error('The fixture needs two downloadable language models');
    fixture.models = models.map(({ key, filename, name }) => ({ key, filename, name }));
    const { default: View } = await import('/src/components/company/CompanyDashboard.vue');
    const { default: store } = await import('/src/stores/companyStore.js');
    const { makeCharter } = await import('/src/services/company/charter.js');
    const { buildWorkspaceBlueprint } = await import('/src/services/company/workspaceBlueprints.js');
    const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
    i18n.setLocale('en');
    const charter = reactive(makeCharter({
      id: 'team-download-fixture', name: 'Meditation Forge',
      roles: { CEO: { companion: 'download-worker', llm: models[0].key }, CFO: { companion: 'download-worker', llm: models[1].key } },
      workspace: buildWorkspaceBlueprint({ executionWorkflowId: 'team-download-workflow' }),
    }));
    const state = reactive({
      ...store.state, audit: [], goals: [], catalog: [], approvals: [],
      issues: [{ id: 'meditation-brief', title: 'Meditation Forge', status: 'blocked', assigneeRole: 'CEO', execution: { steps: [{ status: 'requires_input', action: { type: 'runWorkflow', workflowId: 'team-download-workflow' } }] } }],
    });
    fixture.charter = charter; fixture.state = state;
    fixture.app = createApp({ render: () => h(View, { charter, state, initialView: 'studio' }) }).use(createI18nPlugin());
    fixture.app.mount('#app');
  });
  await page.locator('.company-model-requirements').waitFor();
  await page.locator('.workflow-studio__brief').getByRole('heading', { name: 'Meditation Forge', exact: true }).waitFor();
}

async function settleLayout(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function assertLayout(page, width, theme) {
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.company-model-requirements');
    const header = document.querySelector('.workflow-studio__brief');
    const panelRect = panel.getBoundingClientRect(), headerRect = header.getBoundingClientRect();
    const bounds = element => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const overview = document.querySelector('.workflow-studio__overview');
    return {
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      panelOverflow: panel.scrollWidth > panel.clientWidth + 1,
      headerOverflow: header.scrollWidth > header.clientWidth + 1,
      gapAbove: panelRect.top - headerRect.bottom,
      headingGap: headerRect.top - document.querySelector('.company-view-nav').getBoundingClientRect().bottom,
      gapBelow: overview.getBoundingClientRect().top - panelRect.bottom,
      panel: bounds(panel), header: bounds(header),
      panelTitle: bounds(panel.querySelector('.bz-download-requirement__title')),
      workflowTitle: bounds(header.querySelector('.workflow-studio__identity')),
      downloadButton: bounds(panel.querySelector('button')),
      newTaskButton: bounds(header.querySelector('.workflow-studio__actions > button')),
    };
  });
  const context = `${theme}/${width}`;
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  assert.equal(layout.pageOverflow || layout.panelOverflow || layout.headerOverflow, false, `${context}: team download and workflow fit without horizontal overflow`);
  assert.ok(layout.headingGap >= 24, `${context}: the single team heading has breathing room below navigation`);
  assert.ok(layout.gapAbove >= (width > 600 ? 24 : 20), `${context}: team heading remains separated from the download requirement (${layout.gapAbove}px)`);
  assert.ok(layout.gapBelow >= 24, `${context}: download requirement is separated from production steps (${layout.gapBelow}px)`);
  assert.ok(layout.panel.left >= 0 && layout.panel.right <= width && layout.header.right <= width, `${context}: both sections stay within the viewport`);
  assert.ok(layout.downloadButton.left >= layout.panel.left && layout.downloadButton.right <= layout.panel.right, `${context}: download action stays inside its requirement`);
  assert.ok(layout.newTaskButton.left >= layout.header.left && layout.newTaskButton.right <= layout.header.right, `${context}: new-task action stays inside its heading`);
  assert.equal(overlaps(layout.panelTitle, layout.downloadButton), false, `${context}: download action does not cover its title`);
  assert.equal(overlaps(layout.workflowTitle, layout.newTaskButton), false, `${context}: new-task action does not cover workflow identity`);
  assert.equal(overlaps(layout.downloadButton, layout.newTaskButton), false, `${context}: download and new-task controls remain separate`);
}

test('team model requirements stay separated from the real production view and support safe download recovery', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [], dialogs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await mountTeam(page);
    const panel = page.locator('.company-model-requirements');
    const newTask = page.locator('.workflow-studio__brief').getByRole('button', { name: 'New task', exact: true });
    const download = panel.getByRole('button', { name: /^Download(?: all)?$/, exact: true });
    assert.equal(await page.locator('.company-model-alert').count(), 0, 'Production uses the shared requirement instead of the legacy alert');
    assert.equal(await page.locator('.bz-download-requirement').count(), 1, 'The team requirement is shown once');
    const categories = await panel.locator('.bz-download-requirement__name').allTextContents();
    assert.ok(categories.length > 0 && categories.every(category => category === category.toLowerCase() && /language/.test(category)), 'The requirement presents lowercase download categories');
    const names = await page.evaluate(() => window.teamDownloadFixture.models.flatMap(model => [model.name, model.filename]).filter(Boolean));
    const panelText = (await panel.innerText()).toLowerCase();
    assert.ok(names.every(name => !panelText.includes(name.toLowerCase())), 'Internal model names and filenames do not appear in the requirement');
    assert.equal(await newTask.isEnabled(), true, 'A missing team model does not block writing a brief');

    for (const theme of ['waveform', 'light']) {
      for (const width of [1440, 390]) {
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; window.scrollTo(0, 0); }, theme);
        await page.setViewportSize({ width, height: 1000 });
        await settleLayout(page);
        await assertLayout(page, width, theme);
        await page.screenshot({ path: `/tmp/bonzai-team-download-${width}-${theme}.png`, fullPage: false });
      }
    }

    await download.click();
    await page.waitForFunction(() => window.teamDownloadFixture.pending.size === 1);
    const firstFilename = await page.evaluate(() => window.teamDownloadFixture.downloads[0].filename);
    await page.evaluate(filename => window.teamDownloadFixture.emitProgress(filename, 0.37), firstFilename);
    await page.waitForFunction(() => document.querySelector('.company-model-requirements progress')?.value > 0);
    const progress = await panel.getByRole('progressbar').getAttribute('value');
    assert.ok(Number(progress) > 0 && Number(progress) <= 37, 'Active download progress is visible, including an aggregate progress value');
    await page.evaluate(() => window.teamDownloadFixture.emitProgress('unrelated-background-model.gguf', 0.99));
    await settleLayout(page);
    assert.equal(await panel.getByRole('progressbar').getAttribute('value'), progress, 'Another download cannot alter team download progress');
    assert.equal(await newTask.isEnabled(), true, 'Brief creation stays available during a model download');
    await assertLayout(page, 390, 'light');
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    await download.waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => window.teamDownloadFixture.cancellations), [firstFilename], 'Cancel targets only the active team file');
    assert.equal(await page.evaluate(() => window.teamDownloadFixture.downloads.length), 1, 'Cancel stops the remaining team download queue');
    assert.equal(await panel.locator('[role="alert"]').count(), 0, 'Cancellation is not presented as a download failure');

    await page.evaluate(() => { window.teamDownloadFixture.mode = 'fail'; });
    await download.click();
    await panel.getByRole('alert').waitFor();
    assert.match(await panel.getByRole('alert').innerText(), /Download failed/i, 'A failure is actionable inside the requirement');
    assert.equal(await download.isEnabled(), true, 'A failed download can be retried');
    assert.equal(await newTask.isEnabled(), true, 'A failed download preserves access to a new brief');
    await assertLayout(page, 390, 'light');

    await page.evaluate(() => { window.teamDownloadFixture.mode = 'success'; });
    await download.click();
    await panel.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.teamDownloadFixture.installed.size), 2, 'A retry installs both required role models');
    assert.equal(await page.locator('.workflow-studio__brief').isVisible(), true, 'The production workspace remains available once downloads finish');
    assert.deepEqual(await page.evaluate(() => window.teamDownloadFixture.inferenceCalls), [], 'Managing downloads never starts inference');
    assert.deepEqual(dialogs, [], 'Download failures use inline feedback instead of blocking alerts');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
