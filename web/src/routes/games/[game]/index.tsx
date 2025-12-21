import { handleHttpError } from "@api";
import { useInstitutes } from "@api/account";
import { useGame, useGameIntroduction, useUpdateGameIntroductionMutation, useUpdateGameMutation } from "@api/game";
import { uploadMedia } from "@api/media";
import { useSelfTeam, useTeamRank } from "@api/team";
import LogoAnimate from "@assets/animates/logo-animate";
import Spin from "@assets/animates/spin";
import EditFlag from "@assets/icons/edit-flag";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { randomTips } from "@lib/utils/loading-tips";
import { mediaPath } from "@lib/utils/media";
import type { Article as ArticleModel } from "@models/article";
import { stringifyState, TeamState } from "@models/team";
import { A, useParams, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import {
  isAdminOfGame,
  isGameCanParticipate,
  isGameInArchived,
  isGameInArchiving,
  isGameInProgress,
  isGameInRegister,
} from "@storage/game";
import { t } from "@storage/theme";
import Article from "@widgets/article";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Link from "@widgets/link";
import Picture from "@widgets/picture";
import Tag from "@widgets/tag";
import Timer from "@widgets/timer";
import { DateTime } from "luxon";
import { createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import IntroForm from "./_blocks/intro-form";

function BannedWarning() {
  const [close, setClose] = createSignal(false);
  return (
    <Show when={!close()}>
      <div class="bg-error/60 backdrop-blur-sm fixed top-16 left-0 right-0 bottom-0 flex flex-col space-y-8 items-center justify-center">
        <span class="shrink-0 icon-[fluent--warning-20-filled] w-12 h-12" />
        <span class="font-bold text-2xl">{t("team.status.banned.title")}</span>
        <span>{t("team.status.banned.message")}</span>
        <Button level="error" onClick={() => setClose(true)}>
          <span class="shrink-0 icon-[fluent--emoji-sad-20-regular] w-5 h-5" />
          <span>{t("general.actions.back.title")}</span>
        </Button>
      </div>
    </Show>
  );
}

export default function () {
  const params = useParams();
  const gameId = () => Number.parseInt(params.game || "0", 10) || 0;

  const game = useGame({
    id: gameId,
    enabled: () => gameId() > 0,
  });
  const institutes = useInstitutes();

  const isAdmin = () => isAdminOfGame(game.data);
  const inProgress = () => isGameInProgress(game.data);
  const inRegister = () => isGameInRegister(game.data);
  const inArchiving = () => isGameInArchiving(game.data);
  const inArchived = () => isGameInArchived(game.data);

  const canParticipateInCurrentGame = () => isGameCanParticipate(game.data);

  const [searchParams, setSearchParams] = useSearchParams();
  const inEdit = () => searchParams.edit === "true";
  const period = () => {
    if (inProgress()) {
      return t("game.end");
    }
    if (inRegister()) {
      return t("game.start");
    }
    if (inArchiving()) {
      return t("game.archive");
    }
    return t("game.register");
  };

  const timeEnd = () => {
    const current = game.data;
    if (current?.register_at && current.register_at > DateTime.now()) return current.register_at;
    if (current?.start_at && current.start_at > DateTime.now()) return current.start_at;
    if (current?.end_at && current.end_at > DateTime.now()) return current.end_at;
    if (current?.archive_at && current.archive_at > DateTime.now()) return current.archive_at;
    return DateTime.now();
  };

  const [showTimer, setShowTimer] = createSignal(true);

  const updateTimer = setInterval(() => {
    setShowTimer(!inArchived());
  }, 1000);

  onCleanup(() => clearInterval(updateTimer));

  const introduction = useGameIntroduction({
    id: gameId,
    enabled: () => gameId() > 0,
  });

  let coverInput: HTMLInputElement;
  const [coverSet, setCoverSet] = createSignal(false);
  const [coverFile, setCoverFile] = createSignal(null as File | null);
  const [coverUploading, setCoverUploading] = createSignal(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = createSignal<string | null>(null);
  function handleSelectCover() {
    coverInput!.click();
  }
  function handleSelectedCover(event: Event) {
    if (
      event.target &&
      (event.target as HTMLInputElement).files &&
      (event.target as HTMLInputElement).files!.length > 0
    ) {
      const file = (event.target as HTMLInputElement).files![0];
      setCoverFile(file);
      const prev = coverPreviewUrl();
      if (prev) URL.revokeObjectURL(prev);
      setCoverPreviewUrl(URL.createObjectURL(file));
      setCoverSet(true);
    }
  }
  async function handleUploadCover() {
    if (coverFile()) {
      setCoverUploading(true);
      try {
        const resp = await uploadMedia(coverFile()!, false);
        if (game.data) {
          updateGameMutation.mutate({
            id: game.data.id,
            game: {
              ...game.data,
              cover: resp.hash,
            },
          });
        }
      } catch (err) {
        handleHttpError(err as Error, t("general.actions.upload.status.fail"));
      }
      setCoverUploading(false);
      setCoverFile(null);
      setCoverSet(false);
      const prev = coverPreviewUrl();
      if (prev) URL.revokeObjectURL(prev);
      setCoverPreviewUrl(null);
    }
  }
  const [logoSet, setLogoSet] = createSignal(false);
  const [logoFile, setLogoFile] = createSignal(null as File | null);
  const [logoUploading, setLogoUploading] = createSignal(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = createSignal<string | null>(null);
  let logoInput: HTMLInputElement;
  function handleSelectLogo() {
    logoInput!.click();
  }
  function handleSelectedLogo(event: Event) {
    if (
      event.target &&
      (event.target as HTMLInputElement).files &&
      (event.target as HTMLInputElement).files!.length > 0
    ) {
      const file = (event.target as HTMLInputElement).files![0];
      setLogoFile(file);
      const prev = logoPreviewUrl();
      if (prev) URL.revokeObjectURL(prev);
      setLogoPreviewUrl(URL.createObjectURL(file));
      setLogoSet(true);
    }
  }
  async function handleUploadLogo() {
    if (logoFile()) {
      setLogoUploading(true);
      try {
        const resp = await uploadMedia(logoFile()!, false);
        if (game.data) {
          updateGameMutation.mutate({
            id: game.data.id,
            game: {
              ...game.data,
              logo: resp.hash,
            },
          });
        }
      } catch (err) {
        handleHttpError(err as Error, t("general.actions.upload.status.fail"));
      }
      setLogoUploading(false);
      setLogoFile(null);
      setLogoSet(false);
      const prev = logoPreviewUrl();
      if (prev) URL.revokeObjectURL(prev);
      setLogoPreviewUrl(null);
    }
  }

  async function onUpdateIntroduction(result: ArticleModel) {
    updateIntroductionMutation.mutate({ id: gameId(), article: result });
  }

  const updateGameMutation = useUpdateGameMutation({
    onSuccess: () => {
      void game.refetch();
    },
  });
  const updateIntroductionMutation = useUpdateGameIntroductionMutation({
    onSuccess: () => {
      setSearchParams({ edit: null });
      void game.refetch();
      void introduction.refetch();
    },
  });

  const selfTeam = useSelfTeam({
    game_id: gameId,
    enabled: () => !!accountStore.id && gameId() > 0 && !!game.data && !isAdmin(),
    silenced: true,
  });
  const teamRank = useTeamRank({
    game_id: gameId,
    team_id: () => selfTeam.data?.id ?? 0,
    enabled: () => !!selfTeam.data,
  });

  const coverSrc = () => coverPreviewUrl() || (game.data?.cover ? mediaPath(game.data.cover) : bgGameDefault);

  return (
    <>
      <div class="flex-1 flex flex-col lg:flex-row-reverse">
        <div class="lg:w-1/3 max-h-[calc(100vh-4rem)] lg:sticky lg:top-16 lg:left-0 flex flex-col backdrop-blur-sm border-b border-b-layer-content/10 lg:border-b-0 lg:backdrop-blur-none p-3 lg:p-6 space-y-2">
          <Card contentClass="relative">
            <Picture class="aspect-video" src={coverSrc()} />

            <div class="absolute top-0 left-0 w-full h-full flex flex-col justify-end items-end z-10 p-3 lg:p-6 space-y-2">
              <Show when={isAdmin()}>
                <div class="flex flex-row space-x-2">
                  <Button
                    square
                    size="sm"
                    class="bg-layer/50 print:hidden"
                    onClick={coverSet() ? handleUploadCover : handleSelectCover}
                    loading={coverUploading()}
                    disabled={logoSet()}
                  >
                    <input type="file" class="hidden" ref={coverInput!} onChange={handleSelectedCover} />
                    <Show
                      when={coverSet()}
                      fallback={<span class="shrink-0 icon-[fluent--draw-image-20-regular] w-5 h-5" />}
                    >
                      <span class="shrink-0 icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5 text-primary" />
                    </Show>
                  </Button>
                  <Button
                    square
                    size="sm"
                    class="bg-layer/50 print:hidden"
                    onClick={logoSet() ? handleUploadLogo : handleSelectLogo}
                    loading={logoUploading()}
                    disabled={coverSet()}
                  >
                    <input type="file" class="hidden" ref={logoInput!} onChange={handleSelectedLogo} />
                    <Show when={logoSet()} fallback={<EditFlag class="w-5 h-5" />}>
                      <span class="shrink-0 icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5 text-primary" />
                    </Show>
                  </Button>
                </div>
              </Show>
              <h2 class="font-bold p-4 rounded-lg bg-layer/50 backdrop-blur-sm flex flex-row space-x-2 w-full">
                <div class="mx-4">
                  <Show
                    when={logoPreviewUrl() || game.data?.logo}
                    fallback={
                      <Show when={logoUploading()} fallback={<LogoAnimate width={64} height={64} />}>
                        <Spin width={64} height={64} />
                      </Show>
                    }
                  >
                    <img
                      src={logoPreviewUrl() || mediaPath(game.data?.logo)}
                      width={64}
                      height={64}
                      alt="Logo Broken"
                    />
                  </Show>
                </div>
                <div class="flex flex-col space-y-2">
                  <span class="text-3xl">{game.data?.name}</span>
                  <span class="opacity-80">{game.data?.brief}</span>
                </div>
              </h2>
            </div>
          </Card>
          <div class="flex flex-col space-y-2 items-center py-4 lg:py-8 print:hidden">
            <Show when={showTimer()} fallback={<span class="text-3xl font-bold text-warning">{t("game.ended")}</span>}>
              <h3 class="text-xl font-bold opacity-60">{t("game.timeLast", { period: period() })}</h3>
              <p class="text-3xl font-bold">
                <Timer end={timeEnd()} hasHours />
              </p>
            </Show>
          </div>
          <div class="flex-1 hidden lg:flex flex-col print:hidden">
            <div class="flex flex-row flex-wrap items-start justify-center">
              <Tag level="info" class="m-2">
                <Show when={game.data?.team_size && game.data.team_size > 1} fallback={<span>{t("team.solo")}</span>}>
                  <span>
                    {t("team.collab", {
                      size: game.data?.team_size || 0,
                    })}
                  </span>
                </Show>
              </Tag>
              <Show
                when={game.data?.access_policy.restrict}
                fallback={
                  <Tag level="success" class="m-2">
                    <span>{t("game.accessPolicy.open")}</span>
                  </Tag>
                }
              >
                <For each={game.data?.access_policy.institutes}>
                  {(institute) => (
                    <Tag level="success" class="m-2">
                      <span>{institutes.data?.find((v) => v.id === institute)?.name}</span>
                    </Tag>
                  )}
                </For>
              </Show>
              <Show when={game.data?.hidden}>
                <Tag level="warning" class="m-2">
                  <span>{t("game.form.hidden.label")}</span>
                </Tag>
              </Show>
              <Show when={game.data?.frozen}>
                <Tag level="warning" class="m-2">
                  <span>{t("game.form.frozen.label")}</span>
                </Tag>
              </Show>
            </div>
          </div>
          <Show when={selfTeam.data}>
            <Card contentClass="p-3 lg:px-6 flex flex-row space-x-2 lg:space-x-4 print:hidden relative">
              <div class="flex items-center justify-center">
                <span class="shrink-0 icon-[fluent--flag-20-filled] w-5 h-5 lg:w-10 lg:h-10 text-primary opacity-60" />
              </div>
              <div class="flex flex-col justify-center flex-1">
                <h3 class="font-bold px-2">
                  <span>{selfTeam.data?.name}</span>
                  <span>&nbsp;</span>
                  <span class="text-primary">#</span>
                  <span class="opacity-60">{selfTeam.data?.id.toString(16).padStart(6, "0")}</span>
                </h3>
                <p class="flex-row flex-wrap hidden lg:flex space-x-2 px-2 opacity-60">
                  <span>{stringifyState(selfTeam.data?.state || TeamState.Pending)}</span>
                  <span class="opacity-60 text-primary">-</span>
                  <span>{selfTeam.data?.institute_name || t("institute.empty")}</span>
                </p>
              </div>
              <p class="flex flex-col items-start justify-center font-bold">
                <span>
                  <span class="opacity-60">No.</span>
                  <span class="text-primary">{teamRank.data ?? "NULL"}</span>
                </span>
                <span>{selfTeam.data?.score || 0} pts</span>
                <A class="absolute top-0 left-0 w-full h-full" href={`/games/${gameId()}/teams/${selfTeam.data?.id}`} />
              </p>
            </Card>
          </Show>
          <div class="flex flex-row space-x-2 print:hidden">
            <Show when={isAdmin()}>
              <Link href={`/games/${gameId()}?edit=true`} square level="primary">
                <span class="shrink-0 icon-[fluent--edit-20-regular] w-5 h-5" />
              </Link>
            </Show>
            <Show when={isAdmin()}>
              <Link href={`/games/${gameId()}/admin`} square level="primary">
                <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
              </Link>
            </Show>
            <Switch>
              <Match when={selfTeam.data}>
                <Link
                  href={inArchived() ? `/training/${gameId()}` : `/games/${gameId()}/challenges`}
                  class="flex-1"
                  level="success"
                  disabled={
                    (game.data?.start_at && game.data.start_at > DateTime.now()) ||
                    selfTeam.data?.state === TeamState.Pending ||
                    selfTeam.data?.state === TeamState.Banned
                  }
                >
                  <span class="shrink-0 icon-[fluent--people-team-20-regular] w-5 h-5" />
                  <Switch>
                    <Match when={inArchived()}>
                      <span class="flex-1 text-start">{t("game.gotoTraining")}</span>
                    </Match>
                    <Match when={game.data?.start_at && game.data.start_at > DateTime.now()}>
                      <span class="flex-1 text-start">{t("game.notStarted")}</span>
                    </Match>
                    <Match when={selfTeam.data?.state === TeamState.Pending}>
                      <span class="flex-1 text-start">{t("team.status.pending.placeholder")}</span>
                    </Match>
                    <Match when={selfTeam.data?.state === TeamState.Banned}>
                      <span class="flex-1 text-start">{t("team.status.banned.title")}</span>
                    </Match>
                    <Match when={true}>
                      <span class="flex-1 text-start">{t("game.enterChallenge")}</span>
                    </Match>
                  </Switch>
                  <span class="shrink-0 icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                </Link>
              </Match>
              <Match when={isAdmin()}>
                <Link
                  level="success"
                  class="flex-1"
                  href={inArchived() ? `/training/${gameId()}` : `/games/${gameId()}/challenges`}
                  justify="start"
                >
                  <span class="shrink-0 icon-[fluent--code-20-filled] w-5 h-5" />
                  <span class="flex-1 text-start">{t("game.manageChallenges")}</span>
                  <span class="shrink-0 icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                </Link>
              </Match>
              <Match when={accountStore.id && !selfTeam.data}>
                <Link
                  href={`/games/${gameId()}/teams/choose`}
                  class="flex-1"
                  level="info"
                  disabled={!canParticipateInCurrentGame()}
                >
                  <span class="shrink-0 icon-[fluent--people-team-20-regular] w-5 h-5" />
                  <Show
                    when={canParticipateInCurrentGame()}
                    fallback={<span class="flex-1 text-start">{t("game.canNotParticipate")}</span>}
                  >
                    <span class="flex-1 text-start">{t("team.create.title")}</span>
                  </Show>
                  <span class="shrink-0 icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                </Link>
              </Match>
              <Match when={!accountStore.id}>
                <Link
                  href={`/account/login?redirect=${encodeURI(`/games/${gameId()}`)}`}
                  class="flex-1"
                  level="warning"
                >
                  <span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5" />
                  <span class="flex-1 text-start">{t("game.loginThenBack")}</span>
                  <span class="shrink-0 icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                </Link>
              </Match>
            </Switch>
          </div>
        </div>
        <div class="flex-1 flex flex-col space-y-2 p-3 lg:p-6">
          <h1 class="text-center text-3xl font-bold mt-4 lg:mt-8">{t("game.introduction.title")}</h1>
          <Switch>
            <Match when={inEdit()}>
              <IntroForm onDone={onUpdateIntroduction} />
            </Match>
            <Match when={introduction.data && !introduction.isLoading}>
              <Article
                class="self-center"
                content={introduction.data?.content || ""}
                extra={true}
                headingAnchors={true}
              />
            </Match>
            <Match when={introduction.isLoading}>
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <Spin width={32} height={32} />
                <span>{randomTips()}</span>
              </div>
            </Match>
            <Match when={true}>
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <span class="shrink-0 icon-[fluent--thumb-dislike-20-regular] w-24 h-24" />
                <span>{t("game.introduction.empty")}</span>
              </div>
            </Match>
          </Switch>
        </div>
      </div>
      <Show when={selfTeam.data?.state === TeamState.Banned}>
        <BannedWarning />
      </Show>
    </>
  );
}
