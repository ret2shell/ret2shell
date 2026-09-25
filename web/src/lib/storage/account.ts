import type { Permission, Token } from "@models/user";
import { base64urlnopad } from "@scure/base";
import { makePersisted } from "@solid-primitives/storage";
import { createRoot } from "solid-js";
import { createStore, type StoreReturn } from "solid-js/store";

type AccountStoreShape = {
  id: number | null;
  account: string | null;
  nickname: string | null;
  token: string | null;
  permissions: Permission[];
  warnedCodeGeneration: boolean;
};

const accountRoot = createRoot(() =>
  makePersisted<AccountStoreShape, StoreReturn<AccountStoreShape>>(
    createStore<AccountStoreShape>({
      id: null,
      account: null,
      nickname: null,
      token: null,
      permissions: [],
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
