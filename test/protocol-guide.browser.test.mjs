import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('Web3 guide explains missing deployment, enforces explicit publication and keeps usable receipts', {skip:!url,timeout:60000}, async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  await page.goto(url+'/src/assets/tokens.css');
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0;padding:24px;background:var(--bz-bg)"><div id="app"></div></body></html>');
  await page.evaluate(async()=>{
   let configured=false;window.uploads=[];
   window.electronAPI={publicStorage:{status:async()=>({configured,persistent:true}),receipts:async()=>[],configure:async()=>{configured=true;return {configured,persistent:true}},disconnect:async()=>{configured=false;return {configured,persistent:true}},upload:async payload=>{window.uploads.push(payload);return {cid:'bafy'+'a'.repeat(50),url:'ipfs://bafy'+'a'.repeat(50)}}}};
   const source=await fetch('/src/components/ProtocolGuide.vue').then(r=>r.text());
   const {createApp}=await import(source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1]);
   const {default:Guide}=await import('/src/components/ProtocolGuide.vue');
   const {protocolGuideState}=await import('/src/services/protocolNavigation.js');protocolGuideState.activity='mint';createApp(Guide).mount('#app');
  });
  await page.getByText(/Required addresses are missing/).waitFor();
  await page.getByRole('button',{name:'Decentralized Storage',exact:false}).click();
  const upload=page.getByRole('button',{name:'Upload to IPFS',exact:true});assert.ok(await upload.isDisabled());
  await page.getByLabel('Pinata JWT').fill('private-test-credential');await page.getByRole('button',{name:'Save Connection'}).click();
  await page.getByText('Connection saved.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Pinata JWT').inputValue(),'');
  await page.getByLabel('Choose a file').setInputFiles({name:'my-artwork.txt',mimeType:'text/plain',buffer:Buffer.from('artwork')});
  assert.ok(await upload.isDisabled());assert.equal((await page.evaluate(()=>window.uploads)).length,0);
  await page.getByRole('checkbox').check();await upload.click();
  await page.getByRole('link',{name:'Open public file'}).waitFor();
  assert.equal((await page.evaluate(()=>window.uploads)).length,1);assert.ok(await upload.isDisabled());
  for(const theme of ['dark','light']) for(const width of [1440,360]) {
   await page.setViewportSize({width,height:1100});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${theme} ${width} overflow`);
   await page.screenshot({path:`/tmp/bonzai-web3-guide-${theme}-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Forget Credentials'}).click();await page.getByText('No storage credentials saved.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Open public file'}).count(),1);
  await page.getByRole('button',{name:'Pay for Remote Workflows',exact:false}).click();await page.getByText(/Automatic stablecoin-to-social-token checkout is not implemented/).waitFor();
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
