import { handleHttpError } from "@api";
import { getChallengeAnswer, updateChallengeAnswer } from "@api/game";
import type { Challenge } from "@models/challenge";
import { challengeStore } from "@storage/challenge";
import { isGameAdmin } from "@storage/game";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Article from "@widgets/article";
import Button from "@widgets/button";
import { EditorBare } from "@widgets/editor";
import LoadingTips from "@widgets/loading-tips";
import { createEffect, createSignal, Show, untrack } from "solid-js";

export default function (props: {
  onStateChange?: (challenge?: Challenge) => void;
  inGame?: boolean;
}) {
  const [answer, setAnswer] = createSignal<string>("");
  const [loading, setLoading] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [inEdit, setInEdit] = createSignal(false);

  createEffect(() => {
    if (challengeStore.current) {
      untrack(async () => {
        setLoading(true);
        try {
          const data = await getChallengeAnswer(challengeStore.current!.game_id, challengeStore.current!.id);
          setAnswer(data);
        } catch (err) {
          handleHttpError(err as Error, t("game.challenge.fetchFailed")!);
        }
        setLoading(false);
      });
    }
  });
  async function handleUpdateAnswer() {
    setSubmitting(true);
    try {
      await updateChallengeAnswer(challengeStore.current!.game_id, challengeStore.current!.id, answer());
      addToast({
        level: "success",
        description: t("form.saveSuccess")!,
        duration: 5000,
      });
      setInEdit(false);
      if (props.onStateChange) props.onStateChange();
    } catch (err) {
      handleHttpError(err as Error, t("form.saveFailed")!);
    }
    setSubmitting(false);
  }

  return (
    <div class="min-h-full flex-1 flex flex-col space-y-2 p-3 lg:p-6 items-center">
      <header class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2 font-bold w-full">
        <span class="icon-[fluent--book-20-regular] w-5 h-5 shrink-0" />
        <span class="flex-1 text-start">{t("game.challenge.answer")}</span>
        <Show when={isGameAdmin()}>
          <Show
            when={!inEdit()}
            fallback={
              <Button
                size="sm"
                level="primary"
                onClick={handleUpdateAnswer}
                loading={submitting()}
                disabled={submitting()}
              >
                {t("form.save")}
              </Button>
            }
          >
            <Button
              size="sm"
              level="primary"
              onClick={() => {
                setInEdit(true);
              }}
            >
              {t("form.edit")}
            </Button>
          </Show>
        </Show>
      </header>
      <Show
        when={!inEdit()}
        fallback={
          <EditorBare
            class="flex-1 w-full"
            value={answer()}
            lang="markdown"
            lineNumbers
            onValueChanged={(v) => setAnswer(v)}
          />
        }
      >
        <Show
          when={!loading()}
          fallback={
            <article class="article !max-w-5xl w-full">
              <p>
                <LoadingTips />
              </p>
            </article>
          }
        >
          <Article content={answer()} extra />
        </Show>
      </Show>
    </div>
  );
}
