import SidebarLayout from "@blocks/sidebar-layout";
import { createBreakpoints } from "@solid-primitives/media";
import { useNavigate } from "@solidjs/router";
import { gameStore, isGameAdmin } from "@storage/game";
import Button from "@widgets/button";
import { type JSX, Show, createEffect, createSignal } from "solid-js";
import { Transition } from "solid-transition-group";
import SideBar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
  const navigate = useNavigate();
  createEffect(() => {
    if (gameStore.current) {
      if (!isGameAdmin()) {
        navigate("/sigtrap/403");
        return null;
      }
    }
  });
  const breakpoints = {
    lg: "1024px",
  };
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
            {/* icon-[fluent--navigation-20-regular] icon-[fluent--dismiss-20-regular] rotate-90 rotate-0 */}
            <span
              class={`transition-transform rotate-${showSidebar() ? "90" : "0"} icon-[fluent--${
                showSidebar() ? "dismiss" : "navigation"
              }-20-regular] w-5 h-5`}
            />
          </Button>
        </Show>
      </Transition>
    </>
  );
}
