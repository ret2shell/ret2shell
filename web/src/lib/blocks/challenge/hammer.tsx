import { handleHttpError } from "@api";
import { getGamePlayerChatMessages, getTeamSolves, sendGamePlayerChatMessage } from "@api/game";
// import xdsecMascotCiallo from "@assets/imgs/xdsec-mascot-ciallo.webp";
import platformAvatar from "@assets/imgs/rx.webp";
// import { stickerSet } from "@assets/stickers";
import { mediaPath } from "@lib/utils/media";
import type { Challenge } from "@models/challenge";
import type { Chat } from "@models/chat";
import { A } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { challengeStore } from "@storage/challenge";
import { gameStore, isGameAdmin } from "@storage/game";
import { t } from "@storage/theme";
import Article from "@widgets/article";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import { EditorBare } from "@widgets/editor";
import Link from "@widgets/link";
import clsx from "clsx";
// import Popover from "@widgets/popover";
import type { DateTime } from "luxon";
// import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { TransitionGroup } from "solid-transition-group";

function mergeChats(
  challengeId: number,
  teamId: number,
  a: Chat[],
  b: Chat[],
  solvedAt: DateTime | null
): [boolean, Chat[]] {
  if (solvedAt) {
    b.push({
      id: 0,
      user_id: 0,
      user_name: "Ciallo～(∠・ω< )⌒☆",
      avatar: undefined,
      content: `${t("game.challenge.chatSolvedMessage")} ٩(๑•ω•๑)۶`,
      created_at: solvedAt,
      is_admin: true,
      challenge_id: challengeId,
      team_id: teamId,
      checked: true,
      game_id: gameStore.current!.id,
    });
  }
  const bb = b.sort((x, y) => x.id - y.id);
  const aa = a.sort((x, y) => x.id - y.id);

  let i = 0;
  const iLen = aa.length;
  let j = 0;
  const jLen = bb.length;

  let changed = false;

  while (i < iLen && j < jLen) {
    const aChat = aa[i];
    const bChat = bb[j];
    if (aChat.id === bChat.id && aChat.checked === bChat.checked) {
      i++;
      j++;
    } else if (aChat.id === bChat.id) {
      aa[i] = bChat;
      changed = true;
      i++;
      j++;
    } else if (aChat.id > bChat.id) {
      aa.push(bChat);
      changed = true;
      j++;
    } else {
      i++;
    }
  }
  while (j < jLen) {
    aa.push(bb[j]);
    changed = true;
    j++;
  }
  return [changed, aa.sort((x, y) => x.created_at.toMillis() - y.created_at.toMillis())];
}

