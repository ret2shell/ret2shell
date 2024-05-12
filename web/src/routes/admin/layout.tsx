import SidebarLayout from '@/lib/blocks/sidebar-layout'
import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import { JSX } from 'solid-js'
import SideBar from './_blocks/sidebar'

export default function (props: { children?: JSX.Element }) {
  return (
    <>
      <Title title={`${t('admin.title')} - ${platformStore.config.name || t('platform.name')}`} />
      <SidebarLayout
        leftBar={
          <>
            <SideBar />
          </>
        }
      >
        {props.children}
      </SidebarLayout>
    </>
  )
}
