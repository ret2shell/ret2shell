import GameStatistics from "@blocks/game/statistics";
import { gameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";

export default function () {
  return (
    <>
      <Title page={t("game.statistics.title")} route={`/games/${gameStore.current?.id}/admin/statistics`} />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <GameStatistics inGame />
      </div>
    </>
  );
}
