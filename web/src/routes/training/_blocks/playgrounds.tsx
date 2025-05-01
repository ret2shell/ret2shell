import { handleHttpError } from "@api";
import { getGames } from "@api/game";
import { type Game, HostType } from "@models/game";
import { Permission } from "@models/user";
import { accountStore } from "@storage/account";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import clsx from "clsx";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";

export default function Playgrounds() {
  const [playgrounds, setPlaygrounds] = createSignal([] as Game[]);
  const [loadingPlaygrounds, setLoadingPlaygrounds] = createSignal(false);
  const [playgroundPage, setPlaygroundPage] = createSignal(1);
  const pageSize = 6;
  const [playgroundTotal, setPlaygroundTotal] = createSignal(1);
  const playgroundTotalPages = createMemo(() => Math.ceil(playgroundTotal() / pageSize));
  const [games, setGames] = createSignal([] as Game[]);
  const [loadingGames, setLoadingGames] = createSignal(false);
  const [gamePage, setGamePage] = createSignal(1);
  const [gameTotal, setGameTotal] = createSignal(1);
  const gameTotalPages = createMemo(() => Math.ceil(gameTotal() / pageSize));

  async function fetchPlaygrounds() {
    setLoadingPlaygrounds(true);
    try {
      const [playgrounds, total] = await getGames(playgroundPage(), pageSize, HostType.Training);
      setPlaygrounds(playgrounds);
      setPlaygroundTotal(total);
    } catch (err) {
      handleHttpError(err as Error, t("training.errors.fetchList.title")!);
    }
    setLoadingPlaygrounds(false);
  }

  async function fetchGames() {
    setLoadingGames(true);
    try {
      const [games, total] = await getGames(gamePage(), pageSize, HostType.Game);
      setGames(games);
      setGameTotal(total);
    } catch (err) {
      handleHttpError(err as Error, t("training.errors.fetchArchives.title")!);
    }
    setLoadingGames(false);
  }
  createEffect(() => {
    if (playgroundPage()) untrack(fetchPlaygrounds);
  });
  createEffect(() => {
    if (gamePage()) untrack(fetchGames);
  });

  return (
    <div class="flex-1 overflow-hidden">
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
        <div class="flex flex-col space-y-2 p-3 lg:p-6">
          <Show when={accountStore.permissions.includes(Permission.Host)}>
            <Link level="primary" title={t("general.actions.create.title")} href={"/training?create=true"}>
              <span class="icon-[fluent--add-20-regular] w-5 h-5" />
              <span>{t("general.actions.create.title")}</span>
            </Link>
            <Divider class="!mt-3 lg:!mt-6" />
          </Show>
          <div class="flex flex-row space-x-2">
            <Button ghost disabled justify="start" class="flex-1" size="sm">
              <span>{t("training.title")}</span>
            </Button>
            <Button
              square
              ghost
              size="sm"
              disabled={playgroundPage() <= 1}
              onClick={() => setPlaygroundPage(playgroundPage() - 1)}
            >
              <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
            </Button>
            <Button ghost size="sm" class="min-w-8" loading={loadingPlaygrounds()}>
              <Show when={!loadingPlaygrounds()}>
                <span>{playgroundPage()}</span>
              </Show>
            </Button>
            <Button
              square
              ghost
              size="sm"
              disabled={playgroundPage() >= playgroundTotalPages()}
              onClick={() => setPlaygroundPage(playgroundPage() + 1)}
            >
              <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
            </Button>
          </div>
          <For
            each={playgrounds()}
            fallback={
              <Button ghost disabled>
                <span class="icon-[fluent--text-bullet-list-dismiss-20-regular] w-5 h-5" />
                <span>{t("training.empty")}</span>
              </Button>
            }
          >
            {(item) => (
              <Link
                ghost
                href={accountStore.token ? `/training/${item.id}` : `/account/login?redirect=/training/${item.id}`}
                activeMatch="partial"
                justify="start"
                title={item.name}
              >
                <span class="icon-[fluent--dumbbell-20-regular] w-5 h-5" />
                <span class="flex-1 text-start truncate">{item.name}</span>
                <Show when={item.hidden}>
                  <span class="icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning mx-2" />
                </Show>
                <div class="w-2 h-2 rounded-full bg-info" />
              </Link>
            )}
          </For>
          <Divider class="!mt-6" />
          <div class="flex flex-row space-x-2">
            <Button ghost disabled justify="start" size="sm" class="flex-1">
              <span>{t("game.title")}</span>
            </Button>
            <Button square ghost size="sm" disabled={gamePage() <= 1} onClick={() => setGamePage(gamePage() - 1)}>
              <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
            </Button>
            <Button ghost size="sm" class="min-w-8" loading={loadingGames()}>
              <Show when={!loadingGames()}>
                <span>{gamePage()}</span>
              </Show>
            </Button>
            <Button
              square
              ghost
              size="sm"
              disabled={gamePage() >= gameTotalPages()}
              onClick={() => setGamePage(gamePage() + 1)}
            >
              <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
            </Button>
          </div>
          <For
            each={games()}
            fallback={
              <Button ghost disabled>
                <span class="icon-[fluent--text-bullet-list-dismiss-20-regular] w-5 h-5" />
                <span>{t("training.noArchives")}</span>
              </Button>
            }
          >
            {(item) => (
              <Link
                ghost
                href={accountStore.token ? `/training/${item.id}` : `/account/login?redirect=/training/${item.id}`}
                activeMatch="partial"
                justify="start"
                disabled={item.archive_at > DateTime.now()}
                title={item.archive_at > DateTime.now() ? t("training.errors.gameNotArchived.title") : item.name}
              >
                <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
                <span class="flex-1 text-start truncate">{item.name}</span>
                <Show when={item.hidden}>
                  <span class="icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning mx-2" />
                </Show>
                <div
                  class={clsx("w-2 h-2 rounded-full", item.archive_at > DateTime.now() ? "bg-error" : "bg-success")}
                />
              </Link>
            )}
          </For>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
