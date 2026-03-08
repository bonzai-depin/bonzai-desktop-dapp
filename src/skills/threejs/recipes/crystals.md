# Crystal Patterns (Gem/Cluster/Formation/Prism)
- Single crystal: OctahedronGeometry or IcosahedronGeometry, scale.set(0.7, 1.5, 0.7) for elongation
- Cluster: multiple crystals at random positions/rotations/scales around a rock base
- Gemstone: DodecahedronGeometry with non-uniform scale for faceted cut
- Inner glow: PointLight inside crystal, or emissive with pulsing emissiveIntensity
- Refraction: MeshPhysicalMaterial({transmission:0.9, ior:2.0, thickness:1, roughness:0, color})
- Energy: ShaderMaterial with fresnel glow, floating H.sparks() orbiting crystal
- Colors: amethyst(0x9966cc), emerald(0x00cc66), ruby(0xcc0033), sapphire(0x0066ff), obsidian(0x111111)
- Vary: single/cluster, floating/grounded, glowing/dark, elemental infusion, geometric/organic
