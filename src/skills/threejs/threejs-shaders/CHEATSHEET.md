# Shaders
## ShaderMaterial
ShaderMaterial({uniforms:{name:{value}}, vertexShader, fragmentShader, transparent, side, depthTest, depthWrite, blending, extensions:{derivatives,fragDepth}})
Built-in uniforms: modelMatrix, modelViewMatrix, projectionMatrix, viewMatrix, normalMatrix, cameraPosition
Built-in attributes: position, normal, uv
## RawShaderMaterial — no built-ins, you declare everything
## Uniform Types
float→Number, vec2→Vector2, vec3→Vector3/Color, vec4→Vector4, mat4→Matrix4, sampler2D→Texture
Update: material.uniforms.name.value = newVal
## Varyings
Vertex: varying vec2 vUv; vUv=uv;
Fragment: varying vec2 vUv; texture2D(sampler, vUv)
## GLSL Math
abs sign floor ceil fract mod min max clamp mix step smoothstep
sin cos tan asin acos atan pow exp log sqrt
## GLSL Vector
length distance dot cross normalize reflect refract
## Texture Sampling
GLSL 1.0: texture2D(sampler, coord) textureCube(sampler, coord)
GLSL 3.0 (glslVersion:THREE.GLSL3): texture() — use out vec4 fragColor instead of gl_FragColor
## Common Patterns
Fresnel: pow(1.0-dot(viewDir,normal), power)
Noise: fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5453)
Gradient: mix(colorA, colorB, vUv.y)
Rim: pow(1.0-max(0.0,dot(normalize(-viewPos),normal)), power)
Dissolve: if(noise<progress) discard; edge=smoothstep(progress,progress+0.1,noise)
Vertex displacement: pos.z += sin(pos.x*freq+time)*amplitude
## onBeforeCompile (extend built-in materials)
material.onBeforeCompile = (shader) => { shader.uniforms.time={value:0}; shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '...custom...') }
Injection: #include <begin_vertex>, #include <project_vertex>, #include <color_fragment>, #include <output_fragment>
