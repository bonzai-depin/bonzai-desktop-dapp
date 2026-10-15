import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('roleplay plays raw generated video, reloaded URLs and recovers from a failed load', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(url + '/src/assets/tokens.css');
    await page.setContent('<div id="video-fixture"></div>');
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      const done = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.start();
      for (let i = 0; i < 15; i++) {
        ctx.fillStyle = i % 2 ? '#246' : '#468'; ctx.fillRect(0, 0, 160, 90);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      recorder.stop(); await done; stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      const data = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
      const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Player } = await import('/src/components/skills/RoleplayVideoPlayer.vue');
      window.testVideoData = data;
      window.testVideoSource = ref(data.split(',')[1]);
      createApp({ render: () => h(Player, { source: window.testVideoSource.value }) }).mount('#video-fixture');
    });
    const video = page.locator('#video-fixture video');
    await page.waitForFunction(() => document.querySelector('#video-fixture video')?.readyState >= 2);
    assert.equal(await video.getAttribute('controls'), '');
    await video.evaluate(v => v.play());
    await page.waitForFunction(() => document.querySelector('#video-fixture video').currentTime > 0.1);
    await page.evaluate(() => { window.testVideoSource.value = window.testVideoData; });
    await page.waitForFunction(() => document.querySelector('#video-fixture video')?.readyState >= 2);
    await video.evaluate(v => v.play());
    await page.waitForFunction(() => document.querySelector('#video-fixture video').currentTime > 0.1);
    let fail = true;
    const testBytes = await page.evaluate(() => window.testVideoData.split(',')[1]);
    await page.route('**/test-playback.webm', route => fail ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'video/webm', body: Buffer.from(testBytes, 'base64') }));
    await page.evaluate(origin => { window.testVideoSource.value = `${origin}/test-playback.webm`; }, url);
    await page.getByRole('alert').waitFor();
    fail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.waitForFunction(() => document.querySelector('#video-fixture video').currentTime > 0.1);
    assert.equal(await page.getByRole('alert').count(), 0);
  } finally { await browser.close(); }
});
