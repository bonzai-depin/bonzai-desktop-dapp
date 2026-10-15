import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sceneDesignSignature } from '../src/components/gen3d/designSignature.js';
function asset(width=1,roughness=.5) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(width,1,1),new THREE.MeshStandardMaterial({roughness})));
  return root;
}
test('renaming or adding particles does not make a duplicate design new', () => {
  const first=asset(), second=asset(); second.name='Another title'; second.children[0].name='New name';
  second.add(new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial()));
  assert.equal(sceneDesignSignature(first),sceneDesignSignature(second));
});
test('geometry, material and repeated-object placement differences distinguish designs', () => {
  const first=asset();
  assert.notEqual(sceneDesignSignature(first),sceneDesignSignature(asset(1.3)));
  assert.notEqual(sceneDesignSignature(first),sceneDesignSignature(asset(1,.9)));
  const instances=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),2);
  const root=new THREE.Group(); root.add(instances);
  const initial=sceneDesignSignature(root);
  instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,0,0));
  assert.notEqual(initial,sceneDesignSignature(root));
});
