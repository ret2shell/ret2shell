import SidebarLayout from '@/lib/blocks/sidebar-layout'
import { JSX } from 'solid-js'

export default function (props: { children?: JSX.Element }) {
  return <SidebarLayout leftBar={<></>}>{props.children}</SidebarLayout>
}
