import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { messages, supportedLocales } from '../src/i18n/messages.js'
import { featureMessages } from '../src/i18n/features.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogs = Object.fromEntries(supportedLocales.map(({ code }) => [code, {
  ...messages[code],
  ...featureMessages[code],
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
for (const { code } of supportedLocales) {
  const flat = flatten(catalogs[code])
  for (const key of Object.keys(english)) {
    if (flat[key] == null || flat[key] === '') failures.push(`${code}: missing ${key}`)
  }
  for (const key of Object.keys(flat)) {
    if (!(key in english)) failures.push(`${code}: unexpected ${key}`)
  }
}

const generatedPath = path.join(root, 'src/i18n/generated-ui.json')
if (!fs.existsSync(generatedPath)) {
  failures.push('generated UI catalog is missing; run npm run i18n:generate')
} else {
  const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf8'))
  const sourcePhrases = Object.keys(generated.en || {})
  if (sourcePhrases.length < 1000) failures.push(`generated UI catalog is unexpectedly small (${sourcePhrases.length})`)
  for (const { code } of supportedLocales) {
    const localePhrases = generated[code] || {}
    for (const phrase of sourcePhrases) {
      if (!localePhrases[phrase]) failures.push(`${code}: missing generated phrase ${phrase}`)
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
