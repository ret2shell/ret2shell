import LogoAnimate from "@/lib/assets/animates/logo-animate";
import { gameStore } from "@/lib/storage/game";
import { mediaPath } from "@/lib/utils/media";
import LoadingTips from "@/lib/widgets/loading-tips";
import bgGameDefault from "@assets/imgs/bg-game-default.webp";
import { useLocation, useNavigate } from "@solidjs/router";
import { type ComponentProps, Show, createEffect, createSignal } from "solid-js";

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
    createEffect(() => {
        if (gameStore.current && expanded()) {
            setTimeout(() => {
                navigate(`/games/${gameStore.current?.id}`);
            }, 2000);
            setTimeout(() => {
                setExpanded(false);
            }, 3000);
        }
    });
    return (
        <div
            {...props}
            class={`fixed w-full top-0 left-0 overflow-hidden lg:overflow-clip transition-all ease-in-out z-50 duration-500 ${
                expanded() ? "h-full" : "h-0"
            } ${props.class}`}
        >
            <div class="w-screen h-screen relative">
                <img
                    class={`w-screen h-screen transition-all ease-out duration-[2000ms] ${
                        expanded() ? "scale-125 blur-md" : ""
                    }`}
                    alt="Cover"
                    src={
                        (gameStore.preload?.cover && mediaPath(gameStore.preload.cover)) ||
                        (gameStore.current?.cover && mediaPath(gameStore.current.cover)) ||
                        bgGameDefault
                    }
                />
                <div
                    class={
                        "absolute top-0 left-0 w-screen h-screen bg-layer/80 flex flex-col items-center justify-center"
                    }
                >
                    <div
                        class={`aspect-square h-48 transition-all ease-out duration-500 delay-500 ${
                            expanded() ? "" : "scale-150 blur-xl opacity-0 rotate-90"
                        }`}
                    >
                        <Show
                            when={gameStore.current?.logo}
                            fallback={<LogoAnimate class="w-full h-full object-contain" />}
                        >
                            <img
                                class="w-full h-full object-contain"
                                src={mediaPath(gameStore.current!.logo!)}
                                alt={gameStore.current?.name}
                            />
                        </Show>
                    </div>
                    <div
                        class={`flex flex-col items-center space-y-4 transition-all ease-out duration-500 delay-1000 overflow-hidden mt-8 ${
                            expanded() ? "h-32" : "h-0"
                        }`}
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
