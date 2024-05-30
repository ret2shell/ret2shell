import { Article } from '@/lib/models/article'
import CreateForm from '../_blocks/form'
import { useNavigate } from '@solidjs/router'
import { refreshWikiToc } from '@/lib/storage/wiki'
import { Title } from '@/lib/storage/header'
import { t } from '@/lib/storage/theme'
import { platformStore } from '@/lib/storage/platform'

export default function () {
  const navigate = useNavigate()
  function onDone(article: Article) {
    void refreshWikiToc().then(() => {
      navigate(`/wiki/${article.id}`)
    })
  }
  return (
    <>
      <Title title={`${t('form.create')} - ${platformStore.config.name || t('platform.name')}`}></Title>
      <div class="flex-1 flex flex-col">
        <CreateForm onDone={onDone} />
      </div>
    </>
  )
}
