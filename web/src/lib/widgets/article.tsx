import { type ComponentProps, Show, createEffect, createSignal, splitProps, untrack } from "solid-js";

import type { Markdown } from "@lib/markdown";
import { fullTheme } from "@storage/theme";
import { addToast } from "@storage/toast";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import Card from "./card";
import LoadingTips from "./loading-tips";
import Popover from "./popover";
import clsx from "clsx";

export type ArticleProps = {
  content: string;
  extra?: boolean;
  headingAnchors?: boolean;
  toc?: boolean;
  noExtraPaddings?: boolean;
  compact?: boolean;
};

export default function (props: ComponentProps<"article"> & ArticleProps) {
  const [articleProps, nativeProps] = splitProps(props, [
    "content",
    "extra",
    "headingAnchors",
    "toc",
    "noExtraPaddings",
    "compact",
  ]);
  const [ready, setReady] = createSignal(false);
  const [markdown, setMarkdown] = createSignal(null as Markdown | null);
  const initMarkdown = async () => {
    const { Markdown } = await import("@lib/markdown");
    if (!markdown()) {
      const markdownInst = new Markdown();
      await markdownInst.init({
        type: "html",
        options: {
          code: articleProps.extra,
          math: articleProps.extra,
          headingAnchors: articleProps.headingAnchors,
          alertBlockquote: articleProps.extra,
          toc: articleProps.toc,
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
  createEffect(() => {
    if (articleProps.content) {
      setReady(false);
      untrack(async () => {
        try {
          await render(articleProps.content);
          setReady(true);
          scrollToView();
        } catch (err) {
          addToast({
            level: "error",
            description: (err as Error).message,
            duration: 5000,
          });
        }
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
          class={clsx(
            "article",
            articleProps.compact && "article-compact",
            "!max-w-5xl w-full",
            nativeProps.class,
            nativeProps.classList
          )}
        >
          <p>
            <LoadingTips />
          </p>
        </article>
      }
    >
      <article
        {...nativeProps}
        class={clsx(
          "article",
          articleProps.compact && "article-compact",
          "!max-w-5xl w-full",
          nativeProps.class,
          nativeProps.classList
        )}
        innerHTML={markdown()?.html()}
      />
      <Show when={!articleProps.noExtraPaddings}>
        <div class="h-64" />
      </Show>
      <Show when={articleProps.toc && ready() && markdown()?.toc()}>
        <Popover
          class="fixed right-3 bottom-16 lg:bottom-3 print:hidden"
          square
          type="button"
          btnContent={<span class="icon-[fluent--navigation-20-regular] w-5 h-5" />}
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
