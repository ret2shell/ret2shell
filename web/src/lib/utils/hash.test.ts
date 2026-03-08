import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToHex } from "./hash";

const encoder = new TextEncoder();

describe("hashToHex", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches standard SHA-256 test vectors", async () => {
    const cases = [
      {
        input: "",
        expected: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      {
        input: "abc",
        expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      },
      {
        input: "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
        expected: "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      },
    ];

    for (const { input, expected } of cases) {
      expect(await hashToHex(encoder.encode(input))).toBe(expected);
    }
  });

  it("falls back to the internal implementation when Web Crypto is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);

    expect(await hashToHex(encoder.encode("hello world"))).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });
});
