import { useAccountProfile, useLogoutMutation } from "@api/account";
import { mediaPath } from "@lib/utils/media";
import { useNavigate } from "@solidjs/router";
import { accountStore, resetUser } from "@storage/account";
import { t } from "@storage/theme";
import { clearToasts } from "@storage/toast";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import { createMemo, Show } from "solid-js";
import UserCodeDialog from "./user-code-dialog";

export default function UserBox() {
  const navigate = useNavigate();

  const profile = useAccountProfile({ enabled: () => !!accountStore.token });
  const userId = createMemo(() => profile.data?.id ?? accountStore.id ?? null);
  const account = createMemo(() => profile.data?.account ?? accountStore.account ?? null);
  const nickname = createMemo(() => profile.data?.nickname ?? accountStore.nickname ?? null);
  const avatar = createMemo(() => profile.data?.avatar ?? null);

  const userHref = createMemo(() => {
    const id = userId();
    return id == null ? "/users" : `/users/${id}`;
  });

  const userIdHex = createMemo(() => {
    const id = userId();
    return id == null ? null : `0x${id.toString(16).padStart(6, "0")}`;
  });

  const logoutMutation = useLogoutMutation({
    onSuccess: () => {
      resetUser();
      navigate("/");
      clearToasts();
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <Show
      when={accountStore.token}
      fallback={
        <Link href="/account/login" title={t("account.login.title")} ghost>
          <span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5" />
          {t("account.login.title")}
        </Link>
      }
    >
      <Popover
        btnContent={
          <Avatar
            alt={account() ?? "USER"}
            class="w-8 h-8"
            src={(avatar() && mediaPath(avatar())) || undefined}
            fallback={account() || undefined}
          />
        }
        square
        ghost
        popContentClass="pt-2"
      >
        <div class="flex flex-col space-y-2 max-w-64 w-[calc(100vw-1rem)]">
          <Card contentClass="p-2 flex flex-col space-y-2">
            <Link ghost class="h-16 space-x-2 shrink-0 py-1 flex-nowrap" justify="start" href={userHref()}>
              <Avatar
                class="w-10 h-10"
                src={(avatar() && mediaPath(avatar())) || undefined}
                fallback={account() || undefined}
                loading={logoutMutation.isPending}
              />
              <div class="flex flex-col justify-center items-start">
                <h2 class="font-bold">{nickname()}</h2>
                <span class="text-start text-base font-normal opacity-60">{userIdHex()}</span>
              </div>
            </Link>
            <Divider />
            <UserCodeDialog />
            <div class="flex flex-row space-x-2">
              <Link href="/account/settings" ghost size="sm" justify="start" class="flex-1">
                <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
                <span>{t("account.settings.title")}</span>
              </Link>
              <Button
                ghost
                size="sm"
                square
                title={t("account.logout")}
                onClick={handleLogout}
                loading={logoutMutation.isPending}
              >
                <Show when={!logoutMutation.isPending}>
                  <span class="shrink-0 icon-[fluent--sign-out-20-regular] w-5 h-5 text-error" />
                </Show>
              </Button>
            </div>
          </Card>
        </div>
      </Popover>
    </Show>
  );
}
