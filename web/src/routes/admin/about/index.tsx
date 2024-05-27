import { PlatformLicense, getPlatformLicense } from '@/lib/api/platform'
import LogoAnimate from '@/lib/assets/animates/logo-animate'
import Spin from '@/lib/assets/animates/spin'
import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import Card from '@/lib/widgets/card'
import Divider from '@/lib/widgets/divider'
import { HTTPError } from '@reverier/ky'
import { Match, Switch, createSignal } from 'solid-js'

export default function () {
  const [license, setLicense] = createSignal(null as PlatformLicense | null)
  getPlatformLicense()
    .then(setLicense)
    .catch((err: HTTPError) => {
      err.response.text().then(text => {
        addToast({
          level: 'error',
          description: `${t('admin.about.failedToFetchLicense')}: ${text}`,
          duration: 5000,
        })
      })
    })
  return (
    <>
      <Title title={`${t('admin.about.title')} - ${platformStore.config.name || t('platform.name')}`}></Title>
      <div class="flex-1 flex-col p-3 lg:p-6">
        <div class="flex items-center space-x-4 px-6 lg:space-x-12 py-6">
          <LogoAnimate class="w-24 h-24 lg:w-32 lg:h-32" />
          <div class="flex flex-col items-start space-y-2 flex-1">
            <h1 class="text-3xl lg:text-5xl font-bold">{t('platform.name')}</h1>
            <p class="opacity-60">Version {platformStore.version}</p>
          </div>
          <Card contentClass="p-3 lg:p-6 flex flex-row items-center space-x-2">
            <Switch>
              <Match when={license()?.level === 'free'}>
                <span class="icon-[fluent--key-multiple-20-regular] w-8 h-8 lg:w-12 lg:h-12 text-primary"></span>
              </Match>
              <Match when={license()?.level === 'pro'}>
                <span class="icon-[fluent--key-multiple-20-regular] w-8 h-8 lg:w-12 lg:h-12 text-success"></span>
              </Match>
              <Match when={license()?.level === 'enterprise'}>
                <span class="icon-[fluent--key-multiple-20-regular] w-8 h-8 lg:w-12 lg:h-12 text-warning"></span>
              </Match>
              <Match when={true}>
                <Spin width={24} height={24}></Spin>
              </Match>
            </Switch>
            <div class="lg:flex flex-col items-start hidden">
              <h2 class="font-bold">
                {license()?.issuer} ({license()?.website})
              </h2>
              <p class="opacity-60">Expires at {license()?.date}</p>
            </div>
          </Card>
        </div>
        <Divider />
      </div>
    </>
  )
}
