const DEFAULT_INPUT = {
  forward: ["KeyW", "ArrowUp"],
  backward: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  action: ["KeyE", "Space"],
  pause: ["Escape"],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
  for (const [index, objective] of (spec.objectives || []).entries()) {
    if (!objective?.id) errors.push(`objectives[${index}].id is required`);
    if (!["collect", "score", "defeat", "reach", "survive", "custom"].includes(objective?.type)) {
      errors.push(`objectives[${index}].type is unsupported`);
    }
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
    const state = { ...initialState };
    const objectives = (spec.objectives || []).map((objective) => ({
      target: 1,
      progress: 0,
      required: true,
      ...objective,
      complete: false,
    }));
    const clearGroups = (spec.clearGroups || []).map((group) => ({ mode: "all", objectiveIds: [], ...group, complete: false }));
    const checkpoints = new Map();
    let autonomous = null;
    let phase = "ready";
    let disposed = false;
    let startedAt = 0;
    let hud = null;

    const emit = (type, detail = {}) => {
      for (const listener of listeners.get(type) || []) listener(detail, session);
      for (const listener of listeners.get("*") || []) listener({ type, ...detail }, session);
    };

    const onKeyDown = (event) => {
      const fresh = !pressed.has(event.code);
      if (fresh) justPressed.add(event.code);
      pressed.add(event.code);
      if (fresh && actionDown("pause")) {
        event.preventDefault?.();
        phase === "running" ? session.pause() : session.resume();
      }
    };
    const onKeyUp = (event) => pressed.delete(event.code);
    eventTarget?.addEventListener?.("keydown", onKeyDown);
    eventTarget?.addEventListener?.("keyup", onKeyUp);

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

    function tick({ deltaTime = 0, time = 0 } = {}) {
      if (disposed || phase !== "running") {
        justPressed.clear();
        return;
      }
      const dt = clamp(deltaTime, 0, 1 / 20);
      state.elapsed += dt;

      for (const actor of actors.values()) {
        actor.update?.({ dt, time, state, input: session.input, actor, game: session });
      }

      const player = actors.get("player");
      if (player?.controller !== false) {
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
          move.normalize().multiplyScalar((player.speed || 3) * (actionDown("sprint") ? player.sprintMultiplier || 1.75 : 1) * dt);
          player.object.position.add(move);
          player.object.rotation.y = Math.atan2(move.x, move.z);
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

      for (const trigger of triggers.values()) {
        if (
          !player ||
          trigger.once && trigger.fired ||
          trigger.levelId && trigger.levelId !== session.activeLevelId
        ) continue;
        if (intersects(player, trigger)) {
          trigger.fired = true;
          emit("reach", { id: trigger.id, trigger });
          updateObjectives("reach", { id: trigger.id });
          trigger.onEnter?.(session, trigger);
        }
      }

      updateObjectives("tick");
      syncHud();
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
        Object.assign(state, initialState);
        objectives.forEach((objective) => {
          objective.progress = 0;
          objective.complete = false;
        });
        clearGroups.forEach((group) => { group.complete = false; });
        for (const actor of actors.values()) {
          if (actor.spawn) actor.object.position.copy(actor.spawn);
          actor.object.visible = true;
          actor.health = actor.maxHealth;
        }
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
          ...options,
          tags: new Set(options.tags || []),
        };
        actors.set(id, actor);
        return actor;
      },
      player(object, options = {}) {
        return session.actor("player", object, { tags: ["player"], ...options });
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
        const level = { id, object, entry: new THREE.Vector3(), ...options };
        levels.set(id, level);
        object.visible = levels.size === 1;
        return level;
      },
      goToLevel(id) {
        const next = levels.get(id);
        if (!next) throw new Error(`Unknown game level ${id}`);
        for (const level of levels.values()) level.object.visible = level.id === id;
        const player = actors.get("player");
        if (player && next.entry) player.object.position.copy(next.entry);
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
          emit("defeat", { actor, tag: [...actor.tags][0] });
          updateObjectives("defeat", { tag: [...actor.tags][0] });
          if (id === "player") session.lose("You were defeated");
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
        if (phase === "won") return;
        phase = "won";
        syncHud(message);
        emit("win", { score: state.score, elapsed: state.elapsed });
      },
      lose(message = spec.loseMessage || "Run ended") {
        if (phase === "lost") return;
        phase = "lost";
        syncHud(message);
        emit("lose", { score: state.score, elapsed: state.elapsed });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        phase = "disposed";
        eventTarget?.removeEventListener?.("keydown", onKeyDown);
        eventTarget?.removeEventListener?.("keyup", onKeyUp);
        hud?.remove();
        listeners.clear();
        actors.clear();
        triggers.clear();
        interactions.clear();
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
