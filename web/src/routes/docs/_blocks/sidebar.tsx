import { fullTheme, t, themeStore } from "@/lib/storage/theme";
import TreeView, { type TreeNode } from "@/lib/widgets/treeview";
import { useLocation } from "@solidjs/router";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import tocJson from "../contents/toc.json";

type DocNode = {
    title: {
        en_us: string;
        zh_cn: string;
        zh_tw: string;
        ja_jp: string;
    };
    children: { [key: string]: DocNode };
};

function transformNode(tree: TreeNode[], root: string, docNode: DocNode) {
    const keys = Object.keys(docNode.children);
    for (const key of keys) {
        const node = docNode.children[key];
        if (node.children && Object.keys(node.children).length) {
            tree.push({
                id: key,
                type: "category",
                icon: "icon-[fluent--book-20-regular]",
                name: node.title[themeStore.locale],
                children: [
                    {
                        type: "item",
                        id: "index",
                        icon: "icon-[fluent--document-one-page-20-regular]",
                        name: t("docs.intro")!,
                        link: `${root}/${key}`,
                        children: [],
                    },
                ],
            });
            transformNode(tree[tree.length - 1].children, `${root}/${key}`, node);
        } else {
            tree.push({
                type: "item",
                id: key,
                icon: "icon-[fluent--document-one-page-20-regular]",
                name: node.title[themeStore.locale],
                link: `${root}/${key}`,
                children: [],
            });
        }
    }
}

export default function () {
    const toc = tocJson as unknown as { [key: string]: DocNode };
    const tree: TreeNode[] = [];
    for (const key of Object.keys(toc)) {
        const node = toc[key];
        tree.push({
            id: key,
            type: "category",
            icon: "icon-[fluent--book-20-regular]",
            name: node.title[themeStore.locale],
            children: [
                {
                    type: "item",
                    id: "index",
                    icon: "icon-[fluent--document-one-page-20-regular]",
                    name: t("docs.intro")!,
                    link: `/docs/${key}`,
                    children: [],
                },
            ],
        });
        transformNode(tree[tree.length - 1].children, `/docs/${key}`, node);
    }
    const location = useLocation();
    const paths = () => location.pathname.replace("/docs/", "").split("/");
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
                <TreeView tree={tree} size="sm" highlightPaths={paths()} />
            </div>
        </OverlayScrollbarsComponent>
    );
}
