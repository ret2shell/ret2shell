import { logout } from "@api/account";
import { mediaPath } from "@lib/utils/media";
import { useNavigate } from "@solidjs/router";
import { accountStore, refreshUser, resetUser } from "@storage/account";
import { t } from "@storage/theme";
import { clearToasts } from "@storage/toast";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import { Show, createEffect, createSignal, untrack } from "solid-js";
import UserCodeDialog from "./user-code-dialog";

export default function UserBox() {
  createEffect(() => {
    if (accountStore.token) {
      untrack(refreshUser);
    }
  });

  const navigate = useNavigate();
  const [loading, setLoading] = createSignal(false);

  function handleLogout() {
    setLoading(true);
    setTimeout(() => {
      void logout().finally(() => {
        resetUser();
        navigate("/");
        clearToasts();
        setLoading(false);
      });
    }, 1000);
  }

  return (
    <Show
      when={accountStore.token}
      fallback={
        <Link href="/account/login" title={t("account.login.title")} ghost>
          <span class="icon-[fluent--person-20-regular] w-5 h-5" />
          {t("account.login.title")}
        </Link>
      }
    >
      <Popover
        btnContent={
          <Avatar
            alt={accountStore.info?.account ?? "USER"}
            class="w-8 h-8"
            src={(accountStore.info?.avatar && mediaPath(accountStore.info?.avatar)) || undefined}
            fallback={accountStore.info?.account || undefined}
          />
        }
        square
        ghost
        popContentClass="pt-2"
      >
        <div class="flex flex-col space-y-2 max-w-64 w-[calc(100vw-1rem)]">
          <Card contentClass="p-2 flex flex-col space-y-2">
            <Link
              ghost
              class="h-16 space-x-2 shrink-0 py-1 flex-nowrap"
              justify="start"
              href={`/users/${accountStore.info?.id}`}
            >
              <Avatar
                class="w-10 h-10"
                src={(accountStore.info?.avatar && mediaPath(accountStore.info?.avatar)) || undefined}
                fallback={accountStore.info?.account || undefined}
                loading={loading()}
              />
              <div class="flex flex-col justify-center items-start">
                <h2 class="font-bold">{accountStore.info?.nickname}</h2>
                <span class="text-start text-base font-normal opacity-60">
                  0x{accountStore.info?.id.toString(16).padStart(6, "0")}
                </span>
              </div>
            </Link>
            <Divider />
            <UserCodeDialog />
            <div class="flex flex-row space-x-2">
              <Link href="/account/settings" ghost size="sm" justify="start" class="flex-1">
                <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
                <span>{t("account.settings.title")}</span>
              </Link>
              <Button ghost size="sm" square title={t("account.logout")} onClick={handleLogout} loading={loading()}>
                <Show when={!loading()}>
                  <span class="icon-[fluent--sign-out-20-regular] w-5 h-5 text-error" />
                </Show>
              </Button>
            </div>
          </Card>
        </div>
      </Popover>
    </Show>
  );
}
