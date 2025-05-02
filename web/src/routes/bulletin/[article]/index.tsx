import { handleHttpError } from "@api";
import { deleteBulletin, getBulletin } from "@api/bulletin";
import Spin from "@assets/animates/spin";
import type { Article as ArticleModel } from "@models/article";
import { Permission } from "@models/user";
import { A, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Article from "@widgets/article";
import { HTTPError } from "ky";
import { Show, createSignal, onMount } from "solid-js";
import EditForm from "../_blocks/form";

export default function () {
  const params = useParams();
  const article_id = Number.parseInt(params.article);
  const [searchParams, setSearchParams] = useSearchParams();
  const inEdit = () => searchParams.edit === "true";
  const [article, setArticle] = createSignal(null as ArticleModel | null);
  const navigate = useNavigate();

  if (Number.isNaN(article_id)) navigate("/sigtrap/404", { replace: true });

  onMount(async () => {
    try {
      const resp = await getBulletin(article_id);
      setArticle(resp);
    } catch (err) {
      handleHttpError(err as Error, t("bulletin.errors.fetch.title")!);
      if (err instanceof HTTPError) navigate(`/sigtrap/${err.response.status}`, { replace: true });
      else navigate("/sigtrap/unknown", { replace: true });
    }
  });

  async function onDelete() {
    try {
      await deleteBulletin(article_id);
      addToast({
        level: "success",
        description: t("general.actions.delete.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("general.actions.delete.status.fail")!);
    }
  }

  async function onDone(article: ArticleModel) {
    try {
      setArticle(await getBulletin(article.id));
    } catch (err) {
      handleHttpError(err as Error, t("bulletin.errors.fetch.title")!);
      if (err instanceof HTTPError) navigate(`/sigtrap/${err.response.status}`, { replace: true });
      else navigate("/sigtrap/unknown", { replace: true });
    }
    setSearchParams({ edit: undefined });
  }
  return (
    <>
      <Title page={article()?.title ?? t("bulletin.title")} route={`/bulletin/${article()?.id}`} />
      <h1 class="text-3xl text-center flex flex-row space-x-4 items-center justify-center font-bold mt-8 print:mt-16">
        <Show
          when={article()}
          fallback={
            <>
              <Spin width={32} height={32} />
              <span>{t("general.loading.short")}</span>
            </>
          }
        >
          <span>{article()!.title}</span>
        </Show>
      </h1>
      <div class="flex flex-row items-center justify-center space-x-6 print:space-x-2 opacity-60 flex-wrap py-3">
        <A
          class="hover:underline font-bold flex flex-row space-x-2 items-center"
          title={article()?.publisher_name || t("bulletin.unknownPublisher")!}
          href={`/users/${article()?.publisher_id}`}
        >
          <span class="icon-[fluent--person-20-regular] w-5 h-5 print:hidden" />
          <span class="hidden print:inline-block">By</span>
          <span>{article()?.publisher_name}</span>
        </A>
        <div
          class="font-bold flex flex-row space-x-2 items-center"
          title={t("bulletin.form.createdAt.label", {
            time: article()?.created_at.toFormat("yyyy-MM-dd HH:mm:ss") || "UNKNOWN",
          })}
        >
          <span class="icon-[fluent--calendar-20-regular] w-5 h-5 print:hidden" />
          <span class="hidden print:inline-block">at</span>
          <span>{article()?.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
        </div>
        <Show when={article()?.created_at && article()?.updated_at && article()!.created_at !== article()!.updated_at}>
          <div
            class="font-bold flex flex-row space-x-2 items-center print:hidden"
            title={t("bulletin.form.updatedAt.label", {
              time: article()?.updated_at.toFormat("yyyy-MM-dd HH:mm:ss") || "UNKNOWN",
            })}
          >
            <span class="icon-[fluent--calendar-edit-20-regular] w-5 h-5" />
            <span>{article()?.updated_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
          </div>
        </Show>
        <Show when={accountStore.permissions.includes(Permission.Wiki)}>
          <A
            class="font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
            href={`/bulletin/${article()?.id}?edit=true`}
          >
            <span class="icon-[fluent--edit-20-regular] w-5 h-5" />
            <span>{t("general.actions.edit.title")}</span>
          </A>
          <button
            class="cursor-pointer font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
            onClick={onDelete}
            type="button"
          >
            <span class="icon-[fluent--delete-20-regular] w-5 h-5" />
            <span>{t("general.actions.delete.title")}</span>
          </button>
        </Show>
        <button
          class="cursor-pointer font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
          onClick={() => print()}
          type="button"
        >
          <span class="icon-[fluent--print-20-regular] w-5 h-5" />
          <span>{t("general.actions.print.title")}</span>
        </button>
      </div>
      <Show
        when={inEdit()}
        fallback={<Article class="self-center" content={article()?.content || ""} extra={true} headingAnchors={true} />}
      >
        <div class="flex-1 flex flex-row justify-center px-3 lg:px-6 pb-3 lg:pb-6">
          <EditForm editSource={article() || undefined} onDone={onDone} />
        </div>
      </Show>
    </>
  );
}
