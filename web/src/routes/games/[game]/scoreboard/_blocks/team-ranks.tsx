import Spin from "@assets/animates/spin";
import { randomTips } from "@lib/utils/loading-tips";
import { type Team, TeamState } from "@models/team";
import { createBreakpoints } from "@solid-primitives/media";
import { A } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { currentTimelinePeriod, gameStore } from "@storage/game";
import { breakpoints, t } from "@storage/theme";
import Pagination from "@widgets/pagination";
import Tag from "@widgets/tag";
import clsx from "clsx";
import { For, Match, Show, Switch } from "solid-js";

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
  function getScoreDiff(team: Team) {
    const len = team.history.length;
    if (len === 0) return 0;
    for (let i = len - 1; i >= 0; i--) {
      if (team.history[i].changed_at <= currentTimelinePeriod()!.start_at) {
        return team.score - team.history[i].score;
      }
    }
    return team.score;
  }
  const matches = createBreakpoints(breakpoints);
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
              <span>{t("team.empty")}</span>
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
                    <span class="font-bold opacity-60">{realIndex(index())}</span>
                  </Match>
                </Switch>
              </span>
              <div class="flex flex-col flex-1 w-0">
                <A class="font-bold hover:underline truncate" href={`/games/${gameStore.current?.id}/teams/${team.id}`}>
                  {team.name}
                </A>
                <Show when={team.tag}>
                  <span class="truncate text-xs opacity-60" title={team.tag ?? ""}>
                    {team.tag}
                  </span>
                </Show>
              </div>
              <span class={clsx("flex flex-row items-center space-x-2", props.showTime && "flex-1 w-0")}>
                <span class="flex-1" />
                <Show when={team.state === TeamState.Hidden}>
                  <Tag level="warning">
                    <span class="flex-1 truncate">{t("team.status.hidden.title")}</span>
                  </Tag>
                </Show>
                <Show when={props.showTime}>
                  <div class="flex-1 flex items-center justify-end">
                    <Show when={team.institute_id} fallback={<span>&nbsp;</span>}>
                      <span
                        class="opacity-80 text-primary truncate w-full"
                        title={accountStore.institutes.find((v) => v.id === team.institute_id)?.name}
                      >
                        #{accountStore.institutes.find((v) => v.id === team.institute_id)?.name}
                      </span>
                    </Show>
                  </div>
                </Show>
              </span>
              <span class={clsx("text-end", currentTimelinePeriod() && props.showTime ? "w-48" : "w-20")}>
                <span>{team.score}</span>
                <span class="opacity-60">&nbsp;pts</span>
                <Show when={props.showTime && currentTimelinePeriod()}>
                  <Show
                    when={getScoreDiff(team) >= 0}
                    fallback={<span class="text-error">&nbsp;{getScoreDiff(team)}&nbsp;pts</span>}
                  >
                    <span class="text-success">&nbsp;+{getScoreDiff(team)}&nbsp;pts</span>
                  </Show>
                </Show>
              </span>
              <Show when={props.showTime}>
                <span class="w-max ml-4 text-end font-bold opacity-40 hidden lg:inline-block">
                  <Switch fallback={team.last_active_at.toFormat("MM-dd HH:mm:ss")}>
                    <Match when={matches["2xl"]}>{team.last_active_at.toFormat("yyyy-MM-dd HH:mm:ss")}</Match>
                  </Switch>
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
