import { mediaPath } from "@lib/utils/media";
import { Permission, type User, permissionToString } from "@models/user";
import { A } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { fullTheme, t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Divider from "@widgets/divider";
import Tag from "@widgets/tag";
import clsx from "clsx";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show } from "solid-js";

export default function (props: { user: User | null; loading?: boolean }) {
  return (
    <div class="w-full h-full overflow-hidden">
      <OverlayScrollbarsComponent
        options={{
          scrollbars: {
            theme: `os-theme-${fullTheme()}`,
            autoHide: "scroll",
          },
        }}
        class="relative w-full h-full print:h-auto print:overflow-auto"
        defer
      >
        <div class="flex flex-col min-h-full space-y-2 p-3 lg:p-6">
          <div class="flex flex-row space-x-4 lg:space-x-6 p-2 lg:p-4 items-center">
            <Avatar
              class="w-12 h-12 shrink-0"
              src={(props.user?.avatar && mediaPath(props.user?.avatar)) || undefined}
              fallback={props.user?.account}
              loading={props.loading}
            />
            <div class="flex-1 flex flex-col space-y-1 justify-center overflow-hidden">
              <h2 class="font-bold w-full text-start truncate">{props.user?.nickname}</h2>
              <p class="opacity-60 w-full text-start truncate">
                <span>{props.user?.account}</span>
                <span>#</span>
                <span>{props.user?.id.toString(16).padStart(6, "0")}</span>
              </p>
            </div>
          </div>
          <Divider />
          <div class="flex flex-row space-x-2 items-center px-2 py-2">
            <span class="icon-[fluent--mail-20-regular] w-5 h-5" />
            <a
              class={clsx(
                "font-bold truncate flex-1",
                props.user?.email ? "hover:underline" : "blur pointer-events-none"
              )}
              href={`mailto:${props.user?.email}`}
            >
              {props.user?.email ?? "fake.email@ret.sh.cn"}
            </a>
          </div>
          <Divider />
          <div class="flex flex-row space-x-2 items-center px-2 py-2">
            <span class="icon-[fluent--hat-graduation-20-regular] w-5 h-5" />
            <span class="font-bold">{props.user?.institute_name ?? t("institute.empty")}</span>
          </div>
          <Divider />
          <div class="flex flex-row flex-wrap">
            <For each={props.user?.permissions || []}>
              {(permission) => (
                <Tag level="info" class="m-1">
                  <span>{permissionToString(permission)}</span>
                </Tag>
              )}
            </For>
          </div>
          <div class="flex-1" />
          <Show when={accountStore.permissions.includes(Permission.User)}>
            <div class="h-12 flex items-center justify-center">
              <A class="opacity-60 hover:underline" href={`/admin/users?user=${props.user?.id}`}>
                {t("user.gotoAdminPanel")}
              </A>
            </div>
          </Show>
          <div class="h-12 flex items-center justify-center">
            <span class="opacity-60">
              {t("user.registeredAt", {
                time: props.user?.registered_at.toFormat("yyyy-MM-dd") || "UNKNOWN",
              })}
            </span>
          </div>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
