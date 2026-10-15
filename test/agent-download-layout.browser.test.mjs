import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;

// A single renderer turn observes one coherent layout, including asynchronous
// model-readiness changes that can expand the panel during navigation.
function sampleCreationLayout(requireReady) {
  const root = document.querySelector('.is-agent-management');
  const elements = {
    panel: root?.querySelector('.agent-creation-requirements .bz-download-requirement'),
    layout: root?.querySelector('.agent-creation-layout'),
    editor: root?.querySelector('.companion-creation-editor'),
    preview: root?.querySelector('.custom-companion-preview'),
    token: root?.querySelector('.agent-launch-section'),
  };
  if (Object.values(elements).some(element => !element)) return requireReady ? false : { missing: true };
  const bounds = Object.fromEntries(Object.entries(elements).map(([key, element]) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return [key, { x, y, width, height }];
  }));
  const names = [...elements.panel.querySelectorAll('.bz-download-requirement__name')].map(element => element.textContent.toLowerCase());
  const { panel, layout, editor, preview } = bounds;
  const result = {
    ...bounds,
    outsideEditor: !elements.panel.closest('.companion-creation-editor'),
    fullWidth: Math.abs(panel.x - layout.x) <= 1 && Math.abs(panel.width - layout.width) <= 1,
    aboveColumns: panel.y + panel.height <= Math.min(editor.y, preview.y) + 1,
    requirementsReady: names.some(name => name === 'language') && names.some(name => name === 'image'),
  };
  return requireReady && !(result.outsideEditor && result.fullWidth && result.aboveColumns && result.requirementsReady) ? false : result;
}

