import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;
test('bundled photographic materials render offline, keep independent tiling and embed in GLB', {skip:!url,timeout:120000}, async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[], external=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      if(new URL(route.request().url()).origin===new URL(url).origin)return route.continue();
      external.push(route.request().url());return route.abort();
    });
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<div id="app" style="height:880px"></div>');
    await page.evaluate(async()=>{
      const source=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());
      const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
      const {createApp,h}=await import(runtime);
      const {default:Viewer}=await import('/src/components/ThreeViewer.vue');
      createApp({render:()=>h(Viewer,{presentation:'studio',enablePhysics:false,ref:v=>{if(v)window.viewer=v;}})}).mount('#app');
      window.normalize=(await import('/src/components/Generative3D.vue')).normalizeLLMCode;
    });
    await page.waitForFunction(()=>window.viewer?.isReady);
    const result=await page.evaluate(async()=>{
      const v=window.viewer;
      const root=await v.applyModuleCode(window.normalize(`setObjectInfo({title:'Brick gate construction study'});
        const brick=await MAT.scanned('brick');
        const concrete=await MAT.scanned('concrete',{normalStrength:.35});
        const grass=await MAT.scanned('grass',{normalStrength:.5});
        const hole=[[-1,0],[-1,2]];
        for(let i=0;i<=32;i++){let a=Math.PI-i*Math.PI/32;hole.push([Math.cos(a),2+Math.sin(a)]);}hole.push([1,0]);
        const wall=new THREE.Mesh(H.worldUV(H.bevelPanel([[-3,-.15],[3,-.15],[3,4],[-3,4]],{depth:.5,bevel:.025,holes:[hole]}),2),brick);root.add(wall);
        const cap=new THREE.Mesh(H.worldUV(H.bevelBox(6.3,.22,.8,.025),2),concrete);cap.position.set(0,4.12,.25);root.add(cap);
        for(const x of [-2.7,2.7]){const plinth=new THREE.Mesh(H.worldUV(H.bevelBox(.8,.35,.9,.025),2),concrete);plinth.position.set(x,.175,.25);root.add(plinth);}
        const path=new THREE.Mesh(H.worldUV(H.bevelBox(2.5,.14,5,.025),2),concrete);path.position.set(0,-.07,1);root.add(path);
        for(const x of [-2.3,2.3]){const lawn=new THREE.Mesh(H.worldUV(new THREE.BoxGeometry(2,.1,5),2),grass);lawn.position.set(x,-.09,1);root.add(lawn);}
      `),'replace',{kind:'level'});
      v.setAutoRotate(false);
      window.root=root;
      const mats=[root.children[0].material,root.children[1].material,root.children.at(-1).material];
      const {createScannedLibrary}=await import('/src/components/gen3d/scannedMaterials.js');
      const THREE=await import('/node_modules/three/build/three.module.js');
      const library=createScannedLibrary(THREE,v.renderer);
      const [a,b]=await Promise.all([library.material('brick'),library.material('brick',{repeat:[3,2]})]);
      const independent=a.map!==b.map&&a.map.image===b.map.image&&a.map.repeat.x===1&&b.map.repeat.x===3;
      let disposed=0;a.map.addEventListener('dispose',()=>disposed++);library.dispose();
      let rejects=false;try{await library.material('brick');}catch{rejects=true;}
      const {exportObjectGLB}=await import('/src/components/gen3d/glbExport.js');
      const bytes=await exportObjectGLB(root),data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      const gltf=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+data.getUint32(12,true))).trim());
      return {independent,disposed,rejects,errors:v.inspectConstruction().errors,
        maps:mats.map(m=>({color:m.map.colorSpace,normal:m.normalMap.colorSpace,ao:!!m.aoMap,width:m.map.image.width})),
        images:gltf.images.length,embedded:gltf.images.every(i=>i.bufferView!==undefined),materials:gltf.materials.map(m=>({normal:!!m.normalTexture,ao:!!m.occlusionTexture}))};
    });
    assert.equal(result.independent,true);assert.equal(result.disposed,1);assert.equal(result.rejects,true);
    assert.deepEqual(result.errors,[]);
    for(const m of result.maps){assert.equal(m.color,'srgb');assert.equal(m.normal,'');assert.ok(m.ao);assert.equal(m.width,2048);}
    assert.ok(result.images>=12);assert.ok(result.embedded);assert.ok(result.materials.every(m=>m.normal&&m.ao));
    await page.locator('#app canvas').first().screenshot({path:'/tmp/bonzai-hyperstrike-materials.png'});
    const variety = await page.evaluate(async()=>{
      const root=await window.viewer.applyModuleCode(window.normalize(`setObjectInfo({title:'Material collection'});
        const ids=['american_walnut_veneer','metal_plate','rough_linen','brown_leather','marble_01','red_brick','snow_01','moon_01','bark_brown_01'];
        const geometry=new THREE.SphereGeometry(.48,64,32);
        for(let i=0;i<ids.length;i++){
          const material=await MAT.scanned(ids[i],{normalStrength:.4});
          const sphere=new THREE.Mesh(geometry,material);
          sphere.position.set((i%3-1)*1.3,.53,(Math.floor(i/3)-1)*1.3);root.add(sphere);
        }
      `));
      window.viewer.setAutoRotate(false);
      return root.children.map(m=>{
        const mat=m.material;let maskMean=1;
        if(mat.metalnessMap){const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.drawImage(mat.metalnessMap.image,0,0,32,32);const pixels=ctx.getImageData(0,0,32,32).data;let total=0;for(let i=2;i<pixels.length;i+=4)total+=pixels[i];maskMean=total/(255*1024);}
        return {name:mat.name,metalness:mat.metalness,metalMap:!!mat.metalnessMap,normal:!!mat.normalMap,effectiveMetalness:mat.metalness*maskMean};
      });
    });
    assert.equal(variety.length,9);assert.ok(variety.every(m=>m.normal));
    const metal=variety.find(m=>m.name==='scanned:metal_plate');
    assert.equal(metal.metalMap,true);assert.equal(metal.metalness,1);
    assert.ok(variety.find(m=>m.name==='scanned:rough_linen').effectiveMetalness<.05,'linen must remain dielectric even when the source supplies a near-black metalness mask');
    await page.locator('#app canvas').first().screenshot({path:'/tmp/bonzai-material-collection.png'});
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
