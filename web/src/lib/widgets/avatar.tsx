import { Avatar, AvatarImageProps, AvatarRootProps } from '@ark-ui/solid'
import './styles/avatar.scss'
import { JSX, splitProps } from 'solid-js'

export type AvatarProps = {
  fallback?: string
  class?: string
  root?: AvatarRootProps
  img?: AvatarImageProps
  children?: JSX.Element
}

export default function (props: AvatarProps) {
  const [fallback, _1] = splitProps(props, ['fallback'])
  const [img, _2] = splitProps(_1, ['img'])
  const [children, root] = splitProps(_2, ['children'])
  return (
    <Avatar.Root class={`avatar ${root.class}`}>
      <Avatar.Fallback class="avatar-fallback">{fallback.fallback?.slice(0, 2).toUpperCase()}</Avatar.Fallback>
      <Avatar.Image {...img} class={`avatar-img ${img.img?.class}`} />
      {children.children}
    </Avatar.Root>
  )
}
