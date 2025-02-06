import rehypeToc from "@jsdevtools/rehype-toc";
import { toHtml } from "hast-util-to-html";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
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
    this.processor?.use(remarkGfm);
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
    // schema
    const schema = Object.assign({}, defaultSchema);
    schema.attributes = Object.assign({}, schema.attributes, {
      blockquote: ["dataAlertTitle", ["className", /^markdown-alert(-.+)?$/]],
    });

    // remark
    if (options?.alertBlockquote) {
      const alertQuote = await import("./plugins/alert-quote");
      this.processor?.use(alertQuote.remarkAlertQuote, {
        classMap: {
          INFO: ["markdown-alert", "markdown-alert-blue"],
          SUCCESS: ["markdown-alert", "markdown-alert-green"],
          DEBUG: ["markdown-alert", "markdown-alert-magenta"],
          WARN: ["markdown-alert", "markdown-alert-yellow"],
          ERROR: ["markdown-alert", "markdown-alert-red"],
          DANGER: ["markdown-alert", "markdown-alert-red"],
          // github
          NOTE: ["markdown-alert", "markdown-alert-blue"],
          TIP: ["markdown-alert", "markdown-alert-green"],
          IMPORTANT: ["markdown-alert", "markdown-alert-magenta"],
          WARNING: ["markdown-alert", "markdown-alert-yellow"],
          CAUTION: ["markdown-alert", "markdown-alert-red"],
        },
      });
    }
    if (options?.math) {
      const remarkMath = await import("remark-math");
      this.processor?.use(remarkMath.default);
    }

    this.processor?.use(remarkRehype);

    // rehype (the structure may be changed)
    this.processor?.use(rehypeSanitize, schema);
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
    if (options?.math) {
      const rehypeKatex = await import("rehype-katex");
      await import("katex/dist/katex.css");
      await import("./katex.css");
      this.processor?.use(rehypeKatex.default);
    }
    if (options?.code) {
      const rehypePrettyCode = await import("rehype-pretty-code");
      const rehypePrettyCodeTransformers = await import("@rehype-pretty/transformers");
      this.processor?.use(rehypePrettyCode.default, {
        grid: true,
        theme: {
          dark: "github-dark",
          light: "github-light",
        },
        keepBackground: false,
        bypassInlineCode: false,
        transformers: [
          rehypePrettyCodeTransformers.transformerCopyButton({
            visibility: "hover",
            feedbackDuration: 3_000,
            copyIcon: "",
            successIcon: "",
          }),
        ],
      });
    }
    if (options?.headingAnchors) {
      this.processor?.use(rehypeSlug);
      this.processor?.use(rehypeAutolinkHeadings, { behavior: "wrap" });
      this.processor?.use(rehypeToc, {
        headings: ["h2", "h3"],
        customizeTOC: (toc) => {
          // @ts-expect-error toc's type is not exported
          this.setToc(toHtml(toc));
          return false;
        },
      });
    }
    this.processor?.use(rehypeStringify);
  }
}

(async () => {
  const test = new Markdown();
  await test.init({
    type: "html",
    options: {
      math: true,
      code: true,
      headingAnchors: true,
      alertBlockquote: true,
      toc: true,
    },
  });
  test.renderContent(`
$1$
> ![NOTE]
> 456
`);
})();
