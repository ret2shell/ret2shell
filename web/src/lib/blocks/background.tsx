import BackgroundLeft from '@assets/background-left.svg'
import BackgroundRight from '@assets/background-right.svg'
import BgBlurNight from '@assets/imgs/bg-blur-stars.webp'
import BgBlurDay from '@assets/imgs/bg-blur-suzume.webp'
import { themeStore } from '@storage/theme'

export default function () {
  return (
    <>
      <div class="fixed -left-1 -right-1 -top-1 -bottom-1">
        <div class="w-full h-full relative">
          <img
            src={BgBlurNight}
            alt=""
            class={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-700 ${themeStore.colorScheme === 'dark' ? 'opacity-100' : 'opacity-0'}`}
            onContextMenu={() => {
              return false
            }}
          />
          <img
            src={BgBlurDay}
            alt=""
            class={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-700 ${themeStore.colorScheme === 'light' ? 'opacity-100' : 'opacity-0'}`}
            onContextMenu={() => {
              return false
            }}
          />
        </div>
        <div class="fixed left-0 right-0 top-0 bottom-0 bg-layer/90 transition-colors duration-700"></div>
      </div>
    </>
  )
}
