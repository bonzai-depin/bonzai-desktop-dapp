import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../src/config/web3.config.js';
import { requestConnection, finishConnection, cancelConnectionDialog, connectionDialog } from '../src/services/connectionDialog.service.js';
import { waitForWalletAddress } from '../src/services/walletConnection.js';
const address = '0x0000000000000000000000000000000000000001';
const nextAddress = '0x0000000000000000000000000000000000000002';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
let fixtureNumber = 0;

// Execute the production service/store, replacing only their wallet, network and
// unrelated app integrations. No wallet window or network request is opened.
async function connectionFixture({ readNetwork = async () => ({ chainId: 1n }), readBalance = async () => ethers.parseEther('25'), readRpc } = {}) {
  const key = `__connectionFixture${++fixtureNumber}`;
  const fixture = {
    address, destroyed: 0, networkReads: 0, balanceReads: [],
    authService: { logout() {} }, authVault: { lockVault() {} },
    CONFIG: { ...CONFIG, tokens: { BONZAI: { decimals: 18, ethereum: address, arbitrum: address, base: address, robinhood: address } } },
    defineChain: value => value,
    createAppKit: () => { throw new Error('Unexpected external wallet request'); },
    EthersAdapter: class {}, mainnet: {}, arbitrum: {}, base: {}, lukso: {},
    registerWeb3Service: service => { fixture.state = service.state; },
    registerWeb3ServiceForLukso() {},
    ethers: {
      ...ethers,
      JsonRpcProvider: class {
        constructor(_request, chainId) { this.chainId = chainId; }
        send() { return readRpc ? readRpc(this.chainId) : Promise.resolve(this.chainId); }
        destroy() {}
      },
      BrowserProvider: class {
        constructor(provider) { this.provider = provider; }
        getNetwork() { fixture.networkReads++; return readNetwork(); }
        destroy() { fixture.destroyed++; }
      },
      Contract: class {
        constructor(_token, _abi, provider) { this.provider = provider; }
        balanceOf(wallet) {
          fixture.balanceReads.push(wallet);
          return readBalance(wallet, this.provider.chainId);
        }
      },
    },
  };
  globalThis[key] = fixture;
  globalThis.window = { electronAPI: { wallet: { getAddress: async () => fixture.address }, onWalletAddress: () => () => {} } };
  const url = new URL('../src/services/web3.service.js', import.meta.url);
  let source = await readFile(url, 'utf8');
  for (const [specifier, names] of [
    ['ethers', 'ethers'], ['./auth.service.js', 'authService'], ['./authVault.service.js', 'authVault'],
    ['./walletProvider.service.js', 'registerWeb3Service'], ['./lukso.service.js', 'registerWeb3ServiceForLukso'],
    ['@reown/appkit/vue', 'createAppKit'], ['@reown/appkit-adapter-ethers', 'EthersAdapter'],
    ['@reown/appkit/networks', 'mainnet, arbitrum, base, lukso, defineChain'],
  ]) {
    const declaration = `import { ${names} } from "${specifier}";`;
    assert.ok(source.includes(declaration), `integration import exists: ${specifier}`);
    source = source.replace(declaration, `const { ${names} } = globalThis.${key};`);
  }
  source = source.replace('import { CONFIG, ECONOMY_NETWORK_KEY } from "../config/web3.config.js";', `const { CONFIG } = globalThis.${key}; const ECONOMY_NETWORK_KEY = 'robinhood';`);
  source = source.replace(/from ["']([^"']+)["']/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)}'`);
  fixture.service = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis[key];
  return fixture;
}

test('connection entry points share one pending choice, retain errors and resolve cancellation', async () => {
  const first = requestConnection(), second = requestConnection();
  assert.equal(first, second);
  finishConnection({ success: false, error: 'Wallet rejected' });
  assert.equal(connectionDialog.open, true);
  assert.equal(connectionDialog.error, 'Wallet rejected');
  cancelConnectionDialog();
  assert.equal((await first).cancelled, true);
  const retry = requestConnection();
  finishConnection({ success: true, address });
  assert.equal((await retry).address, address);
  assert.equal(connectionDialog.open, false);
});

