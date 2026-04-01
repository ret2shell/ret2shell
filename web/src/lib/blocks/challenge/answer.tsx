import { inflyClient } from "@api";
import { useChallengeAnswer, useUpdateChallengeAnswerMutation } from "@api/challenge";
import { useGame } from "@api/game";
import { createForm } from "@modular-forms/solid";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { isAdminOfGame } from "@storage/game";
import { t } from "@storage/theme";
import Article from "@widgets/article";
import Button from "@widgets/button";
import { EditorBare } from "@widgets/editor";
import FormDraftReset from "@widgets/form-draft-reset";
import LoadingTips from "@widgets/loading-tips";
import { createMemo, createSignal, Show, Suspense } from "solid-js";
import type { ChallengeWidgetProps } from ".";

type AnswerForm = {
  answer: string;
};

export default function (props: ChallengeWidgetProps) {
  const [inEdit, setInEdit] = createSignal(false);
  const game = useGame({ id: () => props.gameId });

  const answerQuery = useChallengeAnswer({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });

  const [form, { Form, Field }] = createForm<AnswerForm>({
    initialValues: {
      answer: answerQuery.data ?? "",
    },
  });
  const remoteValues = createMemo<AnswerForm>(() => ({
    answer: answerQuery.data ?? "",
  }));
  const draft = useFormDraft({
    form,
    key: () => buildFormDraftKey("games", props.gameId, "challenge", props.challengeId, "answer"),
    remoteValues,
    enabled: () => props.challengeId > 0 && !answerQuery.isLoading,
  });

  const updateAnswerMutation = useUpdateChallengeAnswerMutation({
    onSuccess: async () => {
      await answerQuery.refetch();
      draft.discardDraft();
      setInEdit(false);
      inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "challenge", props.challengeId],
      });
    },
  });

  function onSubmit(result: AnswerForm) {
    updateAnswerMutation.mutate({
      game_id: props.gameId,
      challenge_id: props.challengeId,
      answer: result.answer,
    });
  }

  return (
    <Form onSubmit={onSubmit} class="min-h-full flex-1 flex flex-col space-y-2 p-3 lg:p-6 items-center">
      <header class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2 font-bold w-full">
        <span class="shrink-0 icon-[fluent--book-20-regular] w-5 h-5" />
        <span class="flex-1 text-start">{t("challenge.answer.title")}</span>
        <Show when={isAdminOfGame(game.data)}>
          <Show
            when={!inEdit()}
            fallback={
              <>
                <Button
                  size="sm"
                  type="submit"
                  level="primary"
                  loading={updateAnswerMutation.isPending}
                  disabled={updateAnswerMutation.isPending}
                >
                  {t("general.actions.save.title")}
                </Button>
                <FormDraftReset
                  when={draft.hasDraft()}
                  size="sm"
                  loading={updateAnswerMutation.isPending}
                  disabled={updateAnswerMutation.isPending}
                  onConfirm={draft.discardDraft}
                />
              </>
            }
          >
            <Button
              size="sm"
              type="button"
              level="primary"
              onClick={() => {
                setInEdit(true);
              }}
            >
              {t("general.actions.edit.title")}
            </Button>
          </Show>
        </Show>
      </header>
      <Show
        when={!inEdit()}
        fallback={
          <Field name="answer">
            {(field) => (
              <EditorBare
                class="flex-1 w-full"
                form={form}
                name={field.name}
                value={field.value}
                error={field.error}
                lang="markdown"
                lineNumbers
              />
            )}
          </Field>
        }
      >
        <Suspense
          fallback={
            <article class="article max-w-5xl! w-full">
              <p>
                <LoadingTips />
              </p>
            </article>
          }
        >
          <Article content={answerQuery.data || ""} extra />
        </Suspense>
      </Show>
    </Form>
  );
}
