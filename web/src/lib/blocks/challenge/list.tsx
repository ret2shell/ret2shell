import { useChallenges } from "@api/challenge";
import { useSelfSolves } from "@api/game";

import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import Tag from "@widgets/tag";
import TreeView from "@widgets/treeview";
import clsx from "clsx";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import type { ChallengeWidgetProps } from ".";

export default function ChallengeList(
  props: ChallengeWidgetProps & {
    showScore?: boolean;
    paginated?: boolean;
  }
) {
  const [search, setSearch] = createSignal("");
  const [hideSolved, setHideSolved] = createSignal(false);
  const [hideArchived, setHideArchived] = createSignal(false);

  const challenges = useChallenges({
    game_id: () => props.gameId,
  });
  const solves = useSelfSolves({
    game_id: () => props.gameId,
  });

  const challengesEx = createMemo(() => {
    const result = [];
    for (const challenge of challenges.data?.[0].filter(
      (c) =>
        c.name.toLowerCase().includes(search().toLowerCase()) ||
        !!c.tag.find((t) => t.name.toLowerCase().includes(search().toLowerCase()))
    ) ?? []) {
      const submission = solves.data?.find((s) => s.challenge_id === challenge.id);
      const solved = (!props.training && submission?.team_id) || !!submission;
      let llmStatus: "llm" | "human" | "unknown" = "unknown";
      if (solved && submission) {
        if (submission.is_llm_used === true) llmStatus = "llm";
        else if (submission.is_llm_used === false) llmStatus = "human";
      }
      result.push({
        challenge,
        solved,
        llmStatus,
      });
    }
    return result
      .filter((c) => !c.solved || !hideSolved())
      .filter((c) => !c.challenge.archive_at || !hideArchived() || c.challenge.archive_at > DateTime.now())
      .sort((a, b) => {
        if (a.challenge.score !== b.challenge.score) return a.challenge.score - b.challenge.score;
        return a.challenge.name < b.challenge.name ? -1 : 1;
      })
      .map((c) => ({
        id: c.challenge.id,
        name: c.challenge.name,
        type: "item" as const,
        searchValue: c.challenge.id.toString(),
        link: props.training
          ? `/training/${props.gameId}?challenge=${c.challenge.id}`
          : `/games/${props.gameId}/challenges?challenge=${c.challenge.id}`,
        extraClasses: c.solved
          ? c.llmStatus === "llm"
            ? "line-through opacity-60"
            : c.llmStatus === "human"
              ? "font-bold"
              : "opacity-60"
          : "",
        icon: c.challenge.hidden
          ? "icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning"
          : c.solved
            ? "icon-[fluent--checkmark-circle-20-regular] text-success"
            : "icon-[fluent--flag-20-regular]",
        extraPart: props.showScore ? (
          <span
            class={clsx(
              "opacity-60",
              c.challenge.archive_at && c.challenge.archive_at < DateTime.now() && "line-through"
            )}
          >
            {c.challenge.score} pts
          </span>
        ) : null,
        belowPart: (
          <div class="flex flex-wrap gap-1 mt-1">
            <For each={c.challenge.tag}>
              {(tag) => (
                <Tag level={tag.primary ? "success" : "info"}>
                  <span>{tag.name}</span>
                </Tag>
              )}
            </For>
          </div>
        ),
        children: [],
      }));
  });
  return (
    <div class="flex-1 overflow-hidden">
      <OverlayScrollbarsComponent
        options={{
          scrollbars: {
            theme: `os-theme-${fullTheme()}`,
            autoHide: "scroll",
          },
        }}
        class="relative w-full h-full print:h-auto print:overflow-auto"
        defer
      >
        <div class="flex flex-col space-y-2 p-3 lg:p-6">
          <div class="sticky top-3 lg:top-6 z-20 flex flex-col">
            <Input
              class="bg-layer"
              size="sm"
              icon={<span class="shrink-0 icon-[fluent--filter-20-regular] w-5 h-5" />}
              placeholder={t("challenge.search.placeholder")}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <Show when={!props.training}>
              <div class="flex flex-row space-x-1">
                <Button
                  class="my-1 bg-layer"
                  size="sm"
                  title={t("challenge.search.hideSolved")}
                  onClick={() => {
                    setHideSolved(!hideSolved());
                  }}
                >
                  <Show
                    when={hideSolved()}
                    fallback={<span class="shrink-0 icon-[fluent--eye-20-regular] w-5 h-5 text-success" />}
                  >
                    <span class="shrink-0 icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning" />
                  </Show>
                  <span>{t("challenge.search.solved")}</span>
                </Button>
                <Button
                  class="my-1 bg-layer"
                  size="sm"
                  title={t("challenge.search.hideArchived")}
                  onClick={() => {
                    setHideArchived(!hideArchived());
                  }}
                >
                  <Show
                    when={hideArchived()}
                    fallback={<span class="shrink-0 icon-[fluent--eye-20-regular] w-5 h-5 text-success" />}
                  >
                    <span class="shrink-0 icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning" />
                  </Show>
                  <span>{t("challenge.search.archived")}</span>
                </Button>
              </div>
            </Show>
          </div>
          <Switch
            fallback={
              <div class="flex flex-row items-center justify-center space-x-2 opacity-60 p-3">
                <span class="shrink-0 icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                <span>{t("challenge.empty")}</span>
              </div>
            }
          >
            <Match when={challenges.isLoading}>
              <div class="flex flex-row items-center justify-center p-3">
                <LoadingTips />
              </div>
            </Match>
            <Match when={challenges.data && challenges.data[0].length > 0}>
              <TreeView tree={challengesEx()} activeSearchParams="challenge" />
            </Match>
          </Switch>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
