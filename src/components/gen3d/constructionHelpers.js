import * as THREE from 'three';
import {latheProfile, bevelPanel, strutBetween} from './productionGeometry.js';

// Dimensions are shared by mating parts. Invalid measurements fail before any
// scene mutation. Every helper returns ordinary geometry/meshes for GLB export.
const positive=(...values)=>{if(values.some(v=>!Number.isFinite(v)||v<=0))throw Error('Construction dimensions must be finite and positive');};
const count=(n,max=128)=>{if(!Number.isInteger(n)||n<1||n>max)throw Error(`Construction count must be an integer in 1–${max}`);};
const material=m=>{if(!m?.isMaterial)throw Error('Supply a Three.js material');return m;};
const group=name=>{const g=new THREE.Group();g.name=name;return g;};
const mesh=(g,m,name)=>{const n=new THREE.Mesh(g,material(m));n.name=name;n.castShadow=true;n.receiveShadow=true;return n;};
const box=(w,h,d,m,name,x=0,y=0,z=0)=>{const n=mesh(new THREE.BoxGeometry(w,h,d),m,name);n.position.set(x,y,z);return n;};
const point=p=>{if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error('Expected finite [x,y,z]');return new THREE.Vector3(...p);};

export function hollowTube({radius=0.3,height=1,wall=0.025,material:m,segments=48}={}) {
 positive(radius,height,wall);count(segments);if(segments<3)throw Error('Tube requires at least three segments');if(wall>=radius)throw Error('Tube wall must leave an open bore');
 return mesh(latheProfile([[radius,0],[radius,height],[radius-wall,height],[radius-wall,0],[radius,0]],segments),m,'tube');
}
export function openVessel({radius=0.4,height=0.6,wall=0.025,base=0.035,material:m}={}) {
 positive(radius,height,wall,base);if(wall>=radius||base>=height)throw Error('Vessel needs a positive interior');
 return mesh(latheProfile([[0,0],[radius,0],[radius,height],[radius-wall,height],[radius-wall,base],[0,base],[0,0]]),m,'vessel');
}
export function pipeRun({points,radius=0.03,material:m,segments=48}={}) {
 positive(radius);count(segments,256);if(!Array.isArray(points)||points.length<2||points.length>64)throw Error('Pipe requires 2–64 control points');
 const nodes=points.map(point);for(let i=1;i<nodes.length;i++)if(nodes[i].distanceTo(nodes[i-1])<1e-6)throw Error('Pipe control points must be distinct');
 return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(nodes,false,'centripetal'),segments,radius,12,false),m,'pipe');
}
export function wallOpening({width=2,height=2.6,depth=0.2,openingWidth=0.9,openingHeight=2,sill=0,material:m}={}) {
 positive(width,height,depth,openingWidth,openingHeight);if(!Number.isFinite(sill)||sill<0||openingWidth>=width||sill+openingHeight>=height)throw Error('Opening must fit inside the wall');
 const g=group('wall'),side=(width-openingWidth)/2,top=height-sill-openingHeight;
 g.add(box(side,height,depth,m,'left',-(openingWidth+side)/2,height/2),box(side,height,depth,m,'right',(openingWidth+side)/2,height/2),box(openingWidth,top,depth,m,'lintel',0,height-top/2));
 if(sill>0)g.add(box(openingWidth,sill,depth,m,'sill',0,sill/2));
 g.userData.opening={width:openingWidth,height:openingHeight,sill,depth};return g;
}
export function fittedWindow({width=1,height=1.2,depth=0.08,rail=0.06,clearance=0.003,glassThickness=0.008,frameMaterial,glassMaterial}={}) {
 positive(width,height,depth,rail,glassThickness);if(!Number.isFinite(clearance)||clearance<0||rail*2+clearance*2>=Math.min(width,height)||glassThickness>depth)throw Error('Frame must leave a glazing opening');
 const g=group('window');for(const sign of [-1,1])g.add(box(rail,height,depth,frameMaterial,'jamb',sign*(width-rail)/2,height/2),box(width-2*rail,rail,depth,frameMaterial,'rail',0,sign>0?height-rail/2:rail/2));
 const glass=box(width-2*(rail+clearance),height-2*(rail+clearance),glassThickness,glassMaterial,'glass',0,height/2);glass.castShadow=false;g.add(glass);return g;
}
export function hingedPanel({width=0.8,height=1.8,depth=0.04,clearance=0.004,angle=0,material:m}={}) {
 positive(width,height,depth);if(!Number.isFinite(clearance)||clearance<0||clearance*2>=Math.min(width,height)||!Number.isFinite(angle))throw Error('Invalid hinge clearance/angle');
 const pivot=group('hinge');pivot.add(box(width-2*clearance,height-2*clearance,depth,m,'panel',width/2,height/2));pivot.rotation.y=angle;
 pivot.userData.hinge={axis:'y',width,height,clearance};return pivot;
}
export function stairFlight({width=1.2,rise=1.5,run=2.4,steps=8,material:m}={}) {
 positive(width,rise,run);count(steps,128);const g=group('stairs'),riser=rise/steps,tread=run/steps;
 for(let i=0;i<steps;i++)g.add(box(width,riser*(i+1),tread,m,`step_${i}`,0,riser*(i+1)/2,(i+.5)*tread));
 g.userData.steps={riser,tread,width,start:[0,0,0],end:[0,rise,run]};return g;
}
export function ramp({width=1.2,rise=0.6,run=3,material:m}={}) {
 positive(width,rise,run);
 const geometry=bevelPanel([[0,0],[run,0],[run,rise]],{depth:width,bevel:0});
 geometry.rotateY(-Math.PI/2);geometry.translate(width/2,0,0);
 const n=mesh(geometry,m,'ramp');n.userData.slope=rise/run;return n;
}
export function railing({length=2,height=1,postRadius=0.025,spacing=0.5,material:m}={}) {
 positive(length,height,postRadius,spacing);const intervals=Math.ceil(length/spacing);count(intervals,128);
 if(postRadius*2>=height)throw Error('Rail thickness exceeds height');const g=group('railing');
 for(let i=0;i<=intervals;i++)g.add(strutBetween([i*length/intervals,0,0],[i*length/intervals,height,0],postRadius,material(m)));
 g.add(strutBetween([0,height,0],[length,height,0],postRadius,m));return g;
}
export function supportFrame({width=1,depth=0.6,height=0.8,beam=0.06,material:m}={}) {
 positive(width,depth,height,beam);if(2*beam>=Math.min(width,depth,height))throw Error('Beams leave no frame interior');const g=group('support_frame');
 for(const x of [-1,1])for(const z of [-1,1])g.add(box(beam,height,beam,m,'post',x*(width-beam)/2,height/2,z*(depth-beam)/2));
 for(const z of [-1,1])g.add(box(width-2*beam,beam,beam,m,'crossbeam',0,height-beam/2,z*(depth-beam)/2));
 for(const x of [-1,1])g.add(box(beam,beam,depth-2*beam,m,'crossbeam',x*(width-beam)/2,height-beam/2));return g;
}
export function shelfUnit({width=1,depth=0.4,height=1.5,thickness=0.04,shelves=4,material:m}={}) {
 positive(width,depth,height,thickness);count(shelves,32);if(2*thickness>=width||shelves*thickness>=height)throw Error('Shelves must leave usable openings');const g=group('shelves');
 for(const sign of [-1,1])g.add(box(thickness,height,depth,m,'side',sign*(width-thickness)/2,height/2));
 for(let i=0;i<shelves;i++)g.add(box(width-2*thickness,thickness,depth,m,'shelf',0,thickness/2+i*(height-thickness)/Math.max(1,shelves-1)));return g;
}
export function wheel({radius=0.3,width=0.12,hubRadius=0.07,spokes=8,rim=0.035,material:m}={}) {
 positive(radius,width,hubRadius,rim);count(spokes,48);if(hubRadius>=radius-rim||rim>=radius)throw Error('Wheel requires space between hub and rim');const g=group('wheel');
 const ring=hollowTube({radius,height:width,wall:rim,material:m});ring.position.y=-width/2;g.add(ring);
 g.add(mesh(new THREE.CylinderGeometry(hubRadius,hubRadius,width,24),m,'hub'));
 for(let i=0;i<spokes;i++){const a=i*2*Math.PI/spokes;g.add(strutBetween([Math.cos(a)*hubRadius,0,Math.sin(a)*hubRadius],[Math.cos(a)*(radius-rim),0,Math.sin(a)*(radius-rim)],rim*.3,m));}
 g.rotation.z=Math.PI/2;return g;
}
export function wheelAxle({track=1.2,radius=0.3,width=0.12,material:m}={}) {
 positive(track,radius,width);if(track<=width)throw Error('Wheel centres must be separated');const g=group('axle');
 for(const sign of [-1,1]){const w=wheel({radius,width,hubRadius:radius*.22,rim:radius*.12,material:m});w.position.set(sign*track/2,radius,0);g.add(w);}
 g.add(strutBetween([-track/2,radius,0],[track/2,radius,0],radius*.1,m));return g;
}
export function gear({radius=0.3,depth=0.06,teeth=16,bore=0.05,toothDepth=0.035,material:m}={}) {
 positive(radius,depth,bore,toothDepth);count(teeth,64);if(teeth<6||bore>=radius-toothDepth||toothDepth>=radius*.4)throw Error('Invalid gear bore/teeth');
 const contour=[];for(let i=0;i<teeth*4;i++){const a=i*Math.PI*2/(teeth*4),r=i%4===1||i%4===2?radius:radius-toothDepth;contour.push([Math.cos(a)*r,Math.sin(a)*r]);}
 const hole=Array.from({length:32},(_,i)=>[Math.cos(-i*Math.PI/16)*bore,Math.sin(-i*Math.PI/16)*bore]);
 return mesh(bevelPanel(contour,{depth,bevel:Math.min(.002,depth/8),holes:[hole]}),m,'gear');
}
export function pulley({radius=0.2,width=0.12,groove=0.025,material:m}={}) {
 positive(radius,width,groove);if(groove>=Math.min(radius,width/2))throw Error('Pulley groove must fit');
 return mesh(latheProfile([[0,0],[radius,0],[radius,width*.2],[radius-groove,width*.35],[radius-groove,width*.65],[radius,width*.8],[radius,width],[0,width],[0,0]]),m,'pulley');
}
export function boltCircle({radius=0.3,count:amount=8,boltRadius=0.012,height=0.018,material:m}={}) {
 positive(radius,boltRadius,height);count(amount,128);if(amount>1&&boltRadius*2>=2*radius*Math.sin(Math.PI/amount))throw Error('Fasteners would overlap');
 const n=new THREE.InstancedMesh(new THREE.CylinderGeometry(boltRadius,boltRadius,height,6),material(m),amount),pose=new THREE.Matrix4();
 for(let i=0;i<amount;i++){const a=i*Math.PI*2/amount;pose.makeTranslation(Math.cos(a)*radius,height/2,Math.sin(a)*radius);n.setMatrixAt(i,pose);}n.name='fasteners';return n;
}
export function truss({length=2,height=0.4,bays=5,radius=0.025,material:m}={}) {
 positive(length,height,radius);count(bays,64);const g=group('truss');material(m);
 g.add(strutBetween([0,0,0],[length,0,0],radius,m),strutBetween([0,height,0],[length,height,0],radius,m));
 for(let i=0;i<=bays;i++){const x=i*length/bays;g.add(strutBetween([x,0,0],[x,height,0],radius,m));if(i<bays)g.add(strutBetween([x,i%2?height:0,0],[x+length/bays,i%2?0:height,0],radius,m));}return g;
}
export function taperedBranch({points,radii,material:m,sides=12}={}) {
 if(!Array.isArray(points)||!Array.isArray(radii)||points.length!==radii.length||points.length<2||points.length>64)throw Error('Branch needs matching points and radii');radii.forEach(r=>positive(r));count(sides,32);if(sides<3)throw Error('Branch requires at least three sides');
 const nodes=points.map(point),g=group('branch');for(let i=1;i<nodes.length;i++){
 const direction=nodes[i].clone().sub(nodes[i-1]),length=direction.length();positive(length);
 const n=mesh(new THREE.CylinderGeometry(radii[i],radii[i-1],length,sides),m,'branch_segment');n.position.copy(nodes[i]).add(nodes[i-1]).multiplyScalar(.5);n.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());g.add(n);
 }return g;
}
export function terrainPatch({width=10,depth=10,segments=32,heightAt=()=>0,material:m}={}) {
 positive(width,depth);count(segments,128);if(typeof heightAt!=='function')throw Error('Supply a terrain height function');
 const geometry=new THREE.PlaneGeometry(width,depth,segments,segments);geometry.rotateX(-Math.PI/2);const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){const y=heightAt(p.getX(i),p.getZ(i));if(!Number.isFinite(y))throw Error('Terrain height must be finite');p.setY(i,y);}geometry.computeVertexNormals();geometry.computeBoundingBox();
 const n=mesh(geometry,m,'terrain');n.userData.terrain={width,depth};return n;
}
export function seatedProp({object,x=0,z=0,heightAt=()=>0,offset=0}={}) {
 if(!object?.isObject3D||object.parent||![x,z,offset].every(Number.isFinite)||typeof heightAt!=='function')throw Error('Invalid terrain placement');const y=heightAt(x,z);if(!Number.isFinite(y))throw Error('Terrain height must be finite');
 object.position.set(x,0,z);object.updateMatrixWorld(true);const bottom=new THREE.Box3().setFromObject(object).min.y;if(!Number.isFinite(bottom))throw Error('Prop has no finite geometry');object.position.y=y+offset-bottom;return object;
}
export function lightSource({radius=0.04,color=0xffe4b3,intensity=2,range=4,emission=2}={}) {
 positive(radius,range);if((typeof color!=='number'||!Number.isFinite(color)||color<0||color>0xffffff)&&!(typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)))throw Error('Light color must be a hex RGB number or #rrggbb');if(![intensity,emission].every(n=>Number.isFinite(n)&&n>=0))throw Error('Light strengths must be finite and non-negative');const g=group('light_source');
 const bulb=new THREE.Mesh(new THREE.SphereGeometry(radius,20,12),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:emission,roughness:.25}));bulb.name='emitter';bulb.castShadow=false;
 const light=new THREE.PointLight(color,intensity,range,2);light.name='local_light';g.add(bulb,light);return g;
}
export function openBox({width=1,depth=0.6,height=0.5,wall=0.04,material:m}={}) {
 positive(width,depth,height,wall);if(wall*2>=Math.min(width,depth)||wall>=height)throw Error('Box walls leave no interior');const g=group('open_box');
 g.add(box(width,wall,depth,m,'floor',0,wall/2));
 for(const sign of [-1,1])g.add(box(wall,height-wall,depth,m,'side',sign*(width-wall)/2,(height+wall)/2),box(width-2*wall,height-wall,wall,m,'end',0,(height+wall)/2,sign*(depth-wall)/2));return g;
}
export function loftBody({rings,segments=24,material:m,caps=true}={}) {
 count(segments,64);if(segments<3||!Array.isArray(rings)||rings.length<2||rings.length>64)throw Error('Loft requires 2–64 [height,radiusX,radiusZ] sections');
 for(let i=0;i<rings.length;i++){const r=rings[i];if(!Array.isArray(r)||r.length!==3||!r.every(Number.isFinite)||r[1]<=0||r[2]<=0||(i&&r[0]<=rings[i-1][0]))throw Error('Loft radii must be positive and heights increasing');}
 const vertices=[],uv=[],indices=[];
 for(let j=0;j<rings.length;j++)for(let k=0;k<=segments;k++){const a=k*Math.PI*2/segments;vertices.push(Math.sin(a)*rings[j][1],rings[j][0],Math.cos(a)*rings[j][2]);uv.push(k/segments,j/(rings.length-1));}
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<segments;k++){const a=j*(segments+1)+k,b=a+segments+1;indices.push(a,a+1,b,b,a+1,b+1);}
 if(caps)for(const end of [0,rings.length-1]){const centre=vertices.length/3;vertices.push(0,rings[end][0],0);uv.push(.5,.5);for(let k=0;k<segments;k++){const a=end*(segments+1)+k;if(end===0)indices.push(centre,a+1,a);else indices.push(centre,a,a+1);}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return mesh(geometry,m,'loft');
}
export function clothPanel({width=1,height=1,segments=20,drape=(x,y)=>0,material:m}={}) {
 positive(width,height);count(segments,64);if(typeof drape!=='function')throw Error('Supply a drape function');const geo=new THREE.PlaneGeometry(width,height,segments,segments),p=geo.attributes.position;
 for(let i=0;i<p.count;i++){const z=drape(p.getX(i),p.getY(i));if(!Number.isFinite(z))throw Error('Cloth displacement must be finite');p.setZ(i,z);}geo.computeVertexNormals();return mesh(geo,m,'cloth');
}
export function spring({radius=0.12,height=0.6,wire=0.015,turns=6,material:m}={}) {
 positive(radius,height,wire);count(turns,32);if(wire*2>=height/turns||wire>=radius)throw Error('Spring coils require positive clearance');
 const points=Array.from({length:turns*24+1},(_,i)=>{const t=i/(turns*24),a=t*turns*Math.PI*2;return [Math.sin(a)*radius,t*height,Math.cos(a)*radius];});
 const curve=new THREE.CatmullRomCurve3(points.map(point));return mesh(new THREE.TubeGeometry(curve,turns*24,wire,8,false),m,'spring');
}
export function beamGrid({width=2,height=1,columns=6,rows=3,radius=0.01,material:m}={}) {
 positive(width,height,radius);count(columns,64);count(rows,64);if(radius*2>=Math.min(width/columns,height/rows))throw Error('Grid beams would fill the cells');const g=group('grid');material(m);
 for(let i=0;i<=columns;i++){const x=-width/2+i*width/columns;g.add(strutBetween([x,0,0],[x,height,0],radius,m));}
 for(let j=0;j<=rows;j++){const y=j*height/rows;g.add(strutBetween([-width/2,y,0],[width/2,y,0],radius,m));}return g;
}
export function archedSpan({width=2,rise=1,depth=0.3,thickness=0.15,segments=24,material:m}={}) {
 positive(width,rise,depth,thickness);count(segments,96);if(segments<3)throw Error('Arch requires at least three segments');if(thickness>=Math.min(width/2,rise))throw Error('Arch thickness must leave an opening');
 const contour=[];for(let i=0;i<=segments;i++){const a=i*Math.PI/segments;contour.push([Math.cos(a)*width/2,Math.sin(a)*rise]);}
 for(let i=segments;i>=0;i--){const a=i*Math.PI/segments;contour.push([Math.cos(a)*(width/2-thickness),Math.sin(a)*(rise-thickness)]);}
 return mesh(bevelPanel(contour,{depth,bevel:0}),m,'arch');
}
export function facetedGem({radius=0.2,height=0.4,facets=8,material:m}={}) {
 positive(radius,height);count(facets,32);if(facets<3)throw Error('Gem requires at least three facets');
 const n=loftBody({rings:[[0,radius*.02,radius*.02],[height*.55,radius,radius],[height*.7,radius,radius],[height,radius*.45,radius*.45]],segments:facets,material:m});
 const indexed=n.geometry;n.geometry=indexed.toNonIndexed();indexed.dispose();n.geometry.computeVertexNormals();n.name='gem';return n;
}
export const constructionHelpers={hollowTube,openVessel,pipeRun,wallOpening,fittedWindow,hingedPanel,stairFlight,ramp,railing,supportFrame,shelfUnit,wheel,wheelAxle,gear,pulley,boltCircle,truss,taperedBranch,terrainPatch,seatedProp,lightSource,openBox,loftBody,clothPanel,spring,beamGrid,archedSpan,facetedGem};
