import { MOJI_BY_CODE } from "./data";

export type { MojiCategory, MojiItem } from "./data";
export { MOJI_BY_CODE, MOJI_CATEGORIES } from "./data";

/**
 * Matches `:code:` shortcodes. Codes are `a-z0-9_+-` so gitmoji-style
 * shortcodes like `:+1:` and `:construction:` both work.
 */
export const MOJI_REGEX = /:([a-z0-9_+-]+):/g;

/** Resolve a shortcode (without colons) to a moji item, if known. */
export function findMoji(code: string) {
  return MOJI_BY_CODE.get(code);
}

/**
 * If the content is exactly one `:code:` shortcode referencing a known moji,
 * return that item — such messages render as a single enlarged emoji
 * (Discord-style jumbo emoji).
 */
export function singleMojiOf(content: string) {
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return undefined;
  const match = /^:([a-z0-9_+-]+):$/.exec(trimmed);
  if (!match) return undefined;
  return findMoji(match[1]);
}
