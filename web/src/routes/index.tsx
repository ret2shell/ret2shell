import { Show } from 'solid-js'
import LogoAnimate from '@assets/animates/logo-animate'
import { platformStore, setPlatformStore } from '@storage/platform'
import { t } from '@storage/theme'
import Popover from '@widgets/popover'
import Link from '@widgets/link'
import Button from '@widgets/button'
import Card from '@widgets/card'
import Calendar from './calendar'
import { getVersion } from '@/lib/api/platform'
import { Title } from '@solidjs/meta'

export default function () {
  getVersion()
    .then(version => {
      setPlatformStore('version', version)
    })
    .catch(() => {})
  return (
    <>
      <Title>{platformStore.config.name || t('platform.name')}</Title>
      <div class="flex-1 relative">
        <div class="absolute h-full w-full overflow-scroll snap-mandatory snap-y">
          <section class="h-full min-h-full snap-center flex flex-col items-center justify-center relative">
            <div class="flex-1" />
            <h1 class="text-3xl font-bold opacity-80">
              &nbsp;&nbsp;
              <span>[&nbsp;{platformStore.config.name || t('platform.name')}&nbsp;]</span>
              &nbsp;
              <span class="text-primary animate-ping">_</span>
            </h1>
            <a class="text-xl text-error mt-8" href={platformStore.config.subject_url || '#'} target="_blank">
              {platformStore.config.subject_info || t('platform.subject')}
            </a>
            <div class="flex-1" />
            <div class="h-24" />
            <div class="absolute bottom-4 flex flex-row flex-wrap items-center justify-center h-auto p-2 space-x-2 opacity-60">
              <Button ghost>
                (C) 2022 - {new Date().getFullYear()}&nbsp;
                <a class="hover:underline" href={platformStore.config.footer_url || '#'} target="_blank">
                  {platformStore.config.footer_info}
                </a>
                <Show when={!platformStore.config.hide_maker}>
                  <span class="opacity-40">|</span>
                  <span>By</span>
                  <a class="hover:underline" href="https://github.com/ret2shell" target="_blank">
                    {t('platform.name')}
                  </a>
                </Show>
                <Show when={platformStore.config.record}>
                  <span>&nbsp;|&nbsp;</span>
                  <a class="hover:underline" href="https://beian.miit.gov.cn" target="_blank">
                    {platformStore.config.record}
                  </a>
                </Show>
              </Button>
              <Button
                ghost
                onClick={() => {
                  document.getElementById('index-calendar')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                <span>{t('calendar.scrollToView')}</span>
                <span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5" />
              </Button>
              <Link square href="/magic/sakana" ghost>
                <span class="icon-[fluent--gift-20-regular] w-5 h-5" />
              </Link>
              <Popover
                ghost
                padding="pb-2"
                square
                btnContent={<span class="icon-[fluent--info-20-regular] w-5 h-5"></span>}
              >
                <div class="w-max flex flex-col space-y-2">
                  <Card contentClass="flex flex-row items-center space-x-6 p-4 px-8">
                    <LogoAnimate width={64} height={64} />
                    <div class="flex flex-col space-y-1">
                      <h2 class="text-2xl font-bold flex flex-row">
                        <span class="text-primary">R</span>
                        <span class="opacity-80">et</span>
                        <span class="opacity-60">&nbsp;2&nbsp;</span>
                        <span class="text-error">S</span>
                        <span class="opacity-80">hell</span>
                      </h2>
                      <p class="text-base font-bold opacity-60 space-x-2">
                        <Show
                          when={(platformStore.version || 'UNKNOWN').includes('*')}
                          fallback={<span class="text-primary">REL</span>}
                        >
                          <span class="text-warning">DEV</span>
                        </Show>
                        <span>{(platformStore.version || 'UNKNOWN').replace('*', '')}</span>
                      </p>
                    </div>
                  </Card>
                  <Card contentClass="flex flex-row p-2 space-x-2">
                    <Link href="mailto:ret2shell@woooo.tech" ghost size="sm">
                      <span class="icon-[fluent--mail-20-regular] w-5 h-5"></span>
                      <span class="font-normal opacity-60">ret2shell@woooo.tech</span>
                    </Link>
                    <div class="flex-1"></div>
                    <Link href="https://github.com/ret2shell" ghost size="sm" square title={t('about.donate')}>
                      <span class="icon-[fluent--flash-sparkle-20-regular] w-5 h-5"></span>
                    </Link>
                    <Link href="https://github.com/ret2shell" ghost size="sm" square title={t('about.source')}>
                      <span class="icon-[fluent--open-20-regular] w-5 h-5"></span>
                    </Link>
                  </Card>
                </div>
              </Popover>
            </div>
          </section>
          <section id="index-calendar" class="h-full min-h-full snap-center relative">
            <Calendar />
          </section>
        </div>
      </div>
    </>
  )
}
