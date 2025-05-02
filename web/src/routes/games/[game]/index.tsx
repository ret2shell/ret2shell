import { getGameIntroduction, updateGame, updateGameIntroduction } from "@api/game";
import { uploadMedia } from "@api/media";
import LogoAnimate from "@assets/animates/logo-animate";
import Spin from "@assets/animates/spin";
import EditFlag from "@assets/icons/edit-flag";
import { randomTips } from "@lib/utils/loading-tips";
import { mediaPath } from "@lib/utils/media";
import type { Article as ArticleModel } from "@models/article";
import { TeamState, stringifyState } from "@models/team";
import { accountStore } from "@storage/account";
import {
  canParticipate,
  gameStore,
  inArchived,
  inArchiving,
  inProgress,
  inRegister,
  isGameAdmin,
  setGameStore,
} from "@storage/game";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Article from "@widgets/article";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Link from "@widgets/link";
import Picture from "@widgets/picture";
import Tag from "@widgets/tag";
import Timer from "@widgets/timer";

import { handleHttpError } from "@api";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { A, useSearchParams } from "@solidjs/router";
import { DateTime } from "luxon";
import { For, Match, Show, Switch, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import IntroForm from "./_blocks/intro-form";

function BannedWarning() {
  const [close, setClose] = createSignal(false);
  return (
    <Show when={!close()}>
      <div class="bg-error/60 backdrop-blur-sm fixed top-16 left-0 right-0 bottom-0 flex flex-col space-y-8 items-center justify-center">
        <span class="icon-[fluent--warning-20-filled] w-12 h-12" />
        <span class="font-bold text-2xl">{t("team.status.banned.title")}</span>
        <span>{t("team.status.banned.message")}</span>
        <Button level="error" onClick={() => setClose(true)}>
          <span class="icon-[fluent--emoji-sad-20-regular] w-5 h-5" />
          <span>{t("general.actions.back.title")}</span>
        </Button>
      </div>
    </Show>
  );
}

export default function () {
  const [searchParams, setSearchParams] = useSearchParams();
  const inEdit = () => searchParams.edit === "true";
  const period = () => {
    if (inProgress()) {
      return t("game.end")!;
    }
    if (inRegister()) {
      return t("game.start")!;
    }
    if (inArchiving()) {
      return t("game.archive")!;
    }
    return t("game.register")!;
  };

  const timeEnd = () => {
    if (gameStore.current?.register_at && gameStore.current.register_at > DateTime.now()) {
      return gameStore.current.register_at;
    }
    if (gameStore.current?.start_at && gameStore.current.start_at > DateTime.now()) {
      return gameStore.current.start_at;
    }
    if (gameStore.current?.end_at && gameStore.current.end_at > DateTime.now()) {
      return gameStore.current.end_at;
    }
    if (gameStore.current?.archive_at && gameStore.current.archive_at > DateTime.now()) {
      return gameStore.current.archive_at;
    }
    return DateTime.now();
  };

  const [showTimer, setShowTimer] = createSignal(true);

  const updateTimer = setInterval(() => {
    setShowTimer(!inArchived());
  }, 1000);

  onCleanup(() => clearInterval(updateTimer));

  const [introduction, setIntroduction] = createSignal(null as ArticleModel | null);
  const [loading, setLoading] = createSignal(false);

  createEffect(() => {
    setIntroduction(null);
    if (gameStore.current?.introduction_id) {
      untrack(async () => {
        if (gameStore.current?.introduction_id) {
          setLoading(true);
          try {
            const resp = await getGameIntroduction(gameStore.current.id);
            setIntroduction(resp);
          } catch (err) {
            handleHttpError(err as Error, t("game.errors.fetchIntroduction.title")!);
          }
          setLoading(false);
        }
      });
    }
  });

  let coverInput: HTMLInputElement;
  const [coverSet, setCoverSet] = createSignal(false);
  const [coverFile, setCoverFile] = createSignal(null as File | null);
  const [coverUploading, setCoverUploading] = createSignal(false);
  function handleSelectCover() {
    coverInput!.click();
  }
  function handleSelectedCover(event: Event) {
    if (
      event.target &&
      (event.target as HTMLInputElement).files &&
      (event.target as HTMLInputElement).files!.length > 0
    ) {
      if (gameStore.current)
        setGameStore({
          current: {
            ...gameStore.current,
            cover: URL.createObjectURL((event.target as HTMLInputElement).files![0]),
          },
        });
      setCoverFile((event.target as HTMLInputElement).files![0]);
      setCoverSet(true);
    }
  }
  async function handleUploadCover() {
    if (coverFile()) {
      try {
        const resp = await uploadMedia(coverFile()!, false);
        if (gameStore.current) {
          const game = await updateGame(gameStore.current.id, {
            ...gameStore.current,
            cover: resp.hash,
          });
          setGameStore({ current: game });
          addToast({
            level: "success",
            description: t("general.actions.upload.status.success")!,
            duration: 5000,
          });
        }
      } catch (err) {
        handleHttpError(err as Error, t("general.actions.upload.status.fail")!);
      }
      setCoverUploading(false);
      setCoverFile(null);
      setCoverSet(false);
    }
  }
  const [logoSet, setLogoSet] = createSignal(false);
  const [logoFile, setLogoFile] = createSignal(null as File | null);
  const [logoUploading, setLogoUploading] = createSignal(false);
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
      if (gameStore.current)
        setGameStore({
          current: {
            ...gameStore.current,
            logo: URL.createObjectURL((event.target as HTMLInputElement).files![0]),
          },
        });
      setLogoFile((event.target as HTMLInputElement).files![0]);
      setLogoSet(true);
    }
  }
  async function handleUploadLogo() {
    if (logoFile()) {
      try {
        const resp = await uploadMedia(logoFile()!, false);
        if (gameStore.current) {
          const game = await updateGame(gameStore.current.id, {
            ...gameStore.current,
            logo: resp.hash,
          });
          setGameStore({ current: game });
          addToast({
            level: "success",
            description: t("general.actions.upload.status.success")!,
            duration: 5000,
          });
        }
      } catch (err) {
        handleHttpError(err as Error, t("general.actions.upload.status.fail")!);
      }
      setLogoUploading(false);
      setLogoFile(null);
      setLogoSet(false);
    }
  }

  async function onUpdateIntroduction(result: ArticleModel) {
    try {
      const resp = await updateGameIntroduction(gameStore.current!.id, result);
      setIntroduction(resp);
      setSearchParams({ edit: null });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
  }

  return (
    <>
      <div class="flex-1 flex flex-col lg:flex-row-reverse">
        <div class="lg:w-1/3 max-h-[calc(100vh-4rem)] lg:sticky lg:top-16 lg:left-0 flex flex-col backdrop-blur-sm border-b border-b-layer-content/10 lg:border-b-0 lg:backdrop-blur-none p-3 lg:p-6 space-y-2">
          <Card contentClass="relative">
            <Picture
              class="aspect-video"
              src={(gameStore.current?.cover && mediaPath(gameStore.current.cover)) || bgGameDefault}
            />

            <div class="absolute top-0 left-0 w-full h-full flex flex-col justify-end items-end z-10 p-3 lg:p-6 space-y-2">
              <Show when={isGameAdmin()}>
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
                    <Show when={coverSet()} fallback={<span class="icon-[fluent--draw-image-20-regular] w-5 h-5" />}>
                      <span class="icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5 text-primary" />
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
                      <span class="icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5 text-primary" />
                    </Show>
                  </Button>
                </div>
              </Show>
              <h2 class="font-bold p-4 rounded-lg bg-layer/50 backdrop-blur-sm flex flex-row space-x-2 w-full">
                <div class="mx-4">
                  <Show
                    when={gameStore.current?.logo}
                    fallback={
                      <Show when={loading()} fallback={<LogoAnimate width={64} height={64} />}>
                        <Spin width={64} height={64} />
                      </Show>
                    }
                  >
                    <img src={mediaPath(gameStore.current!.logo!)} width={64} height={64} alt="Logo Broken" />
                  </Show>
                </div>
                <div class="flex flex-col space-y-2">
                  <span class="text-3xl">{gameStore.current?.name}</span>
                  <span class="opacity-80">{gameStore.current?.brief}</span>
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
                <Show
                  when={gameStore.current?.team_size && gameStore.current.team_size > 1}
                  fallback={<span>{t("team.solo")}</span>}
                >
                  <span>
                    {t("team.collab", {
                      size: gameStore.current?.team_size || 0,
                    })}
                  </span>
                </Show>
              </Tag>
              <Show
                when={gameStore.current?.access_policy.restrict}
                fallback={
                  <Tag level="success" class="m-2">
                    <span>{t("game.accessPolicy.open")}</span>
                  </Tag>
                }
              >
                <For each={gameStore.current?.access_policy.institutes}>
                  {(institute) => (
                    <Tag level="success" class="m-2">
                      <span>{accountStore.institutes.find((v) => v.id === institute)?.name}</span>
                    </Tag>
                  )}
                </For>
              </Show>
              <Show when={gameStore.current?.hidden}>
                <Tag level="warning" class="m-2">
                  <span>{t("game.form.hidden.label")}</span>
                </Tag>
              </Show>
              <Show when={gameStore.current?.frozen}>
                <Tag level="warning" class="m-2">
                  <span>{t("game.form.frozen.label")}</span>
                </Tag>
              </Show>
            </div>
          </div>
          <Show when={gameStore.team}>
            <Card contentClass="p-3 lg:px-6 flex flex-row space-x-2 lg:space-x-4 print:hidden relative">
              <div class="flex items-center justify-center">
                <span class="icon-[fluent--flag-20-filled] w-5 h-5 lg:w-10 lg:h-10 text-primary opacity-60" />
              </div>
              <div class="flex flex-col justify-center flex-1">
                <h3 class="font-bold px-2">
                  <span>{gameStore.team?.name}</span>
                  <span>&nbsp;</span>
                  <span class="text-primary">#</span>
                  <span class="opacity-60">{gameStore.team?.id.toString(16).padStart(6, "0")}</span>
                </h3>
                <p class="flex-row flex-wrap hidden lg:flex space-x-2 px-2 opacity-60">
                  <span>{stringifyState(gameStore.team?.state || TeamState.Pending)}</span>
                  <span class="opacity-60 text-primary">-</span>
                  <span>{gameStore.team?.institute_name || t("institute.empty")}</span>
                </p>
              </div>
              <p class="flex flex-col items-start justify-center font-bold">
                <span>
                  <span class="opacity-60">No.</span>
                  <span class="text-primary">{gameStore.rank || "NULL"}</span>
                </span>
                <span>{gameStore.team?.score || 0} pts</span>
                <A
                  class="absolute top-0 left-0 w-full h-full"
                  href={`/games/${gameStore.current?.id}/teams/${gameStore.team?.id}`}
                />
              </p>
            </Card>
            {/* <Clipboard value={gameStore.team?.token || ""} /> */}
          </Show>
          <div class="flex flex-row space-x-2 print:hidden">
            <Show when={isGameAdmin()}>
              <Link href={`/games/${gameStore.current?.id}?edit=true`} square level="primary">
                <span class="icon-[fluent--edit-20-regular] w-5 h-5" />
              </Link>
            </Show>
            <Show when={isGameAdmin()}>
              <Link href={`/games/${gameStore.current?.id}/admin`} square level="primary">
                <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
              </Link>
            </Show>
            <Switch>
              <Match when={gameStore.team}>
                <Link
                  href={
                    inArchived() ? `/training/${gameStore.current?.id}` : `/games/${gameStore.current?.id}/challenges`
                  }
                  class="flex-1"
                  level="success"
                  disabled={
                    (gameStore.current?.start_at && gameStore.current.start_at > DateTime.now()) ||
                    gameStore.team?.state === TeamState.Pending ||
                    gameStore.team?.state === TeamState.Banned
                  }
                >
                  <span class="icon-[fluent--people-team-20-regular] w-5 h-5" />
                  <Switch>
                    <Match when={inArchived()}>
                      <span class="flex-1 text-start">{t("game.gotoTraining")}</span>
                    </Match>
                    <Match when={gameStore.current?.start_at && gameStore.current.start_at > DateTime.now()}>
                      <span class="flex-1 text-start">{t("game.notStarted")}</span>
                    </Match>
                    <Match when={gameStore.team?.state === TeamState.Pending}>
                      <span class="flex-1 text-start">{t("team.status.pending.placeholder")}</span>
                    </Match>
                    <Match when={gameStore.team?.state === TeamState.Banned}>
                      <span class="flex-1 text-start">{t("team.status.banned.title")}</span>
                    </Match>
                    <Match when={true}>
                      <span class="flex-1 text-start">{t("game.enterChallenge")}</span>
                    </Match>
                  </Switch>
                  <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                </Link>
              </Match>
              <Match when={isGameAdmin()}>
                <Link
                  level="success"
                  class="flex-1"
                  href={
                    inArchived() ? `/training/${gameStore.current?.id}` : `/games/${gameStore.current?.id}/challenges`
                  }
                  justify="start"
                >
                  <span class="icon-[fluent--code-20-filled] w-5 h-5" />
                  <span class="flex-1 text-start">{t("game.manageChallenges")}</span>
                  <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                </Link>
              </Match>
              <Match when={accountStore.id && !gameStore.team}>
                <Link
                  href={`/games/${gameStore.current?.id}/teams/create`}
                  class="flex-1"
                  level="info"
                  disabled={!canParticipate()}
                >
                  <span class="icon-[fluent--people-team-20-regular] w-5 h-5" />
                  <Show
                    when={canParticipate()}
                    fallback={<span class="flex-1 text-start">{t("game.canNotParticipate")}</span>}
                  >
                    <span class="flex-1 text-start">{t("team.create.title")}</span>
                  </Show>
                  <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                </Link>
              </Match>
              <Match when={!accountStore.id}>
                <Link
                  href={`/account/login?redirect=${encodeURI(`/games/${gameStore.current?.id}`)}`}
                  class="flex-1"
                  level="warning"
                >
                  <span class="icon-[fluent--person-20-regular] w-5 h-5" />
                  <span class="flex-1 text-start">{t("game.loginThenBack")}</span>
                  <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                </Link>
              </Match>
            </Switch>
          </div>
        </div>
        <div class="flex-1 flex flex-col space-y-2 p-3 lg:p-6">
          <h1 class="text-center text-3xl font-bold mt-4 lg:mt-8">{t("game.introduction.title")}</h1>
          <Switch>
            <Match when={inEdit()}>
              <IntroForm onDone={onUpdateIntroduction} editSource={introduction() || undefined} />
            </Match>
            <Match when={introduction() && !loading()}>
              <Article class="self-center" content={introduction()!.content!} extra={true} headingAnchors={true} />
            </Match>
            <Match when={loading()}>
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <Spin width={32} height={32} />
                <span>{randomTips()}</span>
              </div>
            </Match>
            <Match when={true}>
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <span class="icon-[fluent--thumb-dislike-20-regular] w-24 h-24" />
                <span>{t("game.introduction.empty")}</span>
              </div>
            </Match>
          </Switch>
        </div>
      </div>
      <Show when={gameStore.team?.state === TeamState.Banned}>
        <BannedWarning />
      </Show>
    </>
  );
}
