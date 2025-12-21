import { useChallenge, useChallenges } from "@api/challenge";
import { useGame } from "@api/game";
import type { Challenge } from "@models/challenge";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { isAdminOfGame } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Divider from "@widgets/divider";
// import Link from "@widgets/link";
import clsx from "clsx";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";
import { TransitionGroup } from "solid-transition-group";

export default function Tabs(props: { training?: boolean; archived?: boolean; gameId: number; challengeId?: number }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const game = useGame({ id: () => props.gameId });

  const challenge = useChallenge({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId || 0,
    enabled: () => !!props.challengeId,
  });
  const challenges = useChallenges({
    game_id: () => props.gameId,
    enabled: () => !!game.data,
  });
  const baseUrl = createMemo(() => {
    return props.training ? `/training/${props.gameId}` : `/games/${props.gameId}/challenges`;
  });
  const [challengeHistory, setChallengeHistory] = createSignal<{ id: number; name: string }[]>([]);
  const inCreate = createMemo(() => searchParams.create === "true");
  const inEditGame = createMemo(() => searchParams.edit === "true");
  const inStatistics = createMemo(() => searchParams.statistics === "true");
  const inMonitor = createMemo(() => searchParams.monitor === "true");
  function appendChallengeHistory(challenge: Challenge) {
    const existing = challengeHistory().find((c) => c.id === challenge.id);
    if (existing) {
      existing.name = challenge.name;
      setTimeout(() => {
        document.getElementById(`challenge-${challenge.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      }, 100);
      return;
    }
    setChallengeHistory([...challengeHistory(), { id: challenge.id, name: challenge.name }]);
    setTimeout(() => {
      document.getElementById(`challenge-${challenge.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }, 100);
  }
  function closeChallengeTab(challengeId: number) {
    if (challengeId === props.challengeId) setSearchParams({ challenge: null });
    setChallengeHistory([...challengeHistory().filter((s) => s.id !== challengeId)]);
  }

  createEffect(() => {
    if (!props.challengeId) return;
    if (challenge.isLoading || !challenge.data) return;
    untrack(() => appendChallengeHistory(challenge.data));
  });
  return (
    <OverlayScrollbarsComponent
      class="w-full h-16 backdrop-blur-sm border-b border-b-layer-content/10 relative"
      options={{
        scrollbars: {
          theme: `os-theme-${fullTheme()}`,
          autoHide: "scroll",
        },
      }}
      defer
    >
      <div class="h-full flex px-2 py-0 items-center space-x-2 min-w-max w-max">
        <TransitionGroup name="fade-group-dive-left">
          <div class="fade-group-dive-left flex space-x-2 items-center">
            <Button
              // href={props.baseUrl}
              onClick={() => {
                // setSearchParams({ challenge: null });
                navigate(baseUrl());
              }}
              square={challengeHistory().length > 0}
              ghost
              class="transition-all duration-300 overflow-hidden"
              active={
                !props.challengeId &&
                inCreate() === false &&
                inEditGame() === false &&
                inStatistics() === false &&
                inMonitor() === false
              }
            >
              <span class="shrink-0 icon-[fluent--home-20-regular] w-5 h-5" />
              <Show when={challengeHistory().length === 0}>
                <span>{t("game.welcome")}</span>
              </Show>
            </Button>
            <Show when={isAdminOfGame(game.data)}>
              <Show when={props.training}>
                <Button
                  active={inStatistics()}
                  title={t("game.statistics.title")}
                  square={challengeHistory().length > 0}
                  ghost
                  class="transition-all duration-300 overflow-hidden"
                  // href={`${baseUrl()}?statistics=true`}
                  onClick={() => navigate(`${baseUrl()}?statistics=true`)}
                >
                  <span class="shrink-0 icon-[fluent--data-pie-20-regular] w-5 h-5" />
                  <Show when={challengeHistory().length === 0}>
                    <span>{t("game.statistics.title")}</span>
                  </Show>
                </Button>
                <Button
                  active={inMonitor()}
                  title={t("game.monitor.title")}
                  square={challengeHistory().length > 0}
                  ghost
                  class="transition-all duration-300 overflow-hidden"
                  // href={`${baseUrl()}?monitor=true`}
                  onClick={() => navigate(`${baseUrl()}?monitor=true`)}
                >
                  <span class="shrink-0 icon-[fluent--flash-flow-20-regular] w-5 h-5" />
                  <Show when={challengeHistory().length === 0}>
                    <span>{t("game.monitor.title")}</span>
                  </Show>
                </Button>
                <Button
                  active={inEditGame()}
                  title={t("game.form.title")}
                  square={challengeHistory().length > 0}
                  ghost
                  class="transition-all duration-300 overflow-hidden"
                  // href={`${baseUrl()}?edit=true`}
                  onClick={() => navigate(`${baseUrl()}?edit=true`)}
                >
                  <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
                  <Show when={challengeHistory().length === 0}>
                    <span>{t("game.form.title")}</span>
                  </Show>
                </Button>
              </Show>
              <Button
                active={inCreate()}
                title={t("general.actions.create.title")}
                square={challengeHistory().length > 0}
                ghost
                class="transition-all duration-300 overflow-hidden"
                // href={`${baseUrl()}?create=true`}
                onClick={() => navigate(`${baseUrl()}?create=true`)}
              >
                <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
                <Show when={challengeHistory().length === 0}>
                  <span>{t("general.actions.create.title")}</span>
                </Show>
              </Button>
            </Show>
            <Show when={challengeHistory().length > 0}>
              <Divider direction="vertical" class="h-8" />
            </Show>
          </div>
          <For each={challengeHistory()}>
            {(c) => {
              const challengeName = createMemo(() => {
                if (c.id === challenge.data?.id) {
                  return challenge.data?.name;
                }
                const name = challenges.data?.[0].find((challenge) => challenge.id === c.id)?.name ?? c.name;
                c.name = name;
                return name;
              });
              return (
                <div class="fade-group-dive-left flex flex-row">
                  <Button
                    // href={`${baseUrl()}?challenge=${challenge.id}`}
                    onClick={() => {
                      // setSearchParams({ challenge: challenge.id });
                      navigate(`${baseUrl()}?challenge=${c.id}${searchParams.tab ? `&tab=${searchParams.tab}` : ""}`);
                    }}
                    onMouseUp={(e) => {
                      if (e.button === 1) closeChallengeTab(c.id);
                    }}
                    loading={challenge.isLoading && c.id === props.challengeId}
                    id={`challenge-${c.id}`}
                    active={c.id === props.challengeId && inCreate() === false}
                    ghost
                    class={clsx("max-w-48", "pr-0")}
                  >
                    <Show
                      when={challenge.isLoading && c.id === props.challengeId}
                      fallback={<span class="shrink-0 icon-[fluent--code-20-regular] w-5 h-5" />}
                    >
                      {null /* Loading spinner handled by Button component */}
                    </Show>
                    <span class="truncate flex-1 text-left">{challengeName()}</span>
                    <Button
                      class="rounded-l-none!"
                      square
                      ghost
                      onClick={(e) => {
                        e.stopPropagation();
                        closeChallengeTab(c.id);
                      }}
                    >
                      <span class="shrink-0 icon-[fluent--dismiss-20-regular] w-5 h-5 opacity-60" />
                    </Button>
                  </Button>
                </div>
              );
            }}
          </For>
        </TransitionGroup>
        <Show when={challenge.isLoading && !challenges.data?.[0].find((c) => c.id === props.challengeId)}>
          <Button class="opacity-60" loading ghost>
            <span>{t("general.loading.short")}</span>
          </Button>
        </Show>
      </div>
    </OverlayScrollbarsComponent>
  );
}
