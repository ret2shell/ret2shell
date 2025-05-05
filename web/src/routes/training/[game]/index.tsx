import { handleHttpError } from "@api";
import { createChallenge, getChallenge, updateGame } from "@api/game";
import Challenge from "@blocks/challenge";
import Form, { type ChallengeForm } from "@blocks/challenge/form";
import Tabs from "@blocks/challenge/tabs";
import AdministratorsManagement from "@blocks/game/administrators";
import GameEdit, { type GameForm } from "@blocks/game/form";
import { SubmissionList } from "@blocks/game/lists";
import GameStatistics from "@blocks/game/statistics";
import type { Challenge as ChallengeModel } from "@models/challenge";
import { Permission } from "@models/user";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { challengeStore, refreshChallengeAssets, refreshChallenges, setChallengeStore } from "@storage/challenge";
import { gameStore, setGameStore } from "@storage/game";
import { Title } from "@storage/header";
import { fullTheme, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import LoadingTips from "@widgets/loading-tips";
import Tag from "@widgets/tag";
import type { HTTPError } from "ky";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { Match, Switch, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import Intro from "../_blocks/intro";

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
      description: t("account.status.unverified.message")!,
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
      handleHttpError(err as Error, t("general.actions.create.status.fail")!);
    }
    setCreating(false);
  }
  const selectedChallengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) || "NaN") || null);
  const inEdit = createMemo(() => searchParams.edit === "true");
  const inStatistics = createMemo(() => searchParams.statistics === "true");
  const inMonitor = createMemo(() => searchParams.monitor === "true");
  createEffect(() => {
    if (selectedChallengeId() && gameStore.current) {
      untrack(async () => {
        setLoadingChallenge(true);
        try {
          const resp = await getChallenge(gameStore.current!.id, selectedChallengeId()!);
          setChallengeStore({ current: resp });
          refreshChallengeAssets();
        } catch (err) {
          handleHttpError(err as Error, t("challenge.errors.fetch.title")!);
          setSearchParams({ challenge: null, create: null });
        }
        setLoadingChallenge(false);
      });
    } else {
      setChallengeStore({ current: null });
    }
  });
  onCleanup(() => {
    setGameStore({
      current: null,
      preload: null,
      team: null,
      showTeamCover: false,
    });
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
          result.first_blood_award ?? result.award_rate ?? 0,
          result.second_blood_award ?? ((result.award_rate ?? 0) * 2) / 3,
          result.third_blood_award ?? (result.award_rate ?? 0) / 3,
        ],
      });
      setGameStore({ current: resp });
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("general.actions.save.status.fail")!);
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
          <Match when={inMonitor()}>
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
                  <div class="w-full flex flex-col p-3 lg:p-6">
                    <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2 w-full">
                      <span class="icon-[fluent--flash-flow-20-regular] w-5 h-5" />
                      <span class="flex-1 text-start">{t("game.monitor.title")}</span>
                      <Tag level="success">
                        <span>{t("game.monitor.autoRefreshEnabled")}</span>
                      </Tag>
                    </h3>
                    <SubmissionList />
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
            <Challenge onStateChange={refreshChallenges} archived />
          </Match>
        </Switch>
      </div>
    </>
  );
}
