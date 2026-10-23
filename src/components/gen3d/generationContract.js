import { constructionHelperContext } from './constructionCatalogue.js';
import { materialContext, materialFamilies } from './materialCatalogue.js';
import { constructionRecipes } from './constructionRecipes.js';
import { parse } from "acorn";

/** Bounded subject-specific API references, shared by generation and repair. */
export { focusedThreeReferences as selectThreeReferences } from './threeReferences.js';

export const SCENE_CONTRACT = `
RUNTIME: THREE, root (Group), H, MAT, TEX, SHADER, FLUID, FX, CELESTIAL, P, GAME,
addUpdateCallback(({time, deltaTime}) => {}), setObjectInfo({title,description}),
setAO, setBloom, setColorGrade, setDoF, setFilmGrain, setChromatic, setLensFlare.
These names are already declared. Output only the JavaScript body, starting with setObjectInfo().
Do not import, export, create a scene/renderer/camera/composer, fetch assets, access DOM, or start timers/render loops.
Add everything to root. The host attaches and returns root. Await all construction and material loads before finishing. Do not launch unawaited async IIFEs, async forEach callbacks or detached Promise chains; use top-level await and for...of loops. Use addUpdateCallback for animation; reuse vectors and buffers inside it.

BUILD QUALITY:
- Preserve the original brief over any inferred plan. Distinctive silhouette and physical construction come first.
- Choose a coherent visual language appropriate to the request, whether photorealistic, stylized, organic, manufactured, architectural or abstract. Do not default unrelated subjects to a shared composition or material palette.
- Named component hierarchy, coherent dimensions, visible thickness, contact at joints and no floating parts.
- Ground at y=0; object longest dimension about 1.5 units. Levels and games use world-scale dimensions.
- Author shaped profiles with LatheGeometry, bevelled ExtrudeGeometry and Shape holes. Use TubeGeometry with a Curve3 for pipes/cables; custom indexed BufferGeometry for bespoke surfaces.
- Use InstancedMesh for repetition (fasteners, foliage, ornaments). Share geometry/materials; compute bounds after transforms. Build instance transforms with Object3D position/rotation/scale, call updateMatrix(), then setMatrixAt(i,dummy.matrix); Matrix4.makeRotationY resets a transform, so do not use it after setting translation.
- Distinguish stone, metal, glass, wood and liquid through roughness, normal/bump detail and measured physical properties, not just colors. Roughness is not a quality score: stone stays rough, metal has metalness=1, water has metalness=0 and ior=1.333.
- Clone MAT presets before altering them. Custom MeshStandardMaterial / MeshPhysicalMaterial are encouraged when a preset does not match the brief.
- Transparent objects need real wall thickness and a visible interior. Do not replace transmission with emission. Non-luminous surfaces have zero emission.
- Detail must support the subject: bevels, seams, radial mouldings, supports, joints and wear at plausible scale. Do not add arbitrary gold rings or gems.
- Finish three scales of construction: primary silhouette, secondary assemblies/edge profiles, and selective tertiary surface detail. A blockout of flat-coloured primitives is not a finished asset. Use primitives as scaffolding and implement the defining shape, joinery and material response. Respect an explicitly requested low-poly or minimal style.
- Non-metal albedo should leave lighting headroom (avoid pure white). Use matched color + bump/normal + roughness maps where surface relief is relevant. Scale texels to the physical part, not one stretched texture across an entire level. Do not use random noise as a substitute for construction or flood every surface with wear.
- The viewer provides lighting, environment, shadows and neutral postprocessing. Add local lights only for actual sources. Bloom, particles, stars, lens flare, grain, chromatic aberration and fog are OPTIONAL artistic choices, never a quality checklist.
- Target a responsive laptop viewport: roughly <120 draw calls, <200k triangles, <=2 extra lights; instance repeated details. No new geometry/material/texture allocation every frame.
- Use THREE.Shape for filled ShapeGeometry/ExtrudeGeometry contours; THREE.Path is for holes or curves. Declare every variable (const/let); never assign undeclared aliases.\n- Self-check all API names, finite coordinates, material properties, attachment positions and animation lifetime before completing code. Never truncate a function.

EXISTING ENGINE TECHNIQUES (use only when relevant):
MAT: gold, silver, bronze, copper, iron, steel, brass, obsidian, marble, clay, glass, ruby, emerald, sapphire, diamond, wood-like textures via TEX.
await MAT.scanned(kind,{repeat:[u,v],normalStrength:.5,aoIntensity:.65}) loads bundled 2K photographic PBR (color, OpenGL normal, roughness, AO). Use exact IDs from the local shortlist, or family aliases: ${materialFamilies.join(", ")}. Family aliases accept variant:0,1,2... for distinct scans. MAT.catalogue(query) returns matching IDs. Prefer scans for realistic surfaces; keep MAT.surface for custom/stylized surfaces. Metalness maps are applied when supplied by the source; AO is optional. Always await, share the result. No fetch/URL required. Use H.worldUV(geometry,2) for a 2-metre texture tile and repeat:[1,1]; do not stretch a single tile over an entire building. Default albedo is untinted; use color only for a deliberate tint. Do not use grass on stone or concrete on polished metal.
MAT.surface(kind,{color,roughness,metalness,repeat:[u,v],relief,seed}) returns a new MeshStandardMaterial with tileable, matched color/bump/roughness textures. Kinds: stone, concrete, wood, metal, fabric, ground, sand. relief is bump height in scene units (object examples .001-.006; architecture .01-.04). Reuse each material across modules; clone before changes. Color maps are sRGB, data maps linear. This is optional for polished/untextured surfaces, glass and deliberate stylization.
- H.framedPanels({radius,height,sides=6,rail=.02,clearance=.002,thickness=.004,y=height/2,glassMaterial,frameMaterial}) returns an OPEN polygonal chamber with frame and glazing groups. Glass dimensions derive from clear rail openings. No solid housing inside. Rename returned groups/panels to planned IDs. Glass does not cast an opaque shadow.
- H.radialPanels({radius,height,sides=6,thickness=.004,y=height/2,material,gap=0}) returns a Group of outward-facing glass panels; radius is the polygon apothem. Assign the assembly ID to the returned Group.
- H.strutBetween([x,y,z],[x,y,z],radius,material,segments=16) returns a cylinder aligned between exact endpoints.
- H.latheProfile([[radius,height],...],segments=64) returns LatheGeometry; radius must be non-negative, height is vertical. This is a radial cross-section, NOT points around an XY polygon. Trace outside AND inside profiles for hollow vessels, with an explicit rim and bottom thickness. THREE.Vector2(radius,height) points are also accepted.
- H.bevelPanel([[x,y],...],{depth:.1,bevel:.01,holes:[[[x,y],...]],segments:3}) returns an XY panel extruded along +Z, with real cutouts. Use openings for doors, windows and frames, not dark rectangles pasted onto solid walls.
- H.worldUV(geometry,tileSize=1) returns a new geometry with baked metre-based UVs. Use for architectural modules of different sizes; use MAT.surface repeat:[1,1], tileSize matching this value. Texture coordinates survive GLB export. Reuse returned geometry for instances.
- MAT.surface also accepts tileSize (physical metres per tile) and resolution (128/256/512/1024, default512). Matched normal/color/roughness maps reveal material at close range. Relief is physical, not a substitute for silhouette geometry.
H.bevelBox(width,height,depth,radius,segments=3) returns centred rounded-box geometry; use it for manufactured edges and architectural blocks that catch light. Reuse this geometry for repeated modules. ExtrudeGeometry/LatheGeometry/TubeGeometry remain the tools for distinctive profiles, ornaments, curved shells and negative spaces.
Example of reusable architectural parts: const stone = MAT.surface('stone',{color:0xa69d8c,repeat:[2,2],relief:.02,seed:17}); const block = H.bevelBox(2,1,.8,.04,2); create repeated meshes/instances from this shared geometry and material. Scale dimensions, relief and palette to the actual brief.
Postprocessing signatures: setAO({radius,intensity,falloff}), setBloom({intensity,threshold}), setColorGrade({contrast,saturation}), setDoF({aperture,maxblur,focus}). The defaults already supply contact shading and HDR tone mapping. Leave depth of field disabled for a level overview; only use it for an explicitly requested photographic focus effect.
TEX: wood(base,grain), stone(base), marble(base,vein), metal(base), concrete(base), rust(base), fabric(base), leather(base), brick(base,mortar), waterNormal(size). Returns textures; set repeat/wrapping for physical scale.
SHADER: csm({base:THREE.MeshPhysicalMaterial,baseOpts:{color,roughness},vert,frag,uniforms,patchMap}) patches built-in PBR; wetSurface(opts), hologram(color,lineFreq,opts), lava(hot,cold,speed), iridescence(base), dissolve(base,edge,progress). Custom GLSL is possible but must compile on WebGL2 and preserve color management.

FX.batch(meshes,{material}) batches static geometry sharing one material. await FX.scatter(targetMesh,protoMesh,count,{scaleRange,alignToNormal,rotateY}) returns instanced surface scatter. FX.withGlow(mesh,color,{scale,intensity}) and FX.godRayCone({from,to,color,spread,intensity}) are optional emissive effects. CELESTIAL.starfield(opts), galaxy(opts), nebulaCloud(opts) are available for explicitly requested space scenes. Physics: await P.init() before P.body(mesh,opts); P.impulse/P.setLinvel operate on returned bodies. GAME is available for playable interactions.
`;

