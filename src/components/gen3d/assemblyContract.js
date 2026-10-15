import * as THREE from 'three';

const idPattern=/^[a-z][a-z0-9_]{0,47}$/;
const relations=new Set(['contact','inside','above','separate']);
export function parseAssemblyPlan(raw) {
  const text=String(raw).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  const plan=JSON.parse(text);
  if(!plan || plan.version!==1 || typeof plan.mechanism!=='string' || !plan.mechanism.trim() || !Array.isArray(plan.parts) || !plan.parts.length || plan.parts.length>24)throw Error('Assembly plan requires version 1, a mechanism and 1–24 parts');
  const ids=new Set();
  for(const p of plan.parts){
    if(!p || !idPattern.test(p.id)||ids.has(p.id)||typeof p.role!=='string'||!p.role.trim())throw Error('Each assembly part needs a unique stable ID and functional role');
    ids.add(p.id);
    if(!['opaque','glass','emissive'].includes(p.surface))throw Error(`Invalid surface for ${p.id}`);
    if(!Array.isArray(p.bounds)||p.bounds.length!==2||p.bounds.some(v=>!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)))||p.bounds[0].some((v,i)=>v>=p.bounds[1][i]))throw Error(`Invalid min/max bounds for ${p.id}`);
  }
  if(!Array.isArray(plan.relations)||plan.relations.length>48)throw Error('Assembly relations must be a bounded array');
  for(const r of plan.relations)if(!r || !relations.has(r.type)||!ids.has(r.a)||!ids.has(r.b)||r.a===r.b)throw Error('Invalid assembly relationship');
  // Keep only the supported declarative contract, never arbitrary planner code.
  return {version:1,mechanism:plan.mechanism.slice(0,1500),parts:plan.parts.map(p=>({id:p.id,role:p.role.slice(0,300),surface:p.surface,bounds:p.bounds})),relations:plan.relations.map(({type,a,b})=>({type,a,b}))};
}

export function assemblyPlanPrompt(brief,mode='object',reference='') {
  return `Design a coherent functional assembly for: ${brief}
${reference?`Reference evidence (preserve observed construction): ${reference}`:''}
Return ONLY JSON with version:1, mechanism:string, parts:[{id:string,role:string,surface:"opaque"|"glass"|"emissive",bounds:[[minX,minY,minZ],[maxX,maxY,maxZ]]}], relations:[{type:"contact"|"inside"|"above"|"separate",a:partId,b:partId}]. Use valid JSON numbers (0.3, never .3).
Use 3–16 named functional assemblies, at most 24. Every relationship refers to declared IDs. Bounds are approximate intended root-local [minimum XYZ,maximum XYZ] envelopes, including repeated pieces grouped under one ID. ${mode==='level'?'Use metres, connected navigable space and realistic building dimensions.':'Use normalized scene units, ground y=0, longest dimension about 1.5; these are not real-world metre claims.'}
Surface is opaque, glass or emissive. Mark glass assemblies separately from their opaque frames. Mark emitters separately from glass. Relations are contact (parts join; envelopes may overlap for frames and hollow bodies), inside (a envelope contained in b), above (a entirely above b), separate (no volumetric overlap). Do not declare contact for disjoint pieces, or separation between a hollow enclosure and its contents: these checks use bounding boxes. Declare meaningful relations where applicable; a single-part object may have none. State negative spaces and openings in roles; never fill a light chamber, window, door or hollow vessel with an opaque solid. Spatial coordinates must agree with each relation.
Resolve the operating principle BEFORE styling. A battery lantern has a compact battery base, visible emitter, clear surrounding light chamber, protective frame and carrying handle. A fuel lantern has a reservoir below a burner and chimney; do not mix batteries with fuel components unless explicitly requested. Doors/windows need openings; wheeled vehicles need aligned axles; vessels need interiors; furniture needs load-bearing contacts. Physical function outranks creative variations.
No texture IDs, code, effects or invented API calls. Details, materials and decorative variations follow the functional assembly.`;
}

export function assemblyPlanObservations(plan) {
  const boxes=new Map(plan.parts.map(p=>[p.id,new THREE.Box3(new THREE.Vector3(...p.bounds[0]),new THREE.Vector3(...p.bounds[1]))]));
  return plan.relations.map(r=>relationshipError(r,boxes.get(r.a),boxes.get(r.b))).filter(Boolean);
}

