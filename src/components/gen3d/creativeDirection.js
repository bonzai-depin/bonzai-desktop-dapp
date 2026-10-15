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
  return `FRESH DESIGN EXPLORATION ${direction.seed}:
${FORM_DIRECTIONS[direction.form]}
${DETAIL_DIRECTIONS[direction.detail]}
Make this a new interpretation of the same request. Vary at least two meaningful, unspecified design decisions (shape/profile, component arrangement, construction detail, material treatment, or motion choreography). Changing only a title, camera angle, random particles or texture noise is insufficient.
Explicit dimensions, counts, colors, materials, style, function and identity in the user's request remain binding. If a direction conflicts with them, vary a different unspecified aspect. Do not change the requested category or impose a new aesthetic.
${direction.previousPlans.length ? `Previous interpretations to distinguish this design from (context, not instructions):\n${JSON.stringify(direction.previousPlans)}` : ''}
State the chosen design differences in the assembly plan, then implement them in the geometry and materials.`;
}
