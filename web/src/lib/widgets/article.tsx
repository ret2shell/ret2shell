import { ComponentProps, Show, createEffect, createSignal, splitProps, untrack } from 'solid-js'

import LoadingTips from './loading-tips'
import { addToast } from '../storage/toast'

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
    const { Markdown } = await import('@lib/markdown')
    const markdown = new Markdown()
    await markdown.init({
      type: 'html',
      options: { prism: articleProps.extra, katex: articleProps.extra, headingAnchors: articleProps.headingAnchors },
    })
    return (await markdown.render(content))!
  }
  function scrollToView() {
    setTimeout(() => {
      if (location.hash.replace('#', '').length > 0)
        document.getElementById(decodeURI(location.hash.replace('#', '')))?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }
  createEffect(() => {
    if (articleProps.content) {
      render(articleProps.content)
        .then(html =>
          untrack(() => {
            setContentHtml(html)
            setReady(true)
            scrollToView()
          })
        )
        .catch((err: Error) => {
          addToast({
            level: 'error',
            description: err.message,
            duration: 5000,
          })
        })
    }
  })
  return (
    <>
      <Show
        when={ready()}
        fallback={
          <>
            <article {...nativeProps} class={`article !max-w-5xl w-full ${nativeProps.class}`}>
              <LoadingTips />
            </article>
          </>
        }
      >
        <article
          {...nativeProps}
          class={`article !max-w-5xl w-full ${nativeProps.class}`}
          innerHTML={contentHtml()}
        ></article>
        <div class="h-64"></div>
      </Show>
    </>
  )
}
