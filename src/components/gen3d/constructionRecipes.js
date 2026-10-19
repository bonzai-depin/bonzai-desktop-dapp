// Small executable patterns, not prebuilt replacement scenes. The model adapts
// dimensions and profiles to its blueprint. Keep context for the actual asset.
const glazedChamber = `FITTED POLYGONAL GLAZING (adapt dimensions and names to the plan):
const chamber=H.framedPanels({radius:.3,height:.7,sides:6,rail:.018,clearance:.003,thickness:.004,y:.6,glassMaterial,frameMaterial});
chamber.getObjectByName('frame').name='frame_part_id';
chamber.getObjectByName('glazing').name='glass_part_id';
root.add(chamber);
// Replace both placeholder names with actual plan IDs. The helper derives pane widths, normals and rail openings together; do not rebuild those panes in a separate trigonometry loop.
// Radius is the polygon APOTHEM (centre to face), not the corner radius. y is its CENTRE, so bottom=y-height/2 and top=y+height/2. Add custom base/cap/handle separately, anchored to these shared dimensions. Keep its interior open for the emitter.`;
const opening = `REAL OPENING / ARCH PATTERN (adapt measurements):
const aperture=[[-1,0],[-1,2]];
for(let i=0;i<=24;i++){const a=Math.PI-i*Math.PI/24;aperture.push([Math.cos(a),2+Math.sin(a)]);}
aperture.push([1,0]);
const contour=[[-1.6,-.2],[1.6,-.2],[1.6,3.6],[-1.6,3.6]];
const wallGeometry=H.worldUV(H.bevelPanel(contour,{depth:.4,bevel:.025,holes:[aperture]}),1);
const wallMaterial=MAT.surface('stone',{color:0xa89c83,tileSize:1,relief:.012,seed:7});
const wall=new THREE.Mesh(wallGeometry,wallMaterial);
// Bottom of aperture is open to y=0 ground; surround with a physically sized frame, not an opaque door-shaped plane.
root.add(wall);`;
const vessel = `HOLLOW PROFILE PATTERN (adapt section to the subject):
const shell=H.latheProfile([[.12,0],[.28,.03],[.43,.18],[.5,.32],[.49,.35],[.46,.35],[.45,.31],[.39,.19],[.24,.07],[0,.07]],80);
// This section includes foot, curved exterior, thick rim and interior floor.
const bowl=new THREE.Mesh(shell,MAT.surface('stone',{relief:.002,seed:9}));root.add(bowl);
// Liquids must end below the rim and inside the interior wall. Add support/joinery only when specified by the blueprint.`;
const manufactured = `MANUFACTURED PANEL / REPEATED DETAIL PATTERN (adapt outline):
const shell=H.bevelPanel([[-.5,-.25],[.5,-.25],[.5,.25],[-.5,.25]],{depth:.12,bevel:.012,holes:[[[-.32,-.12],[-.32,.12],[.32,.12],[.32,-.12]]]});
const metal=MAT.surface('metal',{color:0x727d87,roughness:.38,relief:.00015});
const panel=new THREE.Mesh(shell,metal);root.add(panel);
const bolts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.018,.018,.014,6),metal,4);
const pose=new THREE.Object3D();let i=0;
for(const x of [-.43,.43])for(const y of [-.18,.18]){pose.position.set(x,y,.134);pose.rotation.x=Math.PI/2;pose.updateMatrix();bolts.setMatrixAt(i++,pose.matrix);}root.add(bolts);
// Match other components to the opening dimensions. Never fill intentional negative space with a solid primitive.`;

export function constructionRecipes(brief, mode='object') {
  const text=String(brief).toLowerCase(), recipes=[];
  if(/lantern|lanterne|polygonal.*glass|glass.*cage/.test(text))recipes.push(glazedChamber);
  if(/arch|building|station|castle|temple|room|corridor|courtyard|facade|window|door|city|village|bâtiment|château|gare|porte|fenêtre/.test(text))recipes.push(opening);
  if(/vase|bowl|fountain|vessel|chalice|bottle|urn|cup|fontaine|vasque|coupe/.test(text))recipes.push(vessel);
  if(/robot|industrial|machine|sci.fi|vehicle|weapon|engine|radio|instrument|spaceship|mécanique|vaisseau/.test(text))recipes.push(manufactured);
  if(mode==='level' && !recipes.length)return 'For organic terrain, build actual elevations and recompute normals after deformation; use the same height function to seat rocks, trees and paths. Give rocks/trees distinct silhouette modules, not spheres on sticks. Instance foliage; reserve unique geometry for landmarks. Respect the requested style.';
  return recipes.slice(0,2).join('\n\n');
}
