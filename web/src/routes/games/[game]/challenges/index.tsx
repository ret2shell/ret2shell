import Challenge from '@/lib/blocks/challenge'
import Challenges from './_blocks/challenges'
import SidebarLayout from '@/lib/blocks/sidebar-layout'
import { gameStore } from '@/lib/storage/game'
import { Title } from '@/lib/storage/header'
import { fullTheme, t } from '@/lib/storage/theme'
import Team from './_blocks/team'
import Notifications from './_blocks/notifications'
import { useNavigate, useSearchParams } from '@solidjs/router'
import { accountStore } from '@/lib/storage/account'
import { For, Match, Switch, createMemo, createSignal } from 'solid-js'
import Welcome from './_blocks/welcome'
import Link from '@/lib/widgets/link'
import { Challenge as ChallengeModel } from '@/lib/models/challenge'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-solid'

export default function () {
  const navigate = useNavigate()
  if (accountStore.token === null) {
    navigate(`/account/login?redirect=/games/${gameStore.current?.id}`)
    return null
  }
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedChallengeId = createMemo(() => parseInt(searchParams.challenge || 'NaN') || null)
  const [challengeHistory, setChallengeHistory] = createSignal<{ id: number; name: string }[]>([])
  function appendChallengeHistory(challenge: ChallengeModel) {
    if (challengeHistory().find(c => c.id === challenge.id)) {
      return
    }
    setChallengeHistory([...challengeHistory(), { id: challenge.id, name: challenge.name }])
  }
  // TODO: fetchSelfTeam and redirect
  return (
    <>
      <Title title={`${t('game.challenge.title')} - ${gameStore.current?.name || 'CTF'}`} />
      <SidebarLayout
        leftBar={<Challenges />}
        rightBar={
          <>
            <div class="flex flex-col">
              <Team />
              <Notifications />
            </div>
          </>
        }
      >
        <div class="flex-1 flex flex-col w-0">
          <OverlayScrollbarsComponent
            class="w-full h-16 backdrop-blur border-b border-b-layer-content/10 relative"
            options={{
              scrollbars: {
                theme: `os-theme-${fullTheme()}`,
                autoHide: 'scroll',
              },
            }}
            defer
          >
            <div class="h-full flex px-2 py-0 items-center space-x-2 min-w-max w-max">
              <Link
                href={`/games/${gameStore.current?.id}/challenges`}
                onClick={() => setSearchParams({ challenge: null })}
                activeMatch="exact"
              >
                <span class="icon-[fluent--home-20-regular] w-5 h-5"></span>
                <span>{t('game.challenge.welcome')}</span>
              </Link>
              <For each={challengeHistory()}>
                {challenge => (
                  <Link
                    href={`/games/${gameStore.current?.id}/challenges?challenge=${challenge}`}
                    onClick={() => setSearchParams({ challenge: challenge.id })}
                    activeMatch="exact"
                  >
                    <span class="icon-[fluent--code-20-regular] w-5 h-5"></span>
                    <span>{challenge.name}</span>
                  </Link>
                )}
              </For>
            </div>
          </OverlayScrollbarsComponent>
          <Switch fallback={<Welcome />}>
            <Match when={selectedChallengeId() !== null}>
              <Challenge />
            </Match>
          </Switch>
        </div>
      </SidebarLayout>
    </>
  )
}
