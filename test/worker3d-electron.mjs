import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { exportWorker3D } from '../src/main/worker3dExport.js';
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
try {
 const options={BrowserWindow,url:'http://127.0.0.1:5187/worker-3d-runtime.html',timeoutMs:45000};
 const source=`export default async function({THREE,scene}) {
 if(window.electronAPI || typeof require !== 'undefined' || localStorage.length) throw new Error('Privileged context exposed');
 for(const url of ['http://127.0.0.1:65000/health','file:///etc/hosts']) {
   let blocked=false;try{await fetch(url);}catch{blocked=true;}if(!blocked)throw new Error('Network boundary failed');
 }
 const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,3),new THREE.MeshStandardMaterial({color:0x7440cc})));scene.add(root);return root;
 }`;
 const bytes=Buffer.from(await exportWorker3D(source,options),'base64');
 assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);
 await assert.rejects(exportWorker3D('export default function(){ return null; }',options),/meshes/);
 await assert.rejects(exportWorker3D('export default function(){ while(true){} }',{...options,timeoutMs:5000}),/timed out/);
 console.log('PASS: isolated GLB, no preload, blocked network/files, empty geometry, hard timeout');
} catch(e) {console.error(e);process.exitCode=1;} finally {app.quit();}

});
