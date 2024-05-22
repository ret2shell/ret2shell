import { Article } from '@/lib/models/article'
import { Permission } from '@/lib/models/user'
import { accountStore } from '@/lib/storage/account'
import { fullTheme, t } from '@/lib/storage/theme'
import { wikiStore } from '@/lib/storage/wiki'
import Divider from '@/lib/widgets/divider'
import Link from '@/lib/widgets/link'
import TreeView, { TreeNode } from '@/lib/widgets/treeview'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-solid'
import { Show } from 'solid-js'

function buildLinked(tree: TreeNode[], paths: string[], article: Article) {
  let node = tree.find(node => node.type === 'category' && node.name === paths[0])
  if (!node) {
    node = {
      type: 'category',
      icon: 'icon-[fluent--book-20-regular]',
      name: paths[0],
      children: [],
    }
    tree.push(node)
  }
  if (paths.length === 1) {
    node.children.push({
      type: 'item',
      id: article.id,
      icon: article.draft
        ? 'icon-[fluent--edit-20-regular] text-primary'
        : 'icon-[fluent--document-one-page-20-regular]',
      name: article.title,
      link: `/wiki/${article.id}`,
      extraPart: (
        <>
          <Show when={!article.published}>
            <span class="icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning"></span>
          </Show>
        </>
      ),
      children: [],
    })
  } else {
    buildLinked(node.children, paths.slice(1), article)
  }
}

function buildTocTree(articles: Article[]) {
  const tree: TreeNode[] = []
  for (const article of articles) {
    buildLinked(tree, JSON.parse(JSON.stringify(article.path)), article)
  }
  return tree
}

export default function SideBar() {
  const toc = () => buildTocTree(wikiStore.toc)
  return (
    <>
      <OverlayScrollbarsComponent
        options={{
          scrollbars: {
            theme: `os-theme-${fullTheme()}`,
            autoHide: 'scroll',
          },
        }}
        class="relative w-full h-full print:h-auto print:overflow-auto"
        defer
      >
        <div class="p-3 lg:p-6 flex flex-col space-y-2">
          <Show when={accountStore.permissions.includes(Permission.Wiki)}>
            <>
              <Link href={`/wiki/create`} level="primary">
                <span class="icon-[fluent--add-20-regular] w-5 h-5"></span>
                <span>{t('form.create')}</span>
              </Link>
              <Divider class="!mt-6 !mb-4" />
            </>
          </Show>
          <TreeView tree={toc()} size="sm" highlightPaths={wikiStore.current?.path} />
        </div>
      </OverlayScrollbarsComponent>
    </>
  )
}
