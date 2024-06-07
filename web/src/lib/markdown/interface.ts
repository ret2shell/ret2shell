export type MarkToType = "html" | "terminal";

export interface MarkToHtmlOptions {
    katex?: boolean;
    prism?: boolean;
    headingAnchors?: boolean;
    toc?: boolean;
}
