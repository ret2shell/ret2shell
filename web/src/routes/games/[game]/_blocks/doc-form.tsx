import { handleHttpError, inflyClient } from "@api";
import { type GameDocType, useGameDoc } from "@api/game";
import { createForm } from "@modular-forms/solid";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Editor from "@widgets/editor";
import FormDraftReset from "@widgets/form-draft-reset";
import { createMemo, createSignal } from "solid-js";

type GameDocFormValues = {
  content: string;
};

function getDocTitle(docType: GameDocType) {
  switch (docType) {
    case "readme":
      return t("game.introduction.title");
    case "training":
      return t("training.title");
    case "rules":
      return t("game.rules.title");
  }
}

export default function GameDocForm(props: {
  gameId: number;
  docType: GameDocType;
  onDone: (content: string) => Promise<void>;
}) {
  const [loading, setLoading] = createSignal(false);
  const doc = useGameDoc({
    id: () => props.gameId,
    type: () => props.docType,
    enabled: () => props.gameId > 0,
  });
  const title = createMemo(() => getDocTitle(props.docType));
  const [form, { Form, Field }] = createForm<GameDocFormValues>({
    initialValues: {
      content: doc.data ?? "",
    },
  });
  const remoteValues = createMemo<GameDocFormValues>(() => ({
    content: doc.data ?? "",
  }));
  const draft = useFormDraft({
    form,
    key: () => buildFormDraftKey("games", props.gameId, "doc", props.docType),
    remoteValues,
    enabled: () => props.gameId > 0 && !doc.isLoading,
  });

  async function onSubmit(result: GameDocFormValues) {
    setLoading(true);
    try {
      await props.onDone(result.content);
      await inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "doc", props.docType],
      });
      draft.discardDraft();
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail"));
    }
    setLoading(false);
  }

  return (
    <Form onSubmit={onSubmit} class="flex flex-col space-y-2 self-center w-full max-w-5xl flex-1">
      <Field name="content">
        {(field) => (
          <Editor
            form={form}
            lineNumbers
            class="flex-1"
            lang="markdown"
            placeholder="MARKDOWN"
            title={title()}
            name="content"
            value={field.value ?? ""}
            error={field.error}
          />
        )}
      </Field>
      <div class="mt-4! flex flex-row space-x-2">
        <Button type="submit" level="primary" class="flex-1" loading={loading()} disabled={loading()}>
          {t("general.actions.save.title")}
        </Button>
        <FormDraftReset
          when={draft.hasDraft()}
          loading={loading()}
          disabled={loading()}
          onConfirm={draft.discardDraft}
        />
      </div>
    </Form>
  );
}
