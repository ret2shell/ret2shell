import { useDeleteWikiMutation, useWiki, useWikiTree } from "@api/wiki";
import Spin from "@assets/animates/spin";
import { Permission } from "@models/user";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Article from "@widgets/article";
import Divider from "@widgets/divider";
import { HTTPError } from "ky";
import { createTrackedEffect, Show } from "solid-js";
import EditForm from "../_blocks/form";

export default function () {
  const params = useParams();
  const article_id = () => Number.parseInt(params.article || "0", 10);
  const [searchParams, setSearchParams] = useSearchParams();
  const inEdit = () => searchParams.edit === "true";
  const navigate = useNavigate();

  const wikiTree = useWikiTree({ enabled: () => false });

  const wiki = useWiki({
    id: article_id,
    enabled: () => !Number.isNaN(article_id()),
    onError: (err: Error) => {
      if (err instanceof HTTPError) {
        navigate(`/sigtrap/${err.response.status}`, { replace: true });
      } else {
        navigate("/sigtrap/unknown", { replace: true });
      }
      return false;
    },
  });

  createTrackedEffect(() => {
    if (Number.isNaN(article_id())) navigate("/sigtrap/404", { replace: true });
  });

  function onDelete() {
    deleteWikiMutation.mutate({ id: article_id() });
  }

  async function onDone() {
    await wiki.refetch();
    await wikiTree.refetch();
    setSearchParams({ edit: undefined });
  }

  const deleteWikiMutation = useDeleteWikiMutation({
    onSuccess: async () => {
      await wikiTree.refetch();
      navigate("/wiki", { replace: true });
    },
  });

  return (
    <>
      <Title page={wiki.data?.title} route={`/wiki/${wiki.data?.id}`} />
      <div class="flex-1 flex flex-col items-center px-3 lg:px-6">
        <h1 class="text-3xl flex flex-row space-x-4 items-center w-full max-w-5xl justify-start print:justify-center font-bold mt-8 print:mt-16">
          <Show
            when={wiki.data}
            fallback={
              <>
                <Spin width={32} height={32} />
                <span>{t("general.loading.short")}</span>
              </>
            }
          >
            <span>{wiki.data!.title}</span>
          </Show>
        </h1>
        <div class="flex flex-row items-center w-full max-w-5xl justify-start print:justify-center space-x-6 print:space-x-2 opacity-60 flex-wrap py-3">
          <a
            class="hover:underline font-bold flex flex-row space-x-2 items-center"
            title={wiki.data?.publisher_name || t("wiki.unknownPublisher")}
            href={`/users/${wiki.data?.publisher_id}`}
          >
            <span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5 print:hidden" />
            <span>{wiki.data?.publisher_name}</span>
          </a>
          <div
            class="font-bold flex flex-row space-x-2 items-center"
            title={t("wiki.form.createdAt.label", {
              time: wiki.data?.created_at.toFormat("yyyy-MM-dd HH:mm:ss") || "UNKNOWN",
            })}
          >
            <span class="shrink-0 icon-[fluent--calendar-20-regular] w-5 h-5 print:hidden" />
            <span class="hidden print:inline-block">at</span>
            <span>{wiki.data?.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
          </div>
          <Show when={wiki.data?.created_at && wiki.data?.updated_at && wiki.data.created_at !== wiki.data.updated_at}>
            <div
              class="font-bold flex flex-row space-x-2 items-center print:hidden"
              title={t("wiki.form.updatedAt.label", {
                time: wiki.data?.updated_at.toFormat("yyyy-MM-dd HH:mm:ss") || "UNKNOWN",
              })}
            >
              <span class="shrink-0 icon-[fluent--calendar-edit-20-regular] w-5 h-5" />
              <span>{wiki.data?.updated_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
            </div>
          </Show>
          <Show when={accountStore.permissions.includes(Permission.Wiki)}>
            <a
              class="font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
              href={`/wiki/${wiki.data?.id}?edit=true`}
            >
              <span class="shrink-0 icon-[fluent--edit-20-regular] w-5 h-5" />
              <span>{t("general.actions.edit.title")}</span>
            </a>
            <button
              class="cursor-pointer font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
              onClick={onDelete}
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
        <Divider class="w-full max-w-5xl" />
        <Show
          when={inEdit()}
          fallback={<Article class="self-center" content={wiki.data?.content || ""} extra headingAnchors toc />}
        >
          <EditForm editSource={wiki.data || undefined} onDone={onDone} />
        </Show>
      </div>
    </>
  );
}
