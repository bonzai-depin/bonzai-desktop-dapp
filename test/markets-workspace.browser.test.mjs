import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { parse } from '@vue/compiler-sfc'
const url = process.env.BONZAI_UI_URL

test('markets discover all issued asset types, isolate feed failures and route trades without wallet actions', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    page.setDefaultTimeout(8000)
    const errors = [], external = [], origin = new URL(url).origin
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
      const request = new URL(route.request().url())
      if (request.origin !== origin) { external.push(request.href); return route.abort() }
      if (request.pathname === '/src/config/web3.config.js') { const response = await route.fetch(); return route.fulfill({response,body:(await response.text()) + `\nif(window.__marketConfig){for(const key of ['smartAgentIssuance','companionTokenFactory','fineTuneTokenFactory','gameTokenFactory'])CONFIG[key]=window.__marketConfig[key];}window.__marketConfig=CONFIG;`}) }
      for (const [name, fixtureKey, exported] of [['companionToken', 'companion', 'companionTokenService'], ['fineTuneToken', 'models', 'fineTuneTokenService']]) {
        if (request.pathname === `/src/services/${name}.service.js`) return route.fulfill({ contentType: 'application/javascript', body: `const service = { getAllTokenAddresses: (...args) => window.marketFixture.${fixtureKey}.getAllTokenAddresses(...args), getTokenInfo: (...args) => window.marketFixture.${fixtureKey}.getTokenInfo(...args), getTokenProfile: (...args) => window.marketFixture.${fixtureKey}.getTokenProfile(...args) }; export const ${exported} = service; export default service;` })
      }
      if (request.pathname === '/src/services/liquidityVault.service.js') return route.fulfill({contentType:'application/javascript',body:`export async function getLiquidityVault(){return null};export async function transactLiquidityFees(){window.marketFixture.financialCalls++;throw new Error('No automatic fee transactions')}`})
      if (request.pathname === '/src/services/gameToken.service.js') return route.fulfill({ contentType: 'application/javascript', body: `export async function getAllGameTokenAddresses() { return window.marketFixture.empty ? [] : [window.marketFixture.address(4)] }; export async function getGameTokenInfo(address) { return { address, name: 'Neon Valley', symbol: 'NEON', kind: 'game' } };` })
      return route.continue()
    })
    await page.goto(new URL('/src/assets/tokens.css', url).href)
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body><div id="markets-test" style="height:100vh"></div></body></html>')
    const { descriptor } = parse(await readFile(new URL('../src/App.vue', import.meta.url), 'utf8'))
    await page.addStyleTag({ content: descriptor.styles.filter(style => !style.scoped).map(style => style.content).join('\n') })
    await page.evaluate(async () => {
      const { createApp, h } = await import('/node_modules/.vite/deps/vue.js')
      const { CONFIG } = await import('/src/config/web3.config.js')
      const companion = {}, models = {}
      const { createI18nPlugin, i18n } = await import('/src/i18n/index.js')
      const address = number => `0x${String(number).padStart(40, '0')}`
      window.marketFixture = { address, failed: false, empty: false, priceDown: false, metadataDown: false, financialCalls: 0 }
      const fixture = window.marketFixture
      fixture.companion = companion; fixture.models = models
      for (const key of ['companionTokenFactory', 'fineTuneTokenFactory', 'gameTokenFactory']) CONFIG[key].contractAddress = address(100)
      CONFIG.smartAgentIssuance.factoryAddress = address(100)
      CONFIG.companionTokenFactory.contractAddress = null // New issuance must not depend on the older companion factory.
      companion.getAllTokenAddresses = async ({ strict }) => { if (!strict) throw new Error('Must request explicit failure'); if (fixture.failed) throw new Error('Offline'); return fixture.empty ? [] : [address(1), address(5)] }
      companion.getTokenInfo = async address => fixture.metadataDown ? null : ({ address, name: address.endsWith('5') ? 'An extraordinarily long smart agent name used to verify responsive layouts' : 'Avalon', symbol: address.endsWith('5') ? 'LONGAGENTTOKEN' : 'AVA', decimals: 18, agentWallet: fixture.address(101) })
      models.getAllTokenAddresses = async () => fixture.empty ? [] : [address(2), address(3)]
      models.getTokenInfo = async address => ({ address, name: address.endsWith('2') ? 'Studio Language' : 'Open Reasoner', symbol: address.endsWith('2') ? 'STUDIO' : 'OPEN', creator: fixture.address(102) })
      models.getTokenProfile = async address => { if (fixture.metadataDown) throw new Error('Unavailable'); return { modelKind: address.endsWith('2') ? 'fine_tuned' : 'abliterated', description: 'A model published through BonzAI.' } }
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (request, options) => {
        if (!String(request).startsWith('https://api.dexscreener.com')) return originalFetch(request, options)
        if (fixture.priceDown) return new Response('', { status: 503 })
        const token = String(request).split('/').at(-1), number = Number(token)
        if (number === 4) return Response.json({ pairs: [] })
        return Response.json({ pairs: [{ chainId: 'robinhood', baseToken: { address: token }, quoteToken: { symbol: 'WETH' }, dexId: 'uniswap', labels: ['v4'], pairAddress: address(number + 10), priceUsd: number === 5 ? '0.0000000234' : String(number * .025), priceChange: { h24: number === 2 ? -3.5 : 12.4 }, volume: { h24: number * 2000 }, liquidity: { usd: (6 - number) * 10000 }, txns: { h24: { buys: 28, sells: 12 } } }] })
      }
      const { web3Service } = await import('/src/services/web3.service.js')
      for (const method of ['getSigner', 'getBrowserProvider', 'switchNetwork']) web3Service[method] = async () => { fixture.financialCalls++; throw new Error('No financial actions in market exploration') }
      const { marketHistoryKey } = await import('/src/services/marketData.js')
      const now = Math.floor(Date.now() / 1000)
      localStorage.setItem(marketHistoryKey(CONFIG.stakingEconomy.chainId), JSON.stringify(Object.fromEntries([1, 2, 3, 5].map(number => [address(number), Array.from({ length: 20 }, (_, index) => ({ time: now - (20 - index) * 240, value: (number * .025) * (1 + Math.sin(index * .4) * .15) }))]))))
      i18n.setLocale('en')
      const { default: Markets } = await import('/src/components/Markets.vue')
      window.remountMarkets = () => { window.marketApp?.unmount(); window.marketApp = createApp({ render: () => h(Markets) }).use(createI18nPlugin()); window.marketApp.mount('#markets-test') }; window.remountMarkets()
    })
    const markets = page.locator('.markets')
    await page.locator('.markets__table tbody tr').nth(4).waitFor().catch(async error => { throw new Error(`${error.message}\n${await page.locator('body').innerText()}\n${JSON.stringify(errors)}`) })
    assert.equal(await page.locator('.markets__table tbody tr').count(), 5)
    await page.locator('.market-price-chart canvas').first().waitFor()
    assert.match(await markets.innerText(), /Uncensored model/)
    assert.doesNotMatch(await markets.innerText(), /LP locked|fixed supply|96%/)
    const trade = page.getByRole('region', { name: 'Selected asset' }).getByRole('link', { name: 'Buy AVA' })
    assert.equal(new URL(await trade.getAttribute('href')).searchParams.get('chain'), 'robinhood')
    await page.getByRole('button', { name: 'Sell', exact: true }).click()
    assert.equal(new URL(await page.getByRole('link', { name: 'Sell AVA' }).getAttribute('href')).searchParams.get('inputCurrency'), `0x${'1'.padStart(40, '0')}`)
    await page.getByRole('button', { name: 'Add AVA to watchlist' }).click()
    await page.evaluate(() => window.remountMarkets())
    await page.locator('.markets__table tbody tr').nth(4).waitFor()
    await page.getByRole('button', { name: 'Watchlist 1' }).click()
    assert.equal(await page.locator('.markets__table tbody tr').count(), 1)
    await page.getByRole('button', { name: 'Remove AVA from watchlist' }).click()
    await page.getByRole('heading', { name: 'Keep your next move in view.' }).waitFor()
    await page.getByRole('button', { name: 'Explore all assets' }).click()
    await page.getByRole('searchbox', { name: 'Search tokens' }).fill('NEON')
    await page.getByRole('heading', { name: 'Neon Valley', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'No indexed liquidity' }).isDisabled(), true)
    assert.equal(await page.locator('.markets__trade a').count(), 0)
    await page.getByRole('searchbox').fill('does-not-exist')
    await page.getByRole('heading', { name: 'No matching assets.' }).waitFor()
    await page.getByRole('button', { name: 'Explore all assets' }).click()
    await page.getByRole('combobox', { name: 'Sort tokens' }).selectOption('change')
    assert.match(await page.locator('.markets__table tbody tr').last().innerText(), /NEON/)
    await page.getByRole('tab').first().focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.getByRole('tab').nth(1).getAttribute('aria-selected'), 'true')
    assert.equal(await page.locator('.markets__table tbody tr').count(), 2)
    await page.getByRole('tab').first().click()
    await page.getByRole('button', { name: 'Explore Avalon' }).click()

    for (const theme of ['default', 'light', 'terminal', 'warm', 'trackline']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      for (const width of [1440, 900, 360]) {
        await page.setViewportSize({ width, height: 1100 })
        assert.ok(await markets.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme}/${width}: market fits`)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: document fits`)
        assert.ok(await page.locator('.markets__trade-action').evaluate(element => { const button = element.getBoundingClientRect(), root = element.closest('.markets__trade').getBoundingClientRect(); return button.right <= root.right - 12 && button.left >= root.left + 12 }), `${theme}/${width}: trade control fits`)
        if (width === 360 && theme === 'default') { await page.locator('.markets__terminal').evaluate(element => element.scrollIntoView({ block: 'start' })); await page.screenshot({ path: '/tmp/bonzai-markets-mobile.png' }) }
        if (['default', 'light'].includes(theme) && width === 1440) {
          await markets.evaluate(element => { element.scrollTop = 0 })
          await page.screenshot({ path: `/tmp/bonzai-markets-${theme}.png` })
          await page.locator('.markets__terminal').evaluate(element => element.scrollIntoView({ block: 'start' }))
          await page.screenshot({ path: `/tmp/bonzai-markets-detail-${theme}.png` })
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.getByRole('button', { name: /Explore An extraordinarily/ }).click()
    assert.ok(await markets.evaluate(element => element.scrollWidth <= element.clientWidth), 'long name and tiny price fit')
    await page.evaluate(() => { window.marketFixture.failed = true })
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Smart agents listings are unavailable' }).waitFor()
    assert.equal(await page.locator('.markets__table tbody tr').count(), 3)
    await page.evaluate(() => { window.marketFixture.failed = false; window.marketFixture.priceDown = true; window.marketFixture.metadataDown = true })
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.markets__quote-status').length === 5)
    assert.equal(await page.locator('.markets__trade a').count(), 0)
    assert.match(await markets.innerText(), /Some token details could not be loaded/)
    assert.equal(await page.locator('.markets__table tbody tr').count(), 5, 'issued assets survive missing metadata')
    await page.evaluate(() => { window.marketFixture.empty = true })
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByRole('heading', { name: 'Created here. Discovered here.' }).waitFor()
    assert.match(await markets.innerText(), /Tokens issued through BonzAI appear here as they launch/)
    await page.evaluate(async () => { const { CONFIG } = await import('/src/config/web3.config.js'); for (const key of ['companionTokenFactory', 'fineTuneTokenFactory', 'gameTokenFactory']) CONFIG[key].contractAddress = null; CONFIG.smartAgentIssuance.factoryAddress = null })
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByText(/Token listings will open when/).waitFor()
    assert.equal(await page.evaluate(() => window.marketFixture.financialCalls), 0)
    assert.deepEqual(external, [])
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
