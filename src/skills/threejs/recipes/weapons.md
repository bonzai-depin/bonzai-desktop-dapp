# Weapon Patterns (Sword/Dagger/Staff/Axe)
- Blade: ExtrudeGeometry from Shape (pointed profile), MeshPhysicalMaterial with metalness:0.95
- Handle: CylinderGeometry with TubeGeometry wrapping for grip texture
- Guard: TorusGeometry or extruded Shape for crossguard
- Pommel: SphereGeometry or gem (OctahedronGeometry with H.gem material)
- Staff: TubeGeometry along CatmullRomCurve3, crystal/orb at top
- Axe: ExtrudeGeometry crescent shape + cylinder handle
- Effects: emissive edge glow, H.sparks() along blade, runic engravings via ShaderMaterial
- Vary: curved/straight, single/double edge, ornate/minimal, elemental themes
