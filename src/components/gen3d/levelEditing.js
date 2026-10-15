import * as THREE from 'three';
import {parse,tokenizer} from 'acorn';

export const partKey = target => target.placementId ? `placement:${target.placementId}`
  : `node:${target.path}${target.instanceId == null ? '' : `@${target.instanceId}`}`;
export const sourceForBuilder = code => {
  const input = String(code || '');
  const body=input.match(/\/\/ ── USER CODE START ──\r?\n([\s\S]*?)\/\/ ── USER CODE END ──/)?.[1] || input;
  // Only strip host attachment/return statements at the outer scope. Helpers
  // inside an asset may legitimately return a local variable named root.
  let ast;try{ast=parse(body,{ecmaVersion:'latest',sourceType:'module',allowAwaitOutsideFunction:true,allowReturnOutsideFunction:true});}catch{return body;}
  const removals=ast.body.filter(node=>node.type==='ImportDeclaration' ||
    (node.type==='ReturnStatement'&&node.argument?.name==='root') ||
    (node.type==='ExpressionStatement'&&node.expression.type==='CallExpression'&&node.expression.callee.object?.name==='scene'&&node.expression.callee.property?.name==='add'&&node.expression.arguments.length===1&&node.expression.arguments[0].name==='root'));
  let result=body;for(const node of removals.reverse())result=result.slice(0,node.start)+result.slice(node.end);
  return result;
};

