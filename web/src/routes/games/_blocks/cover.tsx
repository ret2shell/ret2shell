import LogoAnimate from "@assets/animates/logo-animate";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { mediaPath } from "@lib/utils/media";
import { useLocation, useNavigate } from "@solidjs/router";
import { gameStore } from "@storage/game";
import LoadingTips from "@widgets/loading-tips";
import clsx from "clsx";
import { type ComponentProps, Show, createEffect, createSignal, untrack } from "solid-js";

export default function (props: ComponentProps<"div">) {
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = createSignal(false);
  const _preloadImage = new Image();
  _preloadImage.src = bgGameDefault;
  createEffect(() => {
    if (gameStore.current && (location.pathname === "/games" || location.pathname === "/games/")) {
      setExpanded(true);
    }
  });
  let cachedId = 0;
  createEffect(() => {
    // when the first navigate happens, we will fetch the game details that same with preload one,
    // this effect will be triggered in second times either, we don't want that. so we cache it.
    if (gameStore.current && expanded()) {
      untrack(() => {
        if (cachedId === gameStore.current!.id) {
          return;
        }
        cachedId = gameStore.current!.id;
        setTimeout(() => {
          navigate(`/games/${gameStore.current?.id}`);
        }, 2000);
        setTimeout(() => {
          setExpanded(false);
        }, 3000);
      });
    }
  });
  createEffect(() => {
    if (!gameStore.current) {
      untrack(() => {
        cachedId = 0;
      });
    }
  });
  return (
    <div
      {...props}
      class={clsx(
        "fixed w-full top-0 left-0 overflow-hidden lg:overflow-clip transition-all ease-in-out z-50 duration-500",
        expanded() ? "h-full" : "h-0",
        props.class,
        props.classList
      )}
    >
      <div class="w-screen h-screen relative bg-layer">
        <img
          class={clsx(
            "w-screen h-screen transition-all ease-out duration-[2000ms] object-cover",
            expanded() && "scale-125 blur-md"
          )}
          alt="Cover"
          src={
            (gameStore.preload?.cover && mediaPath(gameStore.preload.cover)) ||
            (gameStore.current?.cover && mediaPath(gameStore.current.cover)) ||
            bgGameDefault
          }
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
            <Show when={gameStore.current?.logo} fallback={<LogoAnimate class="w-full h-full object-contain" />}>
              <img
                class="w-full h-full object-contain"
                src={mediaPath(gameStore.current!.logo!)}
                alt={gameStore.current?.name}
              />
            </Show>
          </div>
          <div
            class={clsx(
              "flex flex-col items-center space-y-4 transition-all ease-out duration-500 delay-1000 overflow-hidden mt-8",
              expanded() ? "h-32" : "h-0"
            )}
          >
            <h1 class="text-4xl font-bold">{gameStore.current?.name}</h1>
            <p class="text-base opacity-60">{gameStore.current?.brief}</p>
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
