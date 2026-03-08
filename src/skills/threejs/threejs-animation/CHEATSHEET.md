# Animation
## Procedural (most common for generated objects)
Clock() → delta=clock.getDelta() elapsed=clock.getElapsedTime()
mesh.rotation.y += delta * speed
mesh.position.y = Math.sin(elapsed) * amplitude
Circular: pos.x=cos(t)*r, pos.z=sin(t)*r
Bounce: pos.y=abs(sin(t*speed))*height
## AnimationClip System
AnimationClip(name, duration, tracks[])
AnimationMixer(rootObject) → mixer.update(delta) per frame
AnimationAction = mixer.clipAction(clip) → .play() .stop() .reset() .fadeIn(dur) .fadeOut(dur)
## KeyframeTrack Types
NumberKeyframeTrack('.property', times[], values[])
VectorKeyframeTrack('.position', times[], [x0,y0,z0, x1,y1,z1, ...])
QuaternionKeyframeTrack('.quaternion', times[], [x0,y0,z0,w0, ...])
ColorKeyframeTrack('.material.color', times[], [r0,g0,b0, r1,g1,b1, ...])
BooleanKeyframeTrack('.visible', times[], [true, false, ...])
## Interpolation
track.setInterpolation(THREE.InterpolateLinear|InterpolateSmooth|InterpolateDiscrete)
## Action Properties
.timeScale(neg=reverse) .weight(0-1) .clampWhenFinished=true
.loop: LoopRepeat|LoopOnce|LoopPingPong .repetitions=Infinity
.blendMode: NormalAnimationBlendMode|AdditiveAnimationBlendMode
## Crossfade
action1.crossFadeTo(action2, duration, warpBoolean)
## Morph Target Animation
mesh.morphTargetInfluences[index] = 0..1
NumberKeyframeTrack('.morphTargetInfluences[name]', times, values)
## Procedural Patterns
Lerp: current.lerp(target, alpha)
Spring: force = -stiffness*(pos-target), damping = -damping*velocity
Oscillation: sin(t*freq)*amp, abs(sin(t))*amp (bounce)
