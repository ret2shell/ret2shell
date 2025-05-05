import LogoAnimate from "@assets/animates/logo-animate";
import { mediaPath } from "@lib/utils/media";
import type { Challenge } from "@models/challenge";
import type { Team } from "@models/team";
import { gameStore } from "@storage/game";
import { For, Match, Show, Switch, createMemo } from "solid-js";

export default function TeamSolves(props: {
  teams: Team[];
  challenges: Challenge[];
}) {
  const tags = createMemo(() => {
    const tags = new Set(
      props.challenges.filter((c) => c.hidden === false).flatMap((c) => c.tag.find((t) => t.primary)?.name ?? "UNKNOWN")
    );
    return Array.from(tags);
  });
  const challengeMap = createMemo(() => {
    const map = new Map<string, Challenge[]>();
    for (const tag of tags()) {
      const taggedChallenges = props.challenges
        .filter((c) => c.hidden === false)
        .filter((c) => c.tag.find((t) => t.primary)?.name === tag)
        .sort((a, b) => {
          if (a.score !== b.score) return a.score - b.score;
          return a.updated_at < b.updated_at ? -1 : 1;
        });
      if (taggedChallenges.length === 0) continue;
      map.set(tag, taggedChallenges);
    }
    return map;
  });
  return (
    <>
      <header class="border-b border-b-layer-content/10 flex flex-col">
        <div class="flex flex-row items-center self-end space-x-6 h-24 sticky right-3 lg:right-6">
          <Show when={gameStore.current?.logo} fallback={<LogoAnimate width={80} height={80} />}>
            <img class="shrink-0" src={mediaPath(gameStore.current!.logo!)} width={80} height={80} alt="Logo Broken" />
          </Show>
          <h1 class="text-3xl font-bold">{gameStore.current?.name}</h1>
        </div>
        <div class="h-2" />
        <div class="h-12 flex flex-row border-b border-b-layer-content/10">
          <For each={tags()}>
            {(tag) => (
              <div
                class="flex items-center justify-center border-r border-r-layer-content/10"
                style={`width: ${challengeMap().get(tag)!.length * 6}rem`}
              >
                <span class="font-bold text-center">{tag}</span>
              </div>
            )}
          </For>
        </div>
        <div class="h-12">
          <div class="flex flex-row">
            <For each={tags()}>
              {(tag) => (
                <For each={challengeMap().get(tag)!}>
                  {(challenge) => (
                    <div class="h-12 w-24 flex items-center justify-center" title={challenge.name}>
                      <span class="font-bold text-center truncate px-1">{challenge.name}</span>
                    </div>
                  )}
                </For>
              )}
            </For>
          </div>
        </div>
      </header>
      <For each={props.teams}>
        {(team) => (
          <div class="h-12 flex flex-row border-b border-b-layer-content/10">
            <For each={tags()}>
              {(tag) => (
                <For each={challengeMap().get(tag)!}>
                  {(challenge) => (
                    <div
                      class="h-12 w-24 flex items-center justify-center"
                      title={team.history
                        .find((h) => h.challenge_id === challenge.id)
                        ?.changed_at.toFormat("yyyy-MM-dd HH:mm:ss")}
                    >
                      <Switch>
                        <Match when={team.history.find((h) => h.challenge_id === challenge.id)?.blood_state === 1}>
                          <span class="icon-[fluent--number-circle-1-20-filled] w-5 h-5 text-yellow-500 -z-10" />
                        </Match>
                        <Match when={team.history.find((h) => h.challenge_id === challenge.id)?.blood_state === 2}>
                          <span class="icon-[fluent--number-circle-2-20-filled] w-5 h-5 text-gray-500 -z-10" />
                        </Match>
                        <Match when={team.history.find((h) => h.challenge_id === challenge.id)?.blood_state === 3}>
                          <span class="icon-[fluent--number-circle-3-20-filled] w-5 h-5 text-orange-500 -z-10" />
                        </Match>
                        <Match when={team.history.find((h) => h.challenge_id === challenge.id)}>
                          <span class="icon-[fluent--flag-20-filled] w-5 h-5 text-success -z-10" />
                        </Match>
                      </Switch>
                    </div>
                  )}
                </For>
              )}
            </For>
          </div>
        )}
      </For>
    </>
  );
}
