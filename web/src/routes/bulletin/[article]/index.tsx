import { handleHttpError } from "@api";
import { useBulletin, useDeleteBulletinMutation } from "@api/bulletin";
import Spin from "@assets/animates/spin";
import { Permission } from "@models/user";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Article from "@widgets/article";
import { HTTPError } from "ky";
import { Show } from "solid-js";
import EditForm from "../_blocks/form";

export default function () {
  const params = useParams();
  const articleId = Number.parseInt(params.article || "", 10);
  const [searchParams, setSearchParams] = useSearchParams();
  const inEdit = () => searchParams.edit === "true";
  const navigate = useNavigate();

  if (Number.isNaN(articleId)) navigate("/sigtrap/404", { replace: true });

  const article = useBulletin({
    id: () => articleId,
    onError: (err) => {
      handleHttpError(err as Error, t("bulletin.errors.fetch.title"));
      if (err instanceof HTTPError) navigate(`/sigtrap/${err.response.status}`, { replace: true });
      else navigate("/sigtrap/unknown", { replace: true });
      return false;
    },
  });

  const deleteMutation = useDeleteBulletinMutation({
    onSuccess: () => {
      navigate("/bulletin", { replace: true });
    },
  });

  async function onDone() {
    article.refetch();
    setSearchParams({ edit: undefined });
  }
  return (
    <>
      <Title page={article.data?.title ?? t("bulletin.title")} route={`/bulletin/${article.data?.id}`} />
      <h1 class="text-3xl text-center flex flex-row space-x-4 items-center justify-center font-bold mt-8 print:mt-16">
        <Show
          when={article.data}
          fallback={
            <>
              <Spin width={32} height={32} />
              <span>{t("general.loading.short")}</span>
            </>
          }
        >
          <span>{article.data?.title}</span>
        </Show>
      </h1>
      <div class="flex flex-row items-center justify-center space-x-6 print:space-x-2 opacity-60 flex-wrap py-3">
        <a
          class="hover:underline font-bold flex flex-row space-x-2 items-center"
          title={article.data?.publisher_name || t("bulletin.unknownPublisher")}
          href={`/users/${article.data?.publisher_id}`}
        >
          <span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5 print:hidden" />
          <span class="hidden print:inline-block">By</span>
          <span>{article.data?.publisher_name}</span>
        </a>
        <div
          class="font-bold flex flex-row space-x-2 items-center"
          title={t("bulletin.form.createdAt.label", {
            time: article.data?.created_at.toFormat("yyyy-MM-dd HH:mm:ss") || "UNKNOWN",
          })}
        >
          <span class="shrink-0 icon-[fluent--calendar-20-regular] w-5 h-5 print:hidden" />
          <span class="hidden print:inline-block">at</span>
          <span>{article.data?.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
        </div>
        <Show
          when={
            article.data?.created_at &&
            article.data?.updated_at &&
            article.data?.created_at !== article.data?.updated_at
          }
        >
          <div
            class="font-bold flex flex-row space-x-2 items-center print:hidden"
            title={t("bulletin.form.updatedAt.label", {
              time: article.data?.updated_at.toFormat("yyyy-MM-dd HH:mm:ss") || "UNKNOWN",
            })}
          >
            <span class="shrink-0 icon-[fluent--calendar-edit-20-regular] w-5 h-5" />
            <span>{article.data?.updated_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
          </div>
        </Show>
        <Show when={accountStore.permissions.includes(Permission.Wiki)}>
          <a
            class="font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
            href={`/bulletin/${article.data?.id}?edit=true`}
          >
            <span class="shrink-0 icon-[fluent--edit-20-regular] w-5 h-5" />
            <span>{t("general.actions.edit.title")}</span>
          </a>
          <button
            class="cursor-pointer font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
            onClick={() => {
              if (article.data)
                deleteMutation.mutate({
                  id: article.data.id,
                });
            }}
            type="button"
          >
            <span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />
            <span>{t("general.actions.delete.title")}</span>
          </button>
        </Show>
        <button
          class="cursor-pointer font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
          onClick={() => print()}
          type="button"
        >
          <span class="shrink-0 icon-[fluent--print-20-regular] w-5 h-5" />
          <span>{t("general.actions.print.title")}</span>
        </button>
      </div>
      <Show
        when={inEdit()}
        fallback={
          <Article class="self-center" content={article.data?.content || ""} extra={true} headingAnchors={true} />
        }
      >
        <div class="flex-1 flex flex-row justify-center px-3 lg:px-6 pb-3 lg:pb-6">
          <EditForm articleId={articleId} onDone={onDone} />
        </div>
      </Show>
    </>
  );
}
