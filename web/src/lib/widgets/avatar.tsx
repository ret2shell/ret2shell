import { Avatar, AvatarRootProps } from '@ark-ui/solid'
import './styles/avatar.scss'

export default function (props: AvatarRootProps & { fallback?: string; src?: string; alt?: string }) {
  return (
    <Avatar.Root class={`avatar h-12 w-12 ${props.class}`}>
      <Avatar.Fallback class="avatar-fallback">{props.fallback}</Avatar.Fallback>
      <Avatar.Image class="avatar-img" src={props.src} alt={props.alt} />
    </Avatar.Root>
  )
}
