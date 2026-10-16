import {
  getGamePlayerChatMessages,
  useGame,
  useGamePlayerChatMessages,
  useSelfSolves,
  useSendGamePlayerChatMessageMutation,
} from "@api/game";
import { useSelfTeam } from "@api/team";
import platformAvatar from "@assets/imgs/rx.webp";
import { mediaPath } from "@lib/utils/media";
import type { Chat } from "@models/chat";
import { createBreakpoints } from "@solid-primitives/media";
import { A } from "@solidjs/router";
import { isAdminOfGame, isGameInProgress } from "@storage/game";
import { breakpoints, t } from "@storage/theme";
import Article from "@widgets/article";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import { EditorBare } from "@widgets/editor";
import Link from "@widgets/link";
import clsx from "clsx";
import { DateTime } from "luxon";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  untrack,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import type { ChallengeWidgetProps } from ".";
import { mergeChatItems, mergeChats } from "./hammer.utils";

// kept in sync with CHAT_REPLY_MESSAGE_LIMIT on the server; only used as the
// quota fallback before the first authoritative `remaining` arrives
const FREE_MESSAGE_LIMIT = 3;

export function ChatBlock(props: {
  avatar?: string;
  showAvatar?: boolean;
  roleLabel: string;
  nameLabel: string;
  labelClasses: string;
  link: string;
  content: string;
  sendAt: DateTime;
  isChecked?: boolean;
}) {
  const matches = createBreakpoints(breakpoints);
  return (
    <div class={clsx("self-start flex-row flex items-center", matches.lg ? "w-[calc(100%-4rem)]" : "w-full")}>
      <Show when={props.showAvatar} fallback={<div class="w-10 h-10 shrink-0 self-start" />}>
        <A class="w-10 h-10 shrink-0 self-start mt-2" href={props.link}>
          <Avatar class="w-full h-full" src={props.avatar} fallback={props.nameLabel} />
        </A>
      </Show>
      <div class="w-2 shrink-0" />
      <div class="flex flex-col space-y-1 bg-transparent hover:bg-layer-content/5 flex-1 p-2 rounded-md group transition-colors duration-300">
        <Show when={props.showAvatar}>
          <header class="label">
            <A href={props.link} class="space-x-2 hover:underline">
              <span class={props.labelClasses}>[{props.roleLabel}]</span>
              <span>{props.nameLabel}</span>
            </A>
          </header>
        </Show>
        <Article class="max-w-full!" content={props.content} noExtraPaddings compact extra />
        <footer class="text-xs flex items-center space-x-2">
          <span class="opacity-30 group-hover:opacity-80 transition-opacity duration-300">
            {props.sendAt.toFormat("yyyy-MM-dd HH:mm")}
          </span>
          <Show
            when={props.isChecked}
            fallback={<span class="shrink-0 icon-[fluent--circle-16-regular] w-4 h-4 text-gray-500" />}
          >
            <span class="shrink-0 icon-[fluent--checkmark-16-regular] w-4 h-4 text-success" />
          </Show>
        </footer>
      </div>
    </div>
  );
}

