import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('owned agents show issued and unissued holdings, augment selection and clear on wallet change',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${url}/src/assets/tokens.css`);
 await page.setContent('<html data-theme="amber"><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body><div id="app"></div></body></html>');
 await page.route('https://api.dexscreener.com/**',route=>route.fulfill({json:{pairs:[]}}));
 await page.evaluate(async()=>{
  const {createApp,reactive}=await import('/node_modules/.vite/deps/vue.js');
  const {default:View}=await import('/src/components/MyAgents.vue');
  const {web3Service}=await import('/src/services/web3.service.js');
  const {CONFIG}=await import('/src/config/web3.config.js');
  const compiled=await fetch('/src/components/MyAgents.vue').then(r=>r.text());
  const servicePath=compiled.match(/from ["']([^"']*companionToken\.service\.js[^"']*)["']/)[1];
  const {default:service}=await import(servicePath);
  const {createI18nPlugin,i18n}=await import('/src/i18n/index.js');
  i18n.setLocale('en');
  CONFIG.smartAgentIssuance.contractAddress='0x0000000000000000000000000000000000000001';
  web3Service.state=reactive({...web3Service.state,walletAddress:'0x0000000000000000000000000000000000000002'});
  const agent={ready:true,image:'/src/assets/companions/aurore.webp',id:'local',name:'Aurore · Research and original music',chainId:4663,contractAddress:CONFIG.smartAgentIssuance.contractAddress,tokenId:'1',tokenAddress:'0x0000000000000000000000000000000000000003',symbol:'AUR'};
  service.getOwnedAgentSlots=async()=>[agent,{...agent,tokenId:'2',name:'Agent #2',ready:false,image:'',tokenAddress:null,symbol:''}];
  createApp(View,{agents:[agent],onAugment:a=>window.augmented=a.id,onSetup:a=>window.setupSlot=a.tokenId}).use(createI18nPlugin()).mount('#app');
 });
 await page.getByRole('button',{name:'Augment',exact:true}).waitFor({timeout:8000}).catch(async e=>{throw new Error(e.message+' '+await page.locator('body').innerText()+' '+errors.join(';'));});
 assert.equal(await page.getByRole('article').count(),2);
 await page.getByRole('button',{name:'Augment',exact:true}).click();assert.equal(await page.evaluate(()=>window.augmented),'local');
 await page.getByRole('button',{name:'Set up agent',exact:true}).click();assert.equal(await page.evaluate(()=>window.setupSlot),'2');
 await page.evaluate(async()=>{
  const compiled=await fetch('/src/components/MyAgents.vue').then(r=>r.text());
  const path=compiled.match(/from ["']([^"']*companionToken\.service\.js[^"']*)["']/)[1];
  const {default:service}=await import(path);
  const originals=await service.getOwnedAgentSlots();
  service.getOwnedAgentSlots=async()=>[
    ...['Aurore Beaumont','Mai Tanaka','James Whitmore','Priya Sharma','Jin Park'].map((name,i)=>({...originals[0],tokenId:String(i+1),name,image:`/src/assets/companions/${['aurore','mai','james','priya','jin'][i]}.webp`,tokenAddress:i<2?originals[0].tokenAddress:null,symbol:['AUR','MAI','JAMES','PRIYA','JIN'][i]})),
    ...[6,7,8].map(id=>({...originals[1],tokenId:String(id)}))
  ];
  document.body.style.cssText='margin:0;padding:36px;background:var(--bz-canvas);font-family:Fira Sans,sans-serif';
  const label=document.createElement('p');label.textContent='MY AGENTS · DEMONSTRATION DATA · 5 PERSONALIZED AGENTS + 3 EMPTY MINTED SLOTS';label.style.cssText='color:var(--bz-fg-mid);font-size:12px;margin:0 0 24px';document.body.prepend(label);
 });
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('article').length===8);
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
 await page.screenshot({path:'/tmp/bonzai-my-agents-desktop.png',fullPage:true});
 await page.setViewportSize({width:420,height:900});
 await page.screenshot({path:'/tmp/bonzai-my-agents-mobile.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.evaluate(async()=>{const {web3Service}=await import('/src/services/web3.service.js');web3Service.state.walletAddress=null;});
 await page.getByRole('button',{name:'Use agent',exact:true}).waitFor();
 assert.equal(await page.getByRole('article').count(),1);
 assert.equal(await page.getByText('The Smart Agent collection is not available yet.',{exact:true}).count(),0);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
