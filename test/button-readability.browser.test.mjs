import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('shared buttons and media actions remain readable across themes and interaction states', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    const source = readFileSync(new URL('../src/components/generative/GenerativeActions.vue', import.meta.url), 'utf8');
    const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    const classes = ['bz-btn','bz-btn bz-btn--primary','bz-btn bz-btn--ghost','bz-iconbtn', ...['default','primary','success','warning','destructive'].map(v => `bz-gen-action bz-gen-action--${v}`)];
    await page.setContent(`<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><style>${styles}</style><div>${classes.map(c => `<button class="${c}">Action</button>`).join('')}</div>`);
    await page.addStyleTag({ content: 'body {background:var(--bz-panel)} button{margin:8px;transition:none!important} .bz-btn:not(.bz-btn--primary):not(:disabled),.bz-iconbtn:not(:disabled){background:var(--bz-panel)}' });
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--bz-control-selected-bg').trim());
    for (const theme of ['default','light','midnight','terminal','mistral','warm','nocturne','waveform','blueprint','papergrid','popcanvas','carbon','trackline']) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      for (const button of await page.locator('button').all()) {
        for (const state of ['normal','hover','focus','disabled','disabled-hover']) {
          await button.evaluate((el, state) => { el.disabled = state.startsWith('disabled'); if (state === 'focus') el.focus(); else el.blur(); }, state);
          if (state.includes('hover')) await button.hover(); else await page.mouse.move(900,500);
          const result = await button.evaluate(el => {
            const s = getComputedStyle(el);
            const rgb = c => c.match(/[\d.]+/g).slice(0,3).map(Number);
            const lum = c => rgb(c).map(v => { v/=255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4; }).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
            const a=lum(s.color),b=lum(s.backgroundColor);
            return { ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05), cls:el.className };

          });
          assert.ok(result.ratio >= 4.5, `${theme}/${state}/${result.cls}: icon contrast ${result.ratio.toFixed(2)}`);
        }
      }
    }
  } finally { await browser.close(); }
});
