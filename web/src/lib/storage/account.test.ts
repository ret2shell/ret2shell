import { base64urlnopad } from "@scure/base";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@solid-primitives/storage", () => ({
  makePersisted<T>(value: T) {
    return value;
  },
}));

import { accountStore, resetUser, setAccountStore, storeToken } from "./account";

const encoder = new TextEncoder();

function makeToken(payload: object) {
  return ["header", base64urlnopad.encode(encoder.encode(JSON.stringify(payload))), "signature"].join(".");
}

describe("account storage", () => {
  beforeEach(() => {
    resetUser();
  });

  it("decodes JWT payloads into the account store", () => {
    const token = makeToken({
      id: 42,
      account: "captain",
      nickname: "Flag Captain",
      permissions: [0, 5],
    });

    storeToken(token);

    expect(accountStore.id).toBe(42);
    expect(accountStore.account).toBe("captain");
    expect(accountStore.nickname).toBe("Flag Captain");
    expect(accountStore.token).toBe(token);
    expect(accountStore.permissions).toEqual([0, 5]);
  });

  it("resetUser clears session data and warning flags", () => {
    setAccountStore((s) => {
      s.id = 7;
      s.account = "builder";
      s.nickname = "Bug Fixer";
      s.token = "token";
      s.permissions = [9];
      s.warnedCodeGeneration = true;
    });

    resetUser();

    expect(accountStore.id).toBeNull();
    expect(accountStore.account).toBeNull();
    expect(accountStore.nickname).toBeNull();
    expect(accountStore.token).toBeNull();
    expect(accountStore.permissions).toEqual([]);
    expect(accountStore.warnedCodeGeneration).toBe(false);
  });

  it("does not partially persist malformed tokens", () => {
    expect(() => storeToken("invalid-token")).toThrow();

    expect(accountStore.id).toBeNull();
    expect(accountStore.account).toBeNull();
    expect(accountStore.nickname).toBeNull();
    expect(accountStore.token).toBeNull();
    expect(accountStore.permissions).toEqual([]);
  });
});
