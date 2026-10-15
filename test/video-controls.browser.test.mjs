import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileStyle } from '@vue/compiler-sfc';
import { chromium } from 'playwright';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = path => parse(read(path)).descriptor.styles.map(style => {
  const compiled = compileStyle({ source: style.content, filename: path, id: 'fixture', scoped: false });
  assert.deepEqual(compiled.errors, []);
  return compiled.code;
}).join('\n');

test('video actions remain one row below playback at desktop and narrow widths in both themes', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${read('src/assets/tokens.css')}
      ${read('src/assets/themes.css')}
      ${css('src/components/generative/GenerativeActions.vue')}
      ${css('src/components/GenerativeVideo.vue')}
      .history-item {opacity:1;animation:none;} body {margin:16px;}
      </style><div class="history-item"><div class="question">
      <video class="generated__video" controls style="aspect-ratio:3/4"></video>
      <div class="bz-gen-actions">${['Info', 'Save', 'Reuse', 'Enhance', 'Mint', 'Delete'].map(label => `<button class="bz-gen-action bz-gen-action--icon-only" aria-label="${label}">${label[0]}</button>`).join('')}</div>
      </div></div>`);
    for (const theme of ['dark', 'light']) for (const width of [640, 320, 240]) {
      await page.setViewportSize({width, height:900});
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const boxes = await page.evaluate(() => {
        const video = document.querySelector('video').getBoundingClientRect();
        const bar = document.querySelector('.bz-gen-actions').getBoundingClientRect();
        return { videoBottom:video.bottom, barTop:bar.top,
          tops:[...document.querySelectorAll('button')].map(b=>b.getBoundingClientRect().top),
          pageWidth:document.documentElement.scrollWidth };
      });
      assert.ok(boxes.barTop >= boxes.videoBottom, `${theme}/${width}: actions cover video`);
      assert.equal(new Set(boxes.tops).size, 1, `${theme}/${width}: actions wrap`);
      assert.ok(boxes.pageWidth <= width, `${theme}/${width}: page overflows`);
      await page.getByRole('button', {name:'Delete', exact:true}).focus();
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Delete');
    }
    await page.screenshot({path:'/tmp/bonzai-video-controls.png'});
  } finally { await browser.close(); }
});
