import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
// Exercise the public Submit action, real renderer and history store. Only local
// inference responses are simulated; this does not benchmark model aesthetics.
test('fresh generation survives overlapping envelopes, malformed plans and unsuccessful rebuilds',{skip:!url,timeout:180000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><body><div id="app"></div></body></html>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/Generative3D.vue').then(r=>r.text());
   const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime),{default:Component}=await import('/src/components/Generative3D.vue');
   const {createI18nPlugin}=await import('/src/i18n/index.js');
   window.calls=[];window.saved={};window.caseName='overlap';
   window.plan={version:1,mechanism:'Glass fits into the hollow frame.',parts:[
    {id:'body',role:'open frame',surface:'opaque',bounds:[[-.3,0,-.2],[.3,1,.2]]},
    {id:'glass_front',role:'front glazing',surface:'glass',bounds:[[-.25,.1,.175],[.25,.9,.185]]}
   ],relations:[{type:'contact',a:'glass_front',b:'body'}]};
   window.code=`setObjectInfo({title:'Glazed enclosure'});
    const body=new THREE.Group();body.name='body';root.add(body);
    const material=new THREE.MeshStandardMaterial({color:0x555555});
    for(const x of [-.275,.275]){const post=new THREE.Mesh(new THREE.BoxGeometry(.05,1,.4),material);post.position.set(x,.5,0);body.add(post);}
    for(const y of [.025,.975]){const rail=new THREE.Mesh(new THREE.BoxGeometry(.6,.05,.4),material);rail.position.set(0,y,0);body.add(rail);}
    const glass=new THREE.Mesh(new THREE.BoxGeometry(.5,.8,.01),new THREE.MeshPhysicalMaterial({transmission:.9,roughness:.1}));glass.name='glass_front';glass.position.set(0,.5,.18);root.add(glass);`;
   window.electronAPI={store:{get:async(k,f)=>window.saved[k]??f,set:async(k,v)=>{window.saved[k]=JSON.parse(JSON.stringify(v));}},checkModel:async()=>true,loadModel:async()=>({success:true}),resetChat:async()=>{},getSystemInfo:async()=>({}),
    chat:async prompt=>{
     window.calls.push(prompt);
     if(window.caseName==='transport')throw new Error('Local model unavailable');
     if(prompt.startsWith('Design a coherent functional assembly'))return {text:window.caseName==='malformed'?'not JSON':JSON.stringify(window.plan)};
     if(prompt.includes('Measured issues:'))return {text:'throw new Error("simulated rebuild failure");'};
     if(prompt.includes('minimal exact text edits'))return {text:JSON.stringify({edits:[{old:'root.add(brokenName);',new:'// repaired missing variable'}]})};
     return {text:['rebuild','review_failure'].includes(window.caseName)?window.code.replace("glass.name='glass_front'","glass.name='unmatched_glass'"):window.caseName==='runtime'?window.code+'\nroot.add(brokenName);':window.code};
    },
    analyzeLocalImage:async()=>({response:JSON.stringify(window.caseName==='review_failure'?{score:.5,silhouette:.5,proportions:.5,materials:.5,criticalDetails:.5,verdict:'refine',defects:['Missing glazing']}:{score:.9,silhouette:.9,proportions:.9,materials:.9,criticalDetails:.9,verdict:'pass',defects:[]})})};
   window.vm=createApp(Component).use(createI18nPlugin()).mount('#app');
  });
  await page.waitForFunction(()=>window.vm.threeViewer?.isReady&&window.vm.isModel&&!window.vm.threeViewer.isGenerating&&window.vm.threeViewer.scene.getObjectByName('GeneratedObject'));
  for(const name of ['overlap','malformed','rebuild','review_failure','runtime','level']){
   const result=await page.evaluate(async name=>{
    window.caseName=name;window.calls=[];const vm=window.vm;vm.creationMode=name==='level'?'level':'object';vm.form.prompt='Glazed enclosure '+name;
    await vm.onSubmit();const record=vm.objectInferences.at(-1);
    const persisted=Object.values(window.saved).flat().find(v=>v?.id===record?.id);
    return {status:vm.lastStatus,loading:vm.isLoading,calls:window.calls.length,plans:window.calls.filter(p=>p.startsWith('Design a coherent')).length,
     rebuilds:window.calls.filter(p=>p.includes('Measured issues:')).length,
     visible:!!vm.threeViewer.scene.getObjectByName('GeneratedObject'),
     record:record?{success:record.success,prompt:record.prompt,plan:record.assemblyContract,report:record.assemblyReport,diagnostics:record.assemblyPlanningDiagnostics,verified:record.visionVerified,kind:record.assetKind}:null,
     persisted:!!persisted?.code, trace:record?.generationTrace, finalTrace:window.saved.last3dGenerationTrace};
   },name);
   assert.equal(result.loading,false);assert.ok(result.visible,JSON.stringify(result));assert.equal(result.record?.success,true,JSON.stringify(result));assert.equal(result.record.prompt,'Glazed enclosure '+name);assert.ok(result.persisted);
   assert.ok(result.trace?.spans.length);assert.equal(result.trace.tokensPerSecond,null);assert.equal(result.finalTrace.status,'completed');
   assert.ok(result.finalTrace.spans.some(span=>span.stage==='Save result'&&span.status==='completed'));
   if(name==='malformed'){assert.equal(result.plans,2);assert.ok(!result.record.plan);assert.equal(result.record.diagnostics.length,2);}
   if(name==='overlap'){assert.equal(result.plans,1);assert.equal(result.rebuilds,0);assert.deepEqual(result.record.report.errors,[]);}
   if(['rebuild','review_failure'].includes(name)){assert.equal(result.rebuilds,1);assert.ok(result.record.report.errors.length);assert.equal(result.record.verified,false);}
   if(name==='runtime')assert.ok(result.calls>=3);
   if(name==='level')assert.equal(result.record.kind,'level');
  }
  const history=await page.evaluate(async()=>{
   const vm=window.vm,original=vm.objectInferences.find(r=>r.prompt==='Glazed enclosure overlap');
   await vm.applyInference(original);
   window.caseName='overlap';vm.refinePrompt='Keep the fitted glazing';await vm.onRefine();
   const revised=vm.objectInferences.at(-1);const preserved=vm.lastGeneratedCode;
   window.caseName='transport';vm.refinePrompt='Revise the glazing';await vm.onRefine();
   const restored=vm.lastGeneratedCode===preserved&&!!vm.threeViewer.scene.getObjectByName('GeneratedObject');
   vm.form.prompt='Transport failure';await vm.onSubmit();
   const failed=window.saved.unifiedObjectInferences.at(-1);
   return {plan:revised.assemblyContract,report:revised.assemblyReport,restored,status:vm.lastStatus,canSubmit:vm.canSubmitWithAccess,failure:failed.success,notes:failed.notes,loading:vm.isLoading};
  });
  assert.ok(history.plan);assert.deepEqual(history.report.errors,[]);assert.ok(history.restored);assert.equal(history.failure,false,JSON.stringify(history));assert.match(history.notes,/Local model unavailable/);assert.equal(history.loading,false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
