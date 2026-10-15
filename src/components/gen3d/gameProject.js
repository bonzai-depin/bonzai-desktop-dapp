import { sourceForBuilder, compileLevelParts, assetBuilder, validateTransform, sceneSourceSeed } from './levelEditing.js';
export const GAME_PROJECT_VERSION = "1.0.0";
export const ASSET_KINDS = Object.freeze({
  OBJECT: "object",
  LEVEL: "level",
  GAME: "game",
});
export const PLACEMENT_ROLES = Object.freeze([
  "player",
  "enemy",
  "trap",
  "collectible",
  "buff",
  "debuff",
  "checkpoint",
  "platform",
  "goal",
  "prop",
]);
export const CLEAR_CONDITION_TYPES = Object.freeze([
  "collect",
  "defeat",
  "reach",
  "survive",
  "score",
  "custom",
]);

const id = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const vector = (value = {}) => ({
  x: Number(value.x || 0),
  y: Number(value.y || 0),
  z: Number(value.z || 0),
});

export function createGameProject({ title = "Untitled game", description = "" } = {}) {
  return {
    schema: "bonzai.game-project",
    version: GAME_PROJECT_VERSION,
    id: id("game"),
    title,
    description,
    objects: [],
    levels: [],
    levelOrder: [],
    gameplay: {
      premise: "",
      player: { objectId: null, spawn: vector(), controls: "direct" },
      objectives: [],
      interactions: [],
    },
    ownership: { collectible: null, token: null },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function addObjectAsset(project, {
  title,
  code,
  source = "text",
  sourceInferenceId = "",
  thumbnail = "",
  collectible = null,
} = {}) {
  if (!String(code || "").trim()) throw new Error("Object code is required");
  const asset = {
    id: id("object"),
    kind: ASSET_KINDS.OBJECT,
    title: String(title || `Object ${project.objects.length + 1}`),
    code: String(code),
    source,
    sourceInferenceId,
    thumbnail,
    collectible,
  };
  project.objects.push(asset);
  project.updatedAt = Date.now();
  return asset;
}

export function addLevel(project, {
  title,
  code,
  sourceInferenceId = "",
  thumbnail = "",
  collectible = null,
} = {}) {
  if (!String(code || "").trim()) throw new Error("Level code is required");
  const level = {
    id: id("level"),
    kind: ASSET_KINDS.LEVEL,
    title: String(title || `Level ${project.levels.length + 1}`),
    code: String(code),
    sourceInferenceId,
    thumbnail,
    collectible,
    placements: [],
    entry: vector(),
    exits: [],
    clearMode: "all",
    clearConditions: [],
  };
  project.levels.push(level);
  project.levelOrder.push(level.id);
  project.updatedAt = Date.now();
  return level;
}

export function addClearCondition(project, levelId, condition = {}) {
  const level = project.levels.find((candidate) => candidate.id === levelId);
  if (!level) throw new Error("Level not found");
  const type = String(condition.type || "collect");
  if (!CLEAR_CONDITION_TYPES.includes(type)) throw new Error(`Unsupported clear condition ${type}`);
  const clearCondition = {
    id: condition.id || id("condition"),
    type,
    label: String(condition.label || `Complete ${type} objective`),
    target: Math.max(1, Number(condition.target || 1)),
    tag: String(condition.tag || ""),
    targetPlacementId: String(condition.targetPlacementId || ""),
    event: String(condition.event || ""),
  };
  level.clearConditions ||= [];
  level.clearConditions.push(clearCondition);
  project.updatedAt = Date.now();
  return clearCondition;
}

/** Reopen an edited history snapshot with independent IDs and stable procedural seeds. */
export function importLevelSnapshot(project, snapshot, metadata = {}) {
  const source=JSON.parse(JSON.stringify(snapshot));
  if(!source.level?.code || !Array.isArray(source.objects)) throw new Error('Invalid editable level snapshot');
  const available=new Set(source.objects.map(object=>object.id));
  for(const item of source.level.placements || []) {
    if(!available.has(item.objectId)) throw new Error('Saved level has a missing asset');
    validateTransform(item);
  }
  const next=JSON.parse(JSON.stringify(project));
  const objectIds=new Map();
  for(const object of source.objects){
    const asset=addObjectAsset(next,object);
    asset.seed=object.seed || sceneSourceSeed(object.code);
    objectIds.set(object.id,asset.id);
  }
  const level=addLevel(next,{...source.level,...metadata});
  const placementIds=new Map();
  for(const item of source.level.placements || []){
    if(!objectIds.has(item.objectId)) throw new Error('Saved level has a missing asset');
    const placement=placeObject(next,level.id,objectIds.get(item.objectId),item);
    placement.settings={...item.settings};placementIds.set(item.id,placement.id);
  }
  level.seed=source.level.seed || sceneSourceSeed(source.level.code);
  level.partEdits=source.level.partEdits || {};
  level.entry=source.level.entry || vector();level.exits=source.level.exits || [];
  level.clearMode=source.level.clearMode || 'all';
  level.clearConditions=(source.level.clearConditions || []).map(condition=>({...condition,targetPlacementId:placementIds.get(condition.targetPlacementId)||condition.targetPlacementId}));
  for(const interaction of source.interactions || []){
    if(placementIds.has(interaction.sourcePlacementId)&&placementIds.has(interaction.targetPlacementId))addInteraction(next,{...interaction,sourcePlacementId:placementIds.get(interaction.sourcePlacementId),targetPlacementId:placementIds.get(interaction.targetPlacementId)});
  }
  Object.assign(project,next);
  return level;
}

export function removeClearCondition(project, levelId, conditionId) {
  const level = project.levels.find((candidate) => candidate.id === levelId);
  if (!level) throw new Error("Level not found");
  const index = (level.clearConditions || []).findIndex((condition) => condition.id === conditionId);
  if (index < 0) throw new Error("Clear condition not found");
  const [removed] = level.clearConditions.splice(index, 1);
  project.updatedAt = Date.now();
  return removed;
}

export function applyGameplayPatch(project, patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Gameplay update must be an object");
  if (patch.premise != null) project.gameplay.premise = String(patch.premise).slice(0, 500);

  for (const update of patch.levelUpdates || []) {
    const level = project.levels.find((candidate) => candidate.id === update.levelId);
    if (!level) throw new Error(`Unknown level ${update.levelId}`);
    if (update.clearMode != null && !["all", "any"].includes(update.clearMode)) {
      throw new Error(`Unsupported clear mode ${update.clearMode}`);
    }
    if (update.title != null) level.title = String(update.title).slice(0, 80);
    if (update.clearMode != null) level.clearMode = update.clearMode;
    if (update.clearConditions != null) {
      if (!Array.isArray(update.clearConditions)) throw new Error("clearConditions must be an array");
      level.clearConditions = [];
      for (const condition of update.clearConditions) addClearCondition(project, level.id, condition);
    }
  }

  for (const update of patch.placementUpdates || []) {
    const level = project.levels.find((candidate) =>
      (candidate.placements || []).some((placement) => placement.id === update.placementId),
    );
    if (!level) throw new Error(`Unknown placement ${update.placementId}`);
    updatePlacement(project, level.id, update.placementId, {
      ...(update.role ? { role: update.role } : {}),
      ...(update.tags ? { tags: update.tags } : {}),
      ...(update.settings ? { settings: update.settings } : {}),
    });
  }

  if (patch.interactions != null) {
    if (!Array.isArray(patch.interactions)) throw new Error("interactions must be an array");
    project.gameplay.interactions = [];
    for (const interaction of patch.interactions) addInteraction(project, interaction);
  }
  project.updatedAt = Date.now();
  return project;
}

export function placeObject(project, levelId, objectId, transform = {}) {
  const level = project.levels.find((candidate) => candidate.id === levelId);
  if (!level) throw new Error(`Unknown level ${levelId}`);
  if (!project.objects.some((candidate) => candidate.id === objectId)) {
    throw new Error(`Unknown object ${objectId}`);
  }
  const placement = {
    id: id("placement"),
    objectId,
    position: vector(transform.position),
    rotation: vector(transform.rotation),
    scale: vector(transform.scale || { x: 1, y: 1, z: 1 }),
    role: transform.role || "prop",
    tags: Array.isArray(transform.tags) ? [...transform.tags] : [],
    settings: { ...(transform.settings || {}) },
  };
  level.placements.push(placement);
  project.updatedAt = Date.now();
  return placement;
}

export function updatePlacement(project, levelId, placementId, changes = {}) {
  const level = project.levels.find((candidate) => candidate.id === levelId);
  const placement = level?.placements.find((candidate) => candidate.id === placementId);
  if (!placement) throw new Error("Placed object not found");
  if (changes.role && !PLACEMENT_ROLES.includes(changes.role)) {
    throw new Error(`Unsupported object role ${changes.role}`);
  }
  if (changes.position) placement.position = vector(changes.position);
  if (changes.rotation) placement.rotation = vector(changes.rotation);
  if (changes.scale) placement.scale = vector(changes.scale);
  if (changes.role) placement.role = changes.role;
  if (changes.tags) placement.tags = [...changes.tags];
  if (changes.settings) placement.settings = { ...placement.settings, ...changes.settings };
  project.updatedAt = Date.now();
  return placement;
}

export function removePlacement(project, levelId, placementId) {
  const level = project.levels.find((candidate) => candidate.id === levelId);
  if (!level) throw new Error("Level not found");
  const index = level.placements.findIndex((candidate) => candidate.id === placementId);
  if (index < 0) throw new Error("Placed object not found");
  const [removed] = level.placements.splice(index, 1);
  project.gameplay.interactions = project.gameplay.interactions.filter(
    (interaction) => interaction.sourcePlacementId !== placementId && interaction.targetPlacementId !== placementId,
  );
  project.updatedAt = Date.now();
  return removed;
}

export function setLevelMarker(project, levelId, type, position) {
  const level = project.levels.find((candidate) => candidate.id === levelId);
  if (!level) throw new Error("Level not found");
  if (type === "start") level.entry = vector(position);
  else if (type === "finish") level.exits = [{ id: id("exit"), position: vector(position) }];
  else throw new Error("Unknown level marker");
  project.updatedAt = Date.now();
  return level;
}

export function moveLevel(project, levelId, direction) {
  const index = project.levelOrder.indexOf(levelId);
  const next = index + Number(direction);
  if (index < 0 || next < 0 || next >= project.levelOrder.length) return false;
  [project.levelOrder[index], project.levelOrder[next]] = [project.levelOrder[next], project.levelOrder[index]];
  project.updatedAt = Date.now();
  return true;
}

export function removeLevel(project, levelId) {
  const index = project.levels.findIndex((level) => level.id === levelId);
  if (index < 0) throw new Error("Level not found");
  const [removed] = project.levels.splice(index, 1);
  project.levelOrder = project.levelOrder.filter((id) => id !== levelId);
  const placementIds = new Set((removed.placements || []).map((placement) => placement.id));
  project.gameplay.interactions = project.gameplay.interactions.filter(
    (interaction) => !placementIds.has(interaction.sourcePlacementId) && !placementIds.has(interaction.targetPlacementId),
  );
  project.updatedAt = Date.now();
  return removed;
}

export function addInteraction(project, {
  sourcePlacementId,
  targetPlacementId,
  type = "activates",
  amount = 1,
} = {}) {
  const placementIds = new Set(project.levels.flatMap((level) => level.placements.map((placement) => placement.id)));
  if (!placementIds.has(sourcePlacementId) || !placementIds.has(targetPlacementId)) {
    throw new Error("Interaction objects must be placed in the project");
  }
  const interaction = {
    id: id("interaction"),
    sourcePlacementId,
    targetPlacementId,
    type,
    amount: Number(amount || 1),
  };
  project.gameplay.interactions.push(interaction);
  project.updatedAt = Date.now();
  return interaction;
}

export function validateGameProject(project, { requireClearConditions = true } = {}) {
  const errors = [];
  if (project?.schema !== "bonzai.game-project") errors.push("invalid project schema");
  if (project?.version !== GAME_PROJECT_VERSION) errors.push("unsupported project version");
  if (!String(project?.title || "").trim()) errors.push("title is required");
  if (!Array.isArray(project?.objects)) errors.push("objects must be an array");
  if (!Array.isArray(project?.levels) || project.levels.length === 0) {
    errors.push("at least one level is required");
  }
  const objectIds = new Set((project?.objects || []).map((asset) => asset.id));
  const placementIds = new Set((project?.levels || []).flatMap((level) =>
    (level.placements || []).map((placement) => placement.id),
  ));
  const levelIds = new Set((project?.levels || []).map((level) => level.id));
  for (const level of project?.levels || []) {
    if (requireClearConditions && (!Array.isArray(level.clearConditions) || level.clearConditions.length === 0)) {
      errors.push(`${level.id} needs at least one clear condition`);
    }
    if (!["all", "any"].includes(level.clearMode || "all")) errors.push(`${level.id} has an invalid clear mode`);
    for (const condition of level.clearConditions || []) {
      if (!CLEAR_CONDITION_TYPES.includes(condition.type)) errors.push(`${condition.id} has an unsupported clear condition`);
      if (condition.type === "reach" && condition.targetPlacementId && !placementIds.has(condition.targetPlacementId)) {
        errors.push(`${condition.id} references missing target placement`);
      }
      if (condition.type === "reach" && !condition.targetPlacementId && !level.exits?.length) {
        errors.push(`${condition.id} needs a target object or marker`);
      }
    }
    for (const placement of level.placements || []) {
      if (!objectIds.has(placement.objectId)) {
        errors.push(`${level.id} references missing object ${placement.objectId}`);
      }
    }
  }
  for (const levelId of project?.levelOrder || []) {
    if (!levelIds.has(levelId)) errors.push(`levelOrder references missing level ${levelId}`);
  }
  for (const interaction of project?.gameplay?.interactions || []) {
    if (!placementIds.has(interaction.sourcePlacementId)) {
      errors.push(`${interaction.id} references missing source placement`);
    }
    if (!placementIds.has(interaction.targetPlacementId)) {
      errors.push(`${interaction.id} references missing target placement`);
    }
  }
  return { ok: errors.length === 0, errors };
}

const vecArgs = (value, fallback = { x: 0, y: 0, z: 0 }) => {
  const normalized = vector(value || fallback);
  return `${normalized.x}, ${normalized.y}, ${normalized.z}`;
};

/**
 * Compile independently generated level/object assets into one executable
 * GAME project. Asset source stays intact inside isolated builder functions,
 * preserving its geometry, shaders, animation and renderer integrations.
 */
export function compileGameProject(project) {
  const verdict = validateGameProject(project, { requireClearConditions: false });
  if (!verdict.ok) throw new Error(verdict.errors.join("; "));

  const orderedLevels = project.levelOrder.map((levelId) =>
    project.levels.find((level) => level.id === levelId),
  );
  const playerPlacement = orderedLevels
    .flatMap((level) => level.placements || [])
    .find((placement) => placement.role === "player");
  const runtimeId = (placementId) => placementId === playerPlacement?.id ? "player" : placementId;
  const objectiveRows = orderedLevels.flatMap((level) => (level.clearConditions || []).map((condition) => ({
    id: `${level.id}_${condition.id}`,
    type: condition.type,
    label: condition.label,
    target: Math.max(1, Number(condition.target || 1)),
    tag: condition.tag || undefined,
    event: condition.event || undefined,
    trigger: condition.type === "reach" ? `reach_${level.id}_${condition.id}` : undefined,
    group: level.id,
  })));
  const clearGroups = orderedLevels.filter((level) => level.clearConditions?.length).map((level) => {
    const index = orderedLevels.indexOf(level);
    const nextPlayableLevel = orderedLevels.slice(index + 1).find((candidate) => candidate.clearConditions?.length);
    return {
    id: level.id,
    label: level.title,
    mode: level.clearMode || "all",
    objectiveIds: (level.clearConditions || []).map((condition) => `${level.id}_${condition.id}`),
    nextLevelId: nextPlayableLevel?.id || null,
    };
  });
  if (!objectiveRows.length) {
    objectiveRows.push({
      id: "build_mode",
      type: "custom",
      label: "Designing gameplay",
      target: 1,
      event: "build-complete",
      required: false,
    });
  }
  const lines = [
    `setObjectInfo(${JSON.stringify(project.title)}, "BonzAI World Forge game");`,
    `const game = GAME.create({`,
    `  title: ${JSON.stringify(project.title)},`,
    `  startMessage: ${JSON.stringify(project.gameplay?.premise || "Explore the world and clear every level.")},`,
    `  objectives: [`,
    ...objectiveRows.map((objective) => `    ${JSON.stringify(objective)},`),
    `  ],`,
    `  clearGroups: ${JSON.stringify(clearGroups)},`,
    `});`,
    ``,
  ];

  project.objects.forEach((asset, index) => {
    lines.push(
      `const buildObject${index} = ${assetBuilder(asset.code)};`,
      ``,
    );
  });

  orderedLevels.forEach((level, index) => {
    lines.push(
      `const levelRoot${index} = new THREE.Group();`,
      `levelRoot${index}.name = ${JSON.stringify(level.title)};`,
      `root.add(levelRoot${index});`,
      `async function buildLevel${index}(root, Math) {`,
      sourceForBuilder(level.code).split("\n").map((line) => `  ${line}`).join("\n"),
      `  return root;`,
      `}`,
      `await buildLevel${index}(levelRoot${index}, H.seededLevelMath(${JSON.stringify(level.seed || sceneSourceSeed(level.code))}));`,
      compileLevelParts(level, `levelRoot${index}`),
      `game.level(${JSON.stringify(level.id)}, levelRoot${index}, { entry: new THREE.Vector3(${vecArgs(level.entry)}) });`,
      ``,
    );

    for (const [placementIndex, placement] of (level.placements || []).entries()) {
      const assetIndex = project.objects.findIndex((asset) => asset.id === placement.objectId);
      const placementVariable = `placement${index}_${placementIndex}`;
      lines.push(
        `const ${placementVariable} = new THREE.Group();`,
        `await buildObject${assetIndex}(${placementVariable}, H.seededLevelMath(${JSON.stringify(project.objects[assetIndex].seed || sceneSourceSeed(project.objects[assetIndex].code))}), addUpdateCallback);`,
        `${placementVariable}.position.set(${vecArgs(placement.position)});`,
        `${placementVariable}.rotation.set(${vecArgs(placement.rotation)});`,
        `${placementVariable}.scale.set(${vecArgs(placement.scale, { x: 1, y: 1, z: 1 })});`,
        `levelRoot${index}.add(${placementVariable});`,
      );
      if (placement.role === "player") {
        lines.push(`game.player(${placementVariable}, { speed: ${Number(placement.settings?.speed || 4.5)} });`);
      } else {
        lines.push(
          `game.actor(${JSON.stringify(placement.id)}, ${placementVariable}, { tags: ${JSON.stringify(placement.tags?.length ? placement.tags : [placement.role])}, health: ${placement.role === "enemy" ? Number(placement.settings?.health || 100) : 1}, controller: false });`,
        );
      }
      if (placement.role === "collectible" || placement.role === "buff") {
        lines.push(
          `game.interaction("player", ${JSON.stringify(placement.id)}, { type: "collects", amount: 1 });`,
        );
      } else if (placement.role === "enemy") {
        lines.push(
          `game.interaction("player", ${JSON.stringify(placement.id)}, { type: "damages", amount: ${Number(placement.settings?.damage || 25)} });`,
        );
      } else if (placement.role === "trap" || placement.role === "debuff") {
        lines.push(
          `game.trigger(${JSON.stringify(`contact_${placement.id}`)}, ${placementVariable}, { levelId: ${JSON.stringify(level.id)}, radius: 0.8, once: false, onEnter: () => game.damage("player", ${Number(placement.settings?.damage || 20)}, ${JSON.stringify(placement.id)}) });`,
        );
      } else if (placement.role === "checkpoint") {
        lines.push(
          `game.trigger(${JSON.stringify(`checkpoint_${placement.id}`)}, ${placementVariable}, { levelId: ${JSON.stringify(level.id)}, radius: 0.9, onEnter: () => game.checkpoint(${JSON.stringify(placement.id)}) });`,
        );
      }
    }

    for (const [conditionIndex, condition] of (level.clearConditions || []).entries()) {
      if (condition.type !== "reach") continue;
      const placementIndex = (level.placements || []).findIndex((placement) => placement.id === condition.targetPlacementId);
      const triggerObject = placementIndex >= 0 ? `placement${index}_${placementIndex}` : `clearMarker${index}_${conditionIndex}`;
      if (placementIndex < 0) {
        lines.push(
          `const ${triggerObject} = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.08, 32), new THREE.MeshStandardMaterial({ color: 0xd5b45b, emissive: 0x6b4218, emissiveIntensity: 1.4 }));`,
          `${triggerObject}.position.set(${vecArgs(level.exits[0].position)});`,
          `levelRoot${index}.add(${triggerObject});`,
        );
      }
      lines.push(
        `game.trigger(${JSON.stringify(`reach_${level.id}_${condition.id}`)}, ${triggerObject}, { levelId: ${JSON.stringify(level.id)}, radius: 1.15 });`,
      );
    }
    lines.push("");
  });

  for (const interaction of project.gameplay?.interactions || []) {
    lines.push(
      `game.interaction(${JSON.stringify(runtimeId(interaction.sourcePlacementId))}, ${JSON.stringify(runtimeId(interaction.targetPlacementId))}, { type: ${JSON.stringify(interaction.type)}, amount: ${interaction.amount} });`,
    );
  }

  if (!playerPlacement) {
    lines.push(
      `const player = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 6, 12), new THREE.MeshStandardMaterial({ color: 0xf4ead3, roughness: 0.45, metalness: 0.15 }));`,
      `player.castShadow = true;`,
      `root.add(player);`,
      `game.player(player, { speed: 4.5 });`,
    );
  }
  lines.push(
    `game.on("fall", () => game.damage("player", 100, "level"));`,
    `game.goToLevel(${JSON.stringify(orderedLevels[0].id)});`,
    `game.start();`,
  );

  return lines.join("\n");
}

export function buildGameCollectibleManifest(project) {
  const verdict = validateGameProject(project);
  if (!verdict.ok) throw new Error(verdict.errors.join("; "));
  return {
    schema: project.schema,
    version: project.version,
    kind: ASSET_KINDS.GAME,
    projectId: project.id,
    title: project.title,
    description: project.description,
    levelOrder: [...project.levelOrder],
    levels: project.levels.map(({ code, ...level }) => ({
      ...level,
      code,
    })),
    objects: project.objects.map(({ code, ...asset }) => ({
      ...asset,
      code,
    })),
    gameplay: structuredClone(project.gameplay),
    dependencyCollectibles: [
      ...project.objects.map((asset) => asset.collectible).filter(Boolean),
      ...project.levels.map((level) => level.collectible).filter(Boolean),
    ],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