export default function (props: {
  onStateChange?: (challenge?: Challenge) => void;
  onExpand?: () => void;
  expanded?: boolean;
  inGame?: boolean;
}) {
  const [chats, setChats] = createSignal([] as Chat[]);
  const [chat, setChat] = createSignal("");
  const [sending, setSending] = createSignal(false);

  async function handleSendChat() {
    if (chat().trim() === "") return;
    if (gameStore.current && challengeStore.current) {
      setSending(true);
      try {
        await sendGamePlayerChatMessage(gameStore.current.id, challengeStore.current.id, chat());
        setChat("");
        refreshChats();
      } catch (err) {
        handleHttpError(err as Error, t("game.challenge.sendChatError")!);
      } finally {
        setSending(false);
      }
    }
  }

  const [_loading, setLoading] = createSignal(false);

  async function _refreshChats() {
    if (gameStore.current && challengeStore.current && !isGameAdmin()) {
      try {
        setLoading(true);
        const s = await getSolveStatus();
        const result = await getGamePlayerChatMessages(gameStore.current.id, challengeStore.current.id);
        const [changed, r] = mergeChats(challengeStore.current.id, gameStore.team?.id ?? 0, chats(), result, s);
        setChats([...r]);
        if (changed) {
          setTimeout(() => chatBottomEl?.scrollIntoView({ behavior: "smooth" }), 700);
        }
      } catch (err) {
        handleHttpError(err as Error, t("game.challenge.fetchSolveError")!);
      }
      setLoading(false);
    }
  }

  function refreshChats() {
    _refreshChats();
    return refreshChats;
  }

  const interval = setInterval(refreshChats(), 5000);
  onCleanup(() => clearInterval(interval));
  let chatBottomEl: HTMLDivElement;

  async function getSolveStatus() {
    if (gameStore.current?.id && gameStore.team?.id && !isGameAdmin()) {
      const resp = await getTeamSolves(gameStore.current.id, gameStore.team.id);
      try {
        const s = resp.find((x) => x.challenge_id === challengeStore.current?.id);
        return s?.created_at ?? null;
      } catch (err) {
        handleHttpError(err as Error, t("game.challenge.fetchSolveError")!);
      }
      return null;
    }
    return null;
  }
  const availableMsg = createMemo(() => {
    // every player could send up to 3 messages before admin reply
    let count = 0;
    for (let i = chats().length - 1; i >= 0; i--) {
      if (chats().at(i)?.user_id === accountStore.id) count++;
      if (chats().at(i)?.is_admin) break;
    }
    return 3 - count;
  });
  const [editorExpanded, setEditorExpanded] = createSignal(false);

  onMount(() => {
    setTimeout(() => chatBottomEl?.scrollIntoView({ behavior: "smooth" }), 300);
  });

  return (
    <div class="flex flex-col min-h-full relative">
      <div class="flex flex-col flex-1 px-3 lg:px-6 pt-3 space-y-1">
        <Show
          when={!isGameAdmin()}
          fallback={
            <div class="self-start flex-row max-w-[calc(100%-4rem)] flex items-center">
              <A class="w-10 h-10 shrink-0 self-start mt-2" href="/magic/sakana">
                <Avatar class="w-full h-full" src={platformAvatar} fallback="Ciallo" />
              </A>
              <div class="w-4 shrink-0" />
              <div class="flex flex-col space-y-1">
                <header class="label">Ciallo～(∠・ω&lt; )⌒☆</header>
                <Card contentClass="p-2">
                  <p class="text-wrap">{t("game.admin.hammer.shouldGoto")}</p>
                </Card>
                <div class="h-3" />
              </div>
            </div>
          }
        >
          <div class="self-start flex-row max-w-[calc(100%-4rem)] flex items-center">
            <A class="w-10 h-10 shrink-0 self-start mt-2" href="/magic/sakana">
              <Avatar class="w-full h-full" src={platformAvatar} fallback="Ciallo" />
            </A>
            <div class="w-4 shrink-0" />
            <div class="flex flex-col space-y-1">
              <header class="label">Ciallo～(∠・ω&lt; )⌒☆</header>
              <Card contentClass="p-2">
                <p class="text-wrap">{t("game.challenge.hammerTips")}</p>
              </Card>
              <div class="h-3" />
            </div>
          </div>
          <div class="self-start flex-row max-w-[calc(100%-4rem)] flex items-center">
            <A class="w-10 h-10 shrink-0 self-start mt-2" href="/magic/sakana">
              <Avatar class="w-full h-full" src={platformAvatar} fallback="Ciallo" />
            </A>
            <div class="w-4 shrink-0" />
            <div class="flex flex-col space-y-1 items-start">
              <header class="label">Ciallo～(∠・ω&lt; )⌒☆</header>
              <Card contentClass="p-2">
                <p class="text-wrap inline">
                  <span>{t("game.challenge.hammerTips2")}</span>
                  <span>{t("game.challenge.hammerTips3")}</span>
                  <a
                    class="align-middle space-x-1 text-primary hover:underline"
                    href="https://paste.mozilla.org/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>Mozilla Public Pastebin</span>
                    <span class="icon-[fluent--open-20-regular]" />
                  </a>
                  <span>&nbsp;</span>
                  <a
                    class="align-middle space-x-1 text-primary hover:underline"
                    href="https://0x0.st"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>0x0.st</span>
                    <span class="icon-[fluent--open-20-regular]" />
                  </a>
                </p>
              </Card>
              <div class="h-3" />
            </div>
          </div>
        </Show>
        <TransitionGroup name="fade-group-up">
          <For each={chats()}>
            {(chat, index) => (
              <div
                class={clsx(
                  "fade-group-up",
                  chat.user_id !== accountStore.id ? "self-start flex-row" : "self-end flex-row-reverse",
                  "w-[calc(100%-4rem)] flex items-center"
                )}
              >
                <Show
                  when={index() === 0 || chats().at(index() - 1)?.user_id !== chat.user_id}
                  fallback={<div class="w-10 h-10 shrink-0 self-start" />}
                >
                  <Show
                    when={chat.id !== 0}
                    fallback={
                      <A class="w-10 h-10 shrink-0 self-start mt-2" href="/magic/sakana">
                        <Avatar class="w-full h-full" src={platformAvatar} fallback="Ciallo" />
                      </A>
                    }
                  >
                    <A class="w-10 h-10 shrink-0 self-start mt-2" href={`/users/${chat.user_id}`}>
                      <Avatar
                        class="w-full h-full"
                        src={chat.avatar ? mediaPath(chat.avatar) : undefined}
                        fallback={chat.user_name}
                      />
                    </A>
                  </Show>
                </Show>
                <div class="w-4 shrink-0" />
                <div
                  class={clsx(
                    chat.user_id !== accountStore.id ? "items-start" : "items-end",
                    "flex-1 w-0 flex flex-col"
                  )}
                >
                  <Show when={index() === 0 || chats().at(index() - 1)?.user_id !== chat.user_id}>
                    <header class="label space-x-2 py-1">
                      <Show when={chat.user_id !== 0}>
                        <Show
                          when={chat.is_admin}
                          fallback={<span class="text-info">[{t("game.challenge.chatPlayerRole")}]</span>}
                        >
                          <span class="text-error">[{t("game.challenge.chatAdminRole")}]</span>
                        </Show>
                      </Show>
                      <A href={`/users/${chat.user_id}`}>{chat.user_name}</A>
                    </header>
                  </Show>
                  <div
                    class={clsx(
                      chat.user_id !== accountStore.id ? "flex-row" : "flex-row-reverse",
                      "peer flex max-w-full"
                    )}
                  >
                    <Card
                      contentClass={clsx(
                        chat.user_id !== accountStore.id ? "flex-row" : "flex-row-reverse",
                        "flex p-2"
                      )}
                    >
                      <Article content={chat.content} noExtraPaddings compact extra />
                      <div class="w-2" />
                      <span class="text-xs opacity-60 self-end">{chat.created_at.toFormat("HH:mm")}</span>
                    </Card>
                    <div class="self-end flex items-end">
                      <span
                        class={
                          chat.checked
                            ? "icon-[fluent--circle-20-filled] w-2 h-2 text-success"
                            : "icon-[fluent--circle-20-regular] w-2 h-2 opacity-40"
                        }
                      />
                    </div>
                  </div>
                  <header class="opacity-0 h-0 peer-hover:h-4 peer-hover:opacity-60 text-sm transition-all duration-300">
                    {chat.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}
                  </header>
                </div>
              </div>
            )}
          </For>
        </TransitionGroup>
      </div>
      <div class="sticky bottom-0 flex flex-col space-y-2 p-3 border-t border-t-layer-content/5 backdrop-blur">
        <div class="flex flex-row items-center h-8 space-x-2">
          <span class="hidden lg:flex items-center space-x-2">
            <span class={clsx("w-2 h-2 rounded-full", availableMsg() <= 0 ? "bg-error" : "bg-success")} />
            <span class="opacity-60">
              {availableMsg() <= 0
                ? t("game.challenge.hammerInputAlreadySend")
                : t("game.challenge.hammerLastMessage", {
                    last: availableMsg(),
                  })}
            </span>
          </span>
          <div class="flex-1" />
          <Link
            href="https://docs.github.com/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax"
            ghost
            size="sm"
            class="opacity-60"
            target="_blank"
            rel="noreferrer"
          >
            <span class="icon-[fluent--question-circle-20-regular] w-5 h-5" />
            <span class="hidden lg:inline-block">{t("game.challenge.hammerHowto")}</span>
          </Link>
          <Button
            size="sm"
            square
            onClick={() => {
              if (props.onExpand && !props.expanded) props.onExpand();
              setEditorExpanded(!editorExpanded());
            }}
          >
            <Show when={editorExpanded()} fallback={<span class="icon-[fluent--arrow-expand-20-regular] w-5 h-5" />}>
              <span class="icon-[fluent--arrow-minimize-20-regular] w-5 h-5" />
            </Show>
          </Button>
          <Button
            level="primary"
            size="sm"
            onClick={handleSendChat}
            disabled={sending() || availableMsg() <= 0 || isGameAdmin()}
            loading={sending()}
          >
            <span class="icon-[fluent--send-20-regular] w-5 h-5" />
            <span>{t("game.challenge.hammerSend")}</span>
          </Button>
        </div>
        <EditorBare
          class={clsx("rounded-lg", editorExpanded() ? "h-64" : "h-16")}
          value={chat()}
          placeholder={t("game.challenge.hammerInput")}
          lang="markdown"
          onValueChanged={(v) => setChat(v)}
        />
      </div>
      <div ref={chatBottomEl!} />
    </div>
  );
}
