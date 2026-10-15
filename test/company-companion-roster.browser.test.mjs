import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;

test('company displays saved portraits and hires agents without workflow assignments', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:16px;box-sizing:border-box;background:var(--bz-canvas)}#company-test{max-width:1100px;margin:auto}</style></head><body><div id="company-test"></div></body></html>');
    await page.evaluate(async () => {
      window.electronAPI = { systemInformation: async () => ({platform:'darwin',gpu:'Apple M1 Max',memBudget:22e9}), checkModel:async()=>true,
        store: { get: async () => [] }, db: { companions: { list: async () => [{
        id: 'custom-existing-companion', name: 'Maya Existing', isCustom: 1, description: 'A saved companion',
        image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        extraJson: JSON.stringify({ assignedWorkflowIds: ['video-captioning-v1.0.0', 'skill.notion_docs'] }),
      }] } } };
      const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
      const { default: CompanyForm } = await import('/src/components/company/CompanyForm.vue');
      const componentSource = await (await fetch('/src/components/company/CompanyForm.vue')).text();
      const storeUrl = componentSource.match(/import companyStore from ["']([^"']+)/)[1];
      const { default: companyStore } = await import(storeUrl);
      const catalogUrl = componentSource.match(/from ["']([^"']*smartAgentCatalog\.js[^"']*)/)[1];
      const { smartAgentCatalog } = await import(catalogUrl);
      smartAgentCatalog.pendingHireId = 'custom-existing-companion';
      window.companyAgentCatalog = smartAgentCatalog;
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      i18n.setLocale('en');
      companyStore.form = async cfg => { window.formedCompany = JSON.parse(JSON.stringify(cfg)); };
      window.companyFixture = createApp({ render: () => h(CompanyForm) }).use(createI18nPlugin());
      window.companyFixture.mount('#company-test');
    });
    const coordinator = page.locator('.role-row').filter({ hasText: 'Coordinator' }).first();
    const picker = coordinator.locator('.col-companion select');
    await picker.locator('option[value="custom-existing-companion"]').waitFor({ state: 'attached' });
    assert.deepEqual(await picker.locator('option').allTextContents(), ['— inherit —', 'Maya Existing']);
    assert.equal(await picker.inputValue(), 'custom-existing-companion', 'The requested hire is preselected when creating the first team');
    assert.equal(await page.evaluate(() => window.companyAgentCatalog.pendingHireId), null, 'Consume the request only after assigning the saved companion');
    await coordinator.locator('.worker-model-control').click();
    await page.getByRole('button', { name: 'Use this model', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('input[placeholder="Shop operations"]').fill('Saved companion team');
    await page.locator('textarea').first().fill('Caption this week\'s product videos.');
    await page.getByRole('button', { name: /Create agentic team/ }).click();

    await page.waitForFunction(() => window.formedCompany || document.querySelector('.bz-notice--danger'), null, { timeout: 5000 }).catch(async error => { throw new Error(`${error.message}\n${await page.locator('.bz-notice--danger').allTextContents()}\n${errors.join('\n')}`); });
    assert.equal(await page.locator('.bz-notice--danger').count(), 0, await page.locator('.form-shell').innerText());
    const formed = await page.evaluate(() => window.formedCompany);
    assert.equal(formed.roles.CEO.companion, 'custom-existing-companion');
    assert.equal(formed.roles.CEO.llm, 'llm_qwen3_5_9b', 'onboarding saves the recommended model with the role');
    assert.equal(formed.roles.CEO.assignedWorkflowIds, undefined);
    assert.equal(formed.roles.CEO.grantedSkills, undefined, 'Hiring must not grant nonexistent connector skills');
    assert.ok(formed.roles.CEO.pipelines.includes('image') && formed.roles.CEO.pipelines.includes('fineTune'));

    await page.evaluate(async () => {
      window.companyFixture.unmount();
      const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
      const { default: CompanyDashboard } = await import('/src/components/company/CompanyDashboard.vue');
      const { default: companyStore } = await import('/src/stores/companyStore.js');
      const { makeCharter } = await import('/src/services/company/charter.js');
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      const charter = makeCharter({ ...window.formedCompany, id: 'fixture-company', status: 'paused' });
      companyStore.update = async next => { window.updatedWorkerCharter = JSON.parse(JSON.stringify(next)); };
      window.addEventListener('bonzai:run-agent-workflow', event => { window.openedWorkflow = event.detail; });
      window.companyFixture = createApp({ render: () => h(CompanyDashboard, { charter, state: companyStore.state, initialView: 'org' }) }).use(createI18nPlugin());
      window.companyFixture.mount('#company-test');
    });
    const card = page.locator('.org-card').filter({ hasText: 'Maya Existing' });
    await card.waitFor();
    await card.locator('.worker-model-control').click();
    await page.locator('.worker-model-manual summary').click();
    await page.getByRole('textbox', {name:'Search models'}).fill('Qwen3.5 9B');
    await page.locator('.worker-model-options button').filter({hasText:'MTP Q4_K_XL'}).first().click();
    await page.getByRole('button', {name:'Use this model',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const updated=await page.evaluate(()=>window.updatedWorkerCharter);
    assert.equal(updated.roles.CEO.llm,'llm_qwen3_5_9b');
    assert.equal(updated.roles.CEO.companion,formed.roles.CEO.companion);
    assert.deepEqual(updated.roles.CEO.grantedSkills,formed.roles.CEO.grantedSkills);
    assert.deepEqual(updated.roles.CEO.pipelines,formed.roles.CEO.pipelines);
    assert.equal(await card.locator('.org-card__workflows').count(), 0);
    assert.doesNotMatch(await card.innerText(), /Video Captioning|Notion|notion_docs/);
    await card.locator('.org-card__avatar img').waitFor();
    assert.match(await card.locator('.org-card__avatar img').getAttribute('src'), /^data:image\/png;base64,/);
    await page.waitForFunction(() => {
      const image = document.querySelector('.org-card__avatar img');
      return image?.complete && image.naturalWidth > 0;
    });
    for (const theme of ['default', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const width of [1280, 800]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: company team overflow`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a roster read error does not block the company workspace from initializing', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><body><div id="company-test"></div></body></html>');
    await page.evaluate(async () => {
      window.electronAPI = { store: { get: async () => { throw new Error('Roster unavailable'); } } };
      const componentSource = await (await fetch('/src/components/Company.vue')).text();
      const storeUrl = componentSource.match(/import companyStore from ["']([^"']+)/)[1];
      const { default: companyStore } = await import(storeUrl);
      companyStore.init = async () => { window.companyInitialized = true; };
      const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Company } = await import('/src/components/Company.vue');
      // This regression exercises roster recovery inside an already-open workspace.
      Company.components.CompanyWorkspaceAccess = { render() { return this.$slots.default?.(); } };
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      window.companyFixture = createApp({ render: () => h(Company) }).use(createI18nPlugin());
      window.companyFixture.mount('#company-test');
    });
    await page.waitForFunction(() => window.companyInitialized === true);
    await page.getByRole('alert').filter({ hasText: 'Roster unavailable' }).waitFor();
    assert.equal(await page.locator('.company-onboarding').isVisible(), true);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.companyFixture.unmount());
  } finally { await browser.close(); }
});
