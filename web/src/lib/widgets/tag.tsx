import { ComponentProps, JSX, splitProps } from 'solid-js'

export type TagProps = {
  level: 'info' | 'success' | 'warning' | 'error'
}

export default function Tag(props: { children: JSX.Element } & TagProps & ComponentProps<'div'>) {
  const [tagProps, others] = splitProps(props, ['children', 'level'])
  return (
    <div
      {...others}
      class={`inline-flex items-center px-3 py-1 rounded-full bg-layer-content/5 space-x-2 ${others.class}`}
    >
      {/* bg-info bg-success bg-warning bg-error */}
      <span class={`w-2 h-2 rounded-full bg-${tagProps.level}`}></span>
      {tagProps.children}
    </div>
  )
}
