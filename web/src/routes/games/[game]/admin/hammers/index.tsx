import { handleHttpError } from "@api";
import {
  getChallenge,
  getGameAdminChatMessages,
  getTeamInfo,
  getTeamSolves,
  sendGameAdminChatMessage,
} from "@api/game";
// import xdsecMascotCiallo from "@assets/imgs/xdsec-mascot-ciallo.webp";
import platformAvatar from "@assets/imgs/rx.webp";
// import { stickerSet } from "@assets/stickers";
import { mediaPath } from "@lib/utils/media";
import type { Challenge } from "@models/challenge";
import type { Chat } from "@models/chat";
import type { Team } from "@models/team";
import { A, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { gameStore } from "@storage/game";
import { Title } from "@storage/header";
import { fullTheme, t } from "@storage/theme";
import Article from "@widgets/article";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import { EditorBare } from "@widgets/editor";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import type { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { TransitionGroup } from "solid-transition-group";

const quickReplies = [
  t("game.challenge.chatQuickReply1"),
  t("game.challenge.chatQuickReply2"),
  t("game.challenge.chatQuickReply3"),
  t("game.challenge.chatQuickReply4"),
];

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
  const aa = a.filter((x) => x.challenge_id === challengeId && x.team_id === teamId).sort((x, y) => x.id - y.id);

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

export default function () {
  const [searchParams, _] = useSearchParams();
  const teamId = createMemo(() => Number.parseInt((searchParams.team as string) ?? "") || null);
  const challengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) ?? "") || null);
  const [challenge, setChallenge] = createSignal(null as Challenge | null);
  const [team, setTeam] = createSignal(null as Team | null);
  createEffect(() => {
    if (gameStore.current && challengeId()) {
      untrack(async () => {
        try {
          setChallenge(await getChallenge(gameStore.current!.id, challengeId()!));
        } catch (err) {
          handleHttpError(err as Error, t("game.challenge.fetchChallengeFailed")!);
        }
      });
    }
    if (gameStore.current && teamId()) {
      untrack(async () => {
        try {
          setTeam(await getTeamInfo(gameStore.current!.id, teamId()!));
        } catch (err) {
          handleHttpError(err as Error, t("game.team.fetchTeamFailed")!);
        }
      });
    }
  });
  const [chats, setChats] = createSignal([] as Chat[]);
  const [chat, setChat] = createSignal("");
  const [sending, setSending] = createSignal(false);
  async function handleSendChat() {
    if (chat().trim() === "") return;
    setSending(true);
    try {
      await sendGameAdminChatMessage(gameStore.current!.id, challengeId()!, teamId()!, chat());
      setChat("");
      refreshChats();
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.sendChatError")!);
    }
    setSending(false);
  }
  let chatBottomEl: HTMLDivElement;

  const [loading, setLoading] = createSignal(false);

  async function _refreshChats() {
    if (gameStore.current && challengeId() && teamId()) {
      setLoading(true);
      try {
        const [s, result] = await Promise.all([
          getSolveStatus(),
          getGameAdminChatMessages(gameStore.current.id, challengeId()!, teamId()!),
        ]);
        const [changed, r] = mergeChats(challengeId()!, teamId()!, chats(), result, s);
        setChats([...r]);
        if (changed) setTimeout(() => chatBottomEl?.scrollIntoView({ behavior: "smooth" }), 700);
      } catch (err) {
        handleHttpError(err as Error, t("game.challenge.fetchChatError")!);
      }
      setLoading(false);
    }
  }

  function refreshChats() {
    _refreshChats();
    return refreshChats;
  }

  createEffect(() => {
    if (gameStore.current && challengeId() && teamId()) {
      untrack(refreshChats);
    }
  });
  const [editorExpanded, setEditorExpanded] = createSignal(false);

  async function getSolveStatus() {
    if (gameStore.current?.id && teamId()) {
      const resp = await getTeamSolves(gameStore.current.id, teamId()!);
      try {
        const s = resp.find((x) => x.challenge_id === challengeId());
        return s?.created_at ?? null;
      } catch (err) {
        handleHttpError(err as Error, t("game.challenge.fetchSolveError")!);
      }
      return null;
    }
    return null;
  }

  const interval = setInterval(refreshChats(), 5000);
  onCleanup(() => clearInterval(interval));
  return (
    <>
      <Title
        page={team() ? `${team()?.name} - ${t("game.admin.hammer.title")}` : t("game.admin.hammer.title")}
        route={`/games/${gameStore.current?.id}/admin/hammers`}
      />
      <div class="flex-1 h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
        <div class="h-16 flex flex-row px-4 space-x-2 items-center backdrop-blur border-b border-b-layer-content/10">
          <span class="icon-[fluent--chat-20-regular] w-5 h-5 flex-shrink-0" />
          <A
            class="flex-1 w-0 flex flex-row space-x-2 hover:underline items-center truncate"
            href={`/games/${gameStore.current?.id}/teams/${teamId()}`}
          >
            {team() ? team()?.name : t("game.admin.chat.title")}
          </A>
          <Show when={challenge()}>
            <A
              class="flex-1 w-0 flex flex-row justify-end space-x-2 hover:underline items-center truncate"
              href={`/games/${gameStore.current?.id}/challenges?challenge=${challengeId()}`}
            >
              <span class="icon-[fluent--flag-20-regular] w-5 h-5 flex-shrink-0" />
              <span class="truncate">{challenge()?.name}</span>
            </A>
          </Show>
        </div>
        <OverlayScrollbarsComponent
          class="w-full flex-1 backdrop-blur relative"
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
                <span class="icon-[fluent--chat-20-regular] w-24 h-24" />
                <span class="font-bold">{t("game.admin.chat.selectToShow")}</span>
              </div>
            }
          >
            <div class="flex flex-col min-h-full relative">
              <div class="flex flex-col flex-1 p-3 lg:p-6 space-y-1">
                <div class="self-start flex-row w-[calc(100%-4rem)] flex items-center">
                  <A class="w-10 h-10 flex-shrink-0 self-start mt-2" href="/magic/sakana">
                    <Avatar class="w-full h-full" src={platformAvatar} fallback="Ciallo" />
                  </A>
                  <div class="w-4 flex-shrink-0" />
                  <div class="flex-1 w-0 flex flex-col space-y-1 items-start">
                    <header class="label">Ciallo～(∠・ω&lt; )⌒☆</header>
                    <Card class="max-w-full" contentClass="flex flex-col space-y-2 p-2 max-w-full">
                      <span>{t("game.challenge.adminHammerTips")}</span>
                      <div class="flex flex-col space-y-2 max-w-full">
                        <Link
                          class="!h-auto p-2"
                          justify="start"
                          href={`/games/${gameStore.current?.id}/challenges?challenge=${challengeId()}`}
                        >
                          <div class="flex flex-row space-x-2 items-center pr-4 max-w-full w-full">
                            <span class="icon-[fluent--code-20-filled] w-8 h-8 m-2 flex-shrink-0" />
                            <div class="flex flex-col items-start flex-1 w-0">
                              <h3 class="font-bold truncate w-full text-start">{challenge()?.name}</h3>
                              <p class="opacity-60">{challenge()?.score} pts</p>
                            </div>
                          </div>
                        </Link>
                        <Link
                          class="!h-auto p-2"
                          justify="start"
                          href={`/games/${gameStore.current?.id}/teams/${teamId()}`}
                        >
                          <div class="flex flex-row space-x-2 items-center pr-4 max-w-full w-full">
                            <span class="icon-[fluent--flag-20-filled] w-8 h-8 m-2 flex-shrink-0" />
                            <div class="flex flex-col items-start flex-1 w-0">
                              <h3 class="font-bold truncate w-full text-start">{team()?.name}</h3>
                              <p class="opacity-60">{team()?.score} pts</p>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </Card>
                    <div class="h-3" />
                  </div>
                </div>
                <TransitionGroup name="fade-group-up">
                  <For each={chats()}>
                    {(chat, index) => (
                      <div
                        class={`fade-group-up ${chat.user_id !== accountStore.id ? "self-start flex-row" : "self-end flex-row-reverse"} w-[calc(100%-4rem)] flex items-center`}
                      >
                        <Show
                          when={chat.id !== 0}
                          fallback={
                            <A class="w-10 h-10 flex-shrink-0 self-start mt-2" href="/magic/sakana">
                              <Avatar class="w-full h-full" src={platformAvatar} fallback="Ciallo" />
                            </A>
                          }
                        >
                          <Show
                            when={index() === 0 || chats().at(index() - 1)?.user_id !== chat.user_id}
                            fallback={<div class="w-10 h-10 flex-shrink-0 self-start" />}
                          >
                            <A class="w-10 h-10 flex-shrink-0 self-start mt-2" href={`/users/${chat.user_id}`}>
                              <Avatar
                                class="w-full h-full"
                                src={chat.avatar ? mediaPath(chat.avatar) : undefined}
                                fallback={chat.user_name}
                              />
                            </A>
                          </Show>
                        </Show>
                        <div class="w-4 flex-shrink-0" />
                        <div
                          class={`flex-1 w-0 flex flex-col ${chat.user_id !== accountStore.id ? "items-start" : "items-end"}`}
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
                            class={`peer flex max-w-full ${chat.user_id !== accountStore.id ? "flex-row" : "flex-row-reverse"}`}
                          >
                            <Card contentClass="p-2">
                              <Article content={chat.content} noExtraPaddings compact extra />
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
              <div class="sticky bottom-0 flex flex-col space-y-2 p-3 border-t border-t-layer-content/5 bg-layer">
                <div class="flex flex-row items-center h-8 space-x-2">
                  <Popover size="sm" square ghost btnContent={<span class="icon-[fluent--flash-20-regular] w-5 h-5" />}>
                    <Card contentClass="p-2">
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
                        <div class="flex flex-col space-y-2">
                          <For each={quickReplies}>
                            {(reply) => (
                              <Button
                                size="sm"
                                justify="start"
                                ghost
                                onClick={() => {
                                  setChat(reply!);
                                  setTimeout(() => {
                                    handleSendChat();
                                  });
                                }}
                              >
                                <span class="icon-[fluent--chat-20-regular] w-5 h-5" />
                                <span>{reply}</span>
                              </Button>
                            )}
                          </For>
                        </div>
                      </OverlayScrollbarsComponent>
                    </Card>
                  </Popover>
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
                      setEditorExpanded(!editorExpanded());
                    }}
                  >
                    <Show
                      when={editorExpanded()}
                      fallback={<span class="icon-[fluent--arrow-expand-20-regular] w-5 h-5" />}
                    >
                      <span class="icon-[fluent--arrow-minimize-20-regular] w-5 h-5" />
                    </Show>
                  </Button>
                  <Button
                    level="primary"
                    size="sm"
                    onClick={handleSendChat}
                    disabled={sending()}
                    loading={sending() || loading()}
                  >
                    <span class="icon-[fluent--send-20-regular] w-5 h-5" />
                    <span>{t("game.challenge.hammerSend")}</span>
                  </Button>
                </div>
                <EditorBare
                  class={`bg-layer rounded-lg ${editorExpanded() ? "h-64" : "h-16"}`}
                  value={chat()}
                  placeholder="MARKDOWN"
                  lang="markdown"
                  onValueChanged={(v) => setChat(v)}
                />
              </div>
              <div ref={chatBottomEl!} />
            </div>
          </Show>
        </OverlayScrollbarsComponent>
      </div>
    </>
  );
}