// Subject guidance selects techniques, not fixed meshes or canned compositions.
export function subjectTechniqueGuide(brief) {
  const guides = [];
  if (/water|fountain|liquid|pool|ocean|river|lake|waterfall|basin|fontaine|liquide|piscine|rivière|cascade|bassin/i.test(brief)) guides.push(WATER_TECHNIQUES);
  if (/creature|animal|character|human|dragon|tree|plant|flower|organic|foliage|personnage|arbre|fleur|végétal|feuillage/i.test(brief)) guides.push('ORGANIC FORMS: Use coherent anatomy or branching hierarchy, tapered custom surfaces, curved forms and smooth normals. Instance foliage/scales where suitable. Preserve pose, joint connections and recognizable silhouette; avoid assemblies of unrelated spheres. Animate hierarchically when requested.');
  if (/vehicle|robot|machine|engine|mechanic|clock|tool|device|spaceship|véhicule|moteur|mécanique|horloge|outil|appareil|vaisseau/i.test(brief)) guides.push('MECHANICAL FORMS: Use nested assemblies, shaped housings, bevelled panels, fasteners, aligned axles and plausible articulation. Make each moving part follow its physical pivot. Instance repetition and distinguish functional materials.');
  if (/building|house|castle|temple|architecture|room|interior|city|level|landscape|terrain|bâtiment|maison|château|pièce|intérieur|ville|niveau|paysage|atelier|cour/i.test(brief)) guides.push('ENVIRONMENTS: Establish overall massing, navigable space, landmarks and scale before detail. Use modular construction, openings with real thickness, instancing, coherent terrain topology and layered sightlines. Keep architectural styles and environmental choices faithful to the brief.');
  if (/cloth|fabric|dress|garment|cushion|sofa|chair|furniture|tissu|robe|vêtement|coussin|canapé|chaise|fauteuil|meuble/i.test(brief)) guides.push('FURNITURE / SOFT SURFACES: Model support structure, upholstery volume, seams, folds and joinery at appropriate scales. Use surface curvature and roughness variation; a patterned primitive alone is not a finished asset.');
  if (/abstract|sculpture|portal|magic|fantasy|cosmic|hologra|abstrait|portail|magie|fantastique|cosmique/i.test(brief)) guides.push('EXPRESSIVE FORMS: Develop an intentional composition and distinct spatial hierarchy. Custom shaders, emissive materials, particles and motion should reinforce the requested concept without obscuring the geometry.');
  if (/lantern|lamp|light fixture|luminaire|flashlight|torch|lanterne|torche/i.test(brief)) guides.push('LIGHT FIXTURES: The emitting chamber must be EMPTY around the light source, not a solid opaque CylinderGeometry with glass pasted over it. Build separate base, cap and open rails; H.framedPanels derives inset glazing and frames together. Keep reflectors behind/below the emitter, not as an opaque tube enclosing it. Pair a visible emissive surface with a nearby PointLight/SpotLight, inverse-square falloff and restrained intensity. The emitter must be visible through at least one real opening. Glass should not cast an opaque shadow in the shadow-map renderer; opaque rails can. No flare or bloom can replace unobstructed construction.');
  return guides.join('\n\n');
}

