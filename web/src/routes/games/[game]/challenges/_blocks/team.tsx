import { challengeStore } from "@storage/challenge";
import { gameStore, isGameAdmin } from "@storage/game";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Progress from "@widgets/progress";
import { createMemo, Match, Switch } from "solid-js";
import { DateTime } from "luxon";

export default function () {
  const solvedChallenges = createMemo(() => gameStore.team?.history.filter((h) => !!h.challenge_id).length);
  const totalChallenges = createMemo(() => challengeStore.challenges.length);
  return (
    <div class="border-b border-b-layer-content/10 px-2 h-16 shrink-0 flex items-center justify-center relative">
      <Switch>
        <Match when={isGameAdmin()}>
          <Button ghost disabled class="w-full" justify="start">
            <span class="icon-[fluent--person-settings-20-filled] w-5 h-5 text-error" />
            <span>{t("game.adminMode")}</span>
          </Button>
        </Match>
        <Match when={gameStore.team}>
          <Button ghost class="w-full" justify="start">
            <span class="icon-[fluent--flag-20-regular] w-5 h-5 text-primary" />
            <span class="flex-1 text-start truncate">{gameStore.team?.name}</span>
            <span class="text-success">{gameStore.team?.score} pts</span>
            <span class="text-warning">#{gameStore.rank}</span>
          </Button>
          <Progress
            class="absolute bottom-2 left-4 right-4"
            max={1}
            min={0}
            value={(solvedChallenges() ?? 0) / (totalChallenges() || 1)}
            static
          />
        </Match>
        <Match when={gameStore.current?.archive_at && gameStore.current.archive_at < DateTime.now()}>
          <Button ghost disabled class="w-full" justify="start">
            <span class="icon-[fluent--flag-20-regular] w-5 h-5 text-primary" />
            <span>{t("game.ended")}</span>
          </Button>
        </Match>
        <Match when={true}>
          <Button ghost disabled class="w-full" justify="start">
            <span class="icon-[fluent--flag-20-regular] w-5 h-5 text-primary" />
            <span>{t("game.canNotParticipate")}</span>
          </Button>
        </Match>
      </Switch>
    </div>
  );
}
