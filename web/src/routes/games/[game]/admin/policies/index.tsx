import { handleHttpError } from "@api";
import { updateGame } from "@api/game";
import type { ArchivePolicy } from "@models/game";
import { createForm, setValues } from "@modular-forms/solid";
import { gameStore, setGameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import { createEffect, createSignal, untrack } from "solid-js";

export function PoliciesEdit(props: {
  onDone: (result: ArchivePolicy) => void;
  editSource?: ArchivePolicy;
  loading?: boolean;
}) {
  const [form, { Form, Field }] = createForm<ArchivePolicy>();
  createEffect(() => {
    if (props.editSource) {
      untrack(() => {
        setValues(form, {
          challenge: {
            show_answer: props.editSource!.challenge.show_answer,
            show_hints: props.editSource!.challenge.show_hints,
          },
        });
      });
    }
  });
  return (
    <Form onSubmit={props.onDone} class="flex flex-col w-full max-w-5xl space-y-2 relative">
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
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

      <Button type="submit" level="primary" class="!mt-4" loading={props.loading} disabled={props.loading}>
        {t("general.actions.save.title")}
      </Button>
    </Form>
  );
}

export default function () {
  const [loading, setLoading] = createSignal(false);
  async function onSubmit(result: ArchivePolicy) {
    console.log(result);
    setLoading(true);
    try {
      const game = await updateGame(gameStore.current!.id, {
        ...gameStore.current!,
        archive_policy: result,
      });
      setGameStore({ current: game });
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
    setLoading(false);
  }
  return (
    <>
      <Title page={t("game.policies.title")} route={`/games/${gameStore.current?.id}/admin/polocies`} />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <PoliciesEdit onDone={onSubmit} editSource={gameStore.current?.archive_policy} loading={loading()} />
      </div>
    </>
  );
}
