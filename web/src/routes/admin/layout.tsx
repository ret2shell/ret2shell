import SidebarLayout from "@blocks/sidebar-layout";
import { Permission } from "@models/user";
import { createBreakpoints } from "@solid-primitives/media";
import { useNavigate } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import clsx from "clsx";
import { type JSX, Show, createSignal } from "solid-js";
import { Transition } from "solid-transition-group";
import SideBar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
  const navigate = useNavigate();
  if (
    !accountStore.permissions.includes(Permission.Statistics) &&
    !accountStore.permissions.includes(Permission.User) &&
    !accountStore.permissions.includes(Permission.DevOps)
  ) {
    addToast({
      level: "error",
      description: t("general.network.status.403.title")!,
      duration: 5000,
    });
    navigate("/sigtrap/403");
    return null;
  }
  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);
  return (
    <>
      <Title page={t("admin.title")} route="/admin" />
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
