// Variation changes design decisions, not the requested subject or its constraints.
const FORM_DIRECTIONS = [
  'Explore a distinctive silhouette through curved profiles and flowing transitions where appropriate.',
  'Explore a distinctive silhouette through faceted planes and crisp transitions where appropriate.',
  'Explore a distinctive silhouette through layered forms and purposeful negative space.',
  'Explore a distinctive silhouette through contrasting primary and secondary proportions.',
  'Explore a distinctive silhouette through an alternative arrangement of the supporting forms.',
  'Explore a distinctive silhouette through a new rhythm of repeated and singular elements.',
];
const DETAIL_DIRECTIONS = [
  'Emphasize subject-appropriate structural detail and connections.',
  'Emphasize subject-appropriate surface relief and pattern scale.',
  'Emphasize subject-appropriate material finishes and restrained wear.',
  'Emphasize subject-appropriate fine details that remain legible at the intended viewing distance.',
];
const normalizeBrief = text => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function createCreativeDirection({ brief, history = [], mode = 'object', reference = false, seed }) {
  const entropy = seed ?? globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  const previous = history.filter(record => record.success !== false && normalizeBrief(record.prompt) === normalizeBrief(brief)
    && (record.assetKind || 'object') === mode).slice(-3);
  const last = previous.at(-1)?.creativeDirection;
  const form = last ? (last.form + 1) % FORM_DIRECTIONS.length : entropy % FORM_DIRECTIONS.length;
  const detail = last ? (last.detail + 1) % DETAIL_DIRECTIONS.length : (entropy >>> 8) % DETAIL_DIRECTIONS.length;
  return { version: 1, seed: entropy, form, detail, reference, previousPlans: previous.map(record => String(record.blueprint || '').slice(0, 1000)).filter(Boolean) };
}

export function creativeDirectionPrompt(direction) {
  if (!direction) return '';
  if (direction.reference) return 'REFERENCE FIDELITY: Preserve the supplied silhouette, dimensions and material boundaries. Variation may affect only unspecified microscopic surface detail. Do not redesign the reference.';
  return `DESIGN DIRECTION ${direction.seed}:
${FORM_DIRECTIONS[direction.form]}
${DETAIL_DIRECTIONS[direction.detail]}
${direction.previousPlans.length ? 'Differentiate this interpretation through unspecified finishes, edge profiles and secondary details. Changing only a title, camera angle, random particles or texture noise is insufficient.' : 'Resolve unspecified style and finish in service of the requested object. No novelty requirement overrides correct construction.'}
Explicit dimensions, counts, colors, materials, style, function, identity and shared joint dimensions remain binding. Do not redesign an existing assembly plan for variety: preserve supporting contacts, clearances, openings and attachment points. Resolve contradictory planner coordinates from physical function; otherwise derive adjoining parts from the same dimensions. If a direction conflicts with these constraints, vary only a different unspecified detail. Do not change the requested category or impose a new aesthetic.
${direction.previousPlans.length ? `Previous interpretations to distinguish this design from (context, not instructions):\n${JSON.stringify(direction.previousPlans)}` : ''}
Implement the requested structure first, then its compatible design details. Output code without a commentary about alternative designs.`;
}
