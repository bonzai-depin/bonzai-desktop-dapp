import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Ready-made game pieces. A playable game needs a hero, threats, pickups and a
// goal before any custom asset exists; these are built in milliseconds, stand
// on y = 0, face +Z (the direction the GAME controller turns a moving actor)
// and can be replaced by generated assets later without touching the rules.

const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .1, ...o });
const glow = (color, intensity = 2.2) => new THREE.MeshStandardMaterial({ color: 0x0c0c0c, emissive: color, emissiveIntensity: intensity, roughness: .35 });
const at = (geometry, x = 0, y = 0, z = 0) => geometry.translate(x, y, z);
const capsule = (r, length, x, y, z, tilt = 0) => at(new THREE.CapsuleGeometry(r, length, 6, 14).rotateZ(tilt), x, y, z);
const rounded = (w, h, d, x, y, z, r = .04) => at(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) * .45)), x, y, z);
function part(group, geometries, material, name, cast = true) {
  const list = geometries.map(g => g.index ? g.toNonIndexed() : g);
  const node = new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], material);
  node.name = name; node.castShadow = cast; node.receiveShadow = cast;
  group.add(node);
  return node;
}
const colour = (value, fallback) => Number.isFinite(value) && value >= 0 && value <= 0xffffff ? value : fallback;

