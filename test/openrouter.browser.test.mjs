import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('consumer setup connects securely, selects a priced model, requires consent and fits narrow themes',{skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><div id="test" style="padding:24px"></div>');
  await page.evaluate(async()=>{
   window.state={source:'network',active:false,connected:false,maxTokens:2048};window.sent=[];
   window.electronAPI={openRouter:{status:async()=>state,onChanged:()=>()=>{},connect:async key=>{sent.push({connect:key});state.connected=true;},models:async()=>[{id:'example/model',name:'Example Model',context:32768,pricing:{prompt:'0.000001',completion:'0.000002'}}],mediaModels:async category=>[{id:category+'/test',name:category+' Test',supported_voices:['voice-test']}],videoJobs:async()=>[],account:async()=>({remaining:4}),configure:async input=>{input=structuredClone(input);sent.push(input);Object.assign(state,input,{active:input.source==='openrouter'});},disconnect:async()=>{Object.assign(state,{connected:false,active:false,source:'network'});}},openExternal:()=>{}};
   const{createApp,h}=await import('/node_modules/.vite/deps/vue.js');const{default:Settings}=await import('/src/components/OpenRouterSettings.vue');createApp({render:()=>h(Settings)}).mount('#test');
  });
  await page.getByRole('button',{name:'Use BonzAI Network',exact:true}).click();
  await page.getByRole('status').waitFor({timeout:3000});
  assert.equal(await page.evaluate(()=>state.source),'network');
  await page.getByRole('button',{name:'OpenRouter',exact:true}).click();
  await page.getByLabel('OpenRouter API Key').fill('test-only-key');await page.getByRole('button',{name:'Connect OpenRouter',exact:true}).click();
  await page.getByLabel('Language model', {exact:true}).selectOption('example/model');
  assert.equal(await page.getByRole('button',{name:'Use OpenRouter',exact:true}).isDisabled(),true);
  await page.getByLabel('Images',{exact:true}).focus();
  await page.getByLabel('Images',{exact:true}).selectOption('image/test');
  await page.getByLabel('Speech',{exact:true}).focus();
  await page.getByLabel('Speech',{exact:true}).selectOption('speech/test');
  assert.equal(await page.getByLabel('Find a model',{exact:true}).count(),0);
  await page.getByText('Choose a voice',{exact:true}).click();
  await page.getByRole('button',{name:'voice-test',exact:true}).click();
  assert.equal(await page.getByLabel('Speech voice',{exact:true}).inputValue(),'voice-test');
  assert.equal(await page.locator('datalist').count(),0);
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Use OpenRouter',exact:true}).click();
  await page.getByRole('status').waitFor();assert.equal(await page.evaluate(()=>state.active),true);assert.equal(await page.evaluate(()=>state.mediaModels.image),'image/test');
  assert.match(await page.locator('#test').innerText(),/\$1.00 input \/ \$2.00 output/);
  for(const [width,theme] of [[1100,'default'],[390,'mistral']]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`/tmp/bonzai-openrouter-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'BonzAI Network',exact:true}).click();
  await page.getByRole('button',{name:'Use BonzAI Network',exact:true}).click();
  await page.waitForFunction(()=>state.source==='network' && !state.active);
  assert.equal(await page.evaluate(()=>state.mediaModels.image),'image/test');
  await page.getByRole('button',{name:'OpenRouter',exact:true}).click();
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.getByLabel('OpenRouter API Key').waitFor();assert.equal(await page.evaluate(()=>state.active),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
