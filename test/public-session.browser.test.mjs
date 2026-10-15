import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('public session renders review, failures and opt-in controls across themes and widths', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const origin = new URL(url).origin, errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = new URL(route.request().url());
      if (request.origin !== origin) { external.push(request.href); return route.abort(); }
      if (request.pathname.endsWith('/publicRuntime.js')) return route.fulfill({ contentType: 'application/javascript', body: 'export async function tickPublicSessions() {}' });
      return route.continue();
    });
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body><main id="fixture" style="padding:16px"></main></body></html>');
    await page.evaluate(async () => {
      const session = { agent_id: 'fixture', username: 'bonzai_agent', settings: { persona: 'A thoughtful public AI companion.', enabled: false, platformApproved: false, automatic: false, dailyLimit: 5, media: ['image','audio'], workflows: ['meditation-forge-v1.0.0'] } };
      const result = { version: 1, title: 'A moment of calm', text: 'Breathe slowly.', artifacts: [{ kind: 'audio', blobId: 'fixture', mime: 'audio/wav', ext: 'wav' }], warnings: [] };
      const requests = [{ id: 'one', post_id: '123', status: 'review', text: '@bonzai_agent Can you create a meditation?', result }, { id: 'two', post_id: '124', status: 'failed', text: '@bonzai_agent Please make an image', error: 'Image download required. Open Create to download it.' }, { id: 'three', post_id: '125', status: 'unknown', text: '@bonzai_agent Please reply', error: 'X confirmation was interrupted.' }];
      window.publicFixture = { published: 0, saved: 0 };
      window.electronAPI = { db: { blobs: { url: async () => 'data:audio/wav;base64,UklGRg==' } }, social: {
        publicList: async () => [session], publicRequests: async () => requests, xClient: async () => ({ clientId: 'fixture-app' }),
        publicConfigure: async (_id, settings) => { session.settings = settings; window.publicFixture.saved++; },
        publicPause: async () => { session.settings.enabled = false; }, publicPublish: async () => { window.publicFixture.published++; },
        publicDismiss: async id => { requests.find(item => item.id === id).status = 'skipped'; },
        publicEdit: async (id, text) => { requests.find(item => item.id === id).result.replyText = text; },
      } };
      const { createApp } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Component } = await import('/src/components/chat/PublicAgentSession.vue');
      createApp(Component, { agent: { id: 'fixture', name: 'Aurore', assignedWorkflowIds: ['meditation-forge-v1.0.0'] }, catalog: [{ id: 'meditation-forge-v1.0.0', name: 'Meditation Forge', inputs: {} }] }).mount('#fixture');
    });
    await page.getByRole('heading', { name: 'Meet the world.' }).waitFor();
    await page.getByRole('button', { name: 'Publish reply on X' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Publish reply on X' }).isDisabled(), true);
    assert.equal(await page.locator('audio').count(), 1);
    for (const theme of ['default', 'light', 'terminal', 'warm', 'trackline']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [1440, 800, 360]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width} fits`);
        if (width === 1440 && ['default','light'].includes(theme)) await page.screenshot({ path: `/tmp/bonzai-public-${theme}.png` });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByLabel('Listen for new mentions and generate replies on this device.').check();
    await page.getByRole('button', { name: 'Save public session' }).click();
    await page.getByText('Listening on X', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Publish reply on X' }).isDisabled(), true, 'saving settings is not platform approval');
    await page.getByLabel('Reply text').fill('Here is your meditation.');
    await page.getByRole('button', { name: 'Save reply text' }).click();
    await page.getByRole('button', { name: 'Pause now' }).click();
    await page.getByText('Public session paused', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.publicFixture.published), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser.close(); }
});
