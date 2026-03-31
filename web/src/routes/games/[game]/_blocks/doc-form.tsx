import { handleHttpError, inflyClient } from "@api";
import { type GameDocType, useGameDoc, useGameSyncStatus } from "@api/game";
import GameSyncReadonlyBanner from "@lib/blocks/game/sync-readonly-banner";
import { createForm, setValues } from "@modular-forms/solid";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Editor from "@widgets/editor";
import { createEffect, createMemo, createSignal, untrack } from "solid-js";

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
  const syncStatus = useGameSyncStatus({
    game_id: () => props.gameId,
    enabled: () => props.gameId > 0,
  });
  const title = createMemo(() => getDocTitle(props.docType));
  const [form, { Form, Field }] = createForm<GameDocFormValues>({
    initialValues: {
      content: doc.data ?? "",
    },
  });

  createEffect(() => {
    untrack(() => {
      setValues(form, {
        content: doc.data ?? "",
      });
    });
  });

  async function onSubmit(result: GameDocFormValues) {
    if (syncStatus.data?.readonly) {
      return;
    }
    setLoading(true);
    try {
      await props.onDone(result.content);
      await inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "doc", props.docType],
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail"));
    }
    setLoading(false);
  }

  return (
    <Form onSubmit={onSubmit} class="flex flex-col space-y-2 self-center w-full max-w-5xl flex-1">
      <GameSyncReadonlyBanner gameId={props.gameId} />
      <Field name="content">
        {(field) => (
          <Editor
            form={form}
            lineNumbers
            class="flex-1"
            lang="markdown"
            readonly={syncStatus.data?.readonly}
            placeholder="MARKDOWN"
            title={title()}
            name="content"
            value={field.value ?? ""}
            error={field.error}
          />
        )}
      </Field>
      <Button
        type="submit"
        level="primary"
        class="mt-4!"
        loading={loading()}
        disabled={loading() || syncStatus.data?.readonly}
      >
        {t("general.actions.save.title")}
      </Button>
    </Form>
  );
}
