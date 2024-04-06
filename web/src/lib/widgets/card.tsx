import { ComponentProps, JSX, createMemo } from 'solid-js'
import './styles/card.scss'

export type CardProps = {
  solid?: boolean
  contentClass?: string
}

export default function (props: CardProps & ComponentProps<'div'>) {
  const mergedClassesList = {
    card: true,
    'card-solid': props.solid,
  } as { [k: string]: boolean }
  const mergedClasses = createMemo(() => {
    return (
      Object.keys(mergedClassesList)
        .filter(k => mergedClassesList[k])
        .join(' ') + (props.class ? ` ${props.class}` : '')
    )
  })
  return (
    <div {...props} class={mergedClasses()}>
      <div class={`card-content ${props.contentClass}`}>{props.children}</div>
    </div>
  )
}
