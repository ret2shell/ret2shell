import NotImplemented from "@blocks/not-implemented";
import { gameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";

export default function Git() {
  return (
    <>
      <Title page={t("game.git.title")} route={`/games/${gameStore.current?.id}/admin/git`} />
      <div class="flex-1 flex items-center justify-center">
        <NotImplemented />
      </div>
    </>
  );
}
