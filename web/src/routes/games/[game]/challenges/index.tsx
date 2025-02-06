import Challenge from "@blocks/challenge";
import Form, { type ChallengeForm } from "@blocks/challenge/form";
import ChallengeList from "@blocks/challenge/list";
import SidebarLayout from "@blocks/sidebar-layout";
import type { Challenge as ChallengeModel } from "@models/challenge";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { gameStore, isGameAdmin } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Link from "@widgets/link";
import LoadingTips from "@widgets/loading-tips";

import { createChallenge, getChallenge } from "@api/game";
import { addToast } from "@storage/toast";
import { DateTime } from "luxon";
import { Match, Show, Switch, createEffect, createMemo, createSignal, untrack } from "solid-js";
import Notifications from "./_blocks/notifications";
import Team from "./_blocks/team";
import Welcome from "./_blocks/welcome";

import Tabs from "@blocks/challenge/tabs";
import { createBreakpoints } from "@solid-primitives/media";
import { challengeStore, refreshChallengeAssets, refreshChallenges, setChallengeStore } from "@storage/challenge";
import Button from "@widgets/button";
import { Transition } from "solid-transition-group";
import { handleHttpError } from "@api";
import clsx from "clsx";

export default function () {
  const navigate = useNavigate();
  if (accountStore.token === null) {
    navigate(`/account/login?redirect=/games/${gameStore.current ? gameStore.current.id : ""}`);
    return null;
  }
  const [loadingChallenge, setLoadingChallenge] = createSignal(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedChallengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) || "NaN") || null);
  const inCreate = createMemo(() => searchParams.create === "true");
  const [creating, setCreating] = createSignal(false);

  createEffect(() => {
    if (gameStore.current && gameStore.current.archive_at < DateTime.now()) {
      addToast({
        level: "warning",
        description: t("game.archivedGotoTraining")!,
        duration: 5000,
      });
      navigate(`/games/${gameStore.current.id}`);
    }
  });

  createEffect(() => {
    if (selectedChallengeId() && gameStore.current) {
      if (gameStore.current && gameStore.current.start_at > DateTime.now() && !isGameAdmin()) {
        addToast({
          level: "warning",
          description: t("game.challenge.notStarted")!,
          duration: 5000,
        });
        navigate(`/games/${gameStore.current.id}`);
        return;
      }
      untrack(async () => {
        setLoadingChallenge(true);
        try {
          const resp = await getChallenge(gameStore.current!.id, selectedChallengeId()!);
          setChallengeStore({ current: resp });
          refreshChallengeAssets();
        } catch (err) {
          handleHttpError(err as Error, t("game.challenge.fetchChallengeFailed")!);
          setSearchParams({ challenge: null, create: null });
        }
        setLoadingChallenge(false);
      });
    } else {
      setChallengeStore({ current: null });
    }
  });

  async function onCreateChallenge(result: ChallengeForm) {
    setCreating(true);
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
      game_id: gameStore.current?.id,
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
    try {
      const result = await createChallenge(gameStore.current!.id, challenge);
      setSearchParams({
        create: null,
        challenge: result.id,
      });
      refreshChallenges();
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.createFailed")!);
    }
    setCreating(false);
  }
  const breakpoints = {
    lg: "1024px",
    xl: "1440px",
  };
  const matches = createBreakpoints(breakpoints);
  const [showLeftSidebar, setShowLeftSidebar] = createSignal(false);
  const [showRightSidebar, setShowRightSidebar] = createSignal(false);
  return (
    <>
      <Title page={t("game.challenge.title")} route={`/games/${gameStore.current?.id}/challenges`} />
      <SidebarLayout
        showLeftBar={showLeftSidebar()}
        leftBar={() => (
          <div class="h-full flex flex-col">
            <div class="border-b border-b-layer-content/10 px-2 h-16 flex items-center justify-center">
              <Link class="w-full" ghost justify="start" href={`/games/${gameStore.current?.id}/challenges`}>
                <span class="icon-[fluent--flag-20-filled] w-5 h-5 text-primary" />
                <span>{t("game.challenge.list")}</span>
              </Link>
            </div>
            <ChallengeList showScore inGame />
          </div>
        )}
        showRightBar={showRightSidebar()}
        rightBar={() => (
          <div class="h-full flex flex-col">
            <Team />
            <Notifications />
          </div>
        )}
      >
        <div class="flex-1 flex flex-col w-0">
          <Tabs baseUrl={`/games/${gameStore.current?.id}/challenges`} loading={loadingChallenge()} inGame />
          <Switch fallback={<Welcome />}>
            <Match when={loadingChallenge()}>
              <div class="flex-1 flex flex-row space-x-2 items-center justify-center">
                <LoadingTips />
              </div>
            </Match>
            <Match when={inCreate()}>
              <Form onDone={onCreateChallenge} loading={creating()} inGame />
            </Match>
            <Match when={challengeStore.current}>
              <Challenge inGame onStateChange={refreshChallenges} />
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
