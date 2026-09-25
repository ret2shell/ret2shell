import { useChallenge, useChallenges, useCreateChallengeMutation } from "@api/challenge";
import { useCheckUnreadMessages, useGame } from "@api/game";
import { useSelfTeam } from "@api/team";
import Challenge from "@blocks/challenge";
import Form, { type ChallengeForm } from "@blocks/challenge/form";
import ChallengeList from "@blocks/challenge/list";
import Milestones from "@blocks/challenge/milestones";
import Tabs from "@blocks/challenge/tabs";
import SidebarLayout from "@blocks/sidebar-layout";
import type { Challenge as ChallengeModel } from "@models/challenge";
import type { Chat } from "@models/chat";
import { createBreakpoints } from "@solid-primitives/media";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { isAdminOfGame, isGameInArchived } from "@storage/game";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import { addToast, removeToast } from "@storage/toast";
import Button from "@widgets/button";
import Link from "@widgets/link";
import LoadingTips from "@widgets/loading-tips";
import clsx from "clsx";
import { DateTime } from "luxon";
import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { Transition } from "solid-transition-group";
import Notifications from "./_blocks/notifications";
import Team from "./_blocks/team";
import Welcome from "./_blocks/welcome";

export default function () {
  const navigate = useNavigate();
  const params = useParams();
  const gameId = () => Number.parseInt(params.game || "UNKN0WN", 10);

  if (!accountStore.token) {
    navigate(`/account/login?redirect=/games/${gameId() || ""}`);
    return null;
  }

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedChallengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) || "", 10) || null);
  const inCreate = createMemo(() => searchParams.create === "true");
  const inMilestones = createMemo(() => searchParams.milestones === "true");

  const game = useGame({ id: () => gameId(), enabled: () => !!gameId() });
  const team = useSelfTeam({
    game_id: () => gameId(),
    enabled: () => !!accountStore.token && !!gameId(),
    silenced: true,
  });

  const challenge = useChallenge({
    game_id: () => gameId(),
    challenge_id: () => selectedChallengeId() || 0,
    enabled: () => !!selectedChallengeId(),
    onError: () => {
      setSearchParams({ challenge: null, create: null });
      return false;
    },
  });

  const challenges = useChallenges({
    game_id: () => gameId(),
    enabled: () => !!gameId(),
  });

  const archived = createMemo(() => {
    if (!game.data?.archive_policy.challenge.show_answer) return false;
    return (challenge.data?.archive_at?.toMillis() || Number.POSITIVE_INFINITY) < Date.now();
  });

  createEffect(() => {
    if (isGameInArchived(game.data)) {
      navigate(`/training/${gameId()}${location.search}`, { replace: true });
      // addToast({
      //   level: "warning",
      //   description: t("game.gotoTraining"),
      //   duration: 5000,
      // });
      // navigate(`/games/${gameId()}`);
    }
  });

  createEffect(() => {
    if (game.data && game.data.start_at > DateTime.now() && !isAdminOfGame(game.data)) {
      addToast({
        level: "warning",
        description: t("game.notStarted"),
        duration: 5000,
      });
      navigate(`/games/${gameId()}`);
      return;
    }
  });

  const createChallengeMutation = useCreateChallengeMutation({
    onSuccess: (created) => {
      setSearchParams({ create: null, challenge: created.id });
      challenges.refetch();
    },
  });

  async function onCreateChallenge(result: ChallengeForm) {
    const tags = result.tag.split("/").map((t) => {
      return { name: t, primary: false };
    });
    tags[0].primary = true;

    const challenge = {
      id: 0,
      name: result.name,
      updated_at: DateTime.now(),
      hidden: true,
      content: result.content,
      game_id: gameId(),
      tag: tags,
      score_rule: {
        initial: result.initial,
        minimum: result.minimum,
        decay: result.decay,
      },
      score: result.initial,
      bucket: null,
      release_at: result.release_at ? DateTime.fromSeconds(result.release_at) : null,
      archive_at: result.archive_at ? DateTime.fromSeconds(result.archive_at) : null,
    } as ChallengeModel;
    await createChallengeMutation.mutateAsync({ game_id: gameId(), challenge });
  }

  let prevUnreadChats: Chat[] = [];
  const canCheckUnread = createMemo(() => game.data?.hammer_policy?.enabled === true && !!team.data);
  const unreadChatsQuery = useCheckUnreadMessages({
    game_id: () => gameId(),
    enabled: () => canCheckUnread(),
  });

  createEffect(() => {
    if (!canCheckUnread()) {
      prevUnreadChats = [];
      return;
    }
    if (!unreadChatsQuery.data) return;

    for (const chat of unreadChatsQuery.data) {
      if (prevUnreadChats.find((c) => chat.id === c.id)) continue;
      let msg = chat.content;
      if (msg.length > 32) msg = `${msg.slice(0, 32)}...`;
      const challengeName = challenges.data?.[0].find((v) => v.id === chat.challenge_id)?.name ?? "[DELETED]";
      const toastId = addToast({
        level: "info",
        description: `${t("game.hammer.newMessages", { challenge: challengeName })}: ${msg}`,
        duration: 5000,
        accept: () => {
          navigate(`/games/${gameId()}/challenges?challenge=${chat.challenge_id}&tab=hammer`);
          setTimeout(() => removeToast(toastId), 50);
        },
        acceptLabel: t("general.actions.goto.title"),
      });
    }
    prevUnreadChats = unreadChatsQuery.data;
  });

  const chatsRefreshTimer = setInterval(() => {
    if (!canCheckUnread()) return;
    unreadChatsQuery.refetch();
  }, 30 * 1000);

  onCleanup(() => {
    clearInterval(chatsRefreshTimer);
  });

  const matches = createBreakpoints(breakpoints);
  const [showLeftSidebar, setShowLeftSidebar] = createSignal(false);
  const [showRightSidebar, setShowRightSidebar] = createSignal(false);
  return (
    <>
      <Title page={t("challenge.title")} route={`/games/${gameId()}/challenges`} />
      <SidebarLayout
        showLeftBar={showLeftSidebar()}
        leftBar={() => (
          <div class="h-full flex flex-col">
            <div class="border-b border-b-layer-content/10 px-2 h-16 flex items-center justify-center">
              <Link class="w-full" ghost justify="start" href={`/games/${gameId()}/challenges`}>
                <span class="shrink-0 icon-[fluent--flag-20-filled] w-5 h-5 text-primary" />
                <span>{t("challenge.list")}</span>
              </Link>
            </div>
            <ChallengeList showScore gameId={gameId()} challengeId={selectedChallengeId() ?? 0} />
          </div>
        )}
        showRightBar={showRightSidebar()}
        rightBar={() => (
          <div class="h-full flex flex-col">
            <Team gameId={gameId()} />
            <Notifications gameId={gameId()} />
          </div>
        )}
      >
        <div class="flex-1 flex flex-col w-0">
          <Tabs gameId={gameId()} challengeId={selectedChallengeId() ?? undefined} />
          <Switch fallback={<Welcome />}>
            <Match when={challenge.isLoading}>
              <div class="flex-1 flex flex-row space-x-2 items-center justify-center">
                <LoadingTips />
              </div>
            </Match>
            <Match when={inCreate()}>
              <Form onDone={onCreateChallenge} gameId={gameId()} challengeId={0} />
            </Match>
            <Match when={inMilestones()}>
              <Milestones gameId={gameId()} />
            </Match>
            <Match when={selectedChallengeId() && challenge.data}>
              <Challenge challengeId={selectedChallengeId()!} gameId={gameId()} archived={archived()} />
            </Match>
          </Switch>
        </div>
      </SidebarLayout>
      <Transition name="slide-fade-right">
        <Show when={!matches.lg}>
          <Button
            class="fixed bottom-3 right-3 z-30"
            square
            onClick={() => {
              setShowRightSidebar(false);
              setShowLeftSidebar(!showLeftSidebar());
            }}
            type="button"
          >
            <span
              class={clsx(
                "transition-transform",
                showLeftSidebar() && "rotate-90",
                showLeftSidebar() ? "icon-[fluent--dismiss-20-regular]" : "icon-[fluent--code-20-regular]",
                "w-5 h-5"
              )}
            />
          </Button>
        </Show>
      </Transition>
      <Transition name="slide-fade-left">
        <Show when={!matches.xl}>
          <Button
            class="fixed bottom-3 left-3 z-30"
            square
            onClick={() => {
              setShowLeftSidebar(false);
              setShowRightSidebar(!showRightSidebar());
            }}
            type="button"
          >
            <span
              class={clsx(
                "transition-transform",
                showRightSidebar() && "rotate-90",
                showRightSidebar() ? "icon-[fluent--dismiss-20-regular]" : "icon-[fluent--alert-20-regular]",
                "w-5 h-5"
              )}
            />
          </Button>
        </Show>
      </Transition>
    </>
  );
}
