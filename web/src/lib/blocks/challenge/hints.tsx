import { Extra } from '@/lib/models/extra'
import { Hint } from '@/lib/models/hint'
import { For, Show, createSignal } from 'solid-js'
import { LoremIpsum } from 'lorem-ipsum'
import Button from '@/lib/widgets/button'
import Popover from '@/lib/widgets/popover'
import Card from '@/lib/widgets/card'
import { t } from '@/lib/storage/theme'

export default function () {
  const [hints, setHints] = createSignal([] as Hint[])
  const [extras, setExtras] = createSignal([] as Extra[])
  const lorem = new LoremIpsum({
    wordsPerSentence: {
      max: 8,
      min: 3,
    },
  })
  return (
    <>
      <div class="flex flex-col p-3 lg:p-6">
        <For each={hints()}>
          {hint => (
            <>
              <div class="px-2 min-h-12 border-b border-b-layer-content/10 flex items-center space-x-2">
                <span class="icon-[fluent--info-20-regular] w-5 h-5 text-primary flex-shrink-0"></span>
                <Show
                  when={hint.cost === 0 || extras().find(e => e.hint_id === hint.id)}
                  fallback={
                    <>
                      <span class="blur pointer-events-none select-none flex-1">{lorem.generateSentences(1)}</span>
                      <Popover
                        size="sm"
                        ghost
                        btnContent={
                          <>
                            <span class="text-warning">-{hint.cost}</span>
                            <span class="opacity-60 text-warning">pts</span>
                            <span class="icon-[fluent--lock-20-regular] w-5 h-5 text-warning"></span>
                          </>
                        }
                      >
                        <Card contentClass="p-2 flex flex-row items-center">
                          <span class="px-2">{t('game.challenge.confirmUnlockHint', { cost: hint.cost })}</span>
                          <Button size="sm" level="error">
                            {t('platform.yes')}
                          </Button>
                        </Card>
                      </Popover>
                    </>
                  }
                >
                  <span>{hint.content}</span>
                </Show>
              </div>
            </>
          )}
        </For>
      </div>
    </>
  )
}
