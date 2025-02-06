import SidebarLayout from "@blocks/sidebar-layout";
import { createBreakpoints } from "@solid-primitives/media";
import Button from "@widgets/button";
import { type JSX, Show, createSignal } from "solid-js";
import { Transition } from "solid-transition-group";
import Sidebar from "./_blocks/sidebar";
import { t } from "@storage/theme";
import { Title } from "@storage/header";
import clsx from "clsx";

export default function (props: { children?: JSX.Element }) {
  const breakpoints = {
    lg: "1024px",
  };
  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);
  return (
    <>
      <Title domain={`${t("docs.title")} - ${t("platform.name")}`} route="/docs" />
      <SidebarLayout leftBar={() => <Sidebar />} showLeftBar={showSidebar()}>
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
