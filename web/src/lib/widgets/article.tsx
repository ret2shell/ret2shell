import type { Markdown } from "@lib/markdown";
import type { ComponentProps } from "@solidjs/web";
import { fullTheme } from "@storage/theme";
import { addToast } from "@storage/toast";
import { OverlayScrollbarsComponent } from "@widgets/overlay-scrollbars";
import clsx from "clsx";
import { createSignal, createTrackedEffect, omit, Show, untrack } from "solid-js";
import Card from "./card";
import LoadingTips from "./loading-tips";
import Popover from "./popover";

export type ArticleProps = {
  content: string;
  extra?: boolean;
  headingAnchors?: boolean;
  toc?: boolean;
  noExtraPaddings?: boolean;
  compact?: boolean;
};

export default function (props: ComponentProps<"article"> & ArticleProps) {
  const nativeProps = omit(props, "content", "extra", "headingAnchors", "toc", "noExtraPaddings", "compact");
  const [ready, setReady] = createSignal(false);
  const [rendering, setRendering] = createSignal(false);
  const [markdown, setMarkdown] = createSignal(null as Markdown | null);
  const initMarkdown = async () => {
    const { Markdown } = await import("@lib/markdown");
    if (!markdown()) {
      const markdownInst = new Markdown();
      await markdownInst.init({
        type: "html",
        options: {
          code: props.extra,
          math: props.extra,
          headingAnchors: props.headingAnchors,
          alertBlockquote: props.extra,
          toc: props.toc,
        },
      });
      setMarkdown(markdownInst);
    }
  };
  const render = async (content: string) => {
    await initMarkdown();
    await markdown()!.renderContent(content);
    // console.log(markdown.toc());
  };
  function scrollToView() {
    setTimeout(() => {
      if (location.hash.replace("#", "").length > 0)
        document.getElementById(decodeURI(location.hash.replace("#", "")))?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }
  createTrackedEffect(() => {
    if (props.content) {
      untrack(async () => {
        while (rendering()) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        setReady(false);
        setRendering(true);
        try {
          await render(props.content);
          setReady(true);
          scrollToView();
        } catch (err) {
          addToast({
            level: "error",
            description: (err as Error).message,
            duration: 5000,
          });
        }
        setRendering(false);
      });
    } else {
      untrack(() => {
        markdown()?.reset();
        setReady(true);
      });
    }
  });
  return (
    <Show
      when={ready()}
      fallback={
        <article
          {...nativeProps}
          class={clsx("article", props.compact && "article-compact", "max-w-5xl! w-full", nativeProps.class)}
        >
          <p>
            <LoadingTips />
          </p>
        </article>
      }
    >
      <article
        {...nativeProps}
        class={clsx("article", props.compact && "article-compact", "max-w-5xl! w-full", nativeProps.class)}
        innerHTML={markdown()?.html()}
      />
      <Show when={!props.noExtraPaddings}>
        <div class="h-64" />
      </Show>
      <Show when={props.toc && ready() && markdown()?.toc()}>
        <Popover
          class="fixed right-3 bottom-16 lg:bottom-3 print:hidden"
          square
          type="button"
          btnContent={<span class="shrink-0 icon-[fluent--navigation-20-regular] w-5 h-5" />}
        >
          <Card class="m-1">
            <OverlayScrollbarsComponent
              class="w-full relative max-h-[60vh]"
              options={{
                scrollbars: {
                  theme: `os-theme-${fullTheme()}`,
                  autoHide: "scroll",
                },
              }}
              defer
            >
              <div class="p-3" innerHTML={markdown()?.toc() || undefined} />
            </OverlayScrollbarsComponent>
          </Card>
        </Popover>
      </Show>
    </Show>
  );
}
