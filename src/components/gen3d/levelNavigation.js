import * as THREE from 'three';

// Camera-only exploration. It deliberately does not imply player collision or
// gravity; playable games retain ownership of their own input and camera.
export function createLevelNavigation({ camera, element, orbit, events = window }) {
  const keys = new Set(), forward = new THREE.Vector3(), right = new THREE.Vector3(), motion = new THREE.Vector3();
  const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  let enabled = false, dragging = false, pointer = null, speed = 8;
  const moves = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','ShiftLeft','ShiftRight']);
  const endDrag = () => { dragging = false; if(pointer !== null && element.hasPointerCapture?.(pointer)) element.releasePointerCapture(pointer);pointer=null; };
  const clear = () => { keys.clear(); endDrag(); };
  function down(event) { if (!enabled || element.ownerDocument.activeElement !== element || !moves.has(event.code)) return; event.preventDefault(); keys.add(event.code); }
  function up(event) { keys.delete(event.code); }
  function start(event) { if(!enabled || ![0,2].includes(event.button))return;event.preventDefault();element.focus({preventScroll:true});dragging=true;pointer=event.pointerId;element.setPointerCapture?.(pointer); }
  function look(event) { if(!enabled || !dragging)return;rotation.setFromQuaternion(camera.quaternion,'YXZ');rotation.y-=event.movementX*.003;rotation.x=THREE.MathUtils.clamp(rotation.x-event.movementY*.003,-Math.PI/2+.02,Math.PI/2-.02);camera.quaternion.setFromEuler(rotation); }
  function context(event) { if(enabled)event.preventDefault(); }
  element.tabIndex=0;
  element.addEventListener('pointerdown',start);element.addEventListener('pointermove',look);element.addEventListener('pointerup',endDrag);element.addEventListener('pointercancel',endDrag);element.addEventListener('blur',clear);element.addEventListener('contextmenu',context);
  events.addEventListener('keydown',down);events.addEventListener('keyup',up);events.addEventListener('blur',clear);
  return {
    get enabled(){return enabled;},
    setEnabled(value) { const wasEnabled=enabled;enabled=!!value;clear();orbit.enabled=!enabled;orbit.autoRotate=false;if(!enabled && wasEnabled){camera.getWorldDirection(forward);orbit.target.copy(camera.position).addScaledVector(forward,Math.max(2,speed));orbit.update();} },
    setSpeed(value) { speed=THREE.MathUtils.clamp(Number(value)||8,1,100); },
    update(dt) {
      if(!enabled || element.ownerDocument.activeElement !== element || !keys.size)return;
      camera.getWorldDirection(forward);right.crossVectors(forward,camera.up).normalize();motion.set(0,0,0);
      if(keys.has('KeyW') || keys.has('ArrowUp'))motion.add(forward);
      if(keys.has('KeyS') || keys.has('ArrowDown'))motion.sub(forward);
      if(keys.has('KeyD') || keys.has('ArrowRight'))motion.add(right);
      if(keys.has('KeyA') || keys.has('ArrowLeft'))motion.sub(right);
      if(keys.has('KeyE'))motion.y+=1;if(keys.has('KeyQ'))motion.y-=1;
      motion.normalize().multiplyScalar(Math.min(Math.max(dt,0),.05)*speed*(keys.has('ShiftLeft')||keys.has('ShiftRight')?3:1));camera.position.add(motion);
    },
    dispose() {clear();element.removeEventListener('pointerdown',start);element.removeEventListener('pointermove',look);element.removeEventListener('pointerup',endDrag);element.removeEventListener('pointercancel',endDrag);element.removeEventListener('blur',clear);element.removeEventListener('contextmenu',context);events.removeEventListener('keydown',down);events.removeEventListener('keyup',up);events.removeEventListener('blur',clear);},
  };
}