test('agent creation places the shared download panel above both columns at full width with CREATE typography and controls', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => localStorage.setItem('bonzai.onboarding.v4.completed', 'true'));
    await page.route('**/pipelines/plan', async route => {
      const quality = route.request().postDataJSON()?.pipeline === 'image_quality';
      await route.fulfill({ json: {
        ok: false,
        repos: [{ repo: quality ? 'Tongyi-MAI/Z-Image-Turbo' : 'Black-Forest-Labs/FLUX.2-Klein-4b', missing: 1, ok: false }],
        required_files: quality ? [{ name: 'z-image-turbo-Q4_K_M.gguf', ok: false, exists: false }] : [],
      } });
    });
    await page.route('**/downloads/list', route => route.fulfill({ json: { pipelines: [] } }));
    await page.goto(url);

    const visualStyles = locator => locator.evaluate(panel => {
      const selectors = ['', ' .bz-download-requirement__head', ' .bz-download-requirement__title', ' .bz-download-requirement__list', ' .bz-download-requirement__name', ' button'];
      const properties = ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'lineHeight', 'padding', 'margin', 'borderRadius', 'gap'];
      return selectors.map(selector => {
        const style = getComputedStyle(selector ? panel.querySelector(selector.trim()) : panel);
        // Placement owns the panel's outer margin; its internal spacing and controls stay shared.
        return Object.fromEntries(properties.filter(property => selector || property !== 'margin').map(property => [property, style[property]]));
      });
    });

    for (const theme of ['default', 'light']) {
      await page.evaluate(async theme => {
        const { themeService } = await import('/src/services/theme.service.js');
        themeService.set(theme);
      }, theme);
      for (const width of [1280, 800]) {
        await page.setViewportSize({ width, height: 900 });
        await page.getByRole('button', { name: 'Image', exact: true }).click();
        const createPanel = page.locator('.bz-image-panel .bz-download-requirement');
        await createPanel.waitFor();
        const createStyle = await visualStyles(createPanel);

        await page.getByRole('button', { name: 'Agents', exact: true }).click();
        const agentPanel = page.locator('.is-agent-management .agent-creation-requirements .bz-download-requirement');
        await agentPanel.waitFor();
        let geometry;
        try {
          const sample = await page.waitForFunction(sampleCreationLayout, true, { timeout: 10000 });
          geometry = await sample.jsonValue();
          await sample.dispose();
        } catch (error) {
          const finalBounds = await page.evaluate(sampleCreationLayout, false);
          throw new Error(`${theme}/${width}: creation layout did not settle: ${JSON.stringify(finalBounds)}`, { cause: error });
        }
        const details = `${theme}/${width}: ${JSON.stringify(geometry)}`;
        assert.ok(Math.abs(geometry.editor.height - geometry.preview.height) <= 1 && Math.abs(geometry.preview.height - geometry.token.height) <= 1, 'All three stages have equal height');
        assert.ok(geometry.token.x >= geometry.preview.x + geometry.preview.width, 'Social token is the third column');
        assert.ok(Math.abs(geometry.token.x + geometry.token.width - geometry.layout.x - geometry.layout.width) <= 1, 'The stages use the entire workspace width');
        assert.equal(geometry.outsideEditor, true, `Downloads sit outside the editor column. ${details}`);
        assert.equal(geometry.fullWidth, true, `Downloads span the entire creation layout. ${details}`);
        assert.equal(geometry.aboveColumns, true, `Downloads precede both the form and agent card. ${details}`);
        assert.ok(Math.abs(geometry.editor.y - geometry.preview.y) <= 1, `Form and card remain beside each other at desktop and tablet widths. ${details}`);
        assert.ok(geometry.preview.x >= geometry.editor.x + geometry.editor.width, `The optional rail cannot squeeze creation into an implicit column. ${details}`);
        assert.deepEqual(await visualStyles(agentPanel), createStyle, `${theme}/${width}: shared download typography, spacing and controls match CREATE`);
        assert.equal(await agentPanel.getByRole('button', { name: 'Download', exact: true }).isDisabled(), true, 'A browser without the model bridge cannot offer an LLM download');
        const names = await agentPanel.locator('.bz-download-requirement__name').allTextContents();
        assert.ok(names.every(name => name === name.toLowerCase()));
        assert.ok(names.some(name => name === 'language'));
        assert.ok(names.some(name => name === 'image'));
        assert.ok(names.every(name => !/flux|gguf|nemomix|z-image/.test(name)), 'Creating a profile and portrait does not download the roleplay scene model');
        assert.ok((await agentPanel.locator('.bz-download-requirement__meta').allTextContents()).some(size => /GB|MB/.test(size)), 'Keep available model sizes alongside their filenames');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: creation fits the viewport`);
      }
    }
  } finally { await browser.close(); }
});

test('finishing the missing LLM download enables agent generation without leaving the creator', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route('**/pipelines/plan', route => route.fulfill({ json: { ok: true } }));
    await page.route('**/downloads/list', route => route.fulfill({ json: { pipelines: [] } }));
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"></head><body><div id="agent-download-test"></div></body></html>');
    await page.evaluate(async () => {
      window.fixtureLLMReady = false;
      window.fixtureModelChecks = 0;
      window.electronAPI = {
        checkModel: async filename => {
          if (!filename.includes('nemomix')) return true;
          window.fixtureModelChecks++;
          return window.fixtureLLMReady;
        },
        downloadModel: async (_url, filename) => {
          window.fixtureDownloadedFilename = filename;
          window.fixtureLLMReady = true;
          return true;
        },
        onDownloadProgress: () => () => {},
        getActiveDownloads: async () => [],
        store: { get: async (_key, fallback) => fallback, set: async () => true },
      };
      const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
      const { createPinia } = await import('/node_modules/.vite/deps/pinia.js');
      const { default: SmartAgent } = await import('/src/components/SmartAgent.vue');
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      const source = await (await fetch('/src/components/SmartAgent.vue')).text();
      const storeUrl = source.match(/import \{ useSkillStore \} from ["']([^"']+)/)[1];
      const { useSkillStore } = await import(storeUrl);
      const pinia = createPinia();
      await useSkillStore(pinia).initialize();
      window.downloadAgentFixture = createApp({ render: () => h(SmartAgent) }).use(pinia).use(createI18nPlugin());
      window.downloadAgentFixture.mount('#agent-download-test');
    });
    const creator = page.locator('.is-agent-management');
    await creator.getByRole('textbox', { name: 'Describe your smart agent', exact: true }).fill('An art director for product campaigns.');
    const download = creator.getByRole('button', { name: 'Download', exact: true });
    await download.waitFor();
    const generate = creator.locator('.agent-generate-actions > .bz-btn--agent-cta');
    assert.equal(await generate.isDisabled(), true);
    const checksBefore = await page.evaluate(() => window.fixtureModelChecks);
    await download.click();
    await page.waitForFunction(() => !document.querySelector('.is-agent-management .agent-generate-actions > .bz-btn--agent-cta').disabled);
    assert.ok(await page.evaluate(count => window.fixtureModelChecks > count, checksBefore), 'The creator rechecks model availability after the native LLM download');
    assert.match(await page.evaluate(() => window.fixtureDownloadedFilename), /nemomix/);
    assert.equal(await creator.getByRole('textbox', { name: 'Describe your smart agent', exact: true }).inputValue(), 'An art director for product campaigns.');
    await page.evaluate(() => window.downloadAgentFixture.unmount());
  } finally { await browser.close(); }
});

// The real renderer must stop the queue as well as its current native transfer.
test('cancelling agent downloads stops native work and prevents queued pipeline prefetch', { skip: !url, timeout: 60000 }, async () => {
 const browser = await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page = await browser.newPage();
  let prefetches = 0;
  await page.route('**/pipelines/plan', route => route.fulfill({json:{ok:false,repos:[],required_files:[]}}));
  await page.route('**/pipelines/prefetch', route => { prefetches++; return route.fulfill({status:202,json:{pipeline_id:'unexpected'}}); });
  await page.route('**/downloads/list', route => route.fulfill({json:{pipelines:[]}}));
  await page.addInitScript(() => {
   localStorage.setItem('bonzai.onboarding.v4.completed','true');
   window.electronAPI = {
    checkModel: async () => false,
    getActiveDownloads: async () => [],
    onDownloadProgress: () => () => {},
    downloadModel: async (_url, filename) => { window.startedFilename=filename; return new Promise(resolve => {window.finishCancelledDownload=resolve;}); },
    cancelModelDownload: async filename => {window.cancelledFilename=filename; window.finishCancelledDownload(false); return true;},
    store: {get:async (_key,fallback)=>fallback,set:async()=>true},
   };
  });
  await page.goto(url);
  await page.getByRole('button',{name:'Agents',exact:true}).click();
  const panel = page.locator('.is-agent-management .bz-download-requirement');
  await panel.getByRole('button',{name:'Download',exact:true}).click();
  await page.waitForFunction(()=>window.startedFilename);
  assert.equal(await panel.getByText('downloading',{exact:true}).count(),0);
  await panel.getByRole('button',{name:'Cancel',exact:true}).click();
  await panel.getByRole('button',{name:'Download',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.cancelledFilename===window.startedFilename),true);
  assert.equal(prefetches,0);
  assert.equal(await panel.getByRole('progressbar').count(),0);
 } finally { await browser.close(); }
});

test('cancelling during pipeline startup cancels the late pipeline and keeps the queue stopped', { skip: !url, timeout: 60000 }, async () => {
 const browser = await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page = await browser.newPage();
  let releasePrefetch;
  let prefetches = 0;
  const cancelled = [];
  await page.route('**/pipelines/plan', route => route.fulfill({json:{ok:false,repos:[],required_files:[]}}));
  await page.route('**/pipelines/prefetch', async route => {
    prefetches++;
    await new Promise(resolve => { releasePrefetch = resolve; });
    await route.fulfill({status:202,json:{pipeline_id:'late-image'}});
  });
  await page.route('**/downloads/cancel/*', route => {cancelled.push(route.request().url().split('/').pop()); return route.fulfill({json:{ok:true}});});
  await page.route('**/downloads/list', route => route.fulfill({json:{pipelines:[]}}));
  await page.addInitScript(() => {
   localStorage.setItem('bonzai.onboarding.v4.completed','true');
   window.electronAPI = { checkModel: async () => true, getActiveDownloads: async () => [], onDownloadProgress: () => () => {}, downloadModel: async () => true, store: {get:async (_key,fallback)=>fallback,set:async()=>true} };
  });
  await page.goto(url);
  await page.getByRole('button',{name:'Agents',exact:true}).click();
  const panel = page.locator('.is-agent-management .bz-download-requirement');
  const started = page.waitForRequest('**/pipelines/prefetch');
  await panel.getByRole('button',{name:'Download',exact:true}).click();
  await started;
  await panel.getByRole('button',{name:'Cancel',exact:true}).click();
  await panel.getByRole('button',{name:'Download',exact:true}).waitFor();
  const stopped = page.waitForResponse('**/downloads/cancel/late-image');
  releasePrefetch();
  await stopped;
  assert.deepEqual(cancelled,['late-image']);
  assert.equal(prefetches,1);
  assert.equal(await panel.getByRole('progressbar').count(),0);
 } finally { await browser.close(); }
});
