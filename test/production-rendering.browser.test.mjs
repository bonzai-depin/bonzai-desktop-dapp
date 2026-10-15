import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.env.BONZAI_UI_URL;
// Controlled scenes exercise the production renderer; they are not model-output
// benchmarks. Use several scales and surfaces instead of one favoured example.
test('production surfaces, bevels and fitted shadows work for objects and world-sized levels', { skip: !url, timeout: 120000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Shader Error|GL_INVALID/.test(message.text())) errors.push(message.text()); });
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0"><div id="app" style="height:900px"></div></body></html>');
    await page.evaluate(async () => {
      const source = await fetch('/src/components/ThreeViewer.vue').then(r => r.text());
      const runtime = source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
      const { createApp, h, reactive } = await import(runtime);
      const { default: Viewer } = await import('/src/components/ThreeViewer.vue');
      window.viewerProps = reactive({ enablePhysics: false, presentation: 'studio' });
      createApp({render: () => h(Viewer, {...window.viewerProps, ref: v => { if(v) window.viewer = v; }})}).mount('#app');
      window.normalize = (await import('/src/components/Generative3D.vue')).normalizeLLMCode;
    });
    await page.waitForFunction(() => window.viewer?.isReady);
    const panes=await page.evaluate(async()=>{
      const root=await window.viewer.applyModuleCode(window.normalize(`setObjectInfo({title:'Glass preservation'});
        const glass=new THREE.MeshPhysicalMaterial({transmission:.9,thickness:.005,roughness:.1,metalness:0});
        for(let i=0;i<6;i++){const pane=new THREE.Mesh(new THREE.PlaneGeometry(.12,.75),glass);pane.position.set(Math.cos(i*Math.PI/3)*.19,.45,Math.sin(i*Math.PI/3)*.19);pane.rotation.y=-i*Math.PI/3;root.add(pane);}
      `));
      return root.children.map(p=>({type:p.material.type,transmission:p.material.transmission,water:!!p.userData.isWaterPlane}));
    });
    assert.equal(panes.length,6);assert.ok(panes.every(p=>p.type==='MeshPhysicalMaterial'&&p.transmission===.9&&!p.water),'upright lantern glazing must never be inferred to be liquid');
    const object = await page.evaluate(async () => {
      const root = await window.viewer.applyModuleCode(window.normalize(`setObjectInfo({title:'Optical instrument'});
        const metal = MAT.surface('metal',{color:0x9b7850,roughness:.3,relief:.001,seed:6});
        const rubber = new THREE.MeshStandardMaterial({color:0x252830,roughness:.72});
        const mount = new THREE.Mesh(H.bevelBox(1.2,.14,.75,.035),metal);mount.position.y=.07;root.add(mount);
        for(const x of [-.44,.44]){const arm=new THREE.Mesh(H.bevelBox(.14,.65,.24,.025),metal);arm.position.set(x,.4,0);root.add(arm);}
        const profile=[new THREE.Vector2(.3,-.4),new THREE.Vector2(.38,-.35),new THREE.Vector2(.38,.32),new THREE.Vector2(.32,.38),new THREE.Vector2(.28,.38),new THREE.Vector2(.28,-.4)];
        const housing=new THREE.Mesh(new THREE.LatheGeometry(profile,64),metal);housing.rotation.x=Math.PI/2;housing.position.y=.7;root.add(housing);
        for(let i=0;i<7;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.385,.012,8,64),rubber);ring.position.set(0,.7,-.25+i*.06);root.add(ring);}
        const lens=new THREE.Mesh(new THREE.SphereGeometry(.27,48,24),new THREE.MeshPhysicalMaterial({color:0x4d6d79,roughness:.05,metalness:.5,clearcoat:1}));lens.scale.z=.18;lens.position.set(0,.7,.39);root.add(lens);
      `));
      window.viewer.setAutoRotate(false);
      let shadowed = 0; root.traverse(node => { if(node.castShadow && node.receiveShadow) shadowed++; });
      return { shadowed, normal: !!root.children[0].material.normalMap, map: !!root.children[0].material.bumpMap, roughness: !!root.children[0].material.roughnessMap };
    });
    assert.ok(object.shadowed >= 10); assert.equal(object.normal,true); assert.equal(object.map, true); assert.equal(object.roughness, true);
    const exported = await page.evaluate(async () => {
      const { exportObjectGLB } = await import('/src/components/gen3d/glbExport.js');
      const bytes = await exportObjectGLB(window.viewer.scene.getObjectByName('GeneratedObject'));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))).trim());
      return { images: json.images.length, embedded: json.images.every(image => image.bufferView !== undefined),
        toneMapping: !!window.viewer._toneMappingEffect };
    });
    assert.ok(exported.images >= 3); assert.equal(exported.embedded,true); assert.equal(exported.toneMapping,true);
    await page.screenshot({ path: '/tmp/bonzai-production-object.png' });
    await page.evaluate(() => { window.viewerProps.presentation = 'environment'; });
    const ground = await page.evaluate(() => {
      const m=window.viewer._sceneObjects.get('ground').material;
      const shader={uniforms:{},fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>'};m.onBeforeCompile(shader);
      return {map:!!m.map,colorSpace:m.map?.colorSpace,roughness:m.roughness,metalness:m.metalness,weather:shader.fragmentShader.includes('diffuseColor.rgb = mix')};
    });
    assert.equal(ground.map,true);assert.equal(ground.colorSpace,'srgb');assert.ok(ground.roughness<.4);assert.ok(ground.metalness>.3);assert.equal(ground.weather,true);
    await page.screenshot({path:'/tmp/bonzai-restored-environment.png'});
    const level = await page.evaluate(async () => {
      const viewer = window.viewer;
      const root = await viewer.applyModuleCode(window.normalize(`setObjectInfo({title:'Courtyard construction'});
        const stone=MAT.surface('stone',{color:0xa59b87,repeat:[2,2],relief:.035,seed:4});
        const trim=MAT.surface('stone',{color:0xd1c4a7,relief:.012,seed:8});
        const paver=H.worldUV(H.bevelBox(1.9,.3,1.9,.06,2),1), tiles=new THREE.InstancedMesh(paver,stone,180);
        const matrix=new THREE.Matrix4();let n=0;
        for(let x=0;x<15;x++)for(let z=0;z<12;z++){matrix.makeTranslation(x*2-14,-.15,z*2-11);tiles.setMatrixAt(n++,matrix);}root.add(tiles);
        const wall=new THREE.InstancedMesh(H.bevelBox(1.95,.95,1,.045,2),stone,90);n=0;
        for(let x=0;x<15;x++)for(let y=0;y<6;y++){matrix.makeTranslation(x*2-14,y+.5,-11);wall.setMatrixAt(n++,matrix);}root.add(wall);
        for(let x=-12;x<=12;x+=6){
          const base=new THREE.Mesh(H.bevelBox(1.6,.45,1.6,.065),trim);base.position.set(x,.225,-7);root.add(base);
          const profile=[new THREE.Vector2(.6,0),new THREE.Vector2(.6,.2),new THREE.Vector2(.43,.36),new THREE.Vector2(.36,4.8),new THREE.Vector2(.55,4.95),new THREE.Vector2(.55,5.2)];
          const column=new THREE.Mesh(new THREE.LatheGeometry(profile,32),trim);column.position.set(x,.45,-7);root.add(column);
          const cap=new THREE.Mesh(H.bevelBox(1.4,.35,1.4,.05),trim);cap.position.set(x,5.8,-7);root.add(cap);
        }
        const beam=new THREE.Mesh(H.bevelBox(27,.7,1.4,.07),trim);beam.position.set(0,6.32,-7);root.add(beam);
        const wood=MAT.surface('wood',{color:0x79583c,repeat:[1,4],relief:.015,seed:2});
        for(const x of [-8,8]){for(let i=0;i<4;i++){const plank=new THREE.Mesh(H.bevelBox(4,.16,.26,.025),wood);plank.position.set(x,1,-1+i*.3);root.add(plank);}for(const dx of [-1.5,1.5]){const foot=new THREE.Mesh(H.bevelBox(.35,1,1.2,.04),trim);foot.position.set(x+dx,.5,-.5);root.add(foot);}}
      `), 'replace', { kind: 'level' });
      viewer.setTimeOfDay('afternoon');
      const camera=viewer._lights.main.shadow.camera;
      return { orbit: viewer.controls.enabled, width: camera.right-camera.left, depth: camera.far-camera.near,
        shadowed:root.children.every(node=>node.castShadow&&node.receiveShadow), ambient:viewer._lights.ambient.intensity,
        key:viewer._lights.main.intensity, environment:viewer.scene.environmentIntensity };
    });
    assert.equal(level.orbit, true); assert.ok(level.width > 20); assert.ok(level.depth > 10);
    assert.equal(level.shadowed, true); assert.ok(level.ambient < level.key*.1); assert.equal(level.environment,.65);
    await page.screenshot({ path: '/tmp/bonzai-production-level.png' });
    const views=await page.evaluate(()=>{
      const v=window.viewer;
      const before={position:v.camera.position.toArray(),rotation:v.camera.quaternion.toArray(),target:v.controls.target.toArray(),enabled:v.controls.enabled,quality:v._renderQuality};
      const map=v._lights.main.shadow.map;
      const shots=v.captureQualityViews();
      const after={position:v.camera.position.toArray(),rotation:v.camera.quaternion.toArray(),target:v.controls.target.toArray(),enabled:v.controls.enabled,quality:v._renderQuality};
      return {before,after,shots,mapPreserved:map===v._lights.main.shadow.map,audit:v.inspectConstruction(),ambient:v._sceneObjects.get('ambientParticles').visible};
    });
    assert.deepEqual(views.before,views.after,'inspection must not move the user camera or change controls/quality');
    assert.equal(views.mapPreserved,true,'same-sized shadow maps should not be reallocated for each capture');
    assert.equal(views.ambient,false);assert.deepEqual(views.audit.errors,[]);
    assert.equal(views.shots.length,3);assert.equal(new Set(views.shots.map(shot=>shot.dataUrl)).size,3);
    const {writeFile}=await import('node:fs/promises');
    for(let i=0;i<views.shots.length;i++)await writeFile(`/tmp/bonzai-inspection-${i}.jpg`,Buffer.from(views.shots[i].dataUrl.split(',')[1],'base64'));
    await page.evaluate(async()=>{
      const v=window.viewer;
      await v.applyModuleCode(window.normalize(`setObjectInfo({title:'Arched opening'});
        const hole=[[-.25,.12],[-.25,.55]];
        for(let i=0;i<=24;i++){const a=Math.PI-i*Math.PI/24;hole.push([Math.cos(a)*.25,.55+Math.sin(a)*.25]);}hole.push([.25,.12]);
        const stone=MAT.surface('stone',{relief:.002,tileSize:.5,resolution:512});
        const wall=new THREE.Mesh(H.worldUV(H.bevelPanel([[-.5,0],[.5,0],[.5,1],[-.5,1]],{depth:.15,bevel:.008,holes:[hole]}),.5),stone);root.add(wall);
        const foot=new THREE.Mesh(H.latheProfile([[.16,0],[.16,.03],[.12,.06],[.1,.4],[.13,.44],[.13,.47]],48),stone);foot.position.set(-.42,0,.24);root.add(foot);
      `));
    });
    await page.screenshot({path:'/tmp/bonzai-profile-opening.png'});
    const invalid=await page.evaluate(async()=>{
      let shaderRejected=false,animationRejected=false;
      try{await window.viewer.applyModuleCode(window.normalize(`setObjectInfo({title:'Invalid shader'});root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.ShaderMaterial({vertexShader:'void main(){gl_Position=vec4(position,1.0);}',fragmentShader:'void main(){gl_FragColor=missingColor;}'})));`));}catch(error){shaderRejected=/shader failed/.test(error.message);}
      try{await window.viewer.applyModuleCode(window.normalize(`setObjectInfo({title:'Invalid animation'});const mesh=new THREE.Mesh(new THREE.BoxGeometry(),MAT.steel);root.add(mesh);addUpdateCallback(()=>{mesh.position.x=NaN;});`));}catch(error){animationRejected=/non-finite/.test(error.message);}
      return {shaderRejected,animationRejected};
    });
    assert.deepEqual(invalid,{shaderRejected:true,animationRejected:true});
    const defaultCode = readFileSync(new URL('../src/components/Generative3D.vue', import.meta.url), 'utf8').match(/const defaultCode = `([\s\S]*?)`;/)[1];
    const reference = await page.evaluate(async code => {
      window.viewerProps.presentation='studio';
      const root=await window.viewer.applyModuleCode(code);
      let meshes=0;const scanned=new Set();root.traverse(node=>{if(node.isMesh)meshes++;if(node.material?.name?.startsWith("scanned:"))scanned.add(node.material.name);});
      window.viewer.setAutoRotate(false);
      return {meshes,scanned:[...scanned],dial:!!root.getObjectByName("Engraved dial divisions"),animations:window.viewer._updateCallbacks.length};
    },defaultCode);
    assert.ok(reference.meshes>10);assert.ok(reference.animations>0);
    assert.deepEqual(reference.scanned.sort(),["scanned:dark_rock","scanned:granite_tile","scanned:marble_01"]);assert.equal(reference.dial,true);
    await page.screenshot({path:'/tmp/bonzai-default-reference.png'});
    await page.setViewportSize({width:480,height:800});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
