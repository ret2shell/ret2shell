import { useChallenge } from "@api/challenge";
import {
  getGameAdminChatMessages,
  useGame,
  useGameAdminChatMessages,
  useSendGameAdminChatMessageMutation,
} from "@api/game";
import { useTeamInfo, useTeamSolves } from "@api/team";
// import xdsecMascotCiallo from "@assets/imgs/xdsec-mascot-ciallo.webp";
import platformAvatar from "@assets/imgs/rx.webp";
import { ChatBlock } from "@blocks/challenge/hammer";
import {
  type AggregatedReaction,
  aggregateReactions,
  mergeChatItems,
  mergeChats,
  parseChatReference,
  resolveChatReference,
} from "@blocks/challenge/hammer.utils";
import ChatHistorySentinel from "@blocks/challenge/hammer-sentinel";
import ChatToolbarActions from "@blocks/challenge/hammer-toolbar";
import { singleMojiOf } from "@lib/moji";
// import { stickerSet } from "@assets/stickers";
import { mediaPath } from "@lib/utils/media";
import type { Chat } from "@models/chat";
import { A, useParams, useSearchParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import { EditorBare } from "@widgets/editor";
import Link from "@widgets/link";
import clsx from "clsx";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

export default function () {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });

  const [searchParams, _] = useSearchParams();
  const teamId = createMemo(() => Number.parseInt((searchParams.team as string) ?? "", 10) || null);
  const challengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) ?? "", 10) || null);

  const enabledSession = createMemo(() => gameId() > 0 && !!teamId() && !!challengeId());

  const challenge = useChallenge({
    game_id: gameId,
    challenge_id: () => challengeId() ?? -1,
    enabled: () => enabledSession(),
  });

  const team = useTeamInfo({
    game_id: gameId,
    team_id: () => teamId() ?? -1,
    enabled: () => enabledSession(),
  });

  const solves = useTeamSolves({
    game_id: gameId,
    team_id: () => teamId() ?? -1,
    enabled: () => enabledSession(),
  });

  const chatsQuery = useGameAdminChatMessages({
    game_id: gameId,
    challenge_id: () => challengeId() ?? -1,
    team_id: () => teamId() ?? -1,
    enabled: () => enabledSession(),
  });

  const [chats, setChats] = createStore<Chat[]>([]);
  const [chat, setChat] = createSignal("");
  const sendMutation = useSendGameAdminChatMessageMutation({
    onSuccess: () => {
      setChat("");
      chatsQuery.refetch();
    },
  });

  async function handleSendChat() {
    if (chat().trim() === "") return;
    if (!enabledSession()) return;
    sendMutation.mutate({
      game_id: gameId(),
      challenge_id: challengeId()!,
      team_id: teamId()!,
      content: chat(),
    });
  }
  // reactions are rendered under their target message instead of as
  // standalone chat blocks; replies keep their own message with a quote
  const referenceCache = new Map<
    number,
    { kind: "reply" | "reaction" | "dropped"; message?: Chat; rest?: string; moji?: string } | null
  >();

  function classify(
    message: Chat
  ): { kind: "reply" | "reaction" | "dropped"; message?: Chat; rest?: string; moji?: string } | null {
    if (message.id === 0) return null;
    if (referenceCache.has(message.id)) return referenceCache.get(message.id);
    let result: { kind: "reply" | "reaction" | "dropped"; message?: Chat; rest?: string; moji?: string } | null = null;
    const parsed = parseChatReference(message.content);
    if (parsed) {
      const resolved = resolveChatReference(chats, parsed.reference, parsed.rest);
      if (!resolved) {
        // the reference target is not loaded (deep history) or gone: drop
        // the message silently instead of leaking the raw @account#id text
        result = { kind: "dropped" };
      } else if (resolved.reaction) {
        // reactions to a reaction follow the chain down to the original
        // message, otherwise the tag would target a block that never renders
        let target = resolved.message;
        for (let depth = 0; depth < 8; depth += 1) {
          const targetInfo = classify(target);
          if (targetInfo?.kind !== "reaction" || !targetInfo.message) break;
          target = targetInfo.message;
        }
        result = {
          kind: "reaction",
          message: target,
          rest: parsed.rest,
          moji: singleMojiOf(parsed.rest)?.icon,
        };
      } else {
        result = { kind: "reply", message: resolved.message, rest: parsed.rest };
      }
    }
    referenceCache.set(message.id, result);
    return result;
  }

  createEffect(() => {
    // invalidate the classification cache whenever the session content changes
    chats;
    referenceCache.clear();
  });

  const reactionTargets = createMemo(() => {
    const targets = new Map<number, AggregatedReaction[]>();
    for (const message of chats) {
      const info = classify(message);
      if (info?.kind !== "reaction" || !info.moji || !info.message) continue;
      const list = targets.get(info.message.id) ?? [];
      list.push({ icon: info.moji, label: message.user_name || message.user_account || "?" });
      targets.set(info.message.id, list);
    }
    // same-emoji reactions merge into one tag with overflow collapsing
    const aggregated = new Map<number, AggregatedReaction[]>();
    for (const [id, list] of targets) aggregated.set(id, aggregateReactions(list));
    return aggregated;
  });

  function resolveReference(message: Chat) {
    const info = classify(message);
    if (info?.kind !== "reply" || !info.message || info.rest === undefined) return null;
    return { message: info.message, rest: info.rest };
  }

  function reactTo(message: Chat, code: string) {
    const currentChallengeId = challengeId();
    const currentTeamId = teamId();
    if (!currentChallengeId || !currentTeamId) return;
    sendMutation.mutate({
      game_id: gameId(),
      challenge_id: currentChallengeId,
      team_id: currentTeamId,
      content: `@${message.user_account}#${message.id} :${code}:`,
    });
  }

  function replyTo(message: Chat) {
    setChat(`@${message.user_account}#${message.id} ${chat()}`);
  }

  let chatBottomEl: HTMLDivElement | undefined;

  const [hasMoreHistory, setHasMoreHistory] = createSignal(false);
  const [checkedThroughId, setCheckedThroughId] = createSignal(0);

  const maxLoadedId = createMemo(() => {
    let max = 0;
    for (const item of chats) {
      if (item.id > max) max = item.id;
    }
    return max;
  });

  const minLoadedId = createMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    for (const item of chats) {
      // the synthetic solved message uses id 0 and must not become a cursor
      if (item.id > 0 && item.id < min) min = item.id;
    }
    return Number.isFinite(min) ? min : 0;
  });

  // client-owned monotone sync cursor: the highest message id merged so far.
  // the session-wide checked watermark must never anchor fetches: the team
  // reading the thread would move it past messages this client never fetched.
  let cursor = 0;
  let lastSessionKey = "";

  createEffect(() => {
    const currentChallengeId = challengeId();
    const currentTeamId = teamId();
    const data = chatsQuery.data;
    const sessionKey = `${currentTeamId}:${currentChallengeId}`;

    if (!enabledSession() || !data || !currentChallengeId || !currentTeamId) {
      // do not mark the session as loaded here: the first page that arrives
      // must count as a session change so `has_more` initializes history paging
      cursor = 0;
      setCheckedThroughId(0);
      setHasMoreHistory(false);
      setChats(reconcile([]));
      return;
    }

    const merged = mergeChats(
      gameId(),
      currentChallengeId,
      currentTeamId,
      data.items,
      solves.data?.find((item) => item.challenge_id === currentChallengeId)?.created_at ?? null
    );

    const sessionChanged = sessionKey !== lastSessionKey;
    if (sessionChanged) {
      lastSessionKey = sessionKey;
      // reset per-session state before adopting the new session's page
      cursor = 0;
      setCheckedThroughId(0);
      setHasMoreHistory(data.has_more);
    }

    // the latest page (re)initializes the sync cursor; the poll loop must not
    // issue after_id=0 syncs before it lands (that would rescan from id 1)
    for (const item of data.items) {
      if (item.id > cursor) cursor = item.id;
    }
    // the watermark is monotone server-side; a stale response must not regress it
    const watermark = data.checked_through_id;
    if (watermark !== null) setCheckedThroughId((prev) => Math.max(prev, watermark));

    if (sessionChanged) {
      setChats(reconcile(merged, { key: "id" }));
      return;
    }

    // reconcile merges the newest page into the store so older pages and
    // incrementally polled messages are preserved while `checked` flags refresh
    setChats(
      reconcile(
        mergeChatItems(
          untrack(() => Array.from(chats)),
          merged
        ),
        { key: "id" }
      )
    );
  });

  const chatSignature = createMemo(() => chats.map((item) => `${item.id}:${item.checked ? 1 : 0}`).join("|"));

  let lastScrollSessionKey = "";
  let lastScrolledId = 0;

  createEffect(() => {
    if (!chatSignature()) return;

    // only auto-scroll on a session switch or when newer messages arrive, not
    // when older history is prepended or `checked` flags are reconciled
    const sessionKey = `${teamId()}:${challengeId()}`;
    const newestId = maxLoadedId();
    if (sessionKey === lastScrollSessionKey && newestId <= lastScrolledId) return;

    lastScrollSessionKey = sessionKey;
    lastScrolledId = newestId;

    const timeout = setTimeout(() => {
      chatBottomEl?.scrollIntoView({ behavior: "smooth" });
    }, 700);

    onCleanup(() => clearTimeout(timeout));
  });

  const [editorExpanded, setEditorExpanded] = createSignal(false);
  const [loadingOlder, setLoadingOlder] = createSignal(false);

  async function loadOlder() {
    const currentChallengeId = challengeId();
    const currentTeamId = teamId();
    const beforeId = minLoadedId();
    if (!currentChallengeId || !currentTeamId || beforeId <= 0 || loadingOlder()) return;
    setLoadingOlder(true);
    try {
      const page = await getGameAdminChatMessages(gameId(), currentChallengeId, currentTeamId, {
        mode: "before",
        before_id: beforeId,
      });
      setHasMoreHistory(page.has_more);
      if (page.items.length > 0) {
        setChats(
          reconcile(
            mergeChatItems(
              page.items,
              untrack(() => Array.from(chats))
            ),
            { key: "id" }
          )
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingOlder(false);
    }
  }

  let pollInFlight = false;
  let pollTick = 0;
  const interval = setInterval(async () => {
    const currentChallengeId = challengeId();
    const currentTeamId = teamId();
    if (!enabledSession() || !currentChallengeId || !currentTeamId || pollInFlight) return;
    // wait for the first latest page; syncing from after_id=0 before it lands
    // would rescan the whole history in limit-sized chunks
    if (cursor === 0 && !chatsQuery.data) return;
    pollInFlight = true;
    pollTick += 1;
    // pin the session for the whole drain: a team/challenge change mid-flight
    // must not merge the old session's rows or advance the new cursor
    const tickGameId = gameId();
    const tickSessionKey = `${tickGameId}:${currentTeamId}:${currentChallengeId}`;
    try {
      // drain every message newer than the cursor; the server caps each
      // response, so loop (bounded) until the session is fully caught up
      for (let drained = 0; drained < 20; drained += 1) {
        const page = await getGameAdminChatMessages(tickGameId, currentChallengeId, currentTeamId, {
          mode: "sync",
          after_id: cursor,
        });
        if (`${gameId()}:${teamId()}:${challengeId()}` !== tickSessionKey) break;
        const watermark = page.checked_through_id;
        if (watermark !== null) setCheckedThroughId((prev) => Math.max(prev, watermark));
        if (page.items.length === 0) break;
        const lastId = page.items[page.items.length - 1].id;
        if (lastId > cursor) cursor = lastId;
        // reconcile keeps the keyed diff fine-grained: the sync context
        // re-delivers the newest ~16 rows as fresh objects every poll, and a
        // plain store replacement would tear down and rebuild those rows
        setChats(
          reconcile(
            mergeChatItems(
              untrack(() => Array.from(chats)),
              page.items
            ),
            { key: "id" }
          )
        );
        if (!page.has_more) break;
      }
      // the chat reconcile is gone; refresh the solved marker on a slower cadence
      if (pollTick % 6 === 0) await solves.refetch();
    } catch (error) {
      console.error(error);
    } finally {
      pollInFlight = false;
    }
  }, 5000);
  onCleanup(() => clearInterval(interval));
  return (
    <>
      <Title
        page={team.data ? `${team.data.name} - ${t("game.hammer.title")}` : t("game.hammer.title")}
        route={`/games/${gameId()}/admin/hammers`}
      />
      <div class="flex-1 h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
        <div class="h-16 flex flex-row px-4 space-x-2 items-center backdrop-blur-sm border-b border-b-layer-content/10">
          <span class="shrink-0 icon-[fluent--chat-20-regular] w-5 h-5" />
          <A
            class="flex-1 w-0 flex flex-row space-x-2 hover:underline items-center truncate"
            href={`/games/${gameId()}/teams/${teamId()}`}
          >
            {team.data ? team.data.name : t("challenge.hammer.title")}
          </A>
          <Show when={challenge.data}>
            <A
              class="flex-1 w-0 flex flex-row justify-end space-x-2 hover:underline items-center truncate"
              href={`/games/${gameId()}/challenges?challenge=${challengeId()}`}
            >
              <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
              <span class="truncate">{challenge.data?.name}</span>
            </A>
          </Show>
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
            when={teamId() && challengeId()}
            fallback={
              <div class="min-h-full w-full flex flex-col opacity-60 items-center justify-center space-y-8">
                <span class="shrink-0 icon-[fluent--chat-20-regular] w-24 h-24" />
                <span class="font-bold">{t("game.hammer.placeholder")}</span>
              </div>
            }
          >
            <div class="flex flex-col min-h-full relative">
              <div class="flex flex-col flex-1 p-3 lg:p-6">
                <ChatBlock
                  avatar={platformAvatar}
                  showAvatar
                  roleLabel=">_<"
                  link="/magic/sakana"
                  nameLabel="Ciallo～(∠・ω< )⌒☆"
                  labelClasses="text-primary"
                  content={`${t("challenge.title")}: [${challenge.data?.name}](/games/${gameId()}/challenges?challenge=${challengeId()}), ${t("team.title")}: [${team.data?.name}](/games/${gameId()}/teams/${teamId()})`}
                  sendAt={game.data?.start_at ?? DateTime.now()}
                  isChecked
                />
                <ChatHistorySentinel onLoad={loadOlder} hasMore={hasMoreHistory()} loading={loadingOlder()} />
                <For each={chats.filter((m) => !classify(m) || classify(m)!.kind === "reply")}>
                  {(chat, index) => (
                    <ChatBlock
                      messageId={chat.id}
                      reactions={reactionTargets().get(chat.id)}
                      avatar={chat.id === 0 ? platformAvatar : chat.avatar ? mediaPath(chat.avatar) : undefined}
                      showAvatar={index() === 0 || chats.at(index() - 1)?.user_id !== chat.user_id}
                      roleLabel={
                        chat.id === 0
                          ? ">_<"
                          : chat.is_admin
                            ? t("challenge.hammer.role.admin")
                            : t("challenge.hammer.role.player")
                      }
                      link={chat.id === 0 ? "Ciallo～(∠・ω< )⌒☆" : `/users/${chat.user_id}`}
                      nameLabel={chat.user_name || "Unknown"}
                      labelClasses={chat.id === 0 ? "text-primary" : chat.is_admin ? "text-success" : "text-warning"}
                      content={chat.content}
                      sendAt={chat.created_at}
                      isChecked={chat.checked || chat.id <= checkedThroughId()}
                      reference={resolveReference(chat)}
                      onReact={chat.id === 0 ? undefined : (code) => reactTo(chat, code)}
                      onReply={chat.id === 0 ? undefined : () => replyTo(chat)}
                    />
                  )}
                </For>
              </div>
              <div class="sticky bottom-0 flex flex-col space-y-2 p-3 border-t border-t-layer-content/5 backdrop-blur">
                <div class="flex flex-row items-center h-8 space-x-2">
                  <ChatToolbarActions onInsert={(text) => setChat(chat() + text)} />
                  <div class="flex-1" />
                  <Show when={chatsQuery.isFetching || solves.isFetching}>
                    <span class="shrink-0 icon-[fluent--arrow-sync-20-regular] w-5 h-5 animate-spin" />
                  </Show>
                  <Link
                    href="https://docs.github.com/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax"
                    ghost
                    size="sm"
                    class="opacity-60"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span class="shrink-0 icon-[fluent--question-circle-20-regular] w-5 h-5" />
                    <span class="hidden lg:inline-block">{t("challenge.hammer.markdownHoto")}</span>
                  </Link>
                  <Button
                    size="sm"
                    square
                    onClick={() => {
                      setEditorExpanded(!editorExpanded());
                    }}
                  >
                    <Show
                      when={editorExpanded()}
                      fallback={<span class="shrink-0 icon-[fluent--arrow-expand-20-regular] w-5 h-5" />}
                    >
                      <span class="shrink-0 icon-[fluent--arrow-minimize-20-regular] w-5 h-5" />
                    </Show>
                  </Button>
                  <Button
                    level="primary"
                    size="sm"
                    onClick={handleSendChat}
                    disabled={sendMutation.isPending}
                    loading={sendMutation.isPending}
                  >
                    <span class="shrink-0 icon-[fluent--send-20-regular] w-5 h-5" />
                    <span>{t("general.actions.send.title")}</span>
                  </Button>
                </div>
                <EditorBare
                  commands={[
                    {
                      name: "send",
                      bindKey: "Ctrl+Enter",
                      exec: handleSendChat,
                    },
                  ]}
                  class={clsx(editorExpanded() ? "h-64" : "h-16")}
                  value={chat()}
                  placeholder="MARKDOWN"
                  lang="markdown"
                  onValueChanged={(v) => setChat(v)}
                />
              </div>
              <div ref={chatBottomEl} />
            </div>
          </Show>
        </OverlayScrollbarsComponent>
      </div>
    </>
  );
}
