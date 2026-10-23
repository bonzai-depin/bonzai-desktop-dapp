/** Local story progression. Models propose stories/evidence; this reducer owns rewards. */
export const HEART_THRESHOLDS = [20, 50, 90, 140, 200, 280];
export const BOND_NAMES = ['New acquaintance', 'Getting to know you', 'Shared interests', 'Growing trust', 'Close companions', 'Deep understanding', 'Lasting bond'];
export const GIFTS = [
  { id: 'tea', name: 'Tea selection', price: 8, tags: /calm|cook|tea|garden|wellness|gentle/i },
  { id: 'notebook', name: 'Field notebook', price: 12, tags: /research|curious|writing|design|science|history/i },
  { id: 'record', name: 'Independent music record', price: 15, tags: /music|sound|creative|dance|art/i },
  { id: 'seeds', name: 'Local wildflower seeds', price: 10, tags: /nature|conservation|garden|forest|environment/i },
  { id: 'print', name: 'Small art print', price: 15, tags: /art|visual|design|creative|photo/i },
  { id: 'treat', name: 'Handmade treats', price: 8, tags: /food|cook|warm|generous|chef/i },
];
export const ACTIVITIES = [
  { id: 'explore', title: 'Explore together', hearts: 0, instruction: 'Explore a nearby place in this scene together and notice something neither of us expected.' },
  { id: 'practice', title: 'Learn from each other', hearts: 1, instruction: 'Teach me a skill connected to what we are doing here, and let me try it.' },
  { id: 'reflect', title: 'Share a personal story', hearts: 2, instruction: 'Let us take a quiet break and share a personal memory connected to this experience.' },
  { id: 'collaborate', title: 'Create a keepsake', hearts: 3, instruction: 'Let us make a small keepsake of our time here together.' },
  { id: 'honesty', title: 'Work through a difficult choice', hearts: 5, instruction: 'Let us talk honestly about a difficult choice in this scene, even if we disagree, and find a way forward together.' },
  { id: 'milestone', title: 'Revisit a shared milestone', hearts: 6, instruction: 'Let us revisit a specific shared memory from our journal and create a new tradition around it in this scene.' },
  { id: 'future', title: 'Plan our next adventure', hearts: 4, instruction: 'Let us decide what we would like to experience together next, drawing on our shared memories.' },
];
export const hearts = track => HEART_THRESHOLDS.filter(n => (track?.points || 0) >= n).length;
export function newTrack(companionId, name = 'Our story', id = globalThis.crypto.randomUUID()) {
  return { id, companionId, name: name.trim().slice(0, 60) || 'Our story', points: 0, coins: 30, inventory: {}, scenes: {}, journal: [], events: [], createdAt: Date.now() };
}
export function sceneChapter(scene, companion) {
  const a = scene.metadata?.activities || [];
  const h = scene.metadata?.narrativeHooks || [];
  const place = scene.name || 'this scene';
  const partner = companion.name || 'your companion';
  const objective = scene.description || scene.setting || `Explore ${place} together`;
  return { id: scene.id, title: place, source: 'scene', turns: [], completed: [], gifts: [], quests: [
    { id: 'arrival', title: `A shared purpose in ${place}`, objective: `With ${partner}, agree on a concrete first step. Your shared situation: ${objective}` },
    { id: 'discovery', title: a[0] ? a[0][0].toUpperCase() + a[0].slice(1) : 'Follow a promising lead', objective: `Try ${a[0] || 'an exploration of the setting'} together. Discover a useful detail and discuss why it matters.` },
    { id: 'challenge', title: 'An unexpected turn', objective: `Work together on this complication: ${h[0] || `an obstacle to your shared goal in ${place}`}. Choose a response and act on it.` },
    { id: 'trust', title: 'See it through their eyes', objective: `Ask ${partner} what this challenge means to them. Share your own perspective and make a choice that respects both.` },
    { id: 'breakthrough', title: a[1] ? a[1][0].toUpperCase() + a[1].slice(1) : 'Make something happen', objective: `Use what you learned to complete ${a[1] || 'your shared objective'}. Show a concrete outcome, not just an intention.` },
    { id: 'memory', title: 'Something to remember', objective: 'Reflect together on the outcome, choose a shared memory to keep, and discuss what comes next.' },
  ...continuationQuests(scene, companion)].map(q => ({ ...q, points: 15, coins: 10 })) };
}
/** Stable continuation IDs let existing six-quest journals expand without losing evidence. */
function continuationQuests(scene, companion) {
  const activities = scene.metadata?.activities || [];
  const hooks = scene.metadata?.narrativeHooks || [];
  const name = companion.name || 'your companion';
  const place = scene.name || 'this place';
  const activity = activities[2] || activities[0] || `exploring ${place}`;
  return [
    ['second-look', 'A detail we missed', `Return to a detail from your first adventure in ${place}. Compare what each of you remembers and uncover a new possibility.`],
    ['trade-skills', 'Your turn to teach', `Ask ${name} to demonstrate a technique for ${activity}. Try it yourself, then offer a technique of your own and help them try it.`],
    ['local-voices', 'Another point of view', `Within the story, meet someone connected to ${place}. Hear their concern together and decide how it changes your shared plan.`],
    ['small-project', 'Make it our own', `Build a small shared project around ${activity}. Each person contributes a concrete part and you test the result together.`],
    ['new-obstacle', 'When plans change', `Respond together to this new complication: ${hooks[1] || 'your first solution no longer works under changed conditions'}. Try a different approach and show its outcome.`],
    ['disagreement', 'Two ways forward', `Each propose a different response to the latest challenge in ${place}. Explain your reasons, listen, and put an agreed compromise into practice.`],
    ['quiet-moment', 'Between adventures', `Take a break with ${name}. Share a memory connected to what happened here, listen to theirs, and acknowledge something you now understand better.`],
    ['unexpected-help', 'An unexpected kindness', `Notice a small need in ${place}. Help together using what you have learned, without requiring a purchase or gift.`],
    ['role-reversal', 'Let me take the lead', `Switch roles in ${activity}: take responsibility for a part ${name} previously handled. Ask for feedback and make a concrete improvement.`],
    ['final-challenge', 'Put it all together', `Combine two skills or discoveries from this chapter to resolve an unfinished problem in ${place}. Both of you must contribute to the outcome.`],
    ['keepsake', 'A record of our journey', `Create a fictional keepsake with ${name} that reflects two actual shared events from this chapter. Explain what each detail means to you both.`],
    ['next-chapter', 'Until next time', `Revisit a choice you made together in ${place}. Discuss how your understanding changed and agree on a specific next adventure without assuming romance or commitment.`],
  ].map(([id, title, objective]) => ({ id, title, objective }));
}
export function expandSceneChapter(chapter, scene, companion) {
  if (chapter.quests.length !== 6) return chapter;
  return { ...chapter, quests: [...chapter.quests, ...continuationQuests(scene, companion).map(q => ({ ...q, points: 15, coins: 10 }))] };
}
export function parseStoryJSON(raw) {
  if (typeof raw !== 'string') raw = raw?.response || raw?.content || JSON.stringify(raw);
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '').trim();
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}
export function validateQuestPlan(raw, fallback) {
  const data = parseStoryJSON(raw);
  if (!Array.isArray(data.quests) || data.quests.length !== fallback.quests.length) throw new Error(`The story must contain ${fallback.quests.length} quests.`);
  const quests = data.quests.map((q, i) => {
    if (typeof q.title !== 'string' || !q.title.trim() || q.title.length > 100 || typeof q.objective !== 'string' || q.objective.length < 15 || q.objective.length > 800) throw new Error('The story contains an incomplete quest.');
    return { ...fallback.quests[i], title: q.title.trim(), objective: q.objective.trim() };
  });
  return { ...fallback, quests, source: 'personalized' };
}
export function activeQuest(chapter) { return chapter?.quests.find(q => !chapter.completed.some(c => c.id === q.id)); }
export function giftAffinity(gift, companion) {
  return gift.tags.test([companion.personality, companion.description, companion.background, companion.traits].map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' '));
}
export function reduceJourney(original, action) {
  const track = JSON.parse(JSON.stringify(original));
  if (track.events.includes(action.id)) return track;
  const chapter = track.scenes[action.sceneId];
  if (!chapter) throw new Error('Choose a scene first.');
  if (!action.id) throw new Error('An event identifier is required.');
  if (action.type === 'turn') {
    if (!action.user?.trim() || !action.assistant?.trim()) return track;
    chapter.turns.push({ id: action.id, user: action.user.slice(0, 6000), assistant: action.assistant.slice(0, 6000) });
    chapter.turns = chapter.turns.slice(-16);
  } else if (action.type === 'complete') {
    const quest = activeQuest(chapter);
    const evidence = action.evidence;
    const availableTurns = chapter.turns.filter(t => !chapter.completed.some(c => c.turnIds.includes(t.id)));
    if (!quest || quest.id !== action.questId || availableTurns.length < 2 || !Array.isArray(evidence) || evidence.length !== 2) throw new Error('Keep exploring this objective together before completing it.');
    // Require grounded evidence from BOTH participants. Never trust a model's reward numbers.
    for (const role of ['user', 'assistant']) {
      const e = evidence.find(e => e.role === role);
      if (!e || typeof e.quote !== 'string' || e.quote.trim().length < 12 || !availableTurns.some(t => t[role].includes(e.quote))) throw new Error('Quest evidence could not be verified.');
    }
    const memory = String(action.memory || quest.title).slice(0, 500);
    chapter.completed.push({ id: quest.id, evidence, memory, turnIds: availableTurns.map(t => t.id), at: Date.now() });
    track.points += quest.points; track.coins += quest.coins;
    track.journal.push({ sceneId: chapter.id, title: quest.title, memory, at: Date.now() });
  } else if (action.type === 'buy') {
    const gift = GIFTS.find(g => g.id === action.giftId);
    if (!gift || track.coins < gift.price) throw new Error('Not enough story coins. Complete quests to earn more.');
    track.coins -= gift.price; track.inventory[gift.id] = (track.inventory[gift.id] || 0) + 1;
  } else if (action.type === 'give') {
    const gift = GIFTS.find(g => g.id === action.giftId);
    if (!gift || !(track.inventory[gift.id] > 0)) throw new Error('This gift is not in your bag.');
    if (chapter.gifts.includes(gift.id) || chapter.gifts.length >= 2) throw new Error('Save this gift for another scene. Two different gifts can strengthen this chapter.');
    track.inventory[gift.id]--; chapter.gifts.push(gift.id);
    track.points += action.affinity ? 3 : 1;
    track.journal.push({ sceneId: chapter.id, title: `Gift: ${gift.name}`, memory: action.affinity ? 'A gift connected to their interests.' : 'A thoughtful gesture.', at: Date.now() });
  } else throw new Error('Unknown journey action.');
  track.events.push(action.id);
  return track;
}
export function journeyContext(track, sceneId) {
  if (!track) return '';
  const chapter = track.scenes[sceneId]; const quest = activeQuest(chapter);
  return `ROLEPLAY STORY STATE (fictional, never a real purchase or obligation):\nRelationship track: ${track.name}; ${hearts(track)}/6 hearts (${BOND_NAMES[hearts(track)]}). Hearts express trust, not automatic romance or consent. Keep the character independent and respect boundaries.\nShared memories: ${JSON.stringify(track.journal.slice(-8))}\nScene chapter: ${chapter?.title || sceneId}. Completed: ${JSON.stringify(chapter?.completed.map(c => c.memory) || [])}.\nCurrent quest: ${quest ? `${quest.title}: ${quest.objective}` : 'Chapter complete. Enjoy free play or suggest another scene.'}\nOffer natural choices and meaningful shared actions, one beat at a time. Do not claim points, gifts, purchases or quest completion; the application handles these. Never finish the user\'s decisions for them.`;
}

