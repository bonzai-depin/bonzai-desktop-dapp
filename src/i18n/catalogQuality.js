import { identicalTechnicalPhrases } from './reviewed-catalog.js'

const identicalAllowed = new Set(identicalTechnicalPhrases)
const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()

/** Keep executable expressions out of both generated and runtime catalogs. */
export function isSafeCatalogPhrase(source) {
  const value = normalize(source)
  if (!value || value.length > 500) return false
  if (/\$t\s*\(|\$\{|\{\{|\}\}|=>|[!=]==?|&&|\|\||\?\.|\?\?/.test(value)) return false
  if (/^(?:true|false|null|undefined)$/.test(value)) return false
  if (/^(?:const|let)\s+[A-Za-z_$][\w$]*\s*[=;,]|^return\s+/.test(value)) return false
  if (/^['"`]|['"`]\s*\+|\+\s*['"`]$/.test(value)) return false
  // Vue conditionals may have quoted or unquoted branches. Question marks in
  // ordinary copy remain valid unless followed by a conditional colon.
  if (/^[\w$.[\]()!]+(?:\s*[<>=]\s*[^?]+)?\s*\?[^?]*:\s*\S/.test(value)) return false
  // Function/method invocations and member/index lookups are code, including
  // i18n.t(...), cellValue(row[col]), and new Date(...).toISOString().
  if (/\b[a-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\(/.test(value)) return false
  if (/\b[a-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\(/.test(value)) return false
  if (/\bnew\s+[A-Za-z_$][\w$]*\s*\(/.test(value)) return false
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])+$/.test(value)) return false
  return true
}

export const isSafeLegacyPhrase = isSafeCatalogPhrase

/** Return a concrete rejection reason; null means this check found no defect. */
export function translationIssue(source, translation, locale) {
  if (!isSafeCatalogPhrase(source)) return 'executable or malformed source expression'
  if (typeof translation !== 'string') return 'missing or non-text translation'
  const value = normalize(translation)
  if (!value) return 'missing translation'
  if (!isSafeCatalogPhrase(value)) return 'executable or malformed translation expression'
  if (locale !== 'en' && value.toLocaleLowerCase('en') === normalize(source).toLocaleLowerCase('en')
    && !identicalAllowed.has(normalize(source))) {
    const words = normalize(source).match(/[A-Za-z][A-Za-z’'-]*/g) || []
    if (normalize(source).length >= 24 && words.length >= 4) return 'untranslated English prose'
  }
  return null
}
