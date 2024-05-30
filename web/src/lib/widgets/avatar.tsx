import { Avatar, AvatarImageProps, AvatarRootProps } from '@ark-ui/solid'
import { JSX, splitProps } from 'solid-js'

export type AvatarProps = {
  fallback?: string
  class?: string
  src?: string
  alt?: string
  children?: JSX.Element
}

export default function (props: AvatarProps) {
  const [fallback, _1] = splitProps(props, ['fallback'])
  const [children, root] = splitProps(_1, ['children'])
  return (
    <Avatar.Root class={`avatar ${root.class}`}>
      <Avatar.Fallback class="avatar-fallback">{fallback.fallback?.slice(0, 2).toUpperCase()}</Avatar.Fallback>
      <Avatar.Image src={root.src} alt={root.alt} class="avatar-img" />
      {children.children}
    </Avatar.Root>
  )
}
