import { JSX } from 'solid-js'
import './styles/card.scss'

export default function (props: {
  solid?: boolean
  classList?: { [k: string]: boolean }
  class?: string
  contentClassList?: { [k: string]: boolean }
  contentClass?: string
  children?: JSX.Element
}) {
  const mergedClassesList = {
    card: true,
    'card-solid': props.solid,
    ...props.classList,
  } as { [k: string]: boolean }
  const mergedClasses =
    Object.keys(mergedClassesList)
      .filter(k => mergedClassesList[k])
      .join(' ') + (props.class ? ` ${props.class}` : '')
  const contentClassesList = {
    ...props.contentClassList,
  } as { [k: string]: boolean }
  return (
    <div class={mergedClasses}>
      <div
        class={`card-content ${props.contentClass} ${Object.keys(contentClassesList)
          .filter(k => contentClassesList[k])
          .join(' ')}`}
      >
        {props.children}
      </div>
    </div>
  )
}