test('cancelled email sign-in removes wallet listener and cannot authenticate later', async () => {
  let receive, removed = 0;
  const controller = new AbortController();
  const result = waitForWalletAddress({ wallet: { getAddress: async () => null }, onWalletAddress: cb => { receive = cb; return () => removed++; } }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(result, /cancelled/);
  receive(address);
  assert.equal(removed, 1);
});

test('cached and timed-out wallet sessions both release their listeners', async () => {
  let removed = 0;
  const api = { wallet: { getAddress: async () => address }, onWalletAddress: () => () => removed++ };
  assert.equal(await waitForWalletAddress(api), address);
  assert.equal(removed, 1);
  api.wallet.getAddress = async () => null;
  await assert.rejects(waitForWalletAddress(api, { timeoutMs: 5 }), /timed out/);
  assert.equal(removed, 2);
});

test('cancelling after the address arrives cannot commit identity or clobber a new attempt', async () => {
  const oldNetwork = deferred(), newNetwork = deferred();
  let calls = 0;
  const fixture = await connectionFixture({ readNetwork: () => (++calls === 1 ? oldNetwork : newNetwork).promise });
  const controller = new AbortController();
  const first = fixture.service.connectWithPrivy({ signal: controller.signal });
  await flush();
  assert.equal(fixture.networkReads, 1);
  assert.equal(fixture.state.walletAddress, null, 'receiving an address does not publish a session');
  assert.equal(fixture.state.isAuthenticated, false);
  assert.equal(fixture.service.getEip1193Provider(), null, 'pending wallet cannot be used for signing');
  controller.abort();
  assert.equal(fixture.state.isConnecting, false, 'cancellation releases the pending UI immediately');
  fixture.address = nextAddress;
  const second = fixture.service.connectWithPrivy();
  assert.equal((await first).cancelled, true);
  await flush();
  assert.equal(fixture.state.isConnecting, true, 'old finally cannot release the new attempt');
  oldNetwork.reject(new Error('Old RPC failed after cancellation'));
  await flush();
  assert.equal(fixture.state.isConnecting, true);
  assert.equal(fixture.state.error, null, 'old RPC error cannot overwrite the new attempt');
  newNetwork.resolve({ chainId: 1n });
  assert.equal((await second).success, true);
  assert.equal(fixture.state.walletAddress, nextAddress);
  assert.equal(fixture.state.isAuthenticated, true);
  assert.equal(fixture.state.balances.total, 100);
  assert.deepEqual(await fixture.service.getEip1193Provider().request({ method: 'eth_accounts' }), [nextAddress]);
  assert.ok(fixture.balanceReads.every(wallet => wallet === nextAddress));
  assert.equal(fixture.destroyed, 1, 'only the cancelled temporary provider is destroyed');
});

test('late balance results for a cancelled email wallet never replace a newer wallet or its balances', async () => {
  const oldBalance = deferred();
  const fixture = await connectionFixture({ readBalance: wallet => wallet === address ? oldBalance.promise : Promise.resolve(ethers.parseEther('9')) });
  const controller = new AbortController();
  const first = fixture.service.connectWithPrivy({ signal: controller.signal });
  await flush();
  assert.equal(fixture.balanceReads.length, 4);
  assert.equal(fixture.state.walletAddress, null);
  assert.equal(fixture.state.balances.total, 0);
  controller.abort();
  fixture.address = nextAddress;
  const second = fixture.service.connectWithPrivy();
  assert.equal((await first).cancelled, true);
  assert.equal((await second).success, true);
  assert.equal(fixture.state.balances.total, 36);
  oldBalance.resolve(ethers.parseEther('1000000'));
  await flush();
  assert.equal(fixture.state.walletAddress, nextAddress);
  assert.equal(fixture.state.balances.total, 36);
  assert.equal(fixture.state.isConnecting, false);
  assert.equal(fixture.state.error, null);
});

test('disconnect invalidates an email session while RPC initialization is still pending', async () => {
  const rpc = deferred();
  const fixture = await connectionFixture({ readRpc: async chainId => { await rpc.promise; return chainId; } });
  const pending = fixture.service.connectWithPrivy();
  await flush();
  await fixture.service.disconnectWallet();
  assert.equal((await pending).cancelled, true);
  rpc.resolve();
  await flush();
  assert.equal(fixture.state.walletAddress, null);
  assert.equal(fixture.state.isAuthenticated, false);
  assert.equal(fixture.state.isConnecting, false);
  assert.equal(fixture.service.getEip1193Provider(), null);
  assert.equal(fixture.balanceReads.length, 0);
});

test('store cleanup from a cancelled sign-in preserves a later wallet attempt and avoids a second balance wait', async () => {
  const first = deferred(), external = deferred(), levels = deferred();
  let emailCalls = 0, balanceCalls = 0, levelCalls = 0;
  const dependencies = {
    web3Service: {
      state: { balances: { total: 0 } },
      connectWithPrivy: () => ++emailCalls === 1 ? first.promise : Promise.resolve({ success: true }),
      connectWallet: () => external.promise,
      fetchAllBalances: async () => { balanceCalls++; },
    },
    levelService: { checkAllLevels: () => { levelCalls++; return levels.promise; } },
    agentService: {}, authService: {},
  };
  const url = new URL('../src/stores/web3.store.js', import.meta.url);
  let source = await readFile(url, 'utf8');
  const key = `__connectionStore${++fixtureNumber}`;
  globalThis[key] = dependencies;
  source = source.replace("import { defineStore } from 'pinia';", 'const defineStore = (_name, setup) => setup;');
  for (const name of ['web3Service', 'levelService', 'agentService']) {
    source = source.replace(new RegExp(`^import \\{ ${name} \\} from .*;$`, 'm'), `const { ${name} } = globalThis.${key};`);
  }
  source = source.replace(/^import \* as authService from .*;$/m, `const { authService } = globalThis.${key};`);
  source = source.replace(/from ["']([^"']+)["']/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)}'`);
  const { useWeb3Store } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis[key];
  const store = useWeb3Store();
  const controller = new AbortController();
  const oldAttempt = store.connectWithPrivy({ signal: controller.signal });
  controller.abort();
  const newAttempt = store.connect();
  first.reject(new Error('Cancelled wallet rejected late'));
  await oldAttempt;
  assert.equal(store.isConnecting.value, true, 'old finally does not clear a new external-wallet attempt');
  assert.equal(store.error.value, null, 'old catch does not set a new attempt’s error');
  external.resolve({ success: false, error: 'Current wallet rejected' });
  await newAttempt;
  assert.equal(store.isConnecting.value, false);
  assert.equal(store.error.value, 'Current wallet rejected');
  assert.equal((await store.connectWithPrivy()).success, true, 'level loading does not keep a committed sign-in pending');
  assert.equal(balanceCalls, 0, 'the staged balance result is not fetched a second time');
  assert.equal(levelCalls, 1);
  levels.resolve();
});

