import BackgroundLeft from '../assets/background-left'
import BackgroundRight from '../assets/background-right'
import BgBlurNight from '../assets/imgs/bg-blur-stars.webp'
import BgBlurDay from '../assets/imgs/bg-blur-land.webp'
import { themeStore } from '../storage/theme'

export default function () {
  return (
    <>
      <div class="fixed -left-1 -right-1 -top-1 -bottom-1">
        <img
          src={BgBlurNight}
          alt=""
          class={`fixed -left-1 -right-1 -top-1 -bottom-1 w-full h-full object-fill transition-opacity duration-700 ${themeStore.colorScheme === 'dark' ? 'opacity-100' : 'opacity-0'}`}
          onContextMenu={() => {
            return false
          }}
        />
        <img
          src={BgBlurDay}
          alt=""
          class={`fixed -left-1 -right-1 -top-1 -bottom-1 w-full h-full object-fill transition-opacity duration-700 ${themeStore.colorScheme === 'light' ? 'opacity-100' : 'opacity-0'}`}
          onContextMenu={() => {
            return false
          }}
        />
        <div class="fixed left-0 right-0 top-0 bottom-0 bg-layer/80 transition-colors duration-700"></div>
      </div>
      <BackgroundLeft />
      <BackgroundRight />
    </>
  )
}
