import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { parse } from '@vue/compiler-sfc';

const url = process.env.BONZAI_UI_URL;
test('currency basket keeps exact balances, isolated failures and usable layouts without financial actions', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });
    page.setDefaultTimeout(10000);
    const external = [];
    const origin = new URL(url).origin;
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.goto(new URL('/src/assets/tokens.css', url).href);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body><div id="basket-test"></div></body></html>');
    const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
    const { descriptor } = parse(appSource);
    await page.addStyleTag({ content: descriptor.styles.filter(style => !style.scoped).map(style => style.content).join('\n') });
    await page.evaluate(async () => {
      const { createApp, h, reactive } = await import('/node_modules/.vite/deps/vue.js');
      const { ethers } = await import('/node_modules/.vite/deps/ethers.js');
      const { CONFIG } = await import('/src/config/web3.config.js');
      const { web3Service } = await import('/src/services/web3.service.js');
      const { default: RewardsView } = await import('/src/components/RewardsView.vue');
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js');
      i18n.setLocale('en');
      const wallet = '0x0000000000000000000000000000000000000001';
      const usdc = '0x0000000000000000000000000000000000000002';
      const social = '0x0000000000000000000000000000000000000003';
      const broken = '0x0000000000000000000000000000000000000004';
      CONFIG.basketRewards.contractAddress = '0x0000000000000000000000000000000000000010';
      CONFIG.stakingEconomy.stakingVaultAddress = '0x0000000000000000000000000000000000000011';
      CONFIG.stakingEconomy.tokenAddress = '0x0000000000000000000000000000000000000012';
      CONFIG.stakingEconomy.basketRewardsAddress = CONFIG.basketRewards.contractAddress;
      CONFIG.mintPool.contractAddress = null;
      const iface = new ethers.Interface([
        'function currentEpoch() view returns(uint256)', 'function rewardCurrencyCount() view returns(uint256)',
        'function epochDuration() view returns(uint256)', 'function genesisTime() view returns(uint256)',
        'function getRewardCurrencies(uint256,uint256) view returns(address[])',
        'function claimable(address,address,uint256) view returns(uint256)',
        'function symbol() view returns(string)', 'function decimals() view returns(uint8)',
        'function positionOf(address) view returns(uint256 amount,uint256 lockedUntil,uint32 contributionScore,uint16 lockMultiplier,uint16 contributionMultiplier,uint8 tier,uint256 weight)',
        'function totalStaked() view returns(uint256)', 'function rewardActive(address) view returns(bool)',
        'function rewardExitAt(address) view returns(uint256)', 'function REWARD_EXIT_DELAY() view returns(uint256)',
      ]);
      window.basketFixture = { broken: false, empty: false, offline: false, financialCalls: 0, reads: [], currentEpoch: 1 };
      const fixture = window.basketFixture;
      const currencies = () => [ethers.ZeroAddress, usdc, social, ...(fixture.broken ? [broken] : [])];
      const provider = { call: async ({ data, to }) => {
        if (fixture.offline) throw new Error('Rewards RPC unavailable. Refresh to retry.');
        const fn = iface.getFunction(data.slice(0, 10));
        const args = iface.decodeFunctionData(fn, data);
        fixture.reads.push(fn.name);
        const encode = values => iface.encodeFunctionResult(fn, values);
        if (fn.name === 'currentEpoch') return encode([fixture.currentEpoch]);
        if (fn.name === 'rewardCurrencyCount') return encode([currencies().length]);
        if (fn.name === 'epochDuration') return encode([604800]);
        if (fn.name === 'genesisTime') return encode([1700000000]);
        if (fn.name === 'getRewardCurrencies') return encode([currencies().slice(Number(args[0]), Number(args[0]) + Number(args[1]))]);
        if (to.toLowerCase() === broken) throw new Error('This currency is temporarily unavailable.');
        if (fn.name === 'symbol') return encode([to.toLowerCase() === usdc ? 'USDC' : 'AVALON']);
        if (fn.name === 'decimals') return encode([to.toLowerCase() === usdc ? 6 : 18]);
        if (fn.name === 'claimable') {
          if (args[0].toLowerCase() !== wallet) throw new Error('Unexpected wallet');
          const amount = args[1].toLowerCase() === usdc ? 123456789012345678901234567n
            : args[1].toLowerCase() === social ? 123456789012345678901234567890123456789n : 1250000000000000000n;
          return encode([fixture.empty ? 0n : amount]);
        }
        if (fn.name === 'positionOf') return encode([33000n * 10n ** 18n, 0, 0, 10000, 10000, 5, 33000n * 10n ** 18n]);
        if (fn.name === 'totalStaked') return encode([100000n * 10n ** 18n]);
        if (fn.name === 'rewardActive') return encode([true]);
        if (fn.name === 'rewardExitAt') return encode([0]);
        if (fn.name === 'REWARD_EXIT_DELAY') return encode([90 * 86400]);
        throw new Error(`Unexpected read ${fn.name}`);
      } };
      web3Service.getProvider = async () => provider;
      const blockFinancial = async () => { fixture.financialCalls++; throw new Error('Financial action forbidden in read-only UI fixture'); };
      web3Service.getBrowserProvider = blockFinancial;
      web3Service.getSigner = blockFinancial;
      web3Service.switchNetwork = blockFinancial;
      // The production state is readonly. Replace its exported test seam rather
      // than attempting to mutate the real connection state or open a wallet.
      web3Service.state = reactive({ ...web3Service.state, walletAddress: wallet, currentChainId: Number(CONFIG.basketRewards.chainId) });
      window.basketWeb3 = web3Service;
      createApp({ render: () => h(RewardsView) }).use(createI18nPlugin()).mount('#basket-test');
    });
    const modal = page.locator('.rewards-view');
    assert.equal(await page.getByRole('dialog').count(), 0, 'rewards is a page, not a dialog');
    await modal.waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.basket-currency').length === 3, null, { timeout: 10000 }).catch(async failure => {
      throw new Error(`${failure.message}\n${await modal.innerText()}\nReads: ${JSON.stringify(await page.evaluate(() => window.basketFixture.reads))}`);
    });
    const row = symbol => modal.locator('.basket-currency').filter({ has: page.locator('strong', { hasText: new RegExp(`^${symbol}$`) }) });
    assert.equal(await row('USDC').locator('.basket-amount').innerText(), '123456789012345678901.234567');
    assert.equal(await row('AVALON').locator('.basket-amount').innerText(), '123456789012345678901.234567890123456789');
    assert.equal(await row('ETH').locator('.basket-amount').innerText(), '1.25');
    assert.match(await modal.innerText(), /LVL5/);
    assert.doesNotMatch(await modal.innerText(), /\[object Object\]/);

    await page.evaluate(() => { window.basketFixture.broken = true; });
    await modal.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.basket-currency').length === 4);
    assert.equal(await row('USDC').locator('.basket-amount').innerText(), '123456789012345678901.234567');
    assert.equal(await modal.locator('.basket-currency').last().getByRole('button').isDisabled(), true);
    assert.match(await modal.locator('.basket-currency').last().innerText(), /temporarily unavailable/);

    for (const theme of ['default', 'light', 'terminal', 'sunset']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const width of [1440, 800, 360]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await modal.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme}/${width}: basket does not overflow`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: page does not overflow`);
        for (const button of await modal.locator('.basket-currency button').all()) {
          assert.ok(await button.evaluate(element => { const a = element.getBoundingClientRect(); const b = element.closest('.rewards-view').getBoundingClientRect(); return a.left >= b.left && a.right <= b.right; }), `${theme}/${width}: claim control stays inside page`);
        }
        if (width === 360) await page.screenshot({ path: `/tmp/bonzai-basket-${theme === 'default' ? 'dark' : theme}.png` });
      }
    }
    await page.evaluate(() => { window.basketFixture.broken = false; window.basketFixture.empty = true; });
    await modal.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.basket-currency').length === 3 && [...document.querySelectorAll('.basket-currency button')].every(button => button.disabled));
    assert.equal(await row('USDC').locator('.basket-amount').innerText(), '0.0');

    await page.evaluate(() => { window.basketFixture.offline = true; });
    await modal.getByRole('button', { name: 'Refresh', exact: true }).click();
    await modal.locator('.rewards-basket').getByRole('alert').waitFor();
    assert.match(await modal.locator('.rewards-basket').getByRole('alert').innerText(), /RPC unavailable/);
    assert.equal(await modal.getByRole('button', { name: 'Refresh', exact: true }).isEnabled(), true);
    await page.evaluate(() => { window.basketFixture.offline = false; window.basketFixture.empty = false; });
    await modal.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.basket-currency').length === 3);
    assert.equal(await page.evaluate(() => window.basketFixture.financialCalls), 0);
    // Exploring levels and reviewing a stake must not invoke the wallet.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await modal.getByRole('button', { name: /^LVL6/ }).click();
    assert.equal(await modal.getByLabel('Add to your stake').inputValue(), '17000.0');
    await modal.getByRole('button', { name: 'Review stake', exact: true }).click();
    const review = modal.getByRole('region', { name: 'Review membership action' });
    await review.waitFor();
    assert.match(await review.innerText(), /50000.0 BONZAI/);
    assert.equal(await page.evaluate(() => window.basketFixture.financialCalls), 0);
    await review.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await review.count(), 0);
    await page.evaluate(() => { window.basketWeb3.state.walletAddress = ''; });
    await modal.getByRole('button', { name: 'Connect to get started' }).waitFor();
    assert.equal(await modal.locator('.basket-currency').count(), 0, 'disconnect removes prior wallet rewards');
    assert.equal(await page.evaluate(() => window.basketFixture.financialCalls), 0);
    assert.deepEqual(external, [], 'the fixture never requests an external service');
  } finally { await browser.close(); }
});
