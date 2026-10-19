import * as THREE from 'three';

const pairs = (points, label) => {
  const valid = p => Array.isArray(p)
    ? p.length === 2 && p.every(Number.isFinite)
    : p?.isVector2 === true && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!Array.isArray(points) || points.length < 3 || !points.every(valid)) {
    throw new Error(`${label} needs at least three finite [x, y] pairs or THREE.Vector2 points`);
  }
  return points.map(p => Array.isArray(p) ? new THREE.Vector2(...p) : new THREE.Vector2(p.x, p.y));
};

// Real cross-sections, openings and edge highlights with a small, portable API.
// These are ordinary BufferGeometries, so the editor and GLB need no custom shader.
export function latheProfile(points, segments = 64) {
  const profile = pairs(points, 'Lathe profile');
  if (profile.some(p => p.x < 0)) throw new Error('Lathe radii cannot be negative: points are [radius, height] cross-sections, not an XY polygon outline. Use H.bevelPanel for a polygonal panel.');
  if (!Number.isFinite(segments)) throw new Error('Lathe segments must be finite');
  return new THREE.LatheGeometry(profile, Math.max(3, Math.min(128, Math.round(segments))));
}

export function bevelPanel(contour, {depth = .1, bevel = .01, holes = [], segments = 3} = {}) {
  if (!Number.isFinite(depth) || depth <= 0 || !Number.isFinite(bevel) || bevel < 0) throw new Error('Panel depth must be positive and bevel non-negative');
  const shape = new THREE.Shape(pairs(contour, 'Panel contour'));
  shape.holes = holes.map(points => new THREE.Path(pairs(points, 'Panel opening')));
  return new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: bevel > 0,
    bevelThickness: Math.min(bevel, depth * .45), bevelSize: bevel,
    bevelSegments: Math.max(1, Math.min(6, Math.round(segments))), curveSegments: 24 });
}

// Bake metre-based box-projected UVs. Per-face projection avoids shared-vertex
// seams; no runtime triplanar shader, so exported materials keep their scale.
export function worldUV(geometry, tileSize = 1) {
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new Error('Texture tile size must be positive');
  const result = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const positions = result.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i + 2 < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    normal.crossVectors(b.sub(a), c.sub(a));
    const axis = Math.abs(normal.y) >= Math.max(Math.abs(normal.x), Math.abs(normal.z)) ? 'y' : Math.abs(normal.x) >= Math.abs(normal.z) ? 'x' : 'z';
    for (let j = i; j < i + 3; j++) {
      uv[j * 2] = (axis === 'x' ? positions.getZ(j) : positions.getX(j)) / tileSize;
      uv[j * 2 + 1] = (axis === 'y' ? positions.getZ(j) : positions.getY(j)) / tileSize;
    }
  }
  result.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return result;
}

// Glass normal faces outward at every angle; dimensions derive from the same
// apothem used for placement, so adjoining panels cannot drift independently.
export function radialPanels({radius,height,sides=6,thickness=.004,y=height/2,material,gap=0}) {
  if(![radius,height,thickness].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(sides)||sides<3||sides>64||!Number.isFinite(y)||!Number.isFinite(gap)||gap<0||!material)throw Error('Invalid radial panel dimensions/material');
  const width=2*radius*Math.tan(Math.PI/sides)-gap;
  if(width<=0)throw Error('Panel gap exceeds panel width');
  const group=new THREE.Group(),geometry=new THREE.BoxGeometry(width,height,thickness);
  for(let i=0;i<sides;i++){
    const angle=i*2*Math.PI/sides,panel=new THREE.Mesh(geometry,material);
    panel.name='panel_'+i;panel.position.set(Math.sin(angle)*radius,y,Math.cos(angle)*radius);panel.rotation.y=angle;group.add(panel);
  }
  return group;
}
export function strutBetween(from,to,radius,material,segments=16) {
  if(![from,to].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||!Number.isFinite(radius)||radius<=0||!material||!Number.isFinite(segments))throw Error('Invalid support endpoints/radius/material');
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),direction=b.clone().sub(a),length=direction.length();
  if(length<1e-6)throw Error('Support endpoints coincide');
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,Math.max(6,Math.min(64,segments))),material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return mesh;
}
// Shared dimensions keep panels inside rail openings. Each face has its own
// rectangular frame; no opaque central housing is generated.
export function framedPanels({radius,height,sides=6,rail=.02,clearance=.002,thickness=.004,y=height/2,glassMaterial,frameMaterial}) {
  if(![radius,height,rail,thickness].every(n=>Number.isFinite(n)&&n>0)||!Number.isInteger(sides)||sides<3||sides>64||!Number.isFinite(clearance)||clearance<0||!Number.isFinite(y)||!glassMaterial||!frameMaterial)throw Error('Invalid framed panel dimensions/materials');
  const width=2*radius*Math.tan(Math.PI/sides),innerWidth=width-2*(rail+clearance),innerHeight=height-2*(rail+clearance);
  if(innerWidth<=0||innerHeight<=0||thickness>rail)throw Error('Frame leaves no glazing opening');
  const result=new THREE.Group(),frame=new THREE.Group(),glass=new THREE.Group();
  frame.name='frame';glass.name='glazing';result.add(frame,glass);
  for(let i=0;i<sides;i++) {
    const angle=i*2*Math.PI/sides;
    const face=new THREE.Group();face.position.set(Math.sin(angle)*radius,y,Math.cos(angle)*radius);face.rotation.y=angle;frame.add(face);
    for(const sign of [-1,1]) {
      const horizontal=new THREE.Mesh(new THREE.BoxGeometry(width,rail,rail),frameMaterial);horizontal.position.y=sign*(height-rail)/2;face.add(horizontal);
      const vertical=new THREE.Mesh(new THREE.BoxGeometry(rail,height-2*rail,rail),frameMaterial);vertical.position.x=sign*(width-rail)/2;face.add(vertical);
    }
    const panel=new THREE.Mesh(new THREE.BoxGeometry(innerWidth,innerHeight,thickness),glassMaterial);
    panel.name='panel_'+i;panel.position.copy(face.position);panel.quaternion.copy(face.quaternion);panel.castShadow=false;glass.add(panel);
  }
  return result;
}
export const productionGeometry = { latheProfile, bevelPanel, worldUV, radialPanels, strutBetween, framedPanels };
