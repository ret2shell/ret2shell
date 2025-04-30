import { useSearchParams } from "@solidjs/router";
import { challengeStore, refreshChallenges, refreshSolves } from "@storage/challenge";
import { gameStore } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import TreeView, { type TreeNode } from "@widgets/treeview";
import clsx from "clsx";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { Match, Show, Switch, createEffect, createMemo, createSignal, untrack } from "solid-js";

export default function ChallengeList(props: {
  showScore?: boolean;
  paginated?: boolean;
  inGame?: boolean;
}) {
  const [searchParams, _] = useSearchParams();
  const selectedChallengeId = createMemo(() => {
    return Number.parseInt((searchParams.challenge as string) || "") ?? null;
  });
  const [loading, setLoading] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [hideSolved, setHideSolved] = createSignal(false);
  const [hideArchived, setHideArchived] = createSignal(false);
  const selectedChallenge = createMemo(() => challengeStore.challenges.find((c) => c.id === selectedChallengeId()));
  const challengesEx = createMemo(() => {
    const result = [];
    for (const challenge of challengeStore.challenges.filter(
      (c) =>
        c.name.toLowerCase().includes(search().toLowerCase()) ||
        !!c.tag.find((t) => t.name.toLowerCase().includes(search().toLowerCase()))
    )) {
      const submission = challengeStore.solves.find((s) => s.challenge_id === challenge.id);
      result.push({
        challenge,
        solved: (props.inGame && submission?.team_id) || !!submission,
      });
    }
    const tree = [] as TreeNode[];
    const tags = new Set(
      challengeStore.challenges.flatMap((c) => c.tag.find((t) => t.primary)?.name || t("challenge.tag.unknown")!)
    );
    const tagsArray = Array.from(tags).sort((a, b) => a.localeCompare(b));
    for (const tag of tagsArray) {
      const taggedChallenges = result
        .filter((c) => c.challenge.tag.find((t) => t.primary)?.name === tag)
        .filter((c) => !c.solved || !hideSolved())
        .filter((c) => !c.challenge.archive_at || !hideArchived() || c.challenge.archive_at > DateTime.now())
        .sort((a, b) => {
          if (a.challenge.score !== b.challenge.score) return a.challenge.score - b.challenge.score;
          return a.challenge.name < b.challenge.name ? -1 : 1;
        });
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
          link: props.inGame
            ? `/games/${gameStore.current?.id}/challenges?challenge=${c.challenge.id}`
            : `/training/${gameStore.current?.id}?challenge=${c.challenge.id}`,
          extraClasses: c.solved ? "opacity-60" : "",
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
          children: [],
        })),
      });
    }
    return tree;
  });
  createEffect(() => {
    if (gameStore.current) {
      untrack(() => {
        // fetch challenges and set them.
        setLoading(true);
        refreshChallenges().finally(() => {
          refreshSolves();
          setLoading(false);
        });
      });
    }
  });
  return (
    <>
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
                icon={<span class="icon-[fluent--filter-20-regular] w-5 h-5" />}
                placeholder={t("challenge.search.placeholder")}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
              <Show when={props.inGame}>
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
                      fallback={<span class="icon-[fluent--eye-20-regular] w-5 h-5 text-success" />}
                    >
                      <span class="icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning" />
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
                      fallback={<span class="icon-[fluent--eye-20-regular] w-5 h-5 text-success" />}
                    >
                      <span class="icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning" />
                    </Show>
                    <span>{t("challenge.search.archived")}</span>
                  </Button>
                </div>
              </Show>
            </div>
            <Switch
              fallback={
                <div class="flex flex-row items-center justify-center space-x-2 opacity-60 p-3">
                  <span class="icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                  <span>{t("challenge.empty")}</span>
                </div>
              }
            >
              <Match when={loading()}>
                <div class="flex flex-row items-center justify-center p-3">
                  <LoadingTips />
                </div>
              </Match>

              <Match when={challengeStore.challenges.length > 0}>
                <TreeView
                  tree={challengesEx()}
                  activeSearchParams="challenge"
                  highlightPaths={
                    selectedChallengeId()
                      ? [
                          selectedChallenge()?.tag.find((t) => t.primary)?.name || t("challenge.tag.unknown")!,
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
    </>
  );
}
