/**
 * LightningBolt — visible lightning arc + impact flash.
 *
 * A single strike renders a procedurally-generated jagged line
 * (`BufferGeometry` with N control points, lateral noise per point)
 * drawn additively, plus an impact halo disc on the ground and a
 * short burst of upward particles. The geometry lives for ~0.15s,
 * then fades and resets, awaiting the next strike.
 *
 * Call `.strike(origin, target)` at strike time. `update(dt)` each
 * frame advances the fade.
 *
 * See /src/skills/threejs/recipes/lightning.md for the full 3-phase
 * pattern (anticipation + arc + explosion). This is a simplified v1
 * that covers phase 2 (arc) + phase 3 (explosion) — no anticipation
 * ring yet, but the visual improvement over "invisible strike" is
 * already substantial.
 */
import * as THREE from "three";

export class LightningBolt {
  constructor({ color = 0xd0e8ff, maxStrikes = 3 } = {}) {
    this.color = new THREE.Color(color);
    this.group = new THREE.Group();
    this.group.name = "LightningBolts";
    this.group.userData.excludeFromBBox = true;
    this._active = [];
    this._maxStrikes = maxStrikes;
  }

  /**
   * Build the arc line geometry from origin (sky) to target (ground)
   * with lateral noise at each segment — a convincing jagged bolt.
   */
  _buildArc(origin, target, segments = 22) {
    const pts = [];
    const dir = target.clone().sub(origin);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = origin.clone().addScaledVector(dir, t);
      // Lateral noise — peak in the middle, zero at endpoints.
      const jitter = Math.sin(t * Math.PI);
      p.x += (Math.random() - 0.5) * 0.8 * jitter;
      p.z += (Math.random() - 0.5) * 0.8 * jitter;
      p.y += (Math.random() - 0.5) * 0.2 * jitter;
      pts.push(p);
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    return geom;
  }

  /**
   * Trigger a strike from sky `origin` to ground `target`.
   */
  strike(origin, target) {
    // Cap concurrent strikes.
    while (this._active.length >= this._maxStrikes) {
      this._disposeStrike(this._active.shift());
    }
    const geom = this._buildArc(origin, target);
    const mat = new THREE.LineBasicMaterial({
      color: this.color,
      linewidth: 3,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geom, mat);
    line.userData.excludeFromBBox = true;

    // Impact halo disc at ground (additive ring shader).
    const haloGeom = new THREE.CircleGeometry(1.2, 40);
    const haloMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.copy(target).add(new THREE.Vector3(0, 0.02, 0));
    halo.userData.excludeFromBBox = true;

    // Explosion — 24 upward-spraying particles with gravity decay.
    const expCount = 24;
    const expGeom = new THREE.BufferGeometry();
    const epos = new Float32Array(expCount * 3);
    const evel = new Float32Array(expCount * 3);
    for (let i = 0; i < expCount; i++) {
      epos[i * 3]     = target.x;
      epos[i * 3 + 1] = target.y + 0.05;
      epos[i * 3 + 2] = target.z;
      const a = (i / expCount) * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      evel[i * 3]     = Math.cos(a) * speed * (0.5 + Math.random() * 0.5);
      evel[i * 3 + 1] = 2 + Math.random() * 3;
      evel[i * 3 + 2] = Math.sin(a) * speed * (0.5 + Math.random() * 0.5);
    }
    expGeom.setAttribute("position", new THREE.BufferAttribute(epos, 3));
    const expMat = new THREE.PointsMaterial({
      color: this.color,
      size: 0.12,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const exp = new THREE.Points(expGeom, expMat);
    exp.userData.excludeFromBBox = true;

    this.group.add(line);
    this.group.add(halo);
    this.group.add(exp);

    this._active.push({
      line, halo, exp,
      expGeom, expVel: evel,
      age: 0,
      duration: 0.6,        // total lifetime
      arcDuration: 0.12,    // arc visible for first 120ms
    });
  }

  update(dt) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      const s = this._active[i];
      s.age += dt;
      // Arc fade — fully visible for arcDuration, then rapid fade.
      if (s.age < s.arcDuration) {
        s.line.material.opacity = 1;
      } else {
        const t = (s.age - s.arcDuration) / (s.duration - s.arcDuration);
        s.line.material.opacity = Math.max(0, 1 - t * 2.5);
      }
      // Halo expands + fades.
      const hT = s.age / s.duration;
      s.halo.scale.set(1 + hT * 3, 1 + hT * 3, 1);
      s.halo.material.opacity = Math.max(0, 0.8 - hT * 0.95);
      // Explosion particles — apply velocity + gravity, fade out.
      const arr = s.expGeom.attributes.position.array;
      const vel = s.expVel;
      for (let j = 0; j < arr.length / 3; j++) {
        arr[j * 3]     += vel[j * 3]     * dt;
        arr[j * 3 + 1] += vel[j * 3 + 1] * dt;
        arr[j * 3 + 2] += vel[j * 3 + 2] * dt;
        vel[j * 3 + 1] -= 9 * dt;       // gravity
      }
      s.expGeom.attributes.position.needsUpdate = true;
      s.exp.material.opacity = Math.max(0, 0.9 - hT * 1.1);
      // Retire.
      if (s.age >= s.duration) {
        this._disposeStrike(s);
        this._active.splice(i, 1);
      }
    }
  }

  _disposeStrike(s) {
    this.group.remove(s.line);
    this.group.remove(s.halo);
    this.group.remove(s.exp);
    s.line.geometry.dispose();       s.line.material.dispose();
    s.halo.geometry.dispose();       s.halo.material.dispose();
    s.expGeom.dispose();             s.exp.material.dispose();
  }

  dispose() {
    for (const s of this._active) this._disposeStrike(s);
    this._active.length = 0;
  }
}
