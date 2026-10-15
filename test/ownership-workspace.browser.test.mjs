import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { parse } from '@vue/compiler-sfc';
const url = process.env.BONZAI_UI_URL;

test('ownership explores real asset shapes, handles unavailable data and fits every theme; 3D resolves Qwen Q4 K XL', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(8000);
    const errors = [], external = [], origin = new URL(url).origin;
    page.on('pageerror', error => errors.push(error.message));
    const mocks = {
      '/src/stores/inferenceStore.js': `import { ref } from '/node_modules/.vite/deps/vue.js'; export const allInferences = ref([]); export async function initializeStore() { allInferences.value = window.ownershipFixture.empty ? [] : window.ownershipFixture.creations; }`,
      '/src/services/contribution.service.js': `export function loadContributionLedger() { return window.ownershipFixture.empty ? [] : [{ id: 'pack', fileName: 'Customer language contribution pack', recordCount: 128, dataOwnerCount: 1, dataOwnerWallets: ['0xabc'], royaltyBearing: 40 }]; }`,
      '/src/services/memory.service.js': `export const memoryService = { getUserMemory: async () => ({ rawSources: [1,2], atomicNotes: [1,2,3] }) };`,
      '/src/services/bonzaiStaking.service.js': `import { reactive, ref } from '/node_modules/.vite/deps/vue.js'; export const bonzaiStakingService = { state: reactive({}), isConfigured: ref(false) };`,
      '/src/composables/useBonzaiWeb3.js': `import { ref } from '/node_modules/.vite/deps/vue.js'; export function useBonzaiWeb3() { return { walletAddress: ref(''), connect: () => { window.ownershipFixture.connections++; } }; }`,
    };
    await page.route('**/*', async route => {
      const request = new URL(route.request().url());
      if (request.pathname === '/training/models') {
        const fixture = await page.evaluate(() => ({ empty: window.ownershipFixture.empty, failed: window.ownershipFixture.failed }));
        return route.fulfill({ status: fixture.failed ? 503 : 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ models: fixture.empty ? [] : [{ id: 'studio', name: 'Studio language', base_model: 'Qwen', origin_record_count: 128, data_owner_wallets: ['0xabc'] }] }) });
      }
      if (request.origin !== origin) { external.push(request.href); return route.abort(); }
      if (mocks[request.pathname]) return route.fulfill({ contentType: 'application/javascript', body: mocks[request.pathname] });
      return route.continue();
    });
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body><div id="ownership-test" style="height:100vh"></div></body></html>');
    const { descriptor } = parse(await readFile(new URL('../src/App.vue', import.meta.url), 'utf8'));
    await page.addStyleTag({ content: descriptor.styles.filter(style => !style.scoped).map(style => style.content).join('\n') });
    await page.evaluate(async () => {
      const { createApp } = await import('/node_modules/.vite/deps/vue.js');
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 320;
      const ctx = canvas.getContext('2d'), fill = ctx.createLinearGradient(0, 0, 480, 320); fill.addColorStop(0, '#432d82'); fill.addColorStop(1, '#cf947e'); ctx.fillStyle = fill; ctx.fillRect(0, 0, 480, 320); ctx.fillStyle = '#eadbce'; ctx.beginPath(); ctx.arc(330, 100, 48, 0, Math.PI * 2); ctx.fill();
      window.ownershipFixture = { empty: false, failed: false, connections: 0, creations: Array.from({ length: 10 }, (_, index) => ({ id: `creation-${index}`, type: index % 3 === 0 ? 'image' : 'text', question: index === 1 ? 'An exceptionally long original creation title that must wrap gracefully at any screen width' : ['Stillness in orbit', 'Ideas for tomorrow', 'A story worth keeping'][index % 3], image: canvas.toDataURL(), timestamp: Date.now() - index * 1000, nft: { tokenId: index, mintedAt: Date.now() - index * 1000, marketplaceUrl: 'https://opensea.io/assets/example', trainingMaterial: { eligible: index % 2 === 0, downstreamRevenue: { dataOwners: [{ wallet: '0xabc' }] } } } })) };
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      const { default: Ownership } = await import('/src/components/ContributionOwnershipDashboard.vue');
      createApp(Ownership).use(createI18nPlugin(i18n)).mount('#ownership-test');
    });
    await page.locator('.ownership__asset').first().waitFor();
    await page.waitForFunction(() => document.querySelector('.ownership__library').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('.ownership__asset').count(), 9);
    await page.locator('.ownership__asset').first().click();
    assert.match(await page.locator('.ownership__inspector').innerText(), /#0/);
    for (const theme of ['default', 'light', 'terminal', 'warm', 'trackline']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [1440, 900, 360]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.ok(await page.locator('.ownership').evaluate(element => element.scrollWidth <= element.clientWidth), `${theme}/${width} fits`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width} page fits`);
        if (width === 1440 && ['default', 'light'].includes(theme)) await page.screenshot({ path: `/tmp/bonzai-ownership-${theme}.png` });
        if (width === 360 && theme === 'default') await page.screenshot({ path: '/tmp/bonzai-ownership-mobile.png' });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByRole('tab', { name: /Models/ }).click();
    assert.equal(await page.locator('.ownership__asset').count(), 1);
    await page.getByRole('searchbox').fill('does-not-exist');
    await page.getByRole('heading', { name: 'No matching assets' }).waitFor();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await page.evaluate(() => window.ownershipFixture.failed = true);
    await page.getByRole('button', { name: 'Refresh ownership' }).click();
    await page.getByRole('alert').filter({ hasText: 'Trained models are unavailable' }).waitFor();
    await page.getByRole('tab', { name: /Models/ }).click();
    assert.equal(await page.locator('.ownership__asset').count(), 1, 'a failed refresh preserves known models');
    await page.evaluate(() => { window.ownershipFixture.failed = false; window.ownershipFixture.empty = true; });
    await page.getByRole('button', { name: 'Refresh ownership' }).click();
    await page.getByRole('heading', { name: 'Your next creation starts here.' }).waitFor();
    const model = await page.evaluate(async () => {
      const { DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER, DEFAULT_LLM_ID } = await import('/src/config/modelDefaults.js');
      const { resolveLLM } = await import('/src/skills/flagship.js');
      return { id: DEFAULT_3D_LLM_ID, tier: DEFAULT_3D_LLM_TIER, main: DEFAULT_LLM_ID, model: resolveLLM(DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER) };
    });
    assert.equal(model.id, 'qwen3_8_27b_low'); assert.equal(model.tier, 'q4');
    assert.match(model.model.filename, /qwen3\.8-27b-.*-low-mtp-iq4_xs\.gguf/);
    assert.match(JSON.stringify(model.model), /DavidAU\/Qwen3.8-27B-TURBO/);
    assert.equal(await page.evaluate(() => window.ownershipFixture.connections), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser.close(); }
});
