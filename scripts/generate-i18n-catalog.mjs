import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { baseParse, NodeTypes } from '@vue/compiler-dom'
import { isSafeCatalogPhrase, translationIssue } from '../src/i18n/catalogQuality.js'
import { reviewedCatalogOverrides } from '../src/i18n/reviewed-catalog.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const componentsRoot = path.join(root, 'src/components')
const outputPath = path.join(root, 'src/i18n/generated-ui.json')
const targets = ['zh', 'ko', 'ja', 'es', 'fr', 'ru']
const separator = '\n[[BONZAI_BREAK]]\n'
const translatableSingleWords = new Set([
  'About', 'Account', 'Add', 'Advanced', 'All', 'Apply', 'Approve', 'Audio', 'Back',
  'Blocked', 'Cancel', 'Chat', 'Clear', 'Close', 'Company', 'Connect', 'Continue',
  'Copy', 'Create', 'Delete', 'Details', 'Disconnect', 'Download', 'Edit', 'Error',
  'Examples', 'Export', 'Generate', 'Help', 'Hide', 'History', 'Image', 'Import',
  'Licenses', 'Loading', 'Local', 'Memory', 'Mint', 'Model', 'Music', 'Name', 'Next',
  'None', 'Open', 'Ownership', 'Preview', 'Private', 'Provider', 'Refresh', 'Remove',
  'Retry', 'Rewards', 'Save', 'Search', 'Select', 'Send', 'Settings', 'Share', 'Show',
  'Start', 'Status', 'Stop', 'Submit', 'Unknown', 'Upload', 'Video', 'View', 'Wallet',
])

function filesIn(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) filesIn(target, output)
    else if (entry.name.endsWith('.vue')) output.push(target)
  }
  return output
}

function usefulPhrase(value) {
  const phrase = String(value || '').replace(/\s+/g, ' ').trim()
  if (!phrase || phrase.length > 500 || !/[A-Za-z]/.test(phrase)) return ''
  if (!isSafeCatalogPhrase(phrase)) return ''
  if (/^(?:https?:|0x)[^ ]+$/i.test(phrase)) return ''
  if (/^[a-z0-9_./:@+-]+$/i.test(phrase) && !phrase.includes(' ') && !translatableSingleWords.has(phrase)) return ''
  if (/^[A-Z0-9_]{2,16}$/.test(phrase)) return ''
  return phrase
}

