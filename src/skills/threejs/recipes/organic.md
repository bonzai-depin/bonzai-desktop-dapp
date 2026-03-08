# Organic Patterns (Tree/Flower/Mushroom/Creature)
- Tree trunk: TubeGeometry along CatmullRomCurve3 with slight sway
- Branches: recursive smaller TubeGeometry from trunk points, decreasing radius
- Foliage: IcosahedronGeometry with vertex noise displacement, or clusters of SphereGeometry
- Flower petals: ExtrudeGeometry(petalShape) rotated around center, double-sided material
- Mushroom: LatheGeometry dome cap + CylinderGeometry stem + RingGeometry gills
- Creature/blob: SphereGeometry with vertex displacement, morph targets for pulsing
- Materials: bark(roughness:0.95), leaves(side:DoubleSide, color:0x2d5a1e), bioluminescent(emissive)
- Vary: twisted/straight trunks, single/clustered, glowing/natural, fantastical/realistic
