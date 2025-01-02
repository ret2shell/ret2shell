import { deleteWiki, getWiki } from "@api/wiki";
import Spin from "@assets/animates/spin";
import type { Article as ArticleModel } from "@models/article";
import { Permission } from "@models/user";
import { A, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import { refreshWikiToc, setWikiStore, wikiStore } from "@storage/wiki";
import Article from "@widgets/article";
import Divider from "@widgets/divider";
import { HTTPError } from "ky";
import { Show, createEffect, onCleanup, untrack } from "solid-js";
import EditForm from "../_blocks/form";
import { handleHttpError } from "@api";

export default function () {
  const params = useParams();
  const article_id = () => Number.parseInt(params.article);
  const [searchParams, setSearchParams] = useSearchParams();
  const inEdit = () => searchParams.edit === "true";
  const navigate = useNavigate();

  createEffect(() => {
    if (Number.isNaN(article_id())) navigate("/sigtrap/404", { replace: true });
    untrack(async () => {
      try {
        setWikiStore({ current: await getWiki(article_id()) });
      } catch (err) {
        handleHttpError(err as Error, t("errors.unknown")!);
        if (err instanceof HTTPError) {
          navigate(`/sigtrap/${err.response.status}`, { replace: true });
        } else {
          navigate("/sigtrap/unknown", { replace: true });
        }
      }
    });
  });

  onCleanup(() => {
    setWikiStore({ current: null });
  });

  async function onDelete() {
    try {
      await deleteWiki(article_id());
      addToast({
        level: "success",
        description: t("wiki.deleteSuccess")!,
        duration: 5000,
      });
      await refreshWikiToc();
      navigate("/wiki", { replace: true });
    } catch (err) {
      handleHttpError(err as Error, t("errors.unknown")!);
    }
  }

  async function onDone(article: ArticleModel) {
    try {
      setWikiStore({ current: await getWiki(article.id) });
      await refreshWikiToc();
    } catch (err) {
      handleHttpError(err as Error, t("errors.unknown")!);
      if (err instanceof HTTPError) {
        navigate(`/sigtrap/${err.response.status}`, { replace: true });
      } else {
        navigate("/sigtrap/unknown", { replace: true });
      }
    }
    setSearchParams({ edit: undefined });
  }
  return (
    <>
      <Title page={wikiStore.current?.title} route={`/wiki/${wikiStore.current?.id}`} />
      <div class="flex-1 flex flex-col items-center px-3 lg:px-6">
        <h1 class="text-3xl flex flex-row space-x-4 items-center w-full max-w-5xl justify-start print:justify-center font-bold mt-8 print:mt-16">
          <Show
            when={wikiStore.current}
            fallback={
              <>
                <Spin width={32} height={32} />
                <span>{t("article.loading")}</span>
              </>
            }
          >
            <span>{wikiStore.current!.title}</span>
          </Show>
        </h1>
        <div class="flex flex-row items-center w-full max-w-5xl justify-start print:justify-center space-x-6 print:space-x-2 opacity-60 flex-wrap py-3">
          <A
            class="hover:underline font-bold flex flex-row space-x-2 items-center"
            title={t("article.by", {
              name: wikiStore.current?.publisher_name || t("article.unknownPublisher")!,
            })}
            href={`/users/${wikiStore.current?.publisher_id}`}
          >
            <span class="icon-[fluent--person-20-regular] w-5 h-5 print:hidden" />
            <span class="hidden print:inline-block">By</span>
            <span>{wikiStore.current?.publisher_name}</span>
          </A>
          <div
            class="font-bold flex flex-row space-x-2 items-center"
            title={t("article.createdAt", {
              time: wikiStore.current?.created_at.toFormat("yyyy-MM-dd HH:mm:ss") || "UNKNOWN",
            })}
          >
            <span class="icon-[fluent--calendar-20-regular] w-5 h-5 print:hidden" />
            <span class="hidden print:inline-block">at</span>
            <span>{wikiStore.current?.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
          </div>
          <Show
            when={
              wikiStore.current?.created_at &&
              wikiStore.current?.updated_at &&
              wikiStore.current.created_at !== wikiStore.current.updated_at
            }
          >
            <div
              class="font-bold flex flex-row space-x-2 items-center print:hidden"
              title={t("article.updatedAt", {
                time: wikiStore.current?.updated_at.toFormat("yyyy-MM-dd HH:mm:ss") || "UNKNOWN",
              })}
            >
              <span class="icon-[fluent--calendar-edit-20-regular] w-5 h-5" />
              <span>{wikiStore.current?.updated_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
            </div>
          </Show>
          <Show when={accountStore.permissions.includes(Permission.Wiki)}>
            <A
              class="font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
              href={`/wiki/${wikiStore.current?.id}?edit=true`}
            >
              <span class="icon-[fluent--edit-20-regular] w-5 h-5" />
              <span>{t("form.edit")}</span>
            </A>
            <button
              class="font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
              onClick={onDelete}
              type="button"
            >
              <span class="icon-[fluent--delete-20-regular] w-5 h-5" />
              <span>{t("form.delete")}</span>
            </button>
          </Show>
          <button
            class="font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
            onClick={() => print()}
            type="button"
          >
            <span class="icon-[fluent--print-20-regular] w-5 h-5" />
            <span>{t("form.print")}</span>
          </button>
        </div>
        <Divider class="w-full max-w-5xl" />
        <Show
          when={inEdit()}
          fallback={<Article class="self-center" content={wikiStore.current?.content || ""} extra headingAnchors toc />}
        >
          <EditForm editSource={wikiStore.current || undefined} onDone={onDone} />
        </Show>
      </div>
    </>
  );
}
