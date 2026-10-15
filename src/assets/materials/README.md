# Local PBR material library

172 independently selected 2K material sets in 22 families. None of the three
Hyperstrike starter sets is included. Families cover brick, concrete, plaster,
metal, fabric, leather, wood, wood flooring, bark, stone, marble/granite, tiles,
roofing, asphalt, cobblestone, gravel, sand, snow, grass/moss, earth, forest floor
and lunar/alien terrain.

All source assets are [Poly Haven CC0](https://polyhaven.com/license). The local
`catalogue.json` records each asset's source URL, author names, family, tags and
per-map URL, byte size and source MD5. Base color, OpenGL normal and roughness are
required; ambient occlusion and metalness are included when the source supplies
them. No fabricated AO or metalness maps are substituted for missing channels.

Reproduce the collection with `node scripts/fetch-material-library.mjs` from the
repository root. **Powered by Poly Haven**: this build-time importer uses the
public API with a BonzAI user agent, three workers, bounded retries and checksum
verification. The checked-in selection is `scripts/material-library-selection.json`.
Existing valid files are reused. Failed imports do not replace the catalogue.

The application makes no live API calls. Vite bundles maps as local hashed assets;
only materials used by a scene are decoded/uploaded to the GPU. Source textures
are shared within a scene; per-material texture transforms are independent.
GLB export embeds textures. This substantial library increases installation size;
it does not all load into RAM when the app starts.

Use `await MAT.scanned(id)` or a family alias with `{variant: 1}`. Legacy `brick`,
`concrete` and `grass` aliases resolve to new scans, preserving saved scene code.
`MAT.catalogue(query)` returns a bounded local shortlist. Generation prompts also
receive a subject-relevant shortlist, never the entire metadata catalogue.
Smooth glass, gemstones and other homogeneous surfaces still use physical
material presets; photography is not appropriate for every material or style.
