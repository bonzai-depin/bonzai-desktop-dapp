// Horizontal swept AABB movement for the default grounded GAME controller.
// Register individual solid pieces, not a hollow building's envelope. Slopes,
// jumping and rigid-body simulation belong to P/custom player controllers.
export function createGameCollisions(THREE) {
  const solids = new Map();
  const body = new THREE.Box3(), position = new THREE.Vector3(), destination = new THREE.Vector3();
  const worldStep = new THREE.Vector3(), accepted = new THREE.Vector3();
  const epsilon = 1e-5;
  function visible(node) {
    for (let current = node; current; current = current.parent) if (!current.visible) return false;
    return true;
  }
  return {
    solids,
    add(id, object, options = {}) {
      if (!id || !object?.isObject3D) throw Error('GAME.solid requires an id and THREE.Object3D');
      object.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty() || !bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite)) throw Error('GAME.solid requires finite visible geometry');
      const solid = { id, object, bounds, levelId: options.levelId };
      solids.set(id, solid); return solid;
    },
    move(object, delta, { radius = .3, height = 1.6, levelId } = {}) {
      if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(height) || height <= 0 || !delta.toArray().every(Number.isFinite)) throw Error('GAME player collision dimensions and movement must be finite');
      object.updateWorldMatrix(true, true);object.getWorldPosition(position);
      body.setFromObject(object);
      // Abstract controller groups still need a bounded footprint.
      if (body.isEmpty()) {
        body.min.set(position.x-radius,position.y,position.z-radius);
        body.max.set(position.x+radius,position.y+height,position.z+radius);
      }
      for (const solid of solids.values()) {
        solid.object.updateWorldMatrix(true,true);
        solid.bounds.setFromObject(solid.object);
      }
      accepted.set(0,0,0);
      for (const axis of ['x','z']) {
        const other = axis === 'x' ? 'z' : 'x';
        let distance = delta[axis];
        for (const solid of solids.values()) {
          const box = solid.bounds;
          if (!visible(solid.object) || solid.levelId && solid.levelId !== levelId || box.isEmpty()) continue;
          if (body.max.y <= box.min.y+epsilon || body.min.y >= box.max.y-epsilon || body.max[other] <= box.min[other]+epsilon || body.min[other] >= box.max[other]-epsilon) continue;
          if (distance > 0 && body.max[axis] <= box.min[axis]+epsilon) distance = Math.min(distance,Math.max(0,box.min[axis]-body.max[axis]-epsilon));
          if (distance < 0 && body.min[axis] >= box.max[axis]-epsilon) distance = Math.max(distance,Math.min(0,box.max[axis]-body.min[axis]+epsilon));
        }
        accepted[axis] = distance;
        worldStep.set(0,0,0);worldStep[axis]=distance;body.translate(worldStep);
      }
      destination.copy(position).add(accepted);
      if(object.parent)object.parent.worldToLocal(destination);
      object.position.copy(destination);object.updateWorldMatrix(false,true);
      return accepted;
    },
    clear() { solids.clear(); },
  };
}
