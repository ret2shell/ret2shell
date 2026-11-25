import { useGame } from "@api/game";
import SidebarLayout from "@blocks/sidebar-layout";
import { createBreakpoints } from "@solid-primitives/media";
import { useNavigate, useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { isAdminOfGame } from "@storage/game";
import { breakpoints } from "@storage/theme";
import Button from "@widgets/button";
import { Transition } from "@widgets/transition";
import clsx from "clsx";
import { createMemo, createSignal, createTrackedEffect, Show } from "solid-js";
import SideBar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
  const navigate = useNavigate();
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });

  createTrackedEffect(() => {
    if (game.data && !isAdminOfGame(game.data)) navigate("/sigtrap/403");
  });
  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);
  return (
    <>
      <SidebarLayout leftBar={() => <SideBar />} showLeftBar={showSidebar()}>
        {props.children}
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
