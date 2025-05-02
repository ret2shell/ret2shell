import { handleHttpError } from "@api";
import { type Article, ArticleAccessPolicy } from "@models/article";
import { createForm, required, setValues } from "@modular-forms/solid";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Editor from "@widgets/editor";
import { DateTime } from "luxon";
import { createEffect, createSignal, untrack } from "solid-js";

type ArticleForm = {
  content: string;
};

export default function IntroForm(props: {
  onDone: (article: Article) => Promise<void>;
  editSource?: Article;
}) {
  const [form, { Form, Field }] = createForm<ArticleForm>();
  const [loading, setLoading] = createSignal(false);
  createEffect(() => {
    if (props.editSource) {
      untrack(() => {
        setValues(form, {
          content: props.editSource!.content || "",
        });
      });
    } else {
      untrack(() => {
        setValues(form, {
          content: undefined,
        });
      });
    }
  });
  async function onSubmit(result: ArticleForm) {
    setLoading(true);
    try {
      props.onDone({
        id: props.editSource?.id || 0,
        content: result.content,
        created_at: props.editSource?.created_at || DateTime.now(),
        updated_at: props.editSource?.updated_at || DateTime.now(),
        publisher_id: 0,
        access_policy: ArticleAccessPolicy.Game,
        draft: false,
        published: true,
        title: gameStore.current?.name || "",
        path: [],
        enable_comment: false,
        weight: 0,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
    setLoading(false);
  }
  return (
    <Form onSubmit={onSubmit} class="flex flex-col space-y-2 self-center w-full max-w-5xl flex-1">
      <Field name="content" validate={[required(t("game.form.introduction.required")!)]}>
        {(field) => (
          <Editor
            form={form}
            lineNumbers
            class="flex-1"
            lang="markdown"
            placeholder="MARKDOWN"
            title={t("game.form.introduction.label")}
            name="content"
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
        {t("general.actions.save.title")}
      </Button>
    </Form>
  );
}
