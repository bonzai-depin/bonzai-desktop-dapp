import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { baseParse, NodeTypes } from '@vue/compiler-dom'

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
    if (!nodeIgnored && node.type === NodeTypes.INTERPOLATION) addExpressionStrings(node.content?.content)
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
const ordered = [...phrases].sort((a, b) => a.localeCompare(b))
const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : {}
const catalog = { en: Object.fromEntries(ordered.map(value => [value, value])) }

for (const locale of targets) {
  const saved = existing[locale] || {}
  const missing = ordered.filter(phrase => !saved[phrase])
  const batches = batchesFor(missing)
  const translated = { ...saved }
  console.log(`${locale}: ${missing.length} missing phrases in ${batches.length} batches`)
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index]
    const values = await translateBatch(batch, locale)
    batch.forEach((phrase, offset) => { translated[phrase] = normalizeTranslation(locale, values[offset] || phrase) })
    if ((index + 1) % 10 === 0 || index === batches.length - 1) {
      catalog[locale] = translated
      fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`)
      console.log(`${locale}: ${index + 1}/${batches.length}`)
    }
  }
  catalog[locale] = Object.fromEntries(ordered.map(phrase => [phrase, normalizeTranslation(locale, translated[phrase] || phrase)]))
}

fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`Wrote ${ordered.length} interface phrases to ${path.relative(root, outputPath)}`)
