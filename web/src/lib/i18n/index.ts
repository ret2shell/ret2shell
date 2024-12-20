import { type Flatten, flatten } from "@solid-primitives/i18n";
import type rawDict from "./zh-cn.json";

const localeList = ["zh_cn", "en_us", "zh_tw", "ja_jp"] as const;
export type Locale = (typeof localeList)[number];
export type RawDict = typeof rawDict;
export type Dict = Flatten<RawDict>;

export async function fetchDictionary(locale: Locale): Promise<Dict> {
  let dict: RawDict;
  // NOTE: workaround for dynamic import
  switch (locale) {
    case "en_us":
      dict = await import("./en-us.json");
      break;
    case "zh_cn":
      dict = await import("./zh-cn.json");
      break;
    case "zh_tw":
      dict = await import("./zh-tw.json");
      break;
    default:
      dict = await import("./zh-cn.json");
  }
  // flatten the dictionary to make all nested keys available top-level
  return flatten(dict);
}

export function hasLocale(locale: unknown): locale is Locale {
  return typeof locale === "string" && localeList.includes(locale as Locale);
}
