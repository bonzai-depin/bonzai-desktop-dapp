# Vessel Patterns (Vial/Bottle/Chalice/Cauldron)
- Body: LatheGeometry with curved Vector2 profile (base→body→neck→lip)
- Glass: MeshPhysicalMaterial with transmission:0.95, ior:1.5, depthWrite:false
- Liquid: SEPARATE LatheGeometry (body profile scaled x*0.80, fills 75% height). Use MeshStandardMaterial with opacity:0.85 + emissive glow. Add liquid mesh FIRST, glass SECOND
- Cork/stopper: CylinderGeometry at neck
- Inner glow: PointLight inside liquid volume
- Bubbles: H.bubbles() with small spread INSIDE bottle walls
- Vary: round/tall/diamond/flask shapes, ornate bases, decorative neck rings, hanging charms
