import type { Permission, Token } from "@models/user";
import { base64urlnopad } from "@scure/base";
import { makePersisted } from "@solid-primitives/storage";
import { createRoot, createStore } from "solid-js";

type AccountStoreShape = {
  id: number | null;
  account: string | null;
  nickname: string | null;
  token: string | null;
  permissions: Permission[];
  warnedCodeGeneration: boolean;
};

const accountRoot = createRoot(() =>
  makePersisted(
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
  setAccountStore((s) => {
    s.id = tokenJson.id;
    s.account = tokenJson.account;
    s.nickname = tokenJson.nickname;
    s.token = token;
    s.permissions = tokenJson.permissions;
  });
}

export function resetUser() {
  setAccountStore((s) => {
    s.id = null;
    s.account = null;
    s.nickname = null;
    s.token = null;
    s.permissions = [];
    s.warnedCodeGeneration = false;
  });
}
