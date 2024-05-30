import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'

export default function () {
  return (
    <>
      <Title title={`${t('admin.captcha.title')} - ${platformStore.config.name || t('platform.name')}`} />
    </>
  )
}
