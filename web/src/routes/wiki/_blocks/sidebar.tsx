import type { Article } from "@models/article";
import { Permission } from "@models/user";
import { accountStore } from "@storage/account";
import { fullTheme, t } from "@storage/theme";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import { OverlayScrollbarsComponent } from "@widgets/overlay-scrollbars";
import TreeView, { type TreeNode } from "@widgets/treeview";
import { createMemo, Show } from "solid-js";

function buildLinked(tree: TreeNode[], paths: string[], article: Article) {
  let node = tree.find((node) => node.type === "category" && node.name === paths[0]);
  if (!node) {
    node = {
      id: paths[0],
      type: "category",
      icon: "icon-[fluent--book-20-regular]",
      name: paths[0],
      children: [],
    };
    tree.push(node);
  }
  if (paths.length === 1) {
    node.children.push({
      type: "item",
      id: article.title,
      icon: article.draft
        ? "icon-[fluent--edit-20-regular] text-primary"
        : "icon-[fluent--document-one-page-20-regular]",
      name: article.title,
      link: `/wiki/${article.id}`,
      extraPart: (
        <Show when={!article.published}>
          <span class="shrink-0 icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning" />
        </Show>
      ),
      children: [],
    });
  } else {
    buildLinked(node.children, paths.slice(1), article);
  }
}

function buildTocTree(articles: Article[]) {
  const tree: TreeNode[] = [];
  for (const article of articles) {
    buildLinked(tree, structuredClone([...article.path]) as string[], article);
  }
  return tree;
}

export default function SideBar(props: { toc: Article[]; highlightPaths?: string[] }) {
  const toc = createMemo(() => buildTocTree(props.toc));
  return (
    <OverlayScrollbarsComponent
      options={{
        scrollbars: {
          theme: `os-theme-${fullTheme()}`,
          autoHide: "scroll",
        },
      }}
      class="relative w-full h-full print:h-auto print:overflow-auto"
      defer
    >
      <div class="p-3 lg:p-6 flex flex-col space-y-2 flex-1 min-h-[calc(100%-4rem)]">
        <Show when={accountStore.permissions.includes(Permission.Wiki)}>
          <Link href={"/wiki/create"} level="primary">
            <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
            <span>{t("general.actions.create.title")}</span>
          </Link>
          <Divider class="mt-6! mb-4!" />
        </Show>
        <TreeView tree={toc()} activeMatch="exact" size="sm" highlightPaths={props.highlightPaths} />
      </div>
      <a
        class="sticky bottom-0 h-16 border-t border-t-layer-content/10 flex flex-row items-center justify-center px-4 space-x-2"
        href="https://docs.ret.sh.cn/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="shrink-0 icon-[fluent--book-20-regular] w-5 h-5" />
        <span>{t("docs.title")}</span>
        <span class="shrink-0 icon-[fluent--open-20-regular] w-5 h-5 text-primary" />
      </a>
    </OverlayScrollbarsComponent>
  );
}
