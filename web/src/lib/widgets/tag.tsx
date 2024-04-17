import { ComponentProps, JSX, splitProps } from 'solid-js'

export type TagProps = {
  level: 'info' | 'success' | 'warning' | 'error'
}

export default function Tag(props: { children?: JSX.Element } & TagProps & ComponentProps<'div'>) {
  const [tagProps, others] = splitProps(props, ['children', 'level'])
  return (
    <div {...others} class={`overflow-hidden rounded-full bg-layer/60 backdrop-blur ${others.class}`}>
      <div class="w-full h-full inline-flex items-center px-3 py-1 space-x-2 bg-layer-content/10 -z-10">
        {' '}
        {/* bg-info bg-success bg-warning bg-error */}
        <span class={`w-2 h-2 rounded-full bg-${tagProps.level}`}></span>
        {tagProps.children}
      </div>
    </div>
  )
}
