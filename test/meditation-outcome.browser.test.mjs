import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.BONZAI_UI_URL;
test('Meditation produces measured complete narration, exports its exact script and recovers prior sessions explicitly', { skip: !url }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  try {
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent(`<html data-theme="waveform"><head>
      <link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fields.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css">
      <style>*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}</style>
      </head><body><div id="app"></div></body></html>`);
    await page.evaluate(async () => {
      window.fixture = { results: [], calls: [], writes: [], failAudio: false, imageMode: 'success', imagePng: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' };
      const old = { id: 'old-session', title: 'Earlier completed meditation', scenarioId: 'forest-calm', scenarioName: 'Forest Serenity', duration: 3, durationSeconds: 180, script: 'The complete earlier script.', audioSrc: 'data:audio/wav;base64,AAAA', imageSrc: 'data:image/png;base64,AAAA', createdAt: '2026-10-10T00:00:00Z' };
      window.electronAPI = {
        store: { get: async () => [old], set: async (_key, value) => fixture.writes.push(value) },
        ensureModel: async key => { fixture.calls.push({ type: 'model', key }); return fixture.declineModel ? { ok: true, declined: true } : { ok: true }; },
        chat: async (prompt, options) => { fixture.calls.push({ type: 'script', prompt, options }); return `${Array(9).fill('Breathe gently and notice the calm around you. Feel your shoulders soften and your hands relax. Let this quiet moment bring ease to your day.').join('\n\n')} Carry this peaceful feeling with you. Namaste.`; },
        exportMeditationVideo: async payload => { fixture.exported = payload; return { success: true, path: '/mock/full-meditation.mp4', durationSeconds: 180 }; },
      };
      const originalFetch = window.fetch;
      window.fetch = async (input, init) => {
        if (String(input).includes('/image/turbo')) {
          fixture.calls.push({ type: 'image', body: JSON.parse(init.body) });
          const mode = fixture.imageMode;
          return new Response(JSON.stringify(mode === 'pending' ? { status: 'pending' } : mode === 'empty' ? {} : mode === 'error' ? { error: 'Fixture artwork failure' } : { image_base64: mode === 'invalid' ? 'AAAA' : fixture.imagePng }), { status: mode === 'pending' ? 202 : mode === 'error' ? 500 : 200 });
        }
        if (String(input).includes('/audio/turbo')) { const body = JSON.parse(init.body); fixture.calls.push({ type: 'audio', body }); return new Response(JSON.stringify(fixture.failAudio ? { error: 'Fixture narration failure' } : { audio_base64: 'AAAA', duration_seconds: body.target_duration_seconds, narration_seconds: 100, caption_segments: [{ text: body.prompt, start: .4, end: 178.8 }] }), { status: fixture.failAudio ? 500 : 201 }); }
        return originalFetch(input, init);
      };
      const { createApp } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Meditation } = await import('/src/components/skills/MeditationForgeSkill.vue');
      window.vm = createApp(Meditation, { companyTask: { companyId: 'meditation', issueId: 'task', llm: 'llm_assigned_worker_q4' }, onMeditationCreated: result => fixture.results.push(JSON.parse(JSON.stringify(result))) }).mount('#app');
      window.generationState = await import('/src/stores/generationStore.js');
    });
    await page.getByText('Earlier completed meditation', { exact: true }).click();
    assert.equal(await page.evaluate(() => fixture.results.length), 0, 'looking at history must not attach it');
    await page.getByRole('button', { name: 'Use this session for this task' }).click();
    assert.equal(await page.evaluate(() => fixture.results[0].id), 'old-session');
    await page.getByRole('button', { name: 'New session', exact: true }).click();
    await page.getByRole('button', { name: '3 min Reset', exact: true }).click();
    await page.getByRole('button', { name: /Create Meditation/ }).click();
    await page.getByText('Session ready - Press play to begin').waitFor();
    const result = await page.evaluate(() => ({ result: fixture.results.at(-1), audio: fixture.calls.find(call => call.type === 'audio'), script: fixture.calls.find(call => call.type === 'script') }));
    assert.equal(result.audio.body.target_duration_seconds, 180);
    assert.equal(result.result.durationSeconds, 180);
    assert.equal(result.audio.body.prompt, result.result.script);
    assert.equal(result.script.options.isolated, true);
    assert.equal(await page.evaluate(() => fixture.calls.find(call => call.type === 'model').key), 'llm_assigned_worker_q4');
    assert.match(result.result.script, /Carry this peaceful feeling with you\. Namaste\.$/);
    await page.getByRole('button', { name: /Export Video/ }).click();
    await page.getByText('Meditation video exported.', { exact: true }).waitFor();
    const exported = await page.evaluate(() => ({ payload: fixture.exported, result: fixture.results.at(-1) }));
    assert.equal(exported.payload.script, result.result.script);
    assert.equal(exported.payload.durationSeconds, 180);
    assert.equal(exported.result.videoSrc, '/mock/full-meditation.mp4');
    const count = await page.evaluate(() => fixture.results.length);
    await page.getByRole('button', { name: 'New session', exact: true }).click();
    await page.evaluate(() => { fixture.failAudio = true; });
    await page.getByRole('button', { name: /Create Meditation/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Fixture narration failure' }).waitFor();
    assert.equal(await page.evaluate(() => fixture.results.length), count, 'failed audio must not produce a successful deliverable');
    assert.equal(await page.evaluate(() => generationState.canStartGeneration()), true, 'errors release the generation lock');
    await page.evaluate(() => { fixture.failAudio = false; fixture.declineModel = true; });
    const scriptCalls = await page.evaluate(() => fixture.calls.filter(call => call.type === 'script').length);
    await page.getByRole('button', { name: /Create Meditation/ }).click();
    await page.getByRole('alert').filter({ hasText: 'model is waiting for another request' }).waitFor();
    assert.equal(await page.evaluate(() => fixture.calls.filter(call => call.type === 'script').length), scriptCalls, 'a declined model switch must not silently use the wrong model');
    await page.evaluate(() => generationState.startGeneration('video'));
    await page.getByRole('button', { name: /Create Meditation/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Another generation is running' }).waitFor();
    assert.equal(await page.evaluate(() => generationState.getLockedGeneration().modality), 'video', 'the existing video keeps its lock');
    await page.evaluate(() => generationState.stopGeneration('video'));
    // Missing, pending and corrupt artwork must preserve complete audio and offer an image-only retry.
    await page.evaluate(() => { fixture.declineModel = false; fixture.imageMode = 'error'; });
    await page.getByRole('button', { name: /Create Meditation/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Fixture artwork failure' }).waitFor();
    await page.getByRole('button', { name: /Retry artwork/ }).waitFor();
    await page.getByText('Your audio is ready. Artwork is required to export a video.').waitFor();
    assert.equal(await page.getByRole('button', { name: /Export Video/ }).isDisabled(), true);
    const recovery = await page.evaluate(() => ({ result: fixture.results.at(-1), scripts: fixture.calls.filter(call => call.type === 'script').length, audio: fixture.calls.filter(call => call.type === 'audio').length, images: fixture.calls.filter(call => call.type === 'image').length }));
    assert.ok(recovery.result.audioSrc);
    assert.equal(recovery.result.imageSrc, '');
    await page.evaluate(() => generationState.startGeneration('video'));
    await page.getByRole('button', { name: /Retry artwork/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Another generation is running' }).waitFor();
    assert.equal(await page.evaluate(() => fixture.calls.filter(call => call.type === 'image').length), recovery.images);
    assert.equal(await page.evaluate(() => generationState.getLockedGeneration().modality), 'video');
    await page.evaluate(() => generationState.stopGeneration('video'));
    for (const [mode, message] of [['pending', 'Artwork is not ready.'], ['empty', 'no usable artwork'], ['invalid', 'artwork could not be opened']]) {
      await page.evaluate(mode => { fixture.imageMode = mode; }, mode);
      await page.getByRole('button', { name: /Retry artwork/ }).click();
      await page.getByRole('alert').filter({ hasText: message }).waitFor();
      assert.equal(await page.evaluate(() => generationState.canStartGeneration()), true);
    }
    await page.evaluate(() => { fixture.imageMode = 'success'; });
    await page.getByRole('button', { name: /Retry artwork/ }).click();
    await page.waitForFunction(() => !!fixture.results.at(-1).imageSrc);
    const recovered = await page.evaluate(() => ({ result: fixture.results.at(-1), scripts: fixture.calls.filter(call => call.type === 'script').length, audio: fixture.calls.filter(call => call.type === 'audio').length, images: fixture.calls.filter(call => call.type === 'image'), saved: fixture.writes.at(-1) }));
    assert.equal(recovered.result.id, recovery.result.id, 'retry updates the same task result');
    assert.equal(recovered.result.script, recovery.result.script);
    assert.equal(recovered.result.audioSrc, recovery.result.audioSrc);
    assert.equal(recovered.scripts, recovery.scripts, 'retry must not rewrite the finished narration');
    assert.equal(recovered.audio, recovery.audio, 'retry must not record the finished audio again');
    assert.equal(recovered.saved.find(session => session.id === recovery.result.id).imageSrc, recovered.result.imageSrc);
    assert.ok(recovered.images.every(call => call.body.auto_download === false));
    assert.equal(await page.getByRole('button', { name: /Export Video/ }).isEnabled(), true);
    await page.setViewportSize({ width: 420, height: 900 });
    await page.screenshot({ path: '/tmp/bonzai-meditation-narrow.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 420), JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > 420).map(el => ({tag:el.tagName,cl:el.className,width:el.getBoundingClientRect().width})).slice(0,10))));
  } finally { await browser.close(); }
});
