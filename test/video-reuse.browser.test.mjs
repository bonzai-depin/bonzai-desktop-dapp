import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('video Reuse restores controls and reference preview across engines, then clears stale images', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin
      ? route.continue() : route.fulfill({ json: { ok: true, pipelines: [] } }));
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<div id="fixture"></div>');
    await page.evaluate(async () => {
      window.electronAPI = { store: { get: async (_k, fallback) => fallback, set: async () => true }, checkModel: async () => false };
      const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
      const { createPinia } = await import('/node_modules/.vite/deps/pinia.js');
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      const { default: Video } = await import('/src/components/GenerativeVideo.vue');
      Video.components = { ...Video.components, AccessRequirements: { render: () => null } };
      const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 4;
      window.referenceImage = canvas.toDataURL().split(',')[1];
      createApp({ render: () => h(Video, { existingImageBase64: window.referenceImage, ref: view => window.videoView = view }) })
        .use(createPinia()).use(createI18nPlugin()).mount('#fixture');
    });
    await page.waitForFunction(() => window.videoView?.handleAction);
    await page.evaluate(() => window.videoView.handleAction('copy', {
      _originalIndex: 0, question: 'A portrait in motion', generationSettings: {
        engine: 'fast', mode: 'i2v', quality: '720p', duration: 10,
        request: { prompt: 'A portrait in motion', image_base64: window.referenceImage, frame_rate: 24 },
      },
    }));
    await page.waitForFunction(() => window.videoView.quality === '720p' && window.videoView.duration === 10);
    assert.equal(await page.evaluate(() => window.videoView.fps), 24);
    assert.equal(await page.evaluate(() => window.videoView.form.prompt), 'A portrait in motion');
    assert.equal(await page.locator('.video-image-picker__image').getAttribute('src'), await page.evaluate(() => `data:image/png;base64,${window.referenceImage}`));
    await page.evaluate(() => window.videoView.handleAction('copy', { _originalIndex: 1, question: 'No reference', model: 'ltx-2', mode: 't2v', quality: '480p' }));
    await page.waitForFunction(() => window.videoView.mode === 't2v' && !window.videoView.hasAnyImage);
    assert.equal(await page.locator('.video-image-picker__image').count(), 0);
  } finally { await browser.close(); }
});
