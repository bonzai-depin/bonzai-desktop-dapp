# Mechanical Patterns (Gear/Clockwork/Piston/Machine)
- Gear: ExtrudeGeometry from Shape with tooth profile loop, center hole via shape.holes
- Axle: CylinderGeometry through gear center
- Piston: CylinderGeometry body + thinner rod, animate rod.position.y with sin(time)
- Clockwork: multiple interlocking gears with inverse rotation ratios
- Spring/coil: TubeGeometry with helical CatmullRomCurve3 path
- Materials: brass(color:0xb5a642, metalness:0.9), steel(color:0x888899, metalness:0.95), copper(color:0xb87333)
- Vary: simple/complex mechanisms, steam effects(H.smoke), sparking contacts(H.sparks), spinning flywheel
