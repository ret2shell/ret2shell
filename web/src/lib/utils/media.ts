import { api_root } from "@api";
import Bg from "@assets/imgs/bg-game-default.webp";

export function mediaPath(hashUrl?: string | null) {
  if (!hashUrl) {
    return Bg;
  }
  const pattern = /^[A-Fa-f0-9]{64}$/;
  if (!pattern.test(hashUrl)) {
    return hashUrl;
  }
  return `${api_root}/media?hash=${hashUrl}`;
}
