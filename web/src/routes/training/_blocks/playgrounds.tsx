import { handleHttpError } from "@api";
import { getGames } from "@api/game";
import { type Game, HostType } from "@models/game";
import { Permission } from "@models/user";
import { accountStore } from "@storage/account";
import { fullTheme, t } from "@storage/theme";
import { useInfiniteQuery } from "@tanstack/solid-query";
import Button from "@widgets/button";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import clsx from "clsx";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

export default function Playgrounds() {
  const pageSize = 6;

  async function loadPage(page: number, hostType: HostType) {
    try {
      return await getGames(page, pageSize, hostType);
    } catch (error) {
      const message =
        hostType === HostType.Training ? "training.errors.fetchList.title" : "training.errors.fetchArchives.title";
      void handleHttpError(error, t(message));
      throw error;
    }
  }

  const playgroundsQuery = useInfiniteQuery(() => ({
    queryKey: ["game", "list", HostType.Training],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => loadPage(pageParam, HostType.Training),
    getNextPageParam: (lastPage, _pages, page) => (page < Math.ceil(lastPage[1] / pageSize) ? page + 1 : undefined),
  }));
  const playgrounds = createMemo(() => playgroundsQuery.data?.pages.flatMap((page) => page[0]) ?? []);
  const [playgroundSentinel, setPlaygroundSentinel] = createSignal<HTMLElement>();

  const gamesQuery = useInfiniteQuery(() => ({
    queryKey: ["game", "list", HostType.Game],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => loadPage(pageParam, HostType.Game),
    getNextPageParam: (lastPage, _pages, page) => (page < Math.ceil(lastPage[1] / pageSize) ? page + 1 : undefined),
  }));
  const games = createMemo(() => gamesQuery.data?.pages.flatMap((page) => page[0]) ?? []);
  const [gameSentinel, setGameSentinel] = createSignal<HTMLElement>();

  function loadMore(query: typeof playgroundsQuery | typeof gamesQuery) {
    if (query.isFetching) return;

    if (query.isError && !query.isFetchNextPageError) {
      void query.refetch();
      return;
    }

    void query.fetchNextPage({ cancelRefetch: false });
  }

  function observeSentinel(
    getSentinel: () => HTMLElement | undefined,
    query: typeof playgroundsQuery | typeof gamesQuery
  ) {
    const sentinel = getSentinel();
    if (!sentinel || !query.hasNextPage || query.isFetching || query.isError) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        observer.disconnect();
        loadMore(query);
      }
    });

    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  }

  createEffect(() => observeSentinel(playgroundSentinel, playgroundsQuery));
  createEffect(() => observeSentinel(gameSentinel, gamesQuery));

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
              <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
              <span>{t("general.actions.create.title")}</span>
            </Link>
            <Divider class="mt-3! lg:mt-6!" />
          </Show>
          <Button ghost disabled justify="start" size="sm">
            <span>{t("training.title")}</span>
          </Button>
          <For
            each={playgrounds() as Game[]}
            fallback={
              <Show when={playgroundsQuery.isSuccess && !playgroundsQuery.hasNextPage}>
                <Button ghost disabled>
                  <span class="shrink-0 icon-[fluent--text-bullet-list-dismiss-20-regular] w-5 h-5" />
                  <span>{t("training.empty")}</span>
                </Button>
              </Show>
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
                <span class="shrink-0 icon-[fluent--dumbbell-20-regular] w-5 h-5" />
                <span class="flex-1 text-start truncate">{item.name}</span>
                <Show when={item.hidden}>
                  <span class="shrink-0 icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning mx-2" />
                </Show>
                <div class="w-2 h-2 rounded-full bg-info" />
              </Link>
            )}
          </For>
          <Show when={playgroundsQuery.hasNextPage && !playgroundsQuery.isError}>
            <div ref={setPlaygroundSentinel} class="h-1" />
          </Show>
          <Show when={playgroundsQuery.isLoading || playgroundsQuery.isFetchingNextPage}>
            <div class="flex justify-center p-2">
              <Button ghost loading disabled />
            </div>
          </Show>
          <Show when={playgroundsQuery.isError}>
            <Button ghost disabled={playgroundsQuery.isFetching} onClick={() => loadMore(playgroundsQuery)}>
              {t("general.actions.refresh.title")}
            </Button>
          </Show>
          <Divider class="mt-6!" />
          <Button ghost disabled justify="start" size="sm">
            <span>{t("game.title")}</span>
          </Button>
          <For
            each={games() as Game[]}
            fallback={
              <Show when={gamesQuery.isSuccess && !gamesQuery.hasNextPage}>
                <Button ghost disabled>
                  <span class="shrink-0 icon-[fluent--text-bullet-list-dismiss-20-regular] w-5 h-5" />
                  <span>{t("training.noArchives")}</span>
                </Button>
              </Show>
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
                <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
                <span class="flex-1 text-start truncate">{item.name}</span>
                <Show when={item.hidden}>
                  <span class="shrink-0 icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning mx-2" />
                </Show>
                <div
                  class={clsx("w-2 h-2 rounded-full", item.archive_at > DateTime.now() ? "bg-error" : "bg-success")}
                />
              </Link>
            )}
          </For>
          <Show when={gamesQuery.hasNextPage && !gamesQuery.isError}>
            <div ref={setGameSentinel} class="h-1" />
          </Show>
          <Show when={gamesQuery.isLoading || gamesQuery.isFetchingNextPage}>
            <div class="flex justify-center p-2">
              <Button ghost loading disabled />
            </div>
          </Show>
          <Show when={gamesQuery.isError}>
            <Button ghost disabled={gamesQuery.isFetching} onClick={() => loadMore(gamesQuery)}>
              {t("general.actions.refresh.title")}
            </Button>
          </Show>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
