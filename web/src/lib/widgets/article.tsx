import { ComponentProps, Show, createEffect, createSignal, splitProps } from 'solid-js'
import './styles/article.scss'
import './styles/skeleton.scss'

export type ArticleProps = {
  content: string
  extra: boolean
  headingAnchors: boolean
}

export default function (props: ComponentProps<'article'> & ArticleProps) {
  const [articleProps, nativeProps] = splitProps(props, ['content', 'extra', 'headingAnchors'])
  const [ready, setReady] = createSignal(false)
  const [contentHtml, setContentHtml] = createSignal('')
  const render = async (content: string) => {
    setReady(false)
    let { Markdown } = await import('@lib/markdown')
    let dompurify = await import('isomorphic-dompurify')
    const markdown = new Markdown()
    await markdown.init({
      type: 'html',
      options: { prism: articleProps.extra, katex: articleProps.extra, headingAnchors: articleProps.headingAnchors },
    })
    return dompurify.sanitize((await markdown.render(content)) as string)
  }
  function scrollToView() {
    setTimeout(() => {
      if (location.hash.replace('#', '').length > 0)
        document.getElementById(decodeURI(location.hash.replace('#', '')))?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }
  createEffect(() => {
    render(articleProps.content).then(html => {
      setContentHtml(html)
      setReady(true)
      scrollToView()
    })
  })
  return (
    <>
      <Show
        when={ready()}
        fallback={
          <>
            <div class="flex flex-col space-y-2 py-6">
              <span class="skeleton w-full h-4"></span>
              <span class="skeleton w-full h-4"></span>
              <span class="skeleton w-full h-4"></span>
              <span class="skeleton w-1/2 h-4"></span>
              <span class="skeleton w-full h-4 !mt-4"></span>
              <span class="skeleton w-full h-4"></span>
              <span class="skeleton w-full h-4"></span>
              <span class="skeleton w-2/3 h-4"></span>
            </div>
          </>
        }
      >
        <article
          {...nativeProps}
          class={`article max-w-5xl w-full ${nativeProps.class}`}
          innerHTML={contentHtml()}
        ></article>
      </Show>
    </>
  )
}
