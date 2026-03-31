import { useGame } from "@api/game";
import SidebarLayout from "@blocks/sidebar-layout";
import GameSyncReadonlyBanner from "@lib/blocks/game/sync-readonly-banner";
import { createBreakpoints } from "@solid-primitives/media";
import { useNavigate, useParams } from "@solidjs/router";
import { isAdminOfGame } from "@storage/game";
import { breakpoints } from "@storage/theme";
import Button from "@widgets/button";
import clsx from "clsx";
import { createEffect, createMemo, createSignal, type JSX, Show } from "solid-js";
import { Transition } from "solid-transition-group";
import SideBar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
  const navigate = useNavigate();
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });

  createEffect(() => {
    if (game.data && !isAdminOfGame(game.data)) navigate("/sigtrap/403");
  });
  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);
  return (
    <>
      <SidebarLayout leftBar={() => <SideBar />} showLeftBar={showSidebar()}>
        <div class="flex-1 flex flex-col">
          <GameSyncReadonlyBanner gameId={gameId()} compact />
          {props.children}
        </div>
      </SidebarLayout>
      <Transition name="slide-fade-right">
        <Show when={!matches.lg}>
          <Button
            class="fixed bottom-3 right-3 z-30"
            square
            onClick={() => setShowSidebar(!showSidebar())}
            type="button"
          >
            <span
              class={clsx(
                "transition-transform",
                showSidebar() && "rotate-90",
                showSidebar() ? "icon-[fluent--dismiss-20-regular]" : "icon-[fluent--navigation-20-regular]",
                "w-5 h-5"
              )}
            />
          </Button>
        </Show>
      </Transition>
    </>
  );
}
