import LogoAnimate from "@assets/animates/logo-animate";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { mediaPath } from "@lib/utils/media";
import { accountStore } from "@storage/account";
import { gameStore, setGameStore } from "@storage/game";
import { t } from "@storage/theme";
import Divider from "@widgets/divider";
import clsx from "clsx";
import { type ComponentProps, Show, createEffect, untrack } from "solid-js";

export default function TeamCover(props: ComponentProps<"div">) {
  const expanded = () => !!gameStore.showTeamCover;
  createEffect(() => {
    if (expanded()) {
      untrack(() => {
        setTimeout(() => {
          setGameStore({ showTeamCover: false });
        }, 3000);
      });
    }
  });
  return (
    <div
      {...props}
      class={clsx(
        "fixed w-full top-0 left-0 overflow-hidden lg:overflow-clip transition-all ease-in-out z-50 duration-500",
        expanded() ? "h-full" : "h-0",
        props.class
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
            "absolute top-0 left-0 w-screen h-screen flex flex-row transition-all duration-1000",
            expanded() ? "bg-layer/80" : "bg-layer/20"
          )}
        >
          <div class="flex-1 flex flex-col justify-end p-24 space-y-6">
            <h2
              class={clsx(
                "font-bold text-6xl inline-flex items-center space-x-4 overflow-hidden text-nowrap transition-all duration-[2000ms] ease-out",
                expanded() ? "opacity-100" : "opacity-0 translate-x-[10rem]"
              )}
            >
              <span class="icon-[fluent--flag-20-regular] w-16 h-16 text-error" />
              <span class="flex-1 text-start truncate">{gameStore.team?.name}</span>
              <span class="text-warning">{t("team.coming")}</span>
            </h2>
            <Divider class="w-full" />
            <h2
              class={clsx(
                "font-bold text-7xl text-end overflow-hidden text-nowrap transition-all duration-[2000ms] ease-out",
                expanded() ? "opacity-100" : "opacity-0 -translate-x-[10rem]"
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
              <Show when={gameStore.current?.logo} fallback={<LogoAnimate width={64} height={64} />}>
                <img src={mediaPath(gameStore.current!.logo!)} width={64} height={64} alt="Logo Broken" />
              </Show>
              <Divider direction="vertical" class="h-12 w-1" />
              <h2 class="font-bold text-3xl">{gameStore.current?.name}</h2>
            </div>
            <p
              class={clsx(
                "text-center transition-all duration-1000 ease-in-out",
                expanded() ? "opacity-60" : "opacity-0 translate-y-8"
              )}
            >
              {gameStore.current?.brief}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
