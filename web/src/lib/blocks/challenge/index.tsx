import { inflyClient } from "@api";
import {
  useChallenge,
  useDeleteChallengeMutation,
  useDownChallengeMutation,
  useUpChallengeMutation,
} from "@api/challenge";
import { useGame } from "@api/game";
import { useSearchParams } from "@solidjs/router";
import { isAdminOfGame } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import Popover from "@widgets/popover";
import Splitter from "@widgets/splitter";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createMemo, createSignal, Show } from "solid-js";
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

export type ChallengeWidgetProps = {
  training?: boolean;
  archived?: boolean;
  gameId: number;
  challengeId: number;
};

function BottomPanel(props: ChallengeWidgetProps) {
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
  const game = useGame({ id: () => props.gameId });
  const pageComponent = () => {
    if (!isAdminOfGame(game.data) && ["statistics", "instances", "checker", "settings"].includes(page())) {
      return pages.terminal;
    }
    if (props.training && page() === "hammer") {
      return pages.terminal;
    }
    return pages[page() as keyof typeof pages];
  };

  const challenge = useChallenge({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });

  const refetchData = () => {
    challenge.refetch();
    inflyClient.invalidateQueries({
      queryKey: ["game", props.gameId, "challenge", "list", 1, 200],
    });
  };

  const deleteMutation = useDeleteChallengeMutation({
    onSuccess: () => {
      setSearchParams({ challenge: null });
      inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "challenge", "list", 1, 200],
      });
    },
  });

  const upMutation = useUpChallengeMutation({
    onSuccess: refetchData,
  });
  const downMutation = useDownChallengeMutation({
    onSuccess: refetchData,
  });
  const [challengeStateWarningDialogOpen, setChallengeStateWarningDialogOpen] = createSignal(false);

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
          <Button onClick={() => setSearchParams({ tab: "terminal" })} ghost={page() !== "terminal"}>
            <span class="shrink-0 icon-[fluent--code-20-regular] w-5 h-5" />
            <span>{t("challenge.terminal.title")}</span>
          </Button>
          <Button onClick={() => setSearchParams({ tab: "hints" })} ghost={page() !== "hints"}>
            <span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5" />
            <span>{t("challenge.hint.title")}</span>
          </Button>
          <Button
            onClick={() => setSearchParams({ tab: "hammer" })}
            ghost={page() !== "hammer"}
            disabled={props.training}
          >
            <span class="shrink-0 icon-[fluent-emoji-flat--hammer] w-5 h-5" />
            <span>{t("challenge.hammer.title")}</span>
          </Button>
          <Button
            onClick={() => setSearchParams({ tab: "answer" })}
            ghost={page() !== "answer"}
            disabled={!props.archived && !isAdminOfGame(game.data)}
          >
            <span class="shrink-0 icon-[fluent--checkmark-circle-20-regular] w-5 h-5" />
            <span>{t("challenge.answer.title")}</span>
          </Button>
          <Show when={isAdminOfGame(game.data)}>
            <Divider direction="vertical" class="h-8" />
            <Button onClick={() => setSearchParams({ tab: "statistics" })} ghost={page() !== "statistics"}>
              <span class="shrink-0 icon-[fluent--data-pie-20-regular] w-5 h-5" />
              <span>{t("challenge.statistics.title")}</span>
            </Button>
            <Button onClick={() => setSearchParams({ tab: "files" })} ghost={page() !== "files"}>
              <span class="shrink-0 icon-[fluent--save-20-regular] w-5 h-5" />
              <span>{t("challenge.file.title")}</span>
            </Button>
            <Button onClick={() => setSearchParams({ tab: "instances" })} ghost={page() !== "instances"}>
              <span class="shrink-0 icon-[fluent--production-20-regular] w-5 h-5" />
              <span>{t("challenge.instance.title")}</span>
            </Button>
            <Button onClick={() => setSearchParams({ tab: "checker" })} ghost={page() !== "checker"}>
              <span class="shrink-0 icon-[fluent--flash-play-20-regular] w-5 h-5" />
              <span>{t("challenge.checker.title")}</span>
            </Button>
            <Button onClick={() => setSearchParams({ tab: "settings" })} ghost={page() !== "settings"}>
              <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
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
                  when={challenge.data?.hidden === true}
                  fallback={
                    <>
                      <span class="shrink-0 icon-[fluent--chevron-double-down-20-regular] w-5 h-5 text-warning" />
                      <span class="text-warning">{t("challenge.actions.down.title")}</span>
                    </>
                  }
                >
                  <span class="shrink-0 icon-[fluent--chevron-double-up-20-regular] w-5 h-5 text-success" />
                  <span class="text-success">{t("challenge.actions.up.title")}</span>
                </Show>
              }
            >
              <Card contentClass="p-2 flex flex-col space-x-2 max-w-96">
                <span class="inline-block space-x-2">
                  <span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5 text-primary align-middle" />
                  <Show
                    when={challenge.data?.hidden === true}
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
                    if (challenge.data?.hidden === true) {
                      upMutation.mutate({
                        game_id: props.gameId,
                        challenge_id: props.challengeId,
                      });
                    } else {
                      downMutation.mutate({
                        game_id: props.gameId,
                        challenge_id: props.challengeId,
                      });
                    }
                    setChallengeStateWarningDialogOpen(false);
                  }}
                  loading={upMutation.isPending || downMutation.isPending}
                >
                  {t("general.actions.yes.title")}
                </Button>
              </Card>
            </Popover>
            <Popover
              ghost
              btnContent={
                <>
                  <span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5 text-error" />
                  <span class="text-error">{t("general.actions.delete.title")}</span>
                </>
              }
            >
              <Card contentClass="p-2 flex flex-col space-x-2 max-w-96">
                <span class="inline-block space-x-2">
                  <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                  <span>{t("general.actions.delete.message")}</span>
                </span>
                <Button
                  level="primary"
                  size="sm"
                  class="self-end"
                  onClick={() =>
                    deleteMutation.mutate({
                      game_id: props.gameId,
                      challenge_id: props.challengeId,
                    })
                  }
                  loading={deleteMutation.isPending}
                >
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

export default function (props: ChallengeWidgetProps) {
  return (
    <div class="flex-1">
      <Splitter
        startPanel={() => <Intro training={props.training} gameId={props.gameId} challengeId={props.challengeId} />}
        endPanel={() => (
          <BottomPanel
            training={props.training ?? false}
            archived={props.archived}
            gameId={props.gameId}
            challengeId={props.challengeId}
          />
        )}
        orientation="vertical"
        defaultSize={[64, 36]}
        panels={[
          { id: "a", minSize: 24 },
          { id: "b", minSize: 20 },
        ]}
      />
    </div>
  );
}
