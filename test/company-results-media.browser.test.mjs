import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const url = process.env.BONZAI_UI_URL;

test('results show media before approval, open their exact task and download binary audio', { skip: !url || spawnSync('ffmpeg', ['-version']).status !== 0, timeout: 60000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bonzai-result-test-'));
  const movie = join(folder, 'sample.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=5', '-t', '0.6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', movie]);
  const videoBase64 = (await readFile(movie)).toString('base64');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    await page.goto(url + '/src/assets/tokens.css');
    await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg)}</style><main id="app"></main>');
    await page.evaluate(async videoBase64 => {
      const src = await fetch('/src/components/company/CompanyDeliverableLibrary.vue').then(r => r.text());
      const runtime = src.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
      const { createApp, h, reactive } = await import(runtime);
      const { default: Library } = await import('/src/components/company/CompanyDeliverableLibrary.vue');
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      i18n.setLocale('en');
      const video = Uint8Array.from(atob(videoBase64), c => c.charCodeAt(0));
      const audio = new Uint8Array(844), view = new DataView(audio.buffer);
      const word = (i, s) => [...s].forEach((c, n) => audio[i + n] = c.charCodeAt(0));
      word(0, 'RIFF'); view.setUint32(4, 836, true); word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, 800, true);
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64; canvas.getContext('2d').fillRect(0, 0, 64, 64);
      const image = Uint8Array.from(atob(canvas.toDataURL().split(',')[1]), c => c.charCodeAt(0));
      const f = window.fixture = reactive({ opened: null, failCover: true, records: [
        { id: 'narration', companyId: 'meditation', pipeline: 'audio', blobId: 'wav', blobExt: 'wav', role: 'Narrator', meta: { issueId: 'calm-task', title: 'Evening calm — narration' }, createdAt: Date.now() },
        { id: 'cover', companyId: 'meditation', pipeline: 'image', blobId: 'cover', blobExt: 'png', meta: { issueId: 'calm-task', title: 'Evening calm — artwork' }, createdAt: Date.now() },
        { id: 'movie', companyId: 'meditation', pipeline: 'video', blobId: 'mp4', blobExt: 'mp4', meta: { issueId: 'calm-task', title: 'Evening calm — video' }, createdAt: Date.now() },
      ], issues: [{ id: 'calm-task', status: 'blocked', title: 'Evening calm', execution: { steps: [{ output: { status: 'ready_for_review', contentIds: ['narration', 'cover', 'movie'] } }] } }] });
      window.electronAPI = { db: { blobs: { read: async id => { if (id === 'cover' && f.failCover) throw Error('Artwork file temporarily unavailable'); return id === 'wav' ? audio : id === 'mp4' ? video : image; } } } };
      createApp({ render: () => h(Library, { rows: f.records, issues: f.issues, onOpenTask: id => f.opened = id }) }).use(createI18nPlugin()).mount('#app');
    }, videoBase64);
    await page.locator('.deliverable-preview audio').waitFor();
    assert.equal(await page.getByText('Awaiting review', { exact: true }).count(), 4, 'Unapproved audio and artwork already exist in Results');
    assert.equal(await page.getByRole('button', { name: 'Copy', exact: true }).count(), 0, 'No meaningless copy-metadata action on audio');
    await page.getByRole('button', { name: 'Open task', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.opened), 'calm-task');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /narration\.wav$/);
    const savedPath = '/tmp/bonzai-results-audio-test.wav';
    await download.saveAs(savedPath);
    const bytes = await readFile(savedPath);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.length, 844);
    await rm(savedPath);
    await page.getByRole('button', { name: /Evening calm — video/ }).click();
    await page.waitForFunction(() => document.querySelector('.deliverable-preview video')?.readyState >= 1);
    assert.equal(await page.locator('.deliverable-preview video').evaluate(video => video.videoWidth), 64, 'Saved MP4 is decodable');
    const videoDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const videoDownload = await videoDownloadPromise;
    const videoPath = join(folder, 'downloaded.mp4');
    await videoDownload.saveAs(videoPath);
    assert.deepEqual(await readFile(videoPath), await readFile(movie), 'The downloaded MP4 contains exactly the saved video bytes');
    await page.getByRole('button', { name: /Evening calm — artwork/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Artwork file temporarily unavailable' }).waitFor();
    await page.evaluate(() => window.fixture.failCover = false);
    await page.getByRole('button', { name: 'Retry preview', exact: true }).click();
    await page.locator('.deliverable-preview img').waitFor();
    await page.evaluate(() => window.fixture.issues[0].execution.steps[0].reviews = [{ decision: 'completed', contentIds: ['narration', 'cover', 'movie'] }]);
    await page.locator('.deliverable-preview__caption').getByText('Approved', { exact: true }).waitFor();
    for (const theme of ['default', 'light']) for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      assert.equal(await page.locator('.deliverable-library').count(), 1);
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${theme}/${width} no overflow`);
      await page.screenshot({ path: `/tmp/bonzai-results-library-${theme}-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await rm(folder, { recursive: true, force: true }); }
});
