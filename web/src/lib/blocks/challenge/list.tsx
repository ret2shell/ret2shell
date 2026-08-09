import { useChallenges } from "@api/challenge";
import { useSelfSolves } from "@api/game";
import type { Challenge } from "@models/challenge";
import { useSearchParams } from "@solidjs/router";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import TreeView, { type TreeNode } from "@widgets/treeview";
import clsx from "clsx";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createMemo, createSignal, Match, Show, Switch } from "solid-js";
import type { ChallengeWidgetProps } from ".";

const getDifficulty = (tags: string[]): [string, number] => {
  const difficulty = [
    ["signin", "签到"],
    ["easy", "简单"],
    ["medium", "中等"],
    ["hard", "困难"],
    ["extreme", "地狱"],
  ];
  let i = 0;
  while (i < difficulty.length) {
    const difficultyName = tags.find((t) => difficulty[i].includes(t.toLowerCase()));
    if (difficultyName) return [difficultyName, i];
    i++;
  }
  return ["", i];
};

function ChallengeExtraPart(props: { challenge: Challenge; showScore?: boolean }) {
  const difficultyTag = createMemo(() => {
    const [difficultyName, _] = getDifficulty(props.challenge.tag.map((t) => t.name));
    return difficultyName;
  });
  return (
    <>
      <Show when={props.showScore}>
        <span
          class={clsx(
            "opacity-60",
            props.challenge.archive_at && props.challenge.archive_at < DateTime.now() && "line-through"
          )}
        >
          {props.challenge.score} pts
        </span>
      </Show>
      <Show when={difficultyTag()}>
        <span class="inline-block rounded-lg bg-layer-content/10 backdrop-blur px-1.75 py-0.75 align-middle text-[.85rem]">
          <span>{difficultyTag()}</span>
        </span>
      </Show>
    </>
  );
}

function sortChallengeFunction(
  a: {
    challenge: Challenge;
    solved: number | boolean;
  },
  b: {
    challenge: Challenge;
    solved: number | boolean;
  }
) {
  if (a.challenge.score !== b.challenge.score) return a.challenge.score - b.challenge.score;
  const aDifficulty = getDifficulty(a.challenge.tag.map((t) => t.name))[1];
  const bDifficulty = getDifficulty(b.challenge.tag.map((t) => t.name))[1];
  if (aDifficulty !== bDifficulty) return aDifficulty - bDifficulty;
  if (a.challenge.name !== b.challenge.name) return a.challenge.name.localeCompare(b.challenge.name);
  return a.challenge.id < b.challenge.id ? -1 : 1;
}

export default function ChallengeList(
  props: ChallengeWidgetProps & {
    showScore?: boolean;
    paginated?: boolean;
  }
) {
  const [searchParams, _] = useSearchParams();
  const selectedChallengeId = createMemo(() => {
    return Number.parseInt((searchParams.challenge as string) || "", 10) ?? null;
  });
  const [search, setSearch] = createSignal("");
  const [hideSolved, setHideSolved] = createSignal(false);
  const [hideArchived, setHideArchived] = createSignal(false);

  const challenges = useChallenges({
    game_id: () => props.gameId,
  });
  const solves = useSelfSolves({
    game_id: () => props.gameId,
  });

  const selectedChallenge = createMemo(() => challenges.data?.[0].find((c) => c.id === selectedChallengeId()));
  const challengesEx = createMemo(() => {
    const result = [];
    for (const challenge of challenges.data?.[0].filter(
      (c) =>
        c.name.toLowerCase().includes(search().toLowerCase()) ||
        !!c.tag.find((t) => t.name.toLowerCase().includes(search().toLowerCase()))
    ) ?? []) {
      const submission = solves.data?.find((s) => s.challenge_id === challenge.id);
      result.push({
        challenge,
        solved: (!props.training && submission?.team_id) || !!submission,
      });
    }
    const tree = [] as TreeNode[];
    const tags = new Set(
      challenges.data?.[0].flatMap((c) => c.tag.find((t) => t.primary)?.name || t("challenge.tag.unknown"))
    );
    const tagsArray = Array.from(tags).sort((a, b) => a.localeCompare(b));
    for (const tag of tagsArray) {
      const taggedChallenges = result
        .filter((c) => c.challenge.tag.find((t) => t.primary)?.name === tag)
        .filter((c) => !c.solved || !hideSolved())
        .filter((c) => !c.challenge.archive_at || !hideArchived() || c.challenge.archive_at > DateTime.now())
        .sort(sortChallengeFunction);
      if (taggedChallenges.length === 0) continue;
      tree.push({
        id: tag,
        name: tag,
        type: "category",
        icon: "icon-[fluent--tag-20-regular] w-5 h-5",
        children: taggedChallenges.map((c) => ({
          id: c.challenge.id,
          name: c.challenge.name,
          type: "item",
          searchValue: c.challenge.id.toString(),
          link: props.training
            ? `/training/${props.gameId}?challenge=${c.challenge.id}`
            : `/games/${props.gameId}/challenges?challenge=${c.challenge.id}`,
          extraClasses: c.solved ? "opacity-60" : "",
          icon: c.challenge.hidden
            ? "icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning"
            : c.solved
              ? "icon-[fluent--checkmark-circle-20-regular] text-success"
              : "icon-[fluent--flag-20-regular]",
          extraPart: <ChallengeExtraPart challenge={c.challenge} showScore={props.showScore} />,
          children: [],
        })),
      });
    }
    return tree;
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
              <TreeView
                tree={challengesEx()}
                activeSearchParams="challenge"
                highlightPaths={
                  selectedChallengeId()
                    ? [
                        selectedChallenge()?.tag.find((t) => t.primary)?.name || t("challenge.tag.unknown"),
                        selectedChallengeId().toString(),
                      ]
                    : undefined
                }
              />
            </Match>
          </Switch>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
