import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;

test('pending workflow survives startup refresh, agent landing restores companion requirements, and failed hiring stays put', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/pipelines/plan', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"></head><body><div id="agent-test"></div></body></html>');
    await page.evaluate(async () => {
      window.electronAPI = { checkModel: async () => false, store: { get: async (_key, fallback) => fallback, set: async () => true } };
      const componentSource = await (await fetch('/src/components/SmartAgent.vue')).text();
      const storeUrl = componentSource.match(/import \{ useSkillStore \} from ["']([^"']+)/)[1];
      const { useSkillStore } = await import(storeUrl);
      const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
      const { createPinia } = await import('/node_modules/.vite/deps/pinia.js');
      const { default: SmartAgent } = await import('/src/components/SmartAgent.vue');
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      const pinia = createPinia();
      const skills = useSkillStore(pinia);
      await skills.initialize();
      skills.refresh = () => new Promise(resolve => { window.completeAgentRefresh = resolve; });
      window.agentSkillStore = skills;
      window.agentFixture = createApp({ render: () => h(SmartAgent, { ref: instance => { window.agentView = instance; } }) }).use(pinia).use(createI18nPlugin());
      window.agentFixture.mount('#agent-test');
      window.hireTransitions = 0;
      window.addEventListener('bonzai:hire-smart-agent', () => window.hireTransitions++);
    });
    await page.waitForFunction(() => window.completeAgentRefresh);
    await page.evaluate(() => window.agentSkillStore.requestSkillNavigation('video-captioning-v1.0.0'));
    await page.evaluate(() => window.completeAgentRefresh());
    await page.waitForFunction(() => window.agentView?.selectedSkillId === 'video-captioning-v1.0.0' && window.agentView?.modelAvailabilityChecked);
    assert.equal(await page.evaluate(() => window.agentView.activeTab), 'my-skills');
    assert.equal(await page.evaluate(() => window.agentSkillStore.pendingSkillId), null);
    await page.locator('.agent-mode-tabs button').filter({ hasText: 'Smart agents' }).click();
    assert.equal(await page.evaluate(() => window.agentView.selectedSkillId), 'roleplay-companion-v1.0.0');
    assert.ok((await page.evaluate(() => window.agentView.skillModelRequirements.map(model => model.key))).includes('image_quality'));

    await page.locator('.agent-mode-tabs button').filter({ hasText: 'Roleplay' }).click();
    assert.equal(await page.evaluate(() => window.agentView.selectedSkillId), 'roleplay-companion-v1.0.0');
    assert.equal(await page.locator('.agent-mode-tabs').isVisible(), true);

    await page.evaluate(async () => {
      window.electronAPI.store.get = async () => { throw new Error('Roster unavailable'); };
      await window.agentView.hireCompanion({ id: 'missing-companion' });
    });
    assert.equal(await page.evaluate(() => window.hireTransitions), 0);
    assert.match(await page.locator('.agent-status-toast').innerText(), /Roster unavailable/);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.agentFixture.unmount());
  } finally { await browser.close(); }
});
