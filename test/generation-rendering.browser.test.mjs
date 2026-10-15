import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('fountain rendering preserves physical water, animation and authored material choices', { skip: !url, timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error' && /Shader Error|VALIDATE_STATUS|GL_INVALID/.test(msg.text())) errors.push(msg.text()); });
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0"><div id="app" style="height:900px"></div></body></html>');
    await page.evaluate(async () => {
      const viewerSource=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());
      const vueRuntime=viewerSource.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
      const { createApp } = await import(vueRuntime);
      const { default: Viewer } = await import('/src/components/ThreeViewer.vue');
      window.normalizeCode = (await import('/src/components/Generative3D.vue')).normalizeLLMCode;
      window.viewer = createApp(Viewer, { enablePhysics: false, presentation: "studio" }).mount('#app');
    });
    await page.waitForFunction(() => window.viewer.isReady, { timeout: 60000 });
    const result = await page.evaluate(async () => {
      const v = window.viewer;
      const root = await v.applyModuleCode(window.normalizeCode(`setObjectInfo({title:'Fountain'});
        root.add(FLUID.tieredFountain({tiers:3,baseRadius:0.55}));`));
      const waters = []; let added = 0;
      root.traverse(n => { if (n.userData?.isWaterPlane) waters.push({ physical: n.material.isMeshPhysicalMaterial, transmission: n.material.transmission, emission: n.material.emissive.getHex(), reflector: !!n.isWater }); if(n.userData?.autoAdded) added++; });
      const before = v._updateCallbacks.length;
      const water = [];
      root.traverse(n => { if(n.userData?.isWaterPlane) water.push(n); });
      const old = water[0].material.normalMap.offset.x;
      v._updateCallbacks.forEach(cb => cb({ time: 4, deltaTime: 0.016 }));
      window.fixtureRoot = root;
      return { waters, added, before, animated: water[0].material.normalMap.offset.x !== old, gridDrawables: v._sceneObjects.get('grid').isLineSegments };
    });
    assert.equal(result.waters.length, 3);
    assert.ok(result.waters.every(w => w.physical && w.transmission > .8 && w.emission === 0 && !w.reflector));
    assert.equal(result.added, 0); assert.ok(result.animated); assert.ok(result.gridDrawables);
    await page.screenshot({ path: '/tmp/bonzai-fountain-revamp.png' });
    for (const width of [480, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.querySelector('canvas').getBoundingClientRect().width <= innerWidth);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    const preservation = await page.evaluate(async () => {
      const v = window.viewer;
      const root = await v.applyModuleCode(`export default async function({THREE}) {
        const root = new THREE.Group();
        const mat = new THREE.MeshPhysicalMaterial({color:0x888888,roughness:.94,transmission:.4,ior:1.333});
        root.add(new THREE.Mesh(new THREE.SphereGeometry(.3),mat));
        return root;
      }`);
      return { roughness: root.children[0].material.roughness, transmission: root.children[0].material.transmission, physical: root.children[0].material.isMeshPhysicalMaterial };
    });
    assert.deepEqual(preservation, { roughness: .94, transmission: .4, physical: true });
    const integrations = await page.evaluate(async () => {
      const v = window.viewer;
      v.setChromatic(.015); v.setColorGrade({ saturation: .85 }); v.setRenderQuality('medium');
      const texture = v._activeEngine.TEX.stone(0xd8cbb0);
      const pixels = texture.image.getContext('2d').getImageData(0,0,64,64).data;
      let red = 0; for(let i=0;i<pixels.length;i+=4) red += pixels[i];
      const numericTextureColor = red / (pixels.length/4) > 130;
      texture.dispose();
      const retained = v._chromaPass.uniforms.get('uStrength').value === .015 && v._gradePass.uniforms.get('uSaturation').value === .85;
      const empty = await v.applyModuleCode(window.normalizeCode(`setObjectInfo({title:'Empty bowl'});
        const profile = [new THREE.Vector2(0,0),new THREE.Vector2(.3,.02),new THREE.Vector2(.4,.4),new THREE.Vector2(.35,.4),new THREE.Vector2(.25,.05),new THREE.Vector2(0,.05)];
        root.add(new THREE.Mesh(new THREE.LatheGeometry(profile,32),new THREE.MeshStandardMaterial({side:THREE.DoubleSide})));`));
      let fluids = 0; empty.traverse(n => { if(n.userData?.isWaterPlane || n.name === 'liquid_fill') fluids++; });
      let rejectedBrokenAnimation = false;
      try {
        await v.applyModuleCode(window.normalizeCode(`setObjectInfo({title:'Broken animation'});
          root.add(new THREE.Mesh(new THREE.BoxGeometry(), MAT.clay));
          addUpdateCallback(() => { throw new Error('animation contract failure'); });`));
      } catch(error) { rejectedBrokenAnimation = error.message.includes('animation contract failure'); }
      const game = await v.applyModuleCode(window.normalizeCode(`setObjectInfo({title:'World scale'});
        const session = GAME.create({title:'World scale'});
        const world = new THREE.Mesh(new THREE.BoxGeometry(20,1,20), MAT.clay);
        root.add(world); session.level('world',world);`));
      return { retained, fluids, gameScale: game.scale.x, numericTextureColor, rejectedBrokenAnimation };
    });
    assert.deepEqual(integrations, { retained: true, fluids: 0, gameScale: 1, numericTextureColor: true, rejectedBrokenAnimation: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// Optional live-model output: keep generated code outside the repository.
test('local model output compiles through the production normalizer and renders', { skip: !url || !process.env.BONZAI_GENERATED_3D, timeout: 120000 }, async () => {
  const { readFileSync } = await import('node:fs');
  const code = readFileSync(process.env.BONZAI_GENERATED_3D, 'utf8');
  const kind = process.env.BONZAI_GENERATED_3D_KIND || 'object';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error' && /Shader Error|VALIDATE_STATUS|GL_INVALID/.test(msg.text())) errors.push(msg.text()); });
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0"><div id="app" style="height:900px"></div></body></html>');
    await page.evaluate(async kind => {
      const viewerSource=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());
      const vueRuntime=viewerSource.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
      const { createApp } = await import(vueRuntime);
      const { default: Viewer } = await import('/src/components/ThreeViewer.vue');
      window.normalizeCode = (await import('/src/components/Generative3D.vue')).normalizeLLMCode;
      window.viewer = createApp(Viewer, { enablePhysics: false, presentation: kind === 'level' ? 'environment' : 'studio' }).mount('#app');
    }, kind);
    await page.waitForFunction(() => window.viewer.isReady);
    const stats = await page.evaluate(async ({code,kind}) => {
      const v = window.viewer;
      const root = await v.applyModuleCode(window.normalizeCode(code), 'replace', {kind});
      let triangles = 0, meshes = 0;
      root.traverse(n => { if(n.isMesh) { meshes++; triangles += ((n.geometry.index?.count ?? n.geometry.attributes.position.count) / 3) * (n.isInstancedMesh ? n.count : 1); } });
      // Compile and run callbacks explicitly; do not mistake a mounted canvas for success.
      v._updateCallbacks.forEach(cb => cb({time:1,deltaTime:1/60}));
      v._renderScene();
      return { meshes, triangles, animationCallbacks: v._updateCallbacks.length };
    }, {code,kind});
    assert.ok(stats.meshes > 0); assert.ok(Number.isFinite(stats.triangles));
    console.log('Live generated scene:', stats);
    await page.screenshot({path:'/tmp/bonzai-qwen-live-render.png'});
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the same renderer supports organic, mechanical, architectural, soft and shader-based assets', { skip: !url, timeout: 120000 }, async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    const page = await browser.newPage({viewport:{width:1100,height:800}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<html><body style="margin:0"><div id="app" style="height:800px"></div></body></html>');
    await page.evaluate(async()=>{
      const viewerSource=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());
      const vueRuntime=viewerSource.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
      const {createApp}=await import(vueRuntime);
      const {default:Viewer}=await import('/src/components/ThreeViewer.vue');
      window.normalizeCode=(await import('/src/components/Generative3D.vue')).normalizeLLMCode;
      window.viewer=createApp(Viewer,{enablePhysics:false,presentation:'studio'}).mount('#app');
    });
    await page.waitForFunction(()=>window.viewer.isReady);
    const results=await page.evaluate(async()=>{
      const fixtures={
        organic:`const path=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.2,.5,.1),new THREE.Vector3(-.1,1,0)]); root.add(new THREE.Mesh(new THREE.TubeGeometry(path,32,.12,12,false),MAT.bark));`,
        mechanical:`const gear=new THREE.Group(); const teeth=new THREE.InstancedMesh(new THREE.BoxGeometry(.1,.1,.06),MAT.steel,16); for(let i=0;i<16;i++){const m=new THREE.Matrix4().makeRotationZ(i*Math.PI/8);m.setPosition(Math.cos(i*Math.PI/8)*.4,Math.sin(i*Math.PI/8)*.4+.5,0);teeth.setMatrixAt(i,m);}gear.add(teeth);root.add(gear);addUpdateCallback(({time})=>gear.rotation.y=time*.1);`,
        architecture:`const shape=new THREE.Shape();shape.moveTo(-.5,0);shape.lineTo(.5,0);shape.lineTo(.5,1);shape.lineTo(-.5,1);shape.closePath();const hole=new THREE.Path();hole.absarc(0,.55,.2,0,Math.PI*2,true);shape.holes.push(hole);root.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:2}),MAT.marble));`,
        soft:`const mat=new THREE.MeshPhysicalMaterial({color:0x703c56,roughness:.95,sheen:1,sheenColor:0x997788});const seat=new THREE.Mesh(new THREE.SphereGeometry(.4,32,16),mat);seat.scale.set(1,.35,1);seat.position.y=.5;root.add(seat);`,
        expressive:`const mesh=new THREE.Mesh(new THREE.TorusKnotGeometry(.3,.08,96,12),SHADER.hologram(0x66ddff,45));mesh.position.y=.5;root.add(mesh);`,
      };
      const counts={};
      for(const [name,body] of Object.entries(fixtures)){
        let root; try { root=await window.viewer.applyModuleCode(window.normalizeCode('setObjectInfo({title:'+JSON.stringify(name)+'});'+body)); } catch(error) { throw new Error(name+': '+error.message); }
        let count=0;root.traverse(node=>{if(node.isMesh)count++;});counts[name]=count;
      }
      return counts;
    });
    assert.equal(Object.keys(results).length,5); assert.ok(Object.values(results).every(count=>count>0));
    const studio=await page.evaluate(async()=>{
      const v=window.viewer, light=v._lights.main, environment=v.scene.environment;
      light.color.setHex(0xff3300);light.intensity=9;
      const original=v.composer.render;let observed;
      v.composer.render=()=>{observed={color:light.color.getHex(),intensity:light.intensity,neutral:v.scene.environment===v._studioEnvironment};};
      try{v._renderScene();}finally{v.composer.render=original;}
      const restored=light.color.getHex()===0xff3300&&light.intensity===9&&v.scene.environment===environment;
      const {resizeReviewImage}=await import('/src/components/gen3d/visualQuality.js');
      const canvas=document.createElement('canvas');canvas.width=3600;canvas.height=2028;
      const resized=await resizeReviewImage(canvas.toDataURL());
      const image=await new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=resized;});
      return {...observed,restored,width:image.width,height:image.height};
    });
    assert.equal(studio.color,0xffffff);assert.ok(studio.intensity>1&&studio.intensity<3);assert.equal(studio.neutral,true);assert.equal(studio.restored,true);
    assert.equal(studio.width,768);assert.equal(studio.height,433);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
