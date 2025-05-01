import { mediaPath } from "@lib/utils/media";
import type { Team } from "@models/team";
import type { User } from "@models/user";
import { A } from "@solidjs/router";
import { fullTheme, t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Divider from "@widgets/divider";
import LoadingTips from "@widgets/loading-tips";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show } from "solid-js";

export default function (props: {
  team: Team | null;
  members: User[];
  loading?: boolean;
}) {
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
            <span class="w-12 h-12 shrink-0 icon-[fluent--flag-20-regular]" />
            <div class="flex-1 flex flex-col space-y-1 justify-center overflow-hidden">
              <h2 class="font-bold w-full text-start truncate">{props.team?.name}</h2>
              <p class="opacity-60 w-full text-start truncate">
                <span class="text-primary">{props.team?.game_name}</span>
                <span>#</span>
                <span>{props.team?.id.toString(16).padStart(6, "0")}</span>
              </p>
            </div>
          </div>
          <Divider />
          <div class="flex flex-row space-x-2 items-center px-2 py-2">
            <span class="icon-[fluent--hat-graduation-20-regular] w-5 h-5" />
            <span class="font-bold">{props.team?.institute_name ?? t("institute.empty")}</span>
          </div>
          <Divider />
          <Show when={props.loading}>
            <div class="min-h-12 p-2 flex items-center space-x-2 overflow-hidden">
              <LoadingTips />
            </div>
            <Divider />
          </Show>
          <For each={props.members}>
            {(member) => (
              <>
                <A
                  class="px-2 py-2 flex items-center font-bold space-x-4 group cursor-pointer"
                  href={`/users/${member.id}`}
                >
                  <Avatar
                    class="w-6 h-6"
                    src={(member.avatar && mediaPath(member.avatar)) || undefined}
                    fallback={member.account || undefined}
                  />
                  <span class="flex-1 truncate text-start group-hover:underline">
                    <span>{member.nickname}</span>
                    <span class="font-normal px-2 opacity-60">
                      {member.account}#{member.id.toString(16).padStart(6, "0")}
                    </span>
                  </span>
                </A>
                <Divider />
              </>
            )}
          </For>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
