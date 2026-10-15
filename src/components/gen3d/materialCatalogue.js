import catalogue from '../../assets/materials/catalogue.json' with { type: 'json' };

export const materialCatalogue = catalogue;
export const materialFamilies = [...new Set(catalogue.map(item => item.family))].sort();
const byId = new Map(catalogue.map(item => [item.id, item]));
const defaults = { brick: 'red_brick', concrete: 'brushed_concrete', grass: 'leafy_grass',
  wood: 'american_walnut_veneer', metal: 'metal_plate', stone: 'dark_rock',
  fabric: 'rough_linen', leather: 'brown_leather', ground: 'brown_mud', sand: 'sand_01' };
const synonyms = {
  wood: 'wooden timber furniture chair table cabinet bois meuble chaise table',
  brick: 'masonry brique briques', concrete: 'cement beton brutalist bunker',
  plaster: 'stucco enduit platre', metal: 'steel iron industrial machine robot spaceship metal acier fer vaisseau',
  fabric: 'cloth textile clothing upholstery curtain cotton tissu vetement rideau', leather: 'cuir saddle upholstery',
  stone: 'rock stone cliff castle medieval dungeon roche pierre falaise chateau donjon',
  tiles: 'ceramic bathroom kitchen tile carrelage ceramique cuisine', roofing: 'roof rooftop toiture toit',
  asphalt: 'road street racing route rue course', cobblestone: 'cobbles pavement plaza village paves place',
  gravel: 'gravel pebbles scree gravier galets', sand: 'sand desert beach dune sable desert plage',
  snow: 'snow winter arctic mountain neige hiver montagne', grass: 'grass lawn meadow field garden herbe prairie jardin',
  earth: 'soil dirt mud terrain terre boue sol', forest: 'forest woodland leaves jungle foret feuilles',
  bark: 'tree trunk bark arbre tronc ecorce', marble: 'marble granite palace temple marbre palais',
  alien: 'moon lunar planet alien space lune lunaire planete espace', 'wood-floor': 'parquet floor flooring plancher',
};
const words = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g) || [];

export function resolveMaterial(id, variant = 0) {
  if (!Number.isInteger(variant) || variant < 0) throw new Error('Material variant must be a non-negative integer');
  if (byId.has(id) && !materialFamilies.includes(id)) return byId.get(id);
  const family = id === 'ground' ? 'earth' : id;
  const choices = catalogue.filter(item => item.family === family);
  if (!choices.length) throw new Error(`Unknown scanned material: ${id}. Use MAT.catalogue(query) to find available IDs.`);
  choices.sort((a,b) => (b.id === defaults[id] ? 1 : 0) - (a.id === defaults[id] ? 1 : 0));
  return choices[variant % choices.length];
}

// Deterministic bounded retrieval: never send the full asset database to the LLM.
export function findMaterials(query, limit = 12) {
  const terms = new Set(words(query));
  const scores = catalogue.map(item => {
    const identity = new Set(words(`${item.id} ${item.name}`));
    const tags = new Set(words(item.tags.join(' ')));
    const family = new Set(words(`${item.family} ${synonyms[item.family] || ''}`));
    let score = 0;
    for (const term of terms) score += (identity.has(term) ? 5 : 0) + (tags.has(term) ? 1 : 0) + (family.has(term) ? 3 : 0);
    return {item,score};
  }).filter(({score}) => score > 0).sort((a,b) => b.score-a.score || a.item.id.localeCompare(b.item.id));
  const counts = new Map(), selected = [];
  for (const {item} of scores) {
    if ((counts.get(item.family) || 0) >= 3) continue;
    selected.push(item); counts.set(item.family,(counts.get(item.family)||0)+1);
    if (selected.length >= Math.max(1,Math.min(24,limit))) break;
  }
  return selected;
}

export function materialContext(brief) {
  const matches = findMaterials(brief);
  if (!matches.length) return '';
  return `LOCAL MATERIAL SHORTLIST (use only where it suits the design; no downloads):\n${matches.map(m => `${m.id}: ${m.name} (${m.family})`).join('\n')}\nUse await MAT.scanned(exact_id). Share materials and use metre-scaled UVs; maps do not replace silhouette geometry.`;
}
