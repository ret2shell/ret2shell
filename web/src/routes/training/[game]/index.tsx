import { useChallenge, useChallenges, useCreateChallengeMutation } from "@api/challenge";
import { useGame, useUpdateGameDocMutation, useUpdateGameMutation } from "@api/game";
import Challenge from "@blocks/challenge";
import Form, { type ChallengeForm } from "@blocks/challenge/form";
import Tabs from "@blocks/challenge/tabs";
import AdministratorsManagement from "@blocks/game/administrators";
import GameEdit, { type GameForm } from "@blocks/game/form";
import { SubmissionList } from "@blocks/game/lists";
import GameStatistics from "@blocks/game/statistics";
import type { Challenge as ChallengeModel } from "@models/challenge";
import { Permission } from "@models/user";
import GameDocForm from "@routes/games/[game]/_blocks/doc-form";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { isAdminOfGame } from "@storage/game";
import { Title } from "@storage/header";
import { fullTheme, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import LoadingTips from "@widgets/loading-tips";
import Tag from "@widgets/tag";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createMemo, Match, Switch } from "solid-js";
import Intro from "../_blocks/intro";

export default function () {
  const navigate = useNavigate();
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  if (!accountStore.token) {
    navigate(`/account/login?redirect=/training/${params.game ?? ""}`);
    return null;
  }
  if (!accountStore.permissions.includes(Permission.Verified)) {
    addToast({
      level: "warning",
      description: t("account.status.unverified.message"),
      duration: 5000,
    });
    navigate("/account/settings/info");
    return null;
  }
  const [searchParams, setSearchParams] = useSearchParams();
  const inCreate = createMemo(() => searchParams.create === "true");
  const inDocEdit = createMemo(() => searchParams.docEdit === "true");

  const selectedChallengeId = createMemo(
    () => Number.parseInt((searchParams.challenge as string) || "NaN", 10) || null
  );
  const inEdit = createMemo(() => searchParams.edit === "true");
  const inStatistics = createMemo(() => searchParams.statistics === "true");
  const inMonitor = createMemo(() => searchParams.monitor === "true");

  const game = useGame({ id: () => gameId(), enabled: () => gameId() > 0 });
  const isAdmin = createMemo(() => isAdminOfGame(game.data));
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
    enabled: () => gameId() > 0,
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
        initial: result.initial ?? 1,
        minimum: result.minimum ?? 1,
        decay: result.decay ?? 1,
      },
      score: result.initial ?? 1,
      bucket: null,
      release_at: result.release_at ? DateTime.fromSeconds(result.release_at) : null,
      archive_at: result.archive_at ? DateTime.fromSeconds(result.archive_at) : null,
    } as ChallengeModel;
    await createChallengeMutation.mutateAsync({ game_id: gameId(), challenge });
  }

  const updateGameMutation = useUpdateGameMutation({
    onSuccess: () => {
      game.refetch();
    },
  });
  const updateTrainingDocMutation = useUpdateGameDocMutation({
    onSuccess: () => {
      setSearchParams({ docEdit: null });
    },
  });

  async function onEditGame(result: GameForm) {
    // console.log("onEditGame", result, game.data);
    if (!game.data) return;
    // console.log("onEditGame proceeding to mutate");
    await updateGameMutation.mutateAsync({
      id: game.data.id,
      game: {
        ...game.data,
        ...result,
        start_at: game.data?.start_at,
        end_at: game.data?.end_at,
        register_at: game.data?.register_at,
        archive_at: game.data?.archive_at,
        award_rates: game.data?.award_rates || [0, 0, 0],
        hammer_policy: game.data?.hammer_policy || {
          enabled: true,
          outer_label: null,
          outer_url: null,
        },
      },
    });
  }

  async function onEditTrainingDoc(content: string) {
    await updateTrainingDocMutation.mutateAsync({
      id: gameId(),
      type: "training",
      content,
    });
  }

  return (
    <>
      <Title page={game.data?.name} route={`/training/${gameId()}`} />
      <div class="flex-1 flex flex-col w-0">
        <Tabs training gameId={gameId()} challengeId={selectedChallengeId() ?? 0} />
        <Switch>
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
                    <GameEdit onDone={onEditGame} gameId={gameId()} training />
                    <div class="h-16" />
                    <div class="w-full max-w-5xl flex flex-col space-y-2 relative">
                      <AdministratorsManagement gameId={gameId()} />
                    </div>
                  </div>
                </OverlayScrollbarsComponent>
              </div>
            </div>
          </Match>
          <Match when={inDocEdit() && isAdmin()}>
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
                  <div class="w-full flex flex-col h-full p-3 lg:p-6 items-center">
                    <GameDocForm gameId={gameId()} docType="training" onDone={onEditTrainingDoc} />
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
                    <GameStatistics training gameId={gameId()} />
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
                      <span class="shrink-0 icon-[fluent--flash-flow-20-regular] w-5 h-5" />
                      <span class="flex-1 text-start">{t("game.monitor.title")}</span>
                      <Tag level="success">
                        <span>{t("game.monitor.autoRefreshEnabled")}</span>
                      </Tag>
                    </h3>
                    <SubmissionList training gameId={gameId()} />
                  </div>
                </OverlayScrollbarsComponent>
              </div>
            </div>
          </Match>
          <Match when={challenge.isLoading}>
            <div class="flex-1 flex flex-row space-x-2 items-center justify-center">
              <LoadingTips />
            </div>
          </Match>
          <Match when={inCreate()}>
            <Form training gameId={gameId()} challengeId={0} onDone={onCreateChallenge} />
          </Match>
          <Match when={challenge.data}>
            <Challenge training archived gameId={gameId()} challengeId={selectedChallengeId()!} />
          </Match>
          <Match when={true}>
            <Intro editable={isAdmin()} onEdit={() => setSearchParams({ docEdit: "true" })} />
          </Match>
        </Switch>
      </div>
    </>
  );
}
