import { handleHttpError } from "@api";
import { generateAccountCode, getAccountCode } from "@api/account";
import { Permission } from "@models/user";
import { A } from "@solidjs/router";
import { accountStore, setAccountStore } from "@storage/account";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Dialog from "@widgets/dialog";
import Timer from "@widgets/timer";
import type { DateTime } from "luxon";
import { Match, Switch, createEffect, createSignal, untrack } from "solid-js";

export default function UserCodeDialog() {
  const [code, setCode] = createSignal(null as { code: number; generate_at: DateTime } | null);
  const [loadingCode, setLoadingCode] = createSignal(false);
  async function getCode() {
    if (accountStore.permissions.includes(Permission.Verified)) {
      setLoadingCode(true);
      try {
        setCode(await getAccountCode());
      } catch (err) {
        setCode(null);
        handleHttpError(err as Error, t("account.errors.fetchCode.title")!);
      }
      setLoadingCode(false);
    }
  }
  const verified = () => accountStore.permissions.includes(Permission.Verified);
  function refreshCode() {
    if (!accountStore.warnedCodeGeneration) {
      setAccountStore({ warnedCodeGeneration: true });
    }
    setCode(null);
    setLoadingCode(true);
    setTimeout(async () => {
      try {
        setCode(await generateAccountCode());
      } catch (err) {
        handleHttpError(err as Error, t("account.errors.fetchCode.title")!);
      }
      setLoadingCode(false);
    }, 500);
  }
  createEffect(() => {
    if (accountStore.token) {
      untrack(getCode);
    } else {
      setCode(null);
    }
  });
  return (
    <Dialog
      size="sm"
      justify="start"
      ghost
      btnContent={
        <>
          <span class="icon-[fluent--person-link-20-regular] w-5 h-5" />
          <span>{t("account.code.title")}</span>
        </>
      }
    >
      <div class="flex flex-col w-64 space-y-2">
        <div class="w-full min-h-36 flex flex-col items-center justify-center space-y-2">
          <Switch>
            <Match when={!verified()}>
              <span class="icon-[fluent--person-link-20-regular] w-10 h-10 shrink-0 text-warning" />
              <span class="text-warning inline-block align-middle">
                <span>{t("account.code.status.unverified.message")}</span>
              </span>
              <A href="/account/info" class="flex items-center space-x-2">
                <span class="icon-[fluent--open-20-regular] w-5 h-5" />
                <span>{t("account.code.status.unverified.action")}</span>
              </A>
            </Match>
            <Match when={!accountStore.warnedCodeGeneration}>
              <span class="icon-[fluent--warning-20-regular] w-10 h-10 shrink-0 text-warning" />
              <span class="text-warning">{t("account.code.tip")}</span>
            </Match>
            <Match when={code()}>
              <span class="font-extrabold text-5xl tracking-widest">
                {code()?.code.toString(16).toUpperCase().padStart(6, "0")}
              </span>
              <Timer class="opacity-80 font-bold" end={code()!.generate_at.plus({ seconds: 300 })} hasHours />
            </Match>
            <Match when={true}>
              <span class="icon-[fluent--person-link-20-regular] w-10 h-10 opacity-60" />
              <span class="opacity-60">{t("account.code.empty")}</span>
            </Match>
          </Switch>
        </div>
        <Button
          level="primary"
          title={t("general.actions.refresh.title")}
          onClick={refreshCode}
          loading={loadingCode()}
          disabled={loadingCode() || !verified()}
        >
          <Switch>
            <Match when={!accountStore.warnedCodeGeneration}>
              <span class="icon-[fluent--emoji-hand-20-regular] w-5 h-5" />
              <span class="truncate">{t("general.actions.confirm.title")}</span>
            </Match>
            <Match when={loadingCode()}>
              <span class="truncate">{t("general.loading.short")}</span>
            </Match>
            <Match when={true}>
              <span class="icon-[fluent--arrow-clockwise-20-regular] w-5 h-5" />
              <span class="truncate">
                {t("general.actions.generate.title")} / {t("general.actions.refresh.title")}
              </span>
            </Match>
          </Switch>
        </Button>
      </div>
    </Dialog>
  );
}
