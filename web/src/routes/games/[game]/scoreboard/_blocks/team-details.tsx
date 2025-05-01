import type { Challenge } from "@models/challenge";
import type { Team } from "@models/team";
import { A } from "@solidjs/router";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import Progress from "@widgets/progress";
import { For, Match, Switch } from "solid-js";

function TeamDetail(props: {
  team: Team;
  challenges: Challenge[];
  index: number;
}) {
  const solvedChallenges = () => props.team.history.filter((h) => !!h.challenge_id).length;
  const totalChallenges = () => props.challenges.length;
  return (
    <div class="flex flex-row border-b border-b-layer-content/10 py-2">
      <div class="w-16 h-16 flex items-center justify-center">
        <Switch>
          <Match when={props.index === 1}>
            <span class="icon-[fluent-emoji-flat--1st-place-medal] w-8 h-8" />
          </Match>
          <Match when={props.index === 2}>
            <span class="icon-[fluent-emoji-flat--2nd-place-medal] w-8 h-8" />
          </Match>
          <Match when={props.index === 3}>
            <span class="icon-[fluent-emoji-flat--3rd-place-medal] w-8 h-8" />
          </Match>
        </Switch>
      </div>
      <div class="flex-1 flex flex-col justify-center space-y-1">
        <h2 class="font-bold flex flex-row text-lg">
          <A class="hover:underline flex-1" href={`/games/${gameStore.current?.id}/teams/${props.team.id}`}>
            {props.team.name}
          </A>
          <span>
            <span class="text-primary">{props.team.score}</span>&nbsp;
            <span class="opacity-60">pts</span>
          </span>
        </h2>
        <div class="flex flex-row items-center space-x-4">
          <Progress class="flex-1" max={1} min={0} value={solvedChallenges() / (totalChallenges() || 1)} static />
          <span>
            {solvedChallenges()} / {totalChallenges()} {t("challenge.status.solved.title")}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TeamDetails(props: {
  topTeams: Team[];
  challenges: Challenge[];
}) {
  return (
    <ul class="lg:flex flex-col space-y-2 w-full max-w-5xl self-center py-6 hidden">
      <For each={props.topTeams}>
        {(team, index) => <TeamDetail team={team} challenges={props.challenges} index={index() + 1} />}
      </For>
    </ul>
  );
}
