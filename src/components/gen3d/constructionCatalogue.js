// Routing metadata is shared by prompting and the example coverage audit.
// Helper availability is NOT evidence that an entire generated asset is correct.
export const CONSTRUCTION_CATALOGUE = [
 ['hollowTube','{radius,height,wall,material,segments=48}','Open-ended tube, real wall thickness; Y axis, base y=0.',/pipe|tube|barrel|cannon|conduit|chimney|tunnel|tuyau/i],
 ['openVessel','{radius,height,wall,base,material}','Hollow vessel with a closed floor and open top; base y=0.',/bowl|vessel|cup|pot|bottle|flask|fountain|basin|tank|goblet|urn|pan\b|fontaine/i],
 ['pipeRun','{points:[[x,y,z],...],radius,material,segments=48}','Continuous curved cable/pipe surface along control points; distinct points.',/pipe|cable|rope|hose|tube|curv|arter|wire|pendulum|chain|tentacle|root|vines/i],
 ['wallOpening','{width,height,depth,openingWidth,openingHeight,sill=0,material}','Open wall made of jambs/lintel, optional sill; opening centred X, wall base y=0, thickness centred Z.',/wall|door|window|arch|building|house|castle|room|inn\b|gate|temple|facade|corridor|station|village|clinic|fort|shelter|hangar/i],
 ['fittedWindow','{width,height,depth,rail,clearance,glassThickness,frameMaterial,glassMaterial}','Frame and glass derived from one aperture; base y=0; pane does not cast opaque shadows.',/glass|window|lantern|panel|display|camera|lens|screen|windshield|frame|shield/i],
 ['hingedPanel','{width,height,depth,clearance,angle=0,material}','Door/panel with left-edge Y hinge at origin; rotate returned Group, not its mesh.',/door|gate|cabinet|chest|lid\b|fold|hatch|locker|hinge|counter/i],
 ['stairFlight','{width,rise,run,steps,material}','Contiguous stairs from [0,0,0] to [0,rise,run]; derives identical risers/treads.',/stair|step|terrace|tower|tier|elevation|ascending|multi.level/i],
 ['ramp','{width,rise,run,material}','Solid wedge ascending along +Z, centred X, foot at origin.',/ramp|slope|track|race|racing|incline|banked/i],
 ['railing','{length,height,postRadius,spacing,material}','Posts and top rail from x=0 to length; post spacing derived to reach both ends.',/rail|fence|balcon|bridge|walkway|platform|lift|pier|deck|gantry/i],
 ['supportFrame','{width,depth,height,beam,material}','Four posts with fitted top rails; base y=0, centred X/Z; no top surface.',/bench|table|desk|cart|machine|bed\b|chair|seat|support|stand|altar|anvil|rack|workshop|furniture|counter|crane|lift/i],
 ['shelfUnit','{width,depth,height,thickness,shelves,material}','Side panels and shelves with positive interior spaces; base y=0.',/shelf|shelves|book|archive|cabinet|locker|storage|rack|shop|market/i],
 ['wheel','{radius,width,hubRadius,spokes,rim,material}','Wheel with open spoke spaces and real rim; axle along X, centre at origin.',/wheel|cart|wagon|vehicle|buggy|truck|rover|car\b|bike|tractor|train|engine|landing gear/i],
 ['wheelAxle','{track,radius,width,material}','Two matching wheels joined by an axle; centres at ±track/2 on X, both touch y=0.',/cart|wagon|vehicle|buggy|truck|rover|car\b|bike|tractor|train|landing gear/i],
 ['gear','{radius,depth,teeth,bore,toothDepth,material}','Decorative toothed wheel in XY with open central bore; not an involute/contact physics solver.',/gear|clock|mechanis|winch|crank|drum|robot|turret|machine|engine/i],
 ['pulley','{radius,width,groove,material}','Turned pulley with recessed centre groove, Y axis from y=0 to width.',/pulley|winch|lift|crane|rope|counterweight|belt|hoist/i],
 ['boltCircle','{radius,count,boltRadius,height,material}','Instanced hex fasteners, radial XZ circle, base y=0; rejects overlapping bolts.',/bolt|rivet|metal|steel|brass|armor|armour|machine|engine|robot|turret|weapon|tool|mechanic/i],
 ['truss','{length,height,bays,radius,material}','Connected planar triangular truss in XY, lower chord y=0; bounded bays.',/truss|bridge|crane|gantry|tower|pylon|frame|scaffold|hangar/i],
 ['taperedBranch','{points:[[x,y,z],...],radii:[...],material,sides=12}','Connected tapered segments for branches, horns or limb scaffolds; add subject-specific surface anatomy.',/tree|plant|branch|root|wood|palm|nest|antler|horn|dragon|creature|animal|character|limb|organic|coral|foliage|forest/i],
 ['terrainPatch','{width,depth,segments,heightAt:(x,z)=>number,material}','Terrain mesh uses the supplied finite height function; recomputes normals. XZ centred.',/terrain|landscape|island|mountain|hill|ground|forest|quarry|beach|valley|garden|orchard|courtyard|field|farm|level/i],
 ['seatedProp','{object,x,z,heightAt,offset=0}','Moves a standalone prop bottom to the SAME terrain height function; no floating/scattered guesses. Apply before parenting/transforms.',/terrain|landscape|island|ground|ice|forest|quarry|beach|garden|orchard|field|farm|level|rock|stone|tree/i],
 ['lightSource','{radius,color,intensity,range,emission}','Visible bulb plus colocated point light with inverse-square falloff; put inside an OPEN chamber.',/light|lamp|lantern|torch|beacon|emitter|led\b|luminous|streetlight/i],
 ['openBox','{width,depth,height,wall,material}','Open rectangular shell with derived interior dimensions; base y=0.',/box|crate|basket|drawer|chest|socket|duct/i],
 ['loftBody','{rings:[[y,radiusX,radiusZ],...],segments=24,material,caps=true}','Continuous elliptical cross sections, increasing heights; useful hull/body scaffolding, not automatic anatomy.',/hull|ship|boat|dinghy|helicopter|glider|aircraft|creature|animal|character|guard|mule|wolf|beetle|mushroom|stalactite|pawn|chess|blade|sword|key|bale|backpack/i],
 ['clothPanel','{width,height,segments,drape:(x,y)=>z,material}','XY surface with finite drape displacement along Z; share edge coordinates for attachments.',/cloth|fabric|canvas|sail|flag|strap|flap|pouch|backpack|card|net|bale/i],
 ['spring','{radius,height,wire,turns,material}','Helical coil along Y with validated wire/pitch clearance.',/spring|suspension|coil/i],
 ['beamGrid','{width,height,columns,rows,radius,material}','Connected beam grid in XY, bottom y=0, centred X; useful grates and nets.',/net|grate|grid|tile|floor|junction|lane|deck|dice/i],
 ['archedSpan','{width,rise,depth,thickness,segments,material}','Solid elliptical arch with a real open underside, feet y=0.',/arch|bridge|tunnel|gate/i],
 ['facetedGem','{radius,height,facets,material}','Faceted pavilion, girdle and crown from one section; lowest point y=0.',/gem|jewel|crystal|diamond|amethyst|ruby|emerald/i],
].map(([id,signature,description,pattern])=>({id,signature,description,pattern}));

