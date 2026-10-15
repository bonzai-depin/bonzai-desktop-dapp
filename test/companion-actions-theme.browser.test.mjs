import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('companion action icons follow each theme with readable normal, hover, focus and disabled colors', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    const source = readFileSync(new URL('../src/components/skills/RoleplayChat.vue', import.meta.url), 'utf8');
    const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    await page.setContent(`<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><style>${styles}</style><div class="companion-card"><div class="companion-portrait-container">${['regenerate-portrait-btn','regenerate-voice-btn','card-action-btn top-left','card-action-btn top-left-second','regenerate-image-btn','export-single-btn','delete-scenario-btn'].map(c => `<button class="${c}">●</button>`).join('')}</div></div>`);
    await page.addStyleTag({ content: 'button {position:static!important; opacity:1!important; margin:8px} .companion-portrait-container{height:100px;width:600px}' });
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
            const probe=document.createElement('span'); probe.style.color=`var(${el.disabled?'--bz-raised':el.matches('.top-left-second,.delete-scenario-btn')?'--bz-danger':'--bz-control-selected-bg'})`; document.body.append(probe); const expected=getComputedStyle(probe).color; probe.remove();
            return { ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05), bg:s.backgroundColor,expected,cls:el.className };
          });
          assert.equal(result.bg, result.expected, `${theme}/${state}/${result.cls}: themed fill`);
          assert.ok(result.ratio >= 3, `${theme}/${state}/${result.cls}: icon contrast ${result.ratio.toFixed(2)}`);
        }
      }
    }
  } finally { await browser.close(); }
});
