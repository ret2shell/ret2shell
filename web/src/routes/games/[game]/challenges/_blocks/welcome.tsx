import { fullTheme, themeStore } from "@/lib/storage/theme";
import Article from "@/lib/widgets/article";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createEffect, createSignal, untrack } from "solid-js";

export default function () {
    const [content, setContent] = createSignal(null as null | string);
    const comps = import.meta.glob("./contents/*.md");
    createEffect(() => {
        if (themeStore.locale) {
            untrack(() => {
                const match = comps[`./contents/welcome.${themeStore.locale}.md`];
                match().then((content) => {
                    setContent((content as { default: string }).default);
                });
            });
        }
    });
    return (
        <div class="flex-1 w-full relative">
            <div class="absolute top-0 left-0 w-full h-full overflow-hidden">
                <OverlayScrollbarsComponent
                    options={{
                        scrollbars: {
                            theme: `os-theme-${fullTheme()}`,
                            autoHide: "scroll",
                        },
                    }}
                    class="relative w-full h-full print:h-auto print:overflow-auto"
                    defer
                >
                    <div class="flex flex-col">
                        <Article class="self-center" content={content() || ""} extra headingAnchors />
                    </div>
                </OverlayScrollbarsComponent>
            </div>
        </div>
    );
}
