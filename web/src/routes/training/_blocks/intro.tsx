import { useGameDoc } from "@api/game";
import { useParams } from "@solidjs/router";
import { fullTheme, t } from "@storage/theme";
import Article from "@widgets/article";
import Button from "@widgets/button";
import LoadingTips from "@widgets/loading-tips";
import { OverlayScrollbarsComponent } from "@widgets/overlay-scrollbars";
import { createMemo, Show } from "solid-js";

export default function Intro(props: { editable?: boolean; onEdit?: () => void }) {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const trainingDoc = useGameDoc({
    id: gameId,
    type: () => "training",
    enabled: () => gameId() > 0,
  });

  return (
    <div class="flex-1 w-full relative">
      <div class="absolute top-0 left-0 w-full h-full overflow-hidden">
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
          <div class="flex flex-col items-center p-3 lg:p-6">
            <div class="w-full max-w-5xl flex justify-end pb-3">
              <Show when={props.editable && props.onEdit}>
                <Button square onClick={() => props.onEdit?.()} title={t("general.actions.edit.title")}>
                  <span class="shrink-0 icon-[fluent--edit-20-regular] w-5 h-5" />
                </Button>
              </Show>
            </div>
            <Show
              when={!trainingDoc.isLoading || trainingDoc.data !== undefined}
              fallback={
                <div class="flex-1 flex flex-row space-x-2 items-center justify-center min-h-48 opacity-60">
                  <LoadingTips />
                </div>
              }
            >
              <Article class="self-center" content={trainingDoc.data || ""} />
            </Show>
          </div>
        </OverlayScrollbarsComponent>
      </div>
    </div>
  );
}
