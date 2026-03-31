import { useGameSyncStatus } from "@api/game";
import { t } from "@storage/theme";
import Card from "@widgets/card";
import { Show } from "solid-js";

export default function GameSyncReadonlyBanner(props: { gameId: number; compact?: boolean }) {
  const syncStatus = useGameSyncStatus({
    game_id: () => props.gameId,
    enabled: () => props.gameId > 0,
  });

  return (
    <Show when={syncStatus.data?.readonly}>
      <Card level="warning" contentClass="p-3 flex flex-col space-y-1">
        <div class="flex flex-row space-x-2 items-center">
          <span class="shrink-0 icon-[fluent--lock-closed-20-regular] w-5 h-5" />
          <span class="font-bold">{t("game.sync.readonly.title")}</span>
        </div>
        <span>{t("game.sync.readonly.message")}</span>
        <Show when={!props.compact && syncStatus.data?.remote_first_party_base_url}>
          <span class="opacity-70">
            {t("game.sync.readonly.source", {
              source: syncStatus.data?.remote_first_party_base_url || "-",
            })}
          </span>
        </Show>
      </Card>
    </Show>
  );
}
