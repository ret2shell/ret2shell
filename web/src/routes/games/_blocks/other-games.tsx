import { useGames } from "@api/game";
import Spin from "@assets/animates/spin";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { mediaPath } from "@lib/utils/media";
import { HostType } from "@models/game";
import { useSearchParams } from "@solidjs/router";
import { t } from "@storage/theme";
import Card from "@widgets/card";
import Pagination from "@widgets/pagination";
import Picture from "@widgets/picture";
import Tag from "@widgets/tag";
import { DateTime } from "luxon";
import { createMemo, createSignal, For, Show } from "solid-js";
import { setGameCoverStore } from "./cover";

export default function () {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = createMemo(() => {
    const result = searchParams["other-page"] ? Number.parseInt(searchParams["other-page"] as string, 10) : 1;
    if (Number.isNaN(result) || result < 1) {
      return 1;
    }
    return result;
  });
  const pageSize = 20;
  const [loadingGame, setLoadingGame] = createSignal(null as number | null);

  const games = useGames({
    page: () => page(),
    page_size: () => pageSize,
    host_type: () => HostType.Game,
    weight: () => 1,
    enabled: () => true,
  });
  return (
    <section id="other-games" class="lg:h-full min-h-full overflow-scroll snap-center flex flex-col items-center">
      <h2 class="text-2xl font-bold m-12">{t("game.otherGames")}</h2>
      <div class="flex-1 max-w-7xl flex flex-row flex-wrap items-start">
        <For each={games.data?.[0]}>
          {(game) => (
            <Card
              class="w-full lg:max-w-sm m-4 transform transition-all lg:rounded-b-lg overflow-hidden relative flex flex-col"
              contentClass="relative"
            >
              <Picture class="aspect-video" src={(game.cover && mediaPath(game.cover)) || bgGameDefault} />
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
                  setGameCoverStore((s) => {
                    s.preload = game;
                  });
                  setLoadingGame(game.id);
                  setTimeout(() => {
                    setGameCoverStore((s) => {
                      s.goto = game.id;
                    });
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
        count={games.data?.[1] ?? 0}
        pageSize={pageSize}
        page={page()}
        onPageChange={(p) => {
          setSearchParams({ "other-page": p.toString() });
        }}
      />
    </section>
  );
}
