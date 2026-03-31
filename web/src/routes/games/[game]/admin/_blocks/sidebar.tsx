import { useGame, useGameSyncStatus } from "@api/game";
import { useLocation, useParams } from "@solidjs/router";
import { t } from "@storage/theme";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import clsx from "clsx";
import { createMemo, Show } from "solid-js";
import ChatList from "./chat-list";

export default function SideBar() {
  const location = useLocation();
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });
  const syncStatus = useGameSyncStatus({ game_id: gameId, enabled: () => gameId() > 0 });
  const readonly = createMemo(() => syncStatus.data?.readonly === true);
  const expanded = createMemo(() => !location.pathname.endsWith("/admin/hammers"));
  return (
    <div class="flex flex-row h-full">
      <ul
        class={clsx(
          "flex flex-col h-full space-y-2 transition-all duration-300",
          expanded() ? "w-full p-3 lg:p-6" : "w-16 p-2"
        )}
      >
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/monitor`}
            justify={expanded() ? "start" : "center"}
            title={t("game.monitor.title")}
          >
            <span class="shrink-0 icon-[fluent--flash-flow-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.monitor.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/statistics`}
            justify={expanded() ? "start" : "center"}
            title={t("game.statistics.title")}
          >
            <span class="shrink-0 icon-[fluent--data-trending-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.statistics.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/edit`}
            justify={expanded() ? "start" : "center"}
            title={t("game.form.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--edit-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.form.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/rules`}
            justify={expanded() ? "start" : "center"}
            title={t("game.rules.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--document-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.rules.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/policies`}
            justify={expanded() ? "start" : "center"}
            title={t("game.policies.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--document-multiple-prohibited-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.policies.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/timeline`}
            justify={expanded() ? "start" : "center"}
            title={t("game.timeline.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--filmstrip-split-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.timeline.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/hammers`}
            justify={expanded() ? "start" : "center"}
            title={t("game.hammer.title")}
            disabled={readonly() || !game.data?.hammer_policy?.enabled}
          >
            <span class="shrink-0 icon-[fluent--chat-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.hammer.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/teams`}
            justify={expanded() ? "start" : "center"}
            title={t("team.title")}
          >
            <span class="shrink-0 icon-[fluent--people-team-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("team.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/organize`}
            justify={expanded() ? "start" : "center"}
            title={t("game.organize.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--person-passkey-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.organize.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/events`}
            justify={expanded() ? "start" : "center"}
            title={t("game.events.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.events.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/traffic`}
            justify={expanded() ? "start" : "center"}
            title={t("traffic.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--airplane-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("traffic.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/lifecycle`}
            justify={expanded() ? "start" : "center"}
            title={t("lifecycle.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--script-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("lifecycle.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/captures`}
            justify={expanded() ? "start" : "center"}
            title={t("captures.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--slide-record-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("captures.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/git`}
            justify={expanded() ? "start" : "center"}
            title={t("game.git.title")}
            disabled={readonly()}
          >
            <span class="shrink-0 icon-[fluent--branch-fork-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.git.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/sync`}
            justify={expanded() ? "start" : "center"}
            title={t("game.sync.title")}
          >
            <span class="shrink-0 icon-[fluent--arrow-sync-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.sync.title")}</Show>
          </Link>
        </li>
        <li class="w-full">
          <Link
            activeMatch="exact"
            class="w-full"
            ghost
            square={!expanded()}
            href={`/games/${gameId()}/admin/delete`}
            justify={expanded() ? "start" : "center"}
            title={t("game.delete.title")}
          >
            <span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />
            <Show when={expanded()}>{t("game.delete.title")}</Show>
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