// A separate, compact local journal keeps relationships independent of chat deletion.
const KEY = 'roleplayJourneysV1';
let queue = Promise.resolve();
const storage = () => globalThis.window?.electronAPI?.store;
export async function loadJourneys() {
  const raw = storage()?.get ? await storage().get(KEY, null) : JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null');
  if (raw == null) return { version: 1, tracks: [] };
  if (raw.version !== 1 || !Array.isArray(raw.tracks)) throw new Error('The relationship journal could not be read. Your saved data has not been replaced.');
  raw.tracks.forEach(validateJourney);
  return raw;
}
export function saveJourney(track) {
  const value = JSON.parse(JSON.stringify(track));
  const result = queue.then(async () => {
    const state = await loadJourneys();
    const i = state.tracks.findIndex(t => t.id === value.id);
    if (i < 0) state.tracks.push(value); else state.tracks[i] = value;
    if (storage()?.set) await storage().set(KEY, state);
    else { if (!globalThis.localStorage) throw new Error('Local storage is unavailable.'); globalThis.localStorage.setItem(KEY, JSON.stringify(state)); }
    return value;
  });
  queue = result.catch(() => {}); return result;
}

/** Imported journals are local fiction, never entitlements or real currency. */
export function validateJourney(track) {
  if (!track || typeof track.id !== 'string' || typeof track.companionId !== 'string' || typeof track.name !== 'string' || !Number.isSafeInteger(track.points) || track.points < 0 || !Number.isSafeInteger(track.coins) || track.coins < 0 || !track.scenes || !track.inventory || !Array.isArray(track.events) || !Array.isArray(track.journal)) throw new Error('Invalid relationship journal.');
  for (const c of Object.values(track.scenes)) {
    if (!c || !Array.isArray(c.quests) || ![6, 18].includes(c.quests.length) || !Array.isArray(c.turns) || !Array.isArray(c.completed) || !Array.isArray(c.gifts)) throw new Error('Invalid scene chapter.');
    if (c.quests.some(q => typeof q.id !== 'string' || typeof q.title !== 'string' || typeof q.objective !== 'string' || q.points !== 15 || q.coins !== 10)) throw new Error('Invalid quest rewards.');
    if (c.completed.some(q => !Array.isArray(q.turnIds))) throw new Error('Invalid quest history.');
  }
  return track;
}
export async function importJourneys(tracks) {
  if (!Array.isArray(tracks) || tracks.length > 1000) throw new Error('Invalid relationship export.');
  tracks.forEach(validateJourney);
  const existing = await loadJourneys();
  for (const track of tracks) if (!existing.tracks.some(t => t.id === track.id)) { await saveJourney(track); existing.tracks.push(track); }
}
