import * as THREE from 'three';
import {constructionHelpers} from './constructionHelpers.js';
import {productionGeometry} from './productionGeometry.js';

// Only Object3D factories are accepted, never code, geometry constructors or
// arbitrary property paths. Materials are supplied explicitly by the caller.
const factories={...constructionHelpers,radialPanels:productionGeometry.radialPanels,framedPanels:productionGeometry.framedPanels};
const optionKeys={
 hollowTube:'radius height wall material segments',openVessel:'radius height wall base material',pipeRun:'points radius material segments',
 wallOpening:'width height depth openingWidth openingHeight sill material',fittedWindow:'width height depth rail clearance glassThickness frameMaterial glassMaterial',
 hingedPanel:'width height depth clearance angle material',stairFlight:'width rise run steps material',ramp:'width rise run material',railing:'length height postRadius spacing material',
 supportFrame:'width depth height beam material',shelfUnit:'width depth height thickness shelves material',wheel:'radius width hubRadius spokes rim material',wheelAxle:'track radius width material',
 gear:'radius depth teeth bore toothDepth material',pulley:'radius width groove material',boltCircle:'radius count boltRadius height material',truss:'length height bays radius material',
 taperedBranch:'points radii material sides',terrainPatch:'width depth segments material',lightSource:'radius color intensity range emission',openBox:'width depth height wall material',
 loftBody:'rings segments material caps',clothPanel:'width height segments material',spring:'radius height wire turns material',beamGrid:'width height columns rows radius material',
 archedSpan:'width rise depth thickness segments material',facetedGem:'radius height facets material',radialPanels:'radius height sides thickness y material gap',
 framedPanels:'radius height sides rail clearance thickness y glassMaterial frameMaterial',
};
const vector=(value,label)=>{if(!Array.isArray(value)||value.length!==3||!value.every(Number.isFinite))throw Error(`${label} must be a finite XYZ vector`);return value;};
const serializable=(value,depth=0)=>{
 if(depth>8)throw Error('Assembly options are nested too deeply');
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(Array.isArray(value)&&value.length<=256){value.forEach(v=>serializable(v,depth+1));return;}
 throw Error('Assembly options must be finite JSON values or arrays; callbacks are not allowed');
};
export function assemble({parts,materials={}}={}) {
 if(!Array.isArray(parts)||!parts.length||parts.length>64)throw Error('Assembly requires 1–64 parts');
 const specs=new Map();
 for(const part of parts){
  if(!part||!/^[a-z][a-z0-9_]{0,47}$/.test(part.id)||specs.has(part.id))throw Error('Assembly needs unique stable part IDs');
  for(const key of Object.keys(part))if(!['id','helper','options','position','rotation','parent'].includes(key))throw Error(`Unknown part field: ${key}`);
  if(!Object.hasOwn(optionKeys,part.helper))throw Error(`Unsupported assembly helper: ${part.helper}`);
  const allowed=new Set(optionKeys[part.helper].split(' '));
  if(part.options!==undefined&&(!part.options||typeof part.options!=='object'||Array.isArray(part.options)))throw Error('Part options must be an object');
  for(const [key,value] of Object.entries(part.options||{})){if(!allowed.has(key))throw Error(`${part.id}: unknown option ${key}`);serializable(value);}
  if(part.position!==undefined)vector(part.position,'Position');if(part.rotation!==undefined)vector(part.rotation,'Rotation');
  if(part.parent!==undefined&&typeof part.parent!=='string')throw Error('Parent must be a part ID');
  specs.set(part.id,part);
 }
 const visiting=new Set(),visited=new Set();
 const visit=id=>{if(visiting.has(id))throw Error('Assembly hierarchy contains a cycle');if(visited.has(id))return;visiting.add(id);const p=specs.get(id);
  if(p.parent){if(!specs.has(p.parent))throw Error(`Unknown parent: ${p.parent}`);visit(p.parent);}visiting.delete(id);visited.add(id);};
 for(const id of specs.keys())visit(id);
 const nodes=new Map(),root=new THREE.Group();root.name='assembly';
 try {
  for(const p of specs.values()) {
   const opts={...p.options};
   for(const key of ['material','frameMaterial','glassMaterial'])if(key in opts){const id=opts[key];if(typeof id!=='string'||!Object.hasOwn(materials,id)||!materials[id]?.isMaterial)throw Error(`${p.id}: unknown material ${id}`);opts[key]=materials[id];}
   const built=factories[p.helper](opts);let childIndex=0;
   built.traverse(child=>{child.name=`${p.id}:${child.name||'geometry'}:${childIndex++}`;});
   const node=new THREE.Group();node.name=p.id;node.add(built);
   if(p.position)node.position.fromArray(p.position);if(p.rotation)node.rotation.set(...p.rotation);
   nodes.set(p.id,node);
  }
  for(const p of specs.values())(p.parent?nodes.get(p.parent):root).add(nodes.get(p.id));
  root.userData.constructionRecipe={version:1,parts:JSON.parse(JSON.stringify(parts))};return root;
 } catch(error) {
  const geometries=new Set(),ownedMaterials=new Set(),suppliedMaterials=new Set(Object.values(materials));
  for(const node of nodes.values())node.traverse(n=>{
   if(n.geometry)geometries.add(n.geometry);
   for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(m&&!suppliedMaterials.has(m))ownedMaterials.add(m);
  });
  geometries.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());
  throw error;
 }
}
export const ASSEMBLY_HELPERS=Object.freeze(Object.keys(optionKeys));
