import { getGameAdminChatSessions, useGameAdminChatSessions } from "@api/game";
import { mediaPath } from "@lib/utils/media";
import type { ChatSession } from "@models/chat";
import { useParams, useSearchParams } from "@solidjs/router";
import { fullTheme, t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Link from "@widgets/link";
import Tag from "@widgets/tag";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

function sessionKey(session: ChatSession) {
  return `${session.team_id}:${session.challenge_id}`;
}

function mergeSessions(existing: ChatSession[], incoming: ChatSession[]): ChatSession[] {
  const byKey = new Map<string, ChatSession>();
  for (const item of existing) byKey.set(sessionKey(item), item);
  for (const item of incoming) byKey.set(sessionKey(item), item);
  return [...byKey.values()].sort((a, b) => b.last_active_at.toMillis() - a.last_active_at.toMillis());
}

export default function ChatList() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const teamId = createMemo(() => Number.parseInt((searchParams.team as string) ?? "", 10) || null);
  const challengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) ?? "", 10) || null);

  const sessionsQuery = useGameAdminChatSessions({
    game_id: gameId,
    enabled: () => gameId() > 0,
  });

  const [sessions, setSessions] = createStore<ChatSession[]>([]);
  const [nextCursor, setNextCursor] = createSignal<number | null>(null);
  const [loadingMore, setLoadingMore] = createSignal(false);

  let lastGameId: number | null = null;

  createEffect(() => {
    const currentGameId = gameId();
    const data = sessionsQuery.data;

    // the component survives param-only navigation between games, so reset
    // state when the game changes to avoid leaking stale sessions/cursor
    if (lastGameId !== currentGameId) {
      lastGameId = currentGameId;
      setSessions(reconcile([]));
      setNextCursor(null);
    }

    if (!data) return;

    const existing = untrack(() => Array.from(sessions));
    // only the first page seeds the cursor; deeper pages advance it via loadMore
    if (existing.length === 0) setNextCursor(data.next_cursor);
    // keyed reconcile so the 5s refetch only touches sessions that actually
    // changed (last_message_id moves when a session gets a new message);
    // a plain replacement would re-render every row on every poll
    setSessions(reconcile(mergeSessions(existing, data.items), { key: "last_message_id" }));
  });

  async function loadMore() {
    const cursor = nextCursor();
    if (cursor === null || loadingMore()) return;
    setLoadingMore(true);
    try {
      const page = await getGameAdminChatSessions(gameId(), { cursor, limit: 15 });
      setNextCursor(page.next_cursor);
      setSessions(
        reconcile(
          mergeSessions(
            untrack(() => Array.from(sessions)),
            page.items
          ),
          { key: "last_message_id" }
        )
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMore(false);
    }
  }

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
          when={sessions.length > 0}
          fallback={
            <div class="w-full min-h-full flex flex-row space-x-2 p-3 lg:p-6 items-center justify-center">
              <span class="shrink-0 icon-[fluent--chat-20-regular] w-5 h-5" />
              <span class="font-bold">{t("game.hammer.empty")}</span>
            </div>
          }
        >
          <div class="w-full min-h-full overflow-hidden flex flex-col space-y-2 p-2">
            <For each={sessions}>
              {(session) => (
                <Link
                  href={`/games/${gameId()}/admin/hammers?challenge=${session.challenge_id}&team=${session.team_id}`}
                  ghost={!(teamId() === session.team_id && challengeId() === session.challenge_id)}
                  class="flex-row items-center h-auto py-2 px-3! fade-group-right"
                >
                  <div class="w-8 h-8 aspect-square shrink-0 relative">
                    <Avatar
                      class="w-full h-full"
                      src={session.challenge_avatar ? mediaPath(session.challenge_avatar) : undefined}
                      fallback={session.challenge_name}
                    />
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
                      <Tag
                        size="sm"
                        level={session.challenge_tag?.some((tag) => tag.primary) ? "success" : "info"}
                        class="shrink-0 max-w-40"
                      >
                        <span class="truncate min-w-0">{session.challenge_name}</span>
                      </Tag>
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
            <Show when={nextCursor() !== null}>
              <div class="flex justify-center py-2">
                <Button size="sm" ghost onClick={loadMore} loading={loadingMore()} disabled={loadingMore()}>
                  {t("general.actions.loadMore.title")}
                </Button>
              </div>
            </Show>
          </div>
        </Show>
      </OverlayScrollbarsComponent>
    </div>
  );
}
