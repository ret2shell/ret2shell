import { accountStore } from '@/lib/storage/account'
import { gameStore } from '@/lib/storage/game'
import { t } from '@/lib/storage/theme'
import Button from '@/lib/widgets/button'
import { Match, Switch } from 'solid-js'

export default function () {
  // TODO: refreshSelfTeam()
  return (
    <>
      <div class="border-b border-b-layer-content/10 p-3 lg:p-6">
        <Switch>
          <Match when={gameStore.current?.admins.includes(accountStore.id!)}>
            <Button disabled class="w-full" justify="start">
              <span class="icon-[fluent--person-settings-20-filled] w-5 h-5 text-error"></span>
              <span>{t('game.adminMode')}</span>
            </Button>
          </Match>
        </Switch>
      </div>
    </>
  )
}
