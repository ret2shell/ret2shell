import { setColorScheme, themeStore } from '../storage/theme'
import './darkmode-button.scss'
import darkmodeStars from './darkmode-stars.svg'

export default function () {
  let wrapper: HTMLButtonElement

  return (
    <button
      ref={wrapper!}
      data-color-scheme={themeStore.colorScheme}
      class="darkmode-wrapper"
      onClick={() => {
        setColorScheme(themeStore.colorScheme === 'dark' ? 'light' : 'dark')
      }}
    >
      <img
        onContextMenu={() => {
          return false
        }}
        class="darkmode-stars"
        src={darkmodeStars}
      ></img>
      <span class="darkmode-button"></span>
    </button>
  )
}
