import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
async function mount(page, bypass = false) {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/buttons.css"><style>html,body,#app{height:100%;overflow:hidden}.bz-tab-shell{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}.company-tab{height:calc(100vh - 32px);min-height:calc(100vh - 32px);overflow:auto}body{margin:0;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}*{box-sizing:border-box}</style><div id="app"></div>');
  await page.evaluate(async bypass => {
    let progress; window.checkoutCalls = 0; window.selectedTemplate = null;
    window.electronAPI = { store: { get: async () => [] }, workspace: {
      status: async () => ({ unlocked: bypass, bypassed: bypass, configured: true }),
      checkout: async () => { window.checkoutCalls++; return { id: 'order-test' }; },
      verify: async () => ({ unlocked: true }), restore: async () => ({ unlocked: true }), backup: async () => {},
      demo: async kind => { const result = { id: 'test-demo', kind, steps: [{ label: 'Prepare invoice', status: 'passed', evidence: { id: 'invoice-demo', status: 'draft' } }, { label: 'Validate and number invoice', status: 'passed', evidence: { id: 'invoice-demo', status: 'validated' } }], status: 'passed' }; progress(result); return result; },
    }, onWorkspaceDemo: callback => { progress = callback; return () => {}; } };
    const { skillService } = await import('/src/services/skill.service.js');
    skillService.initializeSkills = async () => {}; skillService.getAllSkills = () => [
      { id: 'meditation-forge-v1.0.0', name: 'Meditation Forge', inputs: { intention: { label: 'Intention' }, duration: { label: 'Minutes' } }, requirements: { requiredApis: ['llm', 'audio', 'image'] } },
      { id: 'mass-chat-v1.0.0', name: 'Model comparison', description: 'Compare responses from local models.' },
      { id: 'roleplay-companion-v1.0.0', name: 'Roleplay' },
      { id: 'disabled-test', name: 'Not installed', disabled: true },
    ];
    const source = await (await fetch('/src/components/company/CompanyWorkspaceAccess.vue')).text();
    const runtime = source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
    const localeUrl = source.match(/from ["']([^"']*\/i18n\/index\.js[^"']*)["']/)?.[1] || '/src/i18n/index.js';
    const { createApp, h } = await import(runtime);
    const { i18n, createI18nPlugin } = await import(localeUrl); i18n.setLocale('en'); window.testLocale = i18n;
    const { default: Access } = await import('/src/components/company/CompanyWorkspaceAccess.vue');
    createApp({ render: () => h(Access, { onChooseTemplate: id => { window.selectedTemplate = id; } }, { default: () => h('div', { class: 'bz-tab-shell company-tab' }, [h('div', { style: 'min-height:2000px' }, 'Workspace records'), h('button', 'Bottom action')]) }) }).use(createI18nPlugin()).mount('#app');
  }, bypass);
  await page.locator('.catalog-notice').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Pay by card', exact: true }).waitFor();
  return errors;
}

test('locked users discover concrete workflows before paying; demos, read-only records and payment recovery remain available', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = await mount(page);
    assert.equal(await page.getByText('Workspace records').count(), 0);
    await page.getByText('1 ETH', { exact: true }).waitFor();
    assert.match(await page.locator('.test-price').innerText(), /1 USDC/);
    assert.ok(await page.locator('.discovery-item').count() > 4);
    assert.match(await page.locator('.workflow-preview').innerText(), /Guided narration/);
    assert.match(await page.locator('.workflow-preview').innerText(), /Minutes/);
    await page.screenshot({ path: '/tmp/workspace-discovery-overview.png' });
    await page.getByRole('button', { name: 'See unlock options', exact: true }).click();
    assert.equal(await page.evaluate(() => window.checkoutCalls), 0, 'inspecting unlock options must not create checkout');
    await page.getByRole('searchbox').fill('invoice');
    await page.locator('.discovery-item').filter({ hasText: 'Invoicing' }).click();
    await page.getByRole('button', { name: 'Try the guided demo', exact: true }).click();
    await page.getByRole('button', { name: 'Invoice to payment', exact: true }).click();
    await page.getByText('Workflow checks passed', { exact: false }).waitFor();
    await page.locator('.demo-layout article footer button').last().click();
    await page.getByText('validated', { exact: true }).waitFor();
    for (const [width, theme, language] of [[1440, 'dark', 'en'], [1440, 'light', 'fr'], [390, 'dark', 'fr'], [390, 'light', 'fr']]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(({ theme, language }) => { document.documentElement.dataset.theme = theme; window.testLocale.setLocale(language); document.querySelector('.workspace-access').scrollTo(0, 0); }, { theme, language });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `document fits ${width}`);
      assert.ok(await page.locator('.workspace-access').evaluate(element => element.scrollWidth <= element.clientWidth), `workspace fits ${width}`);
      await page.screenshot({ path: `/tmp/workspace-discovery-${theme}-${width}.png` });
    }
    await page.evaluate(() => window.testLocale.setLocale('en'));
    await page.getByRole('button', { name: 'Open demo workspace', exact: true }).click();
    await page.getByText('Workspace records').waitFor();
    assert.equal(await page.evaluate(() => window.checkoutCalls), 0);
    await page.locator('.company-tab').evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.ok(await page.locator('.company-tab').evaluate(element => element.scrollTop > 0));
    await page.getByRole('button', { name: 'Bottom action', exact: true }).click();
    await page.locator('.license-strip button').click();
    await page.getByRole('button', { name: 'View existing records', exact: true }).click();
    await page.getByText('Workspace records').waitFor();
    await page.locator('.license-strip button').click();
    await page.getByRole('button', { name: 'Pay by card', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Pay by card', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.checkoutCalls), 1);
    await page.getByRole('button', { name: 'Check payment', exact: true }).click();
    await page.getByText('Workspace records').waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('temporary access preserves introduction; selecting a template is explicit and never creates checkout', { skip: !url, timeout: 45000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(); const errors = await mount(page, true);
    await page.getByRole('button', { name: 'Skip', exact: true }).waitFor();
    assert.equal(await page.getByText('Workspace records').count(), 0);
    await page.locator('.discovery-item').filter({ hasText: 'Meditation Forge' }).click();
    assert.equal(await page.getByText('Workspace records').count(), 0, 'browsing does not skip the intro');
    await page.getByRole('button', { name: 'Use this template', exact: true }).click();
    await page.getByText('Workspace records').waitFor();
    assert.equal(await page.evaluate(() => window.selectedTemplate), 'meditation-forge-v1.0.0');
    assert.equal(await page.evaluate(() => window.checkoutCalls), 0);
    await page.reload(); await mount(page, true);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByText('Workspace records').waitFor();
    assert.equal(await page.evaluate(() => window.checkoutCalls), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
