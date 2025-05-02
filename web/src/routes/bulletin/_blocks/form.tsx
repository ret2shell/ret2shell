import { handleHttpError } from "@api";
import { createBulletin, updateBulletin } from "@api/bulletin";
import { type Article, ArticleAccessPolicy } from "@models/article";
import { createForm, required, setValues } from "@modular-forms/solid";
import { accountStore } from "@storage/account";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Editor from "@widgets/editor";
import IconCheckbox from "@widgets/icon-checkbox";
import Input from "@widgets/input";
import type { HTTPError } from "ky";
import { DateTime } from "luxon";
import { createEffect, createSignal, untrack } from "solid-js";

type BulletinForm = {
  title: string;
  content: string;
  enable_comment: boolean;
  weight: boolean;
};

export default function (props: {
  onDone: (calendar: Article) => void;
  editSource?: Article;
}) {
  const [form, { Form, Field }] = createForm<BulletinForm>();
  const [loading, setLoading] = createSignal(false);
  createEffect(() => {
    if (props.editSource) {
      untrack(() => {
        setValues(form, {
          title: props.editSource?.title || "",
          content: props.editSource?.content || "",
          enable_comment: props.editSource?.enable_comment || false,
          weight: !!props.editSource?.weight,
        });
      });
    } else {
      untrack(() => {
        setValues(form, {
          title: undefined,
          content: undefined,
          enable_comment: true,
          weight: false,
        });
      });
    }
  });
  async function onSubmit(result: BulletinForm) {
    setLoading(true);
    try {
      const resp = await (props.editSource ? updateBulletin : createBulletin)({
        ...result,
        weight: result.weight ? 1 : 0,
        id: props.editSource?.id || 0,
        created_at: props.editSource?.created_at || DateTime.now(),
        updated_at: props.editSource?.updated_at || DateTime.now(),
        publisher_id: accountStore.id || 0,
        access_policy: ArticleAccessPolicy.Bulletin,
        draft: false,
        published: true,
        path: [],
      });
      props.onDone(resp);
    } catch (err) {
      handleHttpError(
        err as HTTPError,
        props.editSource ? t("general.actions.save.status.fail")! : t("general.actions.create.status.fail")!
      );
    }
    setLoading(false);
  }
  return (
    <Form onSubmit={onSubmit} class="flex flex-col space-y-2 w-full max-w-5xl flex-1">
      <Field name="title" validate={[required(t("bulletin.form.title.required")!)]}>
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--megaphone-20-regular] w-5 h-5" />}
            placeholder={t("bulletin.form.title.placeholder")!}
            title={t("bulletin.form.title.label")!}
            {...props}
            value={field.value}
            error={field.error}
            required
            extraBtn={
              <>
                <Field name="weight" type="boolean">
                  {(field, props) => (
                    <IconCheckbox
                      class="!rounded-none"
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
                      class="!rounded-l-none"
                      title={t("bulletin.form.enableComment.label")!}
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
      <Field name="content" validate={[required(t("bulletin.form.content.required")!)]}>
        {(field) => (
          <Editor
            form={form}
            lineNumbers
            class="flex-1"
            lang="markdown"
            placeholder="MARKDOWN"
            title={t("bulletin.form.content.label")!}
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
