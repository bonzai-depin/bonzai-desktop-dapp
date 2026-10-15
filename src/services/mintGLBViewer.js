// The public viewer reads the same portable model attached to marketplace metadata.
// Generated source remains an attachment, not executable code in the public page.
export function buildMintGLBViewer(uri) {
 const url=uri.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
 const encoded=JSON.stringify(url).replace(/</g,'\\u003c');
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BonzAI 3D asset</title><style>body{margin:0;background:#151820;color:#f4f4f5;font:14px system-ui}canvas{display:block}#status{position:absolute;bottom:16px;left:16px;right:16px;pointer-events:none}</style><script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.170.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.170.0/examples/jsm/"}}</script></head><body><div id="status">Loading model…</div><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const status=document.getElementById('status');
try {
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#151820');
 const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.01,10000);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
 scene.add(new THREE.HemisphereLight(0xffffff,0x444455,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(4,6,5);scene.add(light);
 let mixer;const clock=new THREE.Clock();
 new GLTFLoader().load(${encoded},gltf=>{scene.add(gltf.scene);const box=new THREE.Box3().setFromObject(gltf.scene);const center=box.getCenter(new THREE.Vector3());const size=Math.max(box.getSize(new THREE.Vector3()).length(),0.1);controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(size*.8,size*.55,size*.8));camera.near=size/1000;camera.far=size*100;camera.updateProjectionMatrix();if(gltf.animations.length){mixer=new THREE.AnimationMixer(gltf.scene);gltf.animations.forEach(clip=>mixer.clipAction(clip).play());}status.textContent='Drag to orbit · Scroll to zoom';},undefined,()=>{status.textContent='Unable to load the model. Open the GLB attachment in a compatible viewer.';});
 renderer.setAnimationLoop(()=>{mixer?.update(clock.getDelta());controls.update();renderer.render(scene,camera);});
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
}catch(error){status.textContent='This browser could not start the 3D preview. Download the GLB attachment.';}
</script></body></html>`;
}