function extractTemplatePhrases(source, filename, phrases) {
  const { descriptor } = parse(source, { filename })
  if (!descriptor.template) return
  let ast
  try { ast = baseParse(descriptor.template.content) } catch { return }
  const addExpressionStrings = expression => {
    for (const match of String(expression || '').matchAll(/(["'`])([^\n]*?)\1/g)) {
      const phrase = usefulPhrase(match[2])
      if (phrase) phrases.add(phrase)
    }
  }
  function visit(node, ignored = false) {
    const nodeIgnored = ignored || (node.type === NodeTypes.ELEMENT && (
      node.props?.some(prop => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'class' && /material-symbols|material-icons/.test(prop.value?.content || ''))
    ))
    if (!nodeIgnored && node.type === NodeTypes.TEXT) {
      const phrase = usefulPhrase(node.content)
      if (phrase) phrases.add(phrase)
    }
    // Interpolations are executable Vue expressions, not translatable prose.
    if (!nodeIgnored && node.type === NodeTypes.ELEMENT) {
      for (const prop of node.props || []) {
        if (prop.type === NodeTypes.ATTRIBUTE && ['placeholder', 'title', 'aria-label', 'headline', 'subtitle', 'label'].includes(prop.name)) {
          const phrase = usefulPhrase(prop.value?.content)
          if (phrase) phrases.add(phrase)
        }
        if (prop.type === NodeTypes.DIRECTIVE && ['bind'].includes(prop.name) && ['placeholder', 'title', 'aria-label', 'headline', 'subtitle', 'label'].includes(prop.arg?.content)) {
          addExpressionStrings(prop.exp?.content)
        }
      }
    }
    for (const child of node.children || []) visit(child, nodeIgnored)
  }
  visit(ast)
}

function extractScriptLabels(source, phrases) {
  const pattern = /(?:label|title|description|placeholder|copy|subtitle)\s*:\s*(["'`])([^\n]*?)\1/g
  for (const match of source.matchAll(pattern)) {
    if (/\$\{|<[^>]+>/.test(match[2])) continue
    const phrase = usefulPhrase(match[2])
    if (phrase) phrases.add(phrase)
  }
}

function extractRuntimePhrases(source, phrases) {
  const patterns = [
    /return\s+(["'`])([^\n]*?)\1/g,
    /(?:label|title|description|placeholder|headline|subtitle|copy|message)\w*\s*=\s*(["'`])([^\n]*?)\1/gi,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (/\$\{|<[^>]+>/.test(match[2])) continue
      const phrase = usefulPhrase(match[2])
      if (phrase) phrases.add(phrase)
    }
  }
}

function batchesFor(phrases, maxChars = 2400) {
  const batches = []
  let batch = []
  let size = 0
  for (const phrase of phrases) {
    const addition = phrase.length + separator.length
    if (batch.length && size + addition > maxChars) {
      batches.push(batch)
      batch = []
      size = 0
    }
    batch.push(phrase)
    size += addition
  }
  if (batch.length) batches.push(batch)
  return batches
}

function normalizeTranslation(locale, value) {
  let output = String(value || '').trim()
  if (locale === 'zh') output = output.replaceAll('型号', '模型').replaceAll('负载模型', '加载模型')
  return output
}

async function translateBatch(batch, locale, attempt = 0) {
  const query = new URLSearchParams({ client: 'gtx', sl: 'en', tl: locale, dt: 't', q: batch.join(separator) })
  try {
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?${query}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    const translated = (payload[0] || []).map(item => item[0] || '').join('')
    const parts = translated.split(/\n\[\[BONZAI_BREAK\]\]\n/)
    if (parts.length !== batch.length) throw new Error(`separator mismatch ${parts.length}/${batch.length}`)
    return parts.map(value => value.trim())
  } catch (error) {
    if (attempt >= 3) throw error
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    return translateBatch(batch, locale, attempt + 1)
  }
}

const phrases = new Set()
for (const filename of filesIn(componentsRoot)) {
  const source = fs.readFileSync(filename, 'utf8')
  extractTemplatePhrases(source, filename, phrases)
  extractScriptLabels(source, phrases)
  extractRuntimePhrases(source, phrases)
}
// Stable code-point order keeps regeneration identical across machine locales.
const ordered = [...phrases].sort()
const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : {}
const reviewedOnly = process.argv.includes('--reviewed-only')
const checkOnly = process.argv.includes('--check')
if (checkOnly && !reviewedOnly) throw new Error('--check requires --reviewed-only (no network requests)')
const cacheIndex = process.argv.indexOf('--translation-cache')
const translationCache = cacheIndex < 0 ? {} : JSON.parse(fs.readFileSync(path.resolve(process.argv[cacheIndex + 1]), 'utf8'))
const translations = {}
for (const locale of targets) {
  translations[locale] = { ...(translationCache[locale] || {}), ...(existing[locale] || {}), ...(reviewedCatalogOverrides[locale] || {}) }
}

// The extractor cannot see every runtime-composed label. Preserve known safe
// complete rows in offline mode instead of treating extraction as a deletion list.
const offlinePhrases = [...new Set([
  ...ordered, ...Object.keys(existing.en || {}), ...Object.keys(translationCache.en || {}),
])].sort()
let retained = ordered
if (reviewedOnly) {
  // Offline mode retains usable existing translations and reviewed corrections.
  // It never invents a translation or silently saves English as a fallback.
  const rejected = []
  retained = offlinePhrases.filter(phrase => {
    const failures = targets.flatMap(locale => {
      const issue = translationIssue(phrase, translations[locale][phrase], locale)
      return issue ? [`${locale}: ${issue}`] : []
    })
    if (failures.length) rejected.push({ phrase, failures })
    return !failures.length
  })
  console.log(`Offline catalog: ${retained.length} retained; ${rejected.length} incomplete or invalid source phrases omitted`)
  for (const item of rejected.slice(0, 8)) console.log(`- ${item.phrase}: ${item.failures.join('; ')}`)
} else {
  for (const locale of targets) {
    const missing = ordered.filter(phrase => translationIssue(phrase, translations[locale][phrase], locale))
    const batches = batchesFor(missing)
    console.log(`${locale}: ${missing.length} missing or invalid phrases in ${batches.length} batches`)
    for (const batch of batches) {
      const values = await translateBatch(batch, locale)
      batch.forEach((phrase, offset) => {
        const value = normalizeTranslation(locale, values[offset])
        const issue = translationIssue(phrase, value, locale)
        if (issue) throw new Error(`${locale}: ${issue}: ${phrase}`)
        translations[locale][phrase] = value
      })
    }
  }
}

const catalog = { en: Object.fromEntries(retained.map(value => [value, value])) }
for (const locale of targets) {
  catalog[locale] = Object.fromEntries(retained.map(phrase => [phrase, normalizeTranslation(locale, translations[locale][phrase])]))
}
const output = `${JSON.stringify(catalog, null, 2)}\n`
if (checkOnly) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output) {
    throw new Error('Generated catalog is stale; run npm run i18n:generate -- --reviewed-only')
  }
  console.log('Generated catalog is current')
} else {
  fs.writeFileSync(outputPath, output)
  console.log(`Wrote ${retained.length} interface phrases to ${path.relative(root, outputPath)}`)
}