export default function (props: ChallengeWidgetProps) {
  const [chats, setChats] = createStore<Chat[]>([]);
  const [chat, setChat] = createSignal("");

  const game = useGame({ id: () => props.gameId });
  const team = useSelfTeam({
    game_id: () => props.gameId,
    enabled: () => !props.training && !!game.data && isGameInProgress(game.data) && !isAdminOfGame(game.data),
  });

  const sendMutation = useSendGamePlayerChatMessageMutation({
    onSuccess: () => {
      setChat("");
      if (chatsQuery.refetch) chatsQuery.refetch();
    },
  });

  const chatsQuery = useGamePlayerChatMessages({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
    enabled: () => !props.training && !isAdminOfGame(game.data),
  });
  const solvesQuery = useSelfSolves({
    game_id: () => props.gameId,
    enabled: () => !props.training && !isAdminOfGame(game.data),
  });

  const [hasMoreHistory, setHasMoreHistory] = createSignal(false);
  const [checkedThroughId, setCheckedThroughId] = createSignal(0);
  const [remaining, setRemaining] = createSignal<number | null>(null);

  const minLoadedId = createMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    for (const item of chats) {
      // the synthetic solved message uses id 0 and must not become a cursor
      if (item.id > 0 && item.id < min) min = item.id;
    }
    return Number.isFinite(min) ? min : 0;
  });

  // client-owned monotone sync cursor: the highest message id merged so far.
  // the session-wide checked watermark must never anchor fetches: a teammate
  // reading the thread would move it past messages this client never fetched.
  let cursor = 0;
  let lastSessionKey = "";

  createEffect(() => {
    const data = chatsQuery.data;
    const sessionKey = `${props.gameId}:${props.challengeId}:${team.data?.id ?? 0}`;

    if (!data || !solvesQuery.data) {
      // do not mark the session as loaded here: the first page that arrives
      // must count as a session change so `has_more` initializes history paging
      cursor = 0;
      setCheckedThroughId(0);
      setRemaining(null);
      setHasMoreHistory(false);
      setChats(reconcile([]));
      return;
    }

    const merged = mergeChats(
      props.gameId,
      props.challengeId,
      team.data?.id ?? 0,
      data.items,
      solvesQuery.data.find((v) => v.challenge_id === props.challengeId)?.created_at ?? null
    );

    const sessionChanged = sessionKey !== lastSessionKey;
    if (sessionChanged) {
      lastSessionKey = sessionKey;
      // reset per-session state before adopting the new session's page
      cursor = 0;
      setCheckedThroughId(0);
      setRemaining(null);
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
    if (data.remaining !== null) setRemaining(data.remaining);

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

  let pollInFlight = false;
  let pollTick = 0;
  const interval = setInterval(async () => {
    if (pollInFlight) return;
    // wait for the first latest page; syncing from after_id=0 before it lands
    // would rescan the whole history in limit-sized chunks
    if (cursor === 0 && !chatsQuery.data) return;
    pollInFlight = true;
    pollTick += 1;
    // pin the session for the whole drain: if the challenge changes while a
    // request is in flight, its response must not be merged into the new
    // session or advance the new session's cursor past unmerged ids
    const tickGameId = props.gameId;
    const tickChallengeId = props.challengeId;
    const tickSessionKey = `${tickGameId}:${tickChallengeId}:${team.data?.id ?? 0}`;
    try {
      // drain every message newer than the cursor; the server caps each
      // response, so loop (bounded) until the session is fully caught up
      for (let drained = 0; drained < 20; drained += 1) {
        const page = await getGamePlayerChatMessages(tickGameId, tickChallengeId, {
          mode: "sync",
          after_id: cursor,
        });
        if (`${props.gameId}:${props.challengeId}:${team.data?.id ?? 0}` !== tickSessionKey) break;
        const watermark = page.checked_through_id;
        if (watermark !== null) setCheckedThroughId((prev) => Math.max(prev, watermark));
        if (page.remaining !== null) setRemaining(page.remaining);
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
      if (pollTick % 6 === 0) await solvesQuery.refetch();
    } catch (error) {
      console.error(error);
    } finally {
      pollInFlight = false;
    }
  }, 5000);
  onCleanup(() => clearInterval(interval));

  const [loadingOlder, setLoadingOlder] = createSignal(false);

  async function loadOlder() {
    const beforeId = minLoadedId();
    if (beforeId <= 0 || loadingOlder()) return;
    setLoadingOlder(true);
    try {
      const page = await getGamePlayerChatMessages(props.gameId, props.challengeId, {
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

  let chatBottomEl: HTMLDivElement;

  // the server is authoritative for the send quota; fall back to the cap
  // until the first response with `remaining` arrives
  const availableMsg = createMemo(() => remaining() ?? FREE_MESSAGE_LIMIT);
  const [editorExpanded, setEditorExpanded] = createSignal(false);

  onMount(() => {
    // @ts-expect-error chatBottomEl is bound by SolidJS after rendered
    setTimeout(() => chatBottomEl?.scrollIntoView({ behavior: "smooth" }), 300);
  });

  return (
    <div class="flex flex-col min-h-full relative">
      <div class="flex flex-col flex-1 px-3 lg:px-6 pt-3">
        <Switch
          fallback={
            <>
              <ChatBlock
                avatar={platformAvatar}
                showAvatar
                roleLabel=">_<"
                link="/magic/sakana"
                nameLabel="Ciallo～(∠・ω< )⌒☆"
                labelClasses="text-primary"
                content={t("challenge.hammer.tips.0")}
                sendAt={game.data?.start_at || DateTime.now()}
                isChecked
              />
              <ChatBlock
                avatar={platformAvatar}
                roleLabel=">_<"
                link="/magic/sakana"
                nameLabel="Ciallo～(∠・ω< )⌒☆"
                labelClasses="text-primary"
                content={`${t("challenge.hammer.tips.1")}\n\n${t("challenge.hammer.tips.2")} [GitHub Gists](https://gist.github.com), [bpa.st](https://bpa.st), [paste.rs](https://paste.rs), [0x0.st](https://0x0.st)`}
                sendAt={game.data?.start_at || DateTime.now()}
                isChecked
              />
            </>
          }
        >
          <Match when={!game.data?.hammer_policy?.enabled && game.data?.hammer_policy?.outer_url}>
            <ChatBlock
              avatar={platformAvatar}
              showAvatar
              roleLabel=">_<"
              link="/magic/sakana"
              nameLabel="Ciallo～(∠・ω< )⌒☆"
              labelClasses="text-primary"
              content={`${t("challenge.hammer.outerGoto")}: [${game.data?.hammer_policy?.outer_label}](${game.data?.hammer_policy?.outer_url})`}
              sendAt={game.data?.start_at || DateTime.now()}
              isChecked
            />
          </Match>
          <Match when={!game.data?.hammer_policy?.enabled}>
            <ChatBlock
              avatar={platformAvatar}
              showAvatar
              roleLabel=">_<"
              link="/magic/sakana"
              nameLabel="Ciallo～(∠・ω< )⌒☆"
              labelClasses="text-primary"
              content={`${t("challenge.hammer.outerFollow")}`}
              sendAt={game.data?.start_at || DateTime.now()}
              isChecked
            />
          </Match>
          <Match when={isAdminOfGame(game.data)}>
            <ChatBlock
              avatar={platformAvatar}
              showAvatar
              roleLabel=">_<"
              link="/magic/sakana"
              nameLabel="Ciallo～(∠・ω< )⌒☆"
              labelClasses="text-primary"
              content={t("challenge.hammer.adminGoto")}
              sendAt={game.data?.start_at || DateTime.now()}
              isChecked
            />
          </Match>
        </Switch>
        <Show when={hasMoreHistory()}>
          <div class="flex justify-center py-2">
            <Button size="sm" ghost onClick={loadOlder} loading={loadingOlder()} disabled={loadingOlder()}>
              {t("general.actions.loadMore.title")}
            </Button>
          </div>
        </Show>
        <For each={chats}>
          {(chat, index) => (
            <ChatBlock
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
              labelClasses={chat.is_admin ? "text-success" : "text-warning"}
              content={chat.content}
              sendAt={chat.created_at}
              isChecked={chat.checked || chat.id <= checkedThroughId()}
            />
          )}
        </For>
      </div>
      <div class="h-6 shrink-0" />
      <div class="sticky bottom-0 flex flex-col space-y-2 p-3 border-t border-t-layer-content/5 backdrop-blur">
        <div class="flex flex-row items-center h-8 space-x-2">
          <span class="hidden lg:flex items-center space-x-2">
            <span class={clsx("w-2 h-2 rounded-full", availableMsg() <= 0 ? "bg-error" : "bg-success")} />
            <span class="opacity-60">
              {availableMsg() <= 0
                ? t("challenge.hammer.errors.maxMessageLimit.title")
                : t("challenge.hammer.freeMessages", {
                    last: availableMsg(),
                  })}
            </span>
          </span>
          <div class="flex-1" />
          <Show when={chatsQuery.isLoading || sendMutation.isPending}>
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
            onClick={() =>
              sendMutation.mutate({
                game_id: props.gameId,
                challenge_id: props.challengeId,
                content: chat(),
              })
            }
            disabled={
              sendMutation.isPending ||
              availableMsg() <= 0 ||
              isAdminOfGame(game.data) ||
              !game.data?.hammer_policy?.enabled
            }
            loading={sendMutation.isPending || chatsQuery.isLoading}
          >
            <span class="shrink-0 icon-[fluent--send-20-regular] w-5 h-5" />
            <span>{t("general.actions.send.title")}</span>
          </Button>
        </div>
        <EditorBare
          class={clsx(editorExpanded() ? "h-64" : "h-16")}
          value={chat()}
          placeholder={t("challenge.hammer.markdownSupport")}
          lang="markdown"
          onValueChanged={(v) => setChat(v)}
          commands={[
            {
              name: "send",
              bindKey: "Ctrl+Enter",
              exec: () =>
                sendMutation.mutate({
                  game_id: props.gameId,
                  challenge_id: props.challengeId,
                  content: chat(),
                }),
            },
          ]}
        />
      </div>
      <div ref={chatBottomEl!} />
    </div>
  );
}
