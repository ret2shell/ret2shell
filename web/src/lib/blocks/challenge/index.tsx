import { handleHttpError } from "@api";
import { deleteChallenge, downChallenge, upChallenge } from "@api/game";
import type { Challenge } from "@models/challenge";
import { useSearchParams } from "@solidjs/router";
import { challengeStore, setChallengeStore } from "@storage/challenge";
import { isGameAdmin } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import Popover from "@widgets/popover";
import Splitter from "@widgets/splitter";
import clsx from "clsx";
import type { HTTPError } from "ky";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { Show, createMemo, createSignal, onCleanup } from "solid-js";
import { Dynamic } from "solid-js/web";
import Answer from "./answer";
import Checker from "./checker";
import Files from "./files";
import Hammer from "./hammer";
import Hints from "./hints";
import Instances from "./instances";
import Intro from "./intro";
import Settings from "./settings";
import Statistics from "./statistics";
import Terminal from "./terminal";

function BottomPanel(props: {
  onStateChange?: (challenge?: Challenge) => void;
  expanded: boolean;
  onExpand?: () => void;
  inGame: boolean;
  archived: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pages = {
    terminal: Terminal,
    hints: Hints,
    files: Files,
    hammer: Hammer,
    answer: Answer,
    statistics: Statistics,
    instances: Instances,
    checker: Checker,
    settings: Settings,
  };
  const page = createMemo(() => {
    const key = (searchParams.tab as string) || "terminal";
    return Object.keys(pages).includes(key) ? key : "terminal";
  });
  const pageComponent = () => {
    if (!isGameAdmin() && ["statistics", "instances", "checker", "settings"].includes(page())) {
      return pages.terminal;
    }
    if (!props.inGame && page() === "hammer") {
      return pages.terminal;
    }
    return pages[page() as keyof typeof pages];
  };
  const [deleting, setDeleting] = createSignal(false);
  async function handleDeleteChallenge() {
    if (challengeStore.current) {
      setDeleting(true);
      try {
        await deleteChallenge(challengeStore.current.game_id, challengeStore.current.id);
        setSearchParams({ challenge: null });
        addToast({
          level: "success",
          description: t("general.actions.delete.status.success")!,
          duration: 5000,
        });
        props.onStateChange?.();
      } catch (err) {
        handleHttpError(err as HTTPError, t("general.actions.delete.status.fail")!);
      }
      setDeleting(false);
    }
  }
  const [publishing, setPublishing] = createSignal(false);
  const [challengeStateWarningDialogOpen, setChallengeStateWarningDialogOpen] = createSignal(false);

  async function handlePublishChallenge() {
    setPublishing(true);
    try {
      const resp = await (challengeStore.current?.hidden ? upChallenge : downChallenge)(
        challengeStore.current!.game_id,
        challengeStore.current!.id
      );
      props.onStateChange?.(resp);
      setChallengeStore({ current: resp });
    } catch (err) {
      handleHttpError(
        err as HTTPError,
        challengeStore.current?.hidden ? t("challenge.errors.up.title")! : t("challenge.errors.down.title")!
      );
    }

    setPublishing(false);
  }
  return (
    <div class="w-full h-full overflow-hidden flex flex-col">
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
          <Button onClick={props.onExpand} ghost square>
            <span
              class={clsx(
                props.expanded
                  ? "icon-[fluent--chevron-double-down-20-regular]"
                  : "icon-[fluent--chevron-double-up-20-regular]",
                "w-5 h-5"
              )}
            />
          </Button>
          <Divider direction="vertical" class="h-8" />
          <Button onClick={() => setSearchParams({ tab: "terminal" })} ghost={page() !== "terminal"}>
            <span class="icon-[fluent--code-20-regular] w-5 h-5" />
            <span>{t("challenge.terminal.title")}</span>
          </Button>
          <Button onClick={() => setSearchParams({ tab: "hints" })} ghost={page() !== "hints"}>
            <span class="icon-[fluent--info-20-regular] w-5 h-5" />
            <span>{t("challenge.hint.title")}</span>
          </Button>
          <Button
            onClick={() => setSearchParams({ tab: "hammer" })}
            ghost={page() !== "hammer"}
            disabled={!props.inGame}
          >
            <span class="icon-[fluent-emoji-flat--hammer] w-5 h-5" />
            <span>{t("challenge.hammer.title")}</span>
          </Button>
          <Button
            onClick={() => setSearchParams({ tab: "answer" })}
            ghost={page() !== "answer"}
            disabled={!props.archived && !isGameAdmin()}
          >
            <span class="icon-[fluent--checkmark-circle-20-regular] w-5 h-5" />
            <span>{t("challenge.answer.title")}</span>
          </Button>
          <Show when={isGameAdmin()}>
            <Divider direction="vertical" class="h-8" />
            <Button onClick={() => setSearchParams({ tab: "statistics" })} ghost={page() !== "statistics"}>
              <span class="icon-[fluent--data-pie-20-regular] w-5 h-5" />
              <span>{t("challenge.statistics.title")}</span>
            </Button>
            <Button onClick={() => setSearchParams({ tab: "files" })} ghost={page() !== "files"}>
              <span class="icon-[fluent--save-20-regular] w-5 h-5" />
              <span>{t("challenge.file.title")}</span>
            </Button>
            <Button onClick={() => setSearchParams({ tab: "instances" })} ghost={page() !== "instances"}>
              <span class="icon-[fluent--production-20-regular] w-5 h-5" />
              <span>{t("challenge.instance.title")}</span>
            </Button>
            <Button onClick={() => setSearchParams({ tab: "checker" })} ghost={page() !== "checker"}>
              <span class="icon-[fluent--flash-play-20-regular] w-5 h-5" />
              <span>{t("challenge.checker.title")}</span>
            </Button>
            <Button onClick={() => setSearchParams({ tab: "settings" })} ghost={page() !== "settings"}>
              <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
              <span>{t("challenge.settings.title")}</span>
            </Button>
            <Popover
              ghost
              open={challengeStateWarningDialogOpen()}
              onEscapeKeyDown={() => setChallengeStateWarningDialogOpen(false)}
              onPointerDownOutside={() => setChallengeStateWarningDialogOpen(false)}
              onFocusOutside={() => setChallengeStateWarningDialogOpen(false)}
              onOpenChange={(details) => setChallengeStateWarningDialogOpen(details.open)}
              onClick={() => setChallengeStateWarningDialogOpen(true)}
              btnContent={
                <Show
                  when={challengeStore.current?.hidden === true}
                  fallback={
                    <>
                      <span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5 text-warning" />
                      <span class="text-warning">{t("challenge.actions.down.title")}</span>
                    </>
                  }
                >
                  <span class="icon-[fluent--chevron-double-up-20-regular] w-5 h-5 text-success" />
                  <span class="text-success">{t("challenge.actions.up.title")}</span>
                </Show>
              }
            >
              <Card contentClass="p-2 flex flex-col space-x-2 max-w-96">
                <span class="inline-block space-x-2">
                  <span class="icon-[fluent--info-20-regular] w-5 h-5 text-primary align-middle" />
                  <Show
                    when={challengeStore.current?.hidden === true}
                    fallback={<span>{t("challenge.actions.down.message")}</span>}
                  >
                    <span>{t("challenge.actions.up.message")}</span>
                  </Show>
                </span>
                <Button
                  level="primary"
                  size="sm"
                  class="self-end"
                  onClick={async () => {
                    await handlePublishChallenge();
                    setChallengeStateWarningDialogOpen(false);
                  }}
                  loading={publishing()}
                >
                  {t("general.actions.yes.title")}
                </Button>
              </Card>
            </Popover>
            <Popover
              ghost
              btnContent={
                <>
                  <span class="icon-[fluent--delete-20-regular] w-5 h-5 text-error" />
                  <span class="text-error">{t("general.actions.delete.title")}</span>
                </>
              }
            >
              <Card contentClass="p-2 flex flex-col space-x-2 max-w-96">
                <span class="inline-block space-x-2">
                  <span class="icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                  <span>{t("general.actions.delete.message")}</span>
                </span>
                <Button level="primary" size="sm" class="self-end" onClick={handleDeleteChallenge} loading={deleting()}>
                  {t("general.actions.yes.title")}
                </Button>
              </Card>
            </Popover>
          </Show>
        </div>
      </OverlayScrollbarsComponent>
      <OverlayScrollbarsComponent
        options={{
          scrollbars: {
            theme: `os-theme-${fullTheme()}`,
            autoHide: "scroll",
          },
        }}
        class="relative w-full flex-1 print:h-auto print:overflow-auto"
        defer
      >
        <Dynamic component={pageComponent()} {...props} />
      </OverlayScrollbarsComponent>
    </div>
  );
}

export default function (props: {
  onStateChange?: (challenge?: Challenge) => void;
  inGame?: boolean;
  archived: boolean;
}) {
  onCleanup(() => {
    setChallengeStore({ current: null, env: null, files: [], adminFiles: [] });
  });
  const [expanded, setExpanded] = createSignal(false);
  const size = () => {
    if (expanded()) {
      // return [
      //   { id: "a", size: 24, minSize: 24 },
      //   { id: "b", size: 76, minSize: 20 },
      // ];
      return [24, 76];
    }
    // return [
    //   { id: "a", size: 64, minSize: 24 },
    //   { id: "b", size: 36, minSize: 20 },
    // ];
    return [64, 36];
  };

  return (
    <div class="flex-1">
      <Splitter
        startPanel={() => <Intro inGame={props.inGame} />}
        endPanel={() => (
          <BottomPanel
            inGame={props.inGame ?? false}
            archived={props.archived}
            onStateChange={props.onStateChange}
            expanded={expanded()}
            onExpand={() => {
              setExpanded(!expanded());
            }}
          />
        )}
        orientation="vertical"
        defaultSize={size()}
        panels={[
          { id: "a", minSize: 24 },
          { id: "b", minSize: 20 },
        ]}
      />
    </div>
  );
}
