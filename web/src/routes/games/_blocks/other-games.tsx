import { handleHttpError } from "@api";
import { getGames } from "@api/game";
import Spin from "@assets/animates/spin";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { mediaPath } from "@lib/utils/media";
import { HostType } from "@models/game";
import { appendGames, gameStore, setGameStore } from "@storage/game";
import { t } from "@storage/theme";
import Card from "@widgets/card";
import Pagination from "@widgets/pagination";
import Picture from "@widgets/picture";
import Tag from "@widgets/tag";
import { DateTime } from "luxon";
import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";

export default function () {
  const [page, setPage] = createSignal(1);
  const pageSize = 20;
  const [total, setTotal] = createSignal(0);
  const [_loading, setLoading] = createSignal(true);
  const [loadingGame, setLoadingGame] = createSignal(null as number | null);

  const otherGames = createMemo(() => {
    return gameStore.games
      .filter((game) => game.weight < 3 && game.host_type === HostType.Game)
      .sort((a, b) => b.start_at.toSeconds() - a.start_at.toSeconds())
      .slice((page() - 1) * pageSize, page() * pageSize);
  });

  async function fetchGames() {
    /// fetch games from server
    setLoading(true);
    try {
      const [games, total] = await getGames(page(), pageSize, HostType.Game, 1);
      appendGames(games);
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
  return (
    <section id="other-games" class="lg:h-full min-h-full overflow-scroll snap-center flex flex-col items-center">
      <h2 class="text-2xl font-bold m-12">{t("game.otherGames")}</h2>
      <div class="flex-1 max-w-7xl flex flex-row flex-wrap items-start">
        <For each={otherGames()}>
          {(game) => (
            <Card
              class="w-full lg:max-w-sm m-4 transform transition-all lg:rounded-b-lg overflow-hidden relative flex flex-col"
              contentClass="relative"
            >
              <Picture class="aspect-video" src={(game.cover && mediaPath(game.cover!)) || bgGameDefault} />
              <Tag
                class="absolute top-2 right-2"
                level={
                  game
                    ? DateTime.now() < (game?.start_at || DateTime.now())
                      ? "info"
                      : DateTime.now() > (game?.end_at || DateTime.now())
                        ? "warning"
                        : "success"
                    : "error"
                }
              >
                <span>
                  {game
                    ? DateTime.now() < (game?.start_at || DateTime.now())
                      ? t("game.pending")
                      : DateTime.now() > (game?.end_at || DateTime.now())
                        ? t("game.ended")
                        : t("game.started")
                    : "UNKNOWN"}
                </span>
              </Tag>
              <button
                type="button"
                class="flex flex-col p-3 lg:p-6 w-full flex-1"
                onClick={() => {
                  setGameStore({ preload: game });
                  setLoadingGame(game.id);
                  setTimeout(() => {
                    setGameStore({ current: game });
                    setLoadingGame(null);
                  }, 300);
                }}
              >
                <h2 class="text-start align-middle font-bold text-xl">{game.name}</h2>
                <p class="opacity-60 flex text-wrap space-x-2">
                  <Show when={loadingGame() === game.id}>
                    <Spin width={16} height={16} />
                  </Show>
                  <span>{game.brief}</span>
                </p>
              </button>
            </Card>
          )}
        </For>
      </div>
      <Pagination
        class="p-6 lg:p-9"
        count={total()}
        pageSize={pageSize}
        page={page()}
        onPageChange={(p) => setPage(p.page)}
      />
    </section>
  );
}
