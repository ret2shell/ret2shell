import { handleHttpError } from "@api";
import { getBulletinList } from "@api/bulletin";
import Spin from "@assets/animates/spin";
import { randomTips } from "@lib/utils/loading-tips";
import type { Article } from "@models/article";
import { Permission } from "@models/user";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import Pagination from "@widgets/pagination";
import clsx from "clsx";
import { For, Match, Show, Switch, createEffect, createSignal, untrack } from "solid-js";

export default function () {
  const [articles, setArticles] = createSignal<Article[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [loading, setLoading] = createSignal(false);
  async function fetchArticles() {
    setLoading(true);
    try {
      const resp = await getBulletinList(page(), 10);
      setArticles(resp[0]);
      setTotal(resp[1]);
    } catch (err) {
      handleHttpError(err as Error, t("bulletin.errors.fetchList.title")!);
    }
    setLoading(false);
  }
  createEffect(() => {
    if (page()) untrack(fetchArticles);
  });
  return (
    <>
      <Title page={t("bulletin.title")} route="/bulletin" />
      <div class="flex flex-col items-center p-3 lg:p-6 flex-1">
        <div class="flex flex-col flex-1 w-full max-w-5xl">
          <div class="h-12 relative flex flex-row items-center px-4">
            <h1 class="space-x-2 flex flex-row items-center flex-1">
              <span class="icon-[fluent--megaphone-20-regular] w-5 h-5" />
              <span class="font-bold">{t("bulletin.title")}</span>
            </h1>
            <Show when={accountStore.permissions.includes(Permission.Bulletin)}>
              <Link size="sm" level="primary" href="/bulletin/create">
                <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                <span>{t("general.actions.create.title")}</span>
              </Link>
            </Show>
            <Divider class="absolute bottom-0 left-2 right-2" />
          </div>
          <For each={articles()}>
            {(article) => (
              <>
                <Link ghost justify="start" href={`/bulletin/${article.id}`} class="overflow-hidden relative">
                  <span
                    class={clsx(
                      article.weight >= 1 ? "text-primary" : "text-layer-content",
                      article.weight >= 1
                        ? "icon-[fluent--megaphone-20-filled]"
                        : "icon-[fluent--megaphone-20-regular]",
                      "w-5 h-5"
                    )}
                  />
                  <span class="flex-1 text-start truncate font-normal">{article.title}</span>
                  <span class="opacity-60">{article.created_at.toFormat("yyyy-MM-dd")}</span>
                  <Divider class="absolute bottom-0 left-2 right-2" />
                </Link>
              </>
            )}
          </For>
          <Switch>
            <Match when={articles().length === 0 && !loading()}>
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <span class="icon-[fluent--megaphone-20-regular] w-24 h-24" />
                <span>{t("bulletin.empty")}</span>
              </div>
            </Match>
            <Match when={loading()}>
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <Spin width={32} height={32} />
                <span>{randomTips()}</span>
              </div>
            </Match>
          </Switch>
        </div>
        <Pagination
          class="p-6 lg:p-9"
          count={total()}
          pageSize={10}
          page={page()}
          onPageChange={(page) => setPage(page.page)}
        />
      </div>
    </>
  );
}
