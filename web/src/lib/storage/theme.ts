import { createStore } from 'solid-js/store'
import { makePersisted } from '@solid-primitives/storage'
import { createEffect, createResource, untrack } from 'solid-js'
import { Locale, fetchDictionary, hasLocale } from '@lib/i18n'
import { resolveTemplate, translator } from '@solid-primitives/i18n'
import { createPrefersDark } from '@solid-primitives/media'

const prefersDark = createPrefersDark()
const initPrefersDark = prefersDark()

let systemPrefersLocale = (window.navigator.language || window.navigator.languages[0])
  .replace('-', '_')
  .toLowerCase() as Locale

if (!hasLocale(systemPrefersLocale)) {
  systemPrefersLocale = 'en_us' as Locale
}

export const [themeStore, setThemeStore] = makePersisted(
  createStore({
    theme: 'cyber',
    locale: systemPrefersLocale,
    colorScheme: initPrefersDark ? 'dark' : 'light',
  }),
  { name: 'theme' }
)

export function setTheme(theme: string) {
  setThemeStore({ theme })
}

export function setColorScheme(colorScheme: 'dark' | 'light') {
  setThemeStore({ colorScheme })
}

export function setLocale(locale: Locale) {
  setThemeStore({ locale })
  setTimeout(() => location.reload())
}

export function fullTheme() {
  return `${themeStore.theme}-${themeStore.colorScheme}`
}

export function initTheme() {
  createEffect(() => {
    document.documentElement.setAttribute('data-theme', fullTheme())
    document.documentElement.setAttribute('data-style', themeStore.colorScheme)
  })
  createEffect(() => {
    if (prefersDark()) {
      untrack(() => setColorScheme('dark'))
    } else {
      untrack(() => setColorScheme('light'))
    }
  })
}

const [dict] = createResource(themeStore.locale || 'en_us', fetchDictionary)
export const t = translator(dict, resolveTemplate)