const WATER_TECHNIQUES = `FLUID: basinWater({radius,y,depth,color}) returns a clear animated water surface for a custom basin (position below the rim, radius inside its walls). fountainBasin({radius,y,depth,stoneColor,waterColor,rim}), tieredFountain({tiers,baseRadius,spacing,taper,stoneColor,waterColor,rim,pillarMat}), jet({from:Vector3,to:Vector3,radius,color}), oceanWater(geometry,opts) for large open water only.
Fountain helpers are optional construction blocks, not substitutes for the requested architectural detail. Basin surfaces already contain water; never overlay caustics planes or a second water disc. Small cascades must use FLUID.jet with explicit start and landing Vector3 positions, not unscaled CylinderGeometry columns or particle walls. For custom fountain bowls use FLUID.basinWater at the planned fill elevation. stream is a stylized waterfall sheet. Narrow contained liquids: H.fillLiquid(containerMesh,color,{fillLevel}) then FLUID.upgradeFill(fill). Do not use H.fillLiquid for wide fountain basins.`;

export function buildScenePrompt({ brief, plan = '', references = '', gameContract = '', variation = '', mode = 'object' }) {
  return `You are a precise procedural 3D artist and Three.js engineer. Build the requested asset, not a generic demo.\n\nORIGINAL BRIEF:\n${brief}\n\nASSEMBLY PLAN (advisory):\n${plan}\n${variation}\n${sceneContract(mode)}\n${CONSTRUCTION_CHECKLIST}\n${constructionHelperContext(brief,mode)}\n${constructionRecipes(brief,mode)}\n${materialContext(brief)}\n${subjectTechniqueGuide(brief)}\n${gameContract}\n\nRELEVANT THREE.JS REFERENCES:\n${references}\n\nOutput complete raw JavaScript now.`;
}

