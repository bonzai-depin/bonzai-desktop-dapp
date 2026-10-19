import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('main view identity uses one gutter, matching typography and readable icon tiles', {skip:!url}, async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(url + '/src/assets/tokens.css');
    const files=['GenerativeAudio','GenerativeVideo','Generative3D','Markets','ContributionOwnershipDashboard','RewardsView','HarnessView','MemoryGraph'];
    const blocks=files.map(name => {
      const source=fs.readFileSync(`src/components/${name}.vue`,'utf8');
      let header=source.match(/<header[^>]*bz-page-header[^>]*>[\s\S]*?<\/header>/)[0];
      header=header.replace(/{{[\s\S]*?}}/g,'Example title').replace(/\s(?:v-[\w:-]+|:[\w-]+|@[\w.-]+)="[^"]*"/g,'');
      return `<section class="bz-page-content" data-view="${name}">${header}</section>`;
    });
    await page.setContent(`<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/page-layout.css"><style>body{margin:0;background:var(--bz-canvas);color:var(--bz-fg)} .bz-page-content{border-bottom:1px solid var(--bz-border)}</style>${blocks.join('')}`);
    for(const theme of ['midnight','light']) {
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      for(const width of [1440,600,375]) {
        await page.setViewportSize({width,height:1000});
        const values=await page.locator('.bz-page-header').evaluateAll(nodes=>nodes.map(n=>({font:getComputedStyle(n.querySelector('h1')).fontSize,padding:getComputedStyle(n.parentElement).paddingLeft,icon:n.querySelector('.bz-title-icon').getBoundingClientRect().width})));
        assert.equal(new Set(values.map(v=>v.font)).size,1);
        assert.equal(new Set(values.map(v=>v.padding)).size,1);
        assert.equal(new Set(values.map(v=>v.icon)).size,1);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      }
    }
    await page.screenshot({path:'/tmp/bonzai-page-identity-mobile.png',fullPage:true});
  } finally { await browser.close(); }
});

test('3D prompt fills the same-height settings row without a fixed viewport cap', {skip:!url}, async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(url+'/src/assets/tokens.css');
    const styles=['Generative3D.vue','generative/GenerativeInput.vue'].flatMap(f=>[...fs.readFileSync('src/components/'+f,'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1])).join('\n').replace(/:deep\(([^)]+)\)/g,'$1');
    await page.setContent(`<link rel="stylesheet" href="/src/assets/tokens.css"><style>${styles} *{box-sizing:border-box} .environment-controls{min-height:360px} .bz-3d-mode{height:48px}</style><div class="three-controls-layout"><div class="models__activity--payouts"><div class="columns"><div class="column is-12"><div class="bz-3d-mode">Object · Level · Game</div><section class="bz-gen-input"><div class="bz-gen-input__shell"><textarea></textarea><div class="bz-gen-input__bar">Generate</div></div></section></div></div></div><div class="environment-controls">Environment settings</div></div>`);
    const dimensions=await page.evaluate(()=>{const row=document.querySelector('.three-controls-layout');return [...row.children].map(n=>n.getBoundingClientRect().height)});
    assert.ok(Math.abs(dimensions[0]-dimensions[1])<1);
    assert.ok(await page.locator('textarea').evaluate(n=>n.getBoundingClientRect().height)>150);
  } finally {await browser.close()}
});
