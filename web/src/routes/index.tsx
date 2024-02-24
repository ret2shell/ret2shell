import { Show } from 'solid-js'
import LogoAnimate from '../lib/assets/animates/logo-animate'
import { platformStore } from '../lib/storage/platform'
import { t } from '../lib/storage/theme'
import Popover from '../lib/widgets/popover'
import Link from '../lib/widgets/link'
import Button from '../lib/widgets/button'
import Card from '../lib/widgets/card'

export default function () {
  return (
    <>
      <div class="flex-1 relative">
        <div class="absolute h-full w-full overflow-scroll snap-mandatory snap-y">
          <section class="h-full min-h-full snap-center flex flex-col items-center justify-center relative">
            <div class="flex-1" />
            <h1 class="text-3xl font-semibold">
              &nbsp;&nbsp;
              <span>[&nbsp;{platformStore.name || t('platform.name')}&nbsp;]</span>
              &nbsp;
              <span class="text-primary animate-ping">_</span>
            </h1>
            <a class="text-xl text-error mt-8" href={platformStore.subject_url || '#'} target="_blank">
              {platformStore.subject_info || t('platform.subject')}
            </a>
            <div class="flex-1" />
            <div class="h-24" />
            <div class="absolute bottom-4 flex flex-row flex-wrap items-center justify-center h-auto p-2 space-x-2">
              <p class="inline-flex justify-center items-center flex-wrap !py-0 px-4 opacity-60 font-bold">
                (C) 2022 - {new Date().getFullYear()}&nbsp;
                <a class="hover:underline" href={platformStore.footer_url}>
                  {platformStore.footer_info}
                </a>
                <Show when={!platformStore.hide_maker}>
                  <span>&nbsp;|&nbsp;By&nbsp;</span>
                  <a class="hover:underline" href="https://github.com/ret2shell" target="_blank">
                    {t('platform.name')}
                  </a>
                </Show>
                <Show when={platformStore.record}>
                  <span>&nbsp;|&nbsp;</span>
                  <a class="hover:underline" href="https://beian.miit.gov.cn" target="_blank">
                    {platformStore.record}
                  </a>
                </Show>
              </p>
              <Button ghost>
                <span class="opacity-60">{t('calendar.scrollToView')}</span>
                <span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5 opacity-60" />
              </Button>
              <Link ghost square href="/magic">
                <span class="icon-[fluent--gift-20-regular] w-5 h-5 opacity-60" />
              </Link>
              <Popover
                padding="p-2"
                ghost
                square
                btnContent={<span class="icon-[fluent--info-20-regular] w-5 h-5 opacity-60"></span>}
              >
                <div class="w-max flex flex-col space-y-2">
                  <Card class="flex flex-row items-center space-x-4 p-4 px-8">
                    <LogoAnimate width={64} height={64} />
                    <div class="flex flex-col space-y-1">
                      <h2 class="text-2xl font-bold flex flex-row">
                        <span class="text-primary">R</span>
                        <span class="opacity-80">et</span>
                        <span class="opacity-60">&nbsp;2&nbsp;</span>
                        <span class="text-error">S</span>
                        <span class="opacity-80">hell</span>
                      </h2>
                      <p class="text-base font-bold opacity-60">
                        <Show
                          when={platformStore.version?.includes('*')}
                          fallback={<span class="text-primary">REL</span>}
                        >
                          <span class="text-warning">DEV</span>
                        </Show>
                        <span>{platformStore.version?.replace('*', '')}</span>
                      </p>
                    </div>
                  </Card>
                  <Card class="flex flex-row p-2 space-x-2">
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
        </div>
      </div>
    </>
  )
}
