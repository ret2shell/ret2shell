import { Challenge } from '@/lib/models/challenge'
import { Team } from '@/lib/models/team'
import { gameStore } from '@/lib/storage/game'
import { t } from '@/lib/storage/theme'
import Progress from '@/lib/widgets/progress'
import { For, Match, Switch } from 'solid-js'

function TeamDetail(props: { team: Team; challenges: Challenge[]; index: number }) {
  const solvedChallenges = () => props.team.history.filter(h => !!h.challenge_id).length
  const totalChallenges = () => props.challenges.length
  return (
    <>
      <div class="flex flex-row border-b border-b-layer-content/10">
        <div class="w-24 h-24 flex items-center justify-center">
          <Switch>
            <Match when={props.index === 1}>
              <span class="icon-[fluent-emoji-flat--1st-place-medal] w-12 h-12"></span>
            </Match>
            <Match when={props.index === 2}>
              <span class="icon-[fluent-emoji-flat--2nd-place-medal] w-12 h-12"></span>
            </Match>
            <Match when={props.index === 3}>
              <span class="icon-[fluent-emoji-flat--3rd-place-medal] w-12 h-12"></span>
            </Match>
          </Switch>
        </div>
        <div class="flex-1 flex flex-col justify-center">
          <h2 class="text-xl font-bold flex flex-row">
            <a class="hover:underline flex-1" href={`/games/${gameStore.current?.id}/teams/${props.team.id}`}>
              {props.team.name}
            </a>
            <span>
              <span class="text-primary">{props.team.score}</span>&nbsp;<span class="opacity-60">pts</span>
            </span>
          </h2>
          <div class="pt-2 flex flex-row items-center space-x-4">
            <Progress class="flex-1" max={1} min={0} value={solvedChallenges() / (totalChallenges() || 1)} static />
            <span>
              {solvedChallenges()} / {totalChallenges()} {t('game.challenge.solved')}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

export default function TeamDetails(props: { topTeams: Team[]; challenges: Challenge[] }) {
  return (
    <>
      <ul class="xl:flex flex-col space-y-2 w-full max-w-5xl self-center py-6 hidden">
        <For each={props.topTeams}>
          {(team, index) => <TeamDetail team={team} challenges={props.challenges} index={index() + 1} />}
        </For>
      </ul>
    </>
  )
}
