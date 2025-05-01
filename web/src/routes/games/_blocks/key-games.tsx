import { handleHttpError } from "@api";
import { getGames } from "@api/game";
import LogoAnimate from "@assets/animates/logo-animate";
import Spin from "@assets/animates/spin";
import blurredBgDark from "@assets/imgs/bg-blur-stars.webp";
import blurredBgLight from "@assets/imgs/bg-blur-suzume.webp";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { randomTips } from "@lib/utils/loading-tips";
import { mediaPath } from "@lib/utils/media";
import { type Game, HostType } from "@models/game";
import { Permission } from "@models/user";
import { useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { appendGames, gameStore, setGameStore } from "@storage/game";
import { t, themeStore } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import Picture from "@widgets/picture";
import Popover from "@widgets/popover";
import Tag from "@widgets/tag";
import clsx from "clsx";
import { DateTime } from "luxon";
import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";
import CreateGame from "./create";

export default function () {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = createSignal(1);
  const pageSize = 5;
  const [total, setTotal] = createSignal(0);
  const totalPages = createMemo(() => Math.ceil(total() / pageSize));
  const [loading, setLoading] = createSignal(true);
  const showCreate = () => searchParams.create === "true";
  const keyGames = createMemo(() => {
    return gameStore.games
      .filter((game) => game.weight >= 3 && game.host_type === HostType.Game)
      .sort((a, b) => b.start_at.toSeconds() - a.start_at.toSeconds())
      .slice((page() - 1) * pageSize, page() * pageSize);
  });

  const selectedGameId = createMemo(() => {
    const result = searchParams.selected ? Number.parseInt(searchParams.selected as string) : Number.NaN;
    if (Number.isNaN(result)) {
      return keyGames().at(0)?.id ?? null;
    }
    return result;
  });

  const selectedGame = createMemo(() => {
    return keyGames().find((game) => game.id === selectedGameId()) ?? keyGames().at(0);
  });
  createEffect(() => {
    setGameStore({ preload: selectedGame() || null });
  });

  async function fetchGames() {
    setLoading(true);
    try {
      const [game, total] = await getGames(page(), pageSize, HostType.Game, 3);
      appendGames(game);
      setTotal(total);
    } catch (err) {
      handleHttpError(err as Error, t("game.errors.fetchList.title")!);
    }
    setLoading(false);
  }

  createEffect(() => {
    if (page()) {
      untrack(fetchGames);
    }
  });

  function onCreated(game: Game) {
    setGameStore({ preload: game, current: game });
  }

  return (
    <section class="lg:h-full lg:min-h-full lg:overflow-scroll lg:snap-center flex flex-col lg:flex-row relative">
      <div class="w-1/4 hidden lg:flex flex-col items-end justify-start py-32 space-y-2">
        <Show when={accountStore.permissions.includes(Permission.Host)}>
          <Link
            level="primary"
            class="w-4/5"
            onClick={() => {
              setSearchParams({ selected: undefined, create: true });
            }}
            href="/games?create=true"
          >
            <span class="icon-[fluent--add-20-regular] w-5 h-5 opacity-60" />
            <span>{t("general.actions.create.title")}</span>
          </Link>
        </Show>
        <Divider class="w-4/5" />
        <Button ghost class="w-4/5" disabled={page() <= 1} onClick={() => setPage(page() - 1)}>
          <span class="icon-[fluent--chevron-double-up-20-regular] w-5 h-5 opacity-60" />
        </Button>
        <Divider class="w-4/5" />
        <For
          each={keyGames()}
          fallback={
            <Button ghost disabled class="w-4/5" justify="start">
              <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{t("game.noGameHosted")}</span>
            </Button>
          }
        >
          {(game) => (
            <Link
              ghost
              class={clsx("w-4/5", selectedGameId() === game.id && !showCreate() && "btn-active")}
              justify="start"
              href={`/games?selected=${game.id}`}
            >
              <span
                class={clsx(
                  selectedGameId() === game.id && !showCreate()
                    ? "icon-[fluent--flag-20-filled]"
                    : "icon-[fluent--flag-20-regular]",
                  "w-5 h-5",
                  selectedGameId() === game.id && !showCreate() ? "text-primary" : "opacity-60"
                )}
              />
              <span
                class={clsx(
                  "flex-1 text-start truncate",
                  selectedGameId() === game.id && !showCreate() ? "font-bold" : "font-normal opacity-60"
                )}
              >
                {game.name}
              </span>
              <Show when={game.frozen}>
                <span class="icon-[fluent--weather-snowflake-20-regular] w-5 h-5 text-primary mx-2" />
              </Show>
              <Show when={game.hidden}>
                <span class="icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning mx-2" />
              </Show>
              <div
                class={clsx(
                  "w-2 h-2 rounded-full",
                  DateTime.now() < game.start_at
                    ? "bg-info"
                    : DateTime.now() > game.end_at
                      ? "bg-warning"
                      : "bg-success"
                )}
              />
            </Link>
          )}
        </For>
        <Divider class="w-4/5" />
        <Button ghost class="w-4/5" disabled={page() >= totalPages()} onClick={() => setPage(page() + 1)}>
          <span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5 opacity-60" />
        </Button>
        <Divider class="w-4/5" />
        <div class="flex-1" />
        <Divider class="w-4/5" />
        <Button
          ghost
          class="w-4/5"
          justify="start"
          onClick={() => {
            document.getElementById("other-games")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5" />
          <span>{t("game.otherGames")}</span>
        </Button>
        <Divider class="w-4/5" />
      </div>
      <div class="w-16 hidden lg:inline-block" />
      <Card class="block lg:hidden mx-3 mt-3" contentClass="p-2 flex flex-row space-x-2">
        <Button ghost square>
          <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
        </Button>
        <Popover
          popContentClass="pt-2 flex flex-col"
          ghost
          class="flex-1"
          btnContent={<span>{selectedGame()?.name || t("game.noGameHosted")}</span>}
        >
          <Card class="w-[80vw]" contentClass="p-2 flex flex-col space-y-2">
            <For
              each={keyGames()}
              fallback={
                <Button ghost disabled justify="start">
                  <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
                  <span>{t("game.noGameHosted")}</span>
                </Button>
              }
            >
              {(game) => (
                <Link
                  ghost
                  class={clsx(selectedGameId() === game.id && "btn-active")}
                  justify="start"
                  href={`/games?selected=${game.id}`}
                >
                  <span
                    class={clsx(
                      selectedGameId() === game.id ? "icon-[fluent--flag-20-filled]" : "icon-[fluent--flag-20-regular]",
                      "w-5 h-5",
                      selectedGameId() === game.id ? "text-primary" : "opacity-60"
                    )}
                  />
                  <span
                    class={clsx(
                      "flex-1 text-start",
                      selectedGameId() === game.id ? "font-bold" : "font-normal opacity-60"
                    )}
                  >
                    {game.name}
                  </span>
                  <div
                    class={clsx(
                      "w-2 h-2 rounded-full",
                      DateTime.now() < game.start_at
                        ? "bg-info"
                        : DateTime.now() > game.end_at
                          ? "bg-warning"
                          : "bg-success"
                    )}
                  />
                </Link>
              )}
            </For>
          </Card>
        </Popover>
        <Button ghost square>
          <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
        </Button>
      </Card>
      <div class="flex-1 p-3 lg:p-12 flex flex-col items-center lg:justify-center lg:items-start">
        <Show when={!showCreate()} fallback={<CreateGame onDone={onCreated} />}>
          <>
            <Card
              class="aspect-video w-full lg:w-4/5 transform transition-all rounded-b-none lg:rounded-b-lg border-b-0 lg:border-b-[1px] overflow-hidden relative"
              contentClass="relative"
            >
              <Show
                when={selectedGameId() && selectedGame()}
                fallback={
                  <>
                    <Show
                      when={themeStore.colorScheme === "dark"}
                      fallback={<Picture src={blurredBgLight} class="w-full h-full" />}
                    >
                      <Picture src={blurredBgDark} class="w-full h-full" />
                    </Show>
                    <div class="w-full h-full absolute top-0 left-0 bg-layer/70 backdrop-blur-sm flex items-center justify-center">
                      <LogoAnimate height="h-1/3" class="grayscale" />
                    </div>
                  </>
                }
              >
                <Picture
                  class="aspect-video"
                  src={(selectedGame()?.cover && mediaPath(selectedGame()!.cover!)) || bgGameDefault}
                />
              </Show>
              <Tag
                class="absolute top-2 right-2"
                level={
                  selectedGame()
                    ? DateTime.now() < (selectedGame()?.start_at || DateTime.now())
                      ? "info"
                      : DateTime.now() > (selectedGame()?.end_at || DateTime.now())
                        ? "warning"
                        : "success"
                    : "error"
                }
              >
                <span>
                  {selectedGame()
                    ? DateTime.now() < (selectedGame()?.start_at || DateTime.now())
                      ? t("game.pending")
                      : DateTime.now() > (selectedGame()?.end_at || DateTime.now())
                        ? t("game.ended")
                        : t("game.started")
                    : "UNKNOWN"}
                </span>
              </Tag>
            </Card>
            <Card
              class="w-full lg:w-3/5 relative transform transition-all lg:-translate-y-[2rem] lg:translate-x-1/2 rounded-t-none lg:rounded-t-lg border-t-0 lg:border-t-[1px] flex"
              contentClass="flex-1 flex flex-col md:flex-row space-y-4 lg:space-y-0 lg:space-x-8 p-6 px-9 items-center"
            >
              <Show
                when={selectedGame()?.logo}
                fallback={
                  <Show when={loading()} fallback={<LogoAnimate class="hidden lg:block" width={64} height={64} />}>
                    <Spin width={64} height={64} />
                  </Show>
                }
              >
                <img
                  class="hidden lg:block"
                  src={mediaPath(selectedGame()!.logo!)}
                  width={64}
                  height={64}
                  alt={selectedGame()?.name}
                />
              </Show>
              <div class="flex flex-col space-y-2 flex-1 w-full lg:w-auto">
                <h2 class="text-xl font-bold flex flex-row space-x-4">
                  {loading() ? randomTips() : selectedGame()?.name || t("game.noGameHosted")}
                </h2>
                <p class="opacity-60">{selectedGame()?.brief || t("game.seeOtherInteresting")}</p>
              </div>
              <div class="flex flex-col space-y-2">
                <Tag level="success">
                  <span>{selectedGame()?.start_at.toFormat("yyyy-MM-dd HH:mm:ss") || "None"}</span>
                </Tag>
                <Tag level="warning">
                  <span>{selectedGame()?.end_at.toFormat("yyyy-MM-dd HH:mm:ss") || "None"}</span>
                </Tag>
              </div>
              <button
                class="absolute w-full h-full top-0 left-0 !m-0"
                onClick={() => {
                  if (selectedGame()) setGameStore({ current: selectedGame() || null });
                  return false;
                }}
                type="button"
              />
            </Card>
          </>
        </Show>
      </div>
    </section>
  );
}
