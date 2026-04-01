import { useGame, useUpdateGameMutation } from "@api/game";
import type { ArchivePolicy } from "@models/game";
import { createForm } from "@modular-forms/solid";
import { useParams } from "@solidjs/router";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import FormDraftReset from "@widgets/form-draft-reset";
import { createMemo } from "solid-js";

export function PoliciesEdit(props: {
  onDone: (result: ArchivePolicy) => Promise<void>;
  editSource?: ArchivePolicy;
  draftKey?: string;
  loading?: boolean;
}) {
  const [form, { Form, Field }] = createForm<ArchivePolicy>({
    initialValues: {
      challenge: {
        show_answer: !!props.editSource?.challenge.show_answer,
        show_hints: !!props.editSource?.challenge.show_hints,
      },
    },
  });
  const remoteValues = createMemo<ArchivePolicy>(() => ({
    challenge: {
      show_answer: !!props.editSource?.challenge.show_answer,
      show_hints: !!props.editSource?.challenge.show_hints,
    },
  }));
  const draft = useFormDraft({
    form,
    key: () => props.draftKey,
    remoteValues,
    enabled: () => !!props.editSource,
  });

  async function onSubmit(result: ArchivePolicy) {
    await props.onDone(result);
    draft.discardDraft();
  }

  return (
    <Form onSubmit={onSubmit} class="flex flex-col w-full max-w-5xl space-y-2 relative">
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
        <span>{t("game.policies.title")}</span>
      </h3>
      <div class="grid grid-cols-fit-xs max-w-full gap-2">
        <Field name="challenge.show_answer" type="boolean">
          {(field, props) => (
            <Checkbox
              title={t("game.policies.form.challenge.showAnswer.label")}
              inputProps={props}
              checked={field.value}
              error={field.error}
            >
              <span class="flex-1 text-start truncate">{t("game.policies.form.challenge.showAnswer.label")}</span>
            </Checkbox>
          )}
        </Field>
        <Field name="challenge.show_hints" type="boolean">
          {(field, props) => (
            <Checkbox
              title={t("game.policies.form.challenge.showHints.label")}
              inputProps={props}
              checked={field.value}
              error={field.error}
            >
              <span class="flex-1 text-start truncate">{t("game.policies.form.challenge.showHints.label")}</span>
            </Checkbox>
          )}
        </Field>
      </div>

      <div class="mt-4! flex flex-row space-x-2">
        <Button type="submit" level="primary" class="flex-1" loading={props.loading} disabled={props.loading}>
          {t("general.actions.save.title")}
        </Button>
        <FormDraftReset
          when={draft.hasDraft()}
          loading={props.loading}
          disabled={props.loading}
          onConfirm={draft.discardDraft}
        />
      </div>
    </Form>
  );
}

export default function () {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });

  const updateMutation = useUpdateGameMutation();

  async function onSubmit(result: ArchivePolicy) {
    if (!game.data) return;
    await updateMutation.mutateAsync({
      id: game.data.id,
      game: {
        ...game.data,
        archive_policy: result,
      },
    });
    await game.refetch();
  }
  return (
    <>
      <Title page={t("game.policies.title")} route={`/games/${gameId()}/admin/policies`} />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <PoliciesEdit
          onDone={onSubmit}
          editSource={game.data?.archive_policy}
          draftKey={buildFormDraftKey("games", gameId(), "admin", "policies")}
          loading={updateMutation.isPending}
        />
      </div>
    </>
  );
}
