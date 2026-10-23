// Guided examples never run models, connect accounts, or fabricate saved outputs.
const examples = {
  'podcast-studio': ['Turn notes about local creativity into a three-minute podcast for curious beginners.', 'Outline → narration script → speech passages → cover illustration → complete episode', 'Opening: “What if your next creative studio was already on your desk?”\nChapter 1: A small idea\nChapter 2: From draft to creation\nClosing: One thing to try today'],
  'music-video-forge': ['Use a 30-second synth-pop song for a night-train journey through Kyoto.', 'Measure song → storyboard → illustrate shots → animate with H3 → assemble with the original soundtrack', '00:00–00:10 · Train enters the city\n00:10–00:20 · Neon reflections cross the window\n00:20–00:30 · Arrival beneath lanterns\nThe assembled film covers the entire song.'],
  'manga-to-anime': ['Animate three manga panels: a quiet station, an arriving train, and a reunion.', 'Order original panels → direct movement → animate each panel with H3 → assemble the sequence', 'Panel 1 · Slow camera push, drifting leaves\nPanel 2 · Train arrives, steam moves softly\nPanel 3 · Restrained character movement\nKeep the original artwork and panel order.'],
  'meditation-forge': ['Create a five-minute evening meditation beside a quiet lake.', 'Write paced narration → create speech → illustrate the scene → review the meditation', 'Settle into your seat. Let your shoulders soften. Notice one breath, without trying to change it.'],
  'video-captioning': ['Describe a short clip of a gardener planting a seedling.', 'Inspect sampled frames → write timed visual descriptions → export subtitles', '00:00:00 → 00:00:03\nA gardener prepares soil in a terracotta pot.\n00:00:03 → 00:00:06\nThey carefully place a seedling in the centre.'],
  'finger-frame-director': ['Frame a doorway with your hands and turn it into a forest portal.', 'Track the frame gesture → capture the composition → direct the transformation → review video', 'The doorway fills with soft forest light; leaves move through the opening.'],
  'live-streaming': ['Respond to a viewer asking how the current illustration was made.', 'Read connected chat → select a relevant request → prepare a response → update the stream', 'Viewer: How did you make the lighting?\nDraft reply: I started with a warm key light and cooler shadows.'],
  'tcg-analysis': ['Inspect front and back photos of a trading card.', 'Identify the card → inspect visible condition → gather price evidence → review the report', 'Identity and edition · verify against the image\nCondition · check corners, edges and surface\nPricing · compare dated sources before drawing a conclusion'],
};
const categoryBriefs = {
  operations: 'A cold room rises above its expected temperature. Prepare a response and track the return to normal.',
  finance: 'Review an approved service invoice, identify missing evidence, and prepare the next payment step.',
  accounting: 'Reconcile a sample month of invoices and bank records and flag discrepancies for review.',
  grants: 'Check a sample energy-efficiency project for eligibility and prepare its supporting dossier.',
  purchasing: 'Compare three supplier quotations for a replacement refrigeration unit.',
  sales: 'Qualify an enquiry and prepare a proposal that answers the customer’s requirements.',
  property: 'Prepare a property for the next arrival and resolve an outstanding maintenance request.',
  compliance: 'Check a sample dossier for missing documents, inconsistencies and review requirements.',
  markets: 'Compare sample market evidence, record assumptions and prepare a research summary.',
  research: 'Compare three approaches using the supplied sources and explain their trade-offs.',
};
export function workflowDemo(workflow) {
  const key = workflow.id.replace(/-v\d.*$/, '');
  const sample = examples[key];
  const deliverables = workflow.catalogDeliverables || [];
  return [
    { title: 'Start With A Brief', icon: 'edit_note', text: sample?.[0] || categoryBriefs[workflow.category] || `Prepare an example of ${workflow.catalogTitle} using sample inputs.`, items: workflow.catalogInputs || [] },
    { title: 'Follow The Team', icon: 'route', text: sample?.[1] || workflow.firstValue || workflow.catalogDescription, items: ['Prepare the inputs', 'Carry out the workflow', 'Review the result'] },
    { title: 'Review The Result', icon: 'task_alt', text: sample?.[2] || workflow.catalogOutcome || workflow.catalogDescription, items: deliverables },
  ];
}
