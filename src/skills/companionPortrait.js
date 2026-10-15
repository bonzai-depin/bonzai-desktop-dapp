/** Shared art direction for creation, regeneration and minted-agent personalization. */
export function buildCompanionPortraitPrompt(companion, options = {}) {
  if (!companion) throw new Error('Companion definition required');
  const identity = [companion.appearance, companion.imagePromptBase].filter(Boolean).join('. ');
  const prompt = [
    'Create one cinematic photographic portrait of this individual smart agent.',
    `Preserve the described identity, age, gender, ethnicity and distinctive features: ${identity || 'an individual adult human with a natural, expressive face'}.`,
    'BonzAI art direction: contemporary Japanese tailoring, structured haori-inspired silhouettes, indigo-black technical fabric, fine sashiko stitching and tactile materials. Adapt the styling to the individual rather than changing their identity.',
    'Restrained Blade Runner atmosphere: warm amber key light, subtle violet edge light, rich readable shadows, delicate film grain, realistic skin and fabric. Subtle porcelain or brushed-titanium cybernetic accents, quietly capable expression, sophisticated cinematic realism.',
    'A softly defocused architectural background with shoji geometry and distant rain-lit city bokeh. The person is the sole focal subject; no additional characters or objects presented as products.',
    options.style ? `Additional photographic treatment: ${options.style}.` : '',
    'Composition: a single edge-to-edge portrait, head and upper torso clearly visible. Render only the character portrait itself. No border, no polaroid, no card layout, no frame, no inset, no lettering, no inscription, no name, no ticker, no logo, no watermark, no signature, no UI or HUD. Clothing has no branded insignia or writing. These output constraints take precedence over any requested layout in the identity description.',
  ].filter(Boolean).join('\n');
  const negativePrompt = [
    'blurry, low quality, distorted face, bad anatomy, duplicate person, generic robot mascot, cartoon robot head, excessive neon, bulky samurai armour',
    'border, frame, polaroid, white margins, trading card, card layout, typography, text, inscription, lettering, caption, nameplate, ticker, logo, emblem, watermark, signature, UI, HUD, collage, contact sheet',
    options.negativePrompt,
  ].filter(Boolean).join(', ');
  return {prompt, negativePrompt};
}
