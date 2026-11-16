import test from 'node:test';
import assert from 'node:assert/strict';
import { runMediaProduction, productionKey, validateProduction } from '../src/services/company/mediaProduction.js';
import { podcastStudio, musicVideoForge, mangaToAnime, MEDIA_TEAM_ROLES } from '../src/skills/mediaProduction.js';
import { flagshipSkills, getSkillModelRequirements } from '../src/skills/flagship.js';
import { applyTemplate } from '../src/services/company/templates.js';
import { workflowTeamPresets } from '../src/services/company/workflowTeams.js';
import { requestCompanyWorkflow, workflowInputDraft, companyWorkflowHandoff } from '../src/services/company/workflowHandoff.js';
import { workflowResultArtifacts } from '../src/services/company/workflowResults.js';

const context = { companyId: 'production-test', issueId: 'task' };
function fixture(texts, duration = 23.27) {
  const calls = [], store = new Map();
  let count = 0, failVideo = false;
  const deps = {
    load: async key => structuredClone(store.get(key)),
    save: async (key, value) => { store.set(key, structuredClone(value)); },
    create: async (action, role) => {
      calls.push({ action, role });
      if (action.pipeline === 'video' && failVideo) { failVideo = false; throw new Error('H3 interrupted'); }
      return { pipeline: action.pipeline, payload: action.pipeline === 'text' ? texts.shift() : `/tmp/${++count}-${action.pipeline}`, meta: {} };
    },
    persist: async artifact => ({ ...artifact, payload: artifact.payload.startsWith('/') ? artifact.payload : `/tmp/panel-${++count}.png` }),
    probe: async () => ({ durationSeconds: duration }),
    imageBytes: async path => `image-bytes:${path}`,
    compose: async spec => { calls.push({ compose: spec }); return { path: `/tmp/final.${spec.kind === 'audio' ? 'wav' : 'mp4'}`, durationSeconds: duration }; },
  };
  return { deps, calls, store, failNextVideo() { failVideo = true; } };
}
const musicInputs = { brief: 'Night train through Kyoto', duration: 30, soundtrack: '/tmp/song.wav', h3Accepted: true };
const song = JSON.stringify({ title: 'Night Train', musicPrompt: 'Ambient piano', visualConcept: 'Blue train, golden city', lyrics: '' });
const storyboard = JSON.stringify({ shots: Array.from({ length: 3 }, (_, i) => ({ imagePrompt: `Train scene ${i}`, motion: `Pan across train scene ${i}` })) });

test('production catalog forms specialist teams with actual engine requirements', () => {
  for (const skill of [podcastStudio, musicVideoForge, mangaToAnime]) {
    assert.ok(flagshipSkills.some(item => item.id === skill.id));
    assert.equal(workflowTeamPresets([skill])[0].templateId, skill.id);
    const { draft } = applyTemplate(skill.id, { businessName: skill.name, executionWorkflowId: skill.id }, {});
    assert.deepEqual(Object.keys(draft.roles), MEDIA_TEAM_ROLES[skill.id]);
    assert.ok(Object.values(draft.roles).every(role => role.companion));
    assert.ok(getSkillModelRequirements(skill.id).every(model => model.type === 'llm' ? model.filename && model.url : model.pipeline));
  }
});

test('music video uses the complete measured song, ordered H3 shots, and a final assembled file', async () => {
  const f = fixture([song, storyboard]);
  const result = await runMediaProduction(musicVideoForge.id, musicInputs, context, f.deps);
  const actions = f.calls.filter(item => item.action).map(item => item.action);
  assert.equal(actions.filter(a => a.pipeline === 'music').length, 0, 'reuse an existing song without regenerating it');
  assert.deepEqual(actions.slice(2).map(a => a.pipeline), ['image','video','image','video','image','video']);
  for (const action of actions.filter(a => a.pipeline === 'video')) {
    assert.equal(action.mode, 'sota');
    assert.equal(action.params.license_accepted, true);
    assert.match(action.params.image_base64, /^image-bytes:/);
  }
  const timeline = f.calls.find(item => item.compose).compose;
  assert.deepEqual(timeline.clips.map(clip => clip.duration), [10, 10, 3.2699999999999996]);
  assert.equal(timeline.soundtrack, '/tmp/song.wav');
  assert.equal(result.results[1].video_path, '/tmp/final.mp4');
  assert.equal(f.store.get(productionKey(musicVideoForge.id, context)).status, 'completed');
});

