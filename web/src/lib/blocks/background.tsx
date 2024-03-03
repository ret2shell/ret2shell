import BackgroundLeft from '../assets/background-left'
import BackgroundRight from '../assets/background-right'
import BgBlur from '../assets/imgs/bg-blur.webp'

export default function () {
  return (
    <>
      <div class="fixed -left-1 -right-1 -top-1 -bottom-1">
        <img
          src={BgBlur}
          alt=""
          class="w-full h-full object-fill"
          onContextMenu={() => {
            return false
          }}
        />
        <div class="fixed left-0 right-0 top-0 bottom-0 bg-layer/80 backdrop-blur transition-colors duration-700"></div>
      </div>
      <BackgroundLeft />
      <BackgroundRight />
    </>
  )
}
