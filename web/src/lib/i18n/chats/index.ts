import type rawChatDict from "./zh-cn.json";

const localeList = ["zh_cn", "en_us", "zh_tw", "ja_jp"] as const;
type Locale = (typeof localeList)[number];
export type RawChatDict = typeof rawChatDict;

export async function m_chat(locale: Locale): Promise<RawChatDict> {
  let dict: RawChatDict;
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
    case "ja_jp":
      dict = await import("./ja-jp.json");
      break;
    default:
      dict = await import("./zh-cn.json");
  }
  return dict;
}
