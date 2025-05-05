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
import { ChatBlock, mergeChats } from "@blocks/challenge/hammer";
// import { stickerSet } from "@assets/stickers";
import { mediaPath } from "@lib/utils/media";
import type { Challenge } from "@models/challenge";
import type { Chat } from "@models/chat";
import type { Team } from "@models/team";
import { A, useSearchParams } from "@solidjs/router";
import { gameStore } from "@storage/game";
import { Title } from "@storage/header";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import { EditorBare } from "@widgets/editor";
import Link from "@widgets/link";
import clsx from "clsx";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";

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
          handleHttpError(err as Error, t("challenge.errors.fetch.title")!);
        }
      });
    }
    if (gameStore.current && teamId()) {
      untrack(async () => {
        try {
          setTeam(await getTeamInfo(gameStore.current!.id, teamId()!));
        } catch (err) {
          handleHttpError(err as Error, t("team.errors.fetch.title")!);
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
      handleHttpError(err as Error, t("challenge.hammer.errors.send.title")!);
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
        if (changed)
          setTimeout(() => {
            chatBottomEl! && chatBottomEl.scrollIntoView({ behavior: "smooth" });
          }, 700);
      } catch (err) {
        handleHttpError(err as Error, t("challenge.hammer.errors.fetch.title")!);
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
        handleHttpError(err as Error, t("challenge.hammer.errors.fetchSolve.title")!);
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
        page={team() ? `${team()?.name} - ${t("game.hammer.title")}` : t("game.hammer.title")}
        route={`/games/${gameStore.current?.id}/admin/hammers`}
      />
      <div class="flex-1 h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
        <div class="h-16 flex flex-row px-4 space-x-2 items-center backdrop-blur-sm border-b border-b-layer-content/10">
          <span class="icon-[fluent--chat-20-regular] w-5 h-5 shrink-0" />
          <A
            class="flex-1 w-0 flex flex-row space-x-2 hover:underline items-center truncate"
            href={`/games/${gameStore.current?.id}/teams/${teamId()}`}
          >
            {team() ? team()?.name : t("challenge.hammer.title")}
          </A>
          <Show when={challenge()}>
            <A
              class="flex-1 w-0 flex flex-row justify-end space-x-2 hover:underline items-center truncate"
              href={`/games/${gameStore.current?.id}/challenges?challenge=${challengeId()}`}
            >
              <span class="icon-[fluent--flag-20-regular] w-5 h-5 shrink-0" />
              <span class="truncate">{challenge()?.name}</span>
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
                <span class="icon-[fluent--chat-20-regular] w-24 h-24" />
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
                  content={`${t("challenge.title")}: [${challenge()?.name}](/games/${gameStore.current?.id}/challenges?challenge=${challengeId()}), ${t("team.title")}: [${team()?.name}](/games/${gameStore.current?.id}/teams/${teamId()})`}
                  sendAt={gameStore.current?.start_at ?? DateTime.now()}
                  isChecked
                />
                <For each={chats()}>
                  {(chat, index) => (
                    <ChatBlock
                      avatar={chat.id === 0 ? platformAvatar : chat.avatar ? mediaPath(chat.avatar) : undefined}
                      showAvatar={index() === 0 || chats().at(index() - 1)?.user_id !== chat.user_id}
                      roleLabel={
                        chat.id === 0
                          ? ">_<"
                          : chat.is_admin
                            ? t("challenge.hammer.role.admin")!
                            : t("challenge.hammer.role.player")!
                      }
                      link={chat.id === 0 ? "Ciallo～(∠・ω< )⌒☆" : `/users/${chat.user_id}`}
                      nameLabel={chat.user_name || "Unknown"}
                      labelClasses={chat.id === 0 ? "text-primary" : chat.is_admin ? "text-success" : "text-warning"}
                      content={chat.content}
                      sendAt={chat.created_at}
                      isChecked={chat.checked}
                    />
                  )}
                </For>
              </div>
              <div class="sticky bottom-0 flex flex-col space-y-2 p-3 border-t border-t-layer-content/5 backdrop-blur">
                <div class="flex flex-row items-center h-8 space-x-2">
                  <div class="flex-1" />
                  <Show when={loading()}>
                    <span class="icon-[fluent--arrow-sync-20-regular] w-5 h-5 animate-spin" />
                  </Show>
                  <Link
                    href="https://docs.github.com/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax"
                    ghost
                    size="sm"
                    class="opacity-60"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span class="icon-[fluent--question-circle-20-regular] w-5 h-5" />
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
                      fallback={<span class="icon-[fluent--arrow-expand-20-regular] w-5 h-5" />}
                    >
                      <span class="icon-[fluent--arrow-minimize-20-regular] w-5 h-5" />
                    </Show>
                  </Button>
                  <Button level="primary" size="sm" onClick={handleSendChat} disabled={sending()} loading={sending()}>
                    <span class="icon-[fluent--send-20-regular] w-5 h-5" />
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
              <div ref={chatBottomEl!} />
            </div>
          </Show>
        </OverlayScrollbarsComponent>
      </div>
    </>
  );
}
