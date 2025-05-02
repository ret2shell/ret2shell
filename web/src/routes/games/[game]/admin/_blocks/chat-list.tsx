import { handleHttpError } from "@api";
import { getGameAdminChatSessions } from "@api/game";
import type { ChatSession } from "@models/chat";
import { useSearchParams } from "@solidjs/router";
import { gameStore } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Link from "@widgets/link";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";

function mergeChats(oldSessions: ChatSession[], newSessions: ChatSession[]) {
  const result = oldSessions;
  const incoming = newSessions;
  result.sort((a, b) => {
    if (a.team_id === b.team_id) {
      return a.challenge_id - b.challenge_id;
    }
    return a.team_id - b.team_id;
  });
  incoming.sort((a, b) => {
    if (a.team_id === b.team_id) {
      return a.challenge_id - b.challenge_id;
    }
    return a.team_id - b.team_id;
  });
  let i = 0;
  const iLen = result.length;
  let j = 0;
  const jLen = incoming.length;
  while (i < iLen && j < jLen) {
    const oldSession = result[i];
    const newSession = incoming[j];
    if (oldSession.team_id === newSession.team_id && oldSession.challenge_id === newSession.challenge_id) {
      if (
        newSession.last_active_at.toMillis() > oldSession.last_active_at.toMillis() ||
        newSession.checked !== oldSession.checked ||
        newSession.is_admin !== oldSession.is_admin
      ) {
        result[i] = newSession;
      }
      i++;
      j++;
    } else if (
      oldSession.team_id > newSession.team_id ||
      (oldSession.team_id === newSession.team_id && oldSession.challenge_id > newSession.challenge_id)
    ) {
      result.push(newSession);
      j++;
    } else {
      i++;
    }
  }
  while (j < jLen) {
    result.push(incoming[j]);
    j++;
  }
  return result.sort((a, b) => b.last_active_at.toMillis() - a.last_active_at.toMillis());
}

export default function ChatList() {
  const [sessions, setSessions] = createSignal([] as ChatSession[]);
  const [searchParams, _] = useSearchParams();
  const pageSize = 30;
  const [page, setPage] = createSignal(1);
  const teamId = createMemo(() => Number.parseInt((searchParams.team as string) ?? "") || null);
  const challengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) ?? "") || null);
  async function refreshChats() {
    if (gameStore.current) {
      try {
        const resp = await getGameAdminChatSessions(gameStore.current!.id, 1, pageSize * page());
        const result = mergeChats(sessions(), resp[0]);
        setSessions([...result]);
      } catch (err) {
        handleHttpError(err as Error, t("game.hammer.errors.fetchSessions.title")!);
      }
    }
  }

  const timer = setInterval(() => {
    refreshChats();
  }, 5000);

  onCleanup(() => clearInterval(timer));

  createEffect(() => {
    if (gameStore.current) {
      untrack(refreshChats);
    }
  });
  return (
    <div class="w-full h-full overflow-hidden flex flex-col">
      <div class="h-16 flex flex-row px-4 space-x-2 items-center backdrop-blur-sm border-b border-b-layer-content/10">
        <span class="icon-[fluent--chat-20-regular] w-5 h-5" />
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
          when={sessions().length > 0}
          fallback={
            <div class="w-full min-h-full flex flex-row space-x-2 p-3 lg:p-6 items-center justify-center">
              <span class="icon-[fluent--chat-20-regular] w-5 h-5" />
              <span class="font-bold">{t("game.hammer.empty")}</span>
            </div>
          }
        >
          <div class="w-full min-h-full overflow-hidden flex flex-col space-y-2 p-2">
            <For each={sessions()}>
              {(session) => (
                <Link
                  href={`/games/${gameStore.current?.id}/admin/hammers?challenge=${session.challenge_id}&team=${session.team_id}`}
                  ghost={!(teamId() === session.team_id && challengeId() === session.challenge_id)}
                  class="flex-row items-center h-auto py-2 !px-3 fade-group-right"
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
            <Button
              ghost
              onClick={() => {
                setPage(page() + 1);
                refreshChats();
              }}
            >
              <span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5 opacity-60 hover:opacity-100" />
              <span>{t("general.actions.loadMore.title")}</span>
            </Button>
          </div>
        </Show>
      </OverlayScrollbarsComponent>
    </div>
  );
}
