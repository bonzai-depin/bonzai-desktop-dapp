import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('3D controls share a row and leave room for the scene; navigation is not sticky', {skip:!url,timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(url); await page.locator('.welcome-window').waitFor(); await page.keyboard.press('Escape');
  await page.locator('.bz-sidebar__item').and(page.getByRole('button',{name:'3D',exact:true})).click();
  await page.locator('.three-controls-layout').waitFor();
  const bounds=await page.locator('.three-controls-layout').evaluate(el=>{const [a,b]=[...el.children].map(x=>x.getBoundingClientRect());return {sameRow:Math.abs(a.top-b.top)<2,height:el.getBoundingClientRect().height};});
  assert.equal(bounds.sameRow,true);assert.ok(bounds.height<=325);
  assert.equal(await page.locator('.three-workspace-tabs').evaluate(el=>getComputedStyle(el).position),'relative');
  const viewer=await page.locator('.viewer-container').boundingBox();assert.ok(viewer.y<700 && viewer.height>=280);
  await page.screenshot({path:'/tmp/bonzai-three-layout.png'});
  for(const theme of ['default','light']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await page.setViewportSize({width:700,height:900});
   assert.ok(await page.locator('.three-controls-layout').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  }
 }finally{await browser.close();}
});
