import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('Hub publishing requires reviewed files and explicit confirmation and reports the commit', {skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:650,height:900}});let sent;
  await page.route('**/training/models/sample/hub-preview',r=>r.fulfill({json:{files:[{path:'lora/adapter_model.safetensors',repo_path:'adapter_model.safetensors',size:100}],bytes:100,digest:'review'}}));
  await page.route('**/training/models/sample/hub-upload',r=>{sent=r.request().postDataJSON();return r.fulfill({status:202,json:{job_id:'job'}});});
  await page.route('**/training/hub-uploads/job',r=>r.fulfill({json:{status:'complete',url:'https://huggingface.co/test/model/commit/test'}}));
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"></head><body><div id="app"></div></body></html>');
  await page.evaluate(async()=>{const {createApp}=await import('/node_modules/.vite/deps/vue.js');const {default:Component}=await import('/src/components/HubPublish.vue');createApp(Component,{modelId:'sample',apiBase:location.origin}).mount('#app');});
  await page.getByLabel('New repository').fill('test/model');await page.getByLabel('Write token').fill('hf_test');
  assert.equal(await page.getByRole('button',{name:'Upload privately'}).isEnabled(),false);
  await page.getByLabel('I reviewed these files',{exact:false}).check();await page.getByRole('button',{name:'Upload privately'}).click();
  await page.getByRole('link',{name:/View uploaded/}).waitFor();
  assert.equal(sent.private,true);assert.equal(sent.digest,'review');assert.equal(sent.confirmed,true);assert.equal(await page.getByLabel('Write token').inputValue(),'');
  await page.setViewportSize({width:360,height:800});assert.equal(await page.locator('.hub-publish').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 }finally{await browser.close();}
});
