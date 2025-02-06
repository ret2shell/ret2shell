import SidebarLayout from "@blocks/sidebar-layout";
import { createBreakpoints } from "@solid-primitives/media";
import { refreshWikiToc } from "@storage/wiki";
import Button from "@widgets/button";
import { type JSX, Show, createSignal } from "solid-js";
import { Transition } from "solid-transition-group";
import SideBar from "./_blocks/sidebar";
import clsx from "clsx";

export default function (props: { children?: JSX.Element }) {
  const breakpoints = {
    lg: "1024px",
  };
  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);
  refreshWikiToc();
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
                showSidebar() ? "rotate-90" : "rotate-0",
                showSidebar() ? "icon-[fluent--dismiss-20-regular]" : "icon-[fluent--book-20-regular]",
                "w-5 h-5"
              )}
            />
          </Button>
        </Show>
      </Transition>
    </>
  );
}
