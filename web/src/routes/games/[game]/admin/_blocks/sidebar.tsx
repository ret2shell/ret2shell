import { useLocation } from "@solidjs/router";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import { Show, createMemo } from "solid-js";
import ChatList from "./chat-list";

export default function SideBar() {
  const location = useLocation();
  const expanded = createMemo(() => !location.pathname.endsWith("/admin/hammers"));
  return (
    <div class="flex flex-row h-full">
      <ul
        class={`flex flex-col h-full space-y-2 transition-all duration-300 ${expanded() ? "w-full p-3 lg:p-6" : "w-16 p-2"}`}
      >
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/statistics`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--data-trending-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.statistics.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/monitor`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--flash-flow-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.events.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/edit`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--edit-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.edit.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/hammers`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--chat-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.hammer.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/teams`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--people-team-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.teams.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/organize`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--person-passkey-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.organize.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/events`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.automate.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/git`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--branch-fork-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.git.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/traffic`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--airplane-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.traffic.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameStore.current?.id}/admin/captures`}
            justify={expanded() ? "start" : "center"}
          >
            <span class="icon-[fluent--slide-record-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.admin.captures.title")}</Show>
          </Link>
        </li>
      </ul>
      <Show when={!expanded()}>
        <Divider direction="vertical" />
        <ChatList />
      </Show>
    </div>
  );
}
