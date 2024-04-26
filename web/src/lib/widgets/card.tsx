import { ComponentProps, createMemo, splitProps } from 'solid-js'

export type CardProps = {
  solid?: boolean
  contentClass?: string
  level?: 'info' | 'success' | 'warning' | 'error'
}

export default function (props: CardProps & ComponentProps<'div'>) {
  const [cardProps, nativeProps] = splitProps(props, ['solid', 'contentClass', 'level'])
  const mergedClassesList = {
    card: true,
    'card-solid': cardProps.solid,
  } as { [k: string]: boolean }
  const mergedClasses = createMemo(() => {
    return (
      Object.keys(mergedClassesList)
        .filter(k => mergedClassesList[k])
        .join(' ') + (nativeProps.class ? ` ${nativeProps.class}` : '')
    )
  })
  // card-info card-success card-warning card-error
  return (
    <div {...nativeProps} class={`${mergedClasses()} ${cardProps.level ? 'card-' + cardProps.level : ''}`}>
      <div class={`card-content ${cardProps.contentClass}`}>{nativeProps.children}</div>
    </div>
  )
}
