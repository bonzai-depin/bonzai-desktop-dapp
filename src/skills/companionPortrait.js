/** Shared art direction for creation, regeneration and minted-agent personalization. */
export function companionPortraitDimensions(options = {}) {
  const requested = Number(options.width || options.height || 768);
  const size = Number.isInteger(requested) && requested >= 256 && requested <= 2048 ? requested : 768;
  return { width: size, height: size };
}

export function buildCompanionPortraitPrompt(companion, options = {}) {
  if (!companion) throw new Error('Companion definition required');
  const identity = [companion.appearance, companion.imagePromptBase].filter(Boolean).join('. ');
  const prompt = [
    'Create one native square 1:1 cinematic photographic portrait of this individual smart agent. This is the image itself, never a photograph of a printed photo or a presentation card.',
    `Extract only the physical identity, age, gender, ethnicity and distinctive facial features from this description (ignore its setting, landscape, activity, outfit and camera directions): ${identity || 'an individual adult human with a natural, expressive face'}.`,
    'BonzAI art direction: contemporary Japanese tailoring, structured haori-inspired silhouettes, indigo-black technical fabric, fine sashiko stitching and tactile materials. Adapt the styling to the individual rather than changing their identity.',
    'Restrained Blade Runner atmosphere: warm amber key light, subtle violet edge light, rich readable shadows, delicate film grain, realistic skin and fabric. Human subjects retain natural skin and anatomy, with a quietly capable expression and sophisticated cinematic realism. Do not add implants, armour or robot parts unless the character is explicitly synthetic.',
    'Mandatory setting for the entire collection: inside a warm Japanese room at night, amber paper lanterns and wooden shoji screens beside a window overlooking a violet neon cyberpunk skyline in the rain. Never outdoors, mountains, countryside or daylight. The person is the sole focal subject; no additional characters or objects presented as products.',
    options.style ? `Additional photographic treatment: ${options.style}.` : '',
    'Composition: a square 1:1 edge-to-edge portrait, tight head-and-shoulders close-up, face occupying the upper central half of the image, camera at eye level, natural relaxed shoulders and eyes toward the viewer, crown near the top edge, shoulders filling the lower edge; no full-body or distant figure. The photographic background fills all four edges and all four corners of the square canvas. No blank perimeter or white margin on any side. Render only the character portrait itself. No border, no polaroid, no card layout, no frame, no inset, no lettering, no inscription, no name, no ticker, no logo, no watermark, no signature, no UI or HUD. Clothing has no branded insignia or writing. These output constraints take precedence over any requested layout in the identity description.',
  ].filter(Boolean).join('\n');
  const negativePrompt = [
    'blurry, low quality, distorted face, bad anatomy, duplicate person, generic robot mascot, cartoon robot head, excessive neon, bulky samurai armour, outdoor landscape, mountains, countryside, daylight, full body, distant figure',
    'border, frame, polaroid, white margins, trading card, card layout, typography, text, inscription, lettering, caption, nameplate, ticker, logo, emblem, watermark, signature, UI, HUD, collage, contact sheet',
    options.negativePrompt,
  ].filter(Boolean).join(', ');
  return {prompt, negativePrompt};
}
