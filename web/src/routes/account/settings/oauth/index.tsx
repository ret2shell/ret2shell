import { handleHttpError } from "@api";
import { getInstitutes, getOAuthStatus, unbindWithOAuth } from "@api/account";
import { getAuthConfig } from "@api/platform";
import { getLogo } from "@assets/brands";
import type { AuthConfig } from "@models/config";
import type { Institute } from "@models/institute";
import type { OAuth } from "@models/oauth";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Link from "@widgets/link";
import Tag from "@widgets/tag";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onMount, untrack } from "solid-js";

function getOAuthLink(service: string) {
  if (service.endsWith("_email")) {
    return `${window.location.origin}/account/bind?service=${service}`;
  }
  if (service.endsWith("_cas")) {
    if (service.startsWith("xdu"))
      return `https://ids.xidian.edu.cn/authserver/login?service=${window.location.origin}/account/bind?service=${service}`;
    if (service.startsWith("xmu"))
      return `https://ids.xmu.edu.cn/authserver/login?service=${window.location.origin}/account/bind?service=${service}`;
  }
}

export default function () {
  const [authConfig, setAuthConfig] = createSignal({
    signing_key: "",
    buffer_time: 0,
    expires_time: 0,
    oauth_keys: {},
  } as AuthConfig);
  const [institutes, setInstitutes] = createSignal([] as Institute[]);
  const [selfOAuthItems, setSelfOAuthItems] = createSignal([] as OAuth[]);
  onMount(async () => {
    try {
      setInstitutes(await getInstitutes());
    } catch (err) {
      handleHttpError(err as Error, t("errors.unknown")!);
    }
    try {
      setAuthConfig(await getAuthConfig());
    } catch (err) {
      handleHttpError(err as Error, t("errors.unknown")!);
    }
  });
  async function refreshOAuthStatus() {
    try {
      setSelfOAuthItems(await getOAuthStatus());
    } catch (err) {
      setSelfOAuthItems([]);
      handleHttpError(err as Error, t("account.settings.oauth.failedToGetOAuthStatus")!);
    }
  }
  createEffect(() => {
    if (accountStore.token) {
      untrack(() => {
        refreshOAuthStatus();
      });
    }
  });
  const oauthServices = createMemo(() => {
    const result = [];
    const keys = Object.keys(authConfig().oauth_keys || {});
    // console.log(keys);
    for (const key of keys) {
      if (authConfig().oauth_keys[key] !== null) result.push(key);
    }
    return result;
  });

  async function handleUnbind(id: number) {
    try {
      await unbindWithOAuth(id);
      refreshOAuthStatus();
    } catch (err) {
      handleHttpError(err as Error, t("account.oauth.failedToUnbind")!);
    }
  }
  return (
    <>
      <Title page={t("account.settings.oauth.title")} route="/account/settings/oauth" />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <div class="flex flex-col w-full max-w-5xl relative">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("account.settings.oauth.title")}</span>
          </h3>
          <For each={oauthServices()}>
            {(service) => (
              <div class="h-12 flex flex-row items-center border-b border-b-layer-content/10 space-x-2">
                <img src={getLogo(service)} alt={service.toUpperCase()} class="w-5 h-5" />
                <h4 class="font-bold text-start flex-1">
                  {/* @ts-expect-error key is dynamic */}
                  <span>{t(`account.oauth.${service}.title`) as string}</span>
                </h4>
                <Show when={institutes().find((v) => v.provider === service)}>
                  <Tag level="info">
                    <span>{institutes().find((v) => v.provider === service)?.name}</span>
                  </Tag>
                </Show>
                <Show
                  when={selfOAuthItems().find((v) => v.provider === service)}
                  fallback={
                    <>
                      <span class="opacity-60">{t("account.oauth.notBind")}</span>
                      <Link size="sm" href={getOAuthLink(service)}>
                        {t("account.oauth.bind")}
                      </Link>
                    </>
                  }
                >
                  <span class="opacity-60">
                    <Switch>
                      <Match when={service.endsWith("cas")}>
                        <span>{selfOAuthItems().find((v) => v.provider === service)?.data.name ?? "UNKNOWN"}</span>
                        &nbsp;
                        <span>({selfOAuthItems().find((v) => v.provider === service)?.data.id ?? "UNKNOWN"})</span>
                      </Match>
                      <Match when={service.endsWith("email")}>
                        <span>{selfOAuthItems().find((v) => v.provider === service)?.data.email ?? "UNKNOWN"}</span>
                      </Match>
                    </Switch>
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleUnbind(selfOAuthItems().find((v) => v.provider === service)!.id)}
                  >
                    {t("account.oauth.unbind")}
                  </Button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </>
  );
}
