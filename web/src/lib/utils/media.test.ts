import { describe, expect, it, vi } from "vitest";

vi.mock("@api", () => ({
  api_root: "/api-root",
}));

vi.mock("@assets/imgs/bg-game-default.webp", () => ({
  default: "bg-default.webp",
}));

import { mediaPath } from "./media";

describe("mediaPath", () => {
  const hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("returns the default background for empty values", () => {
    expect(mediaPath()).toBe("bg-default.webp");
    expect(mediaPath(null)).toBe("bg-default.webp");
    expect(mediaPath("")).toBe("bg-default.webp");
  });

  it("builds media API URLs for exact 64-character hashes", () => {
    expect(mediaPath(hash)).toBe(`/api-root/media?hash=${hash}`);
    expect(mediaPath(hash.toUpperCase())).toBe(`/api-root/media?hash=${hash.toUpperCase()}`);
  });

  it("leaves regular URLs and partial hash matches untouched", () => {
    expect(mediaPath("https://cdn.example.com/image.png")).toBe("https://cdn.example.com/image.png");
    expect(mediaPath(`${hash}.png`)).toBe(`${hash}.png`);
    expect(mediaPath(`prefix-${hash}-suffix`)).toBe(`prefix-${hash}-suffix`);
  });
});
