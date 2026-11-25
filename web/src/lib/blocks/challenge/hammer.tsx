import { useGame, useGamePlayerChatMessages, useSelfSolves, useSendGamePlayerChatMessageMutation } from "@api/game";
import { useSelfTeam } from "@api/team";
import platformAvatar from "@assets/imgs/rx.webp";
import { mediaPath } from "@lib/utils/media";
import type { Chat } from "@models/chat";
import { createBreakpoints } from "@solid-primitives/media";

import { accountStore } from "@storage/account";
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
  createMemo,
  createSignal,
  createStore,
  createTrackedEffect,
  For,
  Match,
  onCleanup,
  onSettled,
  reconcile,
  Show,
  Switch,
} from "solid-js";

import type { ChallengeWidgetProps } from ".";
import { mergeChats } from "./hammer.utils";

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
        <a class="w-10 h-10 shrink-0 self-start mt-2" href={props.link}>
          <Avatar class="w-full h-full" src={props.avatar} fallback={props.nameLabel} />
        </a>
      </Show>
      <div class="w-2 shrink-0" />
      <div class="flex flex-col space-y-1 bg-transparent hover:bg-layer-content/5 flex-1 p-2 rounded-md group transition-colors duration-300">
        <Show when={props.showAvatar}>
          <header class="label">
            <a href={props.link} class="space-x-2 hover:underline">
              <span class={props.labelClasses}>[{props.roleLabel}]</span>
              <span>{props.nameLabel}</span>
            </a>
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

  createTrackedEffect(() => {
    if (!chatsQuery.data || !solvesQuery.data) {
      setChats(reconcile([]));
      return;
    }

    setChats(
      reconcile(
        mergeChats(
          props.gameId,
          props.challengeId,
          team.data?.id ?? 0,
          chatsQuery.data,
          solvesQuery.data.find((v) => v.challenge_id === props.challengeId)?.created_at ?? null
        ),
        "id"
      )
    );
  });

  const interval = setInterval(() => chatsQuery.refetch(), 5000);
  onCleanup(() => clearInterval(interval));
  let chatBottomEl: HTMLDivElement;

  const availableMsg = createMemo(() => {
    // every player could send up to 3 messages before admin reply
    let count = 0;
    for (let i = chats.length - 1; i >= 0; i--) {
      if (chats.at(i)?.user_id === accountStore.id) count++;
      if (chats.at(i)?.is_admin && chats.at(i)?.user_id !== 0) break;
    }
    return 3 - count;
  });
  const [editorExpanded, setEditorExpanded] = createSignal(false);

  onSettled(() => {
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
