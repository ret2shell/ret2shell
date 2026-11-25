import { useGameDoc } from "@api/game";
import { useParams } from "@solidjs/router";
import { fullTheme } from "@storage/theme";
import Article from "@widgets/article";
import { OverlayScrollbarsComponent } from "@widgets/overlay-scrollbars";
import { createMemo } from "solid-js";

export default function () {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || 0);
  const rules = useGameDoc({
    id: gameId,
    type: () => "rules",
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
          <div class="flex flex-col">
            <Article class="self-center" content={rules.data || ""} />
          </div>
        </OverlayScrollbarsComponent>
      </div>
    </div>
  );
}
