import { getBulletin } from '@/lib/api/bulletin'
import Spin from '@/lib/assets/animates/spin'
import { Article as ArticleModel } from '@/lib/models/article'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import Article from '@/lib/widgets/article'
import { HTTPError } from '@reverier/ky'
import { useNavigate, useParams } from '@solidjs/router'
import { Show, createSignal } from 'solid-js'

export default function () {
  const params = useParams()
  const article_id = parseInt(params.article_id)
  const [article, setArticle] = createSignal(null as ArticleModel | null)
  const navigate = useNavigate()
  if (isNaN(article_id)) navigate('/errors/404', { replace: true })
  getBulletin(article_id)
    .then(resp => {
      setArticle(resp)
    })
    .catch((err: HTTPError) => {
      err.response.text().then(reason => {
        addToast({ level: 'error', description: reason, duration: 5000 })
        navigate(`/errors/${err.response.status}`, { replace: true })
      })
    })
  return (
    <>
      <h1 class="text-3xl text-center flex flex-row space-x-4 items-center justify-center font-bold mt-8">
        <Show
          when={article()}
          fallback={
            <>
              <Spin width={32} height={32} />
              <span>{t('article.loading')}</span>
            </>
          }
        >
          <span>{article()!.title}</span>
        </Show>
      </h1>
      <div class="flex flex-row items-center justify-center space-x-6 opacity-60 flex-wrap py-3">
        <a
          class="hover:underline font-bold flex flex-row space-x-2 items-center"
          href={`/users/${article()?.publisher_id}`}
        >
          <span class="icon-[fluent--person-20-regular] w-5 h-5"></span>
          <span>{article()?.publisher_name}</span>
        </a>
        <div class="font-bold flex flex-row space-x-2 items-center">
          <span class="icon-[fluent--clock-20-regular] w-5 h-5"></span>
          <span>{article()?.created_at.toFormat('yyyy-MM-dd HH:mm:ss')}</span>
        </div>
      </div>
      <Article class="self-center" content={article()?.content || ''} extra={true} headingAnchors={true} />
    </>
  )
}