test('the connection modal explains the configured network and stays usable at narrow widths', { skip: !process.env.BONZAI_UI_URL, timeout: 60000 }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.route('**/src/stores/web3.store.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'export const useWeb3Store = () => window.connectionTestStore;' }));
    await page.route('**/src/config/web3.config.js*', route => route.fulfill({ contentType: 'text/javascript', body: "export const CONFIG = window.connectionTestConfig; export const ECONOMY_NETWORK_KEY = 'testNetwork';" }));
    await page.goto(new URL('/src/assets/tokens.css', process.env.BONZAI_UI_URL).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><style>body{margin:0;background:var(--bz-canvas)}</style></head><body><div id="connection-test"></div></body></html>');
    const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
    const appStyles = appSource.split('<style>')[1].split('</style>')[0].replaceAll('./assets/', '/src/assets/');
    await page.addStyleTag({ content: appStyles });
    await page.evaluate(async network => {
      window.connectionTestConfig = { networks: { testNetwork: network } };
      const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
      const { default: ConnectionModal } = await import('/src/components/ConnectionModal.vue');
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      const { requestConnection } = await import('/src/services/connectionDialog.service.js');
      const { CONFIG, ECONOMY_NETWORK_KEY } = await import('/src/config/web3.config.js');
      i18n.setLocale('en');
      window.electronAPI = { wallet: { open: async () => ({ ok: true }) } };
      window.connectionTestStore = { connectWithPrivy: async ({ signal }) => { window.connectionTestSignal = signal; return new Promise(resolve => signal.addEventListener('abort', () => resolve({ success: false, cancelled: true }))); } };
      window.mountConnectionTest = chainId => {
        window.connectionTestApp?.unmount();
        CONFIG.networks[ECONOMY_NETWORK_KEY].chainId = chainId;
        window.connectionTestApp = createApp({ render: () => h(ConnectionModal) }).use(createI18nPlugin());
        window.connectionTestApp.mount('#connection-test');
        requestConnection();
      };
      window.expectedNetworkName = CONFIG.networks[ECONOMY_NETWORK_KEY].name;
      window.mountConnectionTest(4663);
    }, CONFIG.networks[ECONOMY_NETWORK_KEY]);
    const dialog = page.locator('.connection-modal');
    await dialog.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const networkNotice = dialog.locator('#connection-email-network');
    assert.match(await networkNotice.innerText(), /Email sign-in supports Ethereum only/);
    assert.ok((await networkNotice.innerText()).includes(await page.evaluate(() => window.expectedNetworkName)));
    assert.equal(await dialog.getByRole('button', { name: /Sign in/ }).getAttribute('aria-describedby'), 'connection-email-network');
    for (const theme of ['default', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const width of [1280, 360]) {
        await page.setViewportSize({ width, height: 700 });
        assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme}/${width}: content stays within modal`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: no horizontal overflow`);
        if (process.env.BONZAI_UI_SCREENSHOTS && width === 360) await page.screenshot({ path: `${process.env.BONZAI_UI_SCREENSHOTS}/connection-${theme}-${width}.png` });
      }
    }
    await dialog.getByRole('button', { name: /Sign in/ }).click();
    await dialog.getByRole('status').waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.connectionTestSignal.aborted), true);
    await page.evaluate(() => window.mountConnectionTest(1));
    await dialog.waitFor();
    assert.equal(await dialog.locator('#connection-email-network').count(), 0, 'Ethereum configuration needs no network mismatch notice');
  } finally { await browser.close(); }
});
