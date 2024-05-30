import { Match, Show, Switch, createEffect, createSignal, untrack } from 'solid-js'
import { accountStore, refreshUser, resetUser } from '@storage/account'
import Link from '@widgets/link'
import Popover from '@widgets/popover'
import Avatar from '@widgets/avatar'
import Card from '@widgets/card'
import { t } from '@storage/theme'
import Button from '@/lib/widgets/button'
import { useNavigate } from '@solidjs/router'
import { logout } from '@/lib/api/account'
import { clearToasts } from '@/lib/storage/toast'
import { gameStore } from '@/lib/storage/game'
import { HostType } from '@/lib/models/game'
import { Permission } from '@/lib/models/user'

export default function UserBox() {
  createEffect(() => {
    if (accountStore.token) {
      untrack(refreshUser)
    }
  })

  const navigate = useNavigate()
  const [loading, setLoading] = createSignal(false)
  function handleLogout() {
    setLoading(true)
    setTimeout(() => {
      logout().finally(() => {
        resetUser()
        navigate('/')
        clearToasts()
        setLoading(false)
      })
    }, 1000)
  }
  return (
    <>
      <Show
        when={accountStore.token}
        fallback={
          <Link href="/account/login" title={t('account.login.title')} ghost>
            <span class="icon-[fluent--person-20-regular] w-5 h-5" />
            {t('account.login.title')}
          </Link>
        }
      >
        <Popover
          title={t('account.box')}
          btnContent={
            <Avatar
              class="w-8 h-8"
              src={accountStore.info?.avatar || undefined}
              fallback={accountStore.info?.account || undefined}
            />
          }
          square
          ghost
          popContentClass="pt-2"
        >
          <div class="flex flex-col space-y-2 max-w-64 w-[calc(100vw-1rem)]">
            <Card contentClass="p-2 flex flex-col space-y-2">
              <Link
                ghost
                class="h-16 space-x-2 flex-shrink-0 py-1 flex-nowrap"
                justify="start"
                href={`/users/${accountStore.info?.id}`}
              >
                <Avatar
                  class="w-10 h-10"
                  src={accountStore.info?.avatar || undefined}
                  fallback={accountStore.info?.account || undefined}
                ></Avatar>
                <div class="flex flex-col justify-center items-start">
                  <h2 class="text-lg font-bold">{accountStore.info?.nickname}</h2>
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
              <Button ghost size="sm" square title={t('account.logout')} onClick={handleLogout} loading={loading()}>
                <Show when={!loading()}>
                  <span class="icon-[fluent--sign-out-20-regular] w-5 h-5 text-error" />
                </Show>
              </Button>
            </Card>
            <Show when={gameStore.current && gameStore.current.host_type === HostType.CTFGame}>
              <Card contentClass="p-2 flex flex-row space-x-2">
                <Switch>
                  <Match
                    when={
                      accountStore.permissions.includes(Permission.Host) ||
                      (accountStore.permissions.includes(Permission.Game) &&
                        gameStore.current?.admins.includes(accountStore.id!))
                    }
                  >
                    <Button size="sm" justify="start" class="flex-1" disabled>
                      <span class="icon-[fluent--flag-20-regular] w-5 h-5 text-primary" />
                      <span>{t('game.adminCanNotTakePartIn')}</span>
                    </Button>
                  </Match>
                </Switch>
              </Card>
            </Show>
          </div>
        </Popover>
      </Show>
    </>
  )
}
