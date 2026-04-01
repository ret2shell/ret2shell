import { useBulletin, useCreateBulletinMutation, useUpdateBulletinMutation } from "@api/bulletin";
import { type Article, ArticleAccessPolicy } from "@models/article";
import { createForm, required } from "@modular-forms/solid";
import { accountStore } from "@storage/account";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Editor from "@widgets/editor";
import FormDraftReset from "@widgets/form-draft-reset";
import IconCheckbox from "@widgets/icon-checkbox";
import Input from "@widgets/input";
import { DateTime } from "luxon";
import { createMemo } from "solid-js";

type BulletinForm = {
  title: string;
  content: string;
  enable_comment: boolean;
  weight: boolean;
};

export default function (props: { onDone: (calendar: Article) => void; articleId?: number }) {
  const article = useBulletin({ id: () => props.articleId!, enabled: () => !!props.articleId });
  const createBulletinMutation = useCreateBulletinMutation({
    onSuccess: (data) => {
      draft.discardDraft();
      props.onDone(data);
    },
  });
  const updateBulletinMutation = useUpdateBulletinMutation({
    onSuccess: (data) => {
      draft.discardDraft();
      props.onDone(data);
    },
  });
  const [form, { Form, Field }] = createForm<BulletinForm>({
    initialValues: {
      title: article.data?.title || "",
      content: article.data?.content || "",
      enable_comment: article.data?.enable_comment || false,
      weight: !!article.data?.weight,
    },
  });
  const remoteValues = createMemo<BulletinForm>(() => ({
    title: article.data?.title || "",
    content: article.data?.content || "",
    enable_comment: article.data?.enable_comment || false,
    weight: !!article.data?.weight,
  }));
  const draft = useFormDraft({
    form,
    key: () => (props.articleId ? buildFormDraftKey("bulletin", props.articleId) : undefined),
    remoteValues,
    enabled: () => !!props.articleId && !!article.data,
  });
  async function onSubmit(result: BulletinForm) {
    (article.data ? updateBulletinMutation : createBulletinMutation).mutate({
      ...result,
      weight: result.weight ? 1 : 0,
      id: article.data?.id || 0,
      created_at: article.data?.created_at || DateTime.now(),
      updated_at: article.data?.updated_at || DateTime.now(),
      publisher_id: accountStore.id || 0,
      access_policy: ArticleAccessPolicy.Bulletin,
      draft: false,
      published: true,
      path: [],
    });
  }
  return (
    <Form onSubmit={onSubmit} class="flex flex-col space-y-2 w-full max-w-5xl flex-1">
      <Field name="title" validate={[required(t("bulletin.form.title.required"))]}>
        {(field, props) => (
          <Input
            icon={<span class="shrink-0 icon-[fluent--megaphone-20-regular] w-5 h-5" />}
            placeholder={t("bulletin.form.title.placeholder")}
            title={t("bulletin.form.title.label")}
            {...props}
            value={field.value}
            error={field.error}
            required
            extraBtn={
              <>
                <Field name="weight" type="boolean">
                  {(field, props) => (
                    <IconCheckbox
                      class="rounded-none!"
                      uncheckedIcon="icon-[fluent--pin-20-regular]"
                      checkedIcon="icon-[fluent--pin-20-filled]"
                      inputProps={props}
                      checked={field.value}
                      error={field.error}
                      name="weight"
                    />
                  )}
                </Field>
                <Field name="enable_comment" type="boolean">
                  {(field, props) => (
                    <IconCheckbox
                      class="rounded-l-none!"
                      title={t("bulletin.form.enableComment.label")}
                      uncheckedIcon="icon-[fluent--chat-20-regular]"
                      checkedIcon="icon-[fluent--chat-20-filled]"
                      inputProps={props}
                      checked={field.value}
                      error={field.error}
                      name="enable_comment"
                    />
                  )}
                </Field>
              </>
            }
          />
        )}
      </Field>
      <Field name="content" validate={[required(t("bulletin.form.content.required"))]}>
        {(field) => (
          <Editor
            form={form}
            lineNumbers
            class="flex-1"
            lang="markdown"
            placeholder="MARKDOWN"
            title={t("bulletin.form.content.label")}
            name="content"
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <div class="mt-4! flex flex-row space-x-2">
        <Button
          type="submit"
          level="primary"
          class="flex-1"
          loading={createBulletinMutation.isPending || updateBulletinMutation.isPending}
          disabled={createBulletinMutation.isPending || updateBulletinMutation.isPending}
        >
          {props.articleId ? t("general.actions.save.title") : t("general.actions.create.title")}
        </Button>
        <FormDraftReset
          when={draft.hasDraft()}
          loading={createBulletinMutation.isPending || updateBulletinMutation.isPending}
          disabled={createBulletinMutation.isPending || updateBulletinMutation.isPending}
          onConfirm={draft.discardDraft}
        />
      </div>
    </Form>
  );
}
