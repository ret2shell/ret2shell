import { t } from '@/lib/storage/theme'
import Divider from '@/lib/widgets/divider'
import Link from '@/lib/widgets/link'

export default function SideBar() {
  return (
    <>
      <ul class="flex flex-col space-y-2 p-3 lg:p-6">
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/statistics" justify="start">
            <span class="icon-[fluent--data-pie-20-regular] w-5 h-5"></span>
            <span>{t('admin.statistics.title')}</span>
          </Link>
        </li>
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/logs" justify="start">
            <span class="icon-[fluent--code-20-regular] w-5 h-5"></span>
            <span>{t('admin.logs.title')}</span>
          </Link>
        </li>
        <Divider />
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/cluster" justify="start">
            <span class="icon-[fluent--hexagon-three-20-regular] w-5 h-5"></span>
            <span>{t('admin.cluster.title')}</span>
          </Link>
        </li>
        <Divider />
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/edit" justify="start">
            <span class="icon-[fluent--edit-20-regular] w-5 h-5"></span>
            <span>{t('admin.edit.title')}</span>
          </Link>
        </li>
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/captcha" justify="start">
            <span class="icon-[fluent--bot-20-regular] w-5 h-5"></span>
            <span>{t('admin.captcha.title')}</span>
          </Link>
        </li>
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/media" justify="start">
            <span class="icon-[fluent--image-20-regular] w-5 h-5"></span>
            <span>{t('admin.media.title')}</span>
          </Link>
        </li>
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/email" justify="start">
            <span class="icon-[fluent--mail-20-regular] w-5 h-5"></span>
            <span>{t('admin.email.title')}</span>
          </Link>
        </li>
        <Divider />
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/oauth" justify="start">
            <span class="icon-[fluent--lock-closed-key-20-regular] w-5 h-5"></span>
            <span>{t('admin.oauth.title')}</span>
          </Link>
        </li>
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/users" justify="start">
            <span class="icon-[fluent--person-20-regular] w-5 h-5"></span>
            <span>{t('admin.users.title')}</span>
          </Link>
        </li>
        <Divider />
        <li class="w-full">
          <Link activeMatch="exact" class="w-full" ghost href="/admin/sync" justify="start">
            <span class="icon-[fluent--flowchart-20-regular] w-5 h-5"></span>
            <span>{t('admin.sync.title')}</span>
          </Link>
        </li>
      </ul>
    </>
  )
}
