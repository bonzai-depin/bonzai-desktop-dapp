import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { isSafeCatalogPhrase, translationIssue } from '../src/i18n/catalogQuality.js'
import { reviewedCatalogOverrides } from '../src/i18n/reviewed-catalog.js'

const catalog = JSON.parse(fs.readFileSync(new URL('../src/i18n/generated-ui.json', import.meta.url)))

test('catalogs reject executable Vue copy rather than translating expressions', () => {
  for (const expression of [
    "i18n.t('common.refresh')", "i18n.t ('common.refresh')", "$t('auth.connectWallet')",
    "isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'", 'ready ? label : fallback',
    "bonzaiRevenueRouterService.isConfigured() ? 'Register route' : 'Unavailable'",
    'cellValue(row[col])', 'new Date(row.timestamp * 1000).toISOString()', 'row.status',
    '`${model.name} is ready`', 'first && second', 'value === null', 'const name = value', 'return value',
  ]) assert.equal(isSafeCatalogPhrase(expression), false, expression)
})

test('ordinary UI prose and technical units are retained', () => {
  for (const phrase of ['Channel Slug', 'Upload', '0.005 ETH (~$10)', 'No model loaded (download one first)', 'Is this ready? Retry: yes', 'Describe the image…', 'Describe what you want and let AI fill in the details', 'These endpoints should return verifiable data']) {
    assert.equal(isSafeCatalogPhrase(phrase), true, phrase)
  }
})

test('all six translations reject copied English prose, with exact brand exceptions', () => {
  for (const locale of ['zh', 'ko', 'ja', 'es', 'fr', 'ru']) {
    assert.equal(translationIssue('Download failed · retry available', 'Download failed · retry available', locale), 'untranslated English prose')
    assert.equal(translationIssue('Microsoft Visual Studio Code', 'Microsoft Visual Studio Code', locale), null)
    assert.equal(translationIssue('Open Microsoft Visual Studio Code now', 'Open Microsoft Visual Studio Code now', locale), 'untranslated English prose')
  }
})

test('reviewed French corrections cannot silently regress to literal mistranslations', () => {
  assert.equal(catalog.fr['Asset Floors'], 'Prix planchers des actifs')
  assert.equal(catalog.fr['Channel Slug'], 'Identifiant du canal')
  assert.equal(catalog.fr.Upload, 'Importer')
  assert.equal(catalog.fr['Unique Viewers'], 'Spectateurs uniques')
  for (const [locale, corrections] of Object.entries(reviewedCatalogOverrides)) {
    for (const [source, expected] of Object.entries(corrections)) {
      if (source in catalog.en) assert.equal(catalog[locale][source], expected)
    }
  }
})

test('generated locales share safe keys and contain no flagged untranslated prose', () => {
  const sourcePhrases = Object.keys(catalog.en)
  for (const [locale, phrases] of Object.entries(catalog)) {
    assert.deepEqual(Object.keys(phrases), sourcePhrases)
    for (const source of sourcePhrases) assert.equal(translationIssue(source, phrases[source], locale), null, `${locale}: ${source}`)
  }
})
