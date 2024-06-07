import rehypeToc, { type HtmlElementNode } from "@jsdevtools/rehype-toc";
import { toHtml } from "hast-util-to-html";
import type { Nodes } from "hast-util-to-html/lib";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { type Accessor, createSignal } from "solid-js";
import { type Processor, unified } from "unified";
import type { MarkToHtmlOptions } from "./interface";

type MarkdownProps = {
    type: "html";
    options?: MarkToHtmlOptions;
};

export class Markdown {
    private processor?: Processor;
    public html: Accessor<string>;
    private setHtml: (html: string) => void;
    public toc: Accessor<string | null>;
    private setToc: (toc: string | null) => void;

    public constructor() {
        [this.html, this.setHtml] = createSignal("");
        [this.toc, this.setToc] = createSignal(null as string | null);
    }

    public async init(params: MarkdownProps) {
        // @ts-expect-error remark has not updated
        this.processor = unified().use(remarkParse);
        switch (params.type) {
            case "html":
                await this.initHtml(params.options);
                break;
        }
    }

    public async renderContent(markdown: string) {
        this.setHtml("");
        this.setToc(null);
        const result = await this.processor?.process(markdown);
        this.setHtml(result?.toString() as string);
    }

    public reset() {
        this.setHtml("");
        this.setToc(null);
    }

    private async initHtml(options?: MarkToHtmlOptions) {
        if (options?.katex) {
            const remarkMath = await import("remark-math");
            this.processor?.use(remarkMath.default);
        }
        this.processor?.use(remarkRehype);
        this.processor?.use(rehypeSanitize);
        this.processor?.use(rehypeExternalLinks, {
            target: "_blank",
            content: [
                {
                    type: "element",
                    tagName: "span",
                    properties: {
                        className: ["icon-[fluent--open-20-regular]", "text-primary", "w-4", "h-4", "print:hidden"],
                    },
                    children: [],
                },
            ],
            rel: ["nofollow", "noopener", "noreferrer"],
        });
        if (options?.katex) {
            const rehypeKatex = await import("rehype-katex");
            await import("katex/dist/katex.css");
            this.processor?.use(rehypeKatex.default);
        }
        if (options?.prism) {
            const rehypePrismPlus = await import("rehype-prism-plus/common");
            await import("./prism.scss");
            this.processor?.use(rehypePrismPlus.default, { ignoreMissing: true, showLineNumbers: true });
        }
        if (options?.headingAnchors) {
            this.processor?.use(rehypeSlug);
            this.processor?.use(rehypeAutolinkHeadings, { behavior: "wrap" });
            this.processor?.use(rehypeToc, {
                headings: ["h2", "h3"],
                customizeTOC: (toc) => {
                    this.setToc(toHtml(toc as unknown as Nodes));
                    return false;
                },
            });
        }
        this.processor?.use(rehypeStringify);
    }
}
