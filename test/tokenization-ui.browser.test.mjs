import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('model cards and tokenization steps remain readable across themes, widths and failure states',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent(`<link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/notices.css"><link rel="stylesheet" href="/src/assets/fields.css"><style>body{margin:0;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}#test{padding:32px;max-width:1100px;margin:auto;box-sizing:border-box}button{font:inherit}</style><div id="test"></div>`);
  await page.evaluate(async()=>{
   const {createApp,h,reactive}=await import('/node_modules/.vite/deps/vue.js');
   const {default:Card}=await import('/src/components/training/TrainingArtifactCard.vue');
   const {default:Progress}=await import('/src/components/TokenizationProgress.vue');
   window.state=reactive({current:0,complete:false,failed:false});
   const steps=[{title:'Review',detail:'Check content, rights and costs'},{title:'Publish Files',detail:'Upload public content to IPFS'},{title:'Wallet & Confirmation',detail:'Approve and confirm onchain'},{title:'Complete',detail:'Save the token record'}];
   createApp({render:()=>h('div',[h(Card,{model:{method:'nuclear',quantization:'Q4_K_M'},name:'Qwen3.5-0.8B',date:'Oct 20, 03:56',artifact:{operation:'abliteration',contentLabel:'Text',formatLabel:'Checkpoint'}},{actions:()=>[h('button',{class:'bz-btn bz-btn--primary'},'Tokenize'),h('button',{class:'bz-btn'},'Export')],default:()=>h('details',[h('summary','Model Details & Publishing'),h('p','qwen3_5_0_8b-abliterated-q4_k_m.gguf')])}),h(Progress,{steps,...state})])}).mount('#test');
  });
  for(const theme of ['default','mistral'])for(const width of [1200,390]){
   await page.setViewportSize({width,height:800});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   const buttons=page.locator('.model-artifact__actions button');const first=await buttons.nth(0).boundingBox();const second=await buttons.nth(1).boundingBox();assert.ok(first.x+first.width<=second.x,'actions must not overlap');
   await page.screenshot({path:`/tmp/bonzai-tokenize-${theme}-${width}.png`});
  }
  for(let current=0;current<4;current++){await page.evaluate(current=>{state.current=current;state.failed=current===2},current);assert.equal(await page.locator('[aria-current="step"]').count(),1);}
  assert.equal(await page.locator('.tokenization-steps li').count(),4);
  await page.evaluate(()=>{state.complete=true;state.failed=false});assert.equal(await page.locator('[aria-current="step"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test('tokenization modal previews the complete process before wallet connection',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/notices.css"><link rel="stylesheet" href="/src/assets/fields.css"><div id="test"></div>');
  await page.evaluate(async()=>{
   const{createApp,h}=await import('/node_modules/.vite/deps/vue.js');
   const storeSource=await (await fetch('/src/stores/web3.store.js')).text();
   const piniaUrl=storeSource.match(/from ["']([^"']*pinia[^"']*)["']/)[1];
   const{createPinia,setActivePinia}=await import(piniaUrl);
   const pinia=createPinia();setActivePinia(pinia);
   const{default:Modal}=await import('/src/components/MintModal.vue');
   window.previewVm=createApp({render:()=>h(Modal,{visible:true,inferenceType:'training',inferenceId:'preview-only',content:'{"model":"Qwen3.5-0.8B"}',contentType:'application/json',prompt:'Uncensored model: Qwen3.5-0.8B',generation:{license:'apache-2.0',model:'Qwen3.5-0.8B',type:'abliterated-model',artifactFormat:'Checkpoint',modality:'text'}})}).use(pinia).mount('#test');
  });
  await page.locator('[role="dialog"]').waitFor();
  await page.evaluate(async()=>{ const {installLegacyI18nBridge}=await import('/src/i18n/legacy.js');window.stopTranslation=installLegacyI18nBridge(document.body); });
  await page.locator('.token-artwork-preview img').waitFor();
  await page.waitForFunction(()=>document.querySelector('.token-artwork-preview img')?.naturalWidth===1024);
  const beforeBackground=await page.locator('.token-artwork-preview img').getAttribute('src');
  await page.getByRole('button',{name:'Next background',exact:true}).click();
  await page.waitForFunction(previous=>{const image=document.querySelector('.token-artwork-preview img');return image?.naturalWidth===1024 && image.src!==previous;},beforeBackground);

  const chosen=await page.evaluate(()=>window.previewVm.$.subTree.component.setupState.artworkGeneration.nftArtwork.backgroundId);
  assert.equal(chosen,'music','Publishing must receive the selected background');
  const crops=await page.evaluate(async()=>{const {centeredCoverRect,nftBackgrounds}=await import('/src/services/nftBackgrounds.js');return {wide:centeredCoverRect(1600,900),tall:centeredCoverRect(900,1600),count:nftBackgrounds.length};});
  assert.ok(crops.count>=15);
  for(const rect of [crops.wide,crops.tall]){assert.ok(rect.width>=1024 && rect.height>=1024);assert.ok(Math.abs(rect.x+rect.width/2-512)<.001);assert.ok(Math.abs(rect.y+rect.height/2-512)<.001);}
  const originalTheme=await page.evaluate(()=>document.documentElement.dataset.theme);
  const firstCover=await page.locator('.token-artwork-preview img').getAttribute('src');
  for(let i=0;i<50;i++){if(await page.evaluate(()=>window.previewVm.$.subTree.component.setupState.artworkTheme==='mistral'))break;await page.getByRole('button',{name:'Next theme',exact:true}).click();}
  await page.waitForFunction(old=>{const img=document.querySelector('.token-artwork-preview img');return img?.naturalWidth===1024&&img.src!==old},firstCover);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),originalTheme,'NFT theme must not change the application theme');
  const palettes=await page.evaluate(async()=>{const {nftThemePalette}=await import('/src/services/nftArtwork.js');return [nftThemePalette('mistral'),nftThemePalette('tokyo')]});
  assert.notEqual(palettes[0].background,palettes[1].background);
  assert.notEqual(palettes[0].foreground,palettes[1].foreground);

  for(const width of [1200,390]){
   await page.evaluate(width=>document.documentElement.dataset.theme=width===390?'mistral':'default',width);
   await page.setViewportSize({width,height:900});
   assert.equal(await page.locator('.mint-process .tokenization-steps li').count(),4);
   assert.equal(await page.locator('.mint-process [aria-current="step"]').innerText(),'1\nReview\nCheck content, rights and costs');
   assert.ok(await page.locator('[role="dialog"]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'modal must not overflow horizontally');
   const toggleLayout=await page.evaluate(()=>({policyBottom:document.querySelector('.mint-fields .mint-policy').getBoundingClientRect().bottom,titleTop:document.querySelector('#mint-title').getBoundingClientRect().top,transition:getComputedStyle(document.querySelector('.mint-policy input'),'::before').transitionDuration}));
   assert.ok(toggleLayout.policyBottom<=toggleLayout.titleTop,'toggles sit above the NFT title in the right column');
   assert.match(toggleLayout.transition,/0.18s/,'toggle knob animates smoothly');
   assert.equal(await page.getByText('Read Content',{exact:true}).count(),0);
   assert.equal(await page.getByText(/Minting contracts are not configured on/).count(),0);
   assert.equal(await page.getByText('Set up your IPFS storage before publishing.',{exact:true}).count(),0);
   if(width>=850){
    const layout=await page.evaluate(()=>{const left=document.querySelector('.mint-preview-column').getBoundingClientRect(),right=document.querySelector('.mint-fields').getBoundingClientRect(),cta=document.querySelector('.mint-actions--primary .bz-btn').getBoundingClientRect(),body=document.querySelector('.mint-modal-body').getBoundingClientRect();return {leftHeight:left.height,rightHeight:right.height,bottom:Math.max(left.bottom,right.bottom),ctaTop:cta.top,ctaCenter:cta.x+cta.width/2,bodyCenter:body.x+body.width/2};});
    const bottoms=await page.evaluate(()=>[document.querySelector('#mint-description').getBoundingClientRect().bottom,document.querySelector('.token-artwork-preview').getBoundingClientRect().bottom]);
    assert.ok(Math.abs(bottoms[0]-bottoms[1])<1,'description and NFT preview bottoms align');
    assert.ok(Math.abs(layout.leftHeight-layout.rightHeight)<1,'review columns must have exactly equal heights');
    assert.ok(layout.ctaTop>=layout.bottom,'CTA must sit below both columns');
    assert.ok(Math.abs(layout.ctaCenter-layout.bodyCenter)<1,'CTA must be centered across the modal');
   }
   await page.screenshot({path:`/tmp/bonzai-tokenize-modal-${width}.png`});
  }
  if (process.env.BONZAI_WIZARD_REVIEW_DIR) {
   const {mkdir}=await import('node:fs/promises'); const dir=process.env.BONZAI_WIZARD_REVIEW_DIR; await mkdir(dir,{recursive:true});
   await page.setViewportSize({width:1320,height:1500});
   await page.evaluate(()=>{document.documentElement.dataset.theme='default';});
   for (const [name,stage,currentStage,percent,message] of [['01-review','ready','upload',0,''],['02-publish','minting','upload',35,'Publishing artwork and metadata…'],['03-confirm','minting','mint',80,'Waiting for onchain confirmation…'],['04-complete','success','finalize',100,'']]) {
    await page.evaluate(({stage,currentStage,percent,message})=>{const s=window.previewVm.$.subTree.component.setupState;s.stage=stage;s.currentStage=currentStage;s.progressPercent=percent;s.progressMessage=message;s.mintResult={tokenId:'42'};},{stage,currentStage,percent,message});
    await page.screenshot({path:`${dir}/${name}.png`});
   }
   await page.evaluate(()=>{window.previewVm.$.subTree.component.setupState.stage='ready';});
  }
  await page.evaluate(()=>{window.originalFontLoad=document.fonts.load.bind(document.fonts);document.fonts.load=()=>new Promise(()=>{});});
  await page.locator('#mint-title').fill('Font failure regression');
  await page.getByRole('button',{name:'Retry',exact:true}).waitFor({timeout:10000});
  assert.equal(await page.getByText('Preparing artwork…',{exact:true}).count(),0,'A stalled font must stop showing indefinite progress');
  await page.evaluate(()=>{document.fonts.load=window.originalFontLoad});
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.token-artwork-preview img')?.naturalWidth===1024);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});

test('audio cover plays inline and stop resets playback',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage(); await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<div id="test"></div>');
  await page.evaluate(async()=>{
   const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
   const source=await(await fetch('/src/stores/web3.store.js')).text();
   const {createPinia}=await import(source.match(/from ["']([^"']*pinia[^"']*)["']/)[1]);
   const {default:Modal}=await import('/src/components/MintModal.vue');
   const bytes=new Uint8Array(44+16000*2*3),d=new DataView(bytes.buffer);
   const str=(offset,value)=>[...value].forEach((c,i)=>d.setUint8(offset+i,c.charCodeAt(0)));
   str(0,'RIFF');d.setUint32(4,bytes.length-8,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,16000,true);d.setUint32(28,32000,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,bytes.length-44,true);
   createApp({render:()=>h(Modal,{visible:true,inferenceType:'audio',inferenceId:'playback-fixture',content:bytes,contentType:'audio/wav',generation:{license:'mit'},prompt:'Playback fixture'})}).use(createPinia()).mount('#test');
  });
  await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  await page.getByRole('button',{name:'Stop preview',exact:true}).waitFor();
  assert.equal(await page.locator('audio').evaluate(el=>el.paused),false);
  await page.getByRole('button',{name:'Stop preview',exact:true}).click();
  assert.deepEqual(await page.locator('audio').evaluate(el=>({paused:el.paused,time:el.currentTime})),{paused:true,time:0});
 }finally{await browser.close();}
});
