import type rawChatDict from "./zh-cn.json";

const localeList = ["zh_cn", "en_us", "zh_tw", "ja_jp"] as const;
type Locale = (typeof localeList)[number];
export type RawChatDict = typeof rawChatDict;

export async function m_chat(locale: Locale): Promise<RawChatDict> {
  let dict: RawChatDict;
  const dictModules = import.meta.glob("./*.json");
  const match = dictModules[`./${locale.replace("_", "-")}.json`];
  try {
    dict = (await match()) as RawChatDict;
  } catch {
    dict = await import("./zh-cn.json");
  }
  return dict;
}
