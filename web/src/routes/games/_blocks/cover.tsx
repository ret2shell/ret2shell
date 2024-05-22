import { gameStore } from '@/lib/storage/game'
import { useLocation, useNavigate } from '@solidjs/router'
import { ComponentProps, Show, createEffect, createSignal } from 'solid-js'
import bgGameDefault from '@assets/imgs/bg-game-default.webp'
import LogoAnimate from '@/lib/assets/animates/logo-animate'
import LoadingTips from '@/lib/widgets/loading-tips'
import { api_root } from '@/lib/api'
import { mediaPath } from '@/lib/utils/media'

export default function (props: ComponentProps<'div'>) {
  const location = useLocation()
  const navigate = useNavigate()
  const [expanded, setExpanded] = createSignal(false)
  const _preloadImage = new Image()
  _preloadImage.src = bgGameDefault
  createEffect(() => {
    if (gameStore.current && (location.pathname === '/games' || location.pathname === '/games/')) {
      setExpanded(true)
    }
  })
  createEffect(() => {
    if (gameStore.current && expanded()) {
      setTimeout(() => {
        navigate(`/games/${gameStore.current?.id}`)
      }, 1000)
      setTimeout(() => {
        setExpanded(false)
      }, 3000)
    }
  })
  return (
    <>
      <div
        {...props}
        class={`fixed w-full top-0 left-0 overflow-hidden lg:overflow-clip transition-all ease-in-out z-50 duration-500 ${expanded() ? 'h-full' : 'h-0'} ${props.class}`}
      >
        <div class="w-screen h-screen relative">
          <img
            class={`w-screen h-screen transition-all ease-out duration-[3000ms] ${expanded() ? 'scale-125 blur-2xl' : ''}`}
            src={
              (gameStore.preload?.cover && mediaPath(gameStore.preload.cover)) ||
              (gameStore.current?.cover && mediaPath(gameStore.current.cover)) ||
              bgGameDefault
            }
          />
          <div class={`absolute top-0 left-0 w-screen h-screen bg-layer/80 flex flex-col items-center justify-center`}>
            <Show when={expanded()}>
              <>
                <svg
                  viewBox="0 0 960 1080"
                  xmlns="http://www.w3.org/2000/svg"
                  class="fixed left-0 bottom-0 h-screen opacity-30 print:hidden"
                >
                  {/* <animate attributeName="stroke-dashoffset" dur="2s" values="1000;0" fill="freeze" /> */}
                  <path
                    fill="none"
                    stroke="#0078d6"
                    stroke-width="2"
                    stroke-dasharray="1000"
                    stroke-dashoffset="1000"
                    class="draw-line"
                    d="m 83.478,259.804 v 635.69 l 149.375,86.242 237.176,1.452 M 198.499,72.087 V 281.204 M 140.555,75.89 v 172.015 m -13.23,489.908 V 871.884 L 227.58,929.766 H 379.447 M 169.527,98.227 v 231.986 m 640.793,752.976 -44.681,25.797 -44.682,-25.798 v -51.594 l 44.682,-25.797 44.682,25.797 z m -574.446,-600.33 -52.053,30.053 -52.053,-30.053 v -60.105 l 52.053,-30.053 52.053,30.053 z m 241.557,279.378 -80.277,46.348 -80.277,-46.348 v -92.696 l 80.277,-46.348 80.277,46.348 z m 121.296,200.638 -64.129,37.024 -64.129,-37.024 v -74.05 L 534.6,851.8 l 64.128,37.025 z m -451.467,110.626 -84.862,48.996 -84.863,-48.996 v -97.99 l 84.863,-48.996 84.863,48.995 z m 596.244,-12.605 -63.03,36.39 -63.03,-36.39 v -72.78 l 63.03,-36.39 63.03,36.39 z M 441.216,710.96 V 990.648 L 198.999,1130.492 -43.218,990.648 m 0,0 V 710.96 L 198.999,571.116 441.216,710.96 M 151.2,661.853 66.614,710.688 -17.972,661.853 v -97.671 l 84.586,-48.836 84.586,48.836 z"
                  />
                </svg>
                <svg
                  viewBox="0 0 960 1080"
                  xmlns="http://www.w3.org/2000/svg"
                  class="fixed right-0 top-0 h-screen opacity-30 print:hidden"
                >
                  {/* <animate attributeName="stroke-dashoffset" dur="2s" values="1000;0" fill="freeze" /> */}
                  <path
                    fill="none"
                    stroke="#0078d6"
                    stroke-width="2"
                    stroke-dasharray="1000"
                    stroke-dashoffset="1000"
                    class="draw-line"
                    d="M 775.404,949.219 V 655.867 m 30.909,110.107 v 248.831 M 744.495,734.571 V 949.22 M 227.247,51.277 h 312.9 l 157.678,91.035 V 375.633 M 869.273,123.11 V 641.557 M 819.189,92.992 v 320.8 l -172.163,99.399 m 344.854,19.149 -46.215,26.682 -46.214,-26.681 v -53.364 l 46.214,-26.682 46.215,26.682 z M 287.623,57.625 227.246,92.484 166.87,57.625 v -69.717 l 60.377,-34.858 60.376,34.858 z M 672.455,73.331 574.651,129.798 476.847,73.331 V -39.603 l 97.804,-56.467 97.804,56.467 z M 500.727,195.65 442.267,229.402 383.805,195.65 v -67.505 l 58.461,-33.752 58.46,33.752 z m 213.226,350.724 -80.277,46.348 -80.277,-46.348 v -92.696 l 80.277,-46.348 80.277,46.348 z m 187.357,-262.25 -62.733,36.22 -62.733,-36.22 v -72.438 l 62.733,-36.219 62.733,36.22 z m 107.319,396.82 -100.908,58.26 -100.908,-58.26 V 564.426 l 100.908,-58.26 100.908,58.26 z M 524.695,399.648 V 119.96 L 766.912,-19.884 1009.129,119.96 m 0,0 V 399.648 L 766.912,539.492 524.695,399.648"
                  />
                </svg>
              </>
            </Show>
            <div
              class={`aspect-square h-48 transition-all ease-out duration-500 delay-500 ${expanded() ? '' : 'scale-150 blur-xl opacity-0 rotate-90'}`}
            >
              <Show
                when={gameStore.current?.logo}
                fallback={<LogoAnimate class="w-full h-full object-contain"></LogoAnimate>}
              >
                <img class="w-full h-full object-contain" src={mediaPath(gameStore.current!.logo!)}></img>
              </Show>
            </div>
            <div
              class={`flex flex-col items-center space-y-4 transition-all ease-out duration-500 delay-1000 overflow-hidden mt-8 ${expanded() ? 'h-32' : 'h-0'}`}
            >
              <h1 class="text-4xl font-bold">{gameStore.current?.name}</h1>
              <p class="text-base opacity-60">{gameStore.current?.brief}</p>
            </div>
          </div>
          <Show when={expanded()}>
            <div class="absolute left-8 bottom-4">
              <LoadingTips />
            </div>
          </Show>
        </div>
      </div>
    </>
  )
}