export function buildSceneRevision({ code, instruction, references = '', mode = 'object' }) {
  return `Revise the complete scene to address the requested change. Preserve unaffected geometry, materials, animation and gameplay. Do not exaggerate requested changes or remove animation. Return only complete raw JavaScript.\n\nCHANGE:\n${instruction}\n${sceneContract(mode)}\n${constructionHelperContext(instruction + " " + code,mode)}\n${subjectTechniqueGuide(instruction + " " + code)}\n${materialContext(instruction)}\n${references}\n\nCURRENT CODE:\n${code}`;
}

export function buildSceneRepair({ code, error, brief = '', mode = 'object' }) {
  return `Repair this failed Three.js asset with minimal exact text edits. Return ONLY JSON of the form {"edits":[{"old":"exact unique existing code","new":"replacement code"}]}. At most 8 edits. Do not return a rewritten scene. Preserve geometry and intent. Match whitespace in old exactly.\nBRIEF: ${brief}\nFAILURE: ${error}\n${repairContract(mode)}\n${constructionHelperContext(brief + ' ' + error,mode)}\nCODE:\n${code}\nReturn JSON edits only.`;
}

// Repairs already contain the complete scene. Repeating the entire generation
// guide adds costly prefill without helping a local API/construction correction.
function repairContract(mode) {
  return `RUNTIME: THREE, root, H, MAT, TEX, SHADER, FLUID, FX, CELESTIAL, P, GAME and addUpdateCallback are injected. Do not redeclare them, import, access DOM, fetch assets, create a renderer/camera/scene or start another render loop. Add geometry to root. Await material/construction loads; no detached async work.
Preserve the original brief, named assemblies, unaffected geometry, materials, animation and gameplay. Keep coordinates finite, joints in contact, real openings, hollow interiors and physical material scale. Do not replace a failed detailed part with a primitive or remove it to bypass validation.
GEOMETRY: H.wheel, H.wheelAxle and H.spring return complete Object3D assemblies, not BufferGeometry. Clone them for repeated parts and add them directly; never wrap them in new THREE.Mesh. H.latheProfile([[radius,height],...],segments=64) returns geometry; THREE.Vector2(radius,height) points are accepted. Radius must be non-negative; these are radial cross-sections, NOT XY polygon outlines. A vessel profile traces the outside, rim and inside wall. H.bevelPanel([[x,y],...],{depth,bevel,holes:[[[x,y],...]]}) returns geometry extruded along +Z. H.bevelBox(width,height,depth,radius,segments=3) returns centred rounded-box geometry. H.strutBetween([x,y,z],[x,y,z],radius,material) returns an aligned mesh. THREE.Shape.absellipse(cx,cy,rx,ry,startAngle,endAngle,clockwise,rotation=0) draws an ellipse; Shape.ellipseCurve does not exist. Preserve both radii when repairing an ellipse.
H.framedPanels({radius,height,sides,rail,clearance,thickness,y,glassMaterial,frameMaterial}) returns an OPEN chamber with frame/glazing groups. Radius is the apothem; panes fit inside rail openings. y is the vertical CENTRE: bottom=y-height/2, top=y+height/2, not a bottom offset. To close a measured gap, adjust only that distance and preserve other joints; never move an entire chamber to the base's top coordinate. Share dimensions rather than independently sizing glass and frames. Transparent glass must not cast an opaque shadow. Pair visible emitters with a local light; keep the optical path open.
MATERIALS: await MAT.scanned(kind,options) loads bundled PBR. MAT.surface(kind,{color,roughness,metalness,repeat:[u,v],relief,seed}) supplies matched color, bump/normal and roughness maps. H.worldUV(geometry,tileSize) returns geometry with physical-scale UVs. Share materials and clone presets before changes. Preserve the intended palette; no emission on non-luminous surfaces. Use setAO/setBloom/setColorGrade with option objects only when needed.
${mode === 'level' || mode === 'game' ? 'WORLD: Use metres, preserve planned world dimensions and root.userData.worldScale=true. Maintain supporting ground, routes, connected architecture and foreground, midground and background. Offset/inset overlays to prevent z-fighting. Never normalize to object scale.' : 'OBJECT: Ground at y=0, longest dimension about 1.5 units.'}
${mode === 'level' ? 'The viewer supplies exploration controls. Do not create a GAME session or input handlers.' : mode === 'game' ? 'GAME: Preserve player, solid colliders, controls, required objectives, start, win/defeat and restart. All required objectives must complete. Locked exits need a custom objective and a once:false trigger that emits its completion event only after prerequisites are complete; a reach objective completes on ANY entry. Reach objectives require trigger IDs; custom objectives require event names. Actor/player update callbacks take ({dt,time,state,input,actor,game}), not a numeric dt. Input actions are forward, backward, left, right, sprint and action. Set cameraOffset in game.player; game.camera and a global camera are unavailable. Register pickup triggers calling game.collect(actorId,1,tag). game.damage updates health and emits {actor,amount,source}; never decrement health twice. Keep game.start() after setup.' : ''}`;
}

