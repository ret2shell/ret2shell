import { handleHttpError } from "@api";
import { getGamePlayerChatMessages, getTeamSolves, sendGamePlayerChatMessage } from "@api/game";
// import xdsecMascotCiallo from "@assets/imgs/xdsec-mascot-ciallo.webp";
import platformAvatar from "@assets/imgs/rx.webp";
// import { stickerSet } from "@assets/stickers";
import { mediaPath } from "@lib/utils/media";
import type { Challenge } from "@models/challenge";
import type { Chat } from "@models/chat";
import { createBreakpoints } from "@solid-primitives/media";
import { A } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { challengeStore } from "@storage/challenge";
import { gameStore, isGameAdmin } from "@storage/game";
import { breakpoints, t } from "@storage/theme";
import Article from "@widgets/article";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import { EditorBare } from "@widgets/editor";
import Link from "@widgets/link";
import clsx from "clsx";
// import Popover from "@widgets/popover";
import type { DateTime } from "luxon";
// import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";

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
    <>
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
          <Article class="!max-w-full" content={props.content} noExtraPaddings compact extra />
          <footer class="text-xs flex items-center space-x-2">
            <span class="opacity-30 group-hover:opacity-80 transition-opacity duration-300">
              {props.sendAt.toFormat("yyyy-MM-dd HH:mm")}
            </span>
            <Show
              when={props.isChecked}
              fallback={<span class="icon-[fluent--circle-16-regular] w-4 h-4 text-gray-500" />}
            >
              <span class="icon-[fluent--checkmark-16-regular] w-4 h-4 text-success" />
            </Show>
          </footer>
        </div>
      </div>
    </>
  );
}

export function mergeChats(
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
      content: `${t("challenge.hammer.solved")} ٩(๑•ω•๑)۶`,
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
        handleHttpError(err as Error, t("challenge.hammer.errors.send.title")!);
      } finally {
        setSending(false);
      }
    }
  }

  const [loading, setLoading] = createSignal(false);

  async function _refreshChats() {
    if (gameStore.current && challengeStore.current && !isGameAdmin()) {
      try {
        setLoading(true);
        const s = await getSolveStatus();
        const result = await getGamePlayerChatMessages(gameStore.current.id, challengeStore.current.id);
        const [changed, r] = mergeChats(challengeStore.current.id, gameStore.team?.id ?? 0, chats(), result, s);
        setChats([...r]);
        if (changed) {
          // @ts-expect-error chatBottomEl is bound by SolidJS after rendered
          setTimeout(() => chatBottomEl?.scrollIntoView({ behavior: "smooth" }), 700);
        }
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
        handleHttpError(err as Error, t("challenge.hammer.errors.fetchSolve.title")!);
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
      if (chats().at(i)?.is_admin && chats().at(i)?.user_id !== 0) break;
    }
    return 3 - count;
  });
  const [editorExpanded, setEditorExpanded] = createSignal(false);

  onMount(() => {
    // @ts-expect-error chatBottomEl is bound by SolidJS after rendered
    setTimeout(() => chatBottomEl?.scrollIntoView({ behavior: "smooth" }), 300);
  });

  return (
    <div class="flex flex-col min-h-full relative">
      <div class="flex flex-col flex-1 px-3 lg:px-6 pt-3">
        <Show
          when={!isGameAdmin()}
          fallback={
            <ChatBlock
              avatar={platformAvatar}
              showAvatar
              roleLabel=">_<"
              link="/magic/sakana"
              nameLabel="Ciallo～(∠・ω< )⌒☆"
              labelClasses="text-primary"
              content={t("challenge.hammer.adminGoto")!}
              sendAt={gameStore.current!.start_at}
              isChecked
            />
          }
        >
          <ChatBlock
            avatar={platformAvatar}
            showAvatar
            roleLabel=">_<"
            link="/magic/sakana"
            nameLabel="Ciallo～(∠・ω< )⌒☆"
            labelClasses="text-primary"
            content={t("challenge.hammer.tips.0")!}
            sendAt={gameStore.current!.start_at}
            isChecked
          />
          <ChatBlock
            avatar={platformAvatar}
            roleLabel=">_<"
            link="/magic/sakana"
            nameLabel="Ciallo～(∠・ω< )⌒☆"
            labelClasses="text-primary"
            content={`${t("challenge.hammer.tips.1")}\n\n${t("challenge.hammer.tips.2")} [GitHub Gists](https://gist.github.com), [bpa.st](https://bpa.st), [0x0.st](https://0x0.st)`}
            sendAt={gameStore.current!.start_at}
            isChecked
          />
        </Show>
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
              labelClasses={chat.is_admin ? "text-success" : "text-warning"}
              content={chat.content}
              sendAt={chat.created_at}
              isChecked={chat.checked}
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
              exec: handleSendChat,
            },
          ]}
        />
      </div>
      <div ref={chatBottomEl!} />
    </div>
  );
}