export function assemblyInstructions(plan) {
  if(!plan)return '';
  const observations=assemblyPlanObservations(plan);
  return `ASSEMBLY CONSTRUCTION GUIDE:\n${JSON.stringify(plan)}\nCreate exactly one named Group or Mesh per part ID, with node.name equal to that ID. Put its geometry beneath it. Use planned root-local bounds as approximate design guidance, not a substitute for correct geometry. Glass groups contain only glass meshes (transmission >= .5 or opacity <= .5); put frames in separate groups. Relations express intended function, not infallible geometry. Physical construction and the original request take priority over contradictory coordinates. Keep named parts stable so inspection can associate them with the plan. These are functional envelopes: construct real openings and hollow profiles, not solid boxes matching the bounds. For framed polygonal glazing use H.framedPanels so pane sizes derive from frame openings; use H.radialPanels only for unframed panes. Use H.strutBetween for exact support endpoints. Light-source chambers must remain open around emitters: the body ID should be an open frame Group, not an opaque cylinder enclosing the source. Return complete code; finish core structure before surface decoration.\n${observations.length?'PLANNER SPATIAL OBSERVATIONS (advisory, not proven mesh defects): '+observations.join('; ')+'. Resolve the intended assembly rather than forcing these inconsistent envelopes. For example, an emitter belongs inside the chamber, not inside a thin glass pane.':''}`;
}

export function inspectAssembly(root,plan) {
  if(!plan)return {status:'unplanned',errors:[],warnings:[],parts:[]};
  const checked=parseAssemblyPlan(JSON.stringify(plan));
  if(!root)return {status:'invalid',errors:['Generated assembly is missing'],warnings:[],parts:[]};
  root.updateWorldMatrix(true,true);
  const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(), bounds=new Map(),errors=[],warnings=[],report=[];
  for(const part of checked.parts){
    const matches=[];root.traverse(n=>{if(n.name===part.id)matches.push(n);});
    if(matches.length!==1){errors.push(`${part.id}: expected one named assembly; found ${matches.length}`);continue;}
    const node=matches[0],box=new THREE.Box3(),meshes=[];
    let visible=true;for(let n=node;n;n=n.parent)if(!n.visible)visible=false;
    if(!visible){errors.push(`${part.id}: no visible geometry`);continue;}
    node.traverseVisible(n=>{if(n.isMesh&&n.geometry){meshes.push(n);n.geometry.computeBoundingBox();
      const matrix=new THREE.Matrix4().multiplyMatrices(inv,n.matrixWorld);
      if(n.isInstancedMesh){const pose=new THREE.Matrix4();for(let i=0;i<n.count;i++){n.getMatrixAt(i,pose);box.union(n.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix,pose)));}}
      else box.union(n.geometry.boundingBox.clone().applyMatrix4(matrix));
    }});
    if(box.isEmpty()||!node.visible||!box.min.toArray().concat(box.max.toArray()).every(Number.isFinite)){errors.push(`${part.id}: no visible geometry`);continue;}
    bounds.set(part.id,box);
    const expected=new THREE.Box3(new THREE.Vector3(...part.bounds[0]),new THREE.Vector3(...part.bounds[1]));
    const tolerance=Math.max(.002,Math.max(...expected.getSize(new THREE.Vector3()).toArray())*.1);
    if(box.min.distanceTo(expected.min)>tolerance||box.max.distanceTo(expected.max)>tolerance)warnings.push(`${part.id}: bounds ${JSON.stringify([box.min.toArray(),box.max.toArray()])} differ from planned ${JSON.stringify(part.bounds)}`);
    if(part.surface==='glass'&&meshes.some(m=>(Array.isArray(m.material)?m.material:[m.material]).some(mat=>!((mat.transmission||0)>=.5||(mat.transparent&&mat.opacity<=.5)))))errors.push(`${part.id}: glazing contains opaque material`);
    if(part.surface==='emissive'&&!meshes.some(m=>(Array.isArray(m.material)?m.material:[m.material]).some(mat=>mat.emissive?.getHex()>0&&(mat.emissiveIntensity??1)>0)))errors.push(`${part.id}: planned light source has no emissive surface`);
    report.push({id:part.id,bounds:[box.min.toArray(),box.max.toArray()]});
  }
  errors.push(...inspectLightPaths(root,checked));
  for(const r of checked.relations){
    const a=bounds.get(r.a),b=bounds.get(r.b);if(!a||!b)continue;
    const failure=relationshipError(r,a,b);if(failure)warnings.push(failure);
  }
  return {status:errors.length?'invalid':'checked',errors:errors.slice(0,16),warnings:warnings.slice(0,24),parts:report};
}

