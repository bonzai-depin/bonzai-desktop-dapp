import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'

const url = process.env.BONZAI_UI_URL
test('RC shell, modal keyboard paths and constrained layouts', { skip: !url, timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.stack || error.message))
    await page.goto(url)
    const welcome = page.locator('.welcome-window')
    await welcome.waitFor()
    await page.waitForFunction(() => document.querySelector('.welcome-window')?.contains(document.activeElement))
    assert.equal(await page.locator('#app').evaluate(element => element.inert), true)
    const footer = await welcome.locator('.welcome-footer').boundingBox()
    assert.ok(footer.y + footer.height <= 600, 'welcome primary action stays within the window')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await welcome.evaluate(element => element.contains(document.activeElement)), true)
    await page.keyboard.press('Escape')
    await welcome.waitFor({ state: 'detached' })
    assert.equal(await page.locator('#app').evaluate(element => element.inert), false)

    await page.locator('.bz-sidebar__model').focus()
    await page.keyboard.press('Control+k')
    const dialog = page.locator('.bz-cmdk__shell')
    await dialog.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
    await page.keyboard.press('ArrowDown')
    const optionId = await page.getByRole('combobox').getAttribute('aria-activedescendant')
    assert.equal(await page.locator(`[id="${optionId}"]`).getAttribute('aria-selected'), 'true')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Close')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await page.locator('.bz-sidebar__model').evaluate(element => element === document.activeElement), true)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox').fill('Network settings')
    await page.keyboard.press('Enter')
    await page.locator('.network-modal').waitFor()
    await page.waitForFunction(() => document.querySelector('.network-modal')?.contains(document.activeElement))
    await page.keyboard.press('Escape')
    await page.locator('.network-modal').waitFor({ state: 'detached' })
    assert.equal(await page.locator('#app').evaluate(element => element.inert), false)

    for (const theme of ['default', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
      for (const width of [1280, 1024, 800]) {
        await page.setViewportSize({ width, height: width === 800 ? 600 : 768 })
        for (const mode of ['chat', 'image', 'music', 'video', 'company', 'harness', 'markets', 'economy', 'licenses', 'memory', 'agent', 'tune', 'uncensor']) {
          await page.evaluate(mode => window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: mode })), mode)
          await page.waitForTimeout(180)
          const dimensions = await page.evaluate(() => ({
            viewport: innerWidth,
            document: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
            backgrounds: [...document.querySelectorAll('.bz-main > .background')].map(e => e.getBoundingClientRect().right),
          }))
          assert.ok(dimensions.document <= width, `${theme} ${width} ${mode}: ${JSON.stringify(dimensions)}`)
          assert.ok(dimensions.backgrounds.every(right => right <= width + 1), `${mode} background exceeds content grid`)
        }
        assert.equal(await page.locator('.bz-sidebar__model').isVisible(), true)
        for (const button of await page.locator('.bz-sidebar__item').all()) {
          assert.ok(await button.getAttribute('aria-label'))
          assert.ok((await button.boundingBox()).height >= 44)
        }
      }
    }
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'markets' })))
    await page.getByRole('tab').first().focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.getByRole('tab').nth(1).getAttribute('aria-selected'), 'true')
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'economy' })))
    assert.equal(await page.locator('.bz-economy__stake-form').count(), 0)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:open-rewards')))
    await page.locator('.rewards-view').waitFor()
    assert.equal(await page.locator('.rewards-modal').count(), 0)
    assert.equal(await page.locator('.rewards-hero').count(), 1)
    assert.equal(await page.locator('.bz-sidebar').getByRole('button', { name: 'Rewards', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.rewards-view').isVisible(), true, 'Escape does not dismiss a full page')
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'chat' })))
    const chatDownload = page.locator('.bz-text-chat__setup .bz-download-requirement')
    await chatDownload.waitFor()
    assert.equal(await chatDownload.count(), 1, 'setup offers one selected model')
    assert.match(await chatDownload.innerText(), /language/)
    assert.doesNotMatch(await chatDownload.innerText(), /unknown|runtime depends|larger outputs/i)
    assert.equal(await page.getByRole('button', { name: 'Show chat history', exact: true }).getAttribute('aria-expanded'), 'false')
    assert.equal(await page.locator('.bz-model-rec__reason').count(), 0)
    if (process.env.BONZAI_UI_SCREENSHOTS) await page.screenshot({ path: `${process.env.BONZAI_UI_SCREENSHOTS}/bonzai-v4-chat.png` })
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'memory' })))
    await page.locator('.memory-empty__actions').waitFor()
    assert.equal(await page.locator('.memory-rail, .memory-detail, .memory-stage__actions').count(), 0)
    assert.equal(await page.locator('.memory-empty__actions button').count(), 3)
    if (process.env.BONZAI_UI_SCREENSHOTS) await page.screenshot({ path: `${process.env.BONZAI_UI_SCREENSHOTS}/bonzai-v4-memory.png` })
    await page.getByRole('button', { name: 'Start chat', exact: true }).click()
    await page.locator('.bz-text-chat').waitFor()
    for (const locale of ['en', 'fr', 'ru']) {
      await page.evaluate(async locale => {
        const { i18n } = await import('/src/i18n/index.js')
        i18n.setLocale(locale)
        window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'music' }))
      }, locale)
      const language = page.locator('.audio-language-select select')
      await language.waitFor()
      assert.equal(await language.inputValue(), 'en', `${locale}: labels must not alter the synthesis language`)
      assert.ok(await language.getAttribute('aria-label'))
    }
    await page.evaluate(async () => {
      const { i18n } = await import('/src/i18n/index.js')
      i18n.setLocale('en')
    })
    await page.locator('.audio-control-row').first().getByRole('button', { name: 'Music', exact: true }).click()
    const musicModes = page.locator('.music-mode-controls')
    assert.equal(await musicModes.getByRole('button', { name: 'Simple', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('.advanced-params, .music-section--palette').count(), 0)
    assert.equal(await page.getByRole('button', { name: /Draft lyrics/ }).isVisible(), true)
    if (process.env.BONZAI_UI_SCREENSHOTS) await page.screenshot({ path: `${process.env.BONZAI_UI_SCREENSHOTS}/bonzai-v4-music.png` })
    await musicModes.getByRole('button', { name: 'Advanced', exact: true }).click()
    const styles = page.getByRole('searchbox', { name: 'Search music styles' })
    await styles.fill('jazz')
    const tags = page.locator('.music-section--palette .dimension-tags button')
    assert.ok(await tags.count() > 0)
    for (const tag of await tags.all()) assert.match(await tag.innerText(), /jazz/i)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: 'game' })))
    await page.locator('.bz-3d-advanced').waitFor()
    assert.equal(await page.locator('.bz-3d-advanced').getAttribute('open'), null)
    assert.equal(await page.getByRole('button', { name: 'Clear', exact: true }).isDisabled(), true)
    await page.locator('.bz-3d-advanced > summary').click()
    assert.equal(await page.locator('.bz-3d-option').first().isVisible(), true)
    assert.ok(await page.locator('.bz-3d-option[aria-pressed="true"]').count() >= 1)
    assert.deepEqual(pageErrors, [], 'route transitions must not throw uncaught renderer errors')
  } finally { await browser.close() }
})
