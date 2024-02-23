import type rawDict from './en_us'
import { Flatten, flatten } from '@solid-primitives/i18n'

const localeList = ['en_us', 'zh_cn', 'zh_tw', 'ja_jp'] as const
export type Locale = (typeof localeList)[number]
export type RawDict = typeof rawDict
export type Dict = Flatten<RawDict>

export async function fetchDictionary(locale: Locale): Promise<Dict> {
  console.log('loading locale:', locale)
  let dict: RawDict
  // NOTE: workaround for dynamic import
  // Farm won't resolve the dynamic import correctly
  switch (locale) {
    case 'en_us':
      dict = (await import('./en_us')).default
      break
    case 'zh_cn':
      dict = (await import('./zh_cn')).default
      break
    case 'zh_tw':
      dict = (await import('./zh_tw')).default
      break
    case 'ja_jp':
      dict = (await import('./ja_jp')).default
      break
  }
  return flatten(dict) // flatten the dictionary to make all nested keys available top-level
}

export function hasLocale(locale: unknown): locale is Locale {
  return typeof locale === 'string' && localeList.includes(locale as Locale)
}
