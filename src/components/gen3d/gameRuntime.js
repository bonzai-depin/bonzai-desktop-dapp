import { createGameCollisions } from './gameCollision.js';

const DEFAULT_INPUT = {
  forward: ["KeyW", "ArrowUp"],
  backward: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  action: ["KeyE", "Space"],
  jump: ["Space"],
  restart: ["KeyR"],
  pause: ["Escape"],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const GRAVITY = 22;
// A hidden level hides its actors through the parent, not through their own flag.
const shown = (object) => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; };

export function validateGameSpec(spec = {}) {
  const errors = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { ok: false, errors: ["Game specification must be an object."] };
  }
  if (!String(spec.title || "").trim()) errors.push("title is required");
  if (spec.objectives != null && !Array.isArray(spec.objectives)) {
    errors.push("objectives must be an array");
  }
  if (spec.clearGroups != null && !Array.isArray(spec.clearGroups)) errors.push("clearGroups must be an array");
  for (const [index, objective] of (Array.isArray(spec.objectives) ? spec.objectives : []).entries()) {
    if (!objective?.id) errors.push(`objectives[${index}].id is required`);
    if (!["collect", "score", "defeat", "reach", "survive", "custom"].includes(objective?.type)) {
      errors.push(`objectives[${index}].type is unsupported`);
    }
    if(objective?.type==='reach' && (typeof objective.trigger!=='string'||!objective.trigger.trim()))errors.push(`objectives[${index}].trigger must identify the exit/goal trigger`);
    if(objective?.type==='custom' && (typeof objective.event!=='string'||!objective.event.trim()))errors.push(`objectives[${index}].event must identify the completion event`);
    if(objective?.target!=null && (!Number.isFinite(objective.target)||objective.target<=0))errors.push(`objectives[${index}].target must be a positive finite number`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateGeneratedGameCode(code = "") {
  const source = String(code)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const requirements = [
    ["one GAME session", /\bGAME\.create\s*\(/],
    ["a registered player", /\b(?:game|session)\.player\s*\(/],
    ["at least one objective", /\bobjectives\s*:\s*\[\s*\{/],
    ["an interaction or trigger", /\b(?:game|session)\.(?:trigger|collect|damage|on|emit)\s*\(/],
    ["a fail path", /\b(?:game|session)\.(?:lose|damage)\s*\(/],
    ["a start call", /\b(?:game|session)\.start\s*\(/],
  ];
  const missing = requirements.filter(([, pattern]) => !pattern.test(source)).map(([label]) => label);
  return {
    ok: missing.length === 0,
    missing,
    reason: missing.length ? `Generated game is missing ${missing.join(", ")}` : "",
  };
}

// A source-level GAME call is not evidence of a live playable scene. Check the
// objects created by the module before accepting a game generation.
export function inspectGameSession(session, root) {
  const errors = [];
  if (!session) return { errors: ['Generated game did not create a GAME session'] };
  const player = session.actors.get('player')?.object;
  let attached = false, visibleGeometry = false, visible = true;
  for (let node = player; node; node = node.parent) { if (node === root) attached = true; if(!node.visible)visible=false; }
  player?.traverseVisible(node => { if (node.isMesh && node.geometry?.getAttribute('position')?.count > 0) visibleGeometry = true; });
  if (!attached || !visible || !visibleGeometry) errors.push('The registered player needs visible geometry attached to root');
  if (!session.objectives.some(objective => objective.required)) errors.push('Generated game needs at least one required objective');
  for(const objective of session.objectives)if(objective.type==='reach'&&!session.triggers.has(objective.trigger))errors.push(`Goal ${objective.id} refers to missing trigger ${objective.trigger}`);
  if (session.phase !== 'running') errors.push('Generated game must start in a playable running state');
  return { errors };
}

export function createGameRuntime({
  THREE,
  addUpdateCallback,
  camera = null,
  controls = null,
  renderer = null,
  eventTarget = typeof window !== "undefined" ? window : null,
  now = () => performance.now(),
} = {}) {
  if (!THREE) throw new Error("createGameRuntime requires THREE");
  const finiteVector=(value,label)=>{
    const xyz=Array.isArray(value)?value:value?.isVector3?value.toArray():null;
    if(!xyz||xyz.length!==3||!xyz.every(Number.isFinite))throw Error(`GAME ${label} must contain three finite coordinates`);
    return new THREE.Vector3(...xyz);
  };

  const sessions = new Set();
  let active = null;

  function create(spec = {}) {
    const verdict = validateGameSpec(spec);
    if (!verdict.ok) throw new Error(`Invalid game specification: ${verdict.errors.join("; ")}`);
    active?.dispose();

    const listeners = new Map();
    const actors = new Map();
    const triggers = new Map();
    const levels = new Map();
    const interactions = new Map();
    const collisions = createGameCollisions(THREE);
    const pressed = new Set();
    const justPressed = new Set();
    const initialState = {
      score: 0,
      health: 100,
      maxHealth: 100,
      lives: 3,
      elapsed: 0,
      ...(spec.state || {}),
    };
    const state = structuredClone(initialState);
    const objectives = (spec.objectives || []).map((objective) => ({
      target: 1,
      progress: 0,
      required: true,
      ...objective,
      complete: false,
    }));
    const clearGroups = (spec.clearGroups || []).map((group) => ({ mode: "all", objectiveIds: [], ...group, complete: false }));
    const checkpoints = new Map();
    const grounds = new Map();
    const groundAt = (x, z) => { const ground = grounds.get(session.activeLevelId) ?? grounds.get(""); return typeof ground === "function" ? ground(x, z) : ground ?? 0; };
    let autonomous = null;
    let phase = "ready";
    let disposed = false;
    let startedAt = 0;
    let startLevelId = null;
    let hud = null;

    const emit = (type, detail = {}) => {
      for (const listener of listeners.get(type) || []) listener(detail, session);
      for (const listener of listeners.get("*") || []) listener({ type, ...detail }, session);
    };

    const onKeyDown = (event) => {
      if(event.target?.closest?.('input, textarea, select, [contenteditable="true"]'))return;
      const fresh = !pressed.has(event.code);
      if (fresh) justPressed.add(event.code);
      pressed.add(event.code);
      if (fresh && actionDown("pause")) {
        event.preventDefault?.();
        phase === "running" ? session.pause() : session.resume();
      }
      // A finished run must be replayable from the keyboard: there is no other restart control.
      if (fresh && actionDown("restart") && (phase === "won" || phase === "lost")) session.restart();
    };
    const onKeyUp = (event) => pressed.delete(event.code);
    const onBlur = () => { pressed.clear(); justPressed.clear(); };
    eventTarget?.addEventListener?.("keydown", onKeyDown);
    eventTarget?.addEventListener?.("keyup", onKeyUp);
    eventTarget?.addEventListener?.("blur", onBlur);

    const inputMap = { ...DEFAULT_INPUT, ...(spec.input || {}) };
    const actionDown = (action) => (inputMap[action] || []).some((code) => pressed.has(code));
    const actionPressed = (action) => (inputMap[action] || []).some((code) => justPressed.has(code));

    function createHud() {
      const parent = renderer?.domElement?.parentElement;
      if (!parent || typeof document === "undefined") return null;
      parent.style.position ||= "relative";
      const element = document.createElement("section");
      element.className = "bonzai-game-hud";
      element.setAttribute("aria-live", "polite");
      element.innerHTML = `
        <div class="bonzai-game-hud__status">
          <strong data-game-title></strong>
          <span data-game-objective></span>
        </div>
        <div class="bonzai-game-hud__metrics">
          <span>Health <b data-game-health></b></span>
          <span>Score <b data-game-score></b></span>
          <span data-game-time-wrap>Time <b data-game-time></b></span>
        </div>
        <div class="bonzai-game-hud__message" data-game-message hidden></div>`;
      parent.appendChild(element);
      return element;
    }

    function syncHud(message = "") {
      if (!hud) return;
      const activeGroup = clearGroups.find((group) => group.id === session.activeLevelId);
      const pending = objectives.find((objective) =>
        !objective.complete && (!activeGroup || activeGroup.objectiveIds.includes(objective.id)),
      );
      hud.querySelector("[data-game-title]").textContent = spec.title;
      hud.querySelector("[data-game-objective]").textContent =
        phase === "won" ? "Complete" : phase === "lost" ? "Run ended" : pending?.label || "";
      hud.querySelector("[data-game-health]").textContent = `${Math.ceil(state.health)}/${state.maxHealth}`;
      hud.querySelector("[data-game-score]").textContent = String(state.score);
      hud.querySelector("[data-game-time]").textContent = `${Math.floor(state.elapsed)}s`;
      const messageNode = hud.querySelector("[data-game-message]");
      messageNode.hidden = !message;
      messageNode.textContent = message;
      hud.dataset.phase = phase;
    }

    function updateObjectives(eventType, detail = {}) {
      if (phase !== 'running') return;
      for (const objective of objectives) {
        if (objective.complete) continue;
        let next = objective.progress;
        if (objective.type === "score") next = state.score;
        if (objective.type === "survive") next = state.elapsed;
        if (objective.type === "collect" && eventType === "collect" && (!objective.tag || objective.tag === detail.tag)) next += detail.amount || 1;
        if (objective.type === "defeat" && eventType === "defeat" && (!objective.tag || objective.tag === detail.tag)) next += detail.amount || 1;
        if (objective.type === "reach" && eventType === "reach" && objective.trigger === detail.id) next = objective.target;
        if (objective.type === "custom" && eventType === objective.event) next += detail.amount || 1;
        objective.progress = next;
        if (next >= objective.target) {
          objective.complete = true;
          emit("objective", { objective });
          syncHud(objective.completeMessage || objective.label);
        }
      }
      if (clearGroups.length) {
        for (const group of clearGroups) {
          if (group.complete || group.id !== session.activeLevelId) continue;
          const members = group.objectiveIds.map((id) => objectives.find((objective) => objective.id === id)).filter(Boolean);
          const complete = group.mode === "any" ? members.some((objective) => objective.complete) : members.every((objective) => objective.complete);
          if (!members.length || !complete) continue;
          group.complete = true;
          emit("level-clear", { group });
          if (group.nextLevelId) session.goToLevel(group.nextLevelId);
          else session.win(spec.winMessage || `${spec.title} complete`);
        }
      } else if (objectives.some((objective) => objective.required) &&
          objectives.filter((objective) => objective.required).every((objective) => objective.complete)) {
        session.win();
      }
    }

    function intersects(a, b) {
      if (!a?.object || !b?.object) return false;
      if (a.radius || b.radius) {
        const ar = a.radius || 0.5;
        const br = b.radius || 0.5;
        return a.object.getWorldPosition(new THREE.Vector3())
          .distanceToSquared(b.object.getWorldPosition(new THREE.Vector3())) <= (ar + br) ** 2;
      }
      return new THREE.Box3().setFromObject(a.object).intersectsBox(new THREE.Box3().setFromObject(b.object));
    }

    // Shared by the player and by behaviours, so enemies respect the same walls.
    function travel(actor, move) {
      if (collisions.solids.size) move.copy(collisions.move(actor.object, move, { radius: actor.radius, height: actor.height, levelId: session.activeLevelId }));
      else actor.object.position.add(move);
      if (move.lengthSq() > 1e-10) actor.object.rotation.y = Math.atan2(move.x, move.z);
      if (actor.id !== "player" && grounds.size) {
        const world = actor.object.getWorldPosition(new THREE.Vector3());
        actor.object.position.y += groundAt(world.x, world.z) - world.y + (actor.hover || 0);
      }
    }

    function tick({ deltaTime = 0, time = 0 } = {}) {
      if (disposed || phase !== "running") {
        justPressed.clear();
        return;
      }
      const dt = clamp(deltaTime, 0, 1 / 20);
      state.elapsed += dt;

      for (const actor of actors.values()) {
        actor.update?.({ dt, time, state, input: session.input, actor, game: session });
        if (phase !== 'running') { justPressed.clear(); return; }
      }

      const player = actors.get("player");
      if (player && player.controller !== false) {
        const move = new THREE.Vector3();
        if (autonomous?.enabled) {
          const pending = objectives.find((objective) => objective.required && !objective.complete);
          let target = null;
          if (pending?.type === "reach") target = triggers.get(pending.trigger);
          if (pending?.type === "collect" || pending?.type === "defeat") {
            target = [...actors.values()].find((actor) =>
              actor.id !== "player" &&
              actor.object.visible &&
              (!pending.tag || actor.tags.has(pending.tag)),
            );
          }
          if (target?.object) {
            const playerPosition = player.object.getWorldPosition(new THREE.Vector3());
            const targetPosition = target.object.getWorldPosition(new THREE.Vector3());
            const distance = playerPosition.distanceTo(targetPosition);
            if (distance > (target.radius || 0.65)) {
              move.copy(targetPosition.sub(playerPosition)).setY(0);
            } else if (pending?.type === "collect") {
              session.collect(target.id, 1, pending.tag);
            } else if (pending?.type === "defeat") {
              session.damage(target.id, autonomous.damage || 25, "companion");
            }
          }
        } else {
          move.set(
            Number(actionDown("right")) - Number(actionDown("left")),
            0,
            Number(actionDown("backward")) - Number(actionDown("forward")),
          );
        }
        if (move.lengthSq()) {
          move.normalize().multiplyScalar((player.speed ?? 3) * (actionDown("sprint") ? player.sprintMultiplier || 1.75 : 1) * dt);
          travel(player, move);
          emit("move", { actor: player, movement: move });
        }
        if (actionPressed("action")) {
          const playerPosition = player.object.getWorldPosition(new THREE.Vector3());
          const target = [...actors.values()]
            .filter((actor) => actor.id !== "player" && actor.object.visible)
            .map((actor) => ({
              actor,
              distance: playerPosition.distanceTo(actor.object.getWorldPosition(new THREE.Vector3())),
            }))
            .filter(({ distance }) => distance <= 2)
            .sort((a, b) => a.distance - b.distance)[0]?.actor;
          if (target) session.interact("player", target.id);
        }
        if (camera && player.camera !== false) {
          const target = player.object.getWorldPosition(new THREE.Vector3());
          const offset = player.cameraOffset || new THREE.Vector3(0, 3.2, 5.5);
          camera.position.lerp(target.clone().add(offset), clamp(dt * 5, 0, 1));
          controls?.target?.lerp(target.clone().add(new THREE.Vector3(0, 0.8, 0)), clamp(dt * 7, 0, 1));
        }
      }

      if (player?.gravity && player.controller !== false) {
        const feet = player.object.getWorldPosition(new THREE.Vector3());
        if (player.jump > 0 && player.grounded && actionPressed("jump")) {
          player.vy = Math.sqrt(2 * GRAVITY * player.jump);
          player.grounded = false;
          emit("jump", { actor: player });
        }
        player.vy = (player.vy || 0) - GRAVITY * dt;
        const floor = Math.max(groundAt(feet.x, feet.z), collisions.support(feet.x, feet.z, feet.y, { radius: player.radius, levelId: session.activeLevelId }));
        let y = feet.y + player.vy * dt;
        // Walking downhill follows the ground instead of repeatedly falling a few centimetres.
        if (y <= floor || player.grounded && player.vy <= 0 && y - floor < 0.4) { y = floor; player.vy = 0; player.grounded = true; }
        else player.grounded = false;
        player.object.position.y += y - feet.y;
        if (y < (spec.killY ?? -25) && !player.fell) { player.fell = true; emit("fall", { actor: player }); }
        if (phase !== "running") { justPressed.clear(); return; }
      }

      if (player) {
        const origin = player.object.getWorldPosition(new THREE.Vector3()), position = new THREE.Vector3(), step = new THREE.Vector3();
        for (const actor of actors.values()) {
          if (actor === player || actor.collected || actor.health === 0 || !(actor.pickup || actor.behavior || actor.contactDamage) || !shown(actor.object)) continue;
          actor.object.getWorldPosition(position);
          let distance = Math.hypot(origin.x - position.x, origin.z - position.z);
          const near = Math.abs(origin.y - position.y) < 2.5, behavior = actor.behavior;
          if (behavior?.type === "chase" && near && distance <= (behavior.range ?? 12) && distance > (behavior.stop ?? 0.7)) {
            step.set(origin.x - position.x, 0, origin.z - position.z).normalize().multiplyScalar(Math.min(distance, (behavior.speed ?? 2) * dt));
            travel(actor, step);
            distance -= step.length();
          } else if (behavior?.type === "patrol" && behavior.points?.length) {
            const target = behavior.points[(behavior.index ||= 0) % behavior.points.length];
            step.set(target[0] - actor.object.position.x, 0, target[2] - actor.object.position.z);
            if (step.length() < 0.15) behavior.index++;
            else travel(actor, step.normalize().multiplyScalar((behavior.speed ?? 2) * dt));
            distance = Math.hypot(origin.x - actor.object.position.x, origin.z - actor.object.position.z);
          }
          const reach = (actor.radius || 0.6) + (player.radius || 0.3);
          if (!near || distance > reach) continue;
          if (actor.pickup) {
            if (actor.heal) { player.health = clamp(player.health + actor.heal, 0, player.maxHealth); state.health = player.health; }
            session.collect(actor.id, 1, [...actor.tags][0]);
          } else if (actor.contactDamage && state.elapsed - (actor.lastHit ?? -Infinity) >= (actor.contactCooldown ?? 0.8)) {
            actor.lastHit = state.elapsed;
            session.damage("player", actor.contactDamage, actor.id);
          }
          if (phase !== "running") { justPressed.clear(); return; }
        }
      }

      for (const trigger of triggers.values()) {
        if (
          !player ||
          trigger.once && trigger.fired ||
          trigger.levelId && trigger.levelId !== session.activeLevelId ||
          trigger.cooldown && state.elapsed - (trigger.lastFired ?? -Infinity) < trigger.cooldown
        ) continue;
        if (intersects(player, trigger)) {
          trigger.fired = true;
          trigger.lastFired = state.elapsed;
          emit("reach", { id: trigger.id, trigger });
          updateObjectives("reach", { id: trigger.id });
          trigger.onEnter?.(session, trigger);
          if (phase !== 'running') break;
        }
      }

      if (phase === 'running') updateObjectives("tick");
      // A finished run keeps its result and replay hint on screen.
      if (phase === 'running') syncHud();
      justPressed.clear();
    }
    addUpdateCallback?.(tick);

    const session = {
      spec,
      state,
      objectives,
      actors,
      triggers,
      levels,
      interactions,
      solids: collisions.solids,
      solid: (id, object, options) => collisions.add(id, object, options),
      /** Height the player stands on: a number or (x, z) => y, optionally for one level. */
      ground(height, levelId = "") {
        if (typeof height !== "function" && !Number.isFinite(height)) throw new Error("GAME.ground requires a height or a (x, z) => height function");
        grounds.set(levelId, height);
        const player = actors.get("player");
        if (player) player.gravity = true;
        return session;
      },
      input: {
        down: actionDown,
        pressed: actionPressed,
        axis(negative, positive) {
          return Number(actionDown(positive)) - Number(actionDown(negative));
        },
      },
      agent(options = {}) {
        autonomous = {
          enabled: true,
          companionId: String(options.companionId || "companion"),
          damage: Number(options.damage || 25),
        };
        emit("agent-start", { ...autonomous });
        return session;
      },
      stopAgent() {
        if (autonomous) emit("agent-stop", { ...autonomous });
        autonomous = null;
        return session;
      },
      get agentic() {
        return autonomous ? { ...autonomous } : null;
      },
      get phase() { return phase; },
      on(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
        return () => listeners.get(type)?.delete(listener);
      },
      emit(type, detail = {}) {
        emit(type, detail);
        updateObjectives(type, detail);
      },
      start() {
        if (phase === "running") return session;
        phase = "running";
        startedAt = now();
        startLevelId = session.activeLevelId;
        hud ||= createHud();
        syncHud(spec.startMessage || "");
        emit("start", { startedAt });
        return session;
      },
      pause() {
        if (phase !== "running") return;
        phase = "paused";
        syncHud("Paused");
        emit("pause");
      },
      resume() {
        if (phase !== "paused" && phase !== "ready") return;
        phase = "running";
        syncHud();
        emit("resume");
      },
      restart() {
        for(const key of Object.keys(state))delete state[key];
        Object.assign(state, structuredClone(initialState));
        pressed.clear(); justPressed.clear(); checkpoints.clear();
        startedAt = now();
        objectives.forEach((objective) => {
          objective.progress = 0;
          objective.complete = false;
        });
        clearGroups.forEach((group) => { group.complete = false; });
        for (const actor of actors.values()) {
          if (actor.spawn) actor.object.position.copy(actor.spawn);
          if (actor.spawnQuaternion) actor.object.quaternion.copy(actor.spawnQuaternion);
          if (actor.spawnScale) actor.object.scale.copy(actor.spawnScale);
          actor.object.visible = actor.spawnVisible;
          actor.health = actor.maxHealth;
          actor.collected = false;
          actor.lastHit = undefined; actor.vy = 0; actor.fell = false;
          if (actor.behavior) actor.behavior.index = 0;
        }
        for(const trigger of triggers.values()){trigger.fired=false;trigger.lastFired=undefined;}
        if(startLevelId)session.goToLevel(startLevelId);
        phase = "running";
        syncHud();
        emit("restart");
      },
      actor(id, object, options = {}) {
        if (!id || !object?.isObject3D) throw new Error("GAME.actor requires an id and THREE.Object3D");
        const actor = {
          id,
          object,
          health: options.health ?? 100,
          maxHealth: options.health ?? 100,
          spawn: object.position.clone(),
          spawnQuaternion: object.quaternion.clone(),
          spawnScale: object.scale.clone(),
          spawnVisible: object.visible,
          ...options,
          tags: new Set(options.tags || []),
        };
        actors.set(id, actor);
        return actor;
      },
      player(object, options = {}) {
        const health=options.health??state.health;
        if(!Number.isFinite(health)||health<=0)throw Error('GAME player health must be a positive finite number');
        const cameraOffset=options.cameraOffset==null?undefined:finiteVector(options.cameraOffset,'cameraOffset');
        // The actor, HUD and restart snapshot must use the same health scale.
        state.health=health;initialState.health=health;
        state.maxHealth=health;initialState.maxHealth=health;
        const jump=options.jump??0;
        if(!Number.isFinite(jump)||jump<0)throw Error('GAME player jump must be a non-negative height in metres');
        // Space jumps when the player can jump, so it must stop doubling as the interact key.
        if(jump>0&&!spec.input?.action)inputMap.action=inputMap.action.filter(code=>code!=='Space');
        return session.actor("player", object, { tags: ["player"], ...options,health,cameraOffset,jump,gravity:options.gravity??(jump>0||grounds.size>0),grounded:true,vy:0 });
      },
      trigger(id, object, options = {}) {
        const trigger = { id, object, radius: 1, once: true, fired: false, ...options };
        triggers.set(id, trigger);
        return trigger;
      },
      interaction(sourceId, targetId, options = {}) {
        const key = `${sourceId}:${targetId}`;
        interactions.set(key, { sourceId, targetId, type: "activates", amount: 1, ...options });
        return interactions.get(key);
      },
      interact(sourceId, targetId) {
        const interaction = interactions.get(`${sourceId}:${targetId}`);
        if (!interaction) return false;
        if (interaction.type === "collects") session.collect(targetId, interaction.amount);
        if (interaction.type === "damages") session.damage(targetId, interaction.amount, sourceId);
        if (interaction.type === "unlocks") {
          actors.get(targetId)?.object?.traverse?.((node) => { node.visible = true; });
        }
        interaction.onInteract?.(session, interaction);
        session.emit("interaction", interaction);
        return true;
      },
      level(id, object, options = {}) {
        if (!id || !object?.isObject3D) {
          throw new Error("GAME.level requires an id and THREE.Object3D");
        }
        const level = { id, object, ...options,entry:options.entry==null?new THREE.Vector3():finiteVector(options.entry,'level entry') };
        levels.set(id, level);
        object.visible = levels.size === 1;
        if(levels.size===1)session.activeLevelId=id;
        return level;
      },
      goToLevel(id) {
        const next = levels.get(id);
        if (!next) throw new Error(`Unknown game level ${id}`);
        for (const level of levels.values()) level.object.visible = level.id === id;
        const player = actors.get("player");
        if (player && next.entry) player.object.position.copy(next.entry);
        if (player) { player.vy = 0; player.grounded = true; player.fell = false; }
        session.activeLevelId = id;
        emit("level-change", { id, level: next });
        return next;
      },
      activeLevelId: null,
      collect(id, amount = 1, tag = "collectible") {
        const actor = actors.get(id);
        if (!actor || actor.collected) return false;
        actor.collected = true;
        actor.object.visible = false;
        state.score += actor.score || amount;
        session.emit("collect", { id, tag, amount });
        return true;
      },
      damage(id, amount, source = null) {
        const actor = actors.get(id);
        if (!actor) return 0;
        actor.health = clamp(actor.health - amount, 0, actor.maxHealth);
        if (id === "player") state.health = actor.health;
        emit("damage", { actor, amount, source });
        if (actor.health === 0) {
          actor.object.visible = false;
          if (id === "player") session.lose("You were defeated");
          emit("defeat", { actor, tag: [...actor.tags][0] });
          updateObjectives("defeat", { tag: [...actor.tags][0] });
        }
        return actor.health;
      },
      score(amount, reason = "") {
        state.score += amount;
        emit("score", { amount, reason, score: state.score });
        updateObjectives("score");
        return state.score;
      },
      checkpoint(id) {
        const player = actors.get("player");
        checkpoints.set(id, {
          state: structuredClone(state),
          position: player?.object.position.clone(),
        });
      },
      restore(id) {
        const point = checkpoints.get(id);
        if (!point) return false;
        Object.assign(state, structuredClone(point.state));
        if (point.position && actors.get("player")) actors.get("player").object.position.copy(point.position);
        syncHud();
        return true;
      },
      win(message = spec.winMessage || "Objective complete") {
        if (phase === "won" || phase === "lost" || disposed) return;
        phase = "won";
        syncHud(`${message} · Press R to play again`);
        emit("win", { score: state.score, elapsed: state.elapsed });
      },
      lose(message = spec.loseMessage || "Run ended") {
        if (phase === "lost" || phase === "won" || disposed) return;
        phase = "lost";
        syncHud(`${message} · Press R to try again`);
        emit("lose", { score: state.score, elapsed: state.elapsed });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        phase = "disposed";
        eventTarget?.removeEventListener?.("keydown", onKeyDown);
        eventTarget?.removeEventListener?.("keyup", onKeyUp);
        eventTarget?.removeEventListener?.("blur", onBlur);
        hud?.remove();
        listeners.clear();
        actors.clear();
        triggers.clear();
        interactions.clear();
        levels.clear(); checkpoints.clear(); collisions.clear(); grounds.clear();
        sessions.delete(session);
        if (active === session) active = null;
      },
    };

    sessions.add(session);
    active = session;
    return session;
  }

  return {
    create,
    validate: validateGameSpec,
    get active() { return active; },
    dispose() {
      for (const session of [...sessions]) session.dispose();
    },
  };
}
