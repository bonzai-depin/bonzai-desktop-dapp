import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
// Real GPU frames with simulated local model responses test orchestration,
// persistence and conservative status handling, not aesthetic model capability.
test('local visual suggestions are saved but an unqualified judge cannot rewrite or certify the asset',{skip:!url,timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"></head><body><div id="app"></div></body></html>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/Generative3D.vue').then(r=>r.text());
   const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime),{default:Component,normalizeLLMCode}=await import('/src/components/Generative3D.vue');
   const {createI18nPlugin}=await import('/src/i18n/index.js');
   window.code=`setObjectInfo({title:'Instrument'});const shell=new THREE.Mesh(H.bevelBox(1,.6,.5,.04),new THREE.MeshStandardMaterial({color:0x777777,roughness:.3}));shell.position.y=.3;root.add(shell);`;
   window.visionCalls=[];window.chatCalls=[];window.saved={};window.normalizer=normalizeLLMCode;
   window.electronAPI={store:{get:async(k,f)=>window.saved[k]??f,set:async(k,v)=>{window.saved[k]=JSON.parse(JSON.stringify(v));}},checkModel:async()=>true,loadModel:async()=>({success:true}),resetChat:async()=>{},getSystemInfo:async()=>({}),
    chat:async prompt=>{window.chatCalls.push(prompt);return{text:prompt.includes('minimal exact text edits')?JSON.stringify({edits:[{old:'0x777777',new:'0x888888'}]}):window.code};},
    analyzeLocalImage:async payload=>{window.visionCalls.push(payload);const weak=window.visionCalls.length===1;const score=weak?.5:.9;return{response:JSON.stringify({score,silhouette:score,proportions:score,materials:score,criticalDetails:score,verdict:weak?'refine':'pass',defects:weak?['Surface needs correction']:[],strengths:[]})};}
   };
   window.vm=createApp(Component).use(createI18nPlugin()).mount('#app');
  });
  await page.waitForFunction(()=>window.vm.threeViewer?.isReady&&window.vm.threeViewer.scene.getObjectByName('GeneratedObject'));
  const result=await page.evaluate(async()=>{
   const vm=window.vm;
   await vm.applyInference({code:window.normalizer(window.code),prompt:'A finished metal instrument',assetKind:'object'});
   if(!vm.lastGeneratedCode)throw new Error('History source was not loaded: '+window.normalizer(window.code).slice(-300));
   vm.refinePrompt='Improve the finish';await vm.onRefine();
   const record=vm.objectInferences[0];if(!record)throw new Error(`${vm.lastStatus}; chats=${window.chatCalls.length}; reviews=${window.visionCalls.length}`);
   return{calls:window.visionCalls.map(call=>({local:call.auto_download===false,prompt:call.prompt})),chatCalls:window.chatCalls.length,
    status:vm.lastStatus,record:{code:record.code,screenshots:record.screenshots.length,review:record.fidelityReview,quality:record.qualityStatus,prompt:record.prompt}};
  });
  assert.equal(result.calls.length,3,JSON.stringify(result.record.review));assert.equal(result.chatCalls,1);
  assert.ok(result.calls.every(call=>call.local&&call.prompt.includes('A finished metal instrument')));
  assert.match(result.calls[0].prompt,/Overall construction/);assert.match(result.calls[1].prompt,/Reverse construction/);assert.match(result.calls[2].prompt,/Surface and joint detail/);
  assert.equal(result.record.screenshots,4);assert.match(result.record.code,/0x777777/);
  assert.equal(result.record.quality,'needs-refinement');assert.equal(result.record.review.views.length,3);
  assert.equal(result.record.review.assurance,'advisory');
  assert.match(result.record.prompt,/Improve the finish/);
  const affirmative=await page.evaluate(async()=>{
    window.electronAPI.analyzeLocalImage=async()=>JSON.stringify({score:.95,silhouette:.95,proportions:.95,materials:.95,criticalDetails:.95,verdict:'pass',defects:[]});
    window.vm.refinePrompt='Keep the silhouette';await window.vm.onRefine();
    const record=window.vm.objectInferences.at(-1);
    return {status:record.qualityStatus,verified:record.visionVerified};
  });
  assert.deepEqual(affirmative,{status:'ai-reviewed',verified:false});
  const unavailable=await page.evaluate(async()=>{
    let count=0;window.electronAPI.analyzeLocalImage=async()=>{
      count++;return count===3?'invalid review':JSON.stringify({score:.9,silhouette:.9,proportions:.9,materials:.9,criticalDetails:.9,verdict:'pass',defects:[]});
    };
    window.vm.refinePrompt='Preserve proportions';await window.vm.onRefine();
    const record=window.vm.objectInferences.at(-1);
    return {count,status:record.qualityStatus,verified:record.visionVerified};
  });
  assert.deepEqual(unavailable,{count:3,status:'unreviewed',verified:false});
 }finally{await browser.close();}
});
