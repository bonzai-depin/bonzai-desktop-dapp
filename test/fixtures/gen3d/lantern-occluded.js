
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

    // Body - main housing (tapered)
    const bodyGeo = new THREE.CylinderGeometry(0.14, 0.15, 0.48, 32);
    const body = new THREE.Mesh(bodyGeo, metalMat);
    body.name = "body";
    body.position.y = 0.36;
    lantern.add(body);

    // Top cap
    const capGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.04, 32);
    const cap = new THREE.Mesh(capGeo, metalMat);
    cap.name = "cap";
    cap.position.y = 0.62;
    lantern.add(cap);

    // Reflector - concave dish inside body
    const reflProfile = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const r = 0.13 * (1 - t * 0.3);
      const y = 0.25 + t * 0.2;
      reflProfile.push(new THREE.Vector2(r, y));
    }
    const reflGeo = new THREE.LatheGeometry(reflProfile, 32);
    const reflector = new THREE.Mesh(reflGeo, reflectorMat);
    reflector.name = "reflector";
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

    // Glass panes - 6 hexagonal panels
    const glassAssembly = H.radialPanels({
      radius: 0.14,
      height: 0.4,
      sides: 6,
      thickness: 0.005,
      y: 0.32,
      material: glassMat,
      gap: 0.002
    });
    glassAssembly.name = "glass_panels";
    lantern.add(glassAssembly);

    // Hexagonal cage
    const cageBarGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 8);

    // Bottom cage ring
    const cageBottomGeo = new THREE.CylinderGeometry(0.155, 0.155, 0.03, 6, 1, true);
    const cageBottom = new THREE.Mesh(cageBottomGeo, metalMat);
    cageBottom.name = "cage_bottom";
    cageBottom.position.y = 0.135;
    lantern.add(cageBottom);

    // Top cage ring
    const cageTopGeo = new THREE.CylinderGeometry(0.155, 0.155, 0.03, 6, 1, true);
    const cageTop = new THREE.Mesh(cageTopGeo, metalMat);
    cageTop.name = "cage_top";
    cageTop.position.y = 0.585;
    lantern.add(cageTop);

    // Vertical cage bars (6 for hexagon)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const x = Math.cos(angle) * 0.155;
      const z = Math.sin(angle) * 0.155;

      const bar = new THREE.Mesh(cageBarGeo, metalMat);
      bar.name = `cage_bar_${i}`;
      bar.position.set(x, 0.36, z);
      bar.scale.y = 0.45;
      lantern.add(bar);
    }

    // Weld beads at bar attachments (top and bottom)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const x = Math.cos(angle) * 0.155;
      const z = Math.sin(angle) * 0.155;

      // Top weld
      const weldTopGeo = new THREE.SphereGeometry(0.012, 8, 8);
      const weldTop = new THREE.Mesh(weldTopGeo, rustMat);
      weldTop.position.set(x, 0.585, z);
      weldTop.scale.set(1, 0.5, 1);
      lantern.add(weldTop);

      // Bottom weld
      const weldBotGeo = new THREE.SphereGeometry(0.012, 8, 8);
      const weldBot = new THREE.Mesh(weldBotGeo, rustMat);
      weldBot.position.set(x, 0.135, z);
      weldBot.scale.set(1, 0.5, 1);
      lantern.add(weldBot);
    }

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

    // Scratches and wear - rust patches
    const rustPatchGeo = new THREE.PlaneGeometry(0.02, 0.03);
    const patch1 = new THREE.Mesh(rustPatchGeo, rustMat);
    patch1.position.set(0.145, 0.3, 0.05);
    patch1.rotation.y = -0.3;
    lantern.add(patch1);

    const patch2 = new THREE.Mesh(rustPatchGeo, rustMat);
    patch2.position.set(-0.145, 0.4, -0.03);
    patch2.rotation.y = Math.PI + 0.2;
    lantern.add(patch2);

    // Dents on cage bars
    for (let i = 0; i < 3; i++) {
      const dentGeo = new THREE.SphereGeometry(0.015, 8, 8);
      const dent = new THREE.Mesh(dentGeo, metalMat);
      const angle = (i * 2.1) * Math.PI * 2;
      dent.position.set(Math.cos(angle) * 0.155, 0.3 + i * 0.08, Math.sin(angle) * 0.155);
      dent.scale.set(0.8, 0.8, 0.8);
      lantern.add(dent);
    }

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
