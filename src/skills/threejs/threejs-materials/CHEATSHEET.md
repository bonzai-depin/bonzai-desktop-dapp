# Materials
## MeshBasicMaterial (no lighting)
{color, map, alphaMap, envMap, reflectivity, wireframe, transparent, opacity, side, fog}
## MeshLambertMaterial (diffuse only)
{color, emissive, emissiveIntensity, map, emissiveMap, envMap, reflectivity}
## MeshPhongMaterial (specular)
{color, specular, shininess(0-1000), emissive, flatShading, map, specularMap, normalMap, normalScale:Vec2, bumpMap, bumpScale, displacementMap, displacementScale}
## MeshStandardMaterial (PBR — recommended)
{color, roughness(0-1), metalness(0-1), map, roughnessMap, metalnessMap, normalMap, normalScale:Vec2, aoMap, aoMapIntensity, displacementMap, displacementScale, emissive, emissiveIntensity, emissiveMap, envMap, envMapIntensity, flatShading, wireframe}
## MeshPhysicalMaterial (extends Standard)
clearcoat(0-1), clearcoatRoughness, transmission(0-1), thickness, ior(1-2.333), attenuationDistance, attenuationColor
sheen(0-1), sheenRoughness, sheenColor, iridescence(0-1), iridescenceIOR, iridescenceThicknessRange:[min,max]
anisotropy(0-1), anisotropyRotation, specularIntensity, specularColor
Glass: {transmission:1, thickness:0.5, ior:1.5, roughness:0, metalness:0}
## MeshToonMaterial
{color, gradientMap} — cel-shaded cartoon
## ShaderMaterial
{uniforms:{name:{value}}, vertexShader, fragmentShader, transparent, side, depthTest, depthWrite, blending}
Built-in: modelMatrix, modelViewMatrix, projectionMatrix, viewMatrix, normalMatrix, cameraPosition
Attributes: position, normal, uv
## RawShaderMaterial — no built-in uniforms/attributes
## PointsMaterial
{color, size, sizeAttenuation, map, alphaMap, transparent, alphaTest, vertexColors}
## LineBasicMaterial / LineDashedMaterial
{color, linewidth} | {color, dashSize, gapSize, scale}
## Common Properties
side: FrontSide|BackSide|DoubleSide
blending: NormalBlending|AdditiveBlending|SubtractiveBlending|MultiplyBlending
transparent, opacity(0-1), alphaTest, depthTest, depthWrite, visible
.clone() .dispose() .needsUpdate=true