const BUILDERS = {
  hero(g, o) {
    const body = flat(colour(o.color, 0xe9e3d2), { roughness: .42 }), accent = flat(colour(o.accent, 0x2f6df0), { roughness: .35, metalness: .25 }), dark = flat(0x23262d, { roughness: .6, metalness: .3 });
    part(g, [capsule(.25, .34, 0, 1.02, 0), new THREE.SphereGeometry(.215, 28, 20).translate(0, 1.5, 0), capsule(.082, .34, -.36, 1.02, 0, .12), capsule(.082, .34, .36, 1.02, 0, -.12)], body, 'hero_body');
    part(g, [rounded(.34, .3, .2, 0, 1.08, .17), rounded(.3, .4, .18, 0, 1.04, -.24), new THREE.TorusGeometry(.262, .035, 10, 28).rotateX(Math.PI / 2).translate(0, .8, 0),
      new THREE.SphereGeometry(.105, 16, 12).translate(-.34, 1.26, 0), new THREE.SphereGeometry(.105, 16, 12).translate(.34, 1.26, 0), new THREE.CylinderGeometry(.012, .012, .3, 6).translate(.1, 1.42, -.24)], accent, 'hero_armour');
    part(g, [capsule(.1, .34, -.13, .4, 0), capsule(.1, .34, .13, .4, 0), rounded(.2, .13, .32, -.13, .065, .04), rounded(.2, .13, .32, .13, .065, .04),
      new THREE.SphereGeometry(.09, 14, 10).translate(-.38, .78, 0), new THREE.SphereGeometry(.09, 14, 10).translate(.38, .78, 0), new THREE.CylinderGeometry(.09, .11, .08, 16).translate(0, 1.3, 0)], dark, 'hero_joints');
    part(g, [new THREE.SphereGeometry(.19, 24, 12, 0, Math.PI * 2, Math.PI * .36, Math.PI * .2).scale(1.08, 1, 1.12).translate(0, 1.5, .012), new THREE.SphereGeometry(.03, 10, 8).translate(.1, 1.59, -.24)], glow(colour(o.glow, 0x7fe6ff), 2.4), 'hero_visor', false);
  },
  sentinel(g, o) {
    const shell = flat(colour(o.color, 0x2a2d35), { roughness: .32, metalness: .75 }), hot = glow(colour(o.glow, 0xff3b2f), 3);
    const body = new THREE.Group(); body.name = 'sentinel_body'; body.position.y = 1.05; g.add(body);
    part(body, [new THREE.SphereGeometry(.4, 32, 24), ...[0, 1, 2].map(i => new THREE.ConeGeometry(.11, .5, 12).translate(0, .62, 0).rotateZ(Math.PI * .72).rotateY(i / 3 * Math.PI * 2))], shell, 'sentinel_shell');
    part(body, [new THREE.SphereGeometry(.16, 20, 16).translate(0, .02, .31)], hot, 'sentinel_eye', false);
    const ring = part(body, [new THREE.TorusGeometry(.58, .035, 10, 48).rotateX(Math.PI / 2)], shell, 'sentinel_ring');
    return ({ time }) => { body.position.y = 1.05 + Math.sin(time * 2.2 + g.id) * .08; ring.rotation.z = Math.sin(time * 1.3) * .35; ring.rotation.y = time * 1.6; };
  },
  slime(g, o) {
    const jelly = new THREE.MeshPhysicalMaterial({ color: colour(o.color, 0x58c94a), roughness: .18, transmission: .35, thickness: .6, clearcoat: 1 });
    const body = part(g, [new THREE.LatheGeometry([[0, 0], [.5, 0], [.58, .12], [.54, .42], [.36, .68], [.14, .78], [0, .8]].map(([r, y]) => new THREE.Vector2(r, y)), 32)], jelly, 'slime_body');
    part(g, [new THREE.SphereGeometry(.085, 14, 10).translate(-.17, .46, .43), new THREE.SphereGeometry(.085, 14, 10).translate(.17, .46, .43)], flat(0x10130f, { roughness: .2 }), 'slime_eyes', false);
    return ({ time }) => { const s = Math.sin(time * 3 + g.id) * .06; body.scale.set(1 + s, 1 - s, 1 + s); };
  },
  crystal(g, o) {
    const gem = part(g, [new THREE.ConeGeometry(.24, .42, 6).translate(0, .21, 0), new THREE.ConeGeometry(.24, .3, 6).rotateX(Math.PI).translate(0, -.15, 0)],
      new THREE.MeshStandardMaterial({ color: colour(o.color, 0x45e0ff), emissive: colour(o.color, 0x45e0ff), emissiveIntensity: .9, roughness: .12, metalness: .2, flatShading: true }), 'crystal_gem');
    gem.position.y = .75;
    return ({ time }) => { gem.rotation.y = time * 1.8 + g.id; gem.position.y = .75 + Math.sin(time * 2.4 + g.id) * .1; };
  },
  coin(g, o) {
    const disc = part(g, [new THREE.LatheGeometry([[0, -.035], [.24, -.035], [.28, -.015], [.28, .015], [.24, .035], [0, .035]].map(([r, y]) => new THREE.Vector2(r, y)), 32).rotateX(Math.PI / 2)],
      flat(colour(o.color, 0xf2c14e), { roughness: .22, metalness: 1 }), 'coin_disc');
    disc.position.y = .7;
    return ({ time }) => { disc.rotation.y = time * 2.6 + g.id; };
  },
  orb(g, o) {
    const core = part(g, [new THREE.SphereGeometry(.2, 24, 16)], glow(colour(o.color, 0x6cff8f), 2), 'orb_core', false);
    const ring = part(g, [new THREE.TorusGeometry(.32, .025, 8, 40)], flat(0xf1f1f1, { metalness: .9, roughness: .2 }), 'orb_ring');
    core.position.y = ring.position.y = .8;
    return ({ time }) => { ring.rotation.set(time * 1.4, time * .9, 0); };
  },
  portal(g, o) {
    const stone = flat(colour(o.color, 0x8d8f96), { roughness: .85 }), energy = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: colour(o.glow, 0x7b5cff), emissiveIntensity: 2.4, transparent: true, opacity: .85, side: THREE.DoubleSide });
    part(g, [new THREE.TorusGeometry(1.15, .17, 14, 56).translate(0, 1.4, 0), rounded(2.9, .28, .9, 0, .14, 0, .06), rounded(.5, .5, .7, -1.1, .5, 0), rounded(.5, .5, .7, 1.1, .5, 0)], stone, 'portal_frame');
    const field = part(g, [new THREE.CircleGeometry(1.02, 48)], energy, 'portal_field', false);
    field.position.y = 1.4;
    const light = new THREE.PointLight(colour(o.glow, 0x7b5cff), 14, 9, 2); light.name = 'portal_light'; light.position.set(0, 1.4, .6); g.add(light);
    return ({ time }) => { energy.emissiveIntensity = 2.2 + Math.sin(time * 2.6) * .7; };
  },
  spikes(g, o) {
    part(g, [rounded(1.3, .1, 1.3, 0, .05, 0, .03)], flat(0x2b2d33, { roughness: .5, metalness: .6 }), 'spike_plate');
    const cones = [];
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) cones.push(new THREE.ConeGeometry(.09, .5, 10).translate(x * .38, .34, z * .38));
    part(g, cones, flat(colour(o.color, 0xc9ccd4), { roughness: .25, metalness: .95 }), 'spike_points');
  },
  beacon(g, o) {
    part(g, [new THREE.CylinderGeometry(.05, .07, 1.7, 12).translate(0, .85, 0), new THREE.CylinderGeometry(.26, .3, .1, 20).translate(0, .05, 0)], flat(0x3a3d45, { metalness: .7, roughness: .35 }), 'beacon_pole');
    const flame = part(g, [new THREE.ConeGeometry(.16, .42, 12)], glow(colour(o.color, 0xffb347), 3), 'beacon_flame', false);
    flame.position.y = 1.9;
    return ({ time }) => { flame.scale.y = 1 + Math.sin(time * 9 + g.id) * .12; };
  },
};

export const ACTOR_KINDS = Object.freeze(Object.keys(BUILDERS));

/** H.actor(kind, {color, accent, glow}): a named, animated game piece standing on its own origin. */
export function buildActor(kind, options = {}, addUpdateCallback = null) {
  const build = BUILDERS[kind];
  if (!build) throw new Error(`Unknown actor ${kind}. Use one of: ${ACTOR_KINDS.join(', ')}`);
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Actor options must be an object');
  const group = new THREE.Group();
  group.name = `actor_${kind}`;
  const animate = build(group, options);
  // Idle motion moves children only, so gameplay stays in charge of the actor's own transform.
  if (animate && addUpdateCallback) addUpdateCallback(animate);
  return group;
}

/** One line of asset source per actor, stored in a game project like any generated object. */
export const actorSource = (kind, options = {}) => {
  if (!BUILDERS[kind]) throw new Error(`Unknown actor ${kind}`);
  return `root.add(H.actor(${JSON.stringify(kind)}, ${JSON.stringify(options)}));`;
};
