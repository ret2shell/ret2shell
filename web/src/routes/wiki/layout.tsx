import { useWiki, useWikiTree } from "@api/wiki";
import SidebarLayout from "@blocks/sidebar-layout";
import { createBreakpoints } from "@solid-primitives/media";
import { useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { breakpoints } from "@storage/theme";
import Button from "@widgets/button";
import { Transition } from "@widgets/transition";
import clsx from "clsx";
import { createSignal, Show } from "solid-js";
import SideBar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
  const params = useParams();
  const articleId = () => Number.parseInt(params.article || "0", 10) || 0;

  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);

  const wikiTree = useWikiTree({ enabled: () => true });
  const currentWiki = useWiki({ id: articleId, enabled: () => articleId() > 0 });

  return (
    <>
      <SidebarLayout
        leftBar={() => <SideBar toc={wikiTree.data || []} highlightPaths={currentWiki.data?.path} />}
        showLeftBar={showSidebar()}
      >
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
