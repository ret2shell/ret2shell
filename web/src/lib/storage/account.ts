import type { Permission, Token } from "@models/user";
import { base64urlnopad } from "@scure/base";
import { makePersisted } from "@solid-primitives/storage";
import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";

const accountRoot = createRoot(() =>
  makePersisted(
    createStore({
      id: null as number | null,
      account: null as string | null,
      nickname: null as string | null,
      token: null as string | null,
      permissions: [] as Permission[],
      warnedCodeGeneration: false,
    }),
    { name: "account" }
  )
);

export const accountStore = accountRoot[0];
export const setAccountStore = accountRoot[1];

export function storeToken(token: string) {
  const tokenRaw = new TextDecoder().decode(base64urlnopad.decode(token.split(".")[1]));
  const tokenJson = JSON.parse(tokenRaw) as Token;
  setAccountStore({
    id: tokenJson.id,
    account: tokenJson.account,
    nickname: tokenJson.nickname,
    token,
    permissions: tokenJson.permissions,
  });
}

export function resetUser() {
  setAccountStore({
    id: null,
    account: null,
    nickname: null,
    token: null,
    permissions: [],
    warnedCodeGeneration: false,
  });
}
