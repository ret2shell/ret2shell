import { ComponentProps } from 'solid-js'
import './styles/divider.scss'
export default function (props: ComponentProps<'div'> & { direction?: 'horizontal' | 'vertical' }) {
  const isVertical = props.direction === 'vertical'
  const mergedProps = { ...props, classList: { divider: true, 'divider-vertical': isVertical, ...props.classList } }
  // divider-vertical
  return <div {...mergedProps} />
}
