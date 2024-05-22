import SidebarLayout from '@/lib/blocks/sidebar-layout'
import { JSX } from 'solid-js'
import SideBar from './_blocks/sidebar'

export default function (props: { children?: JSX.Element }) {
  return <SidebarLayout leftBar={<SideBar />}>{props.children}</SidebarLayout>
}
