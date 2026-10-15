
export default async function generate(params) {
  const THREE = params.THREE;
  const Math = params.sceneMath || globalThis.Math;
  const scene = params.scene;
  const root = new THREE.Group();
  root.name = "GeneratedObject";
  root.userData.generationContract = 2;
  const addUpdateCallback = params.addUpdateCallback;
  const setObjectInfo = params.setObjectInfo;
  // Post-FX toggles — defensive no-ops if the host doesn't provide them
  // so generated code never throws for optional effects.
  const setFilmGrain      = params.setFilmGrain      || (() => {});
  const setScreenDroplets = params.setScreenDroplets || (() => {});
  const setChromatic      = params.setChromatic      || (() => {});
  const setDoF            = params.setDoF            || (() => {});
  const setColorGrade     = params.setColorGrade     || (() => {});
  const setLensFlare      = params.setLensFlare      || (() => {});
  const setUnderwater     = params.setUnderwater     || (() => {});
  const setEnvironment    = params.setEnvironment    || (async () => {});
  const setAO             = params.setAO             || (() => {});
  const setBloom          = params.setBloom          || (() => {});
  // setHeightFog is intentionally NOT exposed here. Weather (fog, rain,
  // lightning, lens droplets) is scene-level state owned by the viewer;
  // generated scenes inherit whatever the user selected in the weather
  // panel rather than forcing their own atmosphere.
  const helpers = params.helpers;
  const H = helpers;

  // Engine libraries (rendering plus GAME runtime) — injected
  // by ThreeViewer via ctx._engine so they share the same update loop the
  // helpers use.
  const { MAT, TEX, SHADER, FLUID, P, CELESTIAL, FX, GAME } = params._engine;
  params.MAT = MAT; params.TEX = TEX; params.SHADER = SHADER;
  params.FLUID = FLUID; params.P = P; params.CELESTIAL = CELESTIAL; params.FX = FX; params.GAME = GAME;
  params.H = H; params.helpers = H;

  // ── USER CODE START ──
  setObjectInfo({title:"Emergency Lantern",description:"Battered handheld LED lantern with metal cage, glass panes, and carrying handle. Survival horror asset."});

    // Design differences from standard interpretations:
    // (1) The body has a slightly tapered profile with a hexagonal cage rather than a straight cylinder with round cage,
    //     giving it a more distinctive, rugged silhouette suited to harsh use.
    // (2) The handle is a forged steel loop welded directly to the top cage ring with visible weld beads,
    //     rather than a separate bracket assembly, creating a more integrated, utilitarian look.

    const lantern = new THREE.Group();
    lantern.name = "lantern";

    // Materials
    const metalMat = MAT.surface('metal', { color: 0x5a5a5a, roughness: 0.7, metalness: 0.9, relief: 0.002, seed: 42 });
    const rustMat = MAT.surface('metal', { color: 0x8b4513, roughness: 0.85, metalness: 0.6, relief: 0.004, seed: 17 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.95,
      thickness: 0.005,
      roughness: 0.05,
      metalness: 0,
      ior: 1.5,
      clearcoat: 0.1
    });
    const emitterMat = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      emissive: 0xffffcc,
      emissiveIntensity: 2.0,
      roughness: 0.3,
      metalness: 0.1
    });
    const reflectorMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.95,
      side: THREE.DoubleSide
    });

    // Base - battery compartment
    const baseGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 32);
    const base = new THREE.Mesh(baseGeo, metalMat);
    base.name = "base";
    base.position.y = 0.06;
    lantern.add(base);

    // Base threads (decorative grooves)
    for (let i = 0; i < 4; i++) {
      const threadGeo = new THREE.TorusGeometry(0.152, 0.003, 8, 32);
      const thread = new THREE.Mesh(threadGeo, rustMat);
      thread.position.y = 0.03 + i * 0.02;
      thread.rotation.x = Math.PI / 2;
      lantern.add(thread);
    }

    // Top cap
    const capGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.04, 32);
    const cap = new THREE.Mesh(capGeo, metalMat);
    cap.name = "cap";
    cap.position.y = 0.62;
    lantern.add(cap);

    // Shallow reflector sits below the source, leaving the chamber open.
    const reflector = new THREE.Mesh(H.latheProfile([[0,0.16],[0.11,0.16],[0.12,0.18],[0.11,0.175],[0,0.17]]),reflectorMat);
    lantern.add(reflector);
    // Emitter - LED bulb
    const emitterGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const emitter = new THREE.Mesh(emitterGeo, emitterMat);
    emitter.name = "emitter";
    emitter.position.y = 0.35;
    lantern.add(emitter);

    // LED bulb base
    const bulbBaseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16);
    const bulbBase = new THREE.Mesh(bulbBaseGeo, metalMat);
    bulbBase.position.y = 0.31;
    lantern.add(bulbBase);

    const chamber=H.framedPanels({radius:0.14,height:0.46,sides:6,rail:0.018,clearance:0.003,thickness:0.004,y:0.36,glassMaterial:glassMat,frameMaterial:metalMat});
    chamber.name='body';lantern.add(chamber);
    // Handle - forged steel loop welded to top
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, 0.6, 0),
      new THREE.Vector3(-0.08, 0.75, 0),
      new THREE.Vector3(0, 0.82, 0),
      new THREE.Vector3(0.08, 0.75, 0),
      new THREE.Vector3(0.08, 0.6, 0)
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 32, 0.012, 8, false);
    const handle = new THREE.Mesh(handleGeo, metalMat);
    handle.name = "handle";
    lantern.add(handle);

    // Handle welds
    const handleWeldGeo = new THREE.SphereGeometry(0.015, 8, 8);
    const weldL = new THREE.Mesh(handleWeldGeo, rustMat);
    weldL.position.set(-0.08, 0.6, 0);
    weldL.scale.set(1, 0.6, 1);
    lantern.add(weldL);

    const weldR = new THREE.Mesh(handleWeldGeo, rustMat);
    weldR.position.set(0.08, 0.6, 0);
    weldR.scale.set(1, 0.6, 1);
    lantern.add(weldR);

    // Battery compartment door
    const doorShape = new THREE.Shape();
    doorShape.moveTo(-0.06, 0);
    doorShape.lineTo(0.06, 0);
    doorShape.lineTo(0.06, 0.08);
    doorShape.lineTo(-0.06, 0.08);
    doorShape.closePath();

    const doorGeo = new THREE.ExtrudeGeometry(doorShape, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
    const door = new THREE.Mesh(doorGeo, metalMat);
    door.name = "battery_door";
    door.position.set(0, 0.05, 0.15);
    lantern.add(door);

    // Door hinge
    const hingeGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.04, 8);
    const hinge = new THREE.Mesh(hingeGeo, rustMat);
    hinge.position.set(0.06, 0.09, 0.155);
    hinge.rotation.z = Math.PI / 2;
    lantern.add(hinge);

    // Light source
    const lanternLight = new THREE.PointLight(0xffeedd, 3, 5, 2);
    lanternLight.name = "lantern_light";
    lanternLight.position.y = 0.35;
    lantern.add(lanternLight);

    // Flicker animation
    const flickerPhase = 0;
    addUpdateCallback(({ time }) => {
      const flicker = Math.sin(time * 8 + flickerPhase) * 0.15 +
                     Math.sin(time * 13 + flickerPhase * 2) * 0.1 +
                     Math.sin(time * 3 + flickerPhase * 3) * 0.05;
      lanternLight.intensity = 3 + flicker;
      emitterMat.emissiveIntensity = 2 + flicker * 0.5;
    });

    lantern.position.y = 0;
    root.add(lantern);
  // ── USER CODE END ──

  scene.add(root);
  return root;
}
