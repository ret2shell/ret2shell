import { Title } from '@/lib/storage/header'
import Error from './error'
import { t } from '@/lib/storage/theme'
import { platformStore } from '@/lib/storage/platform'

export default function () {
  return (
    <>
      <Title title={`${t('errors.502')} - ${platformStore.config.name || t('platform.name')}`} />
      <Error status={502} />
    </>
  )
}
