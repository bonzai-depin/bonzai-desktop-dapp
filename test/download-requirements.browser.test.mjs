import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;
test('download requirements stay consistent across themes, widths and operational states', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const screenshotDirectory = process.env.BONZAI_UI_SCREENSHOTS;
    const capture = async path => {
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      await page.screenshot({ path });
    };
    if (screenshotDirectory) mkdirSync(screenshotDirectory, { recursive: true });
    // Load an isolated component from the existing dev server, with production styles.
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:16px;box-sizing:border-box;background:var(--bz-canvas)}#download-test{max-width:800px;margin:auto}</style></head><body><div id="download-test"></div></body></html>');
    await page.evaluate(async () => {
      const { createApp, h, reactive } = await import('/node_modules/.vite/deps/vue.js');
      const { default: DownloadRequirement } = await import('/src/components/DownloadRequirement.vue');
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      i18n.setLocale('en');
      window.downloadClicks = 0;
      window.cancelClicks = 0;
      window.downloadState = reactive({
        items: [{ category: 'image', repo: 'Black-Forest-Labs/FLUX.2-Klein', description: 'Forbidden model description', size: '5 GB' }],
        active: false, progress: 0, disabled: false, error: '', tasks: [],
        onDownload: () => window.downloadClicks++,
        onCancel: () => window.cancelClicks++,
      });
      createApp({ render: () => h(DownloadRequirement, window.downloadState) }).use(createI18nPlugin()).mount('#download-test');
    });
    const panel = page.locator('.bz-download-requirement');
    await panel.waitFor();
    assert.match(await panel.innerText(), /black-forest-labs\/flux.2-klein/);
    assert.equal(await panel.locator('.bz-download-requirement__crate').innerText(), 'inventory_2');
    assert.doesNotMatch(await panel.innerText(), /Forbidden|FLUX/);
    await panel.getByRole('button', { name: 'Download', exact: true }).click();
    assert.equal(await page.evaluate(() => window.downloadClicks), 1);
    const measureEmphasis = () => panel.evaluate(element => {
        const panelStyle = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const luminance = color => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const contrast = color => {
          const values = [luminance(color), luminance(panelStyle.backgroundColor)].sort((a, b) => b - a);
          return (values[0] + 0.05) / (values[1] + 0.05);
        };
        return {
          edge: parseFloat(panelStyle.borderInlineStartWidth),
          background: panelStyle.backgroundColor,
          surroundingBackground: getComputedStyle(document.body).backgroundColor,
          titleContrast: contrast(getComputedStyle(element.querySelector('.bz-download-requirement__title')).color),
          metaContrast: contrast(getComputedStyle(element.querySelector('.bz-download-requirement__meta')).color),
          errorContrast: element.querySelector('[role="alert"]') ? contrast(getComputedStyle(element.querySelector('[role="alert"]')).color) : null,
          iconWidth: element.querySelector('.bz-download-requirement__icon').getBoundingClientRect().width,
        };
      });
    for (const theme of ['default', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const emphasis = await measureEmphasis();
      assert.ok(emphasis.edge >= 3, `${theme}: the required action has a visible accent edge`);
      assert.notEqual(emphasis.background, emphasis.surroundingBackground, `${theme}: download surface stands apart from the workspace`);
      assert.ok(emphasis.titleContrast >= 4.5 && emphasis.metaContrast >= 4.5, `${theme}: title and metadata retain readable contrast`);
      assert.ok(emphasis.iconWidth >= 32, `${theme}: download status has a clear visual anchor`);
      for (const width of [1280, 800, 360]) {
        await page.setViewportSize({ width, height: 700 });
        await page.evaluate(() => {
          window.downloadState.items = [{ filename: 'A'.repeat(180) + '-MODEL.GGUF', description: 'Never render this', size: '12 GB' }];
        });
        assert.ok(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme}/${width}: long names wrap inside requirement`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: no horizontal overflow`);
        const alignment = await panel.evaluate(element => {
          const rect = selector => element.querySelector(selector).getBoundingClientRect();
          const heading = rect('.bz-download-requirement__title'), name = rect('.bz-download-requirement__name');
          const icon = rect('.bz-download-requirement__icon'), crate = rect('.bz-download-requirement__crate');
          return { text: Math.abs(heading.left - name.left), icons: Math.abs(icon.left + icon.width / 2 - crate.left - crate.width / 2) };
        });
        assert.ok(alignment.text <= 1 && alignment.icons <= 1, `${theme}/${width}: requirement rows align with the heading and download icon`);
        if (screenshotDirectory && width === 360) await capture(`${screenshotDirectory}/download-${theme}-${width}-long.png`);
      }
      await page.evaluate(() => { Object.assign(window.downloadState, { items: [{ filename: 'NemoMix-Unleashed-12B-Heretic.Q4_K_M.gguf', size: '7.48 GB' }], active: false, disabled: false, error: '' }); });
      await page.setViewportSize({ width: 1000, height: 500 });
      if (screenshotDirectory) await capture(`${screenshotDirectory}/download-${theme}-required.png`);

      await page.evaluate(() => { Object.assign(window.downloadState, { disabled: true, error: 'Repository authentication required' }); });
      assert.equal(await panel.getByRole('button', { name: 'Download', exact: true }).isDisabled(), true);
      assert.equal(await panel.getByRole('alert').innerText(), 'Download failed. Retry to continue.');
      assert.equal(await panel.locator('.bz-download-requirement__icon').innerText(), 'error_outline');
      assert.ok((await measureEmphasis()).errorContrast >= 4.5, `${theme}: errors remain readable on the tinted surface`);
      if (screenshotDirectory) await capture(`${screenshotDirectory}/download-${theme}-error.png`);

      await page.evaluate(() => { Object.assign(window.downloadState, { items: [], active: true, error: '', progress: 45, tasks: [{ filename: 'QWEN.GGUF', status: 'DOWNLOADING', progress: 45 }] }); });
      assert.equal(await panel.getByRole('progressbar').getAttribute('value'), '45');
      assert.match(await panel.innerText(), /qwen\.gguf/);

      for (const selector of ['.bz-download-requirement__title', '.bz-download-requirement__percent']) {
        const font = await panel.locator(selector).first().evaluate(element => { const style = getComputedStyle(element); return [style.fontFamily, style.fontWeight, style.fontStyle]; });
        assert.match(font[0], /Fira Sans Condensed/);
        assert.deepEqual(font.slice(1), ['900', 'italic']);
      }
      assert.doesNotMatch(await panel.innerText(), /QWEN|DOWNLOADING/);
      assert.equal(await panel.getByRole('button').count(), 0);
      await page.evaluate(() => { window.downloadState.cancellable = true; });
      await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.setViewportSize({ width: 360, height: 500 });
      assert.ok(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme}: active download controls fit narrow panels`);
      if (screenshotDirectory) await capture(`${screenshotDirectory}/download-${theme}-active.png`);
      await page.evaluate(() => { Object.assign(window.downloadState, { items: [{ name: 'MODEL.GGUF', size: '5 GB' }], active: false, disabled: false, cancellable: false, tasks: [] }); });
    }
    assert.equal(await page.evaluate(() => window.cancelClicks), 2);
  } finally { await browser.close(); }
});
