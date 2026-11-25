import { useGameAdminChatSessions } from "@api/game";
import { useParams, useSearchParams } from "@solidjs/router";
import { fullTheme, t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Link from "@widgets/link";
import { OverlayScrollbarsComponent } from "@widgets/overlay-scrollbars";
import Pagination from "@widgets/pagination";
import { createMemo, For, onCleanup, Show } from "solid-js";

export default function ChatList() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const pageSize = 15;
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string, 10)) || 1);
  const teamId = createMemo(() => Number.parseInt((searchParams.team as string) ?? "", 10) || null);
  const challengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) ?? "", 10) || null);

  const sessionsQuery = useGameAdminChatSessions({
    game_id: gameId,
    page: () => 1,
    page_size: () => pageSize * page(),
    enabled: () => gameId() > 0,
  });

  const timer = setInterval(() => {
    if (gameId() > 0) sessionsQuery.refetch();
  }, 5000);

  onCleanup(() => clearInterval(timer));
  return (
    <div class="w-full h-full overflow-hidden flex flex-col">
      <div class="h-16 flex flex-row px-4 space-x-2 items-center backdrop-blur-sm border-b border-b-layer-content/10">
        <span class="shrink-0 icon-[fluent--chat-20-regular] w-5 h-5" />
        <span>
          <span class="font-bold">Rx</span>
          <span class="opacity-60">::</span>
          <span>Messenger</span>
        </span>
      </div>
      <OverlayScrollbarsComponent
        class="w-full flex-1 relative"
        options={{
          scrollbars: {
            theme: `os-theme-${fullTheme()}`,
            autoHide: "scroll",
          },
        }}
        defer
      >
        <Show
          when={sessionsQuery.data && sessionsQuery.data[0].length > 0}
          fallback={
            <div class="w-full min-h-full flex flex-row space-x-2 p-3 lg:p-6 items-center justify-center">
              <span class="shrink-0 icon-[fluent--chat-20-regular] w-5 h-5" />
              <span class="font-bold">{t("game.hammer.empty")}</span>
            </div>
          }
        >
          <div class="w-full min-h-full overflow-hidden flex flex-col space-y-2 p-2">
            <For each={sessionsQuery.data?.[0] || []}>
              {(session) => (
                <Link
                  href={`/games/${gameId()}/admin/hammers?challenge=${session.challenge_id}&team=${session.team_id}`}
                  ghost={!(teamId() === session.team_id && challengeId() === session.challenge_id)}
                  class="flex-row items-center h-auto py-2 px-3! fade-group-right"
                >
                  <div class="w-8 h-8 aspect-square shrink-0 relative">
                    <Avatar class="w-full h-full" src={undefined} fallback={session.team_name} />
                    <div class="absolute -right-1 -bottom-1 w-2 h-2">
                      <Show when={!session.checked && !session.is_admin}>
                        <div class="bg-error rounded-full w-2 h-2" title={t("game.hammer.status.adminUnread.title")} />
                      </Show>
                      <Show when={!session.checked && session.is_admin}>
                        <div class="bg-info rounded-full w-2 h-2" title={t("game.hammer.status.playerUnread.title")} />
                      </Show>
                      <Show when={session.checked && !session.is_admin}>
                        <div class="bg-warning rounded-full w-2 h-2" title={t("game.hammer.status.notReply.title")} />
                      </Show>
                    </div>
                  </div>
                  <div class="flex-col flex-1">
                    <div class="flex flex-row space-x-2 items-center">
                      <span class="flex-1 truncate font-bold text-start w-0">{session.team_name}</span>
                    </div>
                    <div class="flex flex-row space-x-2 items-center overflow-hidden">
                      <span class="flex-1 w-0 truncate opacity-60 text-start font-normal text-xs">
                        {session.last_message}
                      </span>
                      <span class="opacity-60 text-xs">{session.last_active_at.toFormat("MM-dd HH:mm")}</span>
                    </div>
                  </div>
                </Link>
              )}
            </For>
            <Pagination
              class="p-6 lg:p-9"
              count={sessionsQuery.data?.[1] || 0}
              pageSize={pageSize}
              page={page()}
              onPageChange={(page) => setSearchParams({ page: page.page.toString() })}
            />
          </div>
        </Show>
      </OverlayScrollbarsComponent>
    </div>
  );
}
