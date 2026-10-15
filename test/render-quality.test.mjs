import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { prepareGeneratedSurfaces, fitDirectionalShadow, fitLevelOrbit } from '../src/components/gen3d/renderQuality.js';
import { surfacePixels, createSurfaceLibrary } from '../src/components/gen3d/surfaceMaterials.js';

test('shallow levels fill the orbital preview without clipping at wide or constrained widths', () => {
  const bounds=new THREE.Box3(new THREE.Vector3(100,-1,-30),new THREE.Vector3(160,6,10));
  for(const aspect of [16/9,480/900]) {
    const frame=fitLevelOrbit(bounds,45,aspect);
    const camera=new THREE.PerspectiveCamera(45,aspect,.05,2500);
    camera.position.copy(frame.position);camera.lookAt(frame.target);camera.updateMatrixWorld();
    let extent=0;
    for(const x of [100,160]) for(const y of [-1,6]) for(const z of [-30,10]) {
      const point=new THREE.Vector3(x,y,z).project(camera);
      extent=Math.max(extent,Math.abs(point.x),Math.abs(point.y));
      assert.ok(point.z>=-1&&point.z<=1);
    }
    assert.ok(extent>.88&&extent<.9,'scene should fill about 89% of the limiting axis');
  }
});

test('generated lit surfaces participate in shadows without restyling glass or authored effects', () => {
  const root = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ roughness: .94 }));
  const glass = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshPhysicalMaterial({ transmission: .95 }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial({ transparent: true }));
  const proxy = stone.clone(); proxy.userData.castShadow = false;
  root.add(stone, glass, glow, proxy);
  prepareGeneratedSurfaces(root);
  assert.equal(stone.castShadow, true); assert.equal(stone.receiveShadow, true);
  assert.equal(glass.castShadow, false); assert.equal(glass.material.transmission, .95);
  assert.equal(glow.receiveShadow, false); assert.equal(proxy.castShadow, false);
  assert.equal(stone.material.roughness, .94);
});

test('shadow coverage fits every corner of an off-centre level, not only the origin', () => {
  const scene = new THREE.Scene(), light = new THREE.DirectionalLight();
  const bounds = new THREE.Box3(new THREE.Vector3(100, -4, 80), new THREE.Vector3(220, 26, 170));
  light.position.set(10, 220, 220); bounds.getCenter(light.target.position);
  light.shadow.mapSize.set(4096, 4096); scene.add(light, light.target);
  fitDirectionalShadow(light, bounds); light.shadow.updateMatrices(light);
  for (const x of [100, 220]) for (const y of [-4, 26]) for (const z of [80, 170]) {
    const point = new THREE.Vector3(x,y,z).project(light.shadow.camera);
    assert.ok(Math.max(Math.abs(point.x),Math.abs(point.y),Math.abs(point.z)) <= 1);
  }
});

test('local PBR surfaces retain deterministic variation, correct colour spaces and shared maps', () => {
  const a = surfacePixels('stone', 2, 32), b = surfacePixels('stone', 3, 32);
  assert.deepEqual(a, surfacePixels('stone', 2, 32)); assert.notDeepEqual(a.color, b.color);
  assert.ok(new Set(a.roughness).size > 8); assert.ok(new Set(a.height).size > 8);
  const library = createSurfaceLibrary(THREE);
  const first = library.material('wood', { seed: 7, repeat: [2, 4], color: 0x664422 });
  const second = library.material('wood', { seed: 7, repeat: [2, 4] });
  assert.equal(first.map, second.map); assert.notEqual(first, second);
  assert.equal(first.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(first.bumpMap.colorSpace, THREE.NoColorSpace);
  assert.equal(first.roughnessMap.colorSpace, THREE.NoColorSpace);
  assert.deepEqual(first.map.repeat.toArray(), [2, 4]);
  assert.equal(first.color.getHex(), 0x664422);
  let disposed = false; first.map.addEventListener('dispose', () => { disposed = true; });
  library.dispose(); assert.equal(disposed, true);
});
test('normal relief is exportable, linear, neutral when disabled, and scales with physical tile size',()=>{
 const library=createSurfaceLibrary(THREE);
 const first=library.material('stone',{relief:.01,tileSize:1,resolution:128});
 const large=library.material('stone',{relief:.01,tileSize:2,resolution:128});
 const smooth=library.material('stone',{relief:0,resolution:128});
 assert.equal(first.normalMap.colorSpace,THREE.NoColorSpace);
 assert.equal(first.normalMap.image.width,128);
 assert.equal(large.normalScale.x,first.normalScale.x/2);
 assert.equal(smooth.normalScale.x,0);
 assert.equal(first.normalMap,large.normalMap,'normal strengths should not duplicate texture memory');
 library.dispose();
});
