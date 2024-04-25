import { ComponentProps, JSX, splitProps } from 'solid-js'

export type TagProps = {
  level: 'info' | 'success' | 'warning' | 'error'
}

export default function Tag(props: { children?: JSX.Element } & TagProps & ComponentProps<'div'>) {
  const [tagProps, others] = splitProps(props, ['children', 'level'])
  return (
    <div {...others} class={`tag ${others.class}`}>
      <div class="tag-content">
        {/* bg-info bg-success bg-warning bg-error */}
        <span class={`tag-dot bg-${tagProps.level}`}></span>
        {tagProps.children}
      </div>
    </div>
  )
}
