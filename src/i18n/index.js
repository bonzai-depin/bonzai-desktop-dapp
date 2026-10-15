import { operationText } from "./operations.js"
import { levelEditorMessages } from './level-editor.js'
import { teamExchangeMessages } from "./team-exchanges.js"
import { rcWorkflowMessages } from './rc-workflows.js'
import { rcShellMessages } from './rc-shell.js'
import { computed, inject, reactive } from 'vue'
import { messages, supportedLocales } from './messages.js'
import { featureMessages } from './features.js'
import { connectionMessages } from './connection.js'
import { rcDownloadMessages } from './rc-downloads.js'
import { basketMessages } from './basket.js'
import { smartAgentMessages } from './smart-agents.js'

for (const locale of supportedLocales.map(item => item.code)) {
  messages[locale] = { ...messages[locale], ...teamExchangeMessages[locale], ...featureMessages[locale], ...rcShellMessages[locale], ...rcWorkflowMessages[locale], ...rcLicenseMessages[locale], ...rcTrainingMessages[locale], ...connectionMessages[locale], ...rcDownloadMessages[locale], ...basketMessages[locale], ...smartAgentMessages[locale], ...levelEditorMessages[locale] }
}

const STORAGE_KEY = 'bonzai.locale'
const supported = new Set(supportedLocales.map(item => item.code))
const normalize = value => {
  const base = String(value || '').toLowerCase().split(/[-_]/)[0]
  return supported.has(base) ? base : 'en'
}
const initialLocale = normalize(localStorage.getItem(STORAGE_KEY) || navigator.language)
const state = reactive({ locale: initialLocale })

function getPath(object, path) {
  return String(path).split('.').reduce((value, key) => value?.[key], object)
}
function interpolate(value, params = {}) {
  return String(value).replace(/\{([^}]+)\}/g, (_, key) => params[key] ?? `{${key}}`)
}
function translate(key, params = {}, locale = state.locale) {
  const value = getPath(messages[locale], key) ?? getPath(messages.en, key)
  return interpolate(value ?? key, params)
}
function plural(key, count, params = {}) {
  const raw = translate(key, { ...params, count })
  const variants = raw.split('|').map(value => value.trim())
  return variants[count === 1 ? 0 : Math.min(1, variants.length - 1)]
}
function setLocale(locale) {
  const next = normalize(locale)
  state.locale = next
  localStorage.setItem(STORAGE_KEY, next)
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : next
  window.dispatchEvent(new CustomEvent('bonzai:locale-changed', { detail: next }))
}
function number(value, options) { return new Intl.NumberFormat(state.locale, options).format(value) }
function date(value, options = { dateStyle: 'medium', timeStyle: 'short' }) { return new Intl.DateTimeFormat(state.locale, options).format(new Date(value)) }
function relative(value) {
  const delta = new Date(value).getTime() - Date.now()
  const abs = Math.abs(delta)
  const [amount, unit] = abs < 60_000 ? [Math.round(delta / 1000), 'second'] : abs < 3_600_000 ? [Math.round(delta / 60_000), 'minute'] : abs < 86_400_000 ? [Math.round(delta / 3_600_000), 'hour'] : [Math.round(delta / 86_400_000), 'day']
  return new Intl.RelativeTimeFormat(state.locale, { numeric: 'auto' }).format(amount, unit)
}

export const i18n = { state, locale: computed(() => state.locale), supportedLocales, t: translate, tc: plural, setLocale, number, date, relative }
export const I18N_KEY = Symbol('bonzai-i18n')
export function createI18nPlugin() {
  return {
    install(app) {
      document.documentElement.lang = state.locale === 'zh' ? 'zh-CN' : state.locale
      app.provide(I18N_KEY, i18n)
      app.config.globalProperties.$ui = (source,params) => operationText(source,state.locale,params)
      app.config.globalProperties.$t = translate
      app.config.globalProperties.$tc = plural
      app.config.globalProperties.$n = number
      app.config.globalProperties.$d = date
    },
  }
}
export function useI18n() { return inject(I18N_KEY, i18n) }
import { rcLicenseMessages } from './rc-licenses.js'
import { rcTrainingMessages } from './rc-training.js'
