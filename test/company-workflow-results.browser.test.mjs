import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;
test('native task output previews require explicit review of the exact saved files', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg)}</style></head><body><div id="app"></div></body></html>');
    await page.evaluate(async () => {
      const { createApp, h, reactive } = await import('/node_modules/.vite/deps/vue.js');
      const { default: View } = await import('/src/components/company/CompanyWorkflowContext.vue');
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      i18n.setLocale('en');
      const f = window.fixture = reactive({
        companyId: 'team-A', issueId: 'task-A', skillId: 'meditation-forge-v1.0.0',
        saving: false, error: '', savedResult: null, failNext: false, saves: 0, approvals: [], reviewed: [], records: {}, blobRequests: [],
        issue: { id: 'task-A', title: 'A calm start to the day — meditation, narration and cover art', status: 'blocked', execution: { steps: [{ id: 'step-A', status: 'requires_input', action: { type: 'runWorkflow', workflowId: 'meditation-forge-v1.0.0' } }] } }
      });
      const clone = value => JSON.parse(JSON.stringify(value));
      window.electronAPI = { db: {
        issues: {
          get: async (companyId, issueId) => { if (companyId !== f.companyId || issueId !== f.issueId) throw Error('Wrong task'); return clone(f.issue); },
          saveWorkflowResult: async (companyId, issueId, input) => {
            if (f.failNext) { f.failNext = false; throw Error('Disk temporarily unavailable'); }
            f.saves++;
            const records = input.artifacts.map((item, index) => ({ ...item, id: `result-${f.saves}-${index}`, meta: { ...item.meta, issueId, workflowId: input.workflowId } }));
            for (const record of records) f.records[record.id] = record;
            const contentIds = records.map(record => record.id);
            f.issue.execution.steps[0].output = { status: 'ready_for_review', contentIds };
            return { issue: clone(f.issue), records, contentIds };
          },
          reviewWorkflowResult: async (companyId, issueId, stepId, input) => {
            if (JSON.stringify(input.contentIds) !== JSON.stringify(f.issue.execution.steps[0].output.contentIds)) throw Error('The workflow result changed. Review the latest saved results.');
            f.approvals.push({ companyId, issueId, stepId, ...input });
            f.issue.status = 'done'; f.issue.execution.steps[0].status = 'completed';
            return clone(f.issue);
          },
          onChanged: () => () => {},
        },
        distribution: { getRecord: async (companyId, id) => clone(f.records[id]) },
        blobs: { url: async (id, ext, mime) => { f.blobRequests.push({ id, ext, mime }); return 'data:audio/wav;base64,UklGRg=='; } },
      } };
      const { createWorkflowResultCapture } = await import('/src/services/company/workflowResults.js');
      const capture = createWorkflowResultCapture({ taskContext: f, save: (...args) => window.electronAPI.db.issues.saveWorkflowResult(...args), onState: state => { f.saving = state.saving; f.error = state.error; }, onSaved: result => { f.savedResult = result; } });
      window.captureMeditation = async script => capture.capture(f.skillId, { title: 'A calm start', script, imageSrc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY9kAAAAASUVORK5CYII=' });
      createApp({ render: () => h(View, { skillId: f.skillId, taskContext: { companyId: f.companyId, issueId: f.issueId, skillId: f.skillId }, saving: f.saving, saveError: f.error, savedResult: f.savedResult, onRetrySave: capture.retry, onReviewed: issue => f.reviewed.push(issue) }) }).use(createI18nPlugin()).mount('#app');
    });
    await page.getByText('Create the result below.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Review results', exact: true }).count(), 0);
    assert.equal(await page.getByText('Attach result', { exact: true }).count(), 0);
    await page.evaluate(async () => { window.fixture.failNext = true; await window.captureMeditation('Breathe gently and settle into the morning.'); });
    await page.getByRole('alert').filter({hasText: 'Disk temporarily unavailable'}).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.approvals.length), 0);
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await page.getByRole('button', { name: 'Review results', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Breathe gently and settle into the morning.', { exact: false }).waitFor();
    assert.equal(await dialog.locator('img').count(), 1);
    assert.equal(await dialog.locator('textarea').count(), 0, 'No manual paste/attachment step is needed');
    assert.equal(await page.evaluate(() => window.fixture.issue.status), 'blocked', 'Generation alone never approves the result');

    for (const [width, theme] of [[1440, 'waveform'], [390, 'light']]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height <= 900, 'Dialog fits the viewport');
      assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), false, 'No horizontal overflow');
      await dialog.getByRole('button', { name: 'Approve result', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/bonzai-task-review-${width}-${theme}.png` });
    }
    await page.evaluate(() => { window.fixture.error = 'A newer result could not be saved.'; });
    assert.equal(await dialog.getByRole('button', { name: 'Approve result', exact: true }).isDisabled(), true, 'A pending unsaved result prevents approving an older result');
    await page.evaluate(() => { window.fixture.error = ''; });
    await page.evaluate(() => window.captureMeditation('A revised meditation, saved while the previous preview was open.'));
    await dialog.getByRole('button', { name: 'Approve result', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'The workflow result changed.' }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.approvals.length), 0, 'An unseen newer result cannot be approved');
    await dialog.getByRole('button', { name: 'Back to production', exact: true }).click();
    await page.getByRole('button', { name: 'Review results', exact: true }).click();
    await dialog.getByText('A revised meditation', { exact: false }).waitFor();
    await dialog.getByRole('button', { name: 'Approve result', exact: true }).click();
    await page.getByText('Result approved. Find it in Results.', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => [window.fixture.approvals.length, window.fixture.reviewed.length, window.fixture.issue.status]), [1, 1, 'done']);
    await page.getByRole('button', { name: 'View results', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Approve result', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
