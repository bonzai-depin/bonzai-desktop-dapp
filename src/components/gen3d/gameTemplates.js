import { createGameProject, addObjectAsset, addLevel, placeObject, addClearCondition, setLevelMarker } from './gameProject.js';
import { planWorld, layoutWorld, worldSource, randomSource, WORLD_THEMES } from './worldLayout.js';
import { actorSource } from './actorKit.js';

// A complete, editable game project without inference: planned level, built-in
// actors and rules. It is the same project format the Build editor and the
// compiler already use, so everything here can be moved, re-roled or replaced.

export const GAME_TEMPLATES = Object.freeze([
  { id: 'collect', icon: 'diamond', label: 'Collect and escape' },
  { id: 'hunt', icon: 'swords', label: 'Clear the area' },
  { id: 'survive', icon: 'timer', label: 'Survive' },
  { id: 'escape', icon: 'flag', label: 'Reach the exit' },
]);
export const GAME_DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);

const SCALE = { small: 0, medium: 1, large: 2 };
// [pickups, enemies, traps, heals] per world size; difficulty then scales the threats.
const COUNTS = {
  collect: { pickups: [5, 8, 12], enemies: [2, 3, 5], traps: [1, 3, 4], heals: [1, 2, 2] },
  hunt: { pickups: [0, 0, 0], enemies: [3, 5, 8], traps: [0, 2, 3], heals: [1, 2, 3] },
  survive: { pickups: [0, 0, 0], enemies: [3, 5, 7], traps: [2, 3, 5], heals: [2, 3, 4] },
  escape: { pickups: [0, 0, 0], enemies: [2, 4, 6], traps: [3, 6, 9], heals: [1, 1, 2] },
};
const THREAT = { easy: { count: .6, speed: 1.7, damage: 12 }, normal: { count: 1, speed: 2.3, damage: 20 }, hard: { count: 1.5, speed: 3, damage: 28 } };
const GLOW = { dungeon: 0xffb347, station: 0x45e0ff, temple: 0xffd76a, forest: 0x7dff9a, desert: 0xffc24a, snow: 0x8fd8ff, moon: 0xb48cff };

/** A planned level as ordinary level source, ready for the viewer, history and the editor. */
export function createInstantLevel({ prompt = '', seed, variation = 0, theme, size } = {}) {
  const blueprint = planWorld(prompt, { seed, variation, theme, size });
  return { blueprint, title: blueprint.title, code: worldSource(blueprint), layout: layoutWorld(blueprint) };
}

