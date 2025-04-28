import type { Challenge } from "@models/challenge";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { challengeStore } from "@storage/challenge";
import { isGameAdmin } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Divider from "@widgets/divider";
// import Link from "@widgets/link";
import clsx from "clsx";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";
import { TransitionGroup } from "solid-transition-group";

export default function Tabs(props: {
  baseUrl: string;
  loading?: boolean;
  inGame?: boolean;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedChallengeId = createMemo(() => Number.parseInt((searchParams.challenge as string) || "NaN") || null);
  const [challengeHistory, setChallengeHistory] = createSignal<{ id: number; name: string }[]>([]);
  const inCreate = createMemo(() => searchParams.create === "true");
  const inEditGame = createMemo(() => searchParams.edit === "true");
  const inStatistics = createMemo(() => searchParams.statistics === "true");
  const inMonitor = createMemo(() => searchParams.monitor === "true");
  function appendChallengeHistory(challenge: Challenge) {
    if (challengeHistory().find((c) => c.id === challenge.id)) {
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
    if (challengeId === selectedChallengeId()) setSearchParams({ challenge: null });
    setChallengeHistory([...challengeHistory().filter((s) => s.id !== challengeId)]);
  }
  createEffect(() => {
    if (challengeStore.current) {
      untrack(() => {
        appendChallengeHistory(challengeStore.current!);
      });
    }
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
                navigate(props.baseUrl);
              }}
              square={challengeHistory().length > 0}
              ghost
              class="transition-all duration-300 overflow-hidden"
              active={
                selectedChallengeId() === null &&
                inCreate() === false &&
                inEditGame() === false &&
                inStatistics() === false &&
                inMonitor() === false
              }
            >
              <span class="icon-[fluent--home-20-regular] w-5 h-5" />
              <Show when={challengeHistory().length === 0}>
                <span>{t("game.welcome")}</span>
              </Show>
            </Button>
            <Show when={isGameAdmin()}>
              <Show when={!props.inGame}>
                <Button
                  active={inStatistics()}
                  title={t("game.statistics.title")}
                  square={challengeHistory().length > 0}
                  ghost
                  class="transition-all duration-300 overflow-hidden"
                  // href={`${props.baseUrl}?statistics=true`}
                  onClick={() => navigate(`${props.baseUrl}?statistics=true`)}
                >
                  <span class="icon-[fluent--data-pie-20-regular] w-5 h-5" />
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
                  // href={`${props.baseUrl}?monitor=true`}
                  onClick={() => navigate(`${props.baseUrl}?monitor=true`)}
                >
                  <span class="icon-[fluent--flash-flow-20-regular] w-5 h-5" />
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
                  // href={`${props.baseUrl}?edit=true`}
                  onClick={() => navigate(`${props.baseUrl}?edit=true`)}
                >
                  <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
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
                // href={`${props.baseUrl}?create=true`}
                onClick={() => navigate(`${props.baseUrl}?create=true`)}
              >
                <span class="icon-[fluent--add-20-regular] w-5 h-5" />
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
            {(challenge) => (
              <div class="fade-group-dive-left flex flex-row">
                <Button
                  // href={`${props.baseUrl}?challenge=${challenge.id}`}
                  onClick={() => {
                    // setSearchParams({ challenge: challenge.id });
                    navigate(
                      `${props.baseUrl}?challenge=${challenge.id}${searchParams.tab ? `&tab=${searchParams.tab}` : ""}`
                    );
                  }}
                  onMouseUp={(e) => {
                    if (e.button === 1) closeChallengeTab(challenge.id);
                  }}
                  id={`challenge-${challenge.id}`}
                  active={challenge.id === selectedChallengeId() && inCreate() === false}
                  ghost
                  class={clsx("max-w-48", "pr-0")}
                >
                  <span class="icon-[fluent--code-20-regular] w-5 h-5" />
                  <span class="truncate flex-1 text-left">{challenge.name}</span>
                  <Button
                    class="!rounded-l-none"
                    square
                    ghost
                    onClick={(e) => {
                      e.stopPropagation();
                      closeChallengeTab(challenge.id);
                    }}
                  >
                    <span class="icon-[fluent--dismiss-20-regular] w-5 h-5 opacity-60" />
                  </Button>
                </Button>
              </div>
            )}
          </For>
        </TransitionGroup>
        <Show when={props.loading}>
          <Button class="opacity-60" loading ghost>
            <span>{t("general.loading.short")}</span>
          </Button>
        </Show>
      </div>
    </OverlayScrollbarsComponent>
  );
}
