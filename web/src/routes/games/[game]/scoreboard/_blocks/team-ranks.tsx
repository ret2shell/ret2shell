import Spin from "@assets/animates/spin";
import { randomTips } from "@lib/utils/loading-tips";
import { type Team, TeamState } from "@models/team";
import { A } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import Pagination from "@widgets/pagination";
import Tag from "@widgets/tag";
import { DateTime } from "luxon";
import { createMemo, For, Match, Show, Switch } from "solid-js";

export default function TeamRanks(props: {
  teams: Team[];
  page: number;
  pageSize: number;
  total: number;
  showTime?: boolean;
  loading?: boolean;
  onPageChange?: (page: number) => void;
}) {
  function realIndex(index: number) {
    return index + (props.page - 1) * props.pageSize + 1;
  }
  const currentPeriod = createMemo(() => {
    return gameStore.current?.timeline_presets.find(
      (v) => v.start_at && v.end_at && v.start_at < DateTime.now() && v.end_at > DateTime.now()
    );
  });
  return (
    <>
      <ul class="flex-1 flex flex-col w-full max-w-5xl self-center">
        <Switch>
          <Match when={props.loading}>
            <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
              <Spin width={32} height={32} />
              <span>{randomTips()}</span>
            </div>
          </Match>
          <Match when={props.teams.length === 0}>
            <div class="flex-1 flex flex-col space-y-6 items-center justify-center opacity-60">
              <span class="icon-[fluent--data-trending-48-regular] w-12 h-12" />
              <span>{t("game.team.noTeamParticipated")}</span>
            </div>
          </Match>
        </Switch>
        <For each={props.teams}>
          {(team, index) => (
            <li class="h-12 flex flex-row items-center space-x-2 px-4 border-b border-b-layer-content/10">
              <span class="w-12 text-center">
                <Switch>
                  <Match when={realIndex(index()) === 1}>
                    <span class="icon-[fluent-emoji-flat--1st-place-medal] w-6 h-6" />
                  </Match>
                  <Match when={realIndex(index()) === 2}>
                    <span class="icon-[fluent-emoji-flat--2nd-place-medal] w-6 h-6" />
                  </Match>
                  <Match when={realIndex(index()) === 3}>
                    <span class="icon-[fluent-emoji-flat--3rd-place-medal] w-6 h-6" />
                  </Match>
                  <Match when={realIndex(index()) > 3}>
                    <span class="font-bold opacity-60">{realIndex(index()).toString().padStart(4, "0")}</span>
                  </Match>
                </Switch>
              </span>
              <A
                class="font-bold hover:underline flex-1 w-0 truncate"
                href={`/games/${gameStore.current?.id}/teams/${team.id}`}
              >
                {team.name}
              </A>
              <Show when={team.state === TeamState.Hidden}>
                <Tag class="truncate" level="warning">
                  <span>{t("game.team.state.hidden")}</span>
                </Tag>
              </Show>
              <Show when={props.showTime && team.institute_id}>
                <Tag class="truncate" level="info">
                  <span>{accountStore.institutes.find((v) => v.id === team.institute_id)?.name}</span>
                </Tag>
              </Show>
              <span class={`text-end ${currentPeriod() && props.showTime ? "w-48" : "w-20"}`}>
                <span>{team.score}</span>
                <span class="opacity-60">&nbsp;pts</span>
                <Show when={props.showTime && currentPeriod()}>
                  <span class="text-success">
                    &nbsp;+
                    {team.history
                      .filter((h) => h.changed_at > currentPeriod()!.start_at)
                      .reduce((a, b) => a + b.score, 0)}
                    &nbsp;pts
                  </span>
                </Show>
              </span>
              <Show when={props.showTime}>
                <span class="w-56 text-end font-bold opacity-40 hidden xl:inline-block">
                  <span>{team.last_active_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                </span>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Pagination
        class="pt-6"
        count={props.total}
        pageSize={props.pageSize}
        page={props.page}
        onPageChange={(e) => props.onPageChange?.(e.page)}
      />
    </>
  );
}