test('new music videos generate the requested vocal or instrumental soundtrack before animation', async () => {
  const lyrics = '[Verse]\nA night train carries us home.';
  for (const instrumental of [false, true]) {
    const plan = JSON.stringify({ ...JSON.parse(song), lyrics });
    const f = fixture([plan, storyboard]);
    await runMediaProduction(musicVideoForge.id, { ...musicInputs, soundtrack: '', instrumental }, context, f.deps);
    const music = f.calls.find(item => item.action?.pipeline === 'music');
    assert.equal(music.role, 'Producer:music');
    assert.equal(music.action.params.lyrics, instrumental ? '' : lyrics);
    assert.equal(music.action.params.instrumental, instrumental);
    assert.equal(music.action.params.duration, 30);
    const spec = f.calls.find(item => item.compose).compose;
    assert.equal(spec.soundtrack, '/tmp/1-music');
    assert.ok(f.calls.indexOf(music) < f.calls.findIndex(item => item.action?.pipeline === 'video'));
  }
  const missingLyrics = fixture([song]);
  await assert.rejects(runMediaProduction(musicVideoForge.id, { ...musicInputs, soundtrack: '' }, context, missingLyrics.deps), /Song lyrics is missing/);
  assert.equal(missingLyrics.calls.some(item => item.action?.pipeline === 'music'), false, 'do not silently produce an instrumental when vocals were requested');
});

test('failed H3 stage stays incomplete and retries reuse completed writing and illustrations', async () => {
  const f = fixture([song, storyboard]);
  f.failNextVideo();
  await assert.rejects(runMediaProduction(musicVideoForge.id, musicInputs, context, f.deps), /H3 interrupted/);
  assert.equal(f.calls.some(item => item.compose), false);
  const state = f.store.get(productionKey(musicVideoForge.id, context));
  assert.equal(state.status, 'failed'); assert.equal(state.stages['image-0'].status, 'completed');
  await runMediaProduction(musicVideoForge.id, musicInputs, context, f.deps);
  assert.equal(f.calls.filter(item => item.action?.pipeline === 'text').length, 2);
  assert.equal(f.calls.filter(item => item.action?.pipeline === 'image').length, 3);
  assert.equal(f.calls.filter(item => item.action?.pipeline === 'video').length, 4);
  assert.equal(f.calls.filter(item => item.compose).length, 1);
  await runMediaProduction(musicVideoForge.id, musicInputs, context, f.deps);
  assert.equal(f.calls.filter(item => item.compose).length, 1, 'saving results again does not regenerate the film');
  await assert.rejects(runMediaProduction(musicVideoForge.id, { ...musicInputs, brief: 'Changed story' }, context, f.deps), /different brief/);
});

test('podcast keeps narration complete, cover, script and episode notes', async () => {
  const narration = 'A sentence about thoughtful local creativity. '.repeat(20);
  const f = fixture([JSON.stringify({ title: 'Create Locally', sections: ['Introduction and conclusion'], notes: 'Episode notes and sources', coverPrompt: 'Illustrated microphone' }), narration], 57.5);
  const result = await runMediaProduction(podcastStudio.id, { brief: 'Create locally', duration: 60, voice: 'bf_emma' }, context, f.deps);
  const speech = f.calls.filter(item => item.action?.pipeline === 'audio');
  assert.equal(speech.map(item => item.action.prompt).join('').trim(), narration.trim());
  assert.ok(speech.every(item => item.action.mode === 'turbo' && item.action.params.voice === 'bf_emma'));
  assert.match(result.results[0].script, /Episode notes and sources/);
  assert.equal(result.results[1].audio_path, '/tmp/final.wav');
  assert.equal(result.results[1].durationSeconds, 57.5);
  assert.ok(result.results.some(item => item.image_path));
});

