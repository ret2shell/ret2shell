import { Show } from 'solid-js'
import { accountStore } from '../../lib/storage/account'
import Link from '../../lib/widgets/link'
import Popover from '../../lib/widgets/popover'
import Avatar from '../../lib/widgets/avatar'
import Card from '../../lib/widgets/card'
import { t } from '../../lib/storage/theme'
import Button from '../../lib/widgets/button'

export default function UserBox() {
  return (
    <>
      <Show
        when={accountStore.token}
        fallback={
          <Link href="/account/login" ghost square>
            <span class="icon-[fluent--person-20-regular] w-5 h-5" />
          </Link>
        }
      >
        <Popover
          btnContent={
            <Avatar
              class="w-8 h-8"
              src={accountStore.info?.avatar || undefined}
              fallback={accountStore.name || undefined}
            />
          }
          square
          ghost
          padding="pt-2"
        >
          <div class="flex flex-col space-y-2 w-64">
            <Card contentClass="p-2 flex flex-col space-y-2">
              <Link ghost class="h-16 space-x-2 flex-shrink-0 py-1 flex-nowrap" justify="start" href="/account/profile">
                <Avatar
                  class="w-10 h-10"
                  src={accountStore.info?.avatar || undefined}
                  fallback={accountStore.name || undefined}
                ></Avatar>
                <div class="flex flex-col justify-center items-start">
                  <h2 class="text-lg font-bold">{accountStore.name}</h2>
                  <span class="text-start text-base font-normal opacity-60">
                    0x{accountStore.info?.id.toString(16).padStart(6, '0')}
                  </span>
                </div>
              </Link>
            </Card>
            <Card contentClass="p-2 flex flex-row space-x-2">
              <Link href="/account/settings" ghost size="sm" justify="start" class="flex-1">
                <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
                <span>{t('account.settings.title')}</span>
              </Link>
              <Link href="/account/logout" ghost size="sm" square title={t('account.logout')}>
                <span class="icon-[fluent--sign-out-20-regular] w-5 h-5 text-error" />
              </Link>
            </Card>
          </div>
        </Popover>
      </Show>
    </>
  )
}