export function seededLevelMath(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const math = Object.create(Math);
  math.random = () => {
    state += 0x6D2B79F5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return math;
}

// Generated previews and the editor use the same source-derived seed. Never
// derive layout from a newly allocated project ID when reopening history.
export function sceneSourceSeed(code) {
  let hash=2166136261;
  const source=sourceForBuilder(code).trim();
  const feed=value=>{for(const char of value)hash=Math.imul(hash ^ char.charCodeAt(0),16777619);};
  try {
    // Normalization indents generated modules; whitespace outside literals
    // must not produce a different procedural world.
    for(const token of tokenizer(source,{ecmaVersion:'latest'}))feed(`${token.type.label}:${String(token.value ?? '')};`);
  }catch{hash=2166136261;feed(source);}
  return `source:${hash>>>0}`;
}

const signature = node => JSON.stringify([node.name, node.type, node.children.length,
  node.geometry?.type, node.geometry?.attributes.position?.count, node.isInstancedMesh ? node.count : null]);

// Index BEFORE applying edits. Path + structural signature fails closed if the
// underlying level source changes; UUIDs do not survive a local draft reload.
export function indexLevelParts(root) {
  const index = new Map();
  const walk = (node, path) => {
    const target = { path, signature: signature(node) };
    node.userData.bonzaiPart = target;
    index.set(path, node);
    node.children.forEach((child, i) => walk(child, `${path}/${i}`));
  };
  root.children.forEach((child, i) => walk(child, String(i)));
  return index;
}

export function validateTransform(transform) {
  for (const field of ['position','rotation','scale']) {
    if (!transform?.[field] || !['x','y','z'].every(axis => Number.isFinite(transform[field][axis]))) throw new Error('Invalid object transform');
  }
  if (Object.values(transform.scale).some(value => Math.abs(value) < .00001 || Math.abs(value) > 10000)) throw new Error('Scale must be non-zero and within supported bounds');
  return transform;
}

export function readTransform(node) {
  const vector = value => ({ x:value.x, y:value.y, z:value.z });
  return {position:vector(node.position), rotation:vector(node.rotation), scale:vector(node.scale)};
}
export function writeTransform(node, transform) {
  validateTransform(transform);
  for (const field of ['position','rotation','scale']) node[field].set(transform[field].x,transform[field].y,transform[field].z);
  node.updateMatrix();node.updateMatrixWorld(true);
}

export function localPartBounds(node, instanceId) {
  if (instanceId != null && node.isInstancedMesh) {node.geometry.computeBoundingBox();return node.geometry.boundingBox.clone();}
  const copy=node.clone(true);copy.position.set(0,0,0);copy.quaternion.identity();copy.scale.set(1,1,1);
  copy.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(copy);
}

export function describePart(node, target = node.userData.bonzaiPart) {
  let transform=readTransform(node);
  if (target.instanceId != null && node.isInstancedMesh) {
    const matrix=new THREE.Matrix4(), proxy=new THREE.Object3D();
    node.getMatrixAt(target.instanceId,matrix);matrix.decompose(proxy.position,proxy.quaternion,proxy.scale);
    transform=readTransform(proxy);
  }
  const bounds=localPartBounds(node,target.instanceId);
  const size=bounds.getSize(new THREE.Vector3());
  return {key:partKey(target),target:{...target},title:node.name || node.geometry?.type?.replace('Geometry','') || node.type,
    transform,size:{x:size.x,y:size.y,z:size.z},bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
}

export function fitLevelReplacement(replacement, bounds) {
  const original=new THREE.Box3(new THREE.Vector3().fromArray(bounds.min),new THREE.Vector3().fromArray(bounds.max));
  const generated=new THREE.Box3().setFromObject(replacement);
  if(generated.isEmpty()) throw new Error('The replacement contains no geometry');
  const size=original.getSize(new THREE.Vector3()),newSize=generated.getSize(new THREE.Vector3());
  const scale=Math.max(size.x,size.y,size.z)/Math.max(newSize.x,newSize.y,newSize.z,.0001);
  const center=original.getCenter(new THREE.Vector3()),newCenter=generated.getCenter(new THREE.Vector3());
  replacement.scale.setScalar(scale);
  replacement.position.set(center.x-newCenter.x*scale,original.min.y-generated.min.y*scale,center.z-newCenter.z*scale);
}

export async function applyLevelPartEdit(index, edit, buildReplacement) {
  const node=index.get(edit.target.path);
  if (!node || node.userData.bonzaiPart?.signature!==edit.target.signature) throw new Error('The level structure changed. Re-select the object before editing.');
  const instanceId=edit.target.instanceId;
  if (instanceId != null && (!node.isInstancedMesh || !Number.isInteger(instanceId) || instanceId<0 || instanceId>=node.count)) throw new Error('Level instance no longer exists');
  if (!buildReplacement) {
    if (!edit.transform) return;
    if (instanceId == null) writeTransform(node,edit.transform);
    else {
      const proxy=new THREE.Object3D();writeTransform(proxy,edit.transform);
      node.setMatrixAt(instanceId,proxy.matrix);node.instanceMatrix.needsUpdate=true;node.computeBoundingSphere();
    }
    return;
  }
  const replacement=new THREE.Group();
  await buildReplacement(replacement);
  const generated=new THREE.Box3().setFromObject(replacement);
  if(generated.isEmpty()) throw new Error('The replacement contains no geometry');
  const original=localPartBounds(node,instanceId), size=original.getSize(new THREE.Vector3()), newSize=generated.getSize(new THREE.Vector3());
  const scale=Math.max(size.x,size.y,size.z)/Math.max(newSize.x,newSize.y,newSize.z,.0001);
  const center=original.getCenter(new THREE.Vector3()), newCenter=generated.getCenter(new THREE.Vector3());
  replacement.scale.setScalar(scale);
  replacement.position.set(center.x-newCenter.x*scale,original.min.y-generated.min.y*scale,center.z-newCenter.z*scale);
  const container=new THREE.Group();container.name=edit.replacement?.title || node.name;
  container.userData.bonzaiPart={...edit.target};container.add(replacement);
  const transform=edit.transform || describePart(node,edit.target).transform;
  writeTransform(container,transform);
  if(instanceId == null){const parent=node.parent;parent.add(container);parent.remove(node);}
  else {
    node.setMatrixAt(instanceId,new THREE.Matrix4().makeScale(0,0,0));node.instanceMatrix.needsUpdate=true;
    node.add(container);node.computeBoundingSphere();
  }
  return container;
}

export function setLevelPartEdit(level, edit) {
  if(edit.transform) validateTransform(edit.transform);
  level.partEdits ||= {};
  const key=partKey(edit.target), previous=level.partEdits[key] || {};
  if(edit.replacement) {
    // Replacing an assembly supersedes its child edits, never its siblings.
    for(const [id,value] of Object.entries(level.partEdits)) {
      if(edit.target.instanceId == null && value.target.path.startsWith(`${edit.target.path}/`)) delete level.partEdits[id];
    }
  }
  level.partEdits[key]={...previous,...edit};
}

const noopNames='setObjectInfo,setAO,setBloom,setColorGrade,setDoF,setFilmGrain,setChromatic,setLensFlare,setEnvironment,setUnderwater,setScreenDroplets';
// Added/replacement assets may animate locally, but cannot change the entire
// level's presentation or metadata. The enclosing generation owns their cleanup.
export const assetBuilder = code => `async function(root, Math, addUpdateCallback, ${noopNames.split(',').map(name=>`${name}=()=>{}`).join(',')}) {\n${sourceForBuilder(code)}\n}`;

export function compileLevelParts(level, rootName) {
  const lines=[`const partIndex = H.indexLevelParts(${rootName});`];
  for(const edit of Object.values(level.partEdits || {}).sort((a,b)=>a.target.path.split('/').length-b.target.path.split('/').length)) {
    const data={...edit};delete data.replacement;
    if(edit.replacement) data.replacement={title:edit.replacement.title};
    const builder=edit.replacement ? `async (root)=>{await (${assetBuilder(edit.replacement.code)})(root,H.seededLevelMath(${JSON.stringify(edit.replacement.seed || partKey(edit.target))}),addUpdateCallback);}` : 'null';
    lines.push(`await H.applyLevelPartEdit(partIndex,${JSON.stringify(data)},${builder});`);
  }
  return `{\n${lines.join('\n')}\n}`;
}

export function compileLevelPreview(project, levelId) {
  const level=project.levels.find(item=>item.id===levelId);
  if(!level) throw new Error('Choose a level first');
  const lines=[`setObjectInfo({title:${JSON.stringify(level.title)}});root.userData.worldScale=true;`,
    `const levelRoot=new THREE.Group();levelRoot.userData.bonzaiLevelId=${JSON.stringify(level.id)};root.add(levelRoot);`,
    `await (async function(root,Math){\n${sourceForBuilder(level.code)}\n})(levelRoot,H.seededLevelMath(${JSON.stringify(level.seed || sceneSourceSeed(level.code))}));`,
    compileLevelParts(level,'levelRoot')];
  for(const placement of level.placements || []) {
    const asset=project.objects.find(item=>item.id===placement.objectId);
    if(!asset) throw new Error('A placed asset is missing');
    validateTransform(placement);
    lines.push(`{const item=new THREE.Group();`,
      `await (${assetBuilder(asset.code)})(item,H.seededLevelMath(${JSON.stringify(asset.seed || sceneSourceSeed(asset.code))}),addUpdateCallback);`,
      `item.name=${JSON.stringify(asset.title)};item.userData.bonzaiPart={placementId:${JSON.stringify(placement.id)}};`,
      `H.writeLevelTransform(item,${JSON.stringify({position:placement.position,rotation:placement.rotation,scale:placement.scale})});levelRoot.add(item);}`);
  }
  return lines.join('\n');
}

export const levelEditingHelpers={seededLevelMath,indexLevelParts,applyLevelPartEdit,fitLevelReplacement,writeLevelTransform:writeTransform};
