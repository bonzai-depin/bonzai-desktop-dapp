import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('emphasized labels inherit readable theme colors, including disabled connection options', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    // Keep the actual application styles, including the legacy framework stylesheet.
    const source = readFileSync(new URL('../src/components/ConnectionModal.vue', import.meta.url), 'utf8');
    const css = source.match(/<style scoped>([\s\S]*?)<\/style>/)[1];
    await page.addStyleTag({ content: css });
    await page.evaluate(() => {
      const fixture = document.createElement('section');
      fixture.id = 'contrast-fixture';
      fixture.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bz-card);padding:24px';
      fixture.innerHTML = '<strong>Panel emphasis</strong><b>Bold text</b><button class="connection-option"><span><strong>Connect wallet</strong><small>Use your existing crypto wallet.</small></span></button><button class="connection-option" disabled><span><strong>Sign in</strong><small>Desktop required.</small></span></button><button class="bz-btn bz-btn--primary"><strong>Primary action</strong></button>';
      document.body.append(fixture);
    });
    for (const theme of ['default','light','midnight','terminal','mistral','warm','nocturne','waveform','blueprint','papergrid','popcanvas','carbon','trackline']) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      await page.waitForTimeout(200);
      const results = await page.locator('#contrast-fixture strong, #contrast-fixture b, #contrast-fixture small').evaluateAll(elements => elements.map(el => {
        const rgb = c => c.match(/[\d.]+/g).slice(0,3).map(Number);
        const lum = c => rgb(c).map(v => { v/=255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4; }).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
        const style = getComputedStyle(el);
        let surface = el;
        while (surface.parentElement && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
        const a=lum(style.color), b=lum(getComputedStyle(surface).backgroundColor);
        return { text:el.textContent, ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05), color:style.color, parent:getComputedStyle(el.parentElement).color, emphasis:el.tagName!=='SMALL' };
      }));
      for (const result of results) {
        if (result.emphasis) assert.equal(result.color,result.parent, `${theme}: ${result.text} inherits its context`);
        assert.ok(result.ratio>=4.5, `${theme}: ${result.text} contrast ${result.ratio.toFixed(2)}`);
      }
    }
  } finally { await browser.close(); }
});
