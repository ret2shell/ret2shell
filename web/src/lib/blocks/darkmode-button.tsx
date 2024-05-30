import { setColorScheme, themeStore } from '@storage/theme'
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
      type="button"
    >
      <img
        onContextMenu={() => {
          return false
        }}
        class="darkmode-stars"
        src={darkmodeStars}
        alt="Darkmode stars"
      />
      <span class="darkmode-button" />
    </button>
  )
}