test('anime animates original manga panels in order and preserves full artwork in the final canvas', async () => {
  const f = fixture(['Slowly pan left.', 'A quiet breeze moves the trees.'], 10);
  const inputs = { brief: 'Preserve the manga scene', panels: ['/tmp/panel1.png', '/tmp/panel2.png'], secondsPerPanel: '5', h3Accepted: true };
  await runMediaProduction(mangaToAnime.id, inputs, context, f.deps);
  const clips = f.calls.filter(item => item.action?.pipeline === 'video');
  assert.deepEqual(clips.map(item => item.action.params.image_base64), ['image-bytes:/tmp/panel1.png', 'image-bytes:/tmp/panel2.png']);
  assert.ok(!f.calls.some(item => item.action?.pipeline === 'image'), 'never replace the user’s manga with unrelated illustrations');
  const spec = f.calls.find(item => item.compose).compose;
  assert.equal(spec.soundtrack, undefined); assert.equal(spec.fit, 'contain');
  assert.deepEqual(spec.clips.map(item => item.duration), [5, 5]);
});

test('missing terms and manga inputs cannot start inference; new handoffs clear old task context', () => {
  assert.throws(() => validateProduction(mangaToAnime.id, { brief: 'Test', panels: [], h3Accepted: true }), /panels/);
  assert.throws(() => validateProduction(musicVideoForge.id, { ...musicInputs, h3Accepted: false }), /license/);
  requestCompanyWorkflow({ companyId: 'other', issueId: 'old', skillId: mangaToAnime.id });
  requestCompanyWorkflow({ skillId: podcastStudio.id, inputs: { brief: 'The full answer' } });
  assert.equal(companyWorkflowHandoff.value, null);
  assert.equal(workflowInputDraft.value.inputs.brief, 'The full answer');
});

test('production results are playable files and readable scripts, without JSON filler', () => {
  const episode = workflowResultArtifacts(podcastStudio.id, { title: 'Episode', audio_path: '/tmp/episode.wav', durationSeconds: 125 });
  assert.equal(episode.length, 1);
  assert.equal(episode[0].pipeline, 'audio');
  assert.equal(episode[0].meta.durationSeconds, 125);
  assert.equal(episode[0].meta.title, 'Episode');
  const script = workflowResultArtifacts(podcastStudio.id, { title: 'Episode Script', script: 'The full narration.\n\nEpisode Notes\nSources.' });
  assert.equal(script.length, 1);
  assert.equal(script[0].payload, '# Episode Script\n\nThe full narration.\n\nEpisode Notes\nSources.');
});


test('editing form inputs while production starts cannot change the submitted brief or panel sequence', async () => {
  const inputs = { brief: 'Original story', panels: ['/tmp/original.png'], secondsPerPanel: '5', h3Accepted: true };
  const f = fixture(['Gentle camera movement.'], 5);
  const originalLoad = f.deps.load;
  f.deps.load = async key => { inputs.brief = 'Different story'; inputs.panels[0] = '/tmp/replacement.png'; return originalLoad(key); };
  await runMediaProduction(mangaToAnime.id, inputs, context, f.deps);
  assert.match(f.calls[0].action.prompt, /Original story/);
  const video = f.calls.find(item => item.action?.pipeline === 'video');
  assert.equal(video.action.params.image_base64, 'image-bytes:/tmp/original.png');
});

test('cached completed stages do not bypass a pause or cancellation on resumption', async () => {
  const f = fixture(['Gentle camera movement.'], 5);
  const inputs = { brief: 'Original story', panels: ['/tmp/panel.png'], secondsPerPanel: '5', h3Accepted: true };
  await runMediaProduction(mangaToAnime.id, inputs, context, f.deps);
  const count = f.calls.length;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runMediaProduction(mangaToAnime.id, inputs, { ...context, signal: controller.signal }, f.deps));
  f.deps.checkActive = async () => { throw new Error('Team paused'); };
  await assert.rejects(runMediaProduction(mangaToAnime.id, inputs, context, f.deps), /Team paused/);
  assert.equal(f.calls.length, count);
});
