import { useChallenge, useUpdateChallengeMutation } from "@api/challenge";
import type { Challenge } from "@models/challenge";
import { t } from "@storage/theme";
import { DateTime } from "luxon";
import { createEffect, createSignal } from "solid-js";
import type { ChallengeWidgetProps } from ".";
import { type ChallengeForm, FormBare } from "./form";
import UnlockLimitSlider from "./unlock-limit-slider";

export default function (props: ChallengeWidgetProps) {
  const challenge = useChallenge({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });

  const updateChallengeMutation = useUpdateChallengeMutation();

  const [unlockLimit, setUnlockLimit] = createSignal(0);
  createEffect(() => setUnlockLimit(challenge.data?.unlock_limit ?? 0));

  async function handleUpdateChallenge(result: ChallengeForm) {
    const tags = result.tag.split("/").map((t) => {
      return { name: t, primary: false };
    });
    tags[0].primary = true;

    const data: Challenge = {
      ...challenge.data,
      id: challenge.data!.id,
      name: result.name,
      updated_at: DateTime.now(),
      content: result.content,
      game_id: props.gameId,
      tag: tags,
      hidden: challenge.data?.hidden ?? false,
      score: challenge.data?.score ?? result.initial,
      bucket: challenge.data!.bucket,
      score_rule: {
        initial: result.initial ?? challenge.data?.score_rule.initial ?? 0,
        minimum: result.minimum ?? challenge.data?.score_rule.minimum ?? 0,
        decay: result.decay ?? challenge.data?.score_rule.decay ?? 0,
      },
      release_at: result.release_at ? DateTime.fromSeconds(result.release_at) : null,
      archive_at: result.archive_at ? DateTime.fromSeconds(result.archive_at) : null,
      prerequisites: challenge.data?.prerequisites ?? [],
      unlock_limit: unlockLimit(),
      avatar: challenge.data?.avatar ?? null,
    };
    await updateChallengeMutation.mutateAsync({ game_id: props.gameId, challenge: data });
  }
  return (
    <div class="flex flex-col p-3 lg:p-6 w-full items-center">
      <header class="min-h-12 w-full max-w-5xl border-b border-b-layer-content/10 flex flex-row flex-wrap justify-end space-x-2 items-center gap-y-2 py-2 mb-2">
        <span class="flex flex-row space-x-2 items-center overflow-hidden">
          <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
          <span class="font-bold inline-block whitespace-nowrap">{t("general.actions.edit.title")}</span>
        </span>
        <span class="flex-1" />
      </header>
      <FormBare
        onDone={handleUpdateChallenge}
        training={props.training}
        gameId={props.gameId}
        challengeId={props.challengeId}
      />
      <div class="w-full max-w-5xl mb-4">
        <UnlockLimitSlider
          total={challenge.data?.prerequisites.length ?? 0}
          value={unlockLimit()}
          onChange={setUnlockLimit}
        />
      </div>
    </div>
  );
}