export function selectConstructionHelpers(brief,mode='object',limit=8) {
 const raw=String(brief||'');
 const text=raw.match(/(?:^|\n)(?:ASSET|LEVEL|GAME):[^\n]+/)?.[0] || (raw.startsWith('Create one original game asset:')?raw.split('\n')[0]:raw);
 const matches=CONSTRUCTION_CATALOGUE.filter(entry=>entry.pattern.test(text));
 if(mode==='level'||mode==='game')for(const id of ['terrainPatch','seatedProp','wallOpening','stairFlight']) {
  const entry=CONSTRUCTION_CATALOGUE.find(e=>e.id===id);const index=matches.indexOf(entry);if(index>=0)matches.splice(index,1);matches.unshift(entry);
 }
 return matches.slice(0,limit);
}
export function constructionHelperContext(brief,mode='object') {
 const helpers=selectConstructionHelpers(brief,mode);
 if(!helpers.length)return '';
 return `TESTED PARAMETRIC CONSTRUCTION HELPERS (compose only relevant parts; do not substitute a generic asset):
Prefer H.assemble({materials:{metal:metalMaterial},parts:[{id:'frame',helper:'supportFrame',options:{width:1,depth:0.6,height:0.8,beam:0.06,material:'metal'},position:[0,0,0]}]}) for these supported parts. It validates helper names, option keys, materials and parent IDs before attaching a named hierarchy. Each part can specify parent, position and rotation (radians). Options are JSON; functions and arbitrary code are rejected. For heightAt/drape callbacks or seatedProp use direct helper calls. Compose custom subject geometry separately where needed; never force an unrelated template to match the prompt.
All return Object3D/Group except where noted. Pass real THREE materials (e.g. await MAT.scanned). Dimensions must be finite and positive; keep counts within 64 unless documented. Work in one coherent coordinate system; named returned groups can serve as assembly parts. Defaults demonstrate scale, not the requested design. Helpers provide geometric invariants; they do not validate anatomy, level reachability or gameplay.
${helpers.map(e=>`H.${e.id}(${e.signature}) — ${e.description}`).join('\n')}`;
}
export function auditExampleConstruction(examples) {
 return examples.map(example=>({id:example.id,kind:example.kind,title:example.title,
  helpers:selectConstructionHelpers(example.title+' '+(example.description||example.prompt),example.kind,CONSTRUCTION_CATALOGUE.length).map(e=>e.id),
  validation:'requires-generated-output-review'}));
}
