import 'sakana-widget/lib/index.css'
import SakanaWidget, { type SakanaWidgetCharacter } from 'sakana-widget'
import xdsecMascot from '@assets/imgs/xdsec-mascot.webp'
import vidarMascot from '@assets/imgs/vidar-mascot.webp'
import cnssMascot from '@assets/imgs/cnss-mascot.webp'
import LTeam from '@assets/brands/L-team'
import vidarTeam from '@assets/brands/vidar.svg'
import cnssTeam from '@assets/brands/cnss.svg'
import { t } from '@storage/theme'
import Link from '@widgets/link'
import { onMount } from 'solid-js'

export default function () {
  const xdsec = SakanaWidget.getCharacter('takina')
  const vidar = SakanaWidget.getCharacter('chisato')
  const cnss = SakanaWidget.getCharacter('takina')
  if (xdsec) xdsec.image = xdsecMascot
  if (vidar) vidar.image = vidarMascot
  if (cnss) cnss.image = cnssMascot
  SakanaWidget.registerCharacter('xdsec', xdsec!)
  SakanaWidget.registerCharacter('vidar', vidar!)
  SakanaWidget.registerCharacter('cnss', cnss!)

  onMount(() => {
    new SakanaWidget({
      character: 'xdsec',
      controls: false,
      size: 350,
      stroke: {
        color: '#80808060',
        width: 4,
      },
    })
      .setState({ i: 0.05, d: 0.99 })
      .mount('#xdsec-box')
    new SakanaWidget({
      character: 'vidar',
      controls: false,
      size: 350,
      stroke: {
        color: '#80808060',
        width: 4,
      },
    })
      .setState({ i: 0.05, d: 0.99 })
      .mount('#vidar-box')
    new SakanaWidget({
      character: 'cnss',
      controls: false,
      size: 350,
      stroke: {
        color: '#80808060',
        width: 4,
      },
    })
      .setState({ i: 0.05, d: 0.99 })
      .mount('#cnss-box')
  })
  return (
    <>
      <div class="flex-1 flex flex-row items-center justify-center">
        <div class="relative">
          <div id="xdsec-box" />
          <Link
            class="absolute left-1/2 -bottom-12 transform -translate-x-1/2 normal-case z-[10] w-24 h-24"
            href="https://l.xdsec.org"
            target="_blank"
          >
            <LTeam width={64} height={64} />
          </Link>
        </div>
        <div class="relative hidden sm:block">
          <div id="vidar-box" />
          <Link
            class="absolute left-1/2 -bottom-12 transform -translate-x-1/2 normal-case z-[10] w-24 h-24"
            href="https://vidar.club"
            target="_blank"
          >
            <img src={vidarTeam} class="w-16 h-16" width={64} height={64} />
          </Link>
        </div>
        <div class="relative hidden lg:block">
          <div id="cnss-box" />
          <Link
            class="absolute left-1/2 -bottom-12 transform -translate-x-1/2 normal-case z-[10] w-24 h-24"
            href="https://cnss.io"
            target="_blank"
          >
            <img src={cnssTeam} class="w-16 h-16" width={64} height={64} />
          </Link>
        </div>
      </div>
      <div class="h-24 self-center text-zinc-500 text-center space-x-2">
        <span>{t('magic.illustration')} By</span>
        <a class="hover:underline" href="https://twitter.com/LAttic1ng">
          Ac4ae0
        </a>
        <a class="hover:underline" href="https://twitter.com/arttnba3">
          arttnba3
        </a>
        <br />
        <span>{t('magic.source')}</span>
        <a class="hover:underline" href="https://lab.magiconch.com/sakana/">
          https://lab.magiconch.com/sakana
        </a>
      </div>
    </>
  )
}
