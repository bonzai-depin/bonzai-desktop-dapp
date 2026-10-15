import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('training setup and help views work through sidebar clicks at desktop and narrow widths', {skip:!url, timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:950}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/training/info',r=>r.fulfill({json:{device:'cpu',supported_llm_models:[{key:'sample',name:'Sample model',repo:'sample/model'}],abliteration_models:[{key:'sample',name:'Sample model',repo:'sample/model'}],capabilities:{},abliteration_convert_available:true,abliteration_quantize_available:false}}));
  await page.route('**/training/models',r=>r.fulfill({json:{models:[]}}));
  await page.goto(url); await page.locator('.welcome-window').waitFor(); await page.keyboard.press('Escape');
  const go=async name=>page.locator('.bz-sidebar__item').and(page.getByRole('button',{name,exact:true})).click();
  for(const width of [1440,600]) {
   await page.setViewportSize({width,height:850});
   for(const theme of ['default','light']) {
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await go('Tune'); await page.locator('.bz-train__model-catalog button').click();
    assert.equal(await page.getByRole('button',{name:'Start training',exact:true}).isEnabled(),false);
    await page.locator('.bz-train__dropzone-input').setInputFiles({name:'examples.jsonl',mimeType:'text/plain',buffer:Buffer.from('{"text":"Example for a local training preview."}\n')});
    await page.getByLabel('Epochs',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Start training',exact:true}).isEnabled(),true);
    assert.match(await page.locator('.bz-train__review').innerText(),/1 examples/);
    assert.equal(await page.locator('.bz-train').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await page.locator('.bz-train').evaluate(el=>el.scrollTop=el.scrollHeight);
    assert.ok(await page.locator('.bz-train__models-section').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight+1),'trained models are reachable');
    await go('Uncensor'); await page.locator('.bz-train__ablit-card').click();
    assert.equal(await page.getByRole('button',{name:'Start uncensoring',exact:true}).isEnabled(),false);
    await page.getByRole('button',{name:'F16',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Start uncensoring',exact:true}).isEnabled(),true);
    await page.getByRole('button',{name:/Informed Analyze/}).click();
    assert.match(await page.locator('.bz-train__review').innerText(),/Informed/);
    assert.equal(await page.locator('.bz-train').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.bz-train__methods button').evaluateAll(items=>items.every(el=>el.scrollHeight<=el.clientHeight+1)),true,'method descriptions fit inside their controls');
    if(process.env.BONZAI_UI_SCREENSHOTS) await page.screenshot({path:`/tmp/training-${theme}-${width}.png`});
    await go('Harness'); await page.locator('.harness-view').waitFor();
    assert.match(await page.locator('.harness-status-grid').innerText(),/Not checked/i);
    await page.locator('.harness-panel > summary').click();
    await page.getByLabel('Search commands').fill('models');
    assert.match(await page.locator('.command-groups').innerText(),/!bonzai models/);
    await page.locator('.harness-view').evaluate(el=>el.scrollTop=el.scrollHeight);
    assert.equal(await page.locator('.harness-view').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await go('Licenses'); await page.locator('.bz-license').waitFor();
    await page.getByRole('searchbox',{name:'Search models'}).fill('FLUX');
    await page.getByRole('button',{name:/License details for FLUX/}).click();
    await page.locator('.bz-license__detail').waitFor();
    await page.getByRole('searchbox',{name:'Search models'}).fill('no-model-with-this-name');
    await page.locator('.bz-license__empty').waitFor();
    await page.getByRole('button',{name:'Clear filters',exact:true}).first().click();
    await page.locator('.bz-license').evaluate(el=>el.scrollTop=el.scrollHeight);
    assert.ok(await page.locator('.bz-license__row').last().evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight+1),'last license is reachable');
    assert.equal(await page.locator('.bz-license').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
   }
  }
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
