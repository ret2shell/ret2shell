import { handleHttpError } from "@api";
import { createWiki, updateWiki } from "@api/wiki";
import { type Article, ArticleAccessPolicy } from "@models/article";
import { createForm, required, setValues } from "@modular-forms/solid";
import { accountStore } from "@storage/account";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Editor from "@widgets/editor";
import IconCheckbox from "@widgets/icon-checkbox";
import Input from "@widgets/input";
import { DateTime } from "luxon";
import { createEffect, createSignal, untrack } from "solid-js";

type WikiForm = {
  title: string;
  path: string;
  content: string;
  enable_comment: boolean;
  draft: boolean;
  published: boolean;
};

export default function (props: {
  onDone: (article: Article) => void;
  editSource?: Article;
}) {
  const [form, { Form, Field }] = createForm<WikiForm>();
  const [loading, setLoading] = createSignal(false);
  createEffect(() => {
    if (props.editSource) {
      untrack(() => {
        setValues(form, {
          title: props.editSource!.title,
          path: props.editSource!.path.join("/"),
          content: props.editSource!.content || "",
          enable_comment: props.editSource!.enable_comment,
          draft: props.editSource!.draft,
          published: props.editSource!.published,
        });
      });
    } else {
      untrack(() => {
        setValues(form, {
          title: undefined,
          path: undefined,
          content: undefined,
          enable_comment: true,
          draft: true,
          published: false,
        });
      });
    }
  });
  async function onSubmit(result: WikiForm) {
    setLoading(true);
    const article: Article = {
      ...result,
      path: result.path.split("/"),
      id: props.editSource?.id || 0,
      created_at: props.editSource?.created_at || DateTime.now(),
      updated_at: DateTime.now(),
      publisher_id: props.editSource?.publisher_id || accountStore.id!,
      access_policy: ArticleAccessPolicy.Wiki,
      weight: 0,
    };
    try {
      props.onDone(await (props.editSource ? updateWiki(article) : createWiki(article)));
    } catch (err) {
      handleHttpError(
        err as Error,
        props.editSource ? t("general.actions.save.status.fail")! : t("general.actions.create.status.fail")!
      );
    }
    setLoading(false);
  }
  return (
    <Form onSubmit={onSubmit} class="flex flex-col space-y-2 self-center w-full max-w-5xl flex-1">
      <Field name="title" validate={[required(t("wiki.form.title.required")!)]}>
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--book-20-regular] w-5 h-5" />}
            placeholder={t("wiki.form.title.placeholder")!}
            title={t("wiki.form.title.label")!}
            {...props}
            value={field.value}
            error={field.error}
            required
            extraBtn={
              <>
                <Field name="enable_comment" type="boolean">
                  {(field, props) => (
                    <IconCheckbox
                      title={t("wiki.form.enableComment.label")}
                      class="!rounded-none"
                      uncheckedIcon="icon-[fluent--chat-20-regular]"
                      checkedIcon="icon-[fluent--chat-20-filled]"
                      inputProps={props}
                      checked={field.value}
                      error={field.error}
                      name="enable_comment"
                    />
                  )}
                </Field>
                <Field name="draft" type="boolean">
                  {(field, props) => (
                    <IconCheckbox
                      title={t("wiki.form.draft.label")}
                      class="!rounded-none"
                      uncheckedIcon="icon-[fluent--edit-20-regular]"
                      checkedIcon="icon-[fluent--edit-20-filled]"
                      inputProps={props}
                      checked={field.value}
                      error={field.error}
                      name="draft"
                    />
                  )}
                </Field>
                <Field name="published" type="boolean">
                  {(field, props) => (
                    <IconCheckbox
                      title={t("wiki.form.published.label")}
                      class="!rounded-l-none"
                      uncheckedIcon="icon-[fluent--megaphone-loud-20-regular]"
                      checkedIcon="icon-[fluent--megaphone-loud-20-filled]"
                      inputProps={props}
                      checked={field.value}
                      error={field.error}
                      name="published"
                    />
                  )}
                </Field>
              </>
            }
          />
        )}
      </Field>
      <Field name="path" validate={[required(t("wiki.form.path.required")!)]}>
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--code-20-regular] w-5 h-5" />}
            placeholder={t("wiki.form.path.placeholder")!}
            title={t("wiki.form.path.label")!}
            {...props}
            value={field.value}
            error={field.error}
            required
          />
        )}
      </Field>
      <Field name="content" validate={[required(t("wiki.form.content.required")!)]}>
        {(field) => (
          <Editor
            form={form}
            lineNumbers
            class="flex-1"
            lang="markdown"
            placeholder="MARKDOWN"
            title={t("wiki.form.content.label")!}
            name="content"
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
        {props.editSource ? t("general.actions.save.title") : t("general.actions.create.title")}
      </Button>
    </Form>
  );
}
