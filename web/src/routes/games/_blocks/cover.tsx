import LogoAnimate from "@assets/animates/logo-animate";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { mediaPath } from "@lib/utils/media";
import type { Game } from "@models/game";
import { useNavigate } from "@solidjs/router";
import type { ComponentProps } from "@solidjs/web";
import LoadingTips from "@widgets/loading-tips";
import clsx from "clsx";
import { createRoot, createSignal, createStore, createTrackedEffect, Show, untrack } from "solid-js";

const gameCoverRoot = createRoot(() =>
  createStore<{
    preload: Game | null;
    goto: number | null;
    visited: number[];
  }>({
    preload: null,
    goto: null,
    visited: [],
  })
);

export const gameCoverStore = gameCoverRoot[0];
export const setGameCoverStore = gameCoverRoot[1];

export default function (props: ComponentProps<"div">) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = createSignal(false);
  const _preloadImage = new Image();
  _preloadImage.src = bgGameDefault;
  createTrackedEffect(() => {
    if (gameCoverStore.goto) {
      untrack(() => {
        if (gameCoverStore.visited.find((v) => v === gameCoverStore.preload?.id)) {
          navigate(`/games/${gameCoverStore.preload?.id}`);
          return;
        }
        setExpanded(true);
        // gameCoverStore.visited.push(gameCoverStore.preload!.id);
        setGameCoverStore((s) => {
          s.visited = [...s.visited, gameCoverStore.preload!.id];
        });
      });
    }
  });
  createTrackedEffect(() => {
    // when the first navigate happens, we will fetch the game details that same with preload one,
    // this effect will be triggered in second times either, we don't want that. so we cache it.
    if (gameCoverStore.goto && expanded()) {
      untrack(() => {
        setTimeout(() => {
          navigate(`/games/${gameCoverStore.goto}`);
        }, 2000);
        setTimeout(() => {
          setExpanded(false);
        }, 3000);
        setTimeout(() => {
          setGameCoverStore((s) => {
            s.goto = null;
            s.preload = null;
          });
        }, 4000);
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
          src={(gameCoverStore.preload?.cover && mediaPath(gameCoverStore.preload.cover)) || bgGameDefault}
        />
        <div
          class={clsx(
            "absolute top-0 left-0 w-screen h-screen flex flex-col items-center justify-center transition-all duration-1000",
            expanded() ? "bg-layer/80" : "bg-layer/20"
          )}
        >
          <div
            class={clsx(
              "aspect-square h-48 transition-all ease-out duration-500 delay-500",
              expanded() ? "" : "scale-150 blur-xl opacity-0 rotate-90"
            )}
          >
            <Show when={gameCoverStore.preload?.logo} fallback={<LogoAnimate class="w-full h-full object-contain" />}>
              <img
                class="w-full h-full object-contain"
                src={mediaPath(gameCoverStore.preload?.logo)}
                alt={gameCoverStore.preload?.name}
              />
            </Show>
          </div>
          <div
            class={clsx(
              "flex flex-col items-center space-y-4 transition-all ease-out duration-500 delay-1000 overflow-hidden mt-8 text-center",
              expanded() ? "h-32" : "h-0"
            )}
          >
            <h1 class="text-4xl font-bold">{gameCoverStore.preload?.name}</h1>
            <p class="text-base opacity-60">{gameCoverStore.preload?.brief}</p>
          </div>
        </div>
        <Show when={expanded()}>
          <div class="absolute left-6 bottom-4">
            <LoadingTips />
          </div>
        </Show>
      </div>
    </div>
  );
}
