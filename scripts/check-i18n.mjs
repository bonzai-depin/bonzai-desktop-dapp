import { teamExchangeMessages } from "../src/i18n/team-exchanges.js"
import { rcWorkflowMessages } from '../src/i18n/rc-workflows.js'
import { rcShellMessages } from '../src/i18n/rc-shell.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { messages, supportedLocales } from '../src/i18n/messages.js'
import { featureMessages } from '../src/i18n/features.js'
import { connectionMessages } from '../src/i18n/connection.js'
import { rcDownloadMessages } from '../src/i18n/rc-downloads.js'
import { basketMessages } from '../src/i18n/basket.js'
import { smartAgentMessages } from '../src/i18n/smart-agents.js'
import { levelEditorMessages } from '../src/i18n/level-editor.js'
import { isSafeCatalogPhrase, translationIssue } from '../src/i18n/catalogQuality.js'
import { reviewedCatalogOverrides } from '../src/i18n/reviewed-catalog.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogs = Object.fromEntries(supportedLocales.map(({ code }) => [code, {
  ...messages[code],
  ...teamExchangeMessages[code],
  ...featureMessages[code],
  ...rcShellMessages[code],
  ...rcWorkflowMessages[code],
  ...rcLicenseMessages[code],
  ...rcTrainingMessages[code],
  ...connectionMessages[code],
  ...rcDownloadMessages[code],
  ...basketMessages[code],
  ...smartAgentMessages[code],
  // The level editor ships EN/FR; other locales use the runtime's English fallback.
  ...(levelEditorMessages[code] || levelEditorMessages.en),
}]))

function flatten(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value || {})) {
    const next = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, next, output)
    else output[next] = child
  }
  return output
}

const english = flatten(catalogs.en)
const failures = []
// A placeholder may appear once per plural variant in English and only once in
// languages without grammatical plural variants. Validate the key set, not
// occurrence counts.
const interpolationKeys = value => [...new Set(
  [...String(value ?? '').matchAll(/\{([^}]+)\}/g)].map(match => match[1]),
)].sort()
for (const { code } of supportedLocales) {
  const flat = flatten(catalogs[code])
  for (const key of Object.keys(english)) {
    if (flat[key] == null || flat[key] === '') failures.push(`${code}: missing ${key}`)
    else if (interpolationKeys(flat[key]).join('|') !== interpolationKeys(english[key]).join('|')) {
      failures.push(`${code}: interpolation mismatch in ${key}`)
    }
  }
  for (const key of Object.keys(flat)) {
    if (!(key in english)) failures.push(`${code}: unexpected ${key}`)
  }
}

// Maintenance copy is explicit EN/FR; untranslated locales deliberately fall back
// to the existing catalogue, then English. Do not report this as seven-language coverage.
const operations = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/operations-copy.json'), 'utf8'))
for (const [source, key] of Object.entries(operations.keys)) {
  for (const locale of ['en', 'fr']) {
    const value = operations[locale]?.[key]
    if (!value) failures.push(`${locale}: missing operations copy: ${source}`)
    else if (interpolationKeys(value).join('|') !== interpolationKeys(operations.en[key]).join('|')) failures.push(`${locale}: operations interpolation mismatch: ${source}`)
  }
}

const generatedPath = path.join(root, 'src/i18n/generated-ui.json')
if (!fs.existsSync(generatedPath)) {
  failures.push('generated UI catalog is missing; run npm run i18n:generate')
} else {
  const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf8'))
  const sourcePhrases = Object.keys(generated.en || {})
  if (sourcePhrases.length < 1000) failures.push(`generated UI catalog is unexpectedly small (${sourcePhrases.length})`)
  for (const phrase of sourcePhrases) {
    if (!isSafeCatalogPhrase(phrase)) failures.push(`generated catalog contains executable expression: ${phrase}`)
  }
  for (const { code } of supportedLocales) {
    const localePhrases = generated[code] || {}
    for (const phrase of sourcePhrases) {
      const issue = translationIssue(phrase, localePhrases[phrase], code)
      if (issue) failures.push(`${code}: ${issue}: ${phrase}`)
      const reviewed = reviewedCatalogOverrides[code]?.[phrase]
      if (reviewed && localePhrases[phrase] !== reviewed) failures.push(`${code}: reviewed translation changed: ${phrase}`)
      if (interpolationKeys(localePhrases[phrase]).join('|') !== interpolationKeys(phrase).join('|')) {
        failures.push(`${code}: interpolation mismatch in generated phrase ${phrase}`)
      }
    }
    for (const phrase of Object.keys(localePhrases)) {
      if (!(phrase in (generated.en || {}))) failures.push(`${code}: unexpected generated phrase ${phrase}`)
    }
  }
}

const sourceFiles = []
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) visit(target)
    else if (/\.(vue|js|ts)$/.test(entry.name)) sourceFiles.push(target)
  }
}
visit(path.join(root, 'src'))

const keyPattern = /(?:\$t|\.t)\(\s*['"]([^'"]+)['"]/g
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(keyPattern)) {
    if (!(match[1] in english)) failures.push(`${path.relative(root, file)}: unknown key ${match[1]}`)
  }
}

if (failures.length) {
  console.error(`i18n validation failed (${failures.length})`)
  for (const failure of failures.slice(0, 100)) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`i18n OK: ${supportedLocales.length} locales, ${Object.keys(english).length} keys, ${sourceFiles.length} source files checked`)
import { rcLicenseMessages } from '../src/i18n/rc-licenses.js'
import { rcTrainingMessages } from '../src/i18n/rc-training.js'
