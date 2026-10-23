import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('wallet connection UI and send/receive modules load before a connection is requested',{skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();const failures=[];
  page.on('response',response=>{if(response.url().includes('/node_modules/.vite/')&&response.status()>=400)failures.push(response.url());});
  await page.goto(`${url}/src/assets/tokens.css`);
  const ready=await page.evaluate(async()=>{
   // Import through Vite's transformed service, which must resolve the same
   // optimized module URLs used by the application.
   const source=await(await fetch('/src/services/web3.service.js')).text();
   const imports=[...source.matchAll(/import\(["']([^"']*appkit-scaffold-ui[^"']*)["']\)/g)].map(match=>match[1]);
   if(imports.length<4)throw new Error('Wallet preflight imports missing');
   await Promise.all(imports.map(path=>import(path)));
   return !!customElements.get('w3m-modal');
  });
  assert.equal(ready,true);assert.deepEqual(failures,[]);
 }finally{await browser.close();}
});

test('wallet SDK layer receives clicks above tokenization and restores dialog focus', {skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/buttons.css"><div id="test"></div>');
  await page.evaluate(async()=>{
   const{createApp,h}=await import('/node_modules/.vite/deps/vue.js');
   const storeSource=await(await fetch('/src/stores/web3.store.js')).text();
   const{createPinia}=await import(storeSource.match(/from ["']([^"']*pinia[^"']*)["']/)[1]);
   const{default:Mint}=await import('/src/components/MintModal.vue');
   createApp({render:()=>h(Mint,{visible:true,inferenceType:'text',content:'A local example.',contentType:'text/plain',prompt:'Example'})}).use(createPinia()).mount('#test');
   const service=await(await fetch('/src/services/web3.service.js')).text();
   const zIndex=Number(service.match(/'--w3m-z-index':\s*(\d+)/)[1]);
   const sdkUrl=service.match(/import\(["']([^"']*appkit-scaffold-ui_w3m-modal[^"']*)["']\)/)[1];
   const sdk=await import(sdkUrl);
   const source=await(await fetch(sdkUrl)).text();
   const imports=[...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)];
   const load=async name=>{const entry=imports.find(match=>new RegExp('\\b'+name+'\\b').test(match[1]));return import(new URL(entry[2],new URL(sdkUrl,location.href)).href);};
   const{ThemeController,ApiController}=await load('ThemeController');
   const{html}=await load('initializeTheming');
   ApiController.prefetchAnalyticsConfig=()=>{};
   ThemeController.setThemeVariables({'--w3m-z-index':zIndex});
   const mintSource=await(await fetch('/src/components/MintModal.vue')).text();
   const modalUrl=mintSource.match(/from ["']([^"']*\/composables\/useModalAccessibility\.js(?:\?[^"']*)?)["']/)[1];
   const{ suspendModalAccessibility }=await import(modalUrl);
   window.restoreWalletFocus=suspendModalAccessibility();
   // Use the installed SDK's actual host styles, with a local-only wallet option.
   customElements.define('wallet-layer-check',class extends sdk.W3mModalBase{
    render(){return html`<button style="position:absolute;top:40%;left:40%;width:200px;height:60px;pointer-events:auto" @click=${()=>window.walletClicked=true}>Test wallet</button>`;}
   });
   const wallet=document.createElement('wallet-layer-check');wallet.classList.add('open');document.body.append(wallet);
   window.walletLayer=wallet;
  });
  await page.getByRole('button',{name:'Test wallet',exact:true}).click();
  assert.equal(await page.evaluate(()=>walletClicked),true);
  const layers=await page.evaluate(()=>({wallet:Number(getComputedStyle(walletLayer).zIndex),mint:Number(getComputedStyle(document.querySelector('.mint-modal-overlay')).zIndex)}));
  assert.ok(layers.wallet>layers.mint);assert.ok(layers.wallet>99999,'wallet must also cover the signature waiting overlay');
  await page.getByRole('button',{name:'Test wallet',exact:true}).focus();
  assert.equal(await page.evaluate(()=>document.activeElement===walletLayer),true);
  await page.evaluate(()=>{walletLayer.remove();restoreWalletFocus();});
  assert.equal(await page.evaluate(()=>document.querySelector('.mint-modal').contains(document.activeElement)),true);
 }finally{await browser.close();}
});
