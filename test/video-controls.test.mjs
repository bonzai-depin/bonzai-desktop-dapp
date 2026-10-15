import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual Electron callbacks without starting the app or inference.
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const permissions = main.slice(main.indexOf('function isTrustedRendererUrl('), main.indexOf('app.on("ready",'));
function handlers() {
  let request, check;
  vm.runInNewContext(`${permissions}\nconfigureRendererPermissions();`, {
    VITE_DEV_SERVER_URL: 'http://localhost:5173',
    session: { defaultSession: {
      setPermissionRequestHandler: fn => { request = fn; },
      setPermissionCheckHandler: fn => { check = fn; },
    } },
  });
  return { request, check };
}
test('video fullscreen is allowed for the app, while external pages and unrelated permissions remain blocked', () => {
  const { request, check } = handlers();
  for (const [url, permission, expected] of [
    ['file:///app/index.html', 'fullscreen', true],
    ['http://localhost:5173/', 'fullscreen', true],
    ['https://external.example/', 'fullscreen', false],
    ['file:///app/index.html', 'geolocation', false],
    ['file:///app/index.html', 'media', true],
  ]) {
    const contents = { getURL: () => url };
    request(contents, permission, allowed => assert.equal(allowed, expected), { requestingUrl: url });
    assert.equal(check(contents, permission, url), expected);
  }
});
