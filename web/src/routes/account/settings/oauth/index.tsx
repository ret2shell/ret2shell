import { handleHttpError } from "@api";
import { getInstitutes, getOAuthProviders, getOAuthStatus, unbindWithOAuth } from "@api/account";
import { mediaPath } from "@lib/utils/media";
import type { Institute } from "@models/institute";
import type { OAuth } from "@models/oauth";
import type { OAuthProvider } from "@models/oauth-provider";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import Tag from "@widgets/tag";
import { For, Show, createEffect, createSignal, onMount, untrack } from "solid-js";

function getOAuthLink(service: OAuthProvider) {
  if (!service.portal) {
    return `${window.location.origin}/account/oauth?service=${service.provider}`;
  }
  return service.portal;
}

export default function () {
  const [institutes, setInstitutes] = createSignal([] as Institute[]);
  const [selfOAuthItems, setSelfOAuthItems] = createSignal([] as OAuth[]);
  const [oauthServices, setOAuthServices] = createSignal([] as OAuthProvider[]);
  onMount(async () => {
    try {
      setInstitutes(await getInstitutes());
    } catch (err) {
      handleHttpError(err as Error, t("institute.errors.fetchList.title")!);
    }
    try {
      setOAuthServices(await getOAuthProviders());
    } catch (err) {
      handleHttpError(err as Error, t("account.oauth.errors.fetchProvider.title")!);
    }
  });
  async function refreshOAuthStatus() {
    try {
      setSelfOAuthItems(await getOAuthStatus());
    } catch (err) {
      setSelfOAuthItems([]);
      handleHttpError(err as Error, t("account.oauth.errors.fetchStatus.title")!);
    }
  }
  createEffect(() => {
    if (accountStore.token) {
      untrack(() => {
        refreshOAuthStatus();
      });
    }
  });

  async function handleUnbind(id: number) {
    try {
      await unbindWithOAuth(id);
      refreshOAuthStatus();
    } catch (err) {
      handleHttpError(err as Error, t("account.oauth.errors.unbind.title")!);
    }
  }
  return (
    <>
      <Title page={t("account.oauth.title")} route="/account/settings/oauth" />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <div class="flex flex-col w-full max-w-5xl relative">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("account.oauth.title")}</span>
          </h3>
          <For each={oauthServices()}>
            {(service) => (
              <div class="h-12 flex flex-row items-center border-b border-b-layer-content/10 space-x-2">
                <img src={mediaPath(service.avatar ?? "")} alt={service.name} class="w-5 h-5" />
                <h4 class="font-bold text-start flex-1">
                  <span>{service.name}</span>
                </h4>
                <Show when={institutes().find((v) => v.provider === service.provider)}>
                  <Tag level="info">
                    <span>{institutes().find((v) => v.provider === service.provider)?.name}</span>
                  </Tag>
                </Show>
                <Show
                  when={selfOAuthItems().find((v) => v.provider === service.provider)}
                  fallback={
                    <>
                      <span class="opacity-60">{t("account.oauth.notBind")}</span>
                      <Link size="sm" href={getOAuthLink(service)}>
                        {t("account.oauth.actions.bind.title")}
                      </Link>
                    </>
                  }
                >
                  <Popover size="sm" square btnContent={<span class="icon-[fluent--info-20-regular] w-5 h-5" />}>
                    <Card contentClass="max-w-lg p-2">
                      <table>
                        <For each={Object.entries(selfOAuthItems().find((v) => v.provider === service.provider)!.data)}>
                          {([key, value]) => (
                            <tr class="h-12 align-middle text-start border-b border-b-layer-content/15">
                              <td class="h-12 align-middle text-start font-bold px-2">{key}</td>
                              <td class="align-middle text-start truncate px-2">{value}</td>
                            </tr>
                          )}
                        </For>
                      </table>
                    </Card>
                  </Popover>

                  <Button
                    size="sm"
                    onClick={() => handleUnbind(selfOAuthItems().find((v) => v.provider === service.provider)!.id)}
                  >
                    {t("account.oauth.actions.unbind.title")}
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
