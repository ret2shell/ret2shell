import { type ComponentProps, Show, createEffect, createSignal, splitProps, untrack } from "solid-js";

import type { Markdown } from "@lib/markdown";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { fullTheme } from "../storage/theme";
import { addToast } from "../storage/toast";
import Card from "./card";
import LoadingTips from "./loading-tips";
import Popover from "./popover";

export type ArticleProps = {
    content: string;
    extra: boolean;
    headingAnchors: boolean;
    toc?: boolean;
};

export default function (props: ComponentProps<"article"> & ArticleProps) {
    const [articleProps, nativeProps] = splitProps(props, ["content", "extra", "headingAnchors", "toc"]);
    const [ready, setReady] = createSignal(false);
    const [markdown, setMarkdown] = createSignal(null as Markdown | null);
    const initMarkdown = async () => {
        const { Markdown } = await import("@lib/markdown");
        if (!markdown()) {
            const markdownInst = new Markdown();
            await markdownInst.init({
                type: "html",
                options: {
                    prism: articleProps.extra,
                    katex: articleProps.extra,
                    headingAnchors: articleProps.headingAnchors,
                    toc: articleProps.toc,
                },
            });
            setMarkdown(markdownInst);
        }
    };
    const render = async (content: string) => {
        setReady(false);
        await initMarkdown();
        await markdown()!.renderContent(content);
        // console.log(markdown.toc());
    };
    function scrollToView() {
        setTimeout(() => {
            if (location.hash.replace("#", "").length > 0)
                document
                    .getElementById(decodeURI(location.hash.replace("#", "")))
                    ?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    }
    createEffect(() => {
        if (articleProps.content) {
            setReady(false);
            render(articleProps.content)
                .then(() =>
                    untrack(() => {
                        setReady(true);
                        scrollToView();
                    })
                )
                .catch((err: Error) => {
                    addToast({
                        level: "error",
                        description: err.message,
                        duration: 5000,
                    });
                });
        } else {
            markdown()?.reset();
            setReady(true);
        }
    });
    return (
        <Show
            when={ready()}
            fallback={
                <article {...nativeProps} class={`article !max-w-5xl w-full ${nativeProps.class}`}>
                    <p>
                        <LoadingTips />
                    </p>
                </article>
            }
        >
            <article
                {...nativeProps}
                class={`article !max-w-5xl w-full ${nativeProps.class}`}
                innerHTML={markdown()?.html()}
            />
            <div class="h-64" />
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
