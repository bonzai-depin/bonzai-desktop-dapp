import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('construction library builds through the real viewer and exports a complete GLB',{skip:!url,timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}});
  await page.goto(`${url}/src/assets/tokens.css`);await page.setContent('<div id="app" style="height:950px"></div>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime),{default:Viewer}=await import('/src/components/ThreeViewer.vue');
   window.viewer=createApp(Viewer,{enablePhysics:false,presentation:'studio'}).mount('#app');
  });
  await page.waitForFunction(()=>window.viewer.isReady);
  const result=await page.evaluate(async()=>{
   const {constructionHelpers}=await import('/src/components/gen3d/constructionHelpers.js');
   const ids=Object.keys(constructionHelpers);
   const code=`export default async function({THREE,helpers:H,setObjectInfo}) {
    setObjectInfo({title:'Construction library',description:'Deterministic helper regression gallery'});
    const root=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0xc6985a,metalness:.35,roughness:.4,side:THREE.DoubleSide}),glass=new THREE.MeshPhysicalMaterial({color:0xddeeff,transmission:.9,roughness:.05,thickness:.01});
    const ids=${JSON.stringify(ids)};
    for(let i=0;i<ids.length;i++){
     const id=ids[i],opts={material:m,frameMaterial:m,glassMaterial:glass};
     if(id==='pipeRun')opts.points=[[0,0,0],[0,1,0],[1,2,0]];
     if(id==='taperedBranch'){opts.points=[[0,0,0],[0,1,0],[.5,2,0]];opts.radii=[.2,.12,.05];}
     if(id==='loftBody')opts.rings=[[0,.2,.3],[.5,.4,.3],[1,.2,.2]];
     if(id==='seatedProp')opts.object=new THREE.Mesh(new THREE.BoxGeometry(),m);
     const n=H[id](opts);n.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(n),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());
     const cell=new THREE.Group();cell.name=id;cell.add(n);const s=1.6/Math.max(size.x,size.y,size.z);cell.scale.setScalar(s);cell.position.set((i%7-3)*2.3-center.x*s,-b.min.y*s,(Math.floor(i/7)-1.5)*2.3-center.z*s);root.add(cell);
    }
    const assembly=H.assemble({materials:{metal:m},parts:[{id:'stand',helper:'supportFrame',options:{material:'metal'}},{id:'bulb',helper:'lightSource',parent:'stand',position:[0,1,0]}]});assembly.position.set(0,0,6);root.add(assembly);return root;
   }`;
   const root=await window.viewer.applyModuleCode(code);
   const {inspectScene}=await import('/src/components/gen3d/sceneInspection.js');const report=inspectScene(root);
   const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
   const glb=await new GLTFExporter().parseAsync(root,{binary:true});
   return {errors:report.errors,meshes:report.meshes,bytes:glb.byteLength,magic:new DataView(glb).getUint32(0,true),helpers:ids.length};
  });
  assert.deepEqual(result.errors,[]);assert.equal(result.helpers,28);assert.ok(result.meshes>60);assert.ok(result.bytes>10000);assert.equal(result.magic,0x46546c67);
  await page.locator('canvas').first().screenshot({path:'/tmp/bonzai-construction-library.png'});
 }finally{await browser.close();}
});
