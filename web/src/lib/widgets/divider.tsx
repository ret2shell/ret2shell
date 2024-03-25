import './styles/divider.scss'
export default function (props: { direction?: 'horizontal' | 'vertical' }) {
  const isVertical = props.direction === 'vertical'
  // divider-vertical
  return (
    <div
      classList={{
        divider: true,
        'divider-vertical': isVertical,
      }}
    />
  )
}
