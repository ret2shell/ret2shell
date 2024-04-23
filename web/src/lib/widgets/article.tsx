import { ComponentProps, Show, createEffect, createSignal, splitProps, untrack } from 'solid-js'
import './styles/article.scss'
import './styles/skeleton.scss'
import Spin from '../assets/animates/spin'
import { t } from '../storage/theme'

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
    return (await markdown.render(content)) as string
  }
  function scrollToView() {
    setTimeout(() => {
      if (location.hash.replace('#', '').length > 0)
        document.getElementById(decodeURI(location.hash.replace('#', '')))?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }
  createEffect(() => {
    render(articleProps.content).then(html =>
      untrack(() => {
        setContentHtml(html)
        setReady(true)
        scrollToView()
      })
    )
  })
  return (
    <>
      <Show
        when={ready()}
        fallback={
          <>
            <article {...nativeProps} class={`article !max-w-5xl w-full ${nativeProps.class}`}>
              <p class="inline-flex items-center space-x-2">
                <Spin width={16} height={16} />
                <span>{t('article.loading')}</span>
              </p>
            </article>
          </>
        }
      >
        <article
          {...nativeProps}
          class={`article !max-w-5xl w-full ${nativeProps.class}`}
          innerHTML={contentHtml()}
        ></article>
      </Show>
    </>
  )
}
