import { Avatar, AvatarImageProps, AvatarRootProps } from '@ark-ui/solid'
import './styles/avatar.scss'
import { splitProps } from 'solid-js'

export default function (
  props: AvatarImageProps & { fallback?: string; rootClass?: string; rootClassList?: Record<string, boolean> }
) {
  let [rootProps, imgProps] = splitProps(props, ['fallback', 'rootClass', 'rootClassList'])
  return (
    <Avatar.Root class={`avatar h-12 w-12 ${rootProps.rootClass}`} classList={rootProps.rootClassList}>
      <Avatar.Fallback class="avatar-fallback">{props.fallback}</Avatar.Fallback>
      <Avatar.Image {...imgProps} class="avatar-img" />
    </Avatar.Root>
  )
}
