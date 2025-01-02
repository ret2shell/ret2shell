import Challenge from "@blocks/challenge";
import type { Challenge as ChallengeModel } from "@models/challenge";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { gameStore, setGameStore } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import LoadingTips from "@widgets/loading-tips";
import { Match, Switch, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import Intro from "../_blocks/intro";

import { createChallenge, getChallenge, updateGame } from "@api/game";
import Form, { type ChallengeForm } from "@blocks/challenge/form";
import Tabs from "@blocks/challenge/tabs";
import AdministratorsManagement from "@blocks/game/administrators";
import GameEdit, { type GameForm } from "@blocks/game/form";
import GameStatistics from "@blocks/game/statistics";
import { challengeStore, refreshChallengeAssets, refreshChallenges, setChallengeStore } from "@storage/challenge";
import { addToast } from "@storage/toast";
import type { HTTPError } from "ky";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { accountStore } from "@storage/account";
import { Permission } from "@models/user";
import { handleHttpError } from "@api";
import { Title } from "@storage/header";

export default function () {
  const navigate = useNavigate();
  const params = useParams();
  if (!accountStore.token) {
    navigate(`/account/login?redirect=/training/${params.game}`);
    return;
  }
  if (!accountStore.permissions.includes(Permission.Verified)) {
    addToast({
      level: "warning",
      description: t("account.emailNotVerified")!,
      duration: 5000,
    });
    navigate("/account/settings/info");
    return;
  }
  const [searchParams, setSearchParams] = useSearchParams();
  const inCreate = createMemo(() => searchParams.create === "true");
  const [loadingChallenge, setLoadingChallenge] = createSignal(false);
  const [creating, setCreating] = createSignal(false);

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
        initial: 1,
        minimum: 1,
        decay: 1,
      },
      score: 1,
      bucket: null,
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
  const selectedChallengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) || "NaN") || null);
  const inEdit = createMemo(() => searchParams.edit === "true");
  const inStatistics = createMemo(() => searchParams.statistics === "true");
  createEffect(() => {
    if (selectedChallengeId() && gameStore.current) {
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
  onCleanup(() => {
    setGameStore({ current: null, preload: null, team: null, showTeamCover: false });
    setChallengeStore({ current: null, challenges: [], solves: [] });
  });

  const [editing, setEditing] = createSignal(false);

  async function onEditGame(result: GameForm) {
    setEditing(true);
    try {
      const resp = await updateGame(gameStore.current!.id, {
        ...gameStore.current!,
        ...result,
        start_at: gameStore.current?.start_at ?? DateTime.fromFormat("2002-05-05 10:00", "yyyy-MM-dd HH:mm"),
        end_at: gameStore.current?.end_at ?? DateTime.fromFormat("2077-01-01 10:00", "yyyy-MM-dd HH:mm"),
        archive_at: gameStore.current?.archive_at ?? DateTime.fromFormat("2077-01-01 10:00", "yyyy-MM-dd HH:mm"),
        register_at: gameStore.current?.register_at ?? DateTime.fromFormat("2002-05-05 10:00", "yyyy-MM-dd HH:mm"),
        award_rates: [
          result.award_rate_1 ?? result.award_rate ?? 0,
          result.award_rate_2 ?? ((result.award_rate ?? 0) * 2) / 3,
          result.award_rate_3 ?? (result.award_rate ?? 0) / 3,
        ],
      });
      setGameStore({ current: resp });
      addToast({
        level: "success",
        description: t("form.saveSuccess")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("form.saveFailed")!);
    }
    setEditing(false);
  }

  return (
    <>
      <Title page={gameStore.current?.name} route={`/training/${gameStore.current?.id}`} />
      <div class="flex-1 flex flex-col w-0">
        <Tabs baseUrl={`/training/${gameStore.current?.id}`} loading={loadingChallenge()} />
        <Switch fallback={<Intro />}>
          <Match when={inEdit()}>
            <div class="flex-1 w-full relative">
              <div class="absolute top-0 left-0 w-full h-full overflow-hidden">
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
                  <div class="w-full flex flex-col p-3 lg:p-6 items-center">
                    <GameEdit onDone={onEditGame} loading={editing()} editSource={gameStore.current || undefined} />
                    <div class="h-16" />
                    <div class="w-full max-w-5xl flex flex-col space-y-2 relative">
                      <AdministratorsManagement />
                    </div>
                  </div>
                </OverlayScrollbarsComponent>
              </div>
            </div>
          </Match>
          <Match when={inStatistics()}>
            <div class="flex-1 w-full relative">
              <div class="absolute top-0 left-0 w-full h-full overflow-hidden">
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
                  <div class="w-full flex flex-col p-3 lg:p-6 items-center">
                    <GameStatistics />
                  </div>
                </OverlayScrollbarsComponent>
              </div>
            </div>
          </Match>
          <Match when={loadingChallenge()}>
            <div class="flex-1 flex flex-row space-x-2 items-center justify-center">
              <LoadingTips />
            </div>
          </Match>
          <Match when={inCreate()}>
            <Form onDone={onCreateChallenge} loading={creating()} />
          </Match>
          <Match when={challengeStore.current}>
            <Challenge onStateChange={refreshChallenges} />
          </Match>
        </Switch>
      </div>
    </>
  );
}