export function createInstantGame({ prompt = '', template = 'collect', difficulty = 'normal', seed, variation = 0, theme, size } = {}) {
  const rules = COUNTS[template], threat = THREAT[difficulty];
  if (!rules) throw new Error(`Unknown game template ${template}. Use one of: ${GAME_TEMPLATES.map(item => item.id).join(', ')}`);
  if (!threat) throw new Error(`Unknown difficulty ${difficulty}. Use easy, normal or hard`);
  const { blueprint, code, layout } = createInstantLevel({ prompt, seed, variation, theme, size });
  const label = GAME_TEMPLATES.find(item => item.id === template).label, random = randomSource(blueprint.seed ^ 0x3C6EF372);
  const project = createGameProject({ title: String(prompt).trim().slice(0, 60) || `${label}: ${WORLD_THEMES[blueprint.theme].label}`, description: `${label} in a ${WORLD_THEMES[blueprint.theme].label.toLowerCase()}` });
  const level = addLevel(project, { title: WORLD_THEMES[blueprint.theme].label, code });
  setLevelMarker(project, level.id, 'start', layout.spawn);
  setLevelMarker(project, level.id, 'finish', layout.exit);

  const glow = GLOW[blueprint.theme], outdoors = layout.kind === 'terrain' && blueprint.theme !== 'moon';
  const asset = (title, kind, options = {}) => addObjectAsset(project, { title, code: actorSource(kind, options), source: 'template' });
  const hero = asset('Hero', 'hero', { glow }), portal = asset('Portal', 'portal', { glow });
  const put = (object, position, role, settings = {}, rotation = 0) => placeObject(project, level.id, object.id, { position, rotation: { y: rotation }, role, settings });
  // A higher camera than the default keeps walls and trees from hiding the player.
  put(hero, layout.spawn, 'player', { speed: 5.2, jump: 1.1, camera: layout.kind === 'rooms' ? [0, 8.5, 5.5] : [0, 6, 8] });
  const goal = put(portal, layout.exit, 'goal');

  const tier = SCALE[blueprint.size], scaled = list => list[tier];
  const wanted = { pickups: scaled(rules.pickups), enemies: Math.max(1, Math.round(scaled(rules.enemies) * threat.count)), traps: Math.round(scaled(rules.traps) * threat.count), heals: scaled(rules.heals) };
  // Threats start away from the player; pickups are spread through the whole map.
  const byDistance = [...layout.slots].sort((a, b) => b.far - a.far), taken = new Set();
  const take = (count, pool) => { const picked = []; for (const slot of pool) { if (picked.length >= count) break; if (!taken.has(slot)) { taken.add(slot); picked.push(slot); } } return picked; };
  // The objective is placed first: a cramped map gives up threats, never the way to win.
  const pickupSlots = take(wanted.pickups, layout.slots);
  const enemySlots = take(wanted.enemies, random.shuffle(byDistance.slice(0, Math.ceil(byDistance.length * .6))).concat(byDistance));
  const trapSlots = take(wanted.traps, layout.slots), healSlots = take(wanted.heals, layout.slots);

  if (enemySlots.length) {
    const enemy = asset(outdoors ? 'Slime' : 'Sentinel', outdoors ? 'slime' : 'sentinel');
    for (const slot of enemySlots) put(enemy, slot, 'enemy', { health: template === 'hunt' ? 68 : 100, damage: threat.damage, speed: threat.speed * (template === 'survive' ? 1.15 : 1), range: template === 'survive' ? 60 : 11 }, random.range(0, Math.PI * 2));
  }
  if (pickupSlots.length) { const crystal = asset('Crystal', 'crystal', { color: glow }); for (const slot of pickupSlots) put(crystal, slot, 'collectible'); }
  if (trapSlots.length) { const spikes = asset('Spikes', 'spikes'); for (const slot of trapSlots) put(spikes, slot, 'trap', { damage: threat.damage }, random.range(0, Math.PI)); }
  if (healSlots.length) { const orb = asset('Repair orb', 'orb'); for (const slot of healSlots) put(orb, slot, 'buff', { heal: 30 }); }

  const controls = 'Move with WASD or arrows, Shift to run, Space to jump, E to strike.';
  if (template === 'collect') {
    addClearCondition(project, level.id, { type: 'collect', label: `Collect ${pickupSlots.length} crystals`, target: pickupSlots.length, tag: 'collectible' });
    addClearCondition(project, level.id, { type: 'reach', label: 'Reach the portal', targetPlacementId: goal.id });
    project.gameplay.premise = `Collect ${pickupSlots.length} crystals and reach the portal. ${controls}`;
  } else if (template === 'hunt') {
    addClearCondition(project, level.id, { type: 'defeat', label: `Defeat ${enemySlots.length} guardians`, target: enemySlots.length, tag: 'enemy' });
    project.gameplay.premise = `Defeat all ${enemySlots.length} guardians. ${controls}`;
  } else if (template === 'survive') {
    addClearCondition(project, level.id, { type: 'survive', label: 'Survive for 60 seconds', target: 60 });
    project.gameplay.premise = `Stay alive for 60 seconds. ${controls}`;
  } else {
    addClearCondition(project, level.id, { type: 'reach', label: 'Reach the portal', targetPlacementId: goal.id });
    project.gameplay.premise = `Cross the level and reach the portal. ${controls}`;
  }
  project.instant = { template, difficulty, blueprint };
  return project;
}