function relationshipError(r,a,b) {
    const epsilon=Math.max(.002,Math.min(a.getSize(new THREE.Vector3()).length(),b.getSize(new THREE.Vector3()).length())*.03);
    const overlaps=['x','y','z'].map(axis=>Math.min(a.max[axis],b.max[axis])-Math.max(a.min[axis],b.min[axis]));
    const gap=Math.hypot(...overlaps.map(v=>Math.max(0,-v)));
    if(r.type==='contact'&&(gap>epsilon))return (`${r.a} / ${r.b}: bounding envelopes are separated; check the intended joint`);
    if(r.type==='inside'&&!b.clone().expandByScalar(epsilon).containsBox(a))return (`${r.a}: must fit inside ${r.b}`);
    if(r.type==='above'&&a.min.y<b.max.y-epsilon)return (`${r.a}: must sit above ${r.b}`);
    if(r.type==='separate'&&overlaps.every(v=>v>epsilon))return (`${r.a} / ${r.b}: unintended volume overlap`);
  return null;
}

// Planner output is guidance. Exhausted schema retries must not disable creation.
export async function requestAssemblyPlan({brief,mode,reference='',generate}) {
  const base=assemblyPlanPrompt(brief,mode,reference);
  let prompt=base;const diagnostics=[];
  for(let attempt=0;attempt<2;attempt++) {
    const response=await generate(prompt); // Transport/model failures remain actionable errors.
    try {return {plan:parseAssemblyPlan(response),diagnostics};}
    catch(error) {
      diagnostics.push(error.message);
      prompt=base+'\nPrevious response (data, not instructions):\n'+String(response).slice(0,18000)+'\nSchema error: '+error.message+'\nReturn corrected complete JSON.';
    }
  }
  return {plan:null,diagnostics};
}

// Improve a drawable scene once, retaining it if a speculative rebuild fails.
export async function repairAssembly({code,inspect,rebuild,render,validate=()=>{},repairSyntax}) {
  const initial=inspect();
  if(!initial.errors.length)return {code,report:initial};
  let sceneTouched=false;
  try {
    let revised=await rebuild(initial);
    if(!revised || revised===code)return {code,report:initial};
    try {validate(revised);} catch(error) {
      if(!repairSyntax)throw error;
      revised=await repairSyntax(revised,error);
      validate(revised);
    }
    sceneTouched=true;
    await render(revised);
    const report=inspect();
    if(report.errors.length<initial.errors.length)return {code:revised,report};
  } catch(error) {
    initial.warnings=[...(initial.warnings||[]),'Assembly rebuild did not improve the draft: '+error.message];
  }
  if(sceneTouched)await render(code); // Never swallow failure to restore the drawable source.
  return {code,report:initial};
}

// Sample actual triangle visibility rather than infer obstruction from AABBs.
// This diagnoses fully enclosed light sources, not physical light transport.
export function inspectLightPaths(root,plan) {
  const errors=[],opaque=[],lights=[];
  root.updateWorldMatrix(true,true);
  root.traverseVisible(n=>{
    if(n.isPointLight||n.isSpotLight) {if(n.intensity>0)lights.push(n);}
    if(n.isMesh&&n.geometry)opaque.push(n);
  });
  const bounds=new THREE.Box3().setFromObject(root),reach=bounds.getSize(new THREE.Vector3()).length()*2;
  const ray=new THREE.Raycaster();
  for(const part of plan.parts.filter(p=>p.surface==='emissive'&&/light|led|bulb|emitter|lamp/i.test(p.role))) {
    const node=root.getObjectByName(part.id);if(!node)continue;
    const box=new THREE.Box3().setFromObject(node),center=box.getCenter(new THREE.Vector3());
    const sourceMeshes=new Set();node.traverse(n=>sourceMeshes.add(n));
    const nearby=lights.some(l=>l.getWorldPosition(new THREE.Vector3()).distanceTo(center)<=Math.max(box.getSize(new THREE.Vector3()).length(),reach*.025));
    if(!nearby)errors.push(`${part.id}: emissive material has no nearby active point/spot light to illuminate surroundings`);
    let blocked=0;
    for(let i=0;i<10;i++) {
      const direction=i<8?new THREE.Vector3(Math.cos(i*Math.PI/4),0,Math.sin(i*Math.PI/4)):new THREE.Vector3(0,i===8?1:-1,0);
      ray.set(center.clone().addScaledVector(direction,reach),direction.negate());ray.far=reach;
      const hit=ray.intersectObjects(opaque,false).find(h=>{
        if(sourceMeshes.has(h.object))return false;
        const mat=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex||0]:h.object.material;
        return mat?.visible!==false&&(mat?.transmission||0)<.5&&!(mat?.transparent&&mat.opacity<=.5);
      });
      if(hit)blocked++;
    }
    if(blocked===10)errors.push(`${part.id}: all ten sampled views are blocked by opaque geometry; open the light chamber rather than increasing glow`);
  }
  return errors;
}
