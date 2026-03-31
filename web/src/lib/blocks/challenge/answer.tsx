import { inflyClient } from "@api";
import { useChallengeAnswer, useUpdateChallengeAnswerMutation } from "@api/challenge";
import { useGame, useGameSyncStatus } from "@api/game";
import GameSyncReadonlyBanner from "@lib/blocks/game/sync-readonly-banner";
import { isAdminOfGame } from "@storage/game";
import { t } from "@storage/theme";
import Article from "@widgets/article";
import Button from "@widgets/button";
import { EditorBare } from "@widgets/editor";
import LoadingTips from "@widgets/loading-tips";
import { createSignal, Show, Suspense } from "solid-js";
import type { ChallengeWidgetProps } from ".";

export default function (props: ChallengeWidgetProps) {
  const [answer, setAnswer] = createSignal("");
  const [inEdit, setInEdit] = createSignal(false);
  const game = useGame({ id: () => props.gameId });
  const syncStatus = useGameSyncStatus({
    game_id: () => props.gameId,
    enabled: () => props.gameId > 0 && isAdminOfGame(game.data),
  });

  const answerQuery = useChallengeAnswer({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });

  const updateAnswerMutation = useUpdateChallengeAnswerMutation({
    onSuccess: () => {
      setInEdit(false);
      answerQuery.refetch();
      inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "challenge", props.challengeId],
      });
    },
  });

  return (
    <div class="min-h-full flex-1 flex flex-col space-y-2 p-3 lg:p-6 items-center">
      <header class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2 font-bold w-full">
        <span class="shrink-0 icon-[fluent--book-20-regular] w-5 h-5" />
        <span class="flex-1 text-start">{t("challenge.answer.title")}</span>
        <Show when={isAdminOfGame(game.data)}>
          <Show
            when={!inEdit()}
            fallback={
              <Button
                size="sm"
                level="primary"
                onClick={() => {
                  if (syncStatus.data?.readonly) {
                    return;
                  }
                  updateAnswerMutation.mutate({
                    game_id: props.gameId,
                    challenge_id: props.challengeId,
                    answer: answer(),
                  });
                }}
                loading={updateAnswerMutation.isPending}
                disabled={updateAnswerMutation.isPending || syncStatus.data?.readonly}
              >
                {t("general.actions.save.title")}
              </Button>
            }
          >
            <Button
              size="sm"
              level="primary"
              onClick={() => {
                if (!syncStatus.data?.readonly) setInEdit(true);
              }}
              disabled={syncStatus.data?.readonly}
            >
              {t("general.actions.edit.title")}
            </Button>
          </Show>
        </Show>
      </header>
      <Show when={isAdminOfGame(game.data)}>
        <div class="w-full">
          <GameSyncReadonlyBanner gameId={props.gameId} />
        </div>
      </Show>
      <Show
        when={!inEdit()}
        fallback={
          <div class="flex-1 w-full flex flex-col space-y-2">
            <EditorBare
              class="flex-1 w-full"
              value={answerQuery.data}
              lang="markdown"
              lineNumbers
              readonly={syncStatus.data?.readonly}
              onValueChanged={(v) => setAnswer(v)}
            />
          </div>
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
    </div>
  );
}
