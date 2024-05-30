import { type Processor, unified } from 'unified'
import type { MarkToHtmlOptions } from './interface'
import remarkParse from 'remark-parse'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeExternalLinks from 'rehype-external-links'
import rehypeSanitize from 'rehype-sanitize'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

type IParams = {
  type: 'html'
  options?: MarkToHtmlOptions
}

export class Markdown {
  private processor: Processor | undefined

  public constructor() {}

  public async init(params: IParams) {
    // @ts-expect-error remark has not updated
    this.processor = unified().use(remarkParse)
    switch (params.type) {
      case 'html':
        await this.initHtml(params.options)
        break
    }
  }

  public async render(markdown: string) {
    // console.log(this.processor?.attachers)
    const result = await this.processor?.process(markdown)
    return result?.toString()
  }

  private async initHtml(options?: MarkToHtmlOptions) {
    /* remark */ {
      if (options?.katex) {
        const remarkMath = await import('remark-math')
        this.processor?.use(remarkMath.default)
      }
    }
    this.processor?.use(remarkRehype)

    /* rehype */ {
      this.processor?.use(rehypeSanitize)
      this.processor?.use(rehypeExternalLinks, {
        target: '_blank',
        content: [
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['icon-[fluent--open-20-regular]', 'text-primary', 'w-4', 'h-4', 'print:hidden'] },
            children: [],
          },
        ],
        rel: ['nofollow', 'noopener', 'noreferrer'],
      })
      if (options?.katex) {
        const rehypeKatex = await import('rehype-katex')
        await import('katex/dist/katex.css')
        this.processor?.use(rehypeKatex.default)
      }
      if (options?.prism) {
        const rehypePrismPlus = await import('rehype-prism-plus/all')
        await import('./prism.scss')
        this.processor?.use(rehypePrismPlus.default, { ignoreMissing: true })
      }
      if (options?.headingAnchors) {
        this.processor?.use(rehypeSlug)
        this.processor?.use(rehypeAutolinkHeadings, { behavior: 'wrap' })
      }
      this.processor?.use(rehypeStringify)
    }
  }
}
