import { parse } from 'acorn';
import { simple } from 'acorn-walk';

// A Path describes a contour; filled and extruded geometry requires a Shape.
// Convert locally at the geometry boundary, preserving curves and holes.
export function generatedThreeAPI(THREE) {
  const shape = value => {
    if (Array.isArray(value)) return value.map(shape);
    if (value?.isShape || typeof value?.extractPoints === 'function') return value;
    if (value instanceof THREE.Path) {
      const result = new THREE.Shape();
      result.curves = value.curves.slice();
      result.autoClose = value.autoClose;
      result.currentPoint.copy(value.currentPoint);
      result.holes = value.holes?.slice() || [];
      return result;
    }
    return value;
  };
  return { ...THREE,
    // Construction helpers return complete scene objects. Some generated code
    // treats them as geometry; clone the complete assembly instead of handing
    // it to Mesh.updateMorphTargets (which expects geometry.morphAttributes).
    // Never mutate the shared helper result or Three's global constructors.
    Mesh: class extends THREE.Mesh {
      constructor(geometry, material) {
        if (geometry?.isObject3D) {
          const object = geometry.clone(true);
          if (material != null) object.traverse(child => { if (child.isMesh) child.material = material; });
          return object;
        }
        super(geometry, material);
      }
    },
    // Generated instancing code often uses Object3D-style rotations on Matrix4.
    // Compose a local rotation instead of resetting its existing translation
    // (makeRotationY would scatter every instance back at the origin).
    Matrix4: class extends THREE.Matrix4 {
      rotateX(angle) { return this.multiply(new THREE.Matrix4().makeRotationX(angle)); }
      rotateY(angle) { return this.multiply(new THREE.Matrix4().makeRotationY(angle)); }
      rotateZ(angle) { return this.multiply(new THREE.Matrix4().makeRotationZ(angle)); }
    },
    ShapeGeometry: class extends THREE.ShapeGeometry {
      constructor(shapes, segments) { super(shape(shapes), segments); }
    },
    ExtrudeGeometry: class extends THREE.ExtrudeGeometry {
      constructor(shapes, options) { super(shape(shapes), options); }
    },
  };
}

// Repair only an actual undeclared assignment reported by the JS runtime.
// AST positions prevent changing strings/comments/property names or guessing
// the intended value of an unknown identifier used as an input.
export function repairUndeclaredAssignment(code, error) {
  const name = /^([A-Za-z_$][\w$]*) is not defined$/.exec(error?.message || '')?.[1];
  if (!name || error?.name !== 'ReferenceError') return null;
  try {
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true });
    const assignments = [];
    simple(ast, { ExpressionStatement(node) {
      const e = node.expression;
      if (e.type === 'AssignmentExpression' && e.operator === '=' && e.left.type === 'Identifier' && e.left.name === name) assignments.push(node);
    } });
    if (assignments.length !== 1) return null;
    const position = assignments[0].start;
    return code.slice(0, position) + 'let ' + code.slice(position);
  } catch { return null; }
}

// A corrected scene may expose another error. Re-run the real renderer after
// every edit, cap attempts, and never treat merely valid syntax as completion.
export async function renderWithRecovery({ code, render, repair, onAttempt = () => {}, maxRepairs = 3 }) {
  let current = code;
  const failures = [];
  const seen = new Set([code]);
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    try { return { code: current, result: await render(current), failures }; }
    catch (error) {
      failures.push(error.message);
      if (attempt === maxRepairs) {
        error.generatedCode = current; error.generationFailures = failures;
        throw error;
      }
      onAttempt({ attempt: attempt + 1, error });
      let next = repairUndeclaredAssignment(current, error);
      try { if (!next) next = await repair({ code: current, error, failures: [...failures], attempt: attempt + 1 }); }
      catch (repairError) { repairError.generatedCode = current; repairError.generationFailures = [...failures, repairError.message]; throw repairError; }
      if (!next || seen.has(next)) {
        const repeated = new Error(`Scene repair made no progress: ${error.message}`);
        repeated.generatedCode = current; repeated.generationFailures = failures;
        throw repeated;
      }
      seen.add(next); current = next;
    }
  }
}

// Models sometimes wrap construction in a fire-and-forget async IIFE. Await
// only these explicit async calls in an async scope; never rewrite animation
// callbacks or guess whether an arbitrary call returns a promise.
export function awaitSceneConstruction(code) {
  let ast;
  try { ast=parse(code,{ecmaVersion:'latest',sourceType:'module'}); }
  catch { return code; } // Existing syntax validation/repair owns malformed source.
  const positions=[];
  const visit=(node,asyncScope=false)=>{
    if(!node||typeof node!=='object')return;
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type))asyncScope=!!node.async;
    if(asyncScope&&node.type==='ExpressionStatement'){
      const call=node.expression,fn=call?.callee;
      if(call?.type==='CallExpression'&&['FunctionExpression','ArrowFunctionExpression'].includes(fn?.type)&&fn.async)positions.push(call.start);
    }
    for(const [key,value] of Object.entries(node)){
      if(key==='start'||key==='end')continue;
      if(Array.isArray(value))value.forEach(child=>visit(child,asyncScope));
      else if(value&&typeof value==='object')visit(value,asyncScope);
    }
  };
  visit(ast);
  for(const position of positions.sort((a,b)=>b-a))code=code.slice(0,position)+'await '+code.slice(position);
  return code;
}
