import { handleHttpError } from "@api";
import { updateChallenge } from "@api/game";
import type { Challenge } from "@models/challenge";
import { challengeStore, setChallengeStore } from "@storage/challenge";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import { DateTime } from "luxon";
import { createEffect, createSignal } from "solid-js";
import { type ChallengeForm, FormBare } from "./form";

export default function (props: {
  onStateChange?: (challenge?: Challenge) => void;
  inGame?: boolean;
}) {
  const [loading, setLoading] = createSignal(false);

  const [challengeSource, setChallengeSource] = createSignal<Challenge | null>(
    (challengeStore.current && { ...challengeStore.current }) ?? null
  );

  createEffect(() => {
    if (!challengeStore.current?.hidden) {
      setChallengeSource(challengeStore.current);
    }
  });

  async function handleUpdateChallenge(result: ChallengeForm) {
    setLoading(true);
    const tags = result.tag.split("/").map((t) => {
      return { name: t, primary: false };
    });
    tags[0].primary = true;

    const challenge: Challenge = {
      ...challengeStore.current,
      id: challengeStore.current!.id,
      name: result.name,
      updated_at: DateTime.now(),
      content: result.content,
      game_id: gameStore.current!.id,
      tag: tags,
      hidden: challengeStore.current?.hidden ?? false,
      score: challengeStore.current?.score ?? result.initial,
      bucket: challengeStore.current!.bucket!,
      score_rule: {
        initial: result.initial || 1,
        minimum: result.minimum || 1,
        decay: result.decay || 1,
      },
      release_at: result.release_at ? DateTime.fromSeconds(result.release_at) : null,
      archive_at: result.archive_at ? DateTime.fromSeconds(result.archive_at) : null,
    };
    try {
      const result = await updateChallenge(gameStore.current!.id, challenge);
      props.onStateChange?.(result);
      setChallengeStore({ current: result });
      setChallengeSource(result);
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
    <div class="flex flex-col p-3 lg:p-6 w-full items-center">
      <header class="min-h-12 w-full max-w-5xl border-b border-b-layer-content/10 flex flex-row flex-wrap justify-end space-x-2 items-center gap-y-2 py-2 mb-2">
        <span class="flex flex-row space-x-2 items-center overflow-hidden">
          <span class="icon-[fluent--settings-20-regular] w-5 h-5 shrink-0" />
          <span class="font-bold inline-block whitespace-nowrap">{t("general.actions.edit.title")}</span>
        </span>
        <span class="flex-1" />
        <span class="flex flex-row justify-end items-center flex-wrap gap-y-2 gap-x-2">
          <Button
            size="sm"
            square
            onClick={() => setChallengeSource((challengeStore.current && { ...challengeStore.current }) ?? null)}
          >
            <span class="icon-[fluent--arrow-reset-20-regular] w-5 h-5" />
          </Button>
        </span>
      </header>
      <FormBare
        onDone={handleUpdateChallenge}
        editSource={challengeSource() || undefined}
        inGame={props.inGame}
        loading={loading()}
      />
    </div>
  );
}
