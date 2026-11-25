import { useGame } from "@api/game";
import { useSelfTeam } from "@api/team";
import LogoAnimate from "@assets/animates/logo-animate";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { mediaPath } from "@lib/utils/media";
import { gameCoverStore } from "@routes/games/_blocks/cover";
import { useParams } from "@solidjs/router";
import type { ComponentProps } from "@solidjs/web";
import { accountStore } from "@storage/account";
import { t } from "@storage/theme";
import Divider from "@widgets/divider";
import clsx from "clsx";
import { createRoot, createStore, createTrackedEffect, Show, untrack } from "solid-js";

const teamCoverRoot = createRoot(() =>
  createStore<{
    showTeamCover: boolean;
  }>({
    showTeamCover: false,
  })
);

export const teamCoverStore = teamCoverRoot[0];
export const setTeamCoverStore = teamCoverRoot[1];

export default function TeamCover(props: ComponentProps<"div">) {
  const gameId = () => Number.parseInt(useParams().game || "UNKN0WN", 10);
  const game = useGame({ id: () => gameId() });
  const team = useSelfTeam({ game_id: () => gameId(), silenced: true });
  const expanded = () => !!teamCoverStore.showTeamCover;
  createTrackedEffect(() => {
    if (expanded()) {
      untrack(() => {
        setTimeout(() => {
          setTeamCoverStore((s) => {
            s.showTeamCover = false;
          });
        }, 3000);
      });
    }
  });
  return (
    <div
      {...props}
      class={clsx(
        "fixed w-full top-0 left-0 overflow-hidden lg:overflow-clip transition-all ease-in-out z-40 duration-500",
        expanded() ? "h-full" : "h-0",
        props.class
      )}
    >
      <div class="w-screen h-screen relative bg-layer">
        <img
          class={clsx(
            "w-screen h-screen transition-all ease-out duration-2000 object-cover",
            expanded() && "scale-125 blur-md"
          )}
          alt="Cover"
          src={
            (gameCoverStore.preload?.cover && mediaPath(gameCoverStore.preload.cover)) ||
            (game.data?.cover && mediaPath(game.data.cover)) ||
            bgGameDefault
          }
        />
        <div
          class={clsx(
            "absolute top-0 left-0 w-screen h-screen flex flex-row transition-all duration-1000",
            expanded() ? "bg-layer/80" : "bg-layer/20"
          )}
        >
          <div class="flex-1 flex flex-col justify-end p-24 space-y-6">
            <h2
              class={clsx(
                "font-bold text-6xl inline-flex items-center space-x-4 overflow-hidden text-nowrap transition-all duration-2000 ease-out",
                expanded() ? "opacity-100" : "opacity-0 translate-x-40"
              )}
            >
              <span class="shrink-0 icon-[fluent--flag-20-regular] w-16 h-16 text-error" />
              <span class="flex-1 text-start truncate">{team.data?.name}</span>
              <span class="text-warning">{t("team.coming")}</span>
            </h2>
            <Divider class="w-full" />
            <h2
              class={clsx(
                "font-bold text-7xl text-end overflow-hidden text-nowrap transition-all duration-2000 ease-out",
                expanded() ? "opacity-100" : "opacity-0 -translate-x-40"
              )}
            >
              {accountStore.nickname}
            </h2>
          </div>
          <div class="flex-1 flex flex-col items-end justify-start space-y-4 p-24">
            <div
              class={clsx(
                "flex flex-row space-x-4 flex-nowrap text-nowrap items-center justify-end transition-all duration-1000 ease-in-out w-full",
                expanded() ? "opacity-100" : "opacity-0 translate-x-8"
              )}
            >
              <Show when={game.data?.logo} fallback={<LogoAnimate width={64} height={64} />}>
                <img src={mediaPath(game.data?.logo)} width={64} height={64} alt="Logo Broken" />
              </Show>
              <Divider direction="vertical" class="h-12 w-1" />
              <h2 class="font-bold text-3xl">{game.data?.name}</h2>
            </div>
            <p
              class={clsx(
                "text-center transition-all duration-1000 ease-in-out",
                expanded() ? "opacity-60" : "opacity-0 translate-y-8"
              )}
            >
              {game.data?.brief}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