export function applySceneEdits(code, response) {
  const text = String(response).trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const { edits } = JSON.parse(text);
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > 8) throw new Error('Scene repair must contain 1–8 exact edits.');
  let result = code;
  for (const edit of edits) {
    if (typeof edit?.old !== 'string' || !edit.old.trim() || typeof edit.new !== 'string') throw new Error('Scene repair contains an invalid edit.');
    const index = result.indexOf(edit.old);
    if (index < 0 || result.indexOf(edit.old, index + 1) !== -1) throw new Error('Scene repair target is missing or ambiguous.');
    result = result.slice(0, index) + edit.new + result.slice(index + edit.old.length);
  }
  return result;
}

export function sceneContract(mode = 'object') {
  if(mode !== 'level' && mode !== 'game') return SCENE_CONTRACT;
  return SCENE_CONTRACT.replace('Ground at y=0; object longest dimension about 1.5 units. Levels and games use world-scale dimensions.',
    'Use metres and preserve the planned world dimensions. Ground at y=0. Set root.userData.worldScale = true. Never normalize a level to object scale.')
    .replace('roughly <120 draw calls, <200k triangles', 'roughly <160 draw calls, <600k triangles across visible modules') + (mode === 'level' ? `
LEVEL CONSTRUCTION:
Build the entire environment under root, with terrain, clear routes, openings and named landmarks.
The viewer hides its object display floor for levels. Author the actual ground/floors that connect the playable space; paths and scattered grass patches do not replace terrain. Omit continuous ground only when the brief calls for disconnected platforms, open water or space. Check that a courtyard/room/landscape has a supporting surface before finishing.
Do not create a GAME session, player or input handlers; the viewer provides exploration controls.
Design a finished environment, not a layout diagram: foreground, midground and background with readable traversable routes and intentional sightlines. Match the requested world extent but concentrate detail at playable/visible scale.
Terrain uses shaped elevations, edge treatment, material transitions and grounded vegetation/rocks where appropriate. Architecture has foundations, openings, reveals, ledges, supports, roof/wall thickness and repeated modular detail. A green slab, poles and scattered spheres are only a blockout.
Build repeated structures with loops, shared geometry/materials and InstancedMesh. Finish the secondary architectural or organic forms before decorative effects. No coplanar overlays: inset or offset path, trim and decal surfaces to prevent z-fighting. Never hide weak geometry behind fog, bloom or arbitrary glowing markers.
Use a coherent material palette with visible roughness/relief differences. Repeat procedural textures at metre-scale; choose wall/floor module UVs deliberately. Anchor every prop to the local surface. Keep a single readable composition when viewed in orbit as well as from entry height.
Optional entry: root.userData.entry = {x, y, z} in world metres, positioned in open space at eye height. Never depend on unavailable terrain/navigation libraries.
` : '');
}

export function validateSceneBody(code) {
  if(!String(code || '').trim()) return {ok:false,reason:'No scene code was generated'};
  try { parse(`async function generatedScene(){\n${code}\n}`, {ecmaVersion:'latest',sourceType:'module'});return {ok:true,reason:''}; }
  catch(error) {return {ok:false,reason:`Invalid scene JavaScript: ${error.message}`};}
}


// Compact construction checklist shared with bounded corrections. Geometry is
// inspected from both sides and at close range; an attractive overview is insufficient.
export const CONSTRUCTION_CHECKLIST = `Build in this order: (1) authored cross-sections, negative space and connected structural forms; (2) secondary construction such as thickness, frames, seams, joints and repeated modules; (3) scale-correct PBR surfaces and restrained wear; (4) only requested animation/effects. Name meaningful groups for independent editing. Allocate most implementation to shape and construction, not particles or lighting. Verify exact component contacts with bounds/dimensions. Do not stop at a blockout, and do not add unrelated props to inflate detail. An explicit minimalist/low-poly brief still requires deliberate proportions and finished construction.`;
