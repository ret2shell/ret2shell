import { createStore } from 'solid-js/store'
import { makePersisted } from '@solid-primitives/storage'
import { createEffect, createResource } from 'solid-js'
import { Locale, fetchDictionary, hasLocale } from '../i18n'
import { translator } from '@solid-primitives/i18n'

const systemPrefersColorScheme =
  window && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches

let systemPrefersLocale = (window.navigator.language || window.navigator.languages[0])
  .replace('-', '_')
  .toLowerCase() as Locale

if (hasLocale(systemPrefersLocale)) {
  systemPrefersLocale = systemPrefersLocale as Locale
} else {
  systemPrefersLocale = 'en_us' as Locale
}

export const [themeStore, setThemeStore] = makePersisted(
  createStore({
    theme: 'cyber',
    locale: systemPrefersLocale,
    colorScheme: systemPrefersColorScheme ? 'dark' : 'light',
  }),
  { name: 'theme' }
)

export function setTheme(theme: string) {
  setThemeStore('theme', theme)
}

export function setColorScheme(colorScheme: string) {
  setThemeStore('colorScheme', colorScheme)
}

export function setLocale(locale: Locale) {
  setThemeStore('locale', locale)
  setTimeout(() => location.reload())
}

export function fullTheme() {
  return `${themeStore.theme}-${themeStore.colorScheme}`
}

export function initTheme() {
  createEffect(() => {
    document.documentElement.setAttribute('data-theme', fullTheme())
  })
}

const [dict] = createResource(themeStore.locale || 'en_us', fetchDictionary)
export const t = translator(dict)
